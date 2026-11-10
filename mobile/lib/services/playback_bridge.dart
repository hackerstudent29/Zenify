// lib/services/playback_bridge.dart
//
// The ONE seam between your audio engine (PlayerState) and everything new:
// the audio_service handler (notification / headset buttons) and the Apple
// Music style UI. Make PlayerState `implements PlaybackBridge` (it already is
// a ChangeNotifier, so addListener/removeListener come for free).

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/playback_context.dart';
import '../models/track.dart';

export '../models/playback_context.dart' show RepeatMode, AdvanceReason, PlaybackContext, PlaybackContextType;

abstract class PlaybackBridge implements Listenable {
  Track? get currentTrack;
  bool get isPlaying;
  bool get isBuffering;
  Duration get duration;

  /// High-frequency position. Keep it OUT of notifyListeners() so the UI
  /// doesn't rebuild 20×/s: update this ValueNotifier instead.
  ValueListenable<Duration> get position;

  bool get shuffle;
  RepeatMode get repeat;
  bool get hasNext;
  bool get hasPrevious;
  double get volume; // 0..1

  bool isFavorite(Track track);

  Future<void> play();
  Future<void> pause();
  Future<void> togglePlayPause();
  Future<void> next();
  Future<void> previous();
  Future<void> seek(Duration position);

  void toggleShuffle();
  void cycleRepeat();
  void toggleFavorite(Track track);
  void setVolume(double value);
}

/// Fake engine so you can preview the UI before wiring PlayerState:
///   NowPlayingScreen(bridge: DemoPlaybackBridge())
class DemoPlaybackBridge extends ChangeNotifier implements PlaybackBridge {
  DemoPlaybackBridge() {
    _timer = Timer.periodic(const Duration(milliseconds: 250), _tick);
  }

  static final List<Track> _queue = [
    Track(
      id: 'demo-1',
      title: 'Neela Nira',
      artist: 'Demo Artist',
      album: 'Preview',
      coverUrl: '',
      durationSeconds: 215,
    ),
    Track(
      id: 'demo-2',
      title: 'Midnight Melody',
      artist: 'Another Artist',
      album: 'Single',
      coverUrl: '',
      durationSeconds: 189,
    ),
  ];

  Timer? _timer;
  int _index = 0;
  bool _playing = true;
  bool _shuffle = false;
  RepeatMode _repeat = RepeatMode.off;
  double _volume = 0.7;
  final Set<String> _favorites = {};
  final ValueNotifier<Duration> _position = ValueNotifier(Duration.zero);

  void _tick(Timer _) {
    if (!_playing) return;
    final next = _position.value + const Duration(milliseconds: 250);
    if (next >= duration) {
      _position.value = Duration.zero;
      if (_repeat != RepeatMode.one) _index = (_index + 1) % _queue.length;
      notifyListeners();
    } else {
      _position.value = next;
    }
  }

  @override
  Track? get currentTrack => _queue[_index];
  @override
  bool get isPlaying => _playing;
  @override
  bool get isBuffering => false;
  @override
  Duration get duration => Duration(seconds: _queue[_index].durationSeconds);
  @override
  ValueListenable<Duration> get position => _position;
  @override
  bool get shuffle => _shuffle;
  @override
  RepeatMode get repeat => _repeat;
  @override
  bool get hasNext => true;
  @override
  bool get hasPrevious => true;
  @override
  double get volume => _volume;

  @override
  bool isFavorite(Track track) => _favorites.contains(track.id);

  @override
  Future<void> play() async {
    _playing = true;
    notifyListeners();
  }

  @override
  Future<void> pause() async {
    _playing = false;
    notifyListeners();
  }

  @override
  Future<void> togglePlayPause() => _playing ? pause() : play();

  @override
  Future<void> next() async {
    _index = (_index + 1) % _queue.length;
    _position.value = Duration.zero;
    notifyListeners();
  }

  @override
  Future<void> previous() async {
    _index = (_index - 1 + _queue.length) % _queue.length;
    _position.value = Duration.zero;
    notifyListeners();
  }

  @override
  Future<void> seek(Duration position) async {
    _position.value = position;
    notifyListeners();
  }

  @override
  void toggleShuffle() {
    _shuffle = !_shuffle;
    notifyListeners();
  }

  @override
  void cycleRepeat() {
    _repeat = RepeatMode.values[(_repeat.index + 1) % RepeatMode.values.length];
    notifyListeners();
  }

  @override
  void toggleFavorite(Track track) {
    if (!_favorites.remove(track.id)) _favorites.add(track.id);
    notifyListeners();
  }

  @override
  void setVolume(double value) {
    _volume = value.clamp(0.0, 1.0);
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _position.dispose();
    super.dispose();
  }
}
