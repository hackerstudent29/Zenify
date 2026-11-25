import 'dart:async';
import 'dart:collection';
import 'dart:io' show File;
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../services/crossfade_controller.dart';

/// Apple Music style artwork + backdrop.
///
/// Every cover is decoded ONCE and baked into two small images:
///
///  1. [BleedArtwork.image]  (480 px square)
///     The artwork with its top / bottom edges blurred and feathered into
///     transparency. The centre stays perfectly sharp.
///
///  2. [BleedArtwork.backdrop]  (96 px square)
///     A heavily blurred, slightly more saturated copy. It drives the
///     full-screen fluid backdrop behind EVERYTHING (artwork view, lyrics,
///     queue), and cross-fades whenever the song changes.
///
/// Because all blurring is baked, flying / scaling / docking the cover and the
/// backdrop are plain image draws: no ImageFilter, no BackdropFilter and no
/// saveLayer per frame.

const int _kBakePx = 480;
const int _kBackdropPx = 96;

// smoothstep-ish alpha ramp used for every feather mask
const List<Color> _kRamp = [
  Color(0x00FFFFFF),
  Color(0x1AFFFFFF),
  Color(0x80FFFFFF),
  Color(0xE6FFFFFF),
  Color(0xFFFFFFFF),
];
const List<double> _kRampStops = [0.0, 0.2, 0.5, 0.8, 1.0];

/// Top / bottom feather. Outer: alpha 0 at the edge -> 1 at this fraction.
const double _kFeatherOuter = 0.22;
const double _kSharpFrom = 0.08;
const double _kSharpTo = 0.34;

/// Left / right feather (0 = keep the sides crisp).
const double _kSideOuter = 0.10;
const double _kSideSharpFrom = 0.03;
const double _kSideSharpTo = 0.18;

/// Blur strength of the edge copy (in baked pixels).
const double _kEdgeSigma = 28;

const Color _kFallbackEdge = Color(0xFF2A2A30);

/// The backdrop drift is a very slow motion (20 s period): it is repainted at
/// ~30 fps instead of 60. Visually identical, half the full-screen GPU work.
const double _kFlowInterval = 1 / 30;

double _smooth01(double x) {
  final v = x.clamp(0.0, 1.0).toDouble();
  return v * v * (3 - 2 * v);
}

// saturation 1.3 (colour matrix), keeps the backdrop lively after blurring
const double _kSat = 1.3;
const List<double> _kSatMatrix = [
  (1 - _kSat) * 0.2126 + _kSat,
  (1 - _kSat) * 0.7152,
  (1 - _kSat) * 0.0722,
  0,
  0, //
  (1 - _kSat) * 0.2126,
  (1 - _kSat) * 0.7152 + _kSat,
  (1 - _kSat) * 0.0722,
  0,
  0, //
  (1 - _kSat) * 0.2126,
  (1 - _kSat) * 0.7152,
  (1 - _kSat) * 0.0722 + _kSat,
  0,
  0, //
  0, 0, 0, 1, 0,
];

@immutable
class BleedArtwork {
  const BleedArtwork({
    required this.key,
    required this.image,
    required this.backdrop,
    required this.average,
    required this.scrim,
  });

  /// The (upgraded) cover url this was baked from.
  final String key;

  /// Square artwork, edges blurred + feathered to transparent.
  final ui.Image image;

  /// Tiny, heavily blurred copy used as the full-screen backdrop.
  final ui.Image backdrop;

  /// Average colour of the cover (handy for tints).
  final Color average;

  /// Black overlay alpha applied on top of [backdrop]. Brighter covers get a
  /// stronger scrim so white text / controls always stay readable.
  final double scrim;
}

class _Stats {
  const _Stats(this.average, this.scrim);
  final Color average;
  final double scrim;
}

class BleedArtworkService {
  BleedArtworkService._();
  static final BleedArtworkService instance = BleedArtworkService._();

  static const int _maxEntries = 16;

  // Evicted images are NOT disposed on purpose: a widget may still be drawing
  // them. They are small and released by the GC.
  final LinkedHashMap<String, BleedArtwork> _cache =
      LinkedHashMap<String, BleedArtwork>();
  final Map<String, Future<BleedArtwork?>> _inflight = {};

  BleedArtwork? peek(String key) {
    if (key.isEmpty) return null;
    final hit = _cache.remove(key);
    if (hit != null) _cache[key] = hit; // LRU touch
    return hit;
  }

  /// Builds the appropriate [ImageProvider] for network, `file://`, or local
  /// filesystem artwork paths.
  static ImageProvider? providerForUrl(String url) {
    final u = url.trim();
    if (u.isEmpty) return null;
    if (u.startsWith('http://') || u.startsWith('https://')) {
      return CachedNetworkImageProvider(u);
    }
    if (!kIsWeb) {
      if (u.startsWith('file://')) {
        try {
          return FileImage(File(Uri.parse(u).toFilePath()));
        } catch (_) {
          return null;
        }
      }
      if (u.startsWith('/') || RegExp(r'^[A-Za-z]:[\\/]').hasMatch(u)) {
        return FileImage(File(u));
      }
    }
    return null;
  }

  /// Expands [primary] and [fallback] into ordered, deduplicated artwork URL
  /// candidates so 404s on `maxresdefault.jpg` or high-res CDN variants fall
  /// back cleanly instead of disabling edge bleed.
  @visibleForTesting
  static List<String> buildCandidateUrls(String primary, {String? fallback}) {
    final out = <String>[];
    final seen = <String>{};
    void add(String? u) {
      final t = u?.trim() ?? '';
      if (t.isNotEmpty && seen.add(t)) out.add(t);
    }

    add(primary);
    add(fallback);

    final base = List<String>.from(out);
    for (final u in base) {
      if (u.contains('ytimg.com') || u.contains('img.youtube.com')) {
        if (u.contains('maxresdefault.jpg')) {
          add(u.replaceAll('maxresdefault.jpg', 'sddefault.jpg'));
          add(u.replaceAll('maxresdefault.jpg', 'hqdefault.jpg'));
        } else if (u.contains('sddefault.jpg')) {
          add(u.replaceAll('sddefault.jpg', 'hqdefault.jpg'));
        }
      } else if (u.contains('googleusercontent.com') || u.contains('ggpht.com')) {
        final degraded = u.replaceFirst(
          RegExp(r'=w\d+-h\d+[^?#]*'),
          '=w400-h400-l75-rj',
        );
        if (degraded != u) add(degraded);
      } else if (u.contains('saavncdn.com')) {
        if (u.contains('500x500')) {
          add(u.replaceAll('500x500', '250x250'));
          add(u.replaceAll('500x500', '150x150'));
        } else if (u.contains('250x250')) {
          add(u.replaceAll('250x250', '150x150'));
        }
      }
    }
    return out;
  }

  /// Bakes (or returns the cached bake of) [key]. Returns null on failure.
  Future<BleedArtwork?> load(
    String key,
    ImageProvider provider, {
    String? fallbackUrl,
  }) {
    final hit = peek(key);
    if (hit != null) return Future.value(hit);
    if (fallbackUrl != null && fallbackUrl.isNotEmpty) {
      final fbHit = peek(fallbackUrl);
      if (fbHit != null) {
        final aliased = BleedArtwork(
          key: key,
          image: fbHit.image,
          backdrop: fbHit.backdrop,
          average: fbHit.average,
          scrim: fbHit.scrim,
        );
        _cache[key] = aliased;
        return Future.value(aliased);
      }
    }
    return _inflight[key] ??= _bake(
      key,
      provider,
      fallbackUrl: fallbackUrl,
    ).whenComplete(() => _inflight.remove(key));
  }

  Future<BleedArtwork?> _bake(
    String key,
    ImageProvider provider, {
    String? fallbackUrl,
  }) async {
    ui.Image? src;
    try {
      src = await _decodeWithFallback(provider);
    } catch (_) {}

    if (src == null) {
      final candidates = buildCandidateUrls(key, fallback: fallbackUrl);
      for (final cand in candidates) {
        if (cand == key) continue;
        final p = providerForUrl(cand);
        if (p == null) continue;
        try {
          src = await _decodeWithFallback(p);
          if (src != null) break;
        } catch (_) {}
      }
    }
    if (src == null) return null;

    try {
      final art = await _render(key, src);
      _cache[key] = art;
      if (fallbackUrl != null && fallbackUrl.isNotEmpty) {
        _cache[fallbackUrl] = art;
      }
      while (_cache.length > _maxEntries) {
        _cache.remove(_cache.keys.first);
      }
      return art;
    } catch (e) {
      debugPrint('BleedArtwork: fast bake failed ($e)');
    } finally {
      src.dispose();
    }
    return null;
  }

  Future<ui.Image?> _decodeWithFallback(ImageProvider provider) async {
    try {
      return await _decode(ResizeImage(provider, width: _kBakePx));
    } on TimeoutException {
      return null;
    } catch (_) {
      return await _decode(provider);
    }
  }

  Future<ui.Image> _decode(ImageProvider provider) {
    final completer = Completer<ui.Image>();
    final stream = provider.resolve(ImageConfiguration.empty);
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
        .timeout(const Duration(seconds: 10))
        .whenComplete(() => stream.removeListener(listener));
  }

  /// Computes a centered square crop for [src], trimming symmetric dark
  /// letterbox/pillarbox bars from non-square thumbnails (e.g. 4:3 YouTube
  /// `hqdefault.jpg` / `sddefault.jpg`) so the actual artwork bleeds to edges.
  @visibleForTesting
  static Future<Rect> computeContentSquare(ui.Image src) async {
    final w = src.width;
    final h = src.height;
    var left = 0.0;
    var top = 0.0;
    var right = w.toDouble();
    var bottom = h.toDouble();

    if ((w - h).abs() > 4 && w >= 32 && h >= 32) {
      try {
        final data = await src.toByteData(format: ui.ImageByteFormat.rawRgba);
        if (data != null) {
          final bytes = data.buffer.asUint8List();
          bool isDarkRow(int y) {
            final xStart = (w * 0.2).round();
            final xEnd = (w * 0.8).round();
            final step = math.max(1, (xEnd - xStart) ~/ 16);
            for (var x = xStart; x < xEnd; x += step) {
              final idx = (y * w + x) * 4;
              if (bytes[idx] > 18 || bytes[idx + 1] > 18 || bytes[idx + 2] > 18) {
                return false;
              }
            }
            return true;
          }

          bool isDarkCol(int x) {
            final yStart = (h * 0.2).round();
            final yEnd = (h * 0.8).round();
            final step = math.max(1, (yEnd - yStart) ~/ 16);
            for (var y = yStart; y < yEnd; y += step) {
              final idx = (y * w + x) * 4;
              if (bytes[idx] > 18 || bytes[idx + 1] > 18 || bytes[idx + 2] > 18) {
                return false;
              }
            }
            return true;
          }

          if (w > h) {
            final maxTrimY = (h * 0.18).floor();
            var trimY = 0;
            while (trimY < maxTrimY &&
                isDarkRow(trimY) &&
                isDarkRow(h - 1 - trimY)) {
              trimY++;
            }
            if (trimY >= 4 && h - trimY * 2 >= 32) {
              top = trimY.toDouble();
              bottom = (h - trimY).toDouble();
            }
          } else {
            final maxTrimX = (w * 0.18).floor();
            var trimX = 0;
            while (trimX < maxTrimX &&
                isDarkCol(trimX) &&
                isDarkCol(w - 1 - trimX)) {
              trimX++;
            }
            if (trimX >= 4 && w - trimX * 2 >= 32) {
              left = trimX.toDouble();
              right = (w - trimX).toDouble();
            }
          }
        }
      } catch (_) {}
    }

    final cw = right - left;
    final ch = bottom - top;
    final side = math.min(cw, ch);
    return Rect.fromLTWH(
      left + (cw - side) / 2,
      top + (ch - side) / 2,
      side,
      side,
    );
  }

  Future<BleedArtwork> _render(String key, ui.Image src) async {
    // centre-crop to a square ("cover"), trimming letterbox bars on 4:3/16:9 thumbs
    final srcRect = await computeContentSquare(src);

    // Bake backdrop and full-size artwork in parallel for 2x faster completion:
    final results = await Future.wait([
      _bakeBackdrop(src, srcRect),
      _bakeArtwork(src, srcRect),
    ]);
    final backdrop = results[0];
    final artwork = results[1];
    final stats = await _analyse(backdrop);

    return BleedArtwork(
      key: key,
      image: artwork,
      backdrop: backdrop,
      average: stats.average,
      scrim: stats.scrim,
    );
  }

  static void _edgeMask(
    Canvas canvas,
    Rect rect,
    double from,
    double to, {
    bool horizontal = false,
  }) {
    if (to <= 0) return;
    final s = horizontal ? rect.width : rect.height;
    void band(Offset a, Offset b) {
      canvas.drawRect(
        rect,
        Paint()
          ..blendMode = BlendMode.dstIn
          ..shader = ui.Gradient.linear(a, b, _kRamp, _kRampStops),
      );
    }

    if (horizontal) {
      band(Offset(s * from, 0), Offset(s * to, 0)); // left
      band(Offset(s * (1 - from), 0), Offset(s * (1 - to), 0)); // right
    } else {
      band(Offset(0, s * from), Offset(0, s * to)); // top
      band(Offset(0, s * (1 - from)), Offset(0, s * (1 - to))); // bottom
    }
  }

  Future<ui.Image> _bakeArtwork(ui.Image src, Rect srcRect) async {
    const s = _kBakePx * 1.0;
    const rect = Rect.fromLTWH(0, 0, s, s);
    final rec = ui.PictureRecorder();
    final canvas = Canvas(rec, rect);
    final imgPaint = Paint()..filterQuality = FilterQuality.high;

    canvas.saveLayer(rect, Paint());

    // 1. blurred copy: this is what the edges show
    canvas.saveLayer(
      rect,
      Paint()
        ..imageFilter = ui.ImageFilter.blur(
          sigmaX: _kEdgeSigma,
          sigmaY: _kEdgeSigma,
          tileMode: TileMode.clamp,
        ),
    );
    canvas.drawImageRect(src, srcRect, rect, imgPaint);
    canvas.restore();

    // 2. sharp copy, faded out towards EVERY edge
    canvas.saveLayer(rect, Paint());
    canvas.drawImageRect(src, srcRect, rect, imgPaint);
    _edgeMask(canvas, rect, _kSharpFrom, _kSharpTo);
    _edgeMask(canvas, rect, _kSideSharpFrom, _kSideSharpTo, horizontal: true);
    canvas.restore();

    // 3. whole result melts into transparency at the very edge
    _edgeMask(canvas, rect, 0, _kFeatherOuter);
    _edgeMask(canvas, rect, 0, _kSideOuter, horizontal: true);
    canvas.restore();

    final pic = rec.endRecording();
    final img = await pic.toImage(_kBakePx, _kBakePx);
    pic.dispose();
    return img;
  }

  Future<ui.Image> _bakeBackdrop(ui.Image src, Rect srcRect) async {
    const s = _kBackdropPx * 1.0;
    const rect = Rect.fromLTWH(0, 0, s, s);
    final rec = ui.PictureRecorder();
    final canvas = Canvas(rec, rect);

    canvas.saveLayer(
      rect,
      Paint()
        ..imageFilter = ui.ImageFilter.blur(
          sigmaX: 5,
          sigmaY: 5,
          tileMode: TileMode.clamp,
        ),
    );
    canvas.drawImageRect(
      src,
      srcRect,
      rect,
      Paint()
        ..filterQuality = FilterQuality.medium
        ..colorFilter = const ColorFilter.matrix(_kSatMatrix),
    );
    canvas.restore();

    final pic = rec.endRecording();
    final img = await pic.toImage(_kBackdropPx, _kBackdropPx);
    pic.dispose();
    return img;
  }

  /// Average colour + how strong the scrim has to be (tiny image: 36 KB).
  Future<_Stats> _analyse(ui.Image img) async {
    final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (data == null) return const _Stats(_kFallbackEdge, 0.45);
    final b = data.buffer.asUint8List();
    var r = 0.0, g = 0.0, bl = 0.0;
    var n = 0;
    // Step by 16 bytes (every 4th pixel) for 4x faster loop with identical statistical accuracy:
    for (var i = 0; i + 3 < b.length; i += 16) {
      if (b[i + 3] < 16) continue;
      r += b[i];
      g += b[i + 1];
      bl += b[i + 2];
      n++;
    }
    if (n == 0) return const _Stats(_kFallbackEdge, 0.45);
    final avg = Color.fromARGB(
      255,
      (r / n).round().clamp(0, 255),
      (g / n).round().clamp(0, 255),
      (bl / n).round().clamp(0, 255),
    );
    final lum = (0.2126 * r + 0.7152 * g + 0.0722 * bl) / (n * 255.0);
    final k = (lum / 0.8).clamp(0.0, 1.0);
    final scrim = 0.30 + 0.34 * (k * k * (3 - 2 * k));
    return _Stats(avg, scrim);
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Artwork widget                                                         */
/* ────────────────────────────────────────────────────────────────────── */

/// The cover inside the morphing overlay.
///
///  • while the bake is not ready (or for video) only [plain] is shown;
///  • while the cover FLIES (mini <-> big <-> header) only [plain] is drawn:
///    a single cheap image draw, no cross-fade, no second layer;
///  • when the cover has settled in the big position, the feathered square
///    cross-fades in over [plain] in the last few percent of the open, and
///    cross-fades out again in the first few percent of a dock / close.
///
/// The baked image is already feathered, so no ShaderMask is needed per frame.
/// The tree has a FIXED shape, so [plain] is never remounted (no flicker).
class BleedArtworkImage extends StatefulWidget {
  const BleedArtworkImage({
    super.key,
    required this.art,
    required this.plain,
    required this.dock,
    required this.sheet,
  });

  final BleedArtwork? art;
  final Widget plain;
  final Animation<double> dock;
  final Animation<double> sheet;

  @override
  State<BleedArtworkImage> createState() => _BleedArtworkImageState();
}

class _BleedArtworkImageState extends State<BleedArtworkImage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _appear = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 320),
  );
  String? _key;

  @override
  void initState() {
    super.initState();
    _key = widget.art?.key;
    if (_key != null) _appear.value = 1.0;
  }

  @override
  void didUpdateWidget(BleedArtworkImage old) {
    super.didUpdateWidget(old);
    final k = widget.art?.key;
    if (k == _key) return;
    _key = k;
    if (k == null) {
      _appear.value = 0;
    } else {
      _appear.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _appear.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final art = widget.art;
    return AnimatedBuilder(
      animation: Listenable.merge([_appear, widget.dock, widget.sheet]),
      child: widget.plain,
      builder: (_, plain) {
        final t = widget.sheet.value.clamp(0.0, 1.0);
        final d = widget.dock.value.clamp(0.0, 1.0);
        // Only blends in once settled (last 8% of the open) and out again
        // within the first 15% of the dock glide: never during the flight.
        final settled = _smooth01((t - 0.92) / 0.08);
        final undocked = 1 - _smooth01(d / 0.15);
        final appear = Curves.easeOut.transform(_appear.value);
        final bakedO = art == null ? 0.0 : appear * settled * undocked;

        return Stack(
          fit: StackFit.expand,
          children: [
            // Opacity(1.0) is free (no layer); it keeps the element tree stable.
            Opacity(opacity: (1 - bakedO).clamp(0.0, 1.0), child: plain),
            if (art != null && bakedO > 0.001)
              Opacity(
                opacity: bakedO,
                child: RawImage(
                  image: art.image,
                  fit: BoxFit.fill,
                  // mipmapped: no shimmer while the cover scales
                  filterQuality: FilterQuality.medium,
                ),
              ),
          ],
        );
      },
    );
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Full-screen backdrop                                                   */
/* ────────────────────────────────────────────────────────────────────── */

/// Slow liquid motion that never jumps: ONE source image, an opaque base that
/// only breathes a few percent, and two big translucent layers gliding in
/// opposite phase over the whole screen (swaying ±16°, never spinning).
/// All frequencies are integers, so phase 1.0 wraps into 0.0 without a seam.
class _FlowPainter extends CustomPainter {
  _FlowPainter(this.image, this.t, this.scrim) : super(repaint: t);
  final ui.Image image;
  final ValueListenable<double> t;
  final double scrim;

  static const _crops = <Rect>[
    Rect.fromLTWH(0.00, 0.00, 0.85, 0.85),
    Rect.fromLTWH(0.15, 0.15, 0.85, 0.85),
  ];
  static const _alpha = [0.55, 0.45];

  @override
  void paint(Canvas canvas, Size size) {
    final a = t.value * 2 * math.pi;
    final w = size.width, h = size.height;
    final iw = image.width.toDouble(), ih = image.height.toDouble();
    final paint = Paint()..filterQuality = FilterQuality.low;

    // 1. opaque base: cover-fit, slowly breathing + drifting (always covers)
    final aspect = w / h;
    final baseSrc = aspect < 1
        ? Rect.fromLTWH(iw * (1 - aspect) / 2, 0, iw * aspect, ih)
        : Rect.fromLTWH(0, ih * (1 - 1 / aspect) / 2, iw, ih / aspect);
    final k = 1.16 + 0.04 * math.sin(a);
    canvas.drawImageRect(
      image,
      baseSrc,
      Rect.fromCenter(
        center: Offset(
          w * (0.5 + 0.025 * math.cos(a)),
          h * (0.5 + 0.02 * math.sin(a)),
        ),
        width: w * k,
        height: h * k,
      ),
      paint,
    );

    // 2. two big layers drifting across the whole screen
    final side = size.longestSide * 2.1; // edges stay off-screen
    for (var i = 0; i < 2; i++) {
      final ph = i * math.pi;
      final cx = w * (0.5 + 0.20 * math.cos(a + ph));
      final cy = h * (0.5 + 0.16 * math.sin(2 * a + ph));
      final sway = 0.28 * math.sin(a + ph * 0.5);
      final breath = 1.0 + 0.05 * math.sin(2 * a + ph);
      final c = _crops[i];

      canvas.save();
      canvas.translate(cx, cy);
      canvas.rotate(sway);
      canvas.drawImageRect(
        image,
        Rect.fromLTWH(c.left * iw, c.top * ih, c.width * iw, c.height * ih),
        Rect.fromCenter(
          center: Offset.zero,
          width: side * breath,
          height: side * breath,
        ),
        Paint()
          ..filterQuality = FilterQuality.low
          ..color = Colors.white.withValues(alpha: _alpha[i]),
      );
      canvas.restore();
    }

    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = Colors.black.withValues(alpha: scrim),
    );
  }

  @override
  bool shouldRepaint(covariant _FlowPainter o) =>
      o.image != image || o.scrim != scrim;
}

class _Layer {
  const _Layer(this.id, this.widget, {this.isArt = false});
  final String id;
  final Widget widget;
  final bool isArt; // built from a baked cover (can be held while a new bakes)

  factory _Layer.of(
    BleedArtwork? art,
    List<Color> fallback,
    ValueListenable<double>? flow,
  ) {
    if (art != null && flow != null) {
      return _Layer(
        'flow:${art.key}',
        KeyedSubtree(
          key: ValueKey('flow:${art.key}'),
          child: RepaintBoundary(
            child: CustomPaint(
              size: Size.infinite,
              painter: _FlowPainter(art.backdrop, flow, art.scrim),
            ),
          ),
        ),
        isArt: true,
      );
    }
    if (art != null) {
      return _Layer(
        'art:${art.key}',
        KeyedSubtree(
          key: ValueKey('art:${art.key}'),
          child: RawImage(
            image: art.backdrop,
            fit: BoxFit.cover,
            filterQuality: FilterQuality.high,
            color: Colors.black.withValues(alpha: art.scrim),
            colorBlendMode: BlendMode.srcOver,
          ),
        ),
        isArt: true,
      );
    }
    // constant id: palette colours arriving later morph in, no extra crossfade
    return _Layer(
      'fb',
      KeyedSubtree(
        key: const ValueKey('fb'),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 500),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: fallback,
            ),
          ),
        ),
      ),
    );
  }
}

/// Full-screen blurred backdrop of the current cover. On a track change the
/// OLD backdrop stays until the new cover is baked, then crossfades ONCE.
class BleedBackdrop extends StatefulWidget {
  const BleedBackdrop({
    super.key,
    this.coverUrl = '',
    this.trackId = '',
    required this.art,
    required this.fallback,
    this.pending = false,
    this.flow = true,
    this.isPlaying = true,
    this.positionNotifier,
    this.duration,
    this.paused,
  });

  final String coverUrl;
  final String trackId;
  final BleedArtwork? art;

  /// At least two colours, used only while nothing has been baked yet.
  final List<Color> fallback;

  /// true while [art] is still being baked: keeps the current backdrop.
  final bool pending;

  final bool flow;
  final bool isPlaying;
  final ValueListenable<Duration>? positionNotifier;
  final Duration? duration;

  /// While this returns true the drift is frozen (sheet is moving).
  final bool Function()? paused;

  @override
  State<BleedBackdrop> createState() => _BleedBackdropState();
}

class _BleedBackdropState extends State<BleedBackdrop>
    with TickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
    value: 1,
  );
  late final Ticker _ticker = createTicker(_onTick);
  final ValueNotifier<double> _phaseNotifier = ValueNotifier<double>(0.0);
  double _phase = 0.0;
  double _speed = 1.0;
  double _sinceRepaint = 0.0;
  Duration? _lastTick;
  bool _xfSynced = false;
  String _activeTrackId = '';
  String _activeCoverUrl = '';

  late _Layer _to = _makeLayer();
  _Layer? _from;

  _Layer _makeLayer() => _Layer.of(
    widget.art,
    widget.fallback,
    widget.flow ? _phaseNotifier : null,
  );

  @override
  void initState() {
    super.initState();
    _activeTrackId = widget.trackId;
    _activeCoverUrl = widget.coverUrl;
    _c.addStatusListener((s) {
      if (s == AnimationStatus.completed) _from = null;
    });
    CrossfadeController.instance.session.addListener(_onXfSession);
    _syncTicker();
  }

  void _onXfSession() {
    if (_xfSynced && CrossfadeController.instance.session.value == null && mounted) {
      setState(() {
        _xfSynced = false;
        _from = null;
      });
    }
  }

  void _onTick(Duration elapsed) {
    if (!mounted) return;
    final last = _lastTick;
    _lastTick = elapsed;
    if (last == null) return;
    if (widget.paused?.call() ?? false) return;

    var dt = (elapsed - last).inMicroseconds / 1000000.0;
    if (dt <= 0) return;
    if (dt > 0.1) dt = 1 / 60;

    double target = 0.5; // paused: gentle drift
    if (widget.isPlaying) {
      double progress = 0.5;
      final dur = widget.duration;
      final pos = widget.positionNotifier?.value;
      if (dur != null && dur.inMilliseconds > 0 && pos != null) {
        progress = (pos.inMilliseconds / dur.inMilliseconds).clamp(0.0, 1.0);
      }
      target = 1.0 + 1.4 * math.sin(math.pi * progress);
    }
    _speed += (target - _speed) * math.min(1.0, dt * 3); // no speed jumps

    const basePeriod = 20.0;
    _phase = (_phase + (dt / basePeriod) * _speed) % 1.0;

    // Repaint the full-screen painter at ~30 fps only.
    _sinceRepaint += dt;
    if (_sinceRepaint >= _kFlowInterval - 0.004) {
      _sinceRepaint = 0;
      _phaseNotifier.value = _phase;
    }
  }

  void _syncTicker() {
    final shouldRun = widget.flow && widget.isPlaying;
    if (shouldRun && !_ticker.isActive) {
      _lastTick = null;
      _ticker.start();
    } else if (!shouldRun && _ticker.isActive) {
      _ticker.stop();
      _lastTick = null;
    }
  }

  @override
  void didUpdateWidget(BleedBackdrop old) {
    super.didUpdateWidget(old);
    _syncTicker();

    final bool songChanged =
        (widget.trackId.isNotEmpty && widget.trackId != _activeTrackId) ||
        (widget.coverUrl.isNotEmpty && widget.coverUrl != _activeCoverUrl);

    if (songChanged) {
      _activeTrackId = widget.trackId;
      _activeCoverUrl = widget.coverUrl;
    }

    // If song changed and we don't have the baked art yet, do NOT freeze the
    // old song's artwork on screen! Crossfade immediately to the new song's
    // fallback colors or fresh ambient layer:
    if (songChanged && widget.art == null) {
      final next = _Layer.of(
        null,
        widget.fallback,
        widget.flow ? _phaseNotifier : null,
      );
      _from = _to;
      _to = next;
      _c.forward(from: 0);
      return;
    }

    // Next cover still baking for the SAME song: keep what is on screen
    if (!songChanged && widget.art == null && widget.pending && _to.isArt) {
      return;
    }

    final next = _makeLayer();
    if (next.id == _to.id) {
      if (!next.isArt) _to = next; // fallback: refresh colours smoothly
      return;
    }
    if (_ticker.muted) {
      // sheet is hidden: swap silently so no crossfade plays on next open
      _from = null;
      _to = next;
      _c.value = 1;
      return;
    }
    _from = _to;
    _to = next;
    if (CrossfadeController.instance.session.value != null) {
      _xfSynced = true;
      _c.value = 1; // progress comes from the crossfade clock
    } else {
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    CrossfadeController.instance.session.removeListener(_onXfSession);
    _ticker.dispose();
    _phaseNotifier.dispose();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: Stack(
        fit: StackFit.expand,
        children: [
          AnimatedBuilder(
            animation: Listenable.merge([_c, CrossfadeController.instance.progress]),
            builder: (_, _) {
              final xf = CrossfadeController.instance;
              final s = xf.session.value;
              final t = (_xfSynced && s != null)
                  ? CrossfadeCurves.visual(s.style, xf.progress.value).$2
                  : Curves.easeInOut.transform(_c.value);
              final from = _from;
              return Stack(
                fit: StackFit.expand,
                children: [
                  if (from != null && (_xfSynced || _c.value < 1)) from.widget,
                  Opacity(opacity: t, child: _to.widget),
                ],
              );
            },
          ),
          const IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x59000000),
                    Color(0x00000000),
                    Color(0x00000000),
                    Color(0x59000000),
                  ],
                  stops: [0.0, 0.2, 0.6, 1.0],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
