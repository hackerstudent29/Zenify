// lib/services/queue_state.dart
//
// Up Next + Autoplay + History, with context-awareness, Apple Music style
// Shuffle & Repeat, selection mode, sorting, de-duplication, undo and persistence.

import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../models/playback_context.dart';
import '../models/track.dart';
import 'smart_queue_engine.dart';

typedef AutoplayProvider = Future<List<Track>> Function(
    Track seed, Set<String> excludeIds, Set<String> excludeSignatures);

enum QueueSort { title, artist, duration, reverse }

/// One slot in the queue. [uid] makes duplicates safe to reorder / dismiss.
/// [isManualPin] tracks items manually added via "Play Next" / "Add to Queue",
/// keeping them pinned at the top when Shuffle is toggled.
class QueueEntry {
  const QueueEntry(
    this.track,
    this.uid, {
    this.isAutoplay = false,
    this.isManualPin = false,
  });

  final Track track;
  final int uid;
  final bool isAutoplay;
  final bool isManualPin;

  String get id => track.id;
  String get title => track.title;
  String get artist => track.artist;
  String get coverUrl => track.coverUrl;
  int get durationSeconds => track.durationSeconds;

  QueueEntry copyWith({bool? isAutoplay, bool? isManualPin}) => QueueEntry(
        track,
        uid,
        isAutoplay: isAutoplay ?? this.isAutoplay,
        isManualPin: isManualPin ?? this.isManualPin,
      );

  @override
  bool operator ==(Object other) => other is QueueEntry && other.uid == uid;

  @override
  int get hashCode => uid;
}

class QueueState extends ChangeNotifier {
  static const int _historyLimit = 60;
  static const int _autoplayBatch = SmartQueueWeights.targetQueueSize;

  /// Manual entries first, autoplay entries (isAutoplay) always trail them.
  final List<QueueEntry> _upNext = [];
  final List<QueueEntry> _history = [];
  List<QueueEntry> _originalUpNext = [];

  PlaybackContext? _context;
  Track? _current;
  int _uid = 0;

  bool _shuffle = false;
  RepeatMode _repeatMode = RepeatMode.off;
  int _repeatOneCounter = 0;

  bool _autoplay = true;
  bool _autoplayLoading = false;
  bool _collectionLocked = false;

  // selection (edit) mode
  bool _selecting = false;
  final Set<int> _selected = {};

  // undo
  List<QueueEntry>? _undoSnapshot;
  String? undoLabel;
  int undoToken = 0;

  AutoplayProvider? autoplayProvider;

  // ───────────────────────────── Getters ──────────────────────────────

  PlaybackContext? get context => _context;
  bool get shuffle => _shuffle;
  RepeatMode get repeatMode => _repeatMode;

  List<QueueEntry> get upNext => List.unmodifiable(_upNext);
  List<QueueEntry> get manualNext =>
      List.unmodifiable(_upNext.where((e) => !e.isAutoplay));
  List<QueueEntry> get autoplayNext =>
      List.unmodifiable(_upNext.where((e) => e.isAutoplay));
  List<QueueEntry> get history => List.unmodifiable(_history);
  Track? get current => _current;

  bool get autoplay => _autoplay;
  bool get autoplayLoading => _autoplayLoading;
  bool get isCollectionLocked => _collectionLocked;
  bool get hasNext => _upNext.isNotEmpty;
  bool get hasPrevious => _history.isNotEmpty;
  bool get canUndo => _undoSnapshot != null;
  int get manualCount => _upNext.where((e) => !e.isAutoplay).length;

  void setCollectionLocked(bool locked) {
    if (_collectionLocked == locked) return;
    _collectionLocked = locked;
    if (locked) {
      _upNext.removeWhere((e) => e.isAutoplay);
      notifyListeners();
    } else {
      ensureAutoplay();
    }
  }

  /// Total play time of the manual queue.
  Duration get upNextDuration => Duration(
        seconds: _upNext
            .where((e) => !e.isAutoplay)
            .fold(0, (s, e) => s + e.durationSeconds),
      );

  bool get selecting => _selecting;
  int get selectedCount => _selected.length;
  bool isSelected(QueueEntry e) => _selected.contains(e.uid);

  bool isQueued(Track t) => _upNext.any((e) => e.id == t.id);
  bool isCurrent(Track t) => _current?.id == t.id;

  static String keyOf(Track t) => t.id;
  QueueEntry _wrap(Track t, {bool auto = false, bool pin = false}) =>
      QueueEntry(t, _uid++, isAutoplay: auto, isManualPin: pin);
  QueueEntry _plain(QueueEntry e) =>
      e.isAutoplay ? e.copyWith(isAutoplay: false) : e;
  int indexOf(QueueEntry e) => _upNext.indexWhere((x) => x.uid == e.uid);

  // ───────────────── Context-Aware Playback Seeding ───────────────────

  /// Starts playback with a known [PlaybackContext] (Apple Music standard).
  void setContext(
    PlaybackContext context, {
    int startIndex = 0,
    bool? shuffle,
  }) {
    if (context.tracks.isEmpty) return;
    _context = context;

    final start = startIndex.clamp(0, context.tracks.length - 1);
    _current = context.tracks[start];

    _history
      ..clear()
      ..addAll(context.tracks.take(start).map((t) => _wrap(t)));

    final upcoming = context.tracks.skip(start + 1).map((t) => _wrap(t)).toList();
    _originalUpNext = List.of(upcoming);

    if (shuffle != null) {
      _shuffle = shuffle;
    }

    if (_shuffle) {
      final pool = _buildPoolForContext(context.tracks, excludeCurrent: true);
      _shufflePool(pool);
      _upNext
        ..clear()
        ..addAll(pool.map((t) => _wrap(t)));
    } else {
      _upNext
        ..clear()
        ..addAll(upcoming);
    }

    _undoSnapshot = null;
    _selecting = false;
    _selected.clear();
    _repeatOneCounter = 0;

    notifyListeners();
    ensureAutoplay();
  }

  /// Legacy helper backwards compatible with raw track lists.
  void seed(
    List<Track> tracks, {
    int startIndex = 0,
    PlaybackContext? context,
  }) {
    if (tracks.isEmpty) return;
    final ctx = context ??
        PlaybackContext(
          type: PlaybackContextType.queueOnly,
          id: 'queue_${DateTime.now().millisecondsSinceEpoch}',
          tracks: tracks,
          startTrack: tracks[startIndex.clamp(0, tracks.length - 1)],
        );
    setContext(ctx, startIndex: startIndex);
  }

  /// Keeps the queue consistent when track changes from an external source.
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

  // ────────────── Context-Aware Candidate Pool & Shuffle ──────────────

  /// Builds the candidate pool from context depending on context.type.
  List<Track> _buildPoolForContext(
    List<Track> sourceTracks, {
    bool excludeCurrent = true,
  }) {
    final curId = _current?.id;
    var pool = sourceTracks.where((t) {
      if (excludeCurrent && curId != null && t.id == curId) return false;
      return true;
    }).toList();

    final ctx = _context;
    if (ctx != null) {
      switch (ctx.type) {
        case PlaybackContextType.artist:
          final artistKey = ctx.id.trim().toLowerCase();
          final filtered = pool.where((t) {
            return t.artist.toLowerCase().contains(artistKey);
          }).toList();
          if (filtered.isNotEmpty) pool = filtered;
          break;

        case PlaybackContextType.album:
        case PlaybackContextType.playlist:
        case PlaybackContextType.likedSongs:
        case PlaybackContextType.library:
        case PlaybackContextType.history:
        case PlaybackContextType.podcast:
          // Use exact ordered snapshot of the album / playlist / liked collection
          break;

        case PlaybackContextType.search:
        case PlaybackContextType.homeSection:
        case PlaybackContextType.queueOnly:
          // Smart-queue rules: same language hard filter, no duplicates
          if (_current != null && _current!.language.isNotEmpty) {
            final targetLang = _current!.language.trim().toLowerCase();
            final langPool = pool.where((t) {
              final tl = t.language.trim().toLowerCase();
              return tl.isEmpty || tl == targetLang;
            }).toList();
            if (langPool.isNotEmpty) pool = langPool;
          }
          break;
      }
    }

    return pool;
  }

  /// Fisher-Yates shuffle with constraints:
  /// (a) avoid same artist back-to-back where pool allows
  /// (b) never put a song that played in the last 20 tracks near the front
  void _shufflePool(List<Track> pool) {
    if (pool.length < 2) return;
    final rng = math.Random();

    // 1. Pure Fisher-Yates
    for (var i = pool.length - 1; i > 0; i--) {
      final j = rng.nextInt(i + 1);
      final temp = pool[i];
      pool[i] = pool[j];
      pool[j] = temp;
    }

    // 2. Avoid same artist back-to-back where pool allows
    for (var i = 1; i < pool.length; i++) {
      if (pool[i].artist.trim().toLowerCase() ==
          pool[i - 1].artist.trim().toLowerCase()) {
        for (var j = i + 1; j < pool.length; j++) {
          if (pool[j].artist.trim().toLowerCase() !=
              pool[i - 1].artist.trim().toLowerCase()) {
            final swap = pool[i];
            pool[i] = pool[j];
            pool[j] = swap;
            break;
          }
        }
      }
    }

    // 3. Never put a song played in the last 20 tracks near the front
    final recentHistorySignatures = _history.reversed
        .take(20)
        .map((e) => SmartQueueEngine.normalizeSignature(e.title, e.artist))
        .toSet();

    if (recentHistorySignatures.isNotEmpty && pool.length > 5) {
      for (var i = 0; i < math.min(5, pool.length); i++) {
        final sig = SmartQueueEngine.normalizeSignature(pool[i].title, pool[i].artist);
        if (recentHistorySignatures.contains(sig)) {
          for (var j = 5; j < pool.length; j++) {
            final candSig = SmartQueueEngine.normalizeSignature(pool[j].title, pool[j].artist);
            if (!recentHistorySignatures.contains(candSig)) {
              final swap = pool[i];
              pool[i] = pool[j];
              pool[j] = swap;
              break;
            }
          }
        }
      }
    }
  }

  /// Toggle shuffle ON / OFF
  void toggleShuffle() {
    _shuffle = !_shuffle;

    if (_shuffle) {
      // ON: Keep current song playing. Never restart it.
      // Rebuild only Playing Next. History and Now Playing are untouched.
      // Manually added items stay pinned at the top.
      final manualPins = _upNext.where((e) => e.isManualPin).toList();
      _originalUpNext = List.of(_upNext);

      final sourceTracks = _context?.tracks ?? _upNext.map((e) => e.track).toList();
      final pool = _buildPoolForContext(sourceTracks, excludeCurrent: true);
      _shufflePool(pool);

      _upNext
        ..clear()
        ..addAll(manualPins)
        ..addAll(pool.map((t) => _wrap(t)));
    } else {
      // OFF: restore original context order starting from the song after current
      final manualPins = _upNext.where((e) => e.isManualPin).toList();
      if (_originalUpNext.isNotEmpty) {
        _upNext
          ..clear()
          ..addAll(manualPins)
          ..addAll(_originalUpNext.where((e) => !e.isManualPin));
      } else if (_context != null && _context!.tracks.isNotEmpty) {
        final curId = _current?.id;
        final tracks = _context!.tracks;
        final curIdx = curId != null ? tracks.indexWhere((t) => t.id == curId) : -1;
        final rest = curIdx >= 0 ? tracks.skip(curIdx + 1).toList() : tracks;
        _upNext
          ..clear()
          ..addAll(manualPins)
          ..addAll(rest.map((t) => _wrap(t)));
      }
    }

    notifyListeners();
  }

  // ─────────────────────────── Repeat Mode ────────────────────────────

  /// Cycles repeat: off -> all -> one -> off
  void cycleRepeat() {
    _repeatMode = switch (_repeatMode) {
      RepeatMode.off => RepeatMode.all,
      RepeatMode.all => RepeatMode.one,
      RepeatMode.one => RepeatMode.off,
    };
    _repeatOneCounter = 0;
    notifyListeners();
  }

  void setRepeatMode(RepeatMode mode) {
    if (_repeatMode == mode) return;
    _repeatMode = mode;
    _repeatOneCounter = 0;
    notifyListeners();
  }

  // ─────────────────────── Single Advance Path ────────────────────────

  /// Convenience helper for queue progression, defaulting to [AdvanceReason.userNext].
  QueueEntry? takeNext({AdvanceReason reason = AdvanceReason.userNext}) {
    return advance(reason: reason);
  }

  /// Single canonical advance path called by Next button, track completion,
  /// and notification controls.
  QueueEntry? advance({required AdvanceReason reason}) {
    final nextCandidate = _upNext.isNotEmpty ? _upNext.first.title : 'none';
    debugPrint(
      'advance(${reason.name}) -> mode=${_repeatMode.name}, shuffle=$_shuffle, context=${_context?.type.name}:${_context?.id}, next=$nextCandidate, upNext=${_upNext.length}',
    );

    // 1. Repeat One + Track Completed -> replay current track (seek to 0)
    if (_repeatMode == RepeatMode.one && reason == AdvanceReason.trackCompleted) {
      if (REPEAT_ONE_LOOPS > 0) {
        _repeatOneCounter++;
        if (_repeatOneCounter >= REPEAT_ONE_LOOPS) {
          _repeatOneCounter = 0;
          _repeatMode = RepeatMode.all;
        }
      }
      notifyListeners();
      return _current != null ? QueueEntry(_current!, _uid++) : null;
    }

    // 2. Advance to next queued song
    if (_upNext.isNotEmpty) {
      final e = _upNext.removeAt(0);
      if (_current != null) _history.add(_wrap(_current!));
      _current = e.track;
      _repeatOneCounter = 0;
      _trim();
      _pruneSelection();
      notifyListeners();
      ensureAutoplay();
      return e;
    }

    // 3. Queue empty + Repeat All -> repeat the CONTEXT
    if (_repeatMode == RepeatMode.all &&
        _context != null &&
        _context!.tracks.isNotEmpty) {
      _rebuildRepeatAllContext();
      if (_upNext.isNotEmpty) {
        final e = _upNext.removeAt(0);
        if (_current != null) _history.add(_wrap(_current!));
        _current = e.track;
        _repeatOneCounter = 0;
        _trim();
        _pruneSelection();
        notifyListeners();
        return e;
      }
    }

    // 4. Queue empty + Repeat Off -> return null (triggers autoplay or stop)
    return null;
  }

  void _rebuildRepeatAllContext() {
    if (_context == null || _context!.tracks.isEmpty) return;
    final tracks = List<Track>.of(_context!.tracks);

    if (_shuffle) {
      final pool = _buildPoolForContext(tracks, excludeCurrent: false);
      _shufflePool(pool);
      _upNext.addAll(pool.map((t) => _wrap(t)));
    } else {
      _upNext.addAll(tracks.map((t) => _wrap(t)));
    }
  }

  /// Previous track: returns previous from history.
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
    _repeatOneCounter = 0;

    // If user tapped a different song while shuffle is on, keep shuffle on
    // and reshuffle the rest of the same context
    if (_shuffle && _context != null) {
      final pool = _buildPoolForContext(_context!.tracks, excludeCurrent: true);
      _shufflePool(pool);
      final pins = _upNext.where((x) => x.isManualPin).toList();
      _upNext
        ..clear()
        ..addAll(pins)
        ..addAll(pool.map((t) => _wrap(t)));
    }

    _trim();
    _pruneSelection();
    notifyListeners();
    ensureAutoplay();
  }

  /// Tap a row in "History": rewind and play from history.
  void playFromHistory(QueueEntry e) {
    final i = _history.indexWhere((x) => x.uid == e.uid);
    if (i < 0) return;
    final later = _history.sublist(i + 1);
    final back = [...later, if (_current != null) _wrap(_current!)];
    _upNext.insertAll(0, back);
    _history.removeRange(i, _history.length);
    _current = e.track;
    _repeatOneCounter = 0;
    notifyListeners();
  }

  // ─────────────────────────────── Adding ───────────────────────────────

  int get _manualEnd {
    final i = _upNext.indexWhere((e) => e.isAutoplay);
    return i < 0 ? _upNext.length : i;
  }

  /// "Play Next": pins directly after current song.
  QueueEntry? playNext(Track track, {bool allowDuplicate = true}) {
    if (!allowDuplicate && isQueued(track)) return null;
    final e = _wrap(track, pin: true);
    _upNext.insert(0, e);
    notifyListeners();
    return e;
  }

  /// "Add to Queue": pins after last manual entry.
  QueueEntry? addToQueue(Track track, {bool allowDuplicate = true}) {
    if (!allowDuplicate && isQueued(track)) return null;
    final e = _wrap(track, pin: true);
    _upNext.insert(_manualEnd, e);
    notifyListeners();
    return e;
  }

  void addAll(List<Track> tracks) {
    if (tracks.isEmpty) return;
    _upNext.insertAll(_manualEnd, tracks.map((t) => _wrap(t, pin: true)));
    notifyListeners();
  }

  void playNextAll(List<Track> tracks) {
    if (tracks.isEmpty) return;
    _upNext.insertAll(0, tracks.map((t) => _wrap(t, pin: true)));
    notifyListeners();
  }

  void promoteAutoplay(QueueEntry e) {
    final i = indexOf(e);
    if (i < 0 || !_upNext[i].isAutoplay) return;
    _upNext.removeAt(i);
    _upNext.insert(_manualEnd, e.copyWith(isAutoplay: false, isManualPin: true));
    notifyListeners();
  }

  // ─────────────────────────────── Editing ──────────────────────────────

  void reorder(int oldIndex, int newIndex) {
    final end = _manualEnd;
    if (oldIndex < 0 || oldIndex >= end) return;
    if (newIndex > oldIndex) newIndex -= 1;
    newIndex = newIndex.clamp(0, end - 1);
    if (oldIndex == newIndex) return;
    final e = _upNext.removeAt(oldIndex);
    _upNext.insert(newIndex, e.copyWith(isManualPin: true));
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
    _upNext.insert(0, _upNext.removeAt(i).copyWith(isAutoplay: false, isManualPin: true));
    notifyListeners();
  }

  void moveToBottom(QueueEntry e) {
    final i = indexOf(e);
    if (i < 0) return;
    final item = _upNext.removeAt(i).copyWith(isAutoplay: false, isManualPin: true);
    _upNext.insert(_manualEnd, item);
    notifyListeners();
  }

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
    toggleShuffle();
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

  Future<void> ensureAutoplay() async {
    final provider = autoplayProvider;
    final seed = _current;
    if (!_autoplay || _collectionLocked || provider == null || seed == null || _autoplayLoading) return;
    final autoCount = _upNext.where((e) => e.isAutoplay).length;
    if (_upNext.length >= _autoplayBatch || autoCount >= 6) return;

    _autoplayLoading = true;
    notifyListeners();
    try {
      final excludeIds = <String>{
        keyOf(seed),
        seed.id.replaceFirst('yt-', '').trim(),
        ..._upNext.expand((e) => [
          keyOf(e.track),
          e.track.id.replaceFirst('yt-', '').trim(),
        ]),
        ..._history.reversed.take(SmartQueueWeights.duplicateHistoryWindow).expand((e) => [
          keyOf(e.track),
          e.track.id.replaceFirst('yt-', '').trim(),
        ]),
      };

      final excludeSignatures = <String>{
        SmartQueueEngine.normalizeSignature(seed.title, seed.artist),
        ..._upNext.map((e) => SmartQueueEngine.normalizeSignature(e.title, e.artist)),
        ..._history.reversed.take(SmartQueueWeights.duplicateHistoryWindow).map(
          (e) => SmartQueueEngine.normalizeSignature(e.title, e.artist),
        ),
      }..remove('');

      final results = await provider(seed, excludeIds, excludeSignatures);
      if (!_autoplay || _collectionLocked) return;

      final fresh = <Track>[];
      for (final t in results) {
        final sig = SmartQueueEngine.normalizeSignature(t.title, t.artist);
        final cleanId = t.id.replaceFirst('yt-', '').trim();

        if (excludeIds.contains(t.id) || excludeIds.contains(cleanId)) continue;
        if (sig.isNotEmpty && excludeSignatures.contains(sig)) continue;

        excludeIds.add(t.id);
        excludeIds.add(cleanId);
        if (sig.isNotEmpty) excludeSignatures.add(sig);
        fresh.add(t);

        if (_upNext.length + fresh.length >= _autoplayBatch) break;
      }

      if (fresh.isNotEmpty) {
        _upNext.addAll(fresh.map((t) => _wrap(t, auto: true)));
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[QueueState] ensureAutoplay error: $e');
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
        'shuffle': _shuffle,
        'repeatMode': _repeatMode.name,
        'current': _current?.toJson(),
        'context': _context?.toJson(),
        'upNext': [
          for (final e in _upNext)
            if (!e.isAutoplay) e.track.toJson(),
        ],
        'history': [for (final e in _history) e.track.toJson()],
      };

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
    _shuffle = json['shuffle'] == true;

    final repStr = json['repeatMode'] as String? ?? 'off';
    _repeatMode = RepeatMode.values.firstWhere(
      (m) => m.name == repStr,
      orElse: () => RepeatMode.off,
    );

    _current = parse(json['current']);

    final rawCtx = json['context'] as Map<String, dynamic>?;
    if (rawCtx != null) {
      try {
        _context = PlaybackContext.fromJson(rawCtx);
      } catch (_) {}
    }

    _upNext
      ..clear()
      ..addAll(parseList(json['upNext']).map((t) => _wrap(t)));
    _history
      ..clear()
      ..addAll(parseList(json['history']).map((t) => _wrap(t)));

    _originalUpNext = List.of(_upNext);
    _undoSnapshot = null;
    _selecting = false;
    _selected.clear();
    notifyListeners();
    ensureAutoplay();
  }
}