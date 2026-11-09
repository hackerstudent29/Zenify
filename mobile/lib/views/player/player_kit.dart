import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/marquee_text.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../models/track.dart';

/* ------------------------------------------------------------------ */
/*  Springs                                                             */
/* ------------------------------------------------------------------ */
const kSheetSpring = SpringDescription(mass: 1, stiffness: 320, damping: 34);
const kSoftSpring = SpringDescription(mass: 1, stiffness: 240, damping: 28);
const kPauseSpring = SpringDescription(mass: 0.6, stiffness: 300, damping: 22);
const kSnappySpring = SpringDescription(mass: 0.8, stiffness: 420, damping: 30);

extension SpringDrive on AnimationController {
  /// Drives an (ideally unbounded) controller to [target] with a real spring,
  /// inheriting finger velocity (units per second) for a fluid hand-off.
  TickerFuture springTo(
    double target, {
    SpringDescription spring = kSheetSpring,
    double velocity = 0,
  }) =>
      animateWith(SpringSimulation(spring, value, target, velocity));
}

/// A [Curve] backed by a real spring simulation (0 → 1). Lets route / implicit
/// animations use spring motion. May overshoot slightly above 1.
class SpringCurve extends Curve {
  const SpringCurve([this.spring = kSheetSpring, this.seconds = 0.5]);
  final SpringDescription spring;
  final double seconds;

  @override
  double transformInternal(double t) =>
      SpringSimulation(spring, 0, 1, 0).x(t * seconds);
}

/* ------------------------------------------------------------------ */
/*  Direction-aware text swap (title / artist change)                   */
/* ------------------------------------------------------------------ */
/// Slides + fades old text out and new text in. [dir] = 1 when going to the
/// next track (new text arrives from the right), -1 for previous.
/// [delay] (0..0.9) staggers the entering text so title and artist cascade.
class SwapText extends StatelessWidget {
  const SwapText(
    this.text, {
    super.key,
    required this.style,
    this.dir = 1,
    this.delay = 0,
    this.maxLines = 1,
  });

  final String text;
  final TextStyle style;
  final int dir;
  final double delay;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      key: ValueKey(text),
      style: style,
      maxLines: maxLines,
      overflow: TextOverflow.ellipsis,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Staggered fade + rise on first appearance                           */
/* ------------------------------------------------------------------ */
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.dy = 16,
  });
  final Widget child;
  final Duration delay;
  final double dy;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 0);
  Timer? _t;

  @override
  void initState() {
    super.initState();
    if (widget.delay == Duration.zero) {
      _c.springTo(1, spring: kSoftSpring);
    } else {
      _t = Timer(widget.delay, () {
        if (mounted) _c.springTo(1, spring: kSoftSpring);
      });
    }
  }

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (_, child) => Opacity(
        opacity: _c.value.clamp(0.0, 1.0),
        child: Transform.translate(offset: Offset(0, (1 - _c.value) * widget.dy), child: child),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Cover image                                                         */
/* ------------------------------------------------------------------ */
class CoverImage extends StatelessWidget {
  const CoverImage(this.url, {super.key});
  final String url;

  @override
  Widget build(BuildContext context) {
    final cleanUrl = upgradeArtworkUrl(url);
    if (cleanUrl.isEmpty) {
      return Container(
        color: const Color(0xFF18181B),
        child: const Center(
          child: Icon(Icons.music_note_rounded, color: AppColors.textTertiary, size: 36),
        ),
      );
    }
    return CachedNetworkImage(
      key: ValueKey(cleanUrl),
      imageUrl: cleanUrl,
      fit: BoxFit.cover,
      fadeInDuration: Duration.zero,
      fadeOutDuration: Duration.zero,
      placeholder: (_, _) => Container(color: const Color(0xFF18181B)),
      errorWidget: (_, _, _) {
        if (cleanUrl.contains('maxresdefault.jpg')) {
          final fallbackUrl = cleanUrl.replaceAll('maxresdefault.jpg', 'hqdefault.jpg');
          return CachedNetworkImage(
            key: ValueKey(fallbackUrl),
            imageUrl: fallbackUrl,
            fit: BoxFit.cover,
            fadeInDuration: Duration.zero,
            placeholder: (_, _) => Container(color: const Color(0xFF18181B)),
            errorWidget: (_, _, _) => Container(
              color: const Color(0xFF18181B),
              child: const Center(
                child: Icon(Icons.music_note_rounded, color: AppColors.textTertiary, size: 32),
              ),
            ),
          );
        }
        return Container(
          color: const Color(0xFF18181B),
          child: const Center(
            child: Icon(Icons.music_note_rounded, color: AppColors.textTertiary, size: 36),
          ),
        );
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Glass circle (like / more)                                          */
/* ------------------------------------------------------------------ */
class GlassCircle extends StatelessWidget {
  const GlassCircle({super.key, required this.child, this.onTap, this.size = 36});
  final Widget child;
  final VoidCallback? onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap ?? () {},
      child: ClipOval(
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            width: size,
            height: size,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 0.6),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Plate button (shuffle / repeat / tools)                             */
/* ------------------------------------------------------------------ */
class PlateButton extends StatelessWidget {
  const PlateButton({
    super.key,
    required this.child,
    required this.onTap,
    this.active = false,
    this.size = 42,
  });
  final Widget child;
  final VoidCallback onTap;
  final bool active;
  final double size;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: active ? Colors.white.withValues(alpha: 0.22) : Colors.transparent,
        ),
        child: TweenAnimationBuilder<Color?>(
          duration: const Duration(milliseconds: 260),
          tween: ColorTween(
            end: active ? Colors.white : Colors.white.withValues(alpha: 0.62),
          ),
          builder: (_, color, ch) => IconTheme(data: IconThemeData(color: color), child: ch!),
          child: child,
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Like button with heart pop                                          */
/* ------------------------------------------------------------------ */
class PopLikeButton extends StatefulWidget {
  const PopLikeButton({super.key, required this.liked, required this.onToggle});
  final bool liked;
  final VoidCallback onToggle;

  @override
  State<PopLikeButton> createState() => _PopLikeButtonState();
}

class _PopLikeButtonState extends State<PopLikeButton> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 460));

  @override
  void didUpdateWidget(covariant PopLikeButton old) {
    super.didUpdateWidget(old);
    if (widget.liked && !old.liked) _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GlassCircle(
      onTap: widget.onToggle,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, _) => Transform.scale(
          scale: 1 + 0.38 * math.sin(math.pi * _c.value),
          child: Icon(
            widget.liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
            size: 18,
            color: widget.liked ? AppColors.accent : Colors.white,
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Palette extraction (no extra package)                               */
/* ------------------------------------------------------------------ */
final Map<String, List<Color>> _paletteCache = {};

Color _vivid(Color c) {
  final hsl = HSLColor.fromColor(c);
  return hsl
      .withSaturation((hsl.saturation * 1.35 + 0.08).clamp(0.0, 1.0).toDouble())
      .withLightness(hsl.lightness.clamp(0.26, 0.5).toDouble())
      .toColor();
}

/// Averages the four quadrants of a 32x32 downscale → 4 mesh colours.
Future<List<Color>?> extractPalette(String url) async {
  if (url.isEmpty) return null;
  final cached = _paletteCache[url];
  if (cached != null) return cached;
  try {
    final provider = ResizeImage(CachedNetworkImageProvider(url), width: 32, height: 32);
    final completer = Completer<ui.Image>();
    final stream = provider.resolve(ImageConfiguration.empty);
    late ImageStreamListener listener;
    listener = ImageStreamListener(
      (info, _) {
        if (!completer.isCompleted) completer.complete(info.image);
        stream.removeListener(listener);
      },
      onError: (Object e, StackTrace? s) {
        if (!completer.isCompleted) completer.completeError(e);
        stream.removeListener(listener);
      },
    );
    stream.addListener(listener);

    final img = await completer.future.timeout(const Duration(seconds: 6));
    final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (data == null) return null;

    final w = img.width, h = img.height;
    final sums = List.generate(4, (_) => <double>[0, 0, 0, 0]);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        final i = (y * w + x) * 4;
        final q = (y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1);
        sums[q][0] += data.getUint8(i);
        sums[q][1] += data.getUint8(i + 1);
        sums[q][2] += data.getUint8(i + 2);
        sums[q][3] += 1;
      }
    }
    final colors = sums.map((s) {
      final n = math.max(1, s[3]);
      return _vivid(Color.fromARGB(255, (s[0] / n).round(), (s[1] / n).round(), (s[2] / n).round()));
    }).toList();
    _paletteCache[url] = colors;
    return colors;
  } catch (_) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Ambient fluid mesh background                                       */
/* ------------------------------------------------------------------ */
class AmbientBackground extends StatefulWidget {
  const AmbientBackground({super.key, required this.colors, required this.animate});
  final List<Color> colors;
  final bool animate;

  @override
  State<AmbientBackground> createState() => _AmbientBackgroundState();
}

class _AmbientBackgroundState extends State<AmbientBackground> with TickerProviderStateMixin {
  late final AnimationController _drift =
      AnimationController(vsync: this, duration: const Duration(seconds: 36));
  late final AnimationController _blend =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900), value: 1);
  late List<Color> _from = widget.colors;
  late List<Color> _to = widget.colors;

  @override
  void initState() {
    super.initState();
    if (widget.animate) _drift.repeat();
  }

  List<Color> _current() {
    final t = Curves.easeInOut.transform(_blend.value);
    return List.generate(4, (i) => Color.lerp(_from[i], _to[i], t)!);
  }

  @override
  void didUpdateWidget(covariant AmbientBackground old) {
    super.didUpdateWidget(old);
    if (widget.colors != old.colors) {
      _from = _current();
      _to = widget.colors;
      _blend.forward(from: 0);
    }
    if (widget.animate && !_drift.isAnimating) _drift.repeat();
    if (!widget.animate && _drift.isAnimating) _drift.stop();
  }

  @override
  void dispose() {
    _drift.dispose();
    _blend.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        painter: _MeshPainter(this, Listenable.merge([_drift, _blend])),
        size: Size.infinite,
      ),
    );
  }
}

class _MeshPainter extends CustomPainter {
  _MeshPainter(this.s, Listenable repaint) : super(repaint: repaint);
  final _AmbientBackgroundState s;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF121214));
    final colors = s._current();
    final p = s._drift.value * 2 * math.pi;
    final maxSide = math.max(size.width, size.height);

    for (var i = 0; i < 4; i++) {
      final a = p + i * math.pi / 2;
      final base = [
        const Offset(0.2, 0.18),
        const Offset(0.85, 0.3),
        const Offset(0.2, 0.75),
        const Offset(0.8, 0.88),
      ][i];
      final center = Offset(
        size.width * (base.dx + 0.12 * math.sin(a + i)),
        size.height * (base.dy + 0.1 * math.cos(a * 1.3 - i)),
      );
      final r = maxSide * 0.75;
      final paint = Paint()
        ..shader = ui.Gradient.radial(
          center,
          r,
          [colors[i].withValues(alpha: 0.85), colors[i].withValues(alpha: 0.0)],
          const [0.0, 1.0],
        );
      canvas.drawRect(Offset.zero & size, paint);
    }
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, size.height * 0.45),
          Offset(0, size.height),
          [Colors.transparent, Colors.black.withValues(alpha: 0.35)],
        ),
    );
  }

  @override
  bool shouldRepaint(covariant _MeshPainter old) => true;
}