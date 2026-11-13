import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

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

    final image = await completer.future.timeout(const Duration(seconds: 3));

    // Downsample image to small 16x16 canvas to sample pixel colors swiftly
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    const sampleSize = 16.0;
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      const Rect.fromLTWH(0, 0, sampleSize, sampleSize),
      Paint()..filterQuality = ui.FilterQuality.low,
    );
    final picture = recorder.endRecording();
    final sampleImg = await picture.toImage(16, 16);
    final byteData = await sampleImg.toByteData(format: ui.ImageByteFormat.rawRgba);
    sampleImg.dispose();
    picture.dispose();
    image.dispose();

    if (byteData == null) return ArtworkPalette.defaultPalette;

    final Uint8List bytes = byteData.buffer.asUint8List();
    final List<Color> sampledColors = [];

    for (int i = 0; i < bytes.length; i += 4) {
      final r = bytes[i];
      final g = bytes[i + 1];
      final b = bytes[i + 2];
      final a = bytes[i + 3];
      if (a < 128) continue; // Skip transparent pixels
      sampledColors.add(Color.fromARGB(255, r, g, b));
    }

    if (sampledColors.isEmpty) return ArtworkPalette.defaultPalette;

    // Sort by saturation and brightness
    sampledColors.sort((a, b) {
      final hslA = HSLColor.fromColor(a);
      final hslB = HSLColor.fromColor(b);
      // Prefer vibrant colors (high saturation & moderate lightness)
      final scoreA = hslA.saturation * (1.0 - (hslA.lightness - 0.5).abs() * 2);
      final scoreB = hslB.saturation * (1.0 - (hslB.lightness - 0.5).abs() * 2);
      return scoreB.compareTo(scoreA);
    });

    final primary = sampledColors.first;
    Color secondary = sampledColors.length > 5 ? sampledColors[5] : primary;
    Color accent = sampledColors.length > 10 ? sampledColors[10] : secondary;

    // Dark background derived from primary or charcoal
    final primaryHsl = HSLColor.fromColor(primary);
    final bg = primaryHsl.withLightness(0.08).withSaturation(primaryHsl.saturation * 0.4).toColor();

    return ArtworkPalette(
      primary: primary,
      secondary: secondary,
      accent: accent,
      background: bg,
    );
  }

  ArtworkPalette _deterministicPalette(String seed) {
    final hash = seed.hashCode.abs();
    final hue1 = (hash % 360).toDouble();
    final hue2 = ((hash ~/ 360) % 360).toDouble();
    final hue3 = ((hash ~/ 129600) % 360).toDouble();

    return ArtworkPalette(
      primary: HSLColor.fromAHSL(1.0, hue1, 0.75, 0.55).toColor(),
      secondary: HSLColor.fromAHSL(1.0, hue2, 0.65, 0.45).toColor(),
      accent: HSLColor.fromAHSL(1.0, hue3, 0.80, 0.60).toColor(),
      background: const Color(0xFF121214),
    );
  }
}

