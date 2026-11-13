import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

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
        completer.complete(frame.image);
        stream.removeListener(listener);
      },
      onError: (err, _) {
        completer.completeError(err);
        stream.removeListener(listener);
      },
    );

    stream.addListener(listener);
    final image = await completer.future.timeout(const Duration(milliseconds: 900));

    // Downscale to 16x16 thumbnail for instant sampling
    const sampleSize = 16.0;
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
    double rSum = 0, gSum = 0, bSum = 0;
    int pixelCount = (sampleSize * sampleSize).toInt();

    // Track vibrant extremes
    int maxSatR = 225, maxSatG = 29, maxSatB = 72;
    double maxSat = -1;

    for (int i = 0; i < bytes.length; i += 4) {
      final r = bytes[i];
      final g = bytes[i + 1];
      final b = bytes[i + 2];
      rSum += r;
      gSum += g;
      bSum += b;

      final maxC = math.max(r, math.max(g, b));
      final minC = math.min(r, math.min(g, b));
      final sat = maxC == 0 ? 0.0 : (maxC - minC) / maxC;

      if (sat > maxSat && maxC > 50 && maxC < 240) {
        maxSat = sat;
        maxSatR = r;
        maxSatG = g;
        maxSatB = b;
      }
    }

    final avgR = (rSum / pixelCount).round();
    final avgG = (gSum / pixelCount).round();
    final avgB = (bSum / pixelCount).round();

    final primary = Color.fromRGBO(maxSatR, maxSatG, maxSatB, 1.0);
    final secondary = Color.fromRGBO(
      (maxSatR * 0.75 + avgR * 0.25).round().clamp(0, 255),
      (maxSatG * 0.75 + avgG * 0.25).round().clamp(0, 255),
      (maxSatB * 0.75 + avgB * 0.25).round().clamp(0, 255),
      1.0,
    );
    final accent = Color.fromRGBO(
      (maxSatB * 0.8 + 50).round().clamp(0, 255),
      (maxSatR * 0.3 + 30).round().clamp(0, 255),
      (maxSatG * 0.9 + 70).round().clamp(0, 255),
      1.0,
    );
    final background = Color.fromRGBO(
      (avgR * 0.18).round().clamp(10, 30),
      (avgG * 0.18).round().clamp(10, 30),
      (avgB * 0.18).round().clamp(12, 32),
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

      final ui.Image image = await boundary.toImage(pixelRatio: pixelRatio);
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
// 3. GALLERY SAVE SERVICE
// ═════════════════════════════════════════════════════════════════════════════

class GallerySaveService {
  GallerySaveService._();
  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/story_share');

  static Future<bool> saveImageToGallery(File imageFile, {String title = 'Zenify_Story'}) async {
    if (!imageFile.existsSync()) {
      debugPrint('[GallerySaveService] Image file does not exist: ${imageFile.path}');
      return false;
    }

    if (!Platform.isAndroid) {
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

// ═════════════════════════════════════════════════════════════════════════════
// 4. NATIVE STORY & SYSTEM SHARING SERVICE
// ═════════════════════════════════════════════════════════════════════════════

enum StoryShareTarget {
  instagram,
  facebook,
  whatsapp,
  snapchat,
  system,
}

class StorySharingService {
  StorySharingService._();
  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/story_share');

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
  static Future<bool> isFacebookInstalled() async {
    final fb = await isAppInstalled('com.facebook.katana');
    if (fb) return true;
    return isAppInstalled('com.facebook.lite');
  }
  static Future<bool> isWhatsAppInstalled() async {
    final wa = await isAppInstalled('com.whatsapp');
    if (wa) return true;
    return isAppInstalled('com.whatsapp.w4b');
  }
  static Future<bool> isSnapchatInstalled() => isAppInstalled('com.snapchat.android');

  static Future<bool> shareToInstagram(
    File imageFile, {
    Color? topColor,
    Color? bottomColor,
    String? fallbackText,
  }) async {
    if (!imageFile.existsSync()) return false;

    if (Platform.isAndroid) {
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

    return shareToSystem(imageFile, text: fallbackText);
  }

  static Future<bool> shareToFacebook(
    File imageFile, {
    String? appId,
    String? fallbackText,
  }) async {
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
        final bool? success = await _channel.invokeMethod<bool>('shareToSnapchat', {
          'filePath': imageFile.path,
        });
        if (success == true) return true;
      } catch (e) {
        debugPrint('[StorySharingService] Snapchat share error: $e');
      }
    }

    return shareToSystem(imageFile, text: fallbackText);
  }

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
