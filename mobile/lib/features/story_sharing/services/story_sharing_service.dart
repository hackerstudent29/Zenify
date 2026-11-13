import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

enum StoryShareTarget {
  instagram,
  facebook,
  whatsapp,
  system,
}

class StorySharingService {
  StorySharingService._();
  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/story_share');

  /// Check whether a package is installed (Android only).
  static Future<bool> isAppInstalled(String packageName) async {
    if (!Platform.isAndroid) return false;
    try {
      final bool? result = await _channel.invokeMethod<bool>('isAppInstalled', {
        'packageName': packageName,
      });
      return result ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> isInstagramInstalled() => isAppInstalled('com.instagram.android');
  static Future<bool> isFacebookInstalled() => isAppInstalled('com.facebook.katana');
  static Future<bool> isWhatsAppInstalled() async {
    final wa = await isAppInstalled('com.whatsapp');
    if (wa) return true;
    return isAppInstalled('com.whatsapp.w4b');
  }

  /// Shares image to Instagram Stories.
  /// Falls back to system share sheet if Instagram is not installed or channel fails.
  static Future<bool> shareToInstagram(
    File imageFile, {
    Color? topColor,
    Color? bottomColor,
    String? fallbackText,
  }) async {
    if (!imageFile.existsSync()) return false;

    if (Platform.isAndroid) {
      final isInstalled = await isInstagramInstalled();
      if (isInstalled) {
        try {
          String? hexTop;
          String? hexBottom;
          if (topColor != null) {
            hexTop = '#${topColor.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
          }
          if (bottomColor != null) {
            hexBottom = '#${bottomColor.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
          }

          final bool? success = await _channel.invokeMethod<bool>('shareToInstagramStory', {
            'filePath': imageFile.path,
            'topBackgroundColor': hexTop,
            'bottomBackgroundColor': hexBottom,
          });
          if (success == true) return true;
        } catch (e) {
          debugPrint('[StorySharingService] Instagram native story share error: $e');
        }
      }
    }

    // Fallback to system share sheet
    return shareToSystem(imageFile, text: fallbackText);
  }

  /// Shares image to Facebook Stories.
  /// If [appId] is absent, uses direct Facebook image intent or system share sheet.
  static Future<bool> shareToFacebook(
    File imageFile, {
    String? appId,
    String? fallbackText,
  }) async {
    if (!imageFile.existsSync()) return false;

    if (Platform.isAndroid) {
      final isInstalled = await isFacebookInstalled();
      if (isInstalled) {
        try {
          final bool? success = await _channel.invokeMethod<bool>('shareToFacebookStory', {
            'filePath': imageFile.path,
            'appId': appId,
          });
          if (success == true) return true;
        } catch (e) {
          debugPrint('[StorySharingService] Facebook story share error: $e');
        }
      }
    }

    return shareToSystem(imageFile, text: fallbackText);
  }

  /// Shares image to WhatsApp directly.
  static Future<bool> shareToWhatsApp(File imageFile, {String? text}) async {
    if (!imageFile.existsSync()) return false;

    if (Platform.isAndroid) {
      final isInstalled = await isWhatsAppInstalled();
      if (isInstalled) {
        try {
          final bool? success = await _channel.invokeMethod<bool>('shareToWhatsApp', {
            'filePath': imageFile.path,
            'text': text,
          });
          if (success == true) return true;
        } catch (e) {
          debugPrint('[StorySharingService] WhatsApp share error: $e');
        }
      }
    }

    return shareToSystem(imageFile, text: text);
  }

  /// Shares image via system share sheet (share_plus).
  static Future<bool> shareToSystem(File imageFile, {String? text}) async {
    if (!imageFile.existsSync()) return false;
    try {
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(imageFile.path, mimeType: 'image/png')],
          text: text,
        ),
      );
      return true;
    } catch (e) {
      debugPrint('[StorySharingService] System share error: $e');
      return false;
    }
  }
}

