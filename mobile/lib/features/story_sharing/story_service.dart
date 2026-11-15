import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

// ═════════════════════════════════════════════════════════════════════════════
// 1. ARTWORK PALETTE SERVICE
// ═════════════════════════════════════════════════════════════════════════════

class ArtworkPalette {
  const ArtworkPalette({
    required this.primary,
    required this.secondary,
    required this.accent,
    required this.background,
  });

  final Color primary;
  final Color secondary;
  final Color accent;
  final Color background;

  List<Color> toList() => [primary, secondary, accent, background];

  static const defaultPalette = ArtworkPalette(
    primary: Color(0xFFE11D48), // Radiant Crimson
    secondary: Color(0xFF9E2339), // Academic Maroon
    accent: Color(0xFF6366F1), // Indigo
    background: Color(0xFF121214), // Charcoal
  );
}

class ArtworkPaletteService {
  ArtworkPaletteService._();
  static final ArtworkPaletteService instance = ArtworkPaletteService._();

  final Map<String, ArtworkPalette> _cache = {};

  ArtworkPalette getCachedOrFallback(String? key) {
    if (key == null || key.isEmpty) return ArtworkPalette.defaultPalette;
    return _cache[key] ?? ArtworkPalette.defaultPalette;
  }

  Future<ArtworkPalette> extractPalette(String? coverUrl, {String? cacheKey}) async {
    final key = cacheKey ?? coverUrl ?? '';
    if (key.isEmpty) return ArtworkPalette.defaultPalette;
    if (_cache.containsKey(key)) return _cache[key]!;

    try {
      final ImageProvider provider = coverUrl != null && coverUrl.startsWith('http')
          ? CachedNetworkImageProvider(coverUrl)
          : (coverUrl != null && coverUrl.startsWith('assets/')
              ? AssetImage(coverUrl) as ImageProvider
              : const AssetImage('assets/images/z_logo.png'));

      final palette = await _extractFromProvider(provider);
      _cache[key] = palette;
      return palette;
    } catch (_) {
      final fallback = _deterministicPalette(key);
      _cache[key] = fallback;
      return fallback;
    }
  }

  Future<ArtworkPalette> _extractFromProvider(ImageProvider provider) async {
    final completer = Completer<ui.Image>();
    final stream = provider.resolve(ImageConfiguration.empty);
    late ImageStreamListener listener;

    listener = ImageStreamListener(
      (frame, _) {
        if (!completer.isCompleted) completer.complete(frame.image);
      },
      onError: (err, _) {
        if (!completer.isCompleted) completer.completeError(err);
      },
    );

    stream.addListener(listener);
    final ui.Image image;
    try {
      image = await completer.future.timeout(const Duration(milliseconds: 1200));
    } finally {
      stream.removeListener(listener);
    }

    // Downscale to a tiny thumbnail for instant sampling
    const sampleSize = 24.0;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      const Rect.fromLTWH(0, 0, sampleSize, sampleSize),
      Paint()..filterQuality = FilterQuality.low,
    );
    final small = await recorder.endRecording().toImage(sampleSize.toInt(), sampleSize.toInt());
    final ByteData? byteData = await small.toByteData(format: ui.ImageByteFormat.rawRgba);
    small.dispose();

    if (byteData == null) return ArtworkPalette.defaultPalette;

    final bytes = byteData.buffer.asUint8List();

    // Hue-bucketed sampling: finds the artwork's two most distinct, vivid hues
    // instead of a single saturated outlier pixel.
    const buckets = 12;
    final weight = List<double>.filled(buckets, 0);
    final rs = List<double>.filled(buckets, 0);
    final gs = List<double>.filled(buckets, 0);
    final bs = List<double>.filled(buckets, 0);
    double rSum = 0, gSum = 0, bSum = 0;
    final pixelCount = bytes.length ~/ 4;

    for (int i = 0; i < bytes.length; i += 4) {
      final r = bytes[i], g = bytes[i + 1], b = bytes[i + 2];
      rSum += r;
      gSum += g;
      bSum += b;
      final hsv = HSVColor.fromColor(Color.fromARGB(255, r, g, b));
      // Ignore near-black / near-white / grey pixels for the accent hues.
      final w = hsv.saturation * hsv.value * (hsv.value > 0.18 && hsv.value < 0.98 ? 1.0 : 0.0);
      if (w <= 0.02) continue;
      final bi = (hsv.hue / (360 / buckets)).floor() % buckets;
      weight[bi] += w;
      rs[bi] += r * w;
      gs[bi] += g * w;
      bs[bi] += b * w;
    }

    final avgR = (rSum / pixelCount).round();
    final avgG = (gSum / pixelCount).round();
    final avgB = (bSum / pixelCount).round();

    Color bucketColor(int i) => Color.fromRGBO(
          (rs[i] / weight[i]).round().clamp(0, 255),
          (gs[i] / weight[i]).round().clamp(0, 255),
          (bs[i] / weight[i]).round().clamp(0, 255),
          1.0,
        );

    int first = -1;
    for (int i = 0; i < buckets; i++) {
      if (weight[i] > 0 && (first < 0 || weight[i] > weight[first])) first = i;
    }

    // Greyscale / monochrome art: fall back to a refined neutral-crimson palette.
    if (first < 0) {
      final base = Color.fromRGBO(avgR, avgG, avgB, 1.0);
      final hsv = HSVColor.fromColor(base);
      return ArtworkPalette(
        primary: hsv.withSaturation(0.10).withValue((hsv.value + 0.25).clamp(0.45, 0.85)).toColor(),
        secondary: hsv.withSaturation(0.08).withValue((hsv.value * 0.6).clamp(0.18, 0.5)).toColor(),
        accent: ArtworkPalette.defaultPalette.primary,
        background: Color.fromRGBO(
          (avgR * 0.16).round().clamp(10, 30),
          (avgG * 0.16).round().clamp(10, 30),
          (avgB * 0.16).round().clamp(12, 32),
          1.0,
        ),
      );
    }

    // Second hue: heaviest bucket at least 2 hue-steps away from the first.
    int second = -1;
    for (int i = 0; i < buckets; i++) {
      final d = math.min((i - first).abs(), buckets - (i - first).abs());
      if (d >= 2 && weight[i] > 0 && (second < 0 || weight[i] > weight[second])) second = i;
    }

    // Boost vibrancy (Apple Music-like saturated glow) without clipping.
    Color vivid(Color c, {double sat = 1.18, double minVal = 0.55, double maxVal = 0.95}) {
      final h = HSVColor.fromColor(c);
      return h
          .withSaturation((h.saturation * sat).clamp(0.45, 1.0))
          .withValue(h.value.clamp(minVal, maxVal))
          .toColor();
    }

    final primary = vivid(bucketColor(first));
    final secondary = second >= 0
        ? vivid(bucketColor(second), sat: 1.05, minVal: 0.42, maxVal: 0.85)
        : () {
            final h = HSVColor.fromColor(primary);
            return h.withHue((h.hue + 26) % 360).withValue((h.value * 0.72).clamp(0.3, 0.8)).toColor();
          }();
    final accent = () {
      final h = HSVColor.fromColor(primary);
      return h
          .withHue((h.hue + 150) % 360)
          .withSaturation(0.62)
          .withValue(0.95)
          .toColor();
    }();
    final background = Color.fromRGBO(
      (avgR * 0.16).round().clamp(10, 30),
      (avgG * 0.16).round().clamp(10, 30),
      (avgB * 0.16).round().clamp(12, 32),
      1.0,
    );

    return ArtworkPalette(
      primary: primary,
      secondary: secondary,
      accent: accent,
      background: background,
    );
  }

  ArtworkPalette _deterministicPalette(String seed) {
    int hash = 0;
    for (int i = 0; i < seed.length; i++) {
      hash = seed.codeUnitAt(i) + ((hash << 5) - hash);
    }
    final hue = (hash.abs() % 360).toDouble();
    final primary = HSVColor.fromAHSV(1.0, hue, 0.78, 0.82).toColor();
    final secondary = HSVColor.fromAHSV(1.0, (hue + 28) % 360, 0.85, 0.65).toColor();
    final accent = HSVColor.fromAHSV(1.0, (hue + 140) % 360, 0.65, 0.90).toColor();
    const background = Color(0xFF121214);

    return ArtworkPalette(
      primary: primary,
      secondary: secondary,
      accent: accent,
      background: background,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. STORY IMAGE RENDERER (1080x1920 CAPTURE)
// ═════════════════════════════════════════════════════════════════════════════

class RenderResult {
  const RenderResult({
    required this.file,
    required this.bytes,
    required this.width,
    required this.height,
  });

  final File file;
  final Uint8List bytes;
  final int width;
  final int height;
}

class StoryImageRenderer {
  StoryImageRenderer._();

  static Future<RenderResult?> captureToPng(
    GlobalKey boundaryKey, {
    String filePrefix = 'zenify_story',
    double pixelRatio = 3.0,

    /// When set, pixelRatio is derived so the PNG is exactly this wide
    /// (1080 for Instagram / WhatsApp / Snapchat stories).
    double? targetWidth,
  }) async {
    try {
      final ctx = boundaryKey.currentContext;
      if (ctx == null) {
        debugPrint('[StoryImageRenderer] Context is null for boundaryKey');
        return null;
      }

      final boundary = ctx.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) {
        debugPrint('[StoryImageRenderer] RenderRepaintBoundary not found');
        return null;
      }

      if (boundary.debugNeedsPaint) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }

      final effectiveRatio = (targetWidth != null && boundary.size.width > 0)
          ? targetWidth / boundary.size.width
          : pixelRatio;
      final ui.Image image = await boundary.toImage(pixelRatio: effectiveRatio);
      final ByteData? byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      final width = image.width;
      final height = image.height;
      image.dispose();

      if (byteData == null) {
        debugPrint('[StoryImageRenderer] Failed to encode image to PNG ByteData');
        return null;
      }

      final Uint8List pngBytes = byteData.buffer.asUint8List();
      final tempDir = await getTemporaryDirectory();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final file = File('${tempDir.path}/${filePrefix}_$timestamp.png');
      await file.writeAsBytes(pngBytes, flush: true);

      return RenderResult(
        file: file,
        bytes: pngBytes,
        width: width,
        height: height,
      );
    } catch (e, stack) {
      debugPrint('[StoryImageRenderer] Capture error: $e\n$stack');
      return null;
    }
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// 3. DOWNLOAD / GALLERY SAVE SERVICE (Android + iOS)
// ═════════════════════════════════════════════════════════════════════════════

class GallerySaveService {
  GallerySaveService._();
  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/story_share');

  /// Saves the PNG into the phone gallery (album "Zenify"). Uses `gal`, which
  /// handles Android 10+ scoped storage and iOS photo-library permission.
  static Future<bool> saveImageToGallery(File imageFile, {String title = 'Zenify_Story'}) async {
    if (!imageFile.existsSync()) {
      debugPrint('[GallerySaveService] Image file does not exist: ${imageFile.path}');
      return false;
    }
    try {
      var ok = await Gal.hasPermission(toAlbum: true);
      if (!ok) ok = await Gal.requestPermission(toAlbum: true);
      if (!ok) return false;
      await Gal.putImage(imageFile.path, album: 'Zenify');
      return true;
    } catch (e) {
      debugPrint('[GallerySaveService] gal error: $e');
    }
    // Fallback: your existing Android MediaStore channel.
    if (Platform.isAndroid) {
      try {
        final bool? result = await _channel.invokeMethod<bool>('saveToGallery', {
          'filePath': imageFile.path,
          'title': title,
        });
        return result ?? false;
      } catch (e) {
        debugPrint('[GallerySaveService] channel error: $e');
      }
    }
    return false;
  }

  /// "Save to Files": opens the system sheet so the PNG can go to Files,
  /// Drive, AirDrop, Nearby Share, etc.
  static Future<bool> saveToFiles(File imageFile) => StorySharingService.shareToSystem(imageFile);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. REAL-TIME SHARING — native app hand-off + link intents
// ═════════════════════════════════════════════════════════════════════════════

/// Targets that receive the rendered IMAGE (+ caption / link).
/// Old names (instagram, facebook, …) are kept so existing callers compile.
enum StoryShareTarget {
  instagram, // Instagram Story (sticker over background colours)
  instagramPost, // Instagram share sheet: Feed / Reels / Direct
  facebook, // Facebook Story
  whatsapp, // WhatsApp / Business (chat or Status)
  twitter, // X (Twitter) post composer with the image attached
  snapchat, // Snapchat camera with the image
  telegram,
  messenger,
  threads,
  system,
}

/// Targets that receive the LINK (+ text) through universal links, so they
/// work even where image hand-off is not possible (e.g. iOS, web fallbacks).
enum StoryLinkTarget { x, whatsapp, telegram, facebook, linkedin, reddit, pinterest, sms, email }

class StorySharingService {
  StorySharingService._();
  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/story_share');

  static const Map<StoryShareTarget, List<String>> _packages = {
    StoryShareTarget.instagramPost: ['com.instagram.android'],
    StoryShareTarget.twitter: ['com.twitter.android', 'com.twitter.android.lite'],
    StoryShareTarget.messenger: ['com.facebook.orca', 'com.facebook.mlite'],
    StoryShareTarget.threads: ['com.instagram.barcelona'],
  };

  static Future<bool> isAppInstalled(String packageName) async {
    if (!Platform.isAndroid) return false;
    try {
      final bool? result = await _channel.invokeMethod<bool>('isAppInstalled', {'packageName': packageName});
      return result ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> isInstagramInstalled() => isAppInstalled('com.instagram.android');
  static Future<bool> isFacebookInstalled() async =>
      await isAppInstalled('com.facebook.katana') || await isAppInstalled('com.facebook.lite');
  static Future<bool> isWhatsAppInstalled() async =>
      await isAppInstalled('com.whatsapp') || await isAppInstalled('com.whatsapp.w4b');
  static Future<bool> isSnapchatInstalled() => isAppInstalled('com.snapchat.android');
  static Future<bool> isTelegramInstalled() async =>
      await isAppInstalled('org.telegram.messenger') ||
      await isAppInstalled('org.thunderdog.challegram') ||
      await isAppInstalled('org.telegram.messenger.web');

  /// One entry point used by the preview screen.
  static Future<bool> shareImage(
    StoryShareTarget target,
    File file, {
    String? text,
    Color? topColor,
    Color? bottomColor,
  }) {
    switch (target) {
      case StoryShareTarget.instagram:
        return shareToInstagram(file, topColor: topColor, bottomColor: bottomColor, fallbackText: text);
      case StoryShareTarget.facebook:
        return shareToFacebook(file, fallbackText: text);
      case StoryShareTarget.whatsapp:
        return shareToWhatsApp(file, text: text);
      case StoryShareTarget.snapchat:
        return shareToSnapchat(file, fallbackText: text);
      case StoryShareTarget.telegram:
        return shareToTelegram(file, text: text);
      case StoryShareTarget.instagramPost:
      case StoryShareTarget.twitter:
      case StoryShareTarget.messenger:
      case StoryShareTarget.threads:
        return _shareToPackages(file, _packages[target]!, text: text);
      case StoryShareTarget.system:
        return shareToSystem(file, text: text);
    }
  }

  /// Generic Android hand-off: opens the target app's composer directly with
  /// the PNG attached. Falls back to the system sheet (always on iOS).
  static Future<bool> _shareToPackages(File file, List<String> packages, {String? text}) async {
    if (!file.existsSync()) return false;
    if (Platform.isAndroid) {
      for (final pkg in packages) {
        try {
          final bool? ok = await _channel.invokeMethod<bool>('shareToPackage', {
            'filePath': file.path,
            'packageName': pkg,
            'text': text,
          });
          if (ok == true) return true;
        } catch (e) {
          debugPrint('[StorySharingService] shareToPackage($pkg) error: $e');
        }
      }
    }
    return shareToSystem(file, text: text);
  }

  static Future<bool> shareToTelegram(File imageFile, {String? text}) async {
    if (!imageFile.existsSync()) return false;
    if (Platform.isAndroid) {
      try {
        final bool? success = await _channel.invokeMethod<bool>('shareToTelegram', {
          'filePath': imageFile.path,
          'text': text,
        });
        if (success == true) return true;
      } catch (e) {
        debugPrint('[StorySharingService] Telegram share error: $e');
      }
    }
    return shareToSystem(imageFile, text: text);
  }

  static Future<bool> shareToInstagram(
    File imageFile, {
    Color? topColor,
    Color? bottomColor,
    String? fallbackText,
  }) async {
    if (!imageFile.existsSync()) return false;
    if (Platform.isAndroid) {
      try {
        String? hex(Color? c) => c == null ? null : '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
        final bool? success = await _channel.invokeMethod<bool>('shareToInstagramStory', {
          'filePath': imageFile.path,
          'topBackgroundColor': hex(topColor),
          'bottomBackgroundColor': hex(bottomColor),
        });
        if (success == true) return true;
      } catch (e) {
        debugPrint('[StorySharingService] Instagram native story share error: $e');
      }
    }
    return shareToSystem(imageFile, text: fallbackText);
  }

  static Future<bool> shareToFacebook(File imageFile, {String? appId, String? fallbackText}) async {
    if (!imageFile.existsSync()) return false;
    if (Platform.isAndroid) {
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
    return shareToSystem(imageFile, text: fallbackText);
  }

  static Future<bool> shareToWhatsApp(File imageFile, {String? text}) async {
    if (!imageFile.existsSync()) return false;
    if (Platform.isAndroid) {
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
    return shareToSystem(imageFile, text: text);
  }

  static Future<bool> shareToSnapchat(File imageFile, {String? fallbackText}) async {
    if (!imageFile.existsSync()) return false;
    if (Platform.isAndroid) {
      try {
        final bool? success = await _channel.invokeMethod<bool>('shareToSnapchat', {'filePath': imageFile.path});
        if (success == true) return true;
      } catch (e) {
        debugPrint('[StorySharingService] Snapchat share error: $e');
      }
    }
    return shareToSystem(imageFile, text: fallbackText);
  }

  /// System sheet: every installed app + AirDrop / Nearby Share / Files / print.
  static Future<bool> shareToSystem(File imageFile, {String? text, Rect? origin}) async {
    if (!imageFile.existsSync()) return false;
    try {
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(imageFile.path, mimeType: 'image/png')],
          text: text,
          sharePositionOrigin: origin,
        ),
      );
      return true;
    } catch (e) {
      debugPrint('[StorySharingService] System share error: $e');
      return false;
    }
  }

  // ── Link intents (live link, opens the app/site composer) ──

  static Uri linkUri(StoryLinkTarget t, {required String text, required String url}) {
    final q = Uri.encodeQueryComponent;
    switch (t) {
      case StoryLinkTarget.x:
        return Uri.parse('https://x.com/intent/post?text=${q(text)}&url=${q(url)}');
      case StoryLinkTarget.whatsapp:
        return Uri.parse('https://wa.me/?text=${q('$text $url')}');
      case StoryLinkTarget.telegram:
        return Uri.parse('https://t.me/share/url?url=${q(url)}&text=${q(text)}');
      case StoryLinkTarget.facebook:
        return Uri.parse('https://www.facebook.com/sharer/sharer.php?u=${q(url)}&quote=${q(text)}');
      case StoryLinkTarget.linkedin:
        return Uri.parse('https://www.linkedin.com/sharing/share-offsite/?url=${q(url)}');
      case StoryLinkTarget.reddit:
        return Uri.parse('https://www.reddit.com/submit?url=${q(url)}&title=${q(text)}');
      case StoryLinkTarget.pinterest:
        return Uri.parse('https://pinterest.com/pin/create/button/?url=${q(url)}&description=${q(text)}');
      case StoryLinkTarget.sms:
        return Uri.parse('sms:?body=${q('$text $url')}');
      case StoryLinkTarget.email:
        return Uri.parse('mailto:?subject=${q(text)}&body=${q('$text\n$url')}');
    }
  }

  static Future<bool> shareLink(StoryLinkTarget t, {required String text, required String url}) async {
    try {
      return await launchUrl(linkUri(t, text: text, url: url), mode: LaunchMode.externalApplication);
    } catch (e) {
      debugPrint('[StorySharingService] link share error: $e');
      return false;
    }
  }
}
