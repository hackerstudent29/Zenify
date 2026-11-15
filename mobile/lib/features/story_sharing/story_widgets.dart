import 'dart:math' as math;
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'story_models.dart';
import 'story_service.dart';

// ═════════════════════════════════════════════════════════════════════════════
// 0. TYPOGRAPHY + TEMPLATE ARGUMENTS
// ═════════════════════════════════════════════════════════════════════════════

/// Apple Music-flavoured type styles (SF Pro / New York with safe fallbacks).
class ZenType {
  ZenType._();

  static TextStyle display(double size, Color color,
          {FontWeight weight = FontWeight.w700, double? ls, double height = 1.08}) =>
      TextStyle(
        fontFamily: 'SF Pro Display',
        fontSize: size,
        fontWeight: weight,
        letterSpacing: ls ?? -size * 0.024,
        height: height,
        color: color,
      );

  static TextStyle text(double size, Color color,
          {FontWeight weight = FontWeight.w500, double ls = 0, double height = 1.2}) =>
      TextStyle(
        fontFamily: 'SF Pro Text',
        fontSize: size,
        fontWeight: weight,
        letterSpacing: ls,
        height: height,
        color: color,
      );

  static TextStyle serif(double size, Color color,
          {FontWeight weight = FontWeight.w600, double height = 1.12}) =>
      TextStyle(
        fontFamily: 'New York',
        fontFamilyFallback: const ['Georgia', 'Times New Roman', 'serif'],
        fontSize: size,
        fontWeight: weight,
        letterSpacing: -size * 0.016,
        height: height,
        color: color,
      );

  static TextStyle mono(double size, Color color,
          {FontWeight weight = FontWeight.w700, double height = 1.25}) =>
      TextStyle(
        fontFamily: 'Courier',
        fontFamilyFallback: const ['Courier New', 'Menlo', 'monospace'],
        fontSize: size,
        fontWeight: weight,
        height: height,
        color: color,
      );

  static TextStyle rounded(double size, Color color,
          {FontWeight weight = FontWeight.w800, double height = 1.1}) =>
      TextStyle(
        fontFamily: 'SF Pro Rounded',
        fontFamilyFallback: const ['SF Pro Display', 'Roboto'],
        fontSize: size,
        fontWeight: weight,
        letterSpacing: -size * 0.01,
        height: height,
        color: color,
      );

  static TextStyle caption(Color color, {double size = 10.5}) => TextStyle(
        fontFamily: 'SF Pro Text',
        fontSize: size,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.6,
        height: 1.1,
        color: color,
      );
}

/// Everything a template needs: its own definition (skin, ratio, default
/// backdrop, motion), the artwork palette and the user's overrides.
@immutable
class StoryTemplateArgs {
  const StoryTemplateArgs({
    required this.template,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
  });

  final StoryTemplate template;
  final ArtworkPalette palette;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;

  StorySkin get skin => template.skin;
  StoryRatio get ratio => template.ratio;
  double get w => ratio.width;
  double get h => ratio.height;
  bool get isStory => ratio.isStory;
  bool get isWide => !ratio.isStory;

  /// Skins with their own paper / clay / pop surfaces lock light mode.
  bool get isLight => skin.forceLight ?? (textPolarity == StoryTextPolarity.dark);

  StoryBackgroundStyle get resolvedBg =>
      backgroundStyle == StoryBackgroundStyle.auto ? template.bg : backgroundStyle;

  Color get fg {
    switch (skin) {
      case StorySkin.retro:
        return const Color(0xFF3A2A1C);
      case StorySkin.clay:
        return const Color(0xFF3B3552);
      case StorySkin.brutal:
        return const Color(0xFF111111);
      case StorySkin.polaroid:
        return const Color(0xFF1F1F22);
      default:
        return isLight ? const Color(0xFF121214) : Colors.white;
    }
  }

  Color get fg2 => fg.withValues(alpha: 0.68);
  Color get fg3 => fg.withValues(alpha: 0.42);

  Color get accent {
    final p = palette;
    switch (skin) {
      case StorySkin.retro:
        return const Color(0xFFD9541E);
      case StorySkin.neon:
        final h = HSVColor.fromColor(p.accent);
        return h.withSaturation(0.78).withValue(1.0).toColor();
      case StorySkin.clay:
        return Color.lerp(p.primary, Colors.white, 0.12)!;
      case StorySkin.aurora:
        return p.accent;
      case StorySkin.glass:
      case StorySkin.minimal:
        return fg;
      default:
        return p.primary;
    }
  }

  double get safeTop => ratio.isStory ? 58 : (ratio.isTall ? 34 : 22);
  double get safeBottom => ratio.isStory ? 66 : (ratio.isTall ? 30 : 22);
  double get pad => ratio.isStory ? 26 : 20;

  // ── skin-aware typography ──
  TextStyle display(double size, {Color? color, FontWeight? weight, double height = 1.08}) {
    final c = color ?? fg;
    switch (skin) {
      case StorySkin.retro:
        return ZenType.mono(size * 0.92, c, weight: weight ?? FontWeight.w700, height: height);
      case StorySkin.editorial:
        return ZenType.serif(size, c, weight: weight ?? FontWeight.w700, height: height);
      case StorySkin.clay:
        return ZenType.rounded(size, c, weight: weight ?? FontWeight.w800, height: height);
      case StorySkin.brutal:
        return ZenType.display(size, c, weight: weight ?? FontWeight.w900, ls: -size * 0.035, height: height);
      case StorySkin.neon:
        return ZenType.display(size, c, weight: weight ?? FontWeight.w800, ls: -size * 0.01, height: height);
      default:
        return ZenType.display(size, c, weight: weight ?? FontWeight.w700, height: height);
    }
  }

  TextStyle text(double size, {Color? color, FontWeight? weight, double ls = 0, double height = 1.2}) {
    final c = color ?? fg2;
    switch (skin) {
      case StorySkin.retro:
        return ZenType.mono(size * 0.9, c, weight: weight ?? FontWeight.w600, height: height);
      case StorySkin.editorial:
        return ZenType.serif(size, c, weight: weight ?? FontWeight.w500, height: height);
      case StorySkin.clay:
        return ZenType.rounded(size, c, weight: weight ?? FontWeight.w600, height: height);
      default:
        return ZenType.text(size, c, weight: weight ?? FontWeight.w500, ls: ls, height: height);
    }
  }

  TextStyle cap({Color? color, double size = 10}) =>
      skin == StorySkin.retro
          ? ZenType.mono(size, color ?? fg2, weight: FontWeight.w700).copyWith(letterSpacing: 1.8)
          : ZenType.caption(color ?? fg2, size: size);

  /// Animated backdrop honouring the user's choice, else the design default.
  Widget bg(String coverUrl, {StoryBackgroundStyle? style, bool animate = true}) => ArtMeshBackground(
        coverUrl: coverUrl,
        palette: palette,
        style: style ?? resolvedBg,
        isLight: isLight,
        animate: animate,
      );

  /// Wraps the hero element in this design's motion (hop / float / tilt…).
  Widget motion(Widget child, {double amp = 7, double phase = 0, MotionKind? kind}) =>
      StoryMotion(kind: kind ?? template.motion, amplitude: amp, phase: phase, child: child);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. ZENIFY LOGO — transparent, flat, no glass / gloss / glow. On EVERY card.
// ═════════════════════════════════════════════════════════════════════════════

class ZenifyLogoImage extends StatelessWidget {
  const ZenifyLogoImage({super.key, required this.height, this.color});

  final double height;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/zenify_logo.png',
      height: height,
      fit: BoxFit.contain,
      color: color,
      filterQuality: FilterQuality.high,
      errorBuilder: (_, _, _) => Image.asset(
        'assets/images/z_logo.png',
        height: height,
        fit: BoxFit.contain,
        color: color,
        filterQuality: FilterQuality.high,
        errorBuilder: (_, _, _) => Text('Zenify', style: ZenType.display(height * 0.8, color ?? Colors.white)),
      ),
    );
  }
}

/// Just the logo: no chip, no capsule, no shadow, fully opaque, sitting
/// directly on the card so the viewer instantly reads "from Zenify".
/// Pass [tint] to force a single flat colour on very busy artwork.
class ZenifyStoryBrand extends StatelessWidget {
  const ZenifyStoryBrand({
    super.key,
    this.color,
    this.isLight = false,
    this.iconSize = 18,
    this.showWordmark = false,
  });

  final Color? color;
  final bool isLight;
  final double iconSize;

  /// Leave false if your logo asset already contains the wordmark.
  final bool showWordmark;

  @override
  Widget build(BuildContext context) {
    final h = (iconSize * 1.15).clamp(16.0, 44.0);
    final textColor = isLight ? const Color(0xFF121214) : Colors.white;
    return Semantics(
      label: 'Zenify',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ZenifyLogoImage(height: h, color: color),
          if (showWordmark) ...[
            const SizedBox(width: 6),
            Text('Zenify', style: ZenType.display(h * 0.62, textColor)),
          ],
        ],
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. LIQUID GLASS (Zenify Dock Glass spec)
//    • light blur (5.0) – clear, never foggy
//    • +70 % saturation – glass glows with the colours behind it
//    • 1px specular edge + soft 5px inner glow = thick curved glass
//    • floating soft shadow painted OUTSIDE only (keeps glass clear)
//    • optional slow moving sheen = liquid light
// ═════════════════════════════════════════════════════════════════════════════

List<double> _saturationMatrix(double s) {
  const lr = 0.2126, lg = 0.7152, lb = 0.0722;
  final sr = (1 - s) * lr, sg = (1 - s) * lg, sb = (1 - s) * lb;
  return <double>[
    sr + s, sg, sb, 0, 0, //
    sr, sg + s, sb, 0, 0,
    sr, sg, sb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

class LiquidGlass extends StatefulWidget {
  const LiquidGlass({
    super.key,
    required this.child,
    this.radius = 24,
    this.blur = 5.0,
    this.saturation = 1.7,
    this.isLight = false,
    this.padding = EdgeInsets.zero,
    this.tint,
    this.shadow = true,
    this.animate = false,
    this.width,
    this.height,
    this.alignment,
  });

  final Widget child;
  final double radius;
  final double blur;
  final double saturation;
  final bool isLight;
  final EdgeInsetsGeometry padding;
  final Color? tint;
  final bool shadow;
  final bool animate;
  final double? width;
  final double? height;
  final AlignmentGeometry? alignment;

  @override
  State<LiquidGlass> createState() => _LiquidGlassState();
}

class _LiquidGlassState extends State<LiquidGlass> with SingleTickerProviderStateMixin {
  AnimationController? _c;

  @override
  void initState() {
    super.initState();
    if (widget.animate) {
      _c = AnimationController(vsync: this, duration: const Duration(seconds: 7))..repeat();
    }
  }

  @override
  void dispose() {
    _c?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(widget.radius);
    final light = widget.isLight;
    final tint = widget.tint ??
        (light ? Colors.white.withValues(alpha: 0.34) : Colors.white.withValues(alpha: 0.08));

    final inner = widget.alignment != null
        ? Align(alignment: widget.alignment!, child: widget.child)
        : widget.child;

    final glass = ClipRRect(
      borderRadius: br,
      child: BackdropFilter(
        filter: ImageFilter.compose(
          outer: ImageFilter.blur(
            sigmaX: widget.blur,
            sigmaY: widget.blur,
            tileMode: TileMode.mirror,
          ),
          inner: ColorFilter.matrix(_saturationMatrix(widget.saturation)),
        ),
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: tint,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withValues(alpha: light ? 0.30 : 0.16),
                      Colors.white.withValues(alpha: 0.0),
                      Colors.white.withValues(alpha: light ? 0.10 : 0.04),
                    ],
                    stops: const [0.0, 0.55, 1.0],
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(painter: _GlassEdgePainter(widget.radius, light)),
              ),
            ),
            if (_c != null)
              Positioned.fill(
                child: IgnorePointer(
                  child: AnimatedBuilder(
                    animation: _c!,
                    builder: (_, _) => CustomPaint(painter: _SheenPainter(_c!.value)),
                  ),
                ),
              ),
            Padding(padding: widget.padding, child: inner),
          ],
        ),
      ),
    );

    final shadowed = widget.shadow
        ? CustomPaint(painter: _OuterShadowPainter(widget.radius), child: glass)
        : glass;

    if (widget.width != null || widget.height != null) {
      return SizedBox(width: widget.width, height: widget.height, child: shadowed);
    }
    return shadowed;
  }
}

class _GlassEdgePainter extends CustomPainter {
  _GlassEdgePainter(this.radius, this.isLight);
  final double radius;
  final bool isLight;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius));

    // Soft 5px inner glow
    canvas.save();
    canvas.clipRRect(rrect);
    canvas.drawRRect(
      rrect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5)
        ..color = Colors.white.withValues(alpha: isLight ? 0.55 : 0.20),
    );
    // Subtle lower inner shade = thickness
    canvas.drawRRect(
      rrect.shift(const Offset(0, -2)),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5)
        ..color = Colors.black.withValues(alpha: isLight ? 0.04 : 0.14),
    );
    canvas.restore();

    // 1px specular edge (bright on top, fading, tiny rim at bottom)
    canvas.drawRRect(
      rrect.deflate(0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.white.withValues(alpha: 0.85),
            Colors.white.withValues(alpha: 0.20),
            Colors.white.withValues(alpha: 0.06),
            Colors.white.withValues(alpha: 0.34),
          ],
          stops: const [0.0, 0.28, 0.7, 1.0],
        ).createShader(Offset.zero & size),
    );
  }

  @override
  bool shouldRepaint(_GlassEdgePainter old) => old.radius != radius || old.isLight != isLight;
}

class _SheenPainter extends CustomPainter {
  _SheenPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final shift = -1.6 + 3.8 * t;
    final rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment(shift, -1),
          end: Alignment(shift + 1.1, 1),
          colors: [
            Colors.white.withValues(alpha: 0.0),
            Colors.white.withValues(alpha: 0.14),
            Colors.white.withValues(alpha: 0.0),
          ],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_SheenPainter old) => old.t != t;
}

class _OuterShadowPainter extends CustomPainter {
  _OuterShadowPainter(this.radius);
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius));
    canvas.save();
    canvas.clipPath(
      Path()
        ..fillType = PathFillType.evenOdd
        ..addRect(Rect.fromLTWH(-120, -120, size.width + 240, size.height + 240))
        ..addRRect(rrect),
    );
    canvas.drawRRect(
      rrect.shift(const Offset(0, 16)),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.30)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18),
    );
    canvas.drawRRect(
      rrect.shift(const Offset(0, 3)),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.16)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_OuterShadowPainter old) => old.radius != radius;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. ARTWORK (continuous squircle, hairline, real shadow, logo fallback)
// ═════════════════════════════════════════════════════════════════════════════

class StoryArtwork extends StatelessWidget {
  const StoryArtwork({
    super.key,
    required this.url,
    this.size,
    this.width,
    this.height,
    this.radius = 18,
    this.circle = false,
    this.shadow = true,
    this.palette,
    this.hairline = true,
  });

  final String url;
  final double? size;
  final double? width;
  final double? height;
  final double radius;
  final bool circle;
  final bool shadow;
  final ArtworkPalette? palette;
  final bool hairline;

  @override
  Widget build(BuildContext context) {
    final w = width ?? size ?? 100;
    final h = height ?? size ?? w;
    final p = palette ?? ArtworkPalette.defaultPalette;

    Widget image;
    if (url.startsWith('http')) {
      image = CachedNetworkImage(
        imageUrl: url,
        width: w,
        height: h,
        fit: BoxFit.cover,
        fadeInDuration: Duration.zero,
        placeholder: (_, _) => _fallback(p, w, h),
        errorWidget: (_, _, _) => _fallback(p, w, h),
      );
    } else if (url.startsWith('assets/')) {
      image = Image.asset(
        url,
        width: w,
        height: h,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => _fallback(p, w, h),
      );
    } else {
      image = _fallback(p, w, h);
    }

    final ShapeBorder shape = circle
        ? const CircleBorder()
        : ContinuousRectangleBorder(borderRadius: BorderRadius.circular(radius * 1.9));

    return SizedBox(
      width: w,
      height: h,
      child: DecoratedBox(
        decoration: ShapeDecoration(
          shape: shape,
          shadows: shadow
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.38),
                    blurRadius: math.max(18, w * 0.12),
                    offset: Offset(0, math.max(8, w * 0.06)),
                  ),
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 3,
                    offset: const Offset(0, 1),
                  ),
                ]
              : null,
        ),
        child: ClipPath(
          clipper: ShapeBorderClipper(shape: shape),
          child: Stack(
            fit: StackFit.expand,
            children: [
              image,
              if (hairline)
                IgnorePointer(
                  child: DecoratedBox(
                    decoration: ShapeDecoration(
                      shape: circle
                          ? CircleBorder(
                              side: BorderSide(
                                color: Colors.white.withValues(alpha: 0.14),
                                width: 0.7,
                              ),
                            )
                          : ContinuousRectangleBorder(
                              borderRadius: BorderRadius.circular(radius * 1.9),
                              side: BorderSide(
                                color: Colors.white.withValues(alpha: 0.14),
                                width: 0.7,
                              ),
                            ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _fallback(ArtworkPalette p, double w, double h) {
    return Container(
      width: w,
      height: h,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [p.primary, p.secondary],
        ),
      ),
      child: Opacity(
        opacity: 0.9,
        child: ZenifyLogoImage(height: math.min(w, h) * 0.34),
      ),
    );
  }
}


// ═════════════════════════════════════════════════════════════════════════════
// 4. ANIMATED BACKDROPS — liquid, blur, midnight, vivid, aurora, sunset,
//    paper, clay, dots
// ═════════════════════════════════════════════════════════════════════════════

class ArtMeshBackground extends StatefulWidget {
  const ArtMeshBackground({
    super.key,
    required this.coverUrl,
    this.palette,
    this.style = StoryBackgroundStyle.liquid,
    this.darken = true,
    this.isLight = false,
    this.animate = true,
  });

  final String coverUrl;
  final ArtworkPalette? palette;
  final StoryBackgroundStyle style;
  final bool darken;
  final bool isLight;
  final bool animate;

  @override
  State<ArtMeshBackground> createState() => _ArtMeshBackgroundState();
}

class _ArtMeshBackgroundState extends State<ArtMeshBackground> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(seconds: 18));
    if (widget.animate) _c.repeat();
  }

  @override
  void didUpdateWidget(ArtMeshBackground old) {
    super.didUpdateWidget(old);
    if (widget.animate && !_c.isAnimating) _c.repeat();
    if (!widget.animate && _c.isAnimating) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  ArtworkPalette get _p => widget.palette ?? ArtworkPaletteService.instance.getCachedOrFallback(widget.coverUrl);

  Widget _animated(CustomPainter Function(double t) make) => AnimatedBuilder(
        animation: _c,
        builder: (_, _) => CustomPaint(painter: make(_c.value), size: Size.infinite),
      );

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final light = widget.isLight;
    switch (widget.style) {
      case StoryBackgroundStyle.artwork:
        return _artwork();
      case StoryBackgroundStyle.midnight:
        return _midnight();
      case StoryBackgroundStyle.vivid:
        return _animated((t) => _MeshPainter(p, t, light, vivid: true));
      case StoryBackgroundStyle.aurora:
        return _animated((t) => _AuroraPainter(p, t, light));
      case StoryBackgroundStyle.sunset:
        return AnimatedBuilder(
          animation: _c,
          builder: (_, _) {
            final a = 2 * math.pi * _c.value;
            return DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment(-0.6 * math.sin(a), -1),
                  end: Alignment(0.6 * math.sin(a), 1),
                  colors: [
                    Color.lerp(p.primary, Colors.white, light ? 0.35 : 0.08)!,
                    p.secondary,
                    Color.lerp(p.accent, Colors.black, light ? 0.0 : 0.35)!,
                  ],
                ),
              ),
            );
          },
        );
      case StoryBackgroundStyle.paper:
        return CustomPaint(painter: _PaperPainter(p, light), size: Size.infinite);
      case StoryBackgroundStyle.clay:
        return _animated((t) => _ClayPainter(p, t, light));
      case StoryBackgroundStyle.dots:
        return CustomPaint(painter: _DotsPainter(p, light), size: Size.infinite);
      case StoryBackgroundStyle.auto:
      case StoryBackgroundStyle.liquid:
        return _animated((t) => _MeshPainter(p, t, light));
    }
  }

  Widget _artwork() {
    final light = widget.isLight;
    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: light ? const Color(0xFFF2F2F7) : const Color(0xFF0B0B0D)),
        if (widget.coverUrl.startsWith('http'))
          ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 46, sigmaY: 46, tileMode: TileMode.clamp),
            child: ColorFiltered(
              colorFilter: ColorFilter.matrix(_saturationMatrix(1.7)),
              child: Transform.scale(
                scale: 1.5,
                child: CachedNetworkImage(
                  imageUrl: widget.coverUrl,
                  fit: BoxFit.cover,
                  fadeInDuration: Duration.zero,
                  errorWidget: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
            ),
          )
        else
          CustomPaint(painter: _MeshPainter(_p, 0.15, light)),
        ColoredBox(
          color: light
              ? Colors.white.withValues(alpha: 0.42)
              : Colors.black.withValues(alpha: widget.darken ? 0.34 : 0.18),
        ),
      ],
    );
  }

  Widget _midnight() {
    final p = _p;
    final light = widget.isLight;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: light ? const [Color(0xFFF7F7FA), Color(0xFFE4E4EA)] : [p.background, const Color(0xFF050506)],
        ),
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(0.0, 1.1),
            radius: 1.0,
            colors: [p.primary.withValues(alpha: light ? 0.22 : 0.34), p.primary.withValues(alpha: 0.0)],
          ),
        ),
      ),
    );
  }
}

class _AuroraPainter extends CustomPainter {
  _AuroraPainter(this.p, this.t, this.light);
  final ArtworkPalette p;
  final double t;
  final bool light;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final a = 2 * math.pi * t;
    canvas.drawRect(
      rect,
      Paint()..color = light ? const Color(0xFFF4F2FA) : Color.lerp(p.background, Colors.black, 0.35)!,
    );
    Color c(Color x) => light ? Color.lerp(x, Colors.white, 0.45)! : x;
    void blob(Offset o, double r, Color col, double al) => canvas.drawCircle(
          o,
          r,
          Paint()
            ..shader = RadialGradient(colors: [col.withValues(alpha: al), col.withValues(alpha: 0)])
                .createShader(Rect.fromCircle(center: o, radius: r)),
        );
    final w = size.width, h = size.height, m = math.max(w, h);
    blob(Offset(w * (0.85 + 0.08 * math.sin(a)), h * (0.10 + 0.05 * math.cos(a))), m * 0.70, c(p.accent), 0.85);
    blob(Offset(w * (0.45 + 0.14 * math.cos(a + 1)), h * (0.50 + 0.07 * math.sin(a + 1))), m * 0.62, c(p.primary), 0.80);
    blob(Offset(w * (0.10 + 0.08 * math.sin(a + 2)), h * (0.92 + 0.04 * math.cos(a + 2))), m * 0.72, c(p.secondary), 0.85);
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.white.withValues(alpha: 0.10), Colors.transparent, Colors.black.withValues(alpha: light ? 0 : 0.18)],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_AuroraPainter old) => old.t != t || old.p != p || old.light != light;
}

class _PaperPainter extends CustomPainter {
  _PaperPainter(this.p, this.light);
  final ArtworkPalette p;
  final bool light;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final base = light ? Color.lerp(const Color(0xFFEFE4CB), p.primary, 0.05)! : const Color(0xFF1B1713);
    canvas.drawRect(rect, Paint()..color = base);
    final rnd = math.Random(7);
    final dot = Paint()..color = (light ? const Color(0xFF6B4F2A) : Colors.white).withValues(alpha: light ? 0.10 : 0.05);
    for (int i = 0; i < 620; i++) {
      canvas.drawCircle(
        Offset(rnd.nextDouble() * size.width, rnd.nextDouble() * size.height),
        0.4 + rnd.nextDouble() * 0.8,
        dot,
      );
    }
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          radius: 0.95,
          colors: [Colors.transparent, (light ? const Color(0xFF8A6A3A) : Colors.black).withValues(alpha: 0.18)],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_PaperPainter old) => old.light != light || old.p != p;
}

class _ClayPainter extends CustomPainter {
  _ClayPainter(this.p, this.t, this.light);
  final ArtworkPalette p;
  final double t;
  final bool light;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final a = 2 * math.pi * t;
    canvas.drawRect(
      rect,
      Paint()..color = light ? Color.lerp(Colors.white, p.primary, 0.22)! : Color.lerp(p.background, p.primary, 0.30)!,
    );
    void blob(Offset o, double r, Color col, double al) => canvas.drawCircle(
          o,
          r,
          Paint()
            ..shader = RadialGradient(colors: [col.withValues(alpha: al), col.withValues(alpha: 0)])
                .createShader(Rect.fromCircle(center: o, radius: r)),
        );
    final w = size.width, h = size.height, m = math.max(w, h);
    Color soft(Color x) => light ? Color.lerp(Colors.white, x, 0.55)! : x;
    blob(Offset(w * (0.2 + 0.06 * math.sin(a)), h * 0.15), m * 0.55, soft(p.secondary), 0.9);
    blob(Offset(w * (0.9 + 0.05 * math.cos(a)), h * (0.55 + 0.05 * math.sin(a))), m * 0.5, soft(p.accent), 0.85);
    blob(Offset(w * 0.3, h * (0.95 + 0.03 * math.cos(a))), m * 0.55, soft(p.primary), 0.7);
  }

  @override
  bool shouldRepaint(_ClayPainter old) => old.t != t || old.p != p || old.light != light;
}

class _DotsPainter extends CustomPainter {
  _DotsPainter(this.p, this.light);
  final ArtworkPalette p;
  final bool light;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()..color = light ? const Color(0xFFF1F1F4) : Color.lerp(const Color(0xFF08080A), p.background, 0.5)!,
    );
    final dot = Paint()..color = (light ? Colors.black : Colors.white).withValues(alpha: 0.10);
    for (double y = 10; y < size.height; y += 16) {
      for (double x = 10; x < size.width; x += 16) {
        canvas.drawCircle(Offset(x, y), 0.9, dot);
      }
    }
    final c = Offset(size.width / 2, size.height * 1.02);
    canvas.drawCircle(
      c,
      size.longestSide * 0.7,
      Paint()
        ..shader = RadialGradient(colors: [p.primary.withValues(alpha: light ? 0.25 : 0.38), p.primary.withValues(alpha: 0)])
            .createShader(Rect.fromCircle(center: c, radius: size.longestSide * 0.7)),
    );
  }

  @override
  bool shouldRepaint(_DotsPainter old) => old.light != light || old.p != p;
}

class _MeshPainter extends CustomPainter {
  _MeshPainter(this.p, this.t, this.light, {this.vivid = false});

  final ArtworkPalette p;
  final double t;
  final bool light;
  final bool vivid;

  Color _c(Color c) => light ? Color.lerp(c, Colors.white, 0.38)! : c;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final a = 2 * math.pi * t;

    // base
    if (vivid) {
      canvas.drawRect(
        rect,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [_c(p.primary), _c(p.secondary)],
          ).createShader(rect),
      );
    } else {
      canvas.drawRect(
        rect,
        Paint()..color = light ? Color.lerp(Colors.white, p.primary, 0.10)! : p.background,
      );
    }

    void blob(Offset c, double r, Color col, double alpha) {
      canvas.drawCircle(
        c,
        r,
        Paint()
          ..shader = RadialGradient(
            colors: [col.withValues(alpha: alpha), col.withValues(alpha: 0)],
          ).createShader(Rect.fromCircle(center: c, radius: r)),
      );
    }

    final w = size.width, h = size.height;
    final m = math.max(w, h);

    blob(Offset(w * (0.15 + 0.12 * math.sin(a)), h * (0.12 + 0.07 * math.cos(a))), m * 0.62,
        _c(p.primary), vivid ? 0.55 : 0.92);
    blob(Offset(w * (0.88 + 0.10 * math.cos(a + 1.3)), h * (0.88 + 0.06 * math.sin(a + 1.3))),
        m * 0.66, _c(p.secondary), vivid ? 0.60 : 0.86);
    blob(Offset(w * (0.78 + 0.12 * math.sin(a + 2.6)), h * (0.42 + 0.09 * math.cos(a + 2.6))),
        m * 0.42, _c(p.accent), 0.55);
    blob(Offset(w * (0.20 + 0.10 * math.cos(a + 4.0)), h * (0.70 + 0.08 * math.sin(a + 4.0))),
        m * 0.40, _c(p.primary), 0.45);

    // gentle depth vignette
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withValues(alpha: light ? 0.0 : 0.10),
            Colors.black.withValues(alpha: light ? 0.04 : 0.28),
          ],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_MeshPainter old) =>
      old.t != t || old.p != p || old.light != light || old.vivid != vivid;
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. MOTION HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/// Slow organic hover. Gives artwork / glass a liquid, alive feel.
class Bob extends StatefulWidget {
  const Bob({
    super.key,
    required this.child,
    this.dy = 4,
    this.dx = 0,
    this.rotate = 0,
    this.seconds = 6,
    this.phase = 0,
  });

  final Widget child;
  final double dy;
  final double dx;
  final double rotate;
  final int seconds;
  final double phase;

  @override
  State<Bob> createState() => _BobState();
}

class _BobState extends State<Bob> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: Duration(seconds: widget.seconds))..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (_, child) {
        final a = 2 * math.pi * (_c.value + widget.phase);
        return Transform.translate(
          offset: Offset(math.sin(a * 0.8) * widget.dx, math.sin(a) * widget.dy),
          child: Transform.rotate(angle: math.sin(a * 0.7) * widget.rotate, child: child),
        );
      },
    );
  }
}

/// Continuous rotation (vinyl, disc).
class Spin extends StatefulWidget {
  const Spin({super.key, required this.child, this.seconds = 14, this.startAngle = 0});
  final Widget child;
  final int seconds;
  final double startAngle;

  @override
  State<Spin> createState() => _SpinState();
}

class _SpinState extends State<Spin> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: Duration(seconds: widget.seconds))..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RotationTransition(
        turns: Tween<double>(begin: widget.startAngle, end: widget.startAngle + 1).animate(_c),
        child: widget.child,
      );
}

/// Live equalizer-style waveform.
class StoryWaveform extends StatefulWidget {
  const StoryWaveform({
    super.key,
    required this.color,
    this.bars = 28,
    this.height = 26,
    this.seed = 7,
    this.barWidth = 3,
  });

  final Color color;
  final int bars;
  final double height;
  final int seed;
  final double barWidth;

  @override
  State<StoryWaveform> createState() => _StoryWaveformState();
}

class _StoryWaveformState extends State<StoryWaveform> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, _) => CustomPaint(
        size: Size(double.infinity, widget.height),
        painter: _WavePainter(widget.color, widget.bars, widget.seed, widget.barWidth, _c.value),
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  _WavePainter(this.color, this.bars, this.seed, this.barWidth, this.t);
  final Color color;
  final int bars;
  final int seed;
  final double barWidth;
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final gap = (size.width - bars * barWidth) / math.max(1, bars - 1);
    final paint = Paint()
      ..color = color
      ..strokeCap = StrokeCap.round
      ..strokeWidth = barWidth;
    for (int i = 0; i < bars; i++) {
      final base = 0.35 + 0.65 * ((math.sin(i * 1.7 + seed) + 1) / 2);
      final live = 0.78 + 0.22 * math.sin(2 * math.pi * t + i * 0.55);
      final bh = math.max(barWidth, size.height * base * live);
      final x = i * (barWidth + gap) + barWidth / 2;
      canvas.drawLine(
        Offset(x, size.height / 2 - bh / 2),
        Offset(x, size.height / 2 + bh / 2),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) => old.t != t || old.color != color;
}


/// Hero-element motion. Transform-only (never changes layout), so cards stay
/// perfectly anchored while they float, hop, sway, pulse or tilt.
class StoryMotion extends StatefulWidget {
  const StoryMotion({
    super.key,
    required this.child,
    this.kind = MotionKind.float,
    this.amplitude = 7,
    this.phase = 0,
    this.period = const Duration(milliseconds: 3800),
  });

  final Widget child;
  final MotionKind kind;
  final double amplitude;
  final double phase;
  final Duration period;

  @override
  State<StoryMotion> createState() => _StoryMotionState();
}

class _StoryMotionState extends State<StoryMotion> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: widget.period);
    if (widget.kind != MotionKind.none) _c.repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.kind == MotionKind.none) return widget.child;
    final amp = widget.amplitude;
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (_, child) {
        final t = (_c.value + widget.phase) % 1.0;
        final a = 2 * math.pi * t;
        double dx = 0, dy = 0, rot = 0, sx = 1, sy = 1, rx = 0, ry = 0;
        switch (widget.kind) {
          case MotionKind.none:
            break;
          case MotionKind.float:
            dy = math.sin(a) * amp;
            rot = math.sin(a * 0.7) * 0.008;
          case MotionKind.bounce:
            // Two hops then rest; squash on landing. Always returns to origin.
            final hop1 = t < 0.40 ? math.sin(t / 0.40 * math.pi) : 0.0;
            final hop2 = (t >= 0.52 && t < 0.72) ? math.sin((t - 0.52) / 0.20 * math.pi) * 0.30 : 0.0;
            dy = -(hop1 + hop2) * amp * 1.5;
            final land = (t >= 0.40 && t < 0.48) ? math.sin((t - 0.40) / 0.08 * math.pi) : 0.0;
            sx = 1 + land * 0.022;
            sy = 1 - land * 0.028;
          case MotionKind.sway:
            rot = math.sin(a) * 0.028;
            dx = math.sin(a) * amp * 0.5;
            dy = math.cos(a * 2) * amp * 0.15;
          case MotionKind.pulse:
            sx = sy = 1 + math.sin(a) * 0.03;
          case MotionKind.tilt:
            rx = math.sin(a) * 0.045;
            ry = math.cos(a) * 0.07;
            dy = math.sin(a * 0.5) * amp * 0.4;
        }
        Widget w = child!;
        if (sx != 1 || sy != 1) w = Transform.scale(scaleX: sx, scaleY: sy, child: w);
        if (rx != 0 || ry != 0) {
          w = Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.0012)
              ..rotateX(rx)
              ..rotateY(ry),
            child: w,
          );
        }
        if (rot != 0) w = Transform.rotate(angle: rot, child: w);
        return Transform.translate(offset: Offset(dx, dy), child: w);
      },
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. STORY CARD VIEWPORT — export boundary is CLEAN and uses the design's ratio
// ═════════════════════════════════════════════════════════════════════════════

class StoryCardViewport extends StatelessWidget {
  const StoryCardViewport({
    super.key,
    required this.ratio,
    required this.child,
    this.boundaryKey,
    this.clipRadius = 30.0,
    this.elevation = 30.0,
  });

  final StoryRatio ratio;
  final Widget child;
  final GlobalKey? boundaryKey;
  final double clipRadius;
  final double elevation;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: ratio.ratio,
      child: FittedBox(
        fit: BoxFit.contain,
        child: SizedBox(
          width: ratio.width,
          height: ratio.height,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(clipRadius),
              boxShadow: elevation > 0
                  ? [BoxShadow(color: Colors.black.withValues(alpha: 0.55), blurRadius: elevation, offset: const Offset(0, 14))]
                  : null,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(clipRadius),
              // Rounding + shadow live OUTSIDE the boundary so exported PNGs
              // are perfectly rectangular, full-bleed.
              child: RepaintBoundary(
                key: boundaryKey,
                child: SizedBox(width: ratio.width, height: ratio.height, child: child),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. SKIN FILTER + TEMPLATE SELECTOR
// ═════════════════════════════════════════════════════════════════════════════

class StorySkinFilter extends StatelessWidget {
  const StorySkinFilter({super.key, required this.skins, required this.selected, required this.onSelected});

  final List<StorySkin> skins;
  final StorySkin? selected;
  final ValueChanged<StorySkin?> onSelected;

  @override
  Widget build(BuildContext context) {
    Widget chip(String label, bool on, VoidCallback tap) => GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            HapticFeedback.selectionClick();
            tap();
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: ShapeDecoration(
              shape: const StadiumBorder(),
              color: on ? Colors.white.withValues(alpha: 0.92) : Colors.white.withValues(alpha: 0.08),
            ),
            child: Text(
              label,
              style: ZenType.text(12, on ? const Color(0xFF121214) : Colors.white.withValues(alpha: 0.78),
                  weight: on ? FontWeight.w700 : FontWeight.w600),
            ),
          ),
        );

    return SizedBox(
      height: 30,
      child: ListView(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          chip('All', selected == null, () => onSelected(null)),
          for (final s in skins) ...[
            const SizedBox(width: 8),
            chip(s.label, selected == s, () => onSelected(s)),
          ],
        ],
      ),
    );
  }
}

class StoryTemplateSelector extends StatefulWidget {
  const StoryTemplateSelector({
    super.key,
    required this.templates,
    required this.selectedTemplate,
    required this.onSelectTemplate,
  });

  final List<StoryTemplate> templates;
  final StoryTemplate selectedTemplate;
  final ValueChanged<StoryTemplate> onSelectTemplate;

  @override
  State<StoryTemplateSelector> createState() => _StoryTemplateSelectorState();
}

class _StoryTemplateSelectorState extends State<StoryTemplateSelector> {
  late List<GlobalKey> _keys;

  @override
  void initState() {
    super.initState();
    _keys = List.generate(widget.templates.length, (_) => GlobalKey());
    WidgetsBinding.instance.addPostFrameCallback((_) => _reveal(animated: false));
  }

  @override
  void didUpdateWidget(StoryTemplateSelector old) {
    super.didUpdateWidget(old);
    if (old.templates.length != widget.templates.length || old.templates.firstOrNull?.id != widget.templates.firstOrNull?.id) {
      _keys = List.generate(widget.templates.length, (_) => GlobalKey());
    }
    if (old.selectedTemplate.id != widget.selectedTemplate.id) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _reveal());
    }
  }

  void _reveal({bool animated = true}) {
    if (!mounted) return;
    final i = widget.templates.indexWhere((t) => t.id == widget.selectedTemplate.id);
    if (i < 0 || i >= _keys.length) return;
    final ctx = _keys[i].currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(
      ctx,
      alignment: 0.5,
      duration: animated ? const Duration(milliseconds: 380) : Duration.zero,
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: widget.templates.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final t = widget.templates[index];
          final selected = t.id == widget.selectedTemplate.id;
          return GestureDetector(
            key: _keys[index],
            behavior: HitTestBehavior.opaque,
            onTap: () {
              if (!selected) {
                HapticFeedback.selectionClick();
                widget.onSelectTemplate(t);
              }
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: ShapeDecoration(
                shape: const StadiumBorder(),
                color: selected ? Colors.white : Colors.white.withValues(alpha: 0.10),
                shadows: selected ? [BoxShadow(color: Colors.white.withValues(alpha: 0.25), blurRadius: 14)] : null,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(t.icon, size: 14, color: selected ? const Color(0xFF121214) : Colors.white.withValues(alpha: 0.75)),
                  const SizedBox(width: 6),
                  Text(
                    t.name,
                    style: ZenType.text(13, selected ? const Color(0xFF121214) : Colors.white.withValues(alpha: 0.80),
                        weight: selected ? FontWeight.w700 : FontWeight.w600),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. SHARE CONTROLS — backdrop / text chips + scrollable glass share dock
// ═════════════════════════════════════════════════════════════════════════════

class ShareDestination {
  const ShareDestination({
    required this.label,
    required this.icon,
    required this.colors,
    required this.onTap,
    this.glyph = Colors.white,
    this.textGlyph,
  });

  final String label;
  final IconData icon;
  final List<Color> colors;
  final VoidCallback onTap;
  final Color glyph;

  /// Optional text mark instead of an icon (e.g. "X").
  final String? textGlyph;
}

class StoryShareControls extends StatelessWidget {
  const StoryShareControls({
    super.key,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.lockPolarity,
    required this.onToggleBackgroundStyle,
    required this.onToggleTextPolarity,
    required this.destinations,
    this.isExporting = false,
  });

  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final bool lockPolarity;
  final VoidCallback onToggleBackgroundStyle;
  final VoidCallback onToggleTextPolarity;
  final List<ShareDestination> destinations;
  final bool isExporting;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _GlassChip(icon: backgroundStyle.icon, label: 'Backdrop · ${backgroundStyle.label}', onTap: onToggleBackgroundStyle),
            if (!lockPolarity) ...[
              const SizedBox(width: 8),
              _GlassChip(
                icon: textPolarity == StoryTextPolarity.light ? CupertinoIcons.moon_fill : CupertinoIcons.sun_max_fill,
                label: textPolarity.label,
                onTap: onToggleTextPolarity,
              ),
            ],
          ],
        ),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: isExporting ? 0.45 : 1,
            child: IgnorePointer(ignoring: isExporting, child: _ShareDock(items: destinations)),
          ),
        ),
      ],
    );
  }
}

class _GlassChip extends StatelessWidget {
  const _GlassChip({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: LiquidGlass(
        radius: 100,
        blur: 5,
        shadow: false,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13.5, color: Colors.white),
            const SizedBox(width: 5),
            Text(label, style: ZenType.text(12, Colors.white, weight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _ShareDock extends StatelessWidget {
  const _ShareDock({required this.items});
  final List<ShareDestination> items;

  @override
  Widget build(BuildContext context) {
    return LiquidGlass(
      radius: 28,
      blur: 5,
      saturation: 1.7,
      height: 92,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        itemCount: items.length,
        itemBuilder: (_, i) => _DockTile(item: items[i]),
      ),
    );
  }
}

class _DockTile extends StatefulWidget {
  const _DockTile({required this.item});
  final ShareDestination item;

  @override
  State<_DockTile> createState() => _DockTileState();
}

class _DockTileState extends State<_DockTile> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Semantics(
      label: item.label,
      button: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _down = true),
        onTapCancel: () => setState(() => _down = false),
        onTapUp: (_) => setState(() => _down = false),
        onTap: () {
          HapticFeedback.lightImpact();
          item.onTap();
        },
        child: SizedBox(
          width: 64,
          child: AnimatedScale(
            scale: _down ? 0.90 : 1.0,
            duration: const Duration(milliseconds: 140),
            curve: Curves.easeOutBack,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: item.colors),
                    boxShadow: [BoxShadow(color: item.colors.first.withValues(alpha: 0.40), blurRadius: 10, offset: const Offset(0, 3))],
                  ),
                  child: item.textGlyph != null
                      ? Text(item.textGlyph!, style: ZenType.display(20, item.glyph, weight: FontWeight.w800))
                      : Icon(item.icon, size: 21, color: item.glyph),
                ),
                const SizedBox(height: 6),
                Text(item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ZenType.text(10.5, Colors.white.withValues(alpha: 0.85), weight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
