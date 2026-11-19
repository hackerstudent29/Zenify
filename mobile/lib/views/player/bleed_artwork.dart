import 'dart:async';
import 'dart:collection';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Apple Music style "full bleed" artwork.
///
///  1. The cover is decoded once at [_kBakePx] and centre-cropped to a square.
///  2. The colour of its TOP and BOTTOM edges is sampled in [kBleedBands]
///     horizontal bands, then tuned (darker, slightly desaturated, hue kept) so
///     white controls / status bar stay readable on ANY artwork.
///  3. A square is baked: artwork + progressive blur (towards the bottom) +
///     a top tint + a bottom tint that land EXACTLY on the band colours at the
///     first / last row.
///  4. [BleedFill] paints the top colours above the artwork and the bottom
///     colours below it, so everything meets with no visible seam.
///
/// Because the blur is baked, flying / scaling / docking the cover costs a
/// plain image draw per frame (no ImageFilter, no ShaderMask, no saveLayer).

const int kBleedBands = 5;
const List<double> kBleedBandStops = [0.1, 0.3, 0.5, 0.7, 0.9];

const int _kBakePx = 720;

// smoothstep-ish alpha ramp, used for every progressive mask
const List<Color> _kRamp = [
  Color(0x00FFFFFF),
  Color(0x1AFFFFFF),
  Color(0x80FFFFFF),
  Color(0xE6FFFFFF),
  Color(0xFFFFFFFF),
];
const List<double> _kRampStops = [0.0, 0.2, 0.5, 0.8, 1.0];

const Color _kFallbackEdge = Color(0xFF2A2A30);

@immutable
class BleedArtwork {
  const BleedArtwork({
    required this.key,
    required this.image,
    required this.bands,
    required this.topBands,
  });

  /// The (upgraded) cover url this was baked from.
  final String key;

  /// Opaque square: artwork + progressive blur + tints ending on the bands.
  final ui.Image image;

  /// Colours the screen continues with BELOW the artwork, left -> right.
  final List<Color> bands;

  /// Colours the screen continues with ABOVE the artwork (status bar area).
  final List<Color> topBands;

  Color get average {
    var r = 0.0, g = 0.0, b = 0.0;
    for (final c in bands) {
      r += c.r;
      g += c.g;
      b += c.b;
    }
    final n = bands.length;
    return Color.from(
      alpha: 1,
      red: (r / n).clamp(0.0, 1.0),
      green: (g / n).clamp(0.0, 1.0),
      blue: (b / n).clamp(0.0, 1.0),
    );
  }
}

class _Edges {
  const _Edges(this.top, this.bottom);
  final List<Color> top;
  final List<Color> bottom;
}

class BleedArtworkService {
  BleedArtworkService._();
  static final BleedArtworkService instance = BleedArtworkService._();

  static const int _maxEntries = 8;

  // Evicted images are NOT disposed on purpose: a widget may still be drawing
  // them. They are small (~2 MB) and released by the GC.
  final LinkedHashMap<String, BleedArtwork> _cache =
      LinkedHashMap<String, BleedArtwork>();
  final Map<String, Future<BleedArtwork?>> _inflight = {};

  BleedArtwork? peek(String key) {
    final hit = _cache.remove(key);
    if (hit != null) _cache[key] = hit; // LRU touch
    return hit;
  }

  /// Bakes (or returns the cached bake of) [key]. Returns null on failure, in
  /// which case the caller simply keeps showing the plain cover.
  Future<BleedArtwork?> load(String key, ImageProvider provider) {
    final hit = peek(key);
    if (hit != null) return Future.value(hit);
    return _inflight[key] ??= _bake(
      key,
      provider,
    ).whenComplete(() => _inflight.remove(key));
  }

  Future<BleedArtwork?> _bake(String key, ImageProvider provider) async {
    try {
      final src = await _decode(provider);
      final art = await _render(key, src);
      src.dispose();
      _cache[key] = art;
      while (_cache.length > _maxEntries) {
        _cache.remove(_cache.keys.first);
      }
      return art;
    } catch (e) {
      debugPrint('BleedArtwork: bake failed ($e)');
      return null;
    }
  }

  Future<ui.Image> _decode(ImageProvider provider) {
    final completer = Completer<ui.Image>();
    final stream = ResizeImage(
      provider,
      width: _kBakePx,
    ).resolve(ImageConfiguration.empty);
    late final ImageStreamListener listener;
    listener = ImageStreamListener(
      (info, _) {
        if (!completer.isCompleted) completer.complete(info.image.clone());
        stream.removeListener(listener);
      },
      onError: (Object e, StackTrace? s) {
        if (!completer.isCompleted) completer.completeError(e, s);
        stream.removeListener(listener);
      },
    );
    stream.addListener(listener);
    return completer.future
        .timeout(const Duration(seconds: 12))
        .whenComplete(() => stream.removeListener(listener));
  }

  Future<BleedArtwork> _render(String key, ui.Image src) async {
    const s = _kBakePx * 1.0;
    const rect = Rect.fromLTWH(0, 0, s, s);

    // centre-crop to a square ("cover"), so 16:9 thumbnails work too
    final side = math.min(src.width, src.height).toDouble();
    final srcRect = Rect.fromLTWH(
      (src.width - side) / 2,
      (src.height - side) / 2,
      side,
      side,
    );

    final edges = await _sampleEdges(src, srcRect);
    final bands = edges.bottom;
    final topBands = edges.top;

    final rec = ui.PictureRecorder();
    final canvas = Canvas(rec, rect);
    final imgPaint = Paint()..filterQuality = FilterQuality.high;

    // 1. sharp artwork
    canvas.drawImageRect(src, srcRect, rect, imgPaint);

    // 2. progressive blur: each level is a blurred copy faded in over a
    //    vertical range, bigger sigma further down. No banding, no hard edge.
    const levels = <List<double>>[
      // sigma, from, to  (fractions of the height)
      [3, 0.60, 0.78],
      [9, 0.70, 0.86],
      [20, 0.78, 0.93],
      [40, 0.86, 1.00],
    ];
    for (final l in levels) {
      canvas.saveLayer(rect, Paint());
      canvas.saveLayer(
        rect,
        Paint()
          ..imageFilter = ui.ImageFilter.blur(
            sigmaX: l[0],
            sigmaY: l[0],
            tileMode: TileMode.clamp,
          ),
      );
      canvas.drawImageRect(src, srcRect, rect, imgPaint);
      canvas.restore();
      canvas.drawRect(
        rect,
        Paint()
          ..blendMode = BlendMode.dstIn
          ..shader = ui.Gradient.linear(
            Offset(0, s * l[1]),
            Offset(0, s * l[2]),
            _kRamp,
            _kRampStops,
          ),
      );
      canvas.restore();
    }

    // 3. TOP tint: first row == topBands exactly, fades into the artwork over
    //    the first 18 %. The screen continues with the same colours above the
    //    cover, so the status bar sits on a clean, dark, seamless area.
    canvas.saveLayer(rect, Paint());
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          const Offset(s, 0),
          topBands,
          kBleedBandStops,
        ),
    );
    canvas.drawRect(
      rect,
      Paint()
        ..blendMode = BlendMode.dstIn
        ..shader = ui.Gradient.linear(
          const Offset(0, s * 0.18),
          Offset.zero,
          _kRamp,
          _kRampStops,
        ),
    );
    canvas.restore();

    // 4. BOTTOM tint: lands exactly on the band colours at the last row, so
    //    the BleedFill below continues it seamlessly.
    canvas.saveLayer(rect, Paint());
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          const Offset(s, 0),
          bands,
          kBleedBandStops,
        ),
    );
    canvas.drawRect(
      rect,
      Paint()
        ..blendMode = BlendMode.dstIn
        ..shader = ui.Gradient.linear(
          const Offset(0, s * 0.74),
          const Offset(0, s),
          _kRamp,
          _kRampStops,
        ),
    );
    canvas.restore();

    final pic = rec.endRecording();
    final img = await pic.toImage(_kBakePx, _kBakePx);
    pic.dispose();
    return BleedArtwork(key: key, image: img, bands: bands, topBands: topBands);
  }

  Future<_Edges> _sampleEdges(ui.Image src, Rect area) async {
    final fallback = List<Color>.filled(kBleedBands, _kFallbackEdge);
    final data = await src.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (data == null) return _Edges(fallback, fallback);
    final bytes = data.buffer.asUint8List();
    return _Edges(
      _sampleStrip(bytes, src, area, top: true),
      _sampleStrip(bytes, src, area, top: false),
    );
  }

  List<Color> _sampleStrip(
    Uint8List bytes,
    ui.Image src,
    Rect area, {
    required bool top,
  }) {
    final fallback = List<Color>.filled(kBleedBands, _kFallbackEdge);
    final w = src.width;
    final x0 = area.left.floor().clamp(0, src.width).toInt();
    final x1 = area.right.ceil().clamp(0, src.width).toInt();
    final stripH = math.max(4, (area.height * 0.10).round());

    final int yStart;
    final int yEnd;
    if (top) {
      yStart = area.top.floor().clamp(0, src.height).toInt();
      yEnd = math.min(src.height, yStart + stripH);
    } else {
      yEnd = area.bottom.floor().clamp(0, src.height).toInt();
      yStart = math.max(0, yEnd - stripH);
    }

    if (x1 <= x0 || yEnd <= yStart) return fallback;

    final sums = List<double>.filled(kBleedBands * 3, 0);
    final counts = List<int>.filled(kBleedBands, 0);
    for (var y = yStart; y < yEnd; y++) {
      for (var x = x0; x < x1; x += 2) {
        final o = (y * w + x) * 4;
        if (o + 3 >= bytes.length) continue;
        if (bytes[o + 3] < 16) continue; // transparent pixel
        final band = (((x - x0) * kBleedBands) ~/ (x1 - x0))
            .clamp(0, kBleedBands - 1)
            .toInt();
        sums[band * 3] += bytes[o];
        sums[band * 3 + 1] += bytes[o + 1];
        sums[band * 3 + 2] += bytes[o + 2];
        counts[band]++;
      }
    }

    var tr = 0.0, tg = 0.0, tb = 0.0;
    var total = 0;
    for (var i = 0; i < kBleedBands; i++) {
      tr += sums[i * 3];
      tg += sums[i * 3 + 1];
      tb += sums[i * 3 + 2];
      total += counts[i];
    }
    if (total == 0) return fallback;

    Color mean(double r, double g, double b, int n) => Color.fromARGB(
      255,
      (r / n).round().clamp(0, 255).toInt(),
      (g / n).round().clamp(0, 255).toInt(),
      (b / n).round().clamp(0, 255).toInt(),
    );
    final overall = mean(tr, tg, tb, total);

    return [
      for (var i = 0; i < kBleedBands; i++)
        _tune(
          Color.lerp(
            counts[i] == 0
                ? overall
                : mean(
                    sums[i * 3],
                    sums[i * 3 + 1],
                    sums[i * 3 + 2],
                    counts[i],
                  ),
            overall,
            0.45, // pull bands together: no harsh horizontal steps
          )!,
          maxLum: top ? 0.34 : 0.42,
        ),
    ];
  }

  static double _lum(double r, double g, double b) =>
      0.2126 * r + 0.7152 * g + 0.0722 * b;

  /// Apple-like: darker + a touch less saturated, hue kept, and always inside
  /// a luminance range where white text / controls stay legible.
  ///
  /// Darkening is done by scaling RGB (mixing with black), NOT by clamping HSL
  /// lightness. HSL turned light cream / white edges into tan / brown; scaling
  /// keeps them a neutral, natural grey of the same tint.
  static Color _tune(Color c, {double maxLum = 0.42, double minLum = 0.10}) {
    var r = c.r, g = c.g, b = c.b;

    // slight desaturation towards the colour's own luminance
    const desat = 0.12;
    final l0 = _lum(r, g, b);
    r += (l0 - r) * desat;
    g += (l0 - g) * desat;
    b += (l0 - b) * desat;

    final l = _lum(r, g, b);
    if (l > maxLum) {
      final k = maxLum / l;
      r *= k;
      g *= k;
      b *= k;
    } else if (l < minLum) {
      final add = minLum - l; // uniform lift keeps the hue
      r += add;
      g += add;
      b += add;
    }

    return Color.from(
      alpha: 1,
      red: r.clamp(0.0, 1.0),
      green: g.clamp(0.0, 1.0),
      blue: b.clamp(0.0, 1.0),
    );
  }
}

/// The baked square. Fades in once it is ready and fades out with the dock
/// spring (when the cover shrinks into the header the plain cover underneath
/// takes over, so the small docked cover has no blurred bottom).
class BleedArtworkImage extends StatelessWidget {
  const BleedArtworkImage({super.key, required this.art, required this.dock});

  final BleedArtwork art;
  final Animation<double> dock;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: 1),
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOut,
      builder: (_, appear, _) => AnimatedBuilder(
        animation: dock,
        builder: (_, _) {
          final o = appear * (1 - dock.value.clamp(0.0, 1.0));
          if (o <= 0.001) return const SizedBox.shrink();
          return Opacity(
            opacity: o,
            child: RawImage(
              image: art.image,
              fit: BoxFit.fill,
              // mipmapped: no shimmer while the cover scales down to the mini
              filterQuality: FilterQuality.medium,
            ),
          );
        },
      ),
    );
  }
}

/// Everything around the artwork:
///  • above it ([artTop] px): the top colours (status bar area)
///  • below it: the band colours continue to the bottom of the screen and
///    deepen slightly, starting EXACTLY at [artBottom] (no seam).
/// Cross-fades when the track changes.
class BleedFill extends StatefulWidget {
  const BleedFill({
    super.key,
    required this.bands,
    this.topBands = const [],
    this.artTop = 0.0,
    this.artBottom = 0.0,
  });

  final List<Color> bands;
  final List<Color> topBands;
  final double artTop;
  final double artBottom;

  @override
  State<BleedFill> createState() => _BleedFillState();
}

class _BleedFillState extends State<BleedFill>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
    value: 1,
  );

  // top colours first, then bottom colours: lerped together
  late List<Color> _from = _combine(widget.topBands, widget.bands);
  late List<Color> _to = _combine(widget.topBands, widget.bands);

  static List<Color> _combine(List<Color> top, List<Color> bottom) => [
    ...top,
    ...bottom,
  ];

  List<Color> _now() {
    final t = Curves.easeInOutCubic.transform(_c.value);
    final n = math.min(_from.length, _to.length);
    return [for (var i = 0; i < n; i++) Color.lerp(_from[i], _to[i], t)!];
  }

  @override
  void didUpdateWidget(BleedFill old) {
    super.didUpdateWidget(old);
    final next = _combine(widget.topBands, widget.bands);
    if (!listEquals(_to, next)) {
      _from = _now();
      if (_from.length != next.length) _from = next;
      _to = next;
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, _) => CustomPaint(
          painter: _BleedFillPainter(_now(), widget.artTop, widget.artBottom),
          size: Size.infinite,
        ),
      ),
    );
  }
}

class _BleedFillPainter extends CustomPainter {
  const _BleedFillPainter(this.colors, this.artTop, this.artBottom);

  /// [kBleedBands] top colours followed by [kBleedBands] bottom colours.
  final List<Color> colors;
  final double artTop;
  final double artBottom;

  @override
  void paint(Canvas canvas, Size size) {
    if (colors.length < kBleedBands * 2) return;
    final top = colors.sublist(0, kBleedBands);
    final bottom = colors.sublist(kBleedBands, kBleedBands * 2);
    final rect = Offset.zero & size;

    // base: bottom colours everywhere
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          colors: bottom,
          stops: kBleedBandStops,
        ).createShader(rect),
    );

    // gentle deepening towards the bottom. Starts at the artwork's last row
    // with alpha 0, so there is no seam between the cover and the fill.
    final deepTop = artBottom.clamp(0.0, size.height).toDouble();
    if (size.height - deepTop > 1) {
      final deepRect = Rect.fromLTRB(0, deepTop, size.width, size.height);
      canvas.drawRect(
        deepRect,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x00000000), Color(0x38000000)],
          ).createShader(deepRect),
      );
    }

    // status-bar strip above the artwork: exactly the artwork's top colours
    if (artTop > 0.5) {
      final topRect = Rect.fromLTWH(0, 0, size.width, artTop + 2);
      canvas.drawRect(
        topRect,
        Paint()
          ..shader = LinearGradient(
            colors: top,
            stops: kBleedBandStops,
          ).createShader(topRect),
      );
    }
  }

  @override
  bool shouldRepaint(_BleedFillPainter old) =>
      !listEquals(old.colors, colors) ||
      old.artTop != artTop ||
      old.artBottom != artBottom;
}
