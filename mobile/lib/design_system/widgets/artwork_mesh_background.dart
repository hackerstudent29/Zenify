// lib/design_system/widgets/artwork_mesh_background.dart
//
// ArtworkMeshBackground — Apple Music style liquid colour field (Flutter).
//
// WHAT CHANGED vs the previous version
//  • No more image "crop tiles". The old version painted blurred pieces of the
//    cover, which looked blotchy and showed artwork detail. Now each cover is
//    reduced ONCE to a graded 6-colour palette (Apple-style: rich, never
//    neon, never too bright for white text) and the scene is drawn with big
//    soft elliptical colour blobs. Result: smooth, premium, abstract flow.
//  • Liquid motion: every blob drifts on layered sine orbits, breathes,
//    stretches like a droplet (area-preserving squash/stretch) and rotates.
//    The whole field also swings slowly around the centre.
//  • Liquid TRANSITIONS: when the song changes, colours do not cross-fade.
//    A colour wave sweeps diagonally across the screen (each blob morphs
//    slightly after its neighbour) while the field "kicks": blobs speed up,
//    swell and swirl, then settle back. Interrupting a transition mid-way
//    morphs from the colours currently on screen (no pops).
//
// WHY IT COSTS ALMOST NO BATTERY
//  1. Cover is decoded at 64px wide and analysed once (≈4k pixels). Cached
//     per cover (LRU) → reopening the player is instant, zero work.
//  2. Scene is painted into a TINY canvas (~110–160px long side) and scaled
//     up by the compositor (bilinear = free "blur"). No blur / filter / shader
//     compile / saveLayer per frame. One static gradient Paint, 9 draws.
//  3. 30 fps cap (slow liquid motion looks identical to 60), auto step-down
//     to 24 / 20 fps if frames slip. lowPower caps at 24.
//  4. Zero widget rebuilds while animating (Ticker → repaint-only notifier).
//  5. Ticker FULLY STOPS (0 CPU/GPU) when app is backgrounded, when paused and
//     eased to rest, with reduced-motion, and on offscreen routes.
//  6. Optional dither layer is OFF by default (it is a full-res layer).
//
// Public API is unchanged — drop-in replacement.

import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
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
    this.interactive = false,
    this.dither = false,
    this.lowPower = false,
    this.maxFps = 30,
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

  /// Drive intensity from an audio analyser WITHOUT rebuilding.
  /// Takes precedence over [intensity].
  final ValueListenable<double>? intensityListenable;

  /// Subtle pointer / touch parallax. Off by default (saves wake-ups).
  final bool interactive;

  /// Static noise layer that removes banding on dark colours. Full-resolution
  /// layer → OFF by default to keep GPU use minimal.
  final bool dither;

  /// Caps to 24 fps and trims resolution. Feed from battery_plus if you like.
  final bool lowPower;

  /// Frame-rate ceiling (default 30). Raise to 60 only if you really want it.
  final double maxFps;

  /// Maps a raw media path to a full URL.
  final String Function(String raw)? mediaUrlResolver;

  /// Custom ImageProvider for a resolved source. Defaults to
  /// [CachedNetworkImageProvider] for http(s), else [NetworkImage].
  final ImageProvider Function(String src)? imageProviderBuilder;

  /// Asset used when there is no cover or it fails to load.
  final String fallbackAsset;

  final Color? backgroundColor;

  /// Optional explicit palette used instead of decoding a cover image.
  final List<Color>? palette;

  /// Multiplier (0..1) for the readability scrim.
  final double scrimOpacity;

  @override
  State<ArtworkMeshBackground> createState() => _ArtworkMeshBackgroundState();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuning constants
// ─────────────────────────────────────────────────────────────────────────────

/// Palette size (index 0 is the cover's overall mood colour).
const int _kColors = 6;

/// Cover is decoded at this width for analysis (tiny → fast, low memory).
const int _sampleWidth = 64;

/// Colour morph duration on song change (seconds).
const double _fadeSeconds = 1.9;

/// How far the diagonal colour wave is spread (0 = all blobs change together).
const double _stagger = 0.8;

/// Lightness window for graded colours. Keeps white UI text readable while
/// staying rich. Raise [_maxL] for brighter backgrounds, lower for moodier.
const double _minL = 0.16;
const double _maxL = 0.54;

const List<Color> _fallbackColors = [
  Color(0xFFB4123A),
  Color(0xFFE11D48),
  Color(0xFFFF4D79),
  Color(0xFF7A0F2B),
  Color(0xFFFFB3C6),
  Color(0xFF4A0A1C),
];

class _Blob {
  const _Blob({
    required this.ax,
    required this.ay,
    required this.r,
    required this.ox,
    required this.oy,
    required this.w1,
    required this.w2,
    required this.w3,
    required this.ph,
    required this.stretch,
    required this.spin,
    required this.alpha,
    required this.ci,
    required this.depth,
  });

  final double ax, ay; // anchor (0..1 of canvas)
  final double r; // radius × longest canvas side
  final double ox, oy; // orbit amplitude (normalised)
  final double w1, w2, w3; // orbit / morph angular frequencies (rad/s)
  final double ph; // phase
  final double stretch; // droplet squash/stretch amount
  final double spin; // rotation speed (rad/s, signed)
  final double alpha; // blob opacity
  final int ci; // palette colour index
  final double depth; // pointer parallax depth

  /// Diagonal colour-wave order (top-left first, bottom-right last).
  double get delay => ((ax + ay) / 2).clamp(0.0, 1.0);
}

// Corners, edge midpoints and centre → colour streams in from every side.
const List<_Blob> _nodes = [
  // corners
  _Blob(
    ax: 0.10,
    ay: 0.10,
    r: 0.62,
    ox: 0.22,
    oy: 0.16,
    w1: 0.31,
    w2: 0.27,
    w3: 0.19,
    ph: 0.0,
    stretch: 0.22,
    spin: 0.10,
    alpha: 0.95,
    ci: 1,
    depth: 1.0,
  ),
  _Blob(
    ax: 0.92,
    ay: 0.14,
    r: 0.58,
    ox: 0.20,
    oy: 0.18,
    w1: 0.26,
    w2: 0.34,
    w3: 0.23,
    ph: 1.1,
    stretch: 0.25,
    spin: -0.12,
    alpha: 0.92,
    ci: 2,
    depth: 0.8,
  ),
  _Blob(
    ax: 0.10,
    ay: 0.88,
    r: 0.64,
    ox: 0.22,
    oy: 0.16,
    w1: 0.29,
    w2: 0.24,
    w3: 0.21,
    ph: 2.3,
    stretch: 0.20,
    spin: -0.09,
    alpha: 0.92,
    ci: 3,
    depth: 0.9,
  ),
  _Blob(
    ax: 0.90,
    ay: 0.90,
    r: 0.60,
    ox: 0.20,
    oy: 0.18,
    w1: 0.24,
    w2: 0.30,
    w3: 0.17,
    ph: 3.4,
    stretch: 0.26,
    spin: 0.13,
    alpha: 0.90,
    ci: 4,
    depth: 0.6,
  ),
  // centre (mood colour, biggest)
  _Blob(
    ax: 0.50,
    ay: 0.50,
    r: 0.70,
    ox: 0.26,
    oy: 0.22,
    w1: 0.21,
    w2: 0.25,
    w3: 0.15,
    ph: 4.6,
    stretch: 0.30,
    spin: 0.07,
    alpha: 0.85,
    ci: 0,
    depth: 0.3,
  ),
  // edge midpoints
  _Blob(
    ax: 0.50,
    ay: 0.02,
    r: 0.50,
    ox: 0.30,
    oy: 0.10,
    w1: 0.36,
    w2: 0.28,
    w3: 0.24,
    ph: 5.6,
    stretch: 0.30,
    spin: -0.15,
    alpha: 0.80,
    ci: 5,
    depth: 1.2,
  ),
  _Blob(
    ax: 0.50,
    ay: 0.98,
    r: 0.52,
    ox: 0.30,
    oy: 0.10,
    w1: 0.33,
    w2: 0.27,
    w3: 0.26,
    ph: 0.7,
    stretch: 0.28,
    spin: 0.14,
    alpha: 0.80,
    ci: 2,
    depth: 0.5,
  ),
  _Blob(
    ax: 0.00,
    ay: 0.50,
    r: 0.48,
    ox: 0.12,
    oy: 0.30,
    w1: 0.27,
    w2: 0.31,
    w3: 0.22,
    ph: 1.9,
    stretch: 0.30,
    spin: -0.10,
    alpha: 0.78,
    ci: 3,
    depth: 0.7,
  ),
  _Blob(
    ax: 1.00,
    ay: 0.50,
    r: 0.48,
    ox: 0.12,
    oy: 0.30,
    w1: 0.30,
    w2: 0.26,
    w3: 0.20,
    ph: 2.9,
    stretch: 0.30,
    spin: 0.12,
    alpha: 0.78,
    ci: 1,
    depth: 0.7,
  ),
];

/// Quality ladder used by the adaptive governor.
class _Level {
  const _Level(this.fps, this.res);
  final double fps;
  final double res;
}

const List<_Level> _levels = [
  _Level(30, 1.0),
  _Level(24, 0.8),
  _Level(20, 0.65),
];

// ─────────────────────────────────────────────────────────────────────────────
// Palette extraction (runs once per cover)
// ─────────────────────────────────────────────────────────────────────────────

/// Graded colours for one cover: [colors] (length [_kColors]) + a dark [base].
class _Palette {
  _Palette(this.colors, this.base);

  final List<Color> colors;
  final Color base;

  /// Builds a palette from arbitrary colours (pads with tonal variants).
  factory _Palette.fromColors(List<Color> src, {Color? avg}) {
    final list = <Color>[...src];
    if (list.isEmpty) list.addAll(_fallbackColors);
    var i = 0;
    while (list.length < _kColors) {
      final h = HSLColor.fromColor(list[i % list.length]);
      list.add(
        h
            .withHue((h.hue + 18.0 * (i + 1)) % 360)
            .withLightness(
              (h.lightness + (i.isEven ? 0.10 : -0.08)).clamp(0.12, 0.60),
            )
            .toColor(),
      );
      i++;
    }
    final ref = HSLColor.fromColor(avg ?? list.first);
    final base = ref
        .withLightness((ref.lightness * 0.55).clamp(0.05, 0.26))
        .toColor();
    return _Palette(list.sublist(0, _kColors), base);
  }
}

/// Apple-style grade: lift muted art a little, keep neutrals neutral, keep
/// lightness inside a window so white text always reads.
Color _grade(Color c) {
  final h = HSLColor.fromColor(c);
  final s = h.saturation < 0.08
      ? h.saturation
      : (h.saturation * 1.25 + 0.04).clamp(0.0, 0.92);
  final l = h.lightness.clamp(_minL, _maxL);
  return h.withSaturation(s).withLightness(l).toColor();
}

double _dist(Color a, Color b) {
  final dr = (a.r - b.r) * 255, dg = (a.g - b.g) * 255, db = (a.b - b.b) * 255;
  return math.sqrt(dr * dr + dg * dg + db * db);
}

class _Bucket {
  double w = 0, r = 0, g = 0, b = 0;
}

Future<_Palette> _extractPalette(ui.Image img) async {
  final bd = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
  if (bd == null) return _Palette.fromColors(_fallbackColors);
  final d = bd.buffer.asUint8List(bd.offsetInBytes, bd.lengthInBytes);

  final buckets = <int, _Bucket>{};
  double tw = 0, tr = 0, tg = 0, tb = 0;

  for (var i = 0; i + 3 < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    final r = d[i].toDouble(), g = d[i + 1].toDouble(), b = d[i + 2].toDouble();
    final mx = math.max(r, math.max(g, b));
    final mn = math.min(r, math.min(g, b));
    final s = mx > 0 ? (mx - mn) / mx : 0.0;
    final l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // population-weighted, with a mild preference for vivid colours and a
    // penalty for pure black / pure white (letterboxing, text, borders).
    var w = 0.5 + s * s * 1.5;
    if (l < 0.08) {
      w *= 0.25;
    } else if (l > 0.95) {
      w *= 0.4;
    }

    tw += w;
    tr += r * w;
    tg += g * w;
    tb += b * w;

    final key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    final bk = buckets.putIfAbsent(key, _Bucket.new);
    bk.w += w;
    bk.r += r * w;
    bk.g += g * w;
    bk.b += b * w;
  }

  if (tw <= 0) return _Palette.fromColors(_fallbackColors);

  final avg = Color.fromARGB(
    255,
    (tr / tw).round(),
    (tg / tw).round(),
    (tb / tw).round(),
  );

  final sorted = (buckets.values.toList()..sort((a, b) => b.w.compareTo(a.w)))
      .take(48)
      .toList();

  // index 0 = overall mood colour (drives the biggest centre blob)
  final picked = <Color>[_grade(avg)];
  final used = <_Bucket>{};
  for (final thr in const [56.0, 36.0, 20.0]) {
    for (final b in sorted) {
      if (picked.length >= _kColors) break;
      if (used.contains(b)) continue;
      final c = Color.fromARGB(
        255,
        (b.r / b.w).round(),
        (b.g / b.w).round(),
        (b.b / b.w).round(),
      );
      final g = _grade(c);
      if (picked.every((p) => _dist(p, g) >= thr * 0.9)) {
        picked.add(g);
        used.add(b);
      }
    }
  }
  return _Palette.fromColors(picked, avg: avg);
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

/// Small LRU of extracted palettes (reopening a player is instant).
abstract final class _PaletteCache {
  static const int _max = 16;
  static final Map<String, _Palette> _cache = {};
  static final Map<String, Future<_Palette>> _pending = {};

  static _Palette? peek(String key) {
    final p = _cache.remove(key);
    if (p != null) _cache[key] = p; // mark most recently used
    return p;
  }

  static Future<_Palette> get(String key, ImageProvider Function() provider) {
    final hit = peek(key);
    if (hit != null) return Future.value(hit);
    return _pending[key] ??= _load(key, provider()).whenComplete(() {
      _pending.remove(key);
    });
  }

  static _Palette fromColors(String key, List<Color> colors) {
    final hit = peek(key);
    if (hit != null) return hit;
    final p = _Palette.fromColors(colors);
    _store(key, p);
    return p;
  }

  static void _store(String key, _Palette p) {
    _cache[key] = p;
    if (_cache.length > _max) _cache.remove(_cache.keys.first);
  }

  static Future<_Palette> _load(String key, ImageProvider provider) async {
    // Decode tiny: saves memory + CPU, and 64px is plenty for colour analysis.
    final img = await _resolveImage(ResizeImage(provider, width: _sampleWidth));
    try {
      final p = await _extractPalette(img);
      _store(key, p);
      return p;
    } finally {
      img.dispose();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation (pure state, repaint-only notifications)
// ─────────────────────────────────────────────────────────────────────────────

class _MeshEngine extends ChangeNotifier {
  _MeshEngine(Color bg)
    : from = List<Color>.filled(_nodes.length, bg),
      to = List<Color>.filled(_nodes.length, bg),
      shown = List<Color>.filled(_nodes.length, bg),
      fromBase = bg,
      toBase = bg,
      shownBase = bg;

  double t = 0; // simulation time
  double ts = 1; // eased time-scale (pause / resume)
  double energy = 0; // eased intensity
  double px = 0, py = 0, ptx = 0, pty = 0; // eased pointer
  double fade = 1; // colour morph progress
  double kick = 0; // transition surge (1 → 0)

  _Palette? palette;
  List<Color> from, to, shown;
  Color fromBase, toBase, shownBase;

  List<Color> _blobColors(_Palette p) => [
    for (final b in _nodes) p.colors[b.ci % p.colors.length],
  ];

  void setPalette(_Palette p, {bool instant = false}) {
    palette = p;
    if (instant) {
      from = _blobColors(p);
      to = _blobColors(p);
      fromBase = toBase = p.base;
      fade = 1;
      kick = 0;
    } else {
      // morph from whatever is on screen right now → no pop if interrupted
      from = List<Color>.of(shown);
      fromBase = shownBase;
      to = _blobColors(p);
      toBase = p.base;
      fade = 0;
      kick = 1;
    }
    updateShown();
  }

  /// Diagonal colour wave: each blob morphs slightly after its neighbour.
  void updateShown() {
    final f = fade;
    for (var i = 0; i < _nodes.length; i++) {
      final local = (f * (1 + _stagger) - _nodes[i].delay * _stagger).clamp(
        0.0,
        1.0,
      );
      final k = local * local * (3 - 2 * local);
      shown[i] = Color.lerp(from[i], to[i], k)!;
    }
    final bk = f * f * (3 - 2 * f);
    shownBase = Color.lerp(fromBase, toBase, bk)!;
  }

  void finishFade() {
    fade = 1;
    kick = 0;
    updateShown();
  }

  void ping() => notifyListeners();
}

// ─────────────────────────────────────────────────────────────────────────────
// Painter (blobs + scrim, all inside the tiny canvas)
// ─────────────────────────────────────────────────────────────────────────────

class _MeshPainter extends CustomPainter {
  _MeshPainter(this.engine, this.bg, this.scrim) : super(repaint: engine);

  final _MeshEngine engine;
  final Color bg;
  final double scrim;

  static final Paint _fill = Paint();

  /// One static soft-falloff gradient in unit space. Each blob is this circle
  /// transformed (translate / rotate / non-uniform scale) and tinted with a
  /// colour filter, so there are no per-frame shader allocations.
  static final Paint _blob = Paint()
    ..shader = ui.Gradient.radial(
      Offset.zero,
      1,
      const [
        Color(0xFFFFFFFF),
        Color(0xB8FFFFFF),
        Color(0x40FFFFFF),
        Color(0x00FFFFFF),
      ],
      const [0.0, 0.35, 0.7, 1.0],
    );

  Paint? _scrimPaint;
  Size _scrimSize = Size.zero;

  @override
  void paint(Canvas canvas, Size size) {
    final e = engine;
    final w = size.width, h = size.height, m = math.max(w, h);
    final cx = w / 2, cy = h / 2;
    final t = e.t;

    // 1. Base
    _fill.color = e.shownBase;
    canvas.drawRect(Offset.zero & size, _fill);

    // 2. Liquid field. Slow global swing + a bigger swirl during transitions.
    final swirl = 0.10 * math.sin(t * 0.09) + e.kick * 0.45 * math.sin(t * 0.9);
    final cs = math.cos(swirl), sn = math.sin(swirl);
    final amp = 1 + e.energy * 0.5 + e.kick * 0.5;

    for (var i = 0; i < _nodes.length; i++) {
      final c = _nodes[i];

      // layered orbits → organic, non-repeating path
      final nx =
          c.ax +
          c.ox *
              amp *
              (math.sin(t * c.w1 + c.ph) +
                  0.35 * math.sin(t * c.w3 * 1.7 + c.ph * 2.1));
      final ny =
          c.ay +
          c.oy *
              amp *
              (math.cos(t * c.w2 + c.ph * 1.3) +
                  0.35 * math.cos(t * c.w3 * 1.3 + c.ph * 0.7));

      var x = nx * w + e.px * c.depth * w * 0.05;
      var y = ny * h + e.py * c.depth * h * 0.05;
      final dx = x - cx, dy = y - cy;
      x = cx + dx * cs - dy * sn;
      y = cy + dx * sn + dy * cs;

      // breathing + audio swell + transition swell
      final breathe =
          1 +
          0.08 * math.sin(t * 0.4 + c.ph) +
          e.energy * 0.10 * math.sin(t * 1.7 + c.ph) +
          e.kick * 0.14;
      final rad = m * c.r * breathe;

      // droplet morph: area-preserving squash/stretch
      final k = 1 + c.stretch * math.sin(t * c.w3 + c.ph * 3);

      _blob.colorFilter = ColorFilter.mode(
        e.shown[i].withValues(alpha: c.alpha),
        BlendMode.srcIn,
      );

      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(c.ph + c.spin * t);
      canvas.scale(rad * k, rad / k);
      canvas.drawCircle(Offset.zero, 1, _blob);
      canvas.restore();
    }

    // 3. Readability scrim (tiny resolution → no full-res layer)
    if (scrim > 0) {
      if (_scrimPaint == null || _scrimSize != size) {
        _scrimSize = size;
        _scrimPaint = Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.black.withValues(alpha: 0.06 * scrim),
              Colors.black.withValues(alpha: 0.16 * scrim),
              Colors.black.withValues(alpha: 0.36 * scrim),
            ],
            stops: const [0, 0.55, 1],
          ).createShader(Offset.zero & size);
      }
      canvas.drawRect(Offset.zero & size, _scrimPaint!);
    }
  }

  @override
  bool shouldRepaint(_MeshPainter old) =>
      old.engine != engine || old.bg != bg || old.scrim != scrim;
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional static dither layer (off by default)
// ─────────────────────────────────────────────────────────────────────────────

Future<ui.Image> _fromPixels(Uint8List pixels, int w, int h) {
  final c = Completer<ui.Image>();
  ui.decodeImageFromPixels(pixels, w, h, ui.PixelFormat.rgba8888, c.complete);
  return c.future;
}

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
      child: CustomPaint(size: Size.infinite, painter: _NoisePainter(img)),
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
    with TickerProviderStateMixin, WidgetsBindingObserver {
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
    _engine = _MeshEngine(widget.backgroundColor ?? AppColors.bg);
    if (widget.palette != null && widget.palette!.isNotEmpty) {
      final pal = _Palette.fromColors(widget.palette!);
      _engine.setPalette(pal, instant: true);
    }
    WidgetsBinding.instance.addObserver(this);
    final ls = WidgetsBinding.instance.lifecycleState;
    _appActive = ls == null || ls == AppLifecycleState.resumed;
    if (widget.interactive) {
      GestureBinding.instance.pointerRouter.addGlobalRoute(_onPointer);
    }
    widget.intensityListenable?.addListener(_wake);
    _loadCover();
  }

  bool _isCurrentRoute = true;
  bool _tickerModeEnabled = true;

  bool get _canAnimate =>
      mounted &&
      !widget.paused &&
      !_reduce &&
      _appActive &&
      _isCurrentRoute &&
      _tickerModeEnabled;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _isCurrentRoute = ModalRoute.of(context)?.isCurrent ?? true;
    _tickerModeEnabled = TickerMode.valuesOf(context).enabled;
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduce != _reduce) {
      _reduce = reduce;
    }
    if (!_canAnimate) {
      _halt();
    } else if (!_ticker.isActive) {
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
    if (old.interactive != widget.interactive) {
      final router = GestureBinding.instance.pointerRouter;
      if (widget.interactive) {
        router.addGlobalRoute(_onPointer);
      } else {
        router.removeGlobalRoute(_onPointer);
      }
    }
    if (widget.palette != null &&
        widget.palette!.isNotEmpty &&
        old.palette != widget.palette &&
        _engine.palette == null) {
      _apply(
        _PaletteCache.fromColors(_paletteKey(widget.palette!), widget.palette!),
        instant: false,
      );
    }
    if (_sourceKey(old) != _sourceKey(widget)) _loadCover();
    if (widget.paused) {
      _engine.ts = 0;
      _engine.kick = 0;
      _halt();
    } else {
      _wake();
    }
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
    _engine.dispose();
    super.dispose();
  }

  // ── cover loading ──

  String get _fallbackKey => 'asset:${widget.fallbackAsset}';

  String _paletteKey(List<Color> p) =>
      'palette:${p.map((c) => c.toARGB32().toRadixString(16).padLeft(8, '0')).join('_')}';

  String _sourceKey(ArtworkMeshBackground w) {
    final raw = (w.coverUrl != null && w.coverUrl!.isNotEmpty)
        ? w.coverUrl!
        : (w.covers != null && w.covers!.isNotEmpty ? w.covers!.first : '');
    if (raw.isNotEmpty) {
      return w.mediaUrlResolver?.call(raw) ?? raw;
    }
    if (w.palette != null && w.palette!.isNotEmpty) {
      return _paletteKey(w.palette!);
    }
    return 'asset:${w.fallbackAsset}';
  }

  ImageProvider _providerFor(String key) {
    if (key.startsWith('asset:')) {
      return AssetImage(key.substring(6));
    }
    if (widget.imageProviderBuilder != null) {
      return widget.imageProviderBuilder!(key);
    }
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return CachedNetworkImageProvider(key);
    }
    return NetworkImage(key);
  }

  Future<void> _loadCover() async {
    final token = ++_loadToken;
    final key = _sourceKey(widget);

    // Immediate palette seeding: frame 0 has rich colors even before network completes!
    if (widget.palette != null && widget.palette!.isNotEmpty) {
      _apply(
        _PaletteCache.fromColors(_paletteKey(widget.palette!), widget.palette!),
        instant: _engine.palette == null,
      );
    }

    final cached = _PaletteCache.peek(key);
    if (cached != null) {
      // remount (reopen) → colours are there on the first frame
      _apply(cached, instant: _engine.palette == null);
      return;
    }

    // explicit palette → no image work at all
    if (key.startsWith('palette:') && widget.palette != null) {
      _apply(
        _PaletteCache.fromColors(key, widget.palette!),
        instant: _engine.palette == null,
      );
      return;
    }

    try {
      final p = await _PaletteCache.get(key, () => _providerFor(key));
      if (token == _loadToken) _apply(p);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ArtworkMeshBackground] Failed to load cover $key: $e');
      }
      if (token != _loadToken) return;

      if (widget.palette != null && widget.palette!.isNotEmpty) {
        _apply(
          _PaletteCache.fromColors(
            _paletteKey(widget.palette!),
            widget.palette!,
          ),
        );
        return;
      }
      if (key != _fallbackKey) {
        try {
          final fb = await _PaletteCache.get(
            _fallbackKey,
            () => AssetImage(widget.fallbackAsset),
          );
          if (token == _loadToken) _apply(fb);
          return;
        } catch (_) {}
      }
      if (token == _loadToken) {
        _apply(_PaletteCache.fromColors('palette:default', _fallbackColors));
      }
    }
  }

  void _apply(_Palette p, {bool instant = false}) {
    if (!mounted || identical(_engine.palette, p)) return;
    _engine.setPalette(p, instant: instant);
    _wake();
  }

  // ── pointer parallax (only registered when interactive) ──

  void _onPointer(PointerEvent e) {
    if (!mounted || !widget.interactive || _reduce || widget.paused || !_appActive) {
      return;
    }
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
    var fps = math.min(_levels[_level].fps, widget.maxFps);
    if (widget.lowPower) fps = math.min(24.0, fps);
    return 1000 / fps;
  }

  bool get _settled {
    final e = _engine;
    final target = (widget.paused || _reduce) ? 0.0 : 1.0;
    return target == 0 &&
        e.ts == 0 &&
        e.fade >= 1 &&
        e.kick == 0 &&
        (e.energy - _readIntensity()).abs() < 0.002 &&
        (e.px - e.ptx).abs() < 0.002 &&
        (e.py - e.pty).abs() < 0.002;
  }

  void _halt() {
    if (_ticker.isActive) _ticker.stop();
  }

  void _wake() {
    if (!mounted) return;
    if (!_canAnimate) {
      final e = _engine;
      if (widget.paused) {
        e.ts = 0;
        e.kick = 0;
      }
      if (e.fade < 1 || e.kick > 0) {
        e.finishFade();
      }
      e.ping();
      _halt();
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
      if (_gN >= 60) {
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

    // transition surge decays smoothly
    if (e.kick > 0) {
      e.kick *= math.exp(-dt * 0.9);
      if (e.kick < 0.002) e.kick = 0;
    }

    // advance time (surge makes the flow speed up during song changes)
    final simDt =
        dt * widget.speed * e.ts * (1 + e.energy * 0.6 + e.kick * 1.8);
    if (simDt > 0) e.t += simDt;

    // colour morph (diagonal wave)
    if (e.fade < 1) {
      e.fade = math.min(1, e.fade + dt / _fadeSeconds);
      e.updateShown();
    }

    e.ping();

    if (_settled || !_canAnimate) _halt(); // sleeps at zero cost
  }

  // ── build ──

  Size _canvasFor(Size box, bool mobile) {
    final res = _levels[_level].res * (widget.lowPower ? 0.85 : 1);
    final long = (mobile ? 112.0 : 160.0) * res;
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
                    return Align(
                      alignment: Alignment.topLeft,
                      child: Transform.translate(
                        offset: const Offset(-20.0, -20.0),
                        child: Transform.scale(
                          alignment: Alignment.topLeft,
                          scaleX: (box.width + 40.0) / cs.width,
                          scaleY: (box.height + 40.0) / cs.height,
                          filterQuality: FilterQuality.low,
                          child: SizedBox.fromSize(
                            size: cs,
                            child: CustomPaint(
                              size: cs,
                              painter: _MeshPainter(
                                _engine,
                                bg,
                                widget.scrimOpacity,
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
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
