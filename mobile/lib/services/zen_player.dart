import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'studio_fx_state.dart';

/// Drop-in replacement for the small part of `audioplayers` that PlayerState
/// uses. In player_state.dart change only the import:
///
///   import 'package:audioplayers/audioplayers.dart' as ap;
///   ->
///   import 'zen_player.dart' as ap;
///
/// Playback runs in a native ExoPlayer whose audio path goes through the
/// Studio FX DSP (EQ, reverb, echo, chorus, 8D, vocal isolator, ...).
enum PlayerState { stopped, playing, paused, completed, disposed }

class UrlSource {
  const UrlSource(this.url, {this.headers = const {}});
  final String url;
  final Map<String, String> headers;
}

class AudioPlayer implements FxEngine {
  AudioPlayer() {
    _sub = _events.receiveBroadcastStream().listen(_onEvent, onError: (_) {});
  }

  static const MethodChannel _method = MethodChannel('zenify/audio');
  static const EventChannel _events = EventChannel('zenify/audio/events');
  static const EventChannel _spectrumCh = EventChannel('zenify/audio/spectrum');

  StreamSubscription<dynamic>? _sub;
  PlayerState _state = PlayerState.stopped;

  final _stateC = StreamController<PlayerState>.broadcast();
  final _bufferingC = StreamController<bool>.broadcast();
  final _posC = StreamController<Duration>.broadcast();
  final _durC = StreamController<Duration>.broadcast();
  final _doneC = StreamController<void>.broadcast();
  final _autoTransitionC = StreamController<String>.broadcast();
  final _errorC = StreamController<String>.broadcast();
  final _videoSizeC = StreamController<({int width, int height})>.broadcast();

  Stream<PlayerState> get onPlayerStateChanged => _stateC.stream;
  Stream<bool> get onBufferingChanged => _bufferingC.stream;
  Stream<Duration> get onPositionChanged => _posC.stream;
  Stream<Duration> get onDurationChanged => _durC.stream;
  Stream<void> get onPlayerComplete => _doneC.stream;
  Stream<String> get onAutoTransition => _autoTransitionC.stream;
  Stream<String> get onError => _errorC.stream;
  Stream<({int width, int height})> get onVideoSizeChanged => _videoSizeC.stream;
  PlayerState get state => _state;

  void _onEvent(dynamic e) {
    if (e is! Map) return;
    switch (e['type']) {
      case 'autoTransition':
        final id = e['mediaId'] as String? ?? '';
        _autoTransitionC.add(id);
      case 'state':
        final s = switch (e['value']) {
          'playing' => PlayerState.playing,
          'paused' => PlayerState.paused,
          'completed' => PlayerState.completed,
          _ => PlayerState.stopped,
        };
        _state = s;
        _stateC.add(s);
        if (e['buffering'] is bool) {
          _bufferingC.add(e['buffering'] as bool);
        }
        if (s == PlayerState.completed) _doneC.add(null);
      case 'position':
        _posC.add(Duration(milliseconds: (e['ms'] as num).toInt()));
      case 'duration':
        _durC.add(Duration(milliseconds: (e['ms'] as num).toInt()));
      case 'resolved':
        if (kDebugMode) {
          final ldb = e['loudnessDb'];
          final ldbStr = ldb != null ? ' loudness=${ldb}dB' : '';
          debugPrint('ZenPlayer: resolved ${e['id']} via client ${e['client']} in ${e['ms']}ms (fromCache=${e['fromCache']})$ldbStr');
        }
      case 'error':
        final errMsg = e['message']?.toString() ?? e['kind']?.toString() ?? 'playback error';
        if (kDebugMode) debugPrint('ZenPlayer error: $errMsg');
        _state = PlayerState.stopped;
        _stateC.add(_state);
        _errorC.add(errMsg);
      case 'videoSize':
        final w = (e['width'] as num?)?.toInt() ?? 0;
        final h = (e['height'] as num?)?.toInt() ?? 0;
        _videoSizeC.add((width: w, height: h));
    }
  }

  Future<void> _call(String m, [Object? args]) async {
    try {
      await _method.invokeMethod<void>(m, args);
    } on MissingPluginException {
      if (kDebugMode) debugPrint('ZenPlayer: native engine missing (Android only). Call: $m');
    }
  }

  Future<void> playMedia({
    required String mediaId,
    String? title,
    String? artist,
    String? artworkUrl,
    int? startMs,
    double? loudnessDb,
    bool isVideo = false,
  }) {
    final args = <String, dynamic>{
      'mediaId': mediaId.replaceFirst('yt-', '').trim(),
      'title': title ?? '',
      'artist': artist ?? '',
      'artworkUrl': artworkUrl ?? '',
      'startMs': startMs,
      'isVideo': isVideo,
    };
    if (loudnessDb != null) {
      args['loudnessDb'] = loudnessDb;
    }
    return _call('play', args);
  }

  Future<void> setLoudnessDb(double? db) =>
      _call('setLoudnessDb', {'loudnessDb': db});

  Future<void> setNext(
    String? mediaId, {
    String? title,
    String? artist,
    String? artworkUrl,
    bool isVideo = false,
  }) =>
      _call('setNext', {
        'mediaId': mediaId?.replaceFirst('yt-', '').trim(),
        'title': title ?? '',
        'artist': artist ?? '',
        'artworkUrl': artworkUrl ?? '',
        'isVideo': isVideo,
      });

  Future<int?> getVideoTextureId() async {
    try {
      return await _method.invokeMethod<int>('getVideoTextureId');
    } on MissingPluginException {
      return null;
    }
  }

  Future<void> releaseVideoSurface() => _call('releaseVideoSurface');

  Future<void> playUrl({
    required String url,
    String? videoUrl,
    Map<String, String>? headers,
    String? title,
    String? artist,
    String? artworkUrl,
    int? startMs,
    double? loudnessDb,
    bool isVideo = false,
  }) =>
      _call('play', {
        'url': url,
        'videoUrl': ?videoUrl,
        'headers': ?headers,
        'title': ?title,
        'artist': ?artist,
        'artworkUrl': ?artworkUrl,
        'startMs': ?startMs,
        'loudnessDb': ?loudnessDb,
        'isVideo': isVideo,
      });

  Future<void> prefetch(List<String> mediaIds) =>
      _call('prefetch', {'mediaIds': mediaIds.map((id) => id.replaceFirst('yt-', '').trim()).toList()});

  Future<void> prewarm() => _call('prewarm');

  Future<void> clearAllCaches() => _call('clearAllCaches');

  Future<void> play(UrlSource source) =>
      _call('play', {'url': source.url, 'headers': source.headers});
  Future<void> pause() => _call('pause');
  Future<void> resume() => _call('resume');
  Future<void> stop() => _call('stop');
  Future<void> seek(Duration p) => _call('seek', {'ms': p.inMilliseconds});
  Future<void> setVolume(double v) => _call('setVolume', {'v': v});
  Future<void> setPlaybackRate(double rate) => _call('setFx', {'speed': rate});
  Future<void> setBalance(double balance) async {}
  Future<void> setLifecycle(bool isForeground) =>
      _call('setLifecycle', {'isForeground': isForeground});

  Future<void> dispose() async {
    _state = PlayerState.disposed;
    _fxTimer?.cancel();
    await _sub?.cancel();
    await _call('dispose');
    for (final c in [_stateC, _bufferingC, _posC, _durC, _errorC, _autoTransitionC, _videoSizeC]) {
      await c.close();
    }
    await _doneC.close();
  }

  // ---- FxEngine --------------------------------------------------------------
  Timer? _fxTimer;
  FxMap? _pendingFx;

  @override
  bool get isAvailable => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Latest-wins throttle (about 60 Hz) so dragging sliders never floods the channel.
  @override
  void applyFx(FxMap fx) {
    _pendingFx = fx;
    _fxTimer ??= Timer(const Duration(milliseconds: 16), () {
      _fxTimer = null;
      final p = _pendingFx;
      _pendingFx = null;
      if (p != null) unawaited(_call('setFx', p));
    });
  }

  @override
  Stream<List<double>> get spectrum => _spectrumCh
      .receiveBroadcastStream()
      .map((e) => (e as List).map((x) => (x as num).toDouble()).toList());
}
