import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class AudioFxNative {
  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/audio_fx');

  static Future<void> setEq3({
    required double bass,
    required double mid,
    required double treble,
  }) async {
    try {
      await _channel.invokeMethod('setEq3', {
        'bass': bass,
        'mid': mid,
        'treble': treble,
      });
    } catch (e) {
      if (kDebugMode) debugPrint('[AudioFxNative] setEq3 failed: $e');
    }
  }

  static Future<void> setBassBoost(int strength) async {
    try {
      await _channel.invokeMethod('setBassBoost', {'strength': strength.clamp(0, 1000)});
    } catch (e) {
      if (kDebugMode) debugPrint('[AudioFxNative] setBassBoost failed: $e');
    }
  }

  static Future<void> setVirtualizer(int strength) async {
    try {
      await _channel.invokeMethod('setVirtualizer', {'strength': strength.clamp(0, 1000)});
    } catch (e) {
      if (kDebugMode) debugPrint('[AudioFxNative] setVirtualizer failed: $e');
    }
  }

  static Future<void> setReverb(String preset) async {
    try {
      await _channel.invokeMethod('setReverb', {'preset': preset});
    } catch (e) {
      if (kDebugMode) debugPrint('[AudioFxNative] setReverb failed: $e');
    }
  }

  static Future<void> setBypass(bool bypassed) async {
    try {
      await _channel.invokeMethod('setBypass', {'bypassed': bypassed});
    } catch (e) {
      if (kDebugMode) debugPrint('[AudioFxNative] setBypass failed: $e');
    }
  }
}
