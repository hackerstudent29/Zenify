import 'dart:async';
import 'dart:math' as math;

import 'zen_player.dart' as ap;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart' hide RepeatMode;

import '../data/datasources/catalog_datasource.dart';
import '../models/track.dart';
import 'api_service.dart';
import 'innertube_service.dart';
import 'studio_fx_state.dart';
import 'playback_bridge.dart';
import 'library_store.dart';
import 'listening_history_service.dart';
import 'listening_tracker_service.dart';
import 'lyrics_service.dart';
import 'permission_service.dart';
import 'queue_state.dart';
import 'stream_resolver_service.dart';

typedef ZenifyRepeatMode = RepeatMode;

/// Player controller modelled on Apple Music behaviour.
///
/// CRITICAL RULE: Playback position NEVER lives in PlayerState; it lives in
/// [positionNotifier]. Everything that changes at frame rate (position, lyric
/// line, scrubbing, volume, sheet expansion) has its own notifier so the
/// whole tree never rebuilds for it.
class PlayerState extends ChangeNotifier with WidgetsBindingObserver implements PlaybackBridge {
  PlayerState() {
    _initAudioPlayer();
    WidgetsBinding.instance.addObserver(this);
    final all = CatalogDataSource.allTracks;
    if (all.isNotEmpty) {
      _queue = List.of(all);
      _originalQueue = List.of(all);
      _currentTrack = _queue.first;
      _duration = Duration(seconds: _currentTrack!.durationSeconds);
    }
  }

  final ap.AudioPlayer _audioPlayer = ap.AudioPlayer();
  final List<StreamSubscription<dynamic>> _subs = [];
  final math.Random _rng = math.Random();

  // ---- Isolated high-frequency notifiers ------------------------------------
  /// Strictly isolated position notifier for 60/120fps scrubbers.
  final ValueNotifier<Duration> positionNotifier = ValueNotifier<Duration>(
    Duration.zero,
  );

  /// Index of the active lyric line (-1 = none). Only fires when the line changes.
  final ValueNotifier<int> lyricIndexNotifier = ValueNotifier<int>(-1);

  /// True while the user is dragging the scrubber (UI thickens the bar).
  final ValueNotifier<bool> scrubbingNotifier = ValueNotifier<bool>(false);

  /// User volume 0..1.
  final ValueNotifier<double> volumeNotifier = ValueNotifier<double>(1.0);

  /// Now Playing sheet expansion 0 (mini player) .. 1 (full). Written by the UI
  /// so the tab bar, mini player and background can react to the drag.
  final ValueNotifier<double> expansionNotifier = ValueNotifier<double>(0.0);

  /// Dominant artwork colour for the animated Now Playing background.
  final ValueNotifier<Color?> accentColorNotifier = ValueNotifier<Color?>(null);

  /// Plug in a palette extractor (e.g. palette_generator) from the UI layer.
  Future<Color?> Function(Track track)? accentResolver;

  // ---- State ------------------------------------------------------------------
  Track? _currentTrack;
  bool _isPlaying = false;
  bool _isBuffering = false;
  bool _isShuffle = false;
  bool _autoplay = true;
  ZenifyRepeatMode _repeatMode = ZenifyRepeatMode.off;
  Duration _duration = const Duration(seconds: 210);
  List<Track> _queue = [];
  List<Track> _originalQueue = [];
  final List<Track> _history = [];
  int _currentIndex = 0;
  int? _autoplayStartIndex;
  bool _collectionLocked = false;
  bool get isCollectionLocked => _collectionLocked;
  DateTime? _lastTransitionHandled;
  String? _lastError;
  final Set<String> _playedSessionTrackIds = <String>{};
  bool _prepopulatingRadio = false;

  // Engine coordination
  int _playToken = 0;
  int _rampToken = 0;
  bool _isTransitioning = false;
  bool _pausing = false;
  double _appliedVolume = 1.0;

  // Scrub / seek smoothing
  bool _isScrubbing = false;
  Duration? _seekTarget;
  DateTime _seekGuardUntil = DateTime.fromMillisecondsSinceEpoch(0);
  Duration _lastReportedPosition = Duration.zero;
  final Stopwatch _sinceReport = Stopwatch()..start();

  // Lyrics
  List<Map<String, dynamic>> _lyricsLines = [];
  List<int> _lyricTimes = [];
  bool _lyricsSynced = false;
  bool _isLoadingLyrics = false;
  static const int _lyricLeadMs = 150;

  // Sleep timer
  Timer? _sleepTimer;
  DateTime? _sleepEndsAt;
  bool _sleepAtEndOfTrack = false;

  // Studio FX Engine Connection
  StudioFxState? _fxState;
  QueueState? _queueState;

  FxEngine get fxEngine => _audioPlayer;

  void attachStudioFx(StudioFxState fx) {
    if (_fxState == fx) return;
    _fxState = fx;
    fx.attachEngine(_audioPlayer);
  }

  void attachQueue(QueueState queue) {
    if (_queueState == queue) return;
    _queueState = queue;
    if (_currentTrack != null && queue.current == null) {
      queue.syncCurrent(_currentTrack);
    }
  }

  void _onStudioFxChanged() {
    // Handled natively by ExoPlayer AudioProcessor in ZenFxProcessor
  }

  // ---- Getters ------------------------------------------------------------------
  @override
  Track? get currentTrack => _currentTrack;
  @override
  bool get isPlaying => _isPlaying;
  @override
  bool get isBuffering => _isBuffering;
  bool get isShuffle => _queueState?.shuffle ?? _isShuffle;
  @override
  bool get shuffle => _queueState?.shuffle ?? _isShuffle;
  bool get autoplay => _queueState?.autoplay ?? _autoplay;
  ZenifyRepeatMode get repeatMode => _queueState?.repeatMode ?? _repeatMode;
  @override
  RepeatMode get repeat => _queueState?.repeatMode ?? _repeatMode;
  @override
  Duration get duration => _duration;
  @override
  ValueListenable<Duration> get position => positionNotifier;
  @override
  double get volume => volumeNotifier.value;
  List<Track> get queue => _queue;
  int get currentIndex => _currentIndex;
  String? get lastError => _lastError;

  /// Tracks after the current one (the "Up Next" list).
  List<Track> get upNext => _queue.length > _currentIndex + 1
      ? _queue.sublist(_currentIndex + 1)
      : const [];

  /// Where the Autoplay section starts inside [queue], or null.
  int? get autoplayStartIndex => _autoplayStartIndex;

  /// Recently played, newest first.
  List<Track> get history => List.unmodifiable(_history);

  @override
  bool get hasNext {
    if (_repeatMode == ZenifyRepeatMode.all) return true;
    if (_queueState != null) {
      return _queueState!.hasNext || (_autoplay && !_collectionLocked);
    }
    return _currentIndex < _queue.length - 1 || (_autoplay && !_collectionLocked);
  }

  @override
  bool get hasPrevious {
    if (_repeatMode == ZenifyRepeatMode.all) return true;
    if (_queueState != null) {
      return _queueState!.hasPrevious;
    }
    return _currentIndex > 0;
  }

  List<Map<String, dynamic>> get lyricsLines => _lyricsLines;
  bool get isLoadingLyrics => _isLoadingLyrics;
  bool get hasLyrics => _lyricsLines.isNotEmpty;
  bool get lyricsSynced => _lyricsSynced;

  Set<String> get lovedIds =>
      LibraryStore.instance.likedTracks.map((t) => t.id).toSet();
  bool isLoved(Track t) => LibraryStore.instance.isLiked(t);
  @override
  bool isFavorite(Track track) => isLoved(track);

  DateTime? get sleepEndsAt => _sleepEndsAt;
  bool get sleepAtEndOfTrack => _sleepAtEndOfTrack;
  bool get sleepTimerActive => _sleepEndsAt != null || _sleepAtEndOfTrack;

  /// Frame-accurate position estimate. Engine position events arrive roughly
  /// every 200ms, so a Ticker-driven scrubber should read this each frame to
  /// get a perfectly smooth bar at 60/120Hz.
  Duration get livePosition {
    final base = positionNotifier.value;
    if (!_isPlaying || _isScrubbing || _isBuffering) return base;
    final estimate = _lastReportedPosition + _sinceReport.elapsed;
    return estimate > _duration ? _duration : estimate;
  }

  // ---- Engine wiring ------------------------------------------------------------
  void _initAudioPlayer() {
    _subs.add(_audioPlayer.onPlayerStateChanged.listen(_onEngineState));
    _subs.add(
      _audioPlayer.onBufferingChanged.listen((b) {
        if (_isBuffering != b) {
          _isBuffering = b;
          notifyListeners();
        }
      }),
    );
    _subs.add(_audioPlayer.onPositionChanged.listen(_onEnginePosition));
    _subs.add(
      _audioPlayer.onDurationChanged.listen((d) {
        if (d > Duration.zero && d != _duration) {
          _duration = d;
          notifyListeners();
        }
      }),
    );
    _subs.add(_audioPlayer.onPlayerComplete.listen((_) => _onComplete()));
    _subs.add(
      _audioPlayer.onAutoTransition.listen((id) => _onAutoTransition(id)),
    );
    _subs.add(_audioPlayer.onError.listen(_onEngineError));
  }

  void _onEngineError(String message) {
    if (_isTransitioning || _pausing) return;
    if (kDebugMode) {
      debugPrint('[PlayerState] Native engine playback error: $message');
    }
    _isPlaying = false;
    _isBuffering = false;
    _lastError = 'Playback error: $message';
    notifyListeners();
  }

  void _onEngineState(ap.PlayerState state) {
    // Ignore engine chatter during our own fades and track changes, so the
    // play/pause button never flickers.
    if (_isTransitioning || _pausing) return;
    if (state == ap.PlayerState.completed) {
      return; // handled by onPlayerComplete
    }
    final playing = state == ap.PlayerState.playing;
    if (_isPlaying != playing) {
      _isPlaying = playing;
      notifyListeners();
    }
  }

  void _onEnginePosition(Duration pos) {
    if (_isScrubbing || _isTransitioning) return;

    // Drop stale events that arrive right after a seek.
    final target = _seekTarget;
    if (target != null) {
      final guarded = DateTime.now().isBefore(_seekGuardUntil);
      if (guarded && (pos - target).abs() > const Duration(seconds: 1)) return;
      _seekTarget = null;
    }

    _setPosition(pos);
    if (_isBuffering && pos > Duration.zero) {
      _isBuffering = false;
      notifyListeners();
    }
  }

  Future<void> _onComplete() async {
    await advance(reason: AdvanceReason.trackCompleted);
  }

  Future<void> _onAutoTransition(String mediaId) async {
    await advance(
      reason: AdvanceReason.trackCompleted,
      autoTransitionMediaId: mediaId,
    );
  }

  void _setPosition(Duration pos) {
    positionNotifier.value = pos;
    _lastReportedPosition = pos;
    _sinceReport
      ..reset()
      ..start();
    _updateLyricIndex(pos);
  }

  // ---- Queue ----------------------------------------------------------------------

  /// Replace the queue and start playing. If [shuffle] is null the current
  /// shuffle setting is kept (like Apple Music).
  /// When [collectionLocked] is true, playback strictly stays inside [tracks].
  Future<void> setQueue(
    List<Track> tracks, {
    int startIndex = 0,
    bool? shuffle,
    bool collectionLocked = false,
    PlaybackContext? context,
  }) async {
    if (tracks.isEmpty) return;
    _collectionLocked = collectionLocked;
    _queueState?.setCollectionLocked(collectionLocked);
    unawaited(_audioPlayer.setNext(null));

    final ctx = context ??
        PlaybackContext(
          type: collectionLocked ? PlaybackContextType.album : PlaybackContextType.queueOnly,
          id: 'ctx_${DateTime.now().millisecondsSinceEpoch}',
          tracks: tracks,
          startTrack: tracks[startIndex.clamp(0, tracks.length - 1)],
        );

    final doShuffle = shuffle ?? (_queueState?.shuffle ?? _isShuffle);
    _isShuffle = doShuffle;

    if (_queueState != null) {
      _queueState!.setContext(ctx, startIndex: startIndex, shuffle: doShuffle);
      final cur = _queueState!.current;
      if (cur != null) {
        await _startCurrentTrack(cur);
        return;
      }
    }

    _originalQueue = List.of(tracks);
    _queue = List.of(tracks);
    _currentIndex = startIndex.clamp(0, _queue.length - 1);
    await _startCurrent();
  }

  /// The big "Shuffle" button on albums and playlists.
  Future<void> shuffleAll(List<Track> tracks) {
    if (tracks.isEmpty) return Future.value();
    return setQueue(
      tracks,
      startIndex: _rng.nextInt(tracks.length),
      shuffle: true,
    );
  }

  /// Play one track. If it is in the queue the queue is kept, otherwise it is
  /// inserted right after the current song.
  Future<void> playTrack(Track track, {bool syncQueue = true}) async {
    if (syncQueue) {
      _queueState?.syncCurrent(track);
    }
    final idx = _queue.indexWhere((t) => t.id == track.id);
    if (idx >= 0) {
      _currentIndex = idx;
    } else {
      final at = _queue.isEmpty ? 0 : _currentIndex + 1;
      _queue.insert(at, track);
      _originalQueue.add(track);
      _currentIndex = at;
    }
    await _startCurrent();
  }

  /// "Play Next": insert directly after the current song.
  void playNext(Track track) {
    _queueState?.playNext(track);
    if (_queue.isEmpty) {
      setQueue([track]);
      return;
    }
    _queue.insert(_currentIndex + 1, track);
    final cur = _queue[_currentIndex];
    final oi = _originalQueue.indexWhere((t) => t.id == cur.id);
    _originalQueue.insert(oi >= 0 ? oi + 1 : _originalQueue.length, track);
    HapticFeedback.lightImpact();
    notifyListeners();
  }

  /// "Play Last": append to the end of Up Next.
  void playLast(Track track) {
    _queueState?.addToQueue(track);
    if (_queue.isEmpty) {
      setQueue([track]);
      return;
    }
    _queue.add(track);
    _originalQueue.add(track);
    HapticFeedback.lightImpact();
    notifyListeners();
  }

  /// Tap a row in "Playing Next": advance directly to this queue entry.
  Future<void> jumpTo(QueueEntry e) async {
    _queueState?.jumpTo(e);
    await _startCurrentTrack(e.track);
  }

  /// Tap a row in "History": rewind and play from history.
  Future<void> playFromHistory(QueueEntry e) async {
    _queueState?.playFromHistory(e);
    await _startCurrentTrack(e.track);
  }

  Future<void> _startCurrentTrack(Track track) async {
    _currentTrack = track;
    final idx = _queue.indexWhere((t) => t.id == track.id);
    if (idx >= 0) {
      _currentIndex = idx;
    } else {
      final at = _queue.isEmpty ? 0 : _currentIndex + 1;
      _queue.insert(at, track);
      _originalQueue.add(track);
      _currentIndex = at;
    }
    await _startCurrent();
  }

  void removeFromQueue(int index) {
    if (index < 0 || index >= _queue.length || index == _currentIndex) return;
    final removed = _queue.removeAt(index);
    if (index < _currentIndex) _currentIndex--;
    final oi = _originalQueue.indexWhere((t) => t.id == removed.id);
    if (oi >= 0) _originalQueue.removeAt(oi);
    if (_autoplayStartIndex != null && index < _autoplayStartIndex!) {
      _autoplayStartIndex = _autoplayStartIndex! - 1;
    }
    notifyListeners();
  }

  /// Reorder with ReorderableListView semantics.
  void reorderQueue(int oldIndex, int newIndex) {
    if (oldIndex < 0 || oldIndex >= _queue.length) return;
    if (oldIndex < newIndex) newIndex -= 1;
    newIndex = newIndex.clamp(0, _queue.length - 1);
    if (oldIndex == newIndex) return;

    final item = _queue.removeAt(oldIndex);
    _queue.insert(newIndex, item);

    if (oldIndex == _currentIndex) {
      _currentIndex = newIndex;
    } else if (oldIndex < _currentIndex && newIndex >= _currentIndex) {
      _currentIndex--;
    } else if (oldIndex > _currentIndex && newIndex <= _currentIndex) {
      _currentIndex++;
    }
    notifyListeners();
  }

  void clearUpNext() {
    if (_queue.length <= _currentIndex + 1) return;
    _queue.removeRange(_currentIndex + 1, _queue.length);
    final keep = _queue.map((t) => t.id).toSet();
    _originalQueue.removeWhere((t) => !keep.contains(t.id));
    _autoplayStartIndex = null;
    notifyListeners();
  }

  // ---- Transport ------------------------------------------------------------------

  /// Plays a track directly (used by search, library, and Room Together)
  Future<void> playMedia(Track track, {int? startMs, String source = 'manual'}) async {
    _currentTrack = track;
    final idx = _queue.indexWhere((t) => t.id == track.id);
    if (idx >= 0) {
      _currentIndex = idx;
    } else {
      final at = _queue.isEmpty ? 0 : _currentIndex + 1;
      _queue.insert(at, track);
      _originalQueue.add(track);
      _currentIndex = at;
    }
    await _startCurrent(startMs: startMs, source: source);
  }

  Future<void> _startCurrent({int? startMs, String source = 'manual'}) async {
    if (_queue.isEmpty) return;
    _currentIndex = _currentIndex.clamp(0, _queue.length - 1);
    final track = _queue[_currentIndex];
    final token = ++_playToken;
    _rampToken++; // cancel any fade in flight

    _currentTrack = track;
    LibraryStore.instance.registerTrack(track);
    // Request media notification permission on Android 13+ when playback begins
    unawaited(PermissionService.instance.ensureNotificationPermission());
    _isTransitioning = true;
    _pausing = false;
    _isBuffering = true;
    _isPlaying = true;
    _lastError = null;
    _isScrubbing = false;
    scrubbingNotifier.value = false;
    _seekTarget = null;
    _duration = Duration(seconds: track.durationSeconds);
    _setPosition(startMs != null ? Duration(milliseconds: startMs) : Duration.zero);
    _pushHistory(track);
    ListeningTrackerService.instance.startTrack(
      trackId: track.id,
      trackTitle: track.title,
      trackAlbum: track.album,
      trackDurationMs: track.durationSeconds * 1000,
      artists: [
        {
          'artistKey': track.artist,
          'artistName': track.artist,
          'isPrimary': true,
        },
      ],
    );
    notifyListeners();

    unawaited(_loadLyricsForTrack(track, token));
    unawaited(_resolveAccent(track, token));

    try {
      await _applyVolume(0);
      await _playWithFallback(track, token, startMs: startMs);
      if (token != _playToken) return;

      _onStudioFxChanged();
      _isTransitioning = false;
      notifyListeners();

      // Apple Music always eases audio in instead of cutting it.
      unawaited(
        _rampVolume(volumeNotifier.value, const Duration(milliseconds: 260)),
      );
      _prefetchNext();
      _playedSessionTrackIds.add(track.id);
      _playedSessionTrackIds.add(track.id.replaceFirst('yt-', ''));
      if (!_collectionLocked &&
          _autoplay &&
          (_queue.length - _currentIndex) <= 3) {
        unawaited(_prepopulateRadio(track));
      }
    } catch (e) {
      if (token != _playToken) return;
      if (kDebugMode) debugPrint('Audio playback error: $e');
      _isTransitioning = false;
      _isBuffering = false;
      _isPlaying = false;
      _lastError = 'Unable to play "${track.title}".';
      notifyListeners();
    }
  }

  Future<void> _playWithFallback(Track track, int token, {int? startMs}) async {
    if (token != _playToken) return;
    _isPlaying = true;
    _isBuffering = true;
    notifyListeners();

    Object? error;

    // 1. TOP PRIORITY: Native ExoPlayer Pipeline with InnerTubeX + PO Token
    // Instant ~200-300ms audio playback directly on device.
    final videoId = track.id.replaceFirst('yt-', '').trim();
    if (videoId.length == 11 &&
        !videoId.contains(' ') &&
        !videoId.startsWith('http') &&
        !videoId.startsWith('gen-')) {
      try {
        if (token != _playToken) return;
        await _audioPlayer.playMedia(
          mediaId: videoId,
          title: track.title,
          artist: track.artist,
          artworkUrl: track.coverUrl,
          startMs: startMs,
        );
        return;
      } catch (e) {
        error = e;
        if (kDebugMode) debugPrint('[PlayerState] native playMedia error: $e');
      }
    }

    // 2. Direct clean CDN URL if already set on track (excluding previews, localhost, or stream-youtube)
    if (track.streamUrl != null &&
        track.streamUrl!.isNotEmpty &&
        !track.streamUrl!.contains('audio-ssl') &&
        !track.streamUrl!.contains('mzstatic') &&
        !track.streamUrl!.contains('localhost') &&
        !track.streamUrl!.contains('stream-youtube')) {
      try {
        if (token != _playToken) return;
        await _audioPlayer.play(ap.UrlSource(track.streamUrl!));
        return;
      } catch (e) {
        error = e;
      }
    }

    // 3. On-Device Stream Resolver: searches YouTube Music accurately by Title + Artist
    try {
      final resolved = await StreamResolverService.instance.resolveTrack(track);
      if (resolved != null && resolved.url.isNotEmpty) {
        if (token != _playToken) return;
        await _audioPlayer.play(ap.UrlSource(resolved.url));
        return;
      }
    } catch (e) {
      error = e;
      if (kDebugMode) {
        debugPrint('[PlayerState] StreamResolverService error: $e');
      }
    }

    // 4. Fallback: Zenify Backend Stream Proxy (/stream-youtube?v=)
    if (videoId.length == 11 && !videoId.contains(' ')) {
      try {
        final proxyUrl = '${ApiService.baseUrl}/stream-youtube?v=$videoId';
        if (token != _playToken) return;
        await _audioPlayer.play(ap.UrlSource(proxyUrl));
        return;
      } catch (e) {
        error = e;
      }
    }

    throw error ??
        StateError('Unable to resolve audio stream for "${track.title}"');
  }

  void _prefetchNext() {
    Track? nextTrack;
    List<String> lookahead = [];

    if (_queueState != null && _queueState!.hasNext) {
      nextTrack = _queueState!.upNext.first.track;
      lookahead = _queueState!.upNext
          .skip(1)
          .take(2)
          .map((e) => e.track.id)
          .toList();
    } else {
      final n = _currentIndex + 1;
      if (n < _queue.length) {
        nextTrack = _queue[n];
        lookahead = _queue.skip(n + 1).take(2).map((t) => t.id).toList();
      }
    }

    if (nextTrack != null) {
      unawaited(ApiService.prefetchLyrics(nextTrack));
      // Gapless next track setup & native engine prefetch with metadata
      unawaited(
        _audioPlayer.setNext(
          nextTrack.id,
          title: nextTrack.title,
          artist: nextTrack.artist,
          artworkUrl: nextTrack.coverUrl,
        ),
      );
      if (lookahead.isNotEmpty) {
        unawaited(_audioPlayer.prefetch(lookahead));
      }
    } else {
      // Clear next item in native player at queue boundary so it doesn't auto-transition
      unawaited(_audioPlayer.setNext(null));
    }
  }

  void prewarm() {
    unawaited(_audioPlayer.prewarm());
  }

  void _pushHistory(Track t) {
    if (_history.isNotEmpty && _history.first.id == t.id) return;
    _history.insert(0, t);
    if (_history.length > 50) _history.removeRange(50, _history.length);
    unawaited(ListeningHistoryService.instance.recordPlay(t));
  }

  @override
  Future<void> play() => resume();

  @override
  Future<void> togglePlayPause() => togglePlay();

  Future<void> togglePlay() => _isPlaying ? pause() : resume();

  /// Pauses with a short volume fade (no audible click).
  @override
  Future<void> pause({
    Duration fade = const Duration(milliseconds: 180),
  }) async {
    if (!_isPlaying) return;
    ListeningTrackerService.instance.onPlaybackStateChanged(false);
    _isPlaying = false;
    _pausing = true;
    notifyListeners();

    final completed = await _rampVolume(0, fade, curve: Curves.easeInCubic);
    if (!completed) return; // a newer command owns the state now
    try {
      await _audioPlayer.pause();
    } catch (_) {}
    _pausing = false;
  }

  Future<void> resume() async {
    if (_queue.isEmpty) return;
    _pausing = false;

    final st = _audioPlayer.state;
    if (_currentTrack == null ||
        st == ap.PlayerState.stopped ||
        st == ap.PlayerState.completed) {
      await _startCurrent();
      return;
    }

    _isPlaying = true;
    ListeningTrackerService.instance.onPlaybackStateChanged(true);
    notifyListeners();
    try {
      if (st != ap.PlayerState.playing) {
        _rampToken++;
        await _applyVolume(0);
        await _audioPlayer.resume();
      }
      await _rampVolume(
        volumeNotifier.value,
        const Duration(milliseconds: 240),
      );
    } catch (_) {}
  }

  @override
  Future<void> seek(Duration pos) async {
    final clamped = _clampPosition(pos);
    _seekTarget = clamped;
    _seekGuardUntil = DateTime.now().add(const Duration(milliseconds: 450));
    _setPosition(clamped);
    try {
      await _audioPlayer.seek(clamped);
    } catch (_) {}
  }

  // ---- Scrubbing ------------------------------------------------------------------
  void beginScrub() {
    _isScrubbing = true;
    scrubbingNotifier.value = true;
    HapticFeedback.selectionClick();
  }

  void updateScrub(Duration pos) => _setPosition(_clampPosition(pos));

  Future<void> endScrub(Duration pos) async {
    _isScrubbing = false;
    scrubbingNotifier.value = false;
    await seek(pos);
  }

  Duration _clampPosition(Duration p) {
    if (p < Duration.zero) return Duration.zero;
    if (p > _duration) return _duration;
    return p;
  }

  // ---- Skip -----------------------------------------------------------------------
  // ---- Unified Advance & Skip -----------------------------------------------------

  /// The SINGLE advance path across UI next, background/notification controls,
  /// and track completion events.
  Future<void> advance({
    required AdvanceReason reason,
    String? autoTransitionMediaId,
  }) async {
    final now = DateTime.now();
    // Guard against completion events firing twice in rapid succession (<800ms)
    if (reason == AdvanceReason.trackCompleted &&
        _lastTransitionHandled != null &&
        now.difference(_lastTransitionHandled!) <
            const Duration(milliseconds: 800)) {
      return;
    }
    _lastTransitionHandled = now;

    ListeningTrackerService.instance.endTrack(
      reason == AdvanceReason.trackCompleted ? 'completed' : 'skipped',
    );

    if (_sleepAtEndOfTrack) {
      _clearSleep();
      _isPlaying = false;
      _setPosition(Duration.zero);
      notifyListeners();
      return;
    }

    final q = _queueState;
    if (q != null) {
      // 1. Repeat One + Track Completed -> replay current track (seek to 0)
      if (q.repeatMode == RepeatMode.one &&
          reason == AdvanceReason.trackCompleted) {
        await seek(Duration.zero);
        try {
          await _audioPlayer.resume();
        } catch (_) {}
        return;
      }

      // 2. Delegate advance to QueueState single advance path
      final nextEntry = q.advance(reason: reason);
      if (nextEntry != null) {
        final track = nextEntry.track;
        final cleanMediaId =
            autoTransitionMediaId?.replaceFirst('yt-', '').trim() ?? '';
        final cleanTrackId = track.id.replaceFirst('yt-', '').trim();

        if (cleanMediaId.isNotEmpty && cleanMediaId == cleanTrackId) {
          // Native engine already transitioned smoothly to this track
          _currentTrack = track;
          final token = ++_playToken;
          LibraryStore.instance.registerTrack(track);
          _isTransitioning = false;
          _pausing = false;
          _isBuffering = false;
          _isPlaying = true;
          _lastError = null;
          _duration = Duration(seconds: track.durationSeconds);
          _setPosition(Duration.zero);
          _pushHistory(track);
          ListeningTrackerService.instance.startTrack(
            trackId: track.id,
            trackTitle: track.title,
            trackAlbum: track.album,
            trackDurationMs: track.durationSeconds * 1000,
            artists: [
              {
                'artistKey': track.artist,
                'artistName': track.artist,
                'isPrimary': true,
              },
            ],
          );
          notifyListeners();
          unawaited(_loadLyricsForTrack(track, token));
          unawaited(_resolveAccent(track, token));
          _prefetchNext();
          return;
        }

        await _startCurrentTrack(track);
        return;
      }

      // 3. Queue is empty. If autoplay enabled, top up and take next
      if (q.autoplay && !_collectionLocked) {
        await q.ensureAutoplay();
        final autoEntry = q.advance(reason: reason);
        if (autoEntry != null) {
          await _startCurrentTrack(autoEntry.track);
          return;
        }
      }

      // 4. End of queue reached
      await _endOfQueue();
      return;
    }

    // Fallback if _queueState is not attached
    if (_queue.isEmpty) return;
    if (_currentIndex < _queue.length - 1) {
      _currentIndex++;
      await _startCurrent();
    } else if (_repeatMode == RepeatMode.all) {
      _currentIndex = 0;
      await _startCurrent();
    } else {
      await _endOfQueue();
    }
  }

  @override
  Future<void> next({String source = 'manual'}) =>
      advance(reason: AdvanceReason.userNext);

  @override
  Future<void> previous() async {
    ListeningTrackerService.instance.endTrack('previous');
    // Apple Music rule: past 3s, restart current song instead of going back
    if (livePosition.inSeconds > 3) {
      await seek(Duration.zero);
      return;
    }

    if (_queueState != null && _queueState!.hasPrevious) {
      final prevEntry = _queueState!.takePrevious();
      if (prevEntry != null) {
        await _startCurrentTrack(prevEntry.track);
        return;
      }
    }

    if (_queue.isEmpty) return;
    if (_currentIndex > 0) {
      _currentIndex--;
      await _startCurrent();
    } else {
      await seek(Duration.zero);
    }
  }

  Future<void> _endOfQueue() async {
    _isPlaying = false;
    _setPosition(Duration.zero);
    notifyListeners();
    try {
      await _audioPlayer.stop();
    } catch (_) {}
  }

  /// Immediately populates the radio queue when user starts playing a song,
  /// matching the seed song's language and user affinity without repeats.
  Future<void> _prepopulateRadio(Track seed) async {
    if (_prepopulatingRadio || _collectionLocked || !_autoplay) return;
    _prepopulatingRadio = true;
    try {
      final userLang = ListeningHistoryService.instance.primaryLanguage;
      final targetLang = seed.language.isNotEmpty
          ? seed.language
          : (Track.detectLanguage(seed.title, seed.artist, seed.album) ??
                userLang);

      final related = await InnerTubeService.instance.fetchRelated(
        seed,
        targetLanguage: targetLang,
      );
      if (related.isEmpty) return;

      final existingIds = {
        ..._queue.map((t) => t.id),
        ..._queue.map((t) => t.id.replaceFirst('yt-', '')),
        ..._playedSessionTrackIds,
      };

      final fresh = related
          .where((t) {
            final cleanId = t.id.replaceFirst('yt-', '');
            return !existingIds.contains(t.id) &&
                !existingIds.contains(cleanId);
          })
          .take(20)
          .toList();

      if (fresh.isNotEmpty) {
        _autoplayStartIndex ??= _queue.length;
        _queue.addAll(fresh);
        _originalQueue.addAll(fresh);
        notifyListeners();
        _prefetchNext();
      }
    } catch (_) {
    } finally {
      _prepopulatingRadio = false;
    }
  }

  // ---- Modes ----------------------------------------------------------------------
  @override
  void toggleShuffle() {
    if (_queueState != null) {
      _queueState!.toggleShuffle();
      _isShuffle = _queueState!.shuffle;
    } else {
      _isShuffle = !_isShuffle;
    }
    _prefetchNext();
    HapticFeedback.selectionClick();
    notifyListeners();
  }

  void toggleRepeat() => cycleRepeat();

  @override
  void cycleRepeat() {
    if (_queueState != null) {
      _queueState!.cycleRepeat();
      _repeatMode = _queueState!.repeatMode;
    } else {
      _repeatMode = switch (_repeatMode) {
        RepeatMode.off => RepeatMode.all,
        RepeatMode.all => RepeatMode.one,
        RepeatMode.one => RepeatMode.off,
      };
    }
    HapticFeedback.selectionClick();
    notifyListeners();
  }

  void toggleAutoplay() {
    _autoplay = !_autoplay;
    _queueState?.toggleAutoplay();
    HapticFeedback.selectionClick();
    notifyListeners();
  }

  void toggleLove(Track track) {
    LibraryStore.instance.registerTrack(track);
    LibraryStore.instance.toggleLike(track);
    HapticFeedback.mediumImpact();
    notifyListeners();
  }

  @override
  void toggleFavorite(Track track) => toggleLove(track);

  void clearError() {
    if (_lastError == null) return;
    _lastError = null;
    notifyListeners();
  }

  // ---- Volume ---------------------------------------------------------------------
  @override
  Future<void> setVolume(double v) async {
    final value = v.clamp(0.0, 1.0);
    volumeNotifier.value = value;
    if (_pausing || _isTransitioning) {
      return; // applied by the fade that follows
    }
    _rampToken++;
    await _applyVolume(value);
  }

  Future<void> _applyVolume(double v) async {
    _appliedVolume = v.clamp(0.0, 1.0);
    try {
      await _audioPlayer.setVolume(_appliedVolume);
    } catch (_) {}
  }

  /// Eased volume ramp. Returns false if a newer ramp / command cancelled it.
  Future<bool> _rampVolume(
    double to,
    Duration duration, {
    Curve curve = Curves.easeOutCubic,
  }) async {
    final token = ++_rampToken;
    final from = _appliedVolume;
    final ms = duration.inMilliseconds;
    if (ms <= 0) {
      await _applyVolume(to);
      return token == _rampToken;
    }
    final sw = Stopwatch()..start();
    while (true) {
      if (token != _rampToken) return false;
      final t = (sw.elapsedMilliseconds / ms).clamp(0.0, 1.0);
      await _applyVolume(from + (to - from) * curve.transform(t));
      if (t >= 1.0) return true;
      await Future<void>.delayed(const Duration(milliseconds: 16));
    }
  }

  // ---- Sleep timer ------------------------------------------------------------------
  void setSleepTimer(Duration after) {
    _clearSleep();
    _sleepEndsAt = DateTime.now().add(after);
    _sleepTimer = Timer(after, () async {
      _clearSleep();
      await pause(fade: const Duration(seconds: 4));
      notifyListeners();
    });
    notifyListeners();
  }

  void sleepAtEndOfCurrentTrack() {
    _clearSleep();
    _sleepAtEndOfTrack = true;
    notifyListeners();
  }

  void cancelSleepTimer() {
    _clearSleep();
    notifyListeners();
  }

  void _clearSleep() {
    _sleepTimer?.cancel();
    _sleepTimer = null;
    _sleepEndsAt = null;
    _sleepAtEndOfTrack = false;
  }

  // ---- Lyrics ---------------------------------------------------------------------
  Future<void> _loadLyricsForTrack(Track track, int token) async {
    _isLoadingLyrics = true;
    _lyricsLines = [];
    _lyricTimes = [];
    _lyricsSynced = false;
    lyricIndexNotifier.value = -1;
    notifyListeners();

    var lines = <Map<String, dynamic>>[];
    LyricsResult? lyricsRes;
    try {
      lyricsRes = await LyricsService.instance.fetchLyrics(track);
      if (token != _playToken) return; // a newer track took over
      if (lyricsRes != null && lyricsRes.lines.isNotEmpty) {
        lines = lyricsRes.lines;
      }
    } catch (_) {
      if (token != _playToken) return;
    }

    final synced =
        lyricsRes?.synced ??
        (lines.isNotEmpty &&
            lines.any((l) => (l['timeMs'] ?? l['startMs']) is num));
    if (synced) {
      lines.sort(
        (a, b) => (((a['timeMs'] ?? a['startMs']) ?? 0) as num).compareTo(
          ((b['timeMs'] ?? b['startMs']) ?? 0) as num,
        ),
      );
    }

    _lyricsLines = lines;
    _lyricsSynced = synced;
    _lyricTimes = synced
        ? lines
              .map((l) => (((l['timeMs'] ?? l['startMs']) ?? 0) as num).toInt())
              .toList()
        : <int>[];
    _isLoadingLyrics = false;
    _updateLyricIndex(positionNotifier.value);
    notifyListeners();
  }

  void _updateLyricIndex(Duration pos) {
    if (_lyricTimes.isEmpty) {
      lyricIndexNotifier.value = -1;
      return;
    }
    final ms = pos.inMilliseconds + _lyricLeadMs;
    var lo = 0, hi = _lyricTimes.length - 1, ans = -1;
    while (lo <= hi) {
      final mid = (lo + hi) >> 1;
      if (_lyricTimes[mid] <= ms) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    lyricIndexNotifier.value = ans; // ValueNotifier ignores unchanged values
  }

  // ---- Artwork accent ---------------------------------------------------------------
  Future<void> _resolveAccent(Track track, int token) async {
    final resolver = accentResolver;
    if (resolver == null) return;
    try {
      final color = await resolver(track);
      if (token == _playToken) accentColorNotifier.value = color;
    } catch (_) {}
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final isForeground = state == AppLifecycleState.resumed;
    unawaited(_audioPlayer.setLifecycle(isForeground));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final s in _subs) {
      s.cancel();
    }
    _sleepTimer?.cancel();
    _audioPlayer.dispose();
    positionNotifier.dispose();
    lyricIndexNotifier.dispose();
    scrubbingNotifier.dispose();
    volumeNotifier.dispose();
    expansionNotifier.dispose();
    accentColorNotifier.dispose();
    super.dispose();
  }
}
