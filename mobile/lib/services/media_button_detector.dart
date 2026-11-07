// lib/services/media_button_detector.dart
//
// Turns raw headset / Bluetooth "play-pause" key presses into gestures:
//   1 press  → play / pause
//   2 presses → next track
//   3 presses → previous track (restarts the song if it's past 3 s)
//   4 presses → like / unlike
// Everything is configurable via [MultiPressConfig]. Pure Dart, no plugins.

import 'dart:async';

enum PressAction {
  playPause,
  next,
  previous,
  restart,
  toggleFavorite,
  toggleShuffle,
  none,
}

class MultiPressConfig {
  const MultiPressConfig({
    this.window = const Duration(milliseconds: 360),
    this.maxPresses = 4,
    this.instantFirstPress = false,
    this.actions = const {
      1: PressAction.playPause,
      2: PressAction.next,
      3: PressAction.previous,
      4: PressAction.toggleFavorite,
    },
  });

  /// Max gap between presses that still counts as the same gesture.
  final Duration window;

  /// Presses after which the gesture resolves immediately (no more waiting).
  final int maxPresses;

  /// Zero-latency mode: the first press toggles play/pause right away. If more
  /// presses follow inside [window], the toggle is undone before the
  /// double/triple action runs. Costs a brief blip on multi-press; default off.
  final bool instantFirstPress;

  /// press count → action.
  final Map<int, PressAction> actions;

  PressAction actionFor(int presses) =>
      actions[presses.clamp(1, maxPresses)] ?? PressAction.none;
}

class MultiPressDetector {
  MultiPressDetector({
    required this.config,
    required this.onAction,
    this.isPlaying,
  });

  final MultiPressConfig config;
  final void Function(PressAction action) onAction;

  /// Needed only for [MultiPressConfig.instantFirstPress].
  final bool Function()? isPlaying;

  int _count = 0;
  bool _wasPlaying = false;
  Timer? _timer;

  /// Feed every raw "media" key press here.
  void press() {
    _count++;
    if (_count == 1 && config.instantFirstPress) {
      _wasPlaying = isPlaying?.call() ?? false;
      onAction(config.actionFor(1));
    }

    _timer?.cancel();
    if (_count >= config.maxPresses) {
      _resolve();
      return;
    }
    _timer = Timer(config.window, _resolve);
  }

  void _resolve() {
    _timer?.cancel();
    _timer = null;
    final presses = _count;
    _count = 0;
    if (presses == 0) return;

    if (config.instantFirstPress) {
      if (presses == 1) return; // already performed
      // Undo the optimistic toggle before running the multi-press action.
      final restoreNeeded = config.actionFor(1) == PressAction.playPause &&
          (isPlaying?.call() ?? _wasPlaying) != _wasPlaying;
      if (restoreNeeded) onAction(PressAction.playPause);
    }
    onAction(config.actionFor(presses));
  }

  void dispose() {
    _timer?.cancel();
    _timer = null;
    _count = 0;
  }
}
