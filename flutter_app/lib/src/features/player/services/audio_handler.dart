import 'dart:async';
import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';
import '../../../core/api/api_client.dart';

Future<AudioHandler> initAudioService() async {
  return await AudioService.init(
    builder: () => MyAudioHandler(),
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.zenify.audio',
      androidNotificationChannelName: 'Zenify Audio Playback',
      androidNotificationOngoing: true,
      androidStopForegroundOnPause: true,
    ),
  );
}

class QueueState {
  final List<MediaItem> queue;
  final int queueIndex;
  QueueState({required this.queue, required this.queueIndex});
}

class MyAudioHandler extends BaseAudioHandler with SeekHandler {
  final _player = AudioPlayer();

  MyAudioHandler() {
    // Initialize queue with an empty list
    queue.add([]);

    _player.playbackEventStream.listen((event) {
      final playing = _player.playing;
      playbackState.add(playbackState.value.copyWith(
        controls: [
          MediaControl.skipToPrevious,
          if (playing) MediaControl.pause else MediaControl.play,
          MediaControl.stop,
          MediaControl.skipToNext,
        ],
        systemActions: const {
          MediaAction.seek,
          MediaAction.seekForward,
          MediaAction.seekBackward,
        },
        androidCompactActionIndices: const [0, 1, 3],
        processingState: const {
          ProcessingState.idle: AudioProcessingState.idle,
          ProcessingState.loading: AudioProcessingState.loading,
          ProcessingState.buffering: AudioProcessingState.buffering,
          ProcessingState.ready: AudioProcessingState.ready,
          ProcessingState.completed: AudioProcessingState.completed,
        }[_player.processingState]!,
        playing: playing,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: _player.speed,
        queueIndex: event.currentIndex,
      ));
    });

    _player.durationStream.listen((duration) {
      if (duration != null && mediaItem.value != null) {
        mediaItem.add(mediaItem.value!.copyWith(duration: duration));
      }
    });

    // Listen for song completion to play next automatically
    _player.processingStateStream.listen((state) {
      if (state == ProcessingState.completed) {
        skipToNext();
      }
    });
  }

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  @override
  Future<void> stop() async {
    await _player.stop();
    return super.stop();
  }

  // Expose a combined stream of the queue and the current playing item index
  Stream<QueueState> get queueState {
    final controller = StreamController<QueueState>.broadcast();
    void update() {
      if (controller.isClosed) return;
      final currentQueue = queue.value;
      final currentItem = mediaItem.value;
      final index = currentItem == null ? -1 : currentQueue.indexWhere((item) => item.id == currentItem.id);
      controller.add(QueueState(queue: currentQueue, queueIndex: index));
    }
    queue.listen((_) => update());
    mediaItem.listen((_) => update());
    update();
    return controller.stream;
  }

  AudioPlayer get player => _player;

  // Load and play a specific track
  Future<void> loadAndPlayTrack(String url, MediaItem item) async {
    mediaItem.add(item);
    
    try {
      if (url.startsWith('/') || url.startsWith('file://') || url.contains('/storage/')) {
        print('Loading local audio file: $url');
        final cleanPath = url.startsWith('file://') ? url.substring(7) : url;
        await _player.setAudioSource(AudioSource.file(cleanPath));
      } else {
        // Use the proxied URL to bypass CORS and resolve relative links
        final proxiedUrl = getProxiedAudioUrl(url);
        print('Loading audio from proxied URL: $proxiedUrl');
        await _player.setAudioSource(AudioSource.uri(Uri.parse(proxiedUrl)));
      }
      await play();
    } catch (e) {
      print('Error loading audio source: $e');
      await _player.stop();
    }
  }

  // Play with a new queue and play the item at initialIndex
  Future<void> playWithQueue(List<MediaItem> newQueue, int initialIndex) async {
    queue.add(newQueue);
    if (initialIndex >= 0 && initialIndex < newQueue.length) {
      final item = newQueue[initialIndex];
      final audioUrl = item.extras?['audioUrl'] as String?;
      if (audioUrl != null) {
        await loadAndPlayTrack(audioUrl, item);
      }
    }
  }

  @override
  Future<void> setSpeed(double speed) => _player.setSpeed(speed);

  @override
  Future<dynamic> customAction(String name, [Map<String, dynamic>? extras]) async {
    if (name == 'setPitch') {
      final pitch = extras?['pitch'] as double?;
      if (pitch != null) {
        await _player.setPitch(pitch);
      }
    } else if (name == 'setSpeed') {
      final speed = extras?['speed'] as double?;
      if (speed != null) {
        await _player.setSpeed(speed);
      }
    }
    return super.customAction(name, extras);
  }

  @override
  Future<void> skipToNext() async {
    final currentQueue = queue.value;
    if (currentQueue.isEmpty) return;
    final currentItem = mediaItem.value;
    if (currentItem == null) return;
    final currentIndex = currentQueue.indexWhere((item) => item.id == currentItem.id);
    final nextIndex = currentIndex + 1;
    if (nextIndex < currentQueue.length) {
      final nextItem = currentQueue[nextIndex];
      final audioUrl = nextItem.extras?['audioUrl'] as String?;
      if (audioUrl != null) {
        await loadAndPlayTrack(audioUrl, nextItem);
      }
    }
  }

  @override
  Future<void> skipToPrevious() async {
    final currentQueue = queue.value;
    if (currentQueue.isEmpty) return;
    final currentItem = mediaItem.value;
    if (currentItem == null) return;
    final currentIndex = currentQueue.indexWhere((item) => item.id == currentItem.id);
    final prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      final prevItem = currentQueue[prevIndex];
      final audioUrl = prevItem.extras?['audioUrl'] as String?;
      if (audioUrl != null) {
        await loadAndPlayTrack(audioUrl, prevItem);
      }
    }
  }

  @override
  Future<void> skipToQueueItem(int index) async {
    final currentQueue = queue.value;
    if (index >= 0 && index < currentQueue.length) {
      final nextItem = currentQueue[index];
      final audioUrl = nextItem.extras?['audioUrl'] as String?;
      if (audioUrl != null) {
        await loadAndPlayTrack(audioUrl, nextItem);
      }
    }
  }
}
