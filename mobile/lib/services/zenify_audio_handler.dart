// lib/services/zenify_audio_handler.dart
//
// Connects PlaybackBridge to the OS: media notification, lock screen,
// Control Center (iOS), Bluetooth / headset buttons, Android Auto, watches.
//
// pubspec.yaml:   audio_service: ^0.18.15   (any 0.18.x)
//
// main.dart:
//   final handler = await initZenifyAudioService(playerState);
// (PlayerState must `implements PlaybackBridge`, see playback_bridge.dart.)

import 'dart:async';
import 'dart:ui' show Color;

import 'package:audio_service/audio_service.dart';

import 'media_button_detector.dart';
import 'playback_bridge.dart';

Future<ZenifyAudioHandler> initZenifyAudioService(
  PlaybackBridge bridge, {
  MultiPressConfig pressConfig = const MultiPressConfig(),
}) {
  return AudioService.init(
    builder: () => ZenifyAudioHandler(bridge, pressConfig: pressConfig),
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.zenify.mobile.playback',
      androidNotificationChannelName: 'Now Playing',
      androidNotificationChannelDescription: 'Playback controls',
      androidNotificationIcon: 'drawable/zen_ic_notification',
      androidShowNotificationBadge: false,
      androidNotificationOngoing: true,
      androidStopForegroundOnPause: true,
      notificationColor: Color(0xFFFF375F), // rose accent tints the card
      artDownscaleWidth: 600,
      artDownscaleHeight: 600,
      fastForwardInterval: Duration(seconds: 10),
      rewindInterval: Duration(seconds: 10),
    ),
  );
}

typedef _Snap = ({
  String? id,
  bool playing,
  bool buffering,
  bool favorite,
  bool shuffle,
  RepeatMode repeat,
  int durationMs,
  bool hasNext,
  bool hasPrevious,
});

class ZenifyAudioHandler extends BaseAudioHandler with SeekHandler {
  ZenifyAudioHandler(
    this._bridge, {
    MultiPressConfig pressConfig = const MultiPressConfig(),
  }) {
    _detector = MultiPressDetector(
      config: pressConfig,
      onAction: _runPressAction,
      isPlaying: () => _bridge.isPlaying,
    );
    _bridge.addListener(_onBridgeChanged);
    _bridge.position.addListener(_onPosition);
    _onBridgeChanged(); // publish initial state
  }

  final PlaybackBridge _bridge;
  late final MultiPressDetector _detector;
  _Snap? _last;

  // ───────────────────────── Bridge → OS ─────────────────────────

  _Snap _snapshot() {
    final t = _bridge.currentTrack;
    return (
      id: t?.id,
      playing: _bridge.isPlaying,
      buffering: _bridge.isBuffering,
      favorite: t != null && _bridge.isFavorite(t),
      shuffle: _bridge.shuffle,
      repeat: _bridge.repeat,
      durationMs: _bridge.duration.inMilliseconds,
      hasNext: _bridge.hasNext,
      hasPrevious: _bridge.hasPrevious,
    );
  }

  /// Only publishes when something the OS cares about actually changed.
  void _onBridgeChanged() {
    final snap = _snapshot();
    if (snap == _last) return;
    final trackChanged =
        snap.id != _last?.id || snap.durationMs != _last?.durationMs;
    _last = snap;
    if (trackChanged) _publishMediaItem();
    _publishState();
  }

  void _publishMediaItem() {
    final t = _bridge.currentTrack;
    if (t == null) {
      mediaItem.add(null);
      return;
    }
    mediaItem.add(MediaItem(
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      artUri: Uri.tryParse(t.coverUrl),
      duration: _bridge.duration,
      extras: {'source': t.source},
    ));
  }

  void _publishState() {
    final s = _last ?? _snapshot();
    final pos = _bridge.position.value;
    final hasTrack = s.id != null;

    playbackState.add(PlaybackState(
      controls: [
        const MediaControl(
          androidIcon: 'drawable/zen_ic_prev',
          label: 'Previous',
          action: MediaAction.skipToPrevious,
        ),
        s.playing
            ? const MediaControl(
                androidIcon: 'drawable/zen_ic_pause',
                label: 'Pause',
                action: MediaAction.pause,
              )
            : const MediaControl(
                androidIcon: 'drawable/zen_ic_play',
                label: 'Play',
                action: MediaAction.play,
              ),
        const MediaControl(
          androidIcon: 'drawable/zen_ic_next',
          label: 'Next',
          action: MediaAction.skipToNext,
        ),
        MediaControl.custom(
          androidIcon: s.favorite
              ? 'drawable/zen_ic_heart_fill'
              : 'drawable/zen_ic_heart',
          label: s.favorite ? 'Unlike' : 'Like',
          name: 'toggleFavorite',
        ),
      ],
      systemActions: const {
        MediaAction.play,
        MediaAction.pause,
        MediaAction.skipToNext,
        MediaAction.skipToPrevious,
        MediaAction.seek,
        MediaAction.setShuffleMode,
        MediaAction.setRepeatMode,
      },
      androidCompactActionIndices: const [0, 1, 2],
      processingState: !hasTrack
          ? AudioProcessingState.idle
          : (s.buffering
              ? AudioProcessingState.buffering
              : AudioProcessingState.ready),
      playing: s.playing,
      updatePosition: pos,
      bufferedPosition: pos,
      speed: s.playing ? 1.0 : 0.0,
      shuffleMode:
          s.shuffle ? AudioServiceShuffleMode.all : AudioServiceShuffleMode.none,
      repeatMode: switch (s.repeat) {
        RepeatMode.off => AudioServiceRepeatMode.none,
        RepeatMode.all => AudioServiceRepeatMode.all,
        RepeatMode.one => AudioServiceRepeatMode.one,
      },
    ));
  }

  /// The OS extrapolates the position itself, so we only re-publish when the
  /// real position drifts (user seeked) — never on every tick.
  void _onPosition() {
    final state = playbackState.valueOrNull;
    if (state == null || _last?.id == null) return;
    final drift = (_bridge.position.value - state.position).abs();
    if (drift > const Duration(milliseconds: 1200)) _publishState();
  }

  // ───────────────────────── OS → Bridge ─────────────────────────

  @override
  Future<void> play() => _bridge.play();

  @override
  Future<void> pause() => _bridge.pause();

  @override
  Future<void> stop() => _bridge.pause();

  @override
  Future<void> skipToNext() => _bridge.next();

  /// Apple behaviour: past 3 s restarts the song, otherwise goes back.
  @override
  Future<void> skipToPrevious() => _smartPrevious();

  @override
  Future<void> seek(Duration position) => _bridge.seek(position);

  @override
  Future<void> setShuffleMode(AudioServiceShuffleMode shuffleMode) async {
    final want = shuffleMode != AudioServiceShuffleMode.none;
    if (want != _bridge.shuffle) _bridge.toggleShuffle();
  }

  @override
  Future<void> setRepeatMode(AudioServiceRepeatMode repeatMode) async {
    final want = switch (repeatMode) {
      AudioServiceRepeatMode.none => RepeatMode.off,
      AudioServiceRepeatMode.one => RepeatMode.one,
      _ => RepeatMode.all,
    };
    for (var i = 0; i < 3 && _bridge.repeat != want; i++) {
      _bridge.cycleRepeat();
    }
  }

  @override
  Future<dynamic> customAction(String name, [Map<String, dynamic>? extras]) async {
    if (name == 'toggleFavorite') _toggleFavorite();
  }

  /// Headset / Bluetooth buttons. `media` is the ambiguous play-pause key and
  /// goes through the multi-press detector; dedicated next/previous keys (sent
  /// directly by many headsets and cars) are executed as-is.
  @override
  Future<void> click([MediaButton button = MediaButton.media]) async {
    switch (button) {
      case MediaButton.media:
        _detector.press();
      case MediaButton.next:
        await skipToNext();
      case MediaButton.previous:
        await skipToPrevious();
    }
  }

  // ───────────────────────── Actions ─────────────────────────

  Future<void> _smartPrevious() async {
    if (_bridge.position.value > const Duration(seconds: 3) ||
        !_bridge.hasPrevious) {
      await _bridge.seek(Duration.zero);
    } else {
      await _bridge.previous();
    }
  }

  void _toggleFavorite() {
    final t = _bridge.currentTrack;
    if (t != null) _bridge.toggleFavorite(t);
  }

  void _runPressAction(PressAction action) {
    switch (action) {
      case PressAction.playPause:
        _bridge.togglePlayPause();
      case PressAction.next:
        _bridge.next();
      case PressAction.previous:
        _smartPrevious();
      case PressAction.restart:
        _bridge.seek(Duration.zero);
      case PressAction.toggleFavorite:
        _toggleFavorite();
      case PressAction.toggleShuffle:
        _bridge.toggleShuffle();
      case PressAction.none:
        break;
    }
  }

  /// Call if you ever tear the handler down manually.
  void disposeHandler() {
    _bridge.removeListener(_onBridgeChanged);
    _bridge.position.removeListener(_onPosition);
    _detector.dispose();
  }
}
