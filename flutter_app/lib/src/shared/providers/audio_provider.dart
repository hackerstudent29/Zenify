import 'package:audio_service/audio_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Provider that will be overridden in main.dart after initialization
final audioHandlerProvider = Provider<AudioHandler>((ref) {
  throw UnimplementedError('audioHandlerProvider not initialized');
});
