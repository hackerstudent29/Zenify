import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class GallerySaveService {
  GallerySaveService._();
  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/story_share');

  /// Saves the specified image file directly into the device's Pictures/Zenify album.
  /// Scoped storage compliant on Android 10-15 without requiring runtime storage permissions.
  static Future<bool> saveImageToGallery(File imageFile, {String title = 'Zenify_Story'}) async {
    if (!imageFile.existsSync()) {
      debugPrint('[GallerySaveService] Image file does not exist: ${imageFile.path}');
      return false;
    }

    if (!Platform.isAndroid) {
      // Non-Android platforms return false gracefully
      debugPrint('[GallerySaveService] saveToGallery not supported on ${Platform.operatingSystem}');
      return false;
    }

    try {
      final bool? result = await _channel.invokeMethod<bool>('saveToGallery', {
        'filePath': imageFile.path,
        'title': title,
      });
      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint('[GallerySaveService] Platform exception: ${e.message}');
      return false;
    } catch (e) {
      debugPrint('[GallerySaveService] Error: $e');
      return false;
    }
  }
}

