// lib/services/queue_state.dart
//
// Up Next + Autoplay + History, with selection mode, sorting, de-duplication,
// undo and persistence. Same public API as before (seed, syncCurrent,
// takeNext, takePrevious, jumpTo, playFromHistory, playNext, addToQueue,
// reorder, remove, moveToTop, moveToBottom, clear, shuffleUpNext,
// toggleAutoplay, undo, dismissUndo) — `dynamic` is now the real Track type.
//
// Register once:  ChangeNotifierProvider(create: (_) => QueueState())
//
// Optional autoplay source (called when the queue runs low):
//   queue.autoplayProvider = (seed, exclude) async =>
//       (await ApiService.search(seed.artist))
//           .where((t) => !exclude.contains(t.id)).toList();

import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../models/track.dart';

typedef AutoplayProvider = Future<List<Track>> Function(
    Track seed, Set<String> excludeIds);

enum QueueSort { title, artist, duration, reverse }

/// One slot in the queue. [uid] makes duplicates (same song twice) safe to
/// reorder / dismiss. Autoplay entries are always the trailing block.
class QueueEntry {
  const QueueEntry(this.track, this.uid, {this.isAutoplay = false});

  final Track track;
  final int uid;
  final bool isAutoplay;

  String get id => track.id;
  String get title => track.title;
  String get artist => track.artist;
  String get coverUrl => track.coverUrl;
  int get durationSeconds => track.durationSeconds;

  QueueEntry copyWith({bool? isAutoplay}) =>
      QueueEntry(track, uid, isAutoplay: isAutoplay ?? this.isAutoplay);

  @override
  bool operator ==(Object other) => other is QueueEntry && other.uid == uid;

  @override
  int get hashCode => uid;
}

class QueueState extends ChangeNotifier {
  static const int _historyLimit = 60;
  static const int _autoplayBatch = 10;
  static const int _autoplayLowWater = 3;

  /// Manual entries first, autoplay entries (isAutoplay) always trail them.
  final List<QueueEntry> _upNext = [];
  final List<QueueEntry> _history = [];
  Track? _current;
  int _uid = 0;
  bool _autoplay = true;
  bool _autoplayLoading = false;

  // selection (edit) mode
  bool _selecting = false;
  final Set<int> _selected = {};

  // undo
  List<QueueEntry>? _undoSnapshot;
  String? undoLabel;
  int undoToken = 0;

  AutoplayProvider? autoplayProvider;

  // ───────────────────────────── Getters ──────────────────────────────

  List<QueueEntry> get upNext => List.unmodifiable(_upNext);
  List<QueueEntry> get manualNext =>
      List.unmodifiable(_upNext.where((e) => !e.isAutoplay));
  List<QueueEntry> get autoplayNext =>
      List.unmodifiable(_upNext.where((e) => e.isAutoplay));
  List<QueueEntry> get history => List.unmodifiable(_history);
  Track? get current => _current;

  bool get autoplay => _autoplay;
  bool get autoplayLoading => _autoplayLoading;
  bool get hasNext => _upNext.isNotEmpty;
  bool get hasPrevious => _history.isNotEmpty;
  bool get canUndo => _undoSnapshot != null;
  int get manualCount => _upNext.where((e) => !e.isAutoplay).length;

  /// Total play time of the manual queue.
  Duration get upNextDuration => Duration(
      seconds: _upNext
          .where((e) => !e.isAutoplay)
          .fold(0, (s, e) => s + e.durationSeconds));

  bool get selecting => _selecting;
  int get selectedCount => _selected.length;
  bool isSelected(QueueEntry e) => _selected.contains(e.uid);

  bool isQueued(Track t) => _upNext.any((e) => e.id == t.id);
  bool isCurrent(Track t) => _current?.id == t.id;

  static String keyOf(Track t) => t.id;
  QueueEntry _wrap(Track t, {bool auto = false}) =>
      QueueEntry(t, _uid++, isAutoplay: auto);
  QueueEntry _plain(QueueEntry e) => e.isAutoplay ? e.copyWith(isAutoplay: false) : e;
  int indexOf(QueueEntry e) => _upNext.indexWhere((x) => x.uid == e.uid);

  // ───────────────── seeding / syncing with the player ─────────────────

  /// Call when the user starts playback from a list (album, playlist, search…).
  void seed(List<Track> tracks, {int startIndex = 0}) {
    if (tracks.isEmpty) return;
    final start = startIndex.clamp(0, tracks.length - 1);
    _upNext
      ..clear()
      ..addAll(tracks.skip(start + 1).map(_wrap));
    _history
      ..clear()
      ..addAll(tracks.take(start).map(_wrap));
    _current = tracks[start];
    _undoSnapshot = null;
    _selecting = false;
    _selected.clear();
    notifyListeners();
    ensureAutoplay();
  }

  /// Keeps the queue consistent when the player changes track on its own
  /// (auto-advance, notification controls, headset buttons…).
  void syncCurrent(Track? track) {
    if (track == null) return;
    if (_current != null && keyOf(_current!) == keyOf(track)) return;
    final k = keyOf(track);
    final old = _current;
    _current = track;

    final idx = _upNext.indexWhere((e) => keyOf(e.track) == k);
    if (idx >= 0) {
      if (old != null) _history.add(_wrap(old));
      _history.addAll(_upNext.sublist(0, idx).map(_plain));
      _upNext.removeRange(0, idx + 1);
    } else if (_history.isNotEmpty && keyOf(_history.last.track) == k) {
      _history.removeLast();
      if (old != null) _upNext.insert(0, _wrap(old));
    } else if (old != null) {
      _history.add(_wrap(old));
    }
    _trim();
    _pruneSelection();
    notifyListeners();
    ensureAutoplay();
  }

  void _trim() {
    if (_history.length > _historyLimit) {
      _history.removeRange(0, _history.length - _historyLimit);
    }
  }

  // ───────────────────────── transport helpers ─────────────────────────

  /// Pops the next queued entry (and makes it current). Null if queue is empty.
  QueueEntry? takeNext() {
    if (_upNext.isEmpty) return null;
    final e = _upNext.removeAt(0);
    if (_current != null) _history.add(_wrap(_current!));
    _current = e.track;
    _trim();
    _pruneSelection();
    notifyListeners();
    ensureAutoplay();
    return e;
  }

  /// Steps back through history. Null if there is none.
  QueueEntry? takePrevious() {
    if (_history.isEmpty) return null;
    final e = _history.removeLast();
    if (_current != null) _upNext.insert(0, _wrap(_current!));
    _current = e.track;
    notifyListeners();
    return e;
  }

  /// Tap a row in "Playing Next": skipped songs move to history.
  void jumpTo(QueueEntry e) {
    final i = indexOf(e);
    if (i < 0) return;
    if (_current != null) _history.add(_wrap(_current!));
    _history.addAll(_upNext.sublist(0, i).map(_plain));
    _upNext.removeRange(0, i + 1);
    _current = e.track;
    _trim();
    _pruneSelection();
    notifyListeners();
    ensureAutoplay();
  }

  /// Tap a row in "History": current + later history return to Up Next.
  void playFromHistory(QueueEntry e) {
    final i = _history.indexWhere((x) => x.uid == e.uid);
    if (i < 0) return;
    final later = _history.sublist(i + 1);
    final back = [...later, if (_current != null) _wrap(_current!)];
    _upNext.insertAll(0, back);
    _history.removeRange(i, _history.length);
    _current = e.track;
    notifyListeners();
  }

  // ─────────────────────────────── Adding ───────────────────────────────

  int get _manualEnd {
    final i = _upNext.indexWhere((e) => e.isAutoplay);
    return i < 0 ? _upNext.length : i;
  }

  /// Plays right after the current song. Returns null if rejected as a
  /// duplicate (only when [allowDuplicate] is false).
  QueueEntry? playNext(Track track, {bool allowDuplicate = true}) {
    if (!allowDuplicate && isQueued(track)) return null;
    final e = _wrap(track);
    _upNext.insert(0, e);
    notifyListeners();
    return e;
  }

  /// Adds after the last manual entry (before autoplay suggestions).
  QueueEntry? addToQueue(Track track, {bool allowDuplicate = true}) {
    if (!allowDuplicate && isQueued(track)) return null;
    final e = _wrap(track);
    _upNext.insert(_manualEnd, e);
    notifyListeners();
    return e;
  }

  void addAll(List<Track> tracks) {
    if (tracks.isEmpty) return;
    _upNext.insertAll(_manualEnd, tracks.map(_wrap));
    notifyListeners();
  }

  void playNextAll(List<Track> tracks) {
    if (tracks.isEmpty) return;
    _upNext.insertAll(0, tracks.map(_wrap));
    notifyListeners();
  }

  /// Turns an autoplay suggestion into a normal queue item (at the manual end).
  void promoteAutoplay(QueueEntry e) {
    final i = indexOf(e);
    if (i < 0 || !_upNext[i].isAutoplay) return;
    _upNext.removeAt(i);
    _upNext.insert(_manualEnd, e.copyWith(isAutoplay: false));
    notifyListeners();
  }

  // ─────────────────────────────── Editing ──────────────────────────────

  /// Standard ReorderableListView indices; only the manual block is movable.
  void reorder(int oldIndex, int newIndex) {
    final end = _manualEnd;
    if (oldIndex < 0 || oldIndex >= end) return;
    if (newIndex > oldIndex) newIndex -= 1;
    newIndex = newIndex.clamp(0, end - 1);
    if (oldIndex == newIndex) return;
    final e = _upNext.removeAt(oldIndex);
    _upNext.insert(newIndex, e);
    notifyListeners();
  }

  void remove(QueueEntry e) {
    final i = indexOf(e);
    if (i < 0) return;
    _stash('Removed “${e.title}”');
    _upNext.removeAt(i);
    _selected.remove(e.uid);
    notifyListeners();
  }

  /// Remove without touching the undo slot (used by "Undo add").
  void removeSilently(QueueEntry e) {
    final i = indexOf(e);
    if (i < 0) return;
    _upNext.removeAt(i);
    _selected.remove(e.uid);
    notifyListeners();
  }

  void moveToTop(QueueEntry e) {
    final i = indexOf(e);
    if (i < 0) return;
    if (i == 0 && !e.isAutoplay) return;
    _upNext.insert(0, _upNext.removeAt(i).copyWith(isAutoplay: false));
    notifyListeners();
  }

  void moveToBottom(QueueEntry e) {
    final i = indexOf(e);
    if (i < 0) return;
    final item = _upNext.removeAt(i).copyWith(isAutoplay: false);
    _upNext.insert(_manualEnd, item);
    notifyListeners();
  }

  /// Clears manual entries AND autoplay suggestions.
  void clear() {
    if (_upNext.isEmpty) return;
    _stash('Queue cleared');
    _upNext.clear();
    _selected.clear();
    _selecting = false;
    notifyListeners();
  }

  void clearHistory() {
    if (_history.isEmpty) return;
    _history.clear();
    notifyListeners();
  }

  void shuffleUpNext() {
    final end = _manualEnd;
    if (end < 2) return;
    _stash('Queue shuffled');
    final block = _upNext.sublist(0, end)..shuffle(math.Random());
    _upNext.setRange(0, end, block);
    notifyListeners();
  }

  void sortUpNext(QueueSort by) {
    final end = _manualEnd;
    if (end < 2) return;
    _stash(switch (by) {
      QueueSort.title => 'Sorted by title',
      QueueSort.artist => 'Sorted by artist',
      QueueSort.duration => 'Sorted by length',
      QueueSort.reverse => 'Queue reversed',
    });
    final block = _upNext.sublist(0, end);
    switch (by) {
      case QueueSort.title:
        block.sort((a, b) =>
            a.title.toLowerCase().compareTo(b.title.toLowerCase()));
      case QueueSort.artist:
        block.sort((a, b) =>
            a.artist.toLowerCase().compareTo(b.artist.toLowerCase()));
      case QueueSort.duration:
        block.sort((a, b) => a.durationSeconds.compareTo(b.durationSeconds));
      case QueueSort.reverse:
        block.setAll(0, block.reversed.toList());
    }
    _upNext.setRange(0, end, block);
    notifyListeners();
  }

  /// Drops repeated songs (keeps the first). Returns how many were removed.
  int removeDuplicates() {
    final seen = <String>{if (_current != null) keyOf(_current!)};
    final keep = <QueueEntry>[];
    for (final e in _upNext) {
      if (seen.add(keyOf(e.track))) keep.add(e);
    }
    final removed = _upNext.length - keep.length;
    if (removed == 0) return 0;
    _stash('Removed $removed duplicate${removed == 1 ? '' : 's'}');
    _upNext
      ..clear()
      ..addAll(keep);
    _pruneSelection();
    notifyListeners();
    return removed;
  }

  // ─────────────────────────────── Autoplay ─────────────────────────────

  void toggleAutoplay() {
    _autoplay = !_autoplay;
    if (!_autoplay) {
      _upNext.removeWhere((e) => e.isAutoplay);
    }
    notifyListeners();
    if (_autoplay) ensureAutoplay();
  }

  /// Tops up the trailing autoplay block when the queue is running low.
  Future<void> ensureAutoplay() async {
    final provider = autoplayProvider;
    final seed = _current;
    if (!_autoplay || provider == null || seed == null || _autoplayLoading) return;
    if (_upNext.length >= _autoplayLowWater) return;

    _autoplayLoading = true;
    notifyListeners();
    try {
      final exclude = <String>{
        keyOf(seed),
        ..._upNext.map((e) => keyOf(e.track)),
        ..._history.reversed.take(30).map((e) => keyOf(e.track)),
      };
      final results = await provider(seed, exclude);
      if (!_autoplay) return;
      final fresh = <Track>[];
      for (final t in results) {
        if (exclude.add(keyOf(t))) fresh.add(t);
        if (fresh.length >= _autoplayBatch) break;
      }
      _upNext.addAll(fresh.map((t) => _wrap(t, auto: true)));
    } catch (_) {
      // Autoplay is best-effort; never break playback.
    } finally {
      _autoplayLoading = false;
      notifyListeners();
    }
  }

  // ───────────────────────── Selection (edit mode) ──────────────────────

  void beginSelection([QueueEntry? first]) {
    _selecting = true;
    _selected.clear();
    if (first != null && !first.isAutoplay) _selected.add(first.uid);
    notifyListeners();
  }

  void endSelection() {
    if (!_selecting) return;
    _selecting = false;
    _selected.clear();
    notifyListeners();
  }

  void toggleSelected(QueueEntry e) {
    if (e.isAutoplay) return;
    if (!_selected.remove(e.uid)) _selected.add(e.uid);
    notifyListeners();
  }

  void selectAll() {
    _selected
      ..clear()
      ..addAll(_upNext.where((e) => !e.isAutoplay).map((e) => e.uid));
    notifyListeners();
  }

  void deselectAll() {
    _selected.clear();
    notifyListeners();
  }

  void removeSelected() {
    if (_selected.isEmpty) return;
    final n = _selected.length;
    _stash('Removed $n song${n == 1 ? '' : 's'}');
    _upNext.removeWhere((e) => _selected.contains(e.uid));
    _selected.clear();
    _selecting = false;
    notifyListeners();
  }

  /// Selected songs jump to the top, keeping their relative order.
  void playNextSelected() {
    if (_selected.isEmpty) return;
    final picked = _upNext.where((e) => _selected.contains(e.uid)).toList();
    _upNext.removeWhere((e) => _selected.contains(e.uid));
    _upNext.insertAll(0, picked);
    _selected.clear();
    _selecting = false;
    notifyListeners();
  }

  void moveSelectedToBottom() {
    if (_selected.isEmpty) return;
    final picked = _upNext.where((e) => _selected.contains(e.uid)).toList();
    _upNext.removeWhere((e) => _selected.contains(e.uid));
    _upNext.insertAll(_manualEnd, picked);
    _selected.clear();
    _selecting = false;
    notifyListeners();
  }

  void _pruneSelection() {
    if (_selected.isEmpty) return;
    final alive = _upNext.map((e) => e.uid).toSet();
    _selected.removeWhere((u) => !alive.contains(u));
  }

  // ─────────────────────────────── Undo ────────────────────────────────

  void _stash(String label) {
    _undoSnapshot = List.of(_upNext);
    undoLabel = label;
    undoToken++;
  }

  void undo() {
    final s = _undoSnapshot;
    if (s == null) return;
    _upNext
      ..clear()
      ..addAll(s);
    _undoSnapshot = null;
    undoLabel = null;
    _pruneSelection();
    notifyListeners();
  }

  void dismissUndo() {
    if (_undoSnapshot == null) return;
    _undoSnapshot = null;
    undoLabel = null;
    notifyListeners();
  }

  // ───────────────────────────── Persistence ───────────────────────────

  Map<String, dynamic> toJson() => {
        'autoplay': _autoplay,
        'current': _current?.toJson(),
        'upNext': [
          for (final e in _upNext)
            if (!e.isAutoplay) e.track.toJson(),
        ],
        'history': [for (final e in _history) e.track.toJson()],
      };

  /// Restores a saved queue (autoplay suggestions are re-fetched, not stored).
  void loadJson(Map<String, dynamic> json) {
    Track? parse(Object? raw) {
      if (raw is! Map) return null;
      try {
        return Track.fromJson(Map<String, dynamic>.from(raw));
      } catch (_) {
        return null;
      }
    }

    List<Track> parseList(Object? raw) => raw is List
        ? raw.map(parse).whereType<Track>().toList()
        : <Track>[];

    _autoplay = json['autoplay'] != false;
    _current = parse(json['current']);
    _upNext
      ..clear()
      ..addAll(parseList(json['upNext']).map(_wrap));
    _history
      ..clear()
      ..addAll(parseList(json['history']).map(_wrap));
    _undoSnapshot = null;
    _selecting = false;
    _selected.clear();
    notifyListeners();
    ensureAutoplay();
  }
}