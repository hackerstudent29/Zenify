import 'dart:async';
import 'dart:collection';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Apple Music style artwork + backdrop.
///
/// Every cover is decoded ONCE and baked into two small images:
///
///  1. [BleedArtwork.image]  (720 px square)
///     The artwork with its EDGES blurred and feathered into transparency on
///     all four sides. The centre stays perfectly sharp, nothing at the bottom
///     is blurred more than the other edges, and there is no visible border:
///     the picture simply melts into the backdrop behind it.
///
///  2. [BleedArtwork.backdrop]  (96 px square)
///     A heavily blurred, slightly more saturated copy. It is drawn
///     full-screen (BoxFit.cover) behind EVERYTHING (artwork view, lyrics,
///     queue), and cross-fades whenever the song changes.
///
/// Because all blurring is baked, flying / scaling / docking the cover and the
/// backdrop are plain image draws: no ImageFilter, no BackdropFilter and no
/// saveLayer per frame.

const int _kBakePx = 720;
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

/// Outer feather: alpha 0 at the very edge -> 1 at this fraction of the side.
const double _kFeatherOuter = 0.12;

/// The sharp copy of the artwork fades in between these two fractions, the
/// blurred copy shows through before that. => only the edges are blurred.
const double _kSharpFrom = 0.04;
const double _kSharpTo = 0.22;

/// Blur strength of the edge copy (in baked pixels).
const double _kEdgeSigma = 16;

const Color _kFallbackEdge = Color(0xFF2A2A30);

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

  static const int _maxEntries = 8;

  // Evicted images are NOT disposed on purpose: a widget may still be drawing
  // them. They are small and released by the GC.
  final LinkedHashMap<String, BleedArtwork> _cache =
      LinkedHashMap<String, BleedArtwork>();
  final Map<String, Future<BleedArtwork?>> _inflight = {};

  BleedArtwork? peek(String key) {
    final hit = _cache.remove(key);
    if (hit != null) _cache[key] = hit; // LRU touch
    return hit;
  }

  /// Bakes (or returns the cached bake of) [key]. Returns null on failure.
  Future<BleedArtwork?> load(String key, ImageProvider provider) {
    final hit = peek(key);
    if (hit != null) return Future.value(hit);
    return _inflight[key] ??= _bake(
      key,
      provider,
    ).whenComplete(() => _inflight.remove(key));
  }

  Future<BleedArtwork?> _bake(String key, ImageProvider provider) async {
    // two attempts: a flaky network / decode must not leave the screen
    // without its backdrop
    for (var attempt = 0; attempt < 2; attempt++) {
      ui.Image? src;
      try {
        src = await _decode(provider);
        final art = await _render(key, src);
        _cache[key] = art;
        while (_cache.length > _maxEntries) {
          _cache.remove(_cache.keys.first);
        }
        return art;
      } catch (e) {
        debugPrint('BleedArtwork: bake failed ($e)');
        if (attempt == 0) {
          await Future<void>.delayed(const Duration(milliseconds: 400));
        }
      } finally {
        src?.dispose();
      }
    }
    return null;
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
    // centre-crop to a square ("cover"), so 16:9 thumbnails work too
    final side = math.min(src.width, src.height).toDouble();
    final srcRect = Rect.fromLTWH(
      (src.width - side) / 2,
      (src.height - side) / 2,
      side,
      side,
    );

    final artwork = await _bakeArtwork(src, srcRect);
    final backdrop = await _bakeBackdrop(src, srcRect);
    final stats = await _analyse(backdrop);

    return BleedArtwork(
      key: key,
      image: artwork,
      backdrop: backdrop,
      average: stats.average,
      scrim: stats.scrim,
    );
  }

  /// Multiplies the layer's alpha by a feather on all four sides:
  /// 0 at the edge -> 1 at [to] (fractions of the side).
  static void _edgeMask(Canvas canvas, Rect rect, double from, double to) {
    final s = rect.width;
    void band(Offset a, Offset b) {
      canvas.drawRect(
        rect,
        Paint()
          ..blendMode = BlendMode.dstIn
          ..shader = ui.Gradient.linear(a, b, _kRamp, _kRampStops),
      );
    }

    band(Offset(s * from, 0), Offset(s * to, 0)); // left
    band(Offset(s * (1 - from), 0), Offset(s * (1 - to), 0)); // right
    band(Offset(0, s * from), Offset(0, s * to)); // top
    band(Offset(0, s * (1 - from)), Offset(0, s * (1 - to))); // bottom
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

    // 2. sharp copy, faded out towards ALL four edges (same on every side,
    //    so the bottom is never blurred more than the top / left / right)
    canvas.saveLayer(rect, Paint());
    canvas.drawImageRect(src, srcRect, rect, imgPaint);
    _edgeMask(canvas, rect, _kSharpFrom, _kSharpTo);
    canvas.restore();

    // 3. whole result melts into transparency at the very edge: no border
    _edgeMask(canvas, rect, 0, _kFeatherOuter);
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
    for (var i = 0; i + 3 < b.length; i += 4) {
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
///  • when ready, the feathered square fades in over [plain] and [plain] fades
///    out (so its hard edges never show under the feathered edges);
///  • when the cover opens from the mini player / docks into the header the
///    plain cover takes over again (small covers should not be feathered).
///
/// The tree has a fixed shape, so [plain] is never remounted (no flicker).
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
    if (_key != null) _appear.forward();
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
        final open = Curves.easeOut.transform(
          ((t - 0.3) / 0.7).clamp(0.0, 1.0),
        );
        final appear = Curves.easeOut.transform(_appear.value);
        final bakedO = art == null ? 0.0 : appear * open * (1 - d);

        return Stack(
          fit: StackFit.expand,
          children: [
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

class _Layer {
  const _Layer(this.id, this.widget);
  final String id;
  final Widget widget;

  factory _Layer.of(BleedArtwork? art, List<Color> fallback) {
    if (art != null) {
      return _Layer(
        'art:${art.key}',
        KeyedSubtree(
          key: ValueKey('art:${art.key}'),
          child: RawImage(
            image: art.backdrop,
            fit: BoxFit.cover,
            // bicubic: the 96 px blur is stretched over the whole screen
            filterQuality: FilterQuality.high,
            color: Colors.black.withValues(alpha: art.scrim),
            colorBlendMode: BlendMode.srcOver,
          ),
        ),
      );
    }
    final id = 'fb:${Object.hashAll(fallback)}';
    return _Layer(
      id,
      KeyedSubtree(
        key: ValueKey(id),
        child: DecoratedBox(
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

/// Full-screen blurred backdrop of the current cover. Used in the artwork
/// view AND in lyrics / queue. When the track changes the new backdrop fades
/// in OVER the old one (no dark dip), and if a bake ever fails a palette
/// gradient is shown instead, so the screen is never left without a backdrop.
class BleedBackdrop extends StatefulWidget {
  const BleedBackdrop({super.key, required this.art, required this.fallback});

  final BleedArtwork? art;

  /// At least two colours, used only while no baked backdrop exists.
  final List<Color> fallback;

  @override
  State<BleedBackdrop> createState() => _BleedBackdropState();
}

class _BleedBackdropState extends State<BleedBackdrop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
    value: 1,
  );
  late _Layer _to = _Layer.of(widget.art, widget.fallback);
  _Layer? _from;

  @override
  void didUpdateWidget(BleedBackdrop old) {
    super.didUpdateWidget(old);
    final next = _Layer.of(widget.art, widget.fallback);
    if (next.id == _to.id) return;
    _from = _to;
    _to = next;
    _c.forward(from: 0);
  }

  @override
  void dispose() {
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
            animation: _c,
            builder: (_, _) {
              final t = Curves.easeInOut.transform(_c.value);
              final from = _from;
              return Stack(
                fit: StackFit.expand,
                children: [
                  if (from != null && _c.value < 1) from.widget,
                  Opacity(opacity: t, child: _to.widget),
                ],
              );
            },
          ),
          // static scrims: clean dark status-bar area + calm area behind the
          // controls, whatever the artwork looks like
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
