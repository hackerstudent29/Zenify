// lib/design_system/widgets/artwork_mesh_background.dart
//
// ArtworkMeshBackground — Apple Music style fluid artwork mesh (Flutter port).
//
// How it stays smooth AND cheap (same architecture as the web version):
//  1. Colour grading + blur are baked ONCE per cover into small soft-edged
//     "blob" tiles (3 crops × 128px). No blur / colour filter runs per frame.
//  2. The scene is painted into a TINY canvas (~128–190px long side) and the
//     compositor bitmap-scales it up (Transform.scale + filterQuality). That
//     bilinear upscale gives the liquid softness for free.
//  3. Motion is real spring physics (semi-implicit Euler, sub-stepped,
//     dt-clamped): every blob chases a wandering waypoint with under-damped
//     springs, so it accelerates, decelerates and overshoots like liquid.
//  4. Zero widget rebuilds while animating: a Ticker drives a repaint-only
//     Listenable. Props like intensity can be fed through a ValueListenable.
//  5. The ticker fully STOPS (no CPU/GPU) when the app is backgrounded, when
//     paused and eased to rest, or when reduced-motion is on. Offscreen
//     routes are muted automatically by TickerMode.
//  6. Adaptive governor: if real frame intervals slip it lowers resolution and
//     then fps by itself. [lowPower] caps to 30 fps (wire it to battery_plus).

import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../tokens/app_colors.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Public widget
// ─────────────────────────────────────────────────────────────────────────────

class ArtworkMeshBackground extends StatefulWidget {
  const ArtworkMeshBackground({
    super.key,
    this.coverUrl,
    this.covers,
    this.paused = false,
    this.speed = 1,
    this.intensity = 0,
    this.intensityListenable,
    this.interactive = true,
    this.dither = true,
    this.lowPower = false,
    this.mediaUrlResolver,
    this.imageProviderBuilder,
    this.fallbackAsset = 'assets/images/z_logo.png',
    this.backgroundColor,
    this.palette,
    this.scrimOpacity = 1.0,
  });

  /// Cover artwork. Falls back to `covers.first`, then to [fallbackAsset].
  final String? coverUrl;
  final List<String>? covers;

  /// Eases motion to a stop (and stops the render loop). Resumes smoothly.
  final bool paused;

  /// Global motion multiplier. 1 = default calm flow.
  final double speed;

  /// Live energy 0..1 (audio level / beat / loudness).
  final double intensity;

  /// Drive intensity at 60 Hz from an audio analyser WITHOUT rebuilding.
  /// Takes precedence over [intensity].
  final ValueListenable<double>? intensityListenable;

  /// Subtle pointer / touch parallax (listens to global pointer events, so it
  /// works even when this widget sits underneath your content).
  final bool interactive;

  /// Tiny static noise layer that removes gradient banding on dark colours.
  final bool dither;

  /// Caps to 30 fps and trims resolution. Feed from battery_plus if you like.
  final bool lowPower;

  /// Maps a raw media path to a full URL (the web app's `getMediaUrl`).
  final String Function(String raw)? mediaUrlResolver;

  /// Custom ImageProvider for a resolved source (e.g. CachedNetworkImageProvider).
  /// Defaults to [NetworkImage].
  final ImageProvider Function(String src)? imageProviderBuilder;

  /// Asset used when there is no cover or it fails to load.
  final String fallbackAsset;

  final Color? backgroundColor;

  /// Optional explicit color palette (e.g. strawberry rose + white) used instead
  /// of decoding a cover image. Generates a soft fluid tile baked with the same
  /// spring-physics multi-directional mesh engine.
  final List<Color>? palette;

  /// Multiplier (0..1) for the bottom readability scrim overlay.
  final double scrimOpacity;

  @override
  State<ArtworkMeshBackground> createState() => _ArtworkMeshBackgroundState();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuning constants (identical to the web version)
// ─────────────────────────────────────────────────────────────────────────────

class _NodeCfg {
  const _NodeCfg({
    required this.ax,
    required this.ay,
    required this.rx,
    required this.ry,
    required this.size,
    required this.osc,
    required this.alpha,
    required this.spin,
    required this.v,
    required this.k,
    required this.z,
    required this.h0,
    required this.h1,
    required this.w1,
    required this.w2,
    required this.ph,
    required this.depth,
  });

  final double ax, ay; // anchor (0..1)
  final double rx, ry; // wander radius around anchor
  final double size, osc; // size (× longest canvas side) and random variation
  final double alpha;
  final double spin; // rad/s (signed)
  final int v; // which artwork crop layer
  final double k, z; // spring stiffness / damping ratio (<1 = overshoot)
  final double h0, h1; // seconds between new waypoints
  final double w1, w2; // idle swirl frequencies
  final double ph; // phase
  final double depth; // pointer parallax depth
}

const List<_NodeCfg> _nodes = [
  _NodeCfg(ax: 0.70, ay: 0.28, rx: 0.22, ry: 0.20, size: 2.1, osc: 0.16, alpha: 0.92, spin: 0.26, v: 0, k: 2.0, z: 0.74, h0: 5, h1: 9, w1: 0.21, w2: 0.17, ph: 0.0, depth: 1.0),
  _NodeCfg(ax: 0.30, ay: 0.72, rx: 0.24, ry: 0.20, size: 2.3, osc: 0.16, alpha: 0.88, spin: -0.30, v: 1, k: 2.4, z: 0.80, h0: 6, h1: 10, w1: 0.18, w2: 0.23, ph: 1.8, depth: 0.7),
  _NodeCfg(ax: 0.26, ay: 0.26, rx: 0.20, ry: 0.22, size: 1.9, osc: 0.18, alpha: 0.80, spin: 0.34, v: 2, k: 2.8, z: 0.70, h0: 4, h1: 8, w1: 0.26, w2: 0.19, ph: 3.2, depth: 1.2),
  _NodeCfg(ax: 0.76, ay: 0.74, rx: 0.20, ry: 0.20, size: 2.0, osc: 0.16, alpha: 0.82, spin: -0.36, v: 1, k: 2.2, z: 0.78, h0: 5, h1: 9, w1: 0.17, w2: 0.24, ph: 4.5, depth: 0.5),
  _NodeCfg(ax: 0.50, ay: 0.50, rx: 0.24, ry: 0.24, size: 2.6, osc: 0.14, alpha: 0.70, spin: 0.18, v: 0, k: 1.6, z: 0.85, h0: 7, h1: 12, w1: 0.14, w2: 0.16, ph: 5.8, depth: 0.3),
];

/// Quality ladder used by the adaptive governor.
class _Level {
  const _Level(this.fps, this.res);
  final double fps;
  final double res;
}

const List<_Level> _levels = [
  _Level(60, 1.0),
  _Level(60, 0.72),
  _Level(30, 0.6),
];

// Tile baking constants
const int _sample = 32; // colour sampling resolution (this is what gives the blur)
const int _tile = 128; // final tile resolution
const double _sat = 1.9;
const double _con = 1.08;
const double _bri = 1.05;

class _Crop {
  const _Crop(this.cx, this.cy, this.z);
  final double cx, cy, z;
}

const List<_Crop> _crops = [
  _Crop(0.5, 0.5, 1.0), // whole artwork
  _Crop(0.5, 0.5, 0.55), // zoomed centre — different colour mix
  _Crop(0.3, 0.7, 0.6), // off-centre detail
];

// ─────────────────────────────────────────────────────────────────────────────
// Tile baking (runs once per cover)
// ─────────────────────────────────────────────────────────────────────────────

/// Three baked blob layers + an average colour. Reference counted so images
/// are disposed as soon as neither the cache nor a widget uses them.
class _Tile {
  _Tile(this.layers, this.avg);

  final List<ui.Image> layers;
  final Color avg;
  int _refs = 1; // the cache's reference

  void retain() => _refs++;

  void release() {
    if (--_refs == 0) {
      for (final l in layers) {
        l.dispose();
      }
    }
  }
}

Future<ui.Image> _renderImage(
  ui.Image src,
  Rect srcRect,
  int size, {
  Color? backdrop,
}) async {
  final recorder = ui.PictureRecorder();
  final dst = Rect.fromLTWH(0, 0, size.toDouble(), size.toDouble());
  final canvas = Canvas(recorder, dst);
  if (backdrop != null) {
    canvas.drawRect(dst, Paint()..color = backdrop);
  }
  canvas.drawImageRect(
    src,
    srcRect,
    dst,
    Paint()
      ..filterQuality = FilterQuality.high
      ..isAntiAlias = true,
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(size, size);
  picture.dispose();
  return image;
}

Rect _full(ui.Image i) =>
    Rect.fromLTWH(0, 0, i.width.toDouble(), i.height.toDouble());

Future<ui.Image> _fromPixels(Uint8List pixels, int w, int h) {
  final c = Completer<ui.Image>();
  ui.decodeImageFromPixels(pixels, w, h, ui.PixelFormat.rgba8888, c.complete);
  return c.future;
}

/// Bake one crop: downsample → vibrancy-aware grade → smooth upscale → soft
/// round alpha mask.
Future<({ui.Image tile, Color avg})> _makeLayer(ui.Image img, _Crop crop) async {
  final iw = img.width.toDouble(), ih = img.height.toDouble();
  final side = math.max(2.0, math.min(iw, ih) * crop.z);
  final sx = (crop.cx * iw - side / 2).clamp(0.0, math.max(0.0, iw - side));
  final sy = (crop.cy * ih - side / 2).clamp(0.0, math.max(0.0, ih - side));
  final src = Rect.fromLTWH(sx.toDouble(), sy.toDouble(), side, side);

  // two-step downsample for a clean average
  final mid =
      await _renderImage(img, src, _sample * 4, backdrop: AppColors.bg);
  final small = await _renderImage(mid, _full(mid), _sample);
  mid.dispose();

  var graded = small;
  var avg = AppColors.bg;
  try {
    final bd = await small.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (bd != null) {
      final d = bd.buffer.asUint8List(bd.offsetInBytes, bd.lengthInBytes);
      double ar = 0, ag = 0, ab = 0;
      var n = 0;
      for (var i = 0; i < d.length; i += 4) {
        final r = d[i].toDouble(), g = d[i + 1].toDouble(), b = d[i + 2].toDouble();
        ar += r;
        ag += g;
        ab += b;
        n++;
        final mx = math.max(r, math.max(g, b));
        final mn = math.min(r, math.min(g, b));
        final sat = mx > 0 ? (mx - mn) / mx : 0.0;
        // already-vivid colours get less boost → no clipping, muted art is lifted
        final boost = 1 + (_sat - 1) * (1 - sat * 0.55);
        final l = 0.299 * r + 0.587 * g + 0.114 * b;
        double grade(double c) =>
            (((l + (c - l) * boost - 128) * _con + 128) * _bri).clamp(0.0, 255.0);
        d[i] = grade(r).round();
        d[i + 1] = grade(g).round();
        d[i + 2] = grade(b).round();
        d[i + 3] = 255;
      }
      graded = await _fromPixels(d, _sample, _sample);
      small.dispose();
      avg = Color.fromARGB(
        255,
        (ar / n * 0.42).toInt(),
        (ag / n * 0.42).toInt(),
        (ab / n * 0.42).toInt(),
      );
    }
  } catch (_) {
    // Pixels unreadable (e.g. some web renderers): keep the ungraded sample.
  }

  // smooth upscale (32 → 64 → 128)
  final up1 = await _renderImage(graded, _full(graded), _tile ~/ 2);
  graded.dispose();
  final up2 = await _renderImage(up1, _full(up1), _tile);
  up1.dispose();

  // soft circular alpha mask → blobs blend with no hard edges
  final rect = Rect.fromLTWH(0, 0, _tile.toDouble(), _tile.toDouble());
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder, rect);
  canvas.saveLayer(rect, Paint());
  canvas.drawImage(up2, Offset.zero, Paint()..filterQuality = FilterQuality.high);
  final shader = const RadialGradient(
    radius: 0.5,
    colors: [
      Color(0xFF000000),
      Color(0xEB000000), // 0.92
      Color(0x59000000), // 0.35
      Color(0x00000000),
    ],
    stops: [0, 0.42, 0.75, 1],
  ).createShader(rect);
  canvas.drawRect(
    rect,
    Paint()
      ..shader = shader
      ..blendMode = BlendMode.dstIn,
  );
  canvas.restore();
  final picture = recorder.endRecording();
  final tile = await picture.toImage(_tile, _tile);
  picture.dispose();
  up2.dispose();

  return (tile: tile, avg: avg);
}

Future<ui.Image> _buildPaletteSourceImage(List<Color> palette) async {
  const int size = _tile; // 128px high-vibrancy mesh palette
  final colors = palette.isNotEmpty
      ? palette
      : const [
          Color(0xFFE11D48),
          Color(0xFFFF4D79),
          Color(0xFFFFFFFF),
          Color(0xFFFFDCE5),
        ];
  final base = colors.first;
  final recorder = ui.PictureRecorder();
  final rect = Rect.fromLTWH(0, 0, size.toDouble(), size.toDouble());
  final canvas = Canvas(recorder, rect);

  canvas.drawRect(rect, Paint()..color = base);

  // Paint rich overlapping multi-directional radial gradients so crops
  // sample distinct contrasting waves (e.g. strawberry rose, pink, white).
  final offsets = <({Offset center, double radius, double stop})>[
    (center: const Offset(0.20, 0.22), radius: 0.75, stop: 0.85),
    (center: const Offset(0.82, 0.18), radius: 0.72, stop: 0.90),
    (center: const Offset(0.50, 0.50), radius: 0.65, stop: 0.80),
    (center: const Offset(0.18, 0.82), radius: 0.78, stop: 0.88),
    (center: const Offset(0.84, 0.78), radius: 0.70, stop: 0.85),
    (center: const Offset(0.48, 0.14), radius: 0.60, stop: 0.75),
    (center: const Offset(0.52, 0.86), radius: 0.65, stop: 0.80),
  ];

  for (var i = 0; i < offsets.length; i++) {
    final spec = offsets[i];
    final c = colors[i % colors.length];
    final center = Offset(spec.center.dx * size, spec.center.dy * size);
    final radius = size * spec.radius;
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..shader = ui.Gradient.radial(
          center,
          radius,
          [c, c.withValues(alpha: 0.0)],
          [0.0, spec.stop],
        ),
    );
  }

  final picture = recorder.endRecording();
  final image = await picture.toImage(size, size);
  picture.dispose();
  return image;
}

Future<_Tile> _bake(ui.Image img) async {
  final layers = <ui.Image>[];
  var avg = AppColors.bg;
  for (var i = 0; i < _crops.length; i++) {
    final r = await _makeLayer(img, _crops[i]);
    layers.add(r.tile);
    if (i == 0) avg = r.avg;
  }
  return _Tile(layers, avg);
}

Future<ui.Image> _resolveImage(ImageProvider provider) {
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
  return completer.future.timeout(const Duration(seconds: 15));
}

/// Small LRU of baked tiles (reopening a player is instant).
abstract final class _TileCache {
  static const int _max = 6;
  static final Map<String, _Tile> _cache = {};
  static final Map<String, Future<_Tile>> _pending = {};

  static _Tile? peek(String key) {
    final t = _cache.remove(key);
    if (t != null) _cache[key] = t; // mark as most recently used
    return t;
  }

  static Future<_Tile> get(String key, ImageProvider Function() provider) {
    final hit = peek(key);
    if (hit != null) return Future.value(hit);
    return _pending[key] ??= _load(key, provider()).whenComplete(() {
      _pending.remove(key);
    });
  }

  static Future<_Tile> getPalette(String key, List<Color> palette) {
    final hit = peek(key);
    if (hit != null) return Future.value(hit);
    return _pending[key] ??= _loadPalette(key, palette).whenComplete(() {
      _pending.remove(key);
    });
  }

  static Future<_Tile> _loadPalette(String key, List<Color> palette) async {
    final img = await _buildPaletteSourceImage(palette);
    try {
      final tile = await _bake(img);
      _cache[key] = tile;
      if (_cache.length > _max) {
        _cache.remove(_cache.keys.first)!.release();
      }
      return tile;
    } finally {
      img.dispose();
    }
  }

  static Future<_Tile> _load(String key, ImageProvider provider) async {
    final img = await _resolveImage(provider);
    try {
      final tile = await _bake(img);
      _cache[key] = tile;
      if (_cache.length > _max) {
        _cache.remove(_cache.keys.first)!.release();
      }
      return tile;
    } finally {
      img.dispose();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation (pure state, repaint-only notifications)
// ─────────────────────────────────────────────────────────────────────────────

class _Node {
  _Node(_NodeCfg c)
      : x = c.ax,
        y = c.ay,
        tx = c.ax,
        ty = c.ay,
        s = c.size,
        ts = c.size,
        r = c.ph,
        rv = c.spin,
        rt = c.spin,
        next = 0;

  double x, y, vx = 0, vy = 0, tx, ty;
  double s, sv = 0, ts;
  double r, rv, rt;
  double next;
}

class _MeshEngine extends ChangeNotifier {
  _MeshEngine({required this.ts}) {
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].next = _rand.nextDouble() * _nodes[i].h0;
      retarget(i);
    }
  }

  final math.Random _rand = math.Random(0x9e3779b1);
  final List<_Node> nodes = [for (final c in _nodes) _Node(c)];

  double t = 0; // simulation time
  double ts; // eased time-scale (pause / resume)
  double energy = 0; // eased intensity
  double px = 0, py = 0, ptx = 0, pty = 0; // eased pointer
  double fade = 1; // crossfade progress

  _Tile? cur;
  _Tile? prev;

  void retarget(int i) {
    final c = _nodes[i], n = nodes[i];
    double sym() => _rand.nextDouble() * 2 - 1;
    n.tx = c.ax + sym() * c.rx * 1.35;
    n.ty = c.ay + sym() * c.ry * 1.35;
    n.ts = c.size * (1 + sym() * c.osc);
    n.rt = c.spin * (0.55 + _rand.nextDouble() * 0.9);
    n.next = t + (c.h0 + _rand.nextDouble() * (c.h1 - c.h0)) * 0.65;
  }

  /// Semi-implicit Euler spring step (sub-stepped by the caller for stability).
  void step(double h) {
    for (var i = 0; i < nodes.length; i++) {
      final c = _nodes[i], n = nodes[i];
      final k = c.k * (1 + energy * 1.2);
      final d = 2 * c.z * math.sqrt(k);
      n.vx += (k * (n.tx - n.x) - d * n.vx) * h;
      n.x += n.vx * h;
      n.vy += (k * (n.ty - n.y) - d * n.vy) * h;
      n.y += n.vy * h;
      const ks = 1.3;
      final ds = 2 * 0.9 * math.sqrt(ks);
      n.sv += (ks * (n.ts - n.s) - ds * n.sv) * h;
      n.s += n.sv * h;
      n.rv += (n.rt - n.rv) * (1 - math.exp(-h * 1.5));
      n.r += n.rv * h;
    }
  }

  void ping() => notifyListeners();

  void releaseTiles() {
    cur?.release();
    prev?.release();
    cur = prev = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Painter
// ─────────────────────────────────────────────────────────────────────────────

class _MeshPainter extends CustomPainter {
  _MeshPainter(this.engine, this.bg) : super(repaint: engine);

  final _MeshEngine engine;
  final Color bg;

  static final Paint _fill = Paint();
  static final Paint _img = Paint()..filterQuality = FilterQuality.low;
  static final Rect _tileRect =
      Rect.fromLTWH(0, 0, _tile.toDouble(), _tile.toDouble());

  @override
  void paint(Canvas canvas, Size size) {
    final e = engine;
    _fill.color = e.cur?.avg ?? bg;
    canvas.drawRect(Offset.zero & size, _fill);

    final f = e.fade;
    final a = f * f * (3 - 2 * f); // smoothstep crossfade
    if (e.prev != null && f < 1) _scene(canvas, size, e.prev!, 1);
    if (e.cur != null) _scene(canvas, size, e.cur!, a);
  }

  void _scene(Canvas canvas, Size size, _Tile tile, double a) {
    final e = engine;
    final w = size.width, h = size.height, m = math.max(w, h);
    for (var i = 0; i < _nodes.length; i++) {
      final c = _nodes[i], n = e.nodes[i];
      final alpha = (a * c.alpha).clamp(0.0, 1.0);
      if (alpha < 0.003) continue;

      final sx = math.sin(e.t * c.w1 * 1.5 + c.ph) * 0.070;
      final sy = math.cos(e.t * c.w2 * 1.5 + c.ph * 1.3) * 0.070;
      final x = (n.x + sx + e.px * c.depth * 0.06) * w;
      final y = (n.y + sy + e.py * c.depth * 0.06) * h;
      final sz = m * n.s * (1 + (e.energy * 0.12 + 0.04) * math.sin(e.t * 1.7 + c.ph));

      _img.color = Color.fromRGBO(255, 255, 255, alpha);
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(n.r);
      canvas.drawImageRect(
        tile.layers[c.v],
        _tileRect,
        Rect.fromLTWH(-sz / 2, -sz / 2, sz, sz),
        _img,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_MeshPainter old) => old.engine != engine || old.bg != bg;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static dither layer
// ─────────────────────────────────────────────────────────────────────────────

Future<ui.Image>? _noiseFuture;

Future<ui.Image> _noise() => _noiseFuture ??= () {
      const s = 96;
      final rnd = math.Random(7);
      final px = Uint8List(s * s * 4);
      for (var i = 0; i < px.length; i += 4) {
        final v = rnd.nextInt(256);
        px[i] = px[i + 1] = px[i + 2] = v;
        px[i + 3] = 255;
      }
      return _fromPixels(px, s, s);
    }();

class _DitherLayer extends StatefulWidget {
  const _DitherLayer();

  @override
  State<_DitherLayer> createState() => _DitherLayerState();
}

class _DitherLayerState extends State<_DitherLayer> {
  ui.Image? _image;

  @override
  void initState() {
    super.initState();
    _noise().then((img) {
      if (mounted) setState(() => _image = img);
    });
  }

  @override
  Widget build(BuildContext context) {
    final img = _image;
    if (img == null) return const SizedBox.shrink();
    return RepaintBoundary(
      child: CustomPaint(
        size: Size.infinite,
        painter: _NoisePainter(img),
      ),
    );
  }
}

class _NoisePainter extends CustomPainter {
  _NoisePainter(this.image);
  final ui.Image image;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..shader = ImageShader(
        image,
        TileMode.repeated,
        TileMode.repeated,
        Matrix4.identity().storage,
      )
      ..colorFilter = ColorFilter.mode(
        Colors.white.withValues(alpha: 0.035),
        BlendMode.modulate,
      );
    canvas.drawRect(Offset.zero & size, paint);
  }

  @override
  bool shouldRepaint(_NoisePainter old) => old.image != image;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

class _ArtworkMeshBackgroundState extends State<ArtworkMeshBackground>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final _MeshEngine _engine;
  late final Ticker _ticker = createTicker(_onTick);

  bool _appActive = true;
  bool _reduce = false;
  int _level = 0;
  int _loadToken = 0;

  Duration _last = Duration.zero;
  double _gSum = 0;
  int _gN = 0;
  int _lastPointerMs = -1000;

  // ── lifecycle ──

  @override
  void initState() {
    super.initState();
    _engine = _MeshEngine(ts: 1);
    WidgetsBinding.instance.addObserver(this);
    final ls = WidgetsBinding.instance.lifecycleState;
    _appActive = ls == null || ls == AppLifecycleState.resumed;
    GestureBinding.instance.pointerRouter.addGlobalRoute(_onPointer);
    widget.intensityListenable?.addListener(_wake);
    _loadCover();
    _wake();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduce != _reduce) {
      _reduce = reduce;
      _wake();
    }
  }

  @override
  void didUpdateWidget(ArtworkMeshBackground old) {
    super.didUpdateWidget(old);
    if (old.intensityListenable != widget.intensityListenable) {
      old.intensityListenable?.removeListener(_wake);
      widget.intensityListenable?.addListener(_wake);
    }
    if (_sourceKey(old) != _sourceKey(widget)) _loadCover();
    // paused / speed / intensity / lowPower changes: make sure the loop runs
    _wake();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appActive = state == AppLifecycleState.resumed;
    if (_appActive) {
      _wake();
    } else {
      _halt();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    GestureBinding.instance.pointerRouter.removeGlobalRoute(_onPointer);
    widget.intensityListenable?.removeListener(_wake);
    _loadToken++; // cancel in-flight loads
    _ticker.dispose();
    _engine.releaseTiles();
    _engine.dispose();
    super.dispose();
  }

  // ── cover loading + crossfade ──

  String get _fallbackKey => 'asset:${widget.fallbackAsset}';

  String _sourceKey(ArtworkMeshBackground w) {
    if (w.palette != null && w.palette!.isNotEmpty) {
      final sig = w.palette!
          .map((c) => c.toARGB32().toRadixString(16).padLeft(8, '0'))
          .join('_');
      return 'palette:$sig';
    }
    final raw = (w.coverUrl != null && w.coverUrl!.isNotEmpty)
        ? w.coverUrl!
        : (w.covers != null && w.covers!.isNotEmpty ? w.covers!.first : '');
    if (raw.isEmpty) return 'asset:${w.fallbackAsset}';
    return w.mediaUrlResolver?.call(raw) ?? raw;
  }

  ImageProvider _providerFor(String key) {
    if (key.startsWith('asset:')) return AssetImage(key.substring(6));
    return widget.imageProviderBuilder?.call(key) ?? NetworkImage(key);
  }

  Future<void> _loadCover() async {
    final token = ++_loadToken;
    final key = _sourceKey(widget);

    final cached = _TileCache.peek(key);
    if (cached != null) {
      // remount (reopen) → mesh is there on the first frame
      _applyTile(cached, instant: _engine.cur == null);
      return;
    }

    try {
      final tile = key.startsWith('palette:') && widget.palette != null
          ? await _TileCache.getPalette(key, widget.palette!)
          : await _TileCache.get(key, () => _providerFor(key));
      if (token == _loadToken) _applyTile(tile);
    } catch (_) {
      if (key == _fallbackKey || token != _loadToken) return;
      try {
        final fb = await _TileCache.get(
          _fallbackKey,
          () => AssetImage(widget.fallbackAsset),
        );
        if (token == _loadToken) _applyTile(fb);
      } catch (_) {/* nothing more to try */}
    }
  }

  void _applyTile(_Tile tile, {bool instant = false}) {
    if (!mounted || identical(_engine.cur, tile)) return;
    tile.retain();
    final old = _engine.cur;
    _engine.prev?.release();
    if (instant) {
      old?.release();
      _engine.prev = null;
    } else {
      _engine.prev = old;
    }
    _engine.cur = tile;
    _engine.fade = instant ? 1 : 0;
    _wake();
  }

  // ── pointer parallax ──

  void _onPointer(PointerEvent e) {
    if (!widget.interactive || _reduce || widget.paused || !_appActive) return;
    if (e is! PointerMoveEvent && e is! PointerHoverEvent) return;
    final ms = e.timeStamp.inMilliseconds;
    if (ms - _lastPointerMs < 50) return; // throttle sampling
    _lastPointerMs = ms;
    final view = View.maybeOf(context);
    if (view == null) return;
    final size = view.physicalSize / view.devicePixelRatio;
    if (size.width <= 0 || size.height <= 0) return;
    _engine.ptx = (e.position.dx / size.width - 0.5) * 2;
    _engine.pty = (e.position.dy / size.height - 0.5) * 2;
    _wake();
  }

  // ── loop control ──

  double _readIntensity() =>
      (widget.intensityListenable?.value ?? widget.intensity).clamp(0.0, 1.0);

  double get _frameMs {
    final fps = _levels[_level].fps;
    return 1000 / (widget.lowPower ? math.min(30.0, fps) : fps);
  }

  bool get _settled {
    final e = _engine;
    final target = (widget.paused || _reduce) ? 0.0 : 1.0;
    return target == 0 &&
        e.ts == 0 &&
        e.fade >= 1 &&
        (e.energy - _readIntensity()).abs() < 0.002 &&
        (e.px - e.ptx).abs() < 0.002 &&
        (e.py - e.pty).abs() < 0.002;
  }

  void _halt() {
    if (_ticker.isActive) _ticker.stop();
  }

  void _wake() {
    if (!mounted) return;
    if (!_appActive) {
      // Not running: show a stable, fully crossfaded frame.
      final e = _engine;
      if (e.cur != null && (e.fade < 1 || e.prev != null)) {
        e.fade = 1;
        e.prev?.release();
        e.prev = null;
        e.ping();
      }
      return;
    }
    if (_ticker.isActive) return;
    if (_settled) {
      _engine.ping(); // paint once (e.g. a new cover while paused is shown)
      return;
    }
    _last = Duration.zero;
    _gSum = 0;
    _gN = 0;
    _ticker.start();
  }

  void _onTick(Duration now) {
    final e = _engine;
    final elapsedMs = (now - _last).inMicroseconds / 1000.0;
    final frameMs = _frameMs;

    // fps cap (tolerant of vsync jitter)
    if (elapsedMs < frameMs - 2) return;
    _last = now;
    final dt = math.min(elapsedMs / 1000, 0.05);

    // adaptive governor — only trust normal-looking intervals
    if (elapsedMs < 250) {
      _gSum += elapsedMs;
      _gN++;
      if (_gN >= 90) {
        final avg = _gSum / _gN;
        _gSum = 0;
        _gN = 0;
        if (_level < _levels.length - 1 && avg > frameMs * 1.45) {
          setState(() => _level++); // lower resolution / fps
        }
      }
    }

    // ease pause/resume + intensity + pointer
    final intensity = _readIntensity();
    final tsTarget = (widget.paused || _reduce) ? 0.0 : 1.0;
    e.ts += (tsTarget - e.ts) * (1 - math.exp(-dt * 3.2));
    if (tsTarget == 0 && e.ts < 0.002) e.ts = 0;
    e.energy += (intensity - e.energy) * (1 - math.exp(-dt * 6));
    final pk = 1 - math.exp(-dt * 3);
    e.px += (e.ptx - e.px) * pk;
    e.py += (e.pty - e.py) * pk;

    // advance simulation
    final simDt = dt * widget.speed * e.ts * (1 + e.energy * 0.6);
    if (simDt > 0) {
      e.t += simDt;
      for (var i = 0; i < e.nodes.length; i++) {
        if (e.t >= e.nodes[i].next) e.retarget(i);
      }
      final n = math.max(1, (simDt / (1 / 90)).ceil());
      final h = simDt / n;
      for (var i = 0; i < n; i++) {
        e.step(h);
      }
    }

    // crossfade
    if (e.fade < 1) {
      e.fade = math.min(1, e.fade + dt / 0.9);
      if (e.fade >= 1) {
        e.prev?.release();
        e.prev = null;
      }
    }

    e.ping();

    if (_settled || !_appActive) _ticker.stop(); // sleeps at zero cost
  }

  // ── build ──

  Size _canvasFor(Size box, bool mobile) {
    final res = _levels[_level].res * (widget.lowPower ? 0.85 : 1);
    final long = (mobile ? 128.0 : 190.0) * res;
    final k = math.max(box.width, box.height) / long;
    return Size(
      math.max(16, (box.width / k).roundToDouble()),
      math.max(16, (box.height / k).roundToDouble()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bg = widget.backgroundColor ?? AppColors.bg;
    final screen = MediaQuery.sizeOf(context);
    final mobile = screen.width <= 768;

    return ExcludeSemantics(
      child: IgnorePointer(
        child: RepaintBoundary(
          child: ColoredBox(
            color: bg,
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Tiny canvas, bitmap-scaled up by the compositor: the
                // "liquid" softness is free and the raster cost stays tiny.
                LayoutBuilder(
                  builder: (context, c) {
                    final box = Size(
                      c.hasBoundedWidth ? c.maxWidth : screen.width,
                      c.hasBoundedHeight ? c.maxHeight : screen.height,
                    );
                    final cs = _canvasFor(box, mobile);
                    return ClipRect(
                      child: Align(
                        alignment: Alignment.topLeft,
                        child: Transform.scale(
                          alignment: Alignment.topLeft,
                          scaleX: box.width / cs.width,
                          scaleY: box.height / cs.height,
                          filterQuality: FilterQuality.low,
                          child: SizedBox.fromSize(
                            size: cs,
                            child: CustomPaint(
                              size: cs,
                              painter: _MeshPainter(_engine, bg),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),

                // Readability scrim
                if (widget.scrimOpacity > 0)
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.15 * widget.scrimOpacity),
                          Colors.black.withValues(alpha: 0.30 * widget.scrimOpacity),
                          bg.withValues(alpha: (0.65 * widget.scrimOpacity).clamp(0.0, 1.0)),
                        ],
                        stops: const [0, 0.6, 1],
                      ),
                    ),
                  ),

                if (widget.dither) const _DitherLayer(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

