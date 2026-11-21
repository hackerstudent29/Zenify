import 'dart:async';
import 'dart:collection';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

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

/// Outer feather: alpha 0 at the very edge -> 1 at this fraction of the side.
const double _kFeatherOuter = 0.18;

/// The sharp copy of the artwork fades in between these two fractions, the
/// blurred copy shows through before that. => only the edges are blurred.
const double _kSharpFrom = 0.06;
const double _kSharpTo = 0.28;

/// Blur strength of the edge copy (in baked pixels).
const double _kEdgeSigma = 24;

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
      debugPrint('BleedArtwork: fast bake failed ($e)');
    } finally {
      src?.dispose();
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
        .timeout(const Duration(seconds: 4))
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

  /// Multiplies the layer's alpha by a feather ONLY on top and bottom:
  /// left and right stay 100% crisp and unblurred to fit screen edges.
  static void _edgeMask(Canvas canvas, Rect rect, double from, double to) {
    final s = rect.height;
    void band(Offset a, Offset b) {
      canvas.drawRect(
        rect,
        Paint()
          ..blendMode = BlendMode.dstIn
          ..shader = ui.Gradient.linear(a, b, _kRamp, _kRampStops),
      );
    }

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

    // 2. sharp copy, faded out towards the top / bottom edges
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
/// The baked image is already feathered, so no ShaderMask is needed per frame.
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

/// Slow liquid motion: an opaque base plus four big blobs that drift across
/// the WHOLE screen. All motion frequencies are INTEGERS, so phase 1.0 wraps
/// back to phase 0.0 with no visible jump. Each blob shows a different crop
/// of the cover, so colours really move around instead of one image wobbling
/// in a corner.
class _FlowPainter extends CustomPainter {
  _FlowPainter(this.image, this.t, this.scrim) : super(repaint: t);
  final ui.Image image;
  final ValueListenable<double> t;
  final double scrim;

  // Different crops of the cover so each blob carries different colours.
  static const _crops = <Rect>[
    Rect.fromLTWH(0.00, 0.00, 0.60, 0.60),
    Rect.fromLTWH(0.40, 0.40, 0.60, 0.60),
    Rect.fromLTWH(0.40, 0.00, 0.60, 0.60),
    Rect.fromLTWH(0.00, 0.40, 0.60, 0.60),
  ];
  static const _kx = [1, 2, 1, 3];
  static const _ky = [2, 1, 3, 1];
  static const _dir = [1.0, -1.0, 1.0, -1.0];
  static const _alpha = [0.80, 0.72, 0.68, 0.62];

  @override
  void paint(Canvas canvas, Size size) {
    final a = t.value * 2 * math.pi;
    final w = size.width, h = size.height;
    final iw = image.width.toDouble(), ih = image.height.toDouble();

    // 1. opaque base: cover-fit crop of the whole backdrop
    final aspect = w / h;
    final baseSrc = aspect < 1
        ? Rect.fromLTWH(iw * (1 - aspect) / 2, 0, iw * aspect, ih)
        : Rect.fromLTWH(0, ih * (1 - 1 / aspect) / 2, iw, ih / aspect);
    canvas.drawImageRect(
      image,
      baseSrc,
      Offset.zero & size,
      Paint()..filterQuality = FilterQuality.medium,
    );

    // 2. four big blobs drifting across the WHOLE screen
    final side = size.longestSide * 2.2; // edges stay off-screen
    for (var i = 0; i < _crops.length; i++) {
      final ph = i * 1.57;
      final cx = w * (0.5 + 0.42 * math.cos(a * _kx[i] + ph));
      final cy = h * (0.5 + 0.38 * math.sin(a * _ky[i] + ph * 1.3));
      final breath = 1.0 + 0.08 * math.sin(a * 2 + ph);
      final c = _crops[i];
      final src = Rect.fromLTWH(
        c.left * iw,
        c.top * ih,
        c.width * iw,
        c.height * ih,
      );

      canvas.save();
      canvas.translate(cx, cy);
      canvas.rotate(a * _dir[i] + ph);
      canvas.drawImageRect(
        image,
        src,
        Rect.fromCenter(
          center: Offset.zero,
          width: side * breath,
          height: side * breath,
        ),
        Paint()
          ..filterQuality = FilterQuality.medium
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
  const _Layer(this.id, this.widget);
  final String id;
  final Widget widget;

  factory _Layer.of(
    String coverUrl,
    BleedArtwork? art,
    List<Color> fallback, [
    ValueListenable<double>? flow,
  ]) {
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
            // bicubic: the 96 px blur is stretched over the whole screen
            filterQuality: FilterQuality.high,
            color: Colors.black.withValues(alpha: art.scrim),
            colorBlendMode: BlendMode.srcOver,
          ),
        ),
      );
    }
    if (coverUrl.isNotEmpty) {
      return _Layer(
        'url:$coverUrl',
        KeyedSubtree(
          key: ValueKey('url:$coverUrl'),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Rich fallback gradient always active underneath: never flashes pitch black
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: fallback,
                  ),
                ),
              ),
              ImageFiltered(
                imageFilter: ui.ImageFilter.blur(
                  sigmaX: 52,
                  sigmaY: 52,
                  tileMode: TileMode.clamp,
                ),
                child: flow != null
                    ? ValueListenableBuilder<double>(
                        valueListenable: flow,
                        builder: (_, phase, child) {
                          final a = phase * 2 * math.pi;
                          return Transform.translate(
                            offset: Offset(
                              math.cos(a) * 24,
                              math.sin(a * 1.3) * 20,
                            ),
                            child: Transform.rotate(
                              angle: math.sin(a * 0.7) * 0.12,
                              child: Transform.scale(
                                scale: 1.35 + 0.08 * math.sin(a),
                                child: child,
                              ),
                            ),
                          );
                        },
                        child: CachedNetworkImage(
                          imageUrl: coverUrl,
                          memCacheWidth: 120,
                          memCacheHeight: 120,
                          fit: BoxFit.cover,
                          fadeInDuration: Duration.zero,
                          fadeOutDuration: Duration.zero,
                          errorWidget: (_, _, _) => const SizedBox.shrink(),
                        ),
                      )
                    : Transform.scale(
                        scale: 1.25,
                        child: CachedNetworkImage(
                          imageUrl: coverUrl,
                          memCacheWidth: 120,
                          memCacheHeight: 120,
                          fit: BoxFit.cover,
                          fadeInDuration: Duration.zero,
                          fadeOutDuration: Duration.zero,
                          errorWidget: (_, _, _) => const SizedBox.shrink(),
                        ),
                      ),
              ),
              ColoredBox(color: Colors.black.withValues(alpha: 0.22)),
            ],
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
  const BleedBackdrop({
    super.key,
    this.coverUrl = '',
    required this.art,
    required this.fallback,
    this.flow = true,
    this.isPlaying = true,
    this.positionNotifier,
    this.duration,
  });

  final String coverUrl;
  final BleedArtwork? art;

  /// At least two colours, used only while no baked backdrop exists.
  final List<Color> fallback;

  /// Whether fluid backdrop motion is enabled.
  final bool flow;

  /// Playback state to pause motion when playback is paused.
  final bool isPlaying;

  /// Live position notifier for variable song-progress velocity.
  final ValueListenable<Duration>? positionNotifier;

  /// Total duration of the current track.
  final Duration? duration;

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
  Duration? _lastTick;

  late _Layer _to = _Layer.of(
    widget.coverUrl,
    widget.art,
    widget.fallback,
    widget.flow ? _phaseNotifier : null,
  );
  _Layer? _from;

  @override
  void initState() {
    super.initState();
    _syncTicker();
  }

  /// Runs at ~30fps (the motion is slow, 60fps would only double GPU cost)
  /// with a smoothed speed so play / pause / song progress never jerk it.
  void _onTick(Duration elapsed) {
    if (!mounted) return;
    final last = _lastTick;
    if (last == null) {
      _lastTick = elapsed;
      return;
    }
    var dt = (elapsed - last).inMicroseconds / 1000000.0;
    if (dt < 1 / 30) return; // throttle; _lastTick kept so dt accumulates
    _lastTick = elapsed;
    if (dt > 0.1) dt = 1 / 30;

    double target = 0.5; // paused: gentle drift
    if (widget.isPlaying) {
      double progress = 0.5;
      final dur = widget.duration;
      final pos = widget.positionNotifier?.value;
      if (dur != null && dur.inMilliseconds > 0 && pos != null) {
        progress = (pos.inMilliseconds / dur.inMilliseconds).clamp(0.0, 1.0);
      }
      target = 1.0 + 1.4 * math.sin(math.pi * progress); // 1.0 -> 2.4 -> 1.0
    }
    _speed += (target - _speed) * math.min(1.0, dt * 3); // no speed jumps

    const basePeriod = 20.0;
    _phase = (_phase + (dt / basePeriod) * _speed) % 1.0;
    _phaseNotifier.value = _phase;
  }

  void _syncTicker() {
    final shouldRun = widget.flow;
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
    final next = _Layer.of(
      widget.coverUrl,
      widget.art,
      widget.fallback,
      widget.flow ? _phaseNotifier : null,
    );
    if (next.id == _to.id) return;
    _from = _to;
    _to = next;
    _c.forward(from: 0);
  }

  @override
  void dispose() {
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