import 'dart:async';
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

  static TextStyle display(
    double size,
    Color color, {
    FontWeight weight = FontWeight.w700,
    double? ls,
    double height = 1.08,
  }) =>
      TextStyle(
        fontFamily: 'SF Pro Display',
        fontSize: size,
        fontWeight: weight,
        letterSpacing: ls ?? -size * 0.024,
        height: height,
        color: color,
      );

  static TextStyle text(
    double size,
    Color color, {
    FontWeight weight = FontWeight.w500,
    double ls = 0,
    double height = 1.2,
  }) =>
      TextStyle(
        fontFamily: 'SF Pro Text',
        fontSize: size,
        fontWeight: weight,
        letterSpacing: ls,
        height: height,
        color: color,
      );

  static TextStyle serif(
    double size,
    Color color, {
    FontWeight weight = FontWeight.w600,
    double height = 1.12,
  }) =>
      TextStyle(
        fontFamily: 'New York',
        fontFamilyFallback: const ['Georgia', 'Times New Roman', 'serif'],
        fontSize: size,
        fontWeight: weight,
        letterSpacing: -size * 0.016,
        height: height,
        color: color,
      );

  /// Small uppercase caption used for minimal metadata ("SONG", "ALBUM"…).
  static TextStyle caption(Color color, {double size = 10.5}) => TextStyle(
        fontFamily: 'SF Pro Text',
        fontSize: size,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.6,
        height: 1.1,
        color: color,
      );
}

/// Everything a template needs besides its content.
@immutable
class StoryTemplateArgs {
  const StoryTemplateArgs({
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
  });

  final ArtworkPalette palette;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final StoryAspectRatio aspectRatio;

  bool get isSquare => aspectRatio == StoryAspectRatio.square;

  /// True when the card uses the bright "Light Glass" theme (dark text).
  bool get isLight => textPolarity == StoryTextPolarity.dark;

  double get w => aspectRatio.width;
  double get h => aspectRatio.height;

  Color get fg => textPolarity.textColor;
  Color get fg2 => textPolarity.secondaryColor;
  Color get fg3 => textPolarity.textColor.withValues(alpha: 0.42);

  /// Standard animated liquid backdrop honouring style + polarity.
  Widget bg(String coverUrl, {StoryBackgroundStyle? style, bool animate = true}) =>
      ArtMeshBackground(
        coverUrl: coverUrl,
        palette: palette,
        style: style ?? backgroundStyle,
        isLight: isLight,
        animate: animate,
      );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. ZENIFY LOGO + BRAND COMPONENTS (used on EVERY card)
// ═════════════════════════════════════════════════════════════════════════════

/// The raw Zenify logo asset with graceful fallbacks.
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
      errorBuilder: (_, _, _) => Image.asset(
        'assets/images/z_logo.png',
        height: height,
        fit: BoxFit.contain,
        color: color,
        errorBuilder: (_, _, _) => Text(
          'Zenify',
          style: ZenType.display(height * 0.8, color ?? Colors.white),
        ),
      ),
    );
  }
}

enum ZenifyBrandStyle {
  /// Logo inside a clear liquid-glass capsule (default, readable on any art).
  chip,

  /// Logo inside a glass squircle tile (app-icon feel).
  tile,

  /// Bare logo, slightly translucent.
  watermark,
}

class ZenifyStoryBrand extends StatelessWidget {
  const ZenifyStoryBrand({
    super.key,
    this.color,
    this.isLight = false,
    this.iconSize = 18,
    this.showWordmark = false,
    this.style = ZenifyBrandStyle.chip,
  });

  /// Optional explicit tint. Null keeps the natural brand colours.
  final Color? color;

  /// True on a bright card.
  final bool isLight;

  final double iconSize;

  /// Adds a "Zenify" wordmark next to the logo. Leave false if your logo
  /// asset already contains the wordmark.
  final bool showWordmark;

  final ZenifyBrandStyle style;

  @override
  Widget build(BuildContext context) {
    final h = (iconSize * 1.15).clamp(16.0, 40.0);
    final textColor = isLight ? const Color(0xFF121214) : Colors.white;

    Widget label() => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ZenifyLogoImage(height: h, color: color),
            if (showWordmark) ...[
              const SizedBox(width: 6),
              Text('Zenify', style: ZenType.display(h * 0.62, textColor)),
            ],
          ],
        );

    Widget child;
    switch (style) {
      case ZenifyBrandStyle.chip:
        child = LiquidGlass(
          radius: 100,
          blur: 6,
          isLight: isLight,
          shadow: false,
          padding: EdgeInsets.symmetric(horizontal: h * 0.5, vertical: h * 0.3),
          child: label(),
        );
      case ZenifyBrandStyle.tile:
        child = LiquidGlass(
          radius: h * 0.62,
          blur: 6,
          isLight: isLight,
          shadow: false,
          padding: EdgeInsets.all(h * 0.38),
          child: ZenifyLogoImage(height: h * 1.1, color: color),
        );
      case ZenifyBrandStyle.watermark:
        child = Opacity(opacity: 0.92, child: label());
    }

    return Semantics(label: 'Zenify', child: child);
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
// 4. ANIMATED LIQUID BACKGROUND
// ═════════════════════════════════════════════════════════════════════════════

class ArtMeshBackground extends StatefulWidget {
  const ArtMeshBackground({
    super.key,
    required this.coverUrl,
    this.palette,
    this.style = StoryBackgroundStyle.artMesh,
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

class _ArtMeshBackgroundState extends State<ArtMeshBackground>
    with SingleTickerProviderStateMixin {
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

  ArtworkPalette get _p =>
      widget.palette ?? ArtworkPaletteService.instance.getCachedOrFallback(widget.coverUrl);

  @override
  Widget build(BuildContext context) {
    switch (widget.style) {
      case StoryBackgroundStyle.blurredCover:
        return _artwork();
      case StoryBackgroundStyle.solidDark:
        return _midnight();
      case StoryBackgroundStyle.vivid:
        return AnimatedBuilder(
          animation: _c,
          builder: (_, _) => CustomPaint(
            painter: _MeshPainter(_p, _c.value, widget.isLight, vivid: true),
            size: Size.infinite,
          ),
        );
      case StoryBackgroundStyle.artMesh:
        return AnimatedBuilder(
          animation: _c,
          builder: (_, _) => CustomPaint(
            painter: _MeshPainter(_p, _c.value, widget.isLight),
            size: Size.infinite,
          ),
        );
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
          colors: light
              ? const [Color(0xFFF7F7FA), Color(0xFFE4E4EA)]
              : [p.background, const Color(0xFF050506)],
        ),
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: const Alignment(0.0, 1.1),
            radius: 1.0,
            colors: [
              p.primary.withValues(alpha: light ? 0.22 : 0.34),
              p.primary.withValues(alpha: 0.0),
            ],
          ),
        ),
      ),
    );
  }
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

// ═════════════════════════════════════════════════════════════════════════════
// 6. STORY CARD VIEWPORT (export boundary is CLEAN full-bleed 9:16 / 1:1)
// ═════════════════════════════════════════════════════════════════════════════

class StoryCardViewport extends StatelessWidget {
  const StoryCardViewport({
    super.key,
    required this.aspectRatio,
    required this.child,
    this.boundaryKey,
    this.clipRadius = 30.0,
    this.elevation = 30.0,
  });

  final StoryAspectRatio aspectRatio;
  final Widget child;
  final GlobalKey? boundaryKey;
  final double clipRadius;
  final double elevation;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: aspectRatio.ratio,
      child: FittedBox(
        fit: BoxFit.contain,
        child: SizedBox(
          width: aspectRatio.width,
          height: aspectRatio.height,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(clipRadius),
              boxShadow: elevation > 0
                  ? [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.55),
                        blurRadius: elevation,
                        offset: const Offset(0, 14),
                      ),
                    ]
                  : null,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(clipRadius),
              // Rounding + shadow live OUTSIDE the boundary so exported PNGs
              // are perfectly rectangular, full-bleed.
              child: RepaintBoundary(
                key: boundaryKey,
                child: SizedBox(
                  width: aspectRatio.width,
                  height: aspectRatio.height,
                  child: child,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. TEMPLATE SELECTOR (glass capsule row, auto-scrolls to selection)
// ═════════════════════════════════════════════════════════════════════════════

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
  late final List<GlobalKey> _keys;

  @override
  void initState() {
    super.initState();
    _keys = List.generate(widget.templates.length, (_) => GlobalKey());
    WidgetsBinding.instance.addPostFrameCallback((_) => _reveal(animated: false));
  }

  @override
  void didUpdateWidget(StoryTemplateSelector old) {
    super.didUpdateWidget(old);
    if (old.selectedTemplate.id != widget.selectedTemplate.id) _reveal();
  }

  void _reveal({bool animated = true}) {
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
                shadows: selected
                    ? [
                        BoxShadow(
                          color: Colors.white.withValues(alpha: 0.25),
                          blurRadius: 14,
                        ),
                      ]
                    : null,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    t.icon,
                    size: 14,
                    color: selected ? const Color(0xFF121214) : Colors.white.withValues(alpha: 0.75),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    t.name,
                    style: ZenType.text(
                      13,
                      selected ? const Color(0xFF121214) : Colors.white.withValues(alpha: 0.80),
                      weight: selected ? FontWeight.w700 : FontWeight.w600,
                    ),
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
// 8. SHARE CONTROLS — glass chips + floating 54px liquid dock
// ═════════════════════════════════════════════════════════════════════════════

class StoryShareControls extends StatelessWidget {
  const StoryShareControls({
    super.key,
    required this.aspectRatio,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.onToggleAspectRatio,
    required this.onToggleBackgroundStyle,
    required this.onToggleTextPolarity,
    required this.onShareInstagram,
    required this.onShareFacebook,
    required this.onShareWhatsApp,
    required this.onShareSnapchat,
    required this.onShareMore,
    required this.onSaveGallery,
    required this.onCopyLink,
    this.isExporting = false,
  });

  final StoryAspectRatio aspectRatio;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final VoidCallback onToggleAspectRatio;
  final VoidCallback onToggleBackgroundStyle;
  final VoidCallback onToggleTextPolarity;

  final VoidCallback onShareInstagram;
  final VoidCallback onShareFacebook;
  final VoidCallback onShareWhatsApp;
  final VoidCallback onShareSnapchat;
  final VoidCallback onShareMore;
  final VoidCallback onSaveGallery;
  final VoidCallback onCopyLink;
  final bool isExporting;

  @override
  Widget build(BuildContext context) {
    final items = <_DockItem>[
      _DockItem(
        label: 'Instagram',
        icon: Icons.camera_alt_rounded,
        colors: const [Color(0xFF833AB4), Color(0xFFFD1D1D), Color(0xFFFCB045)],
        onTap: onShareInstagram,
      ),
      _DockItem(
        label: 'WhatsApp',
        icon: Icons.chat_rounded,
        colors: const [Color(0xFF2EE66F), Color(0xFF128C7E)],
        onTap: onShareWhatsApp,
      ),
      _DockItem(
        label: 'Snapchat',
        icon: Icons.emoji_emotions_rounded,
        colors: const [Color(0xFFFFFC00), Color(0xFFFFD60A)],
        glyph: Colors.black,
        onTap: onShareSnapchat,
      ),
      _DockItem(
        label: 'Facebook',
        icon: Icons.facebook_rounded,
        colors: const [Color(0xFF2B8CFF), Color(0xFF1877F2)],
        onTap: onShareFacebook,
      ),
      _DockItem(
        label: 'Save',
        icon: CupertinoIcons.arrow_down_to_line,
        colors: const [Color(0xFF4A4A4F), Color(0xFF2C2C2E)],
        onTap: onSaveGallery,
      ),
      _DockItem(
        label: 'Link',
        icon: CupertinoIcons.link,
        colors: const [Color(0xFF4A4A4F), Color(0xFF2C2C2E)],
        onTap: onCopyLink,
      ),
      _DockItem(
        label: 'More',
        icon: CupertinoIcons.share,
        colors: const [Color(0xFFFF4D6D), Color(0xFFE11D48)],
        onTap: onShareMore,
      ),
    ];

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _GlassChip(
              icon: aspectRatio == StoryAspectRatio.story
                  ? CupertinoIcons.device_phone_portrait
                  : CupertinoIcons.square,
              label: aspectRatio.label,
              onTap: onToggleAspectRatio,
            ),
            const SizedBox(width: 8),
            _GlassChip(
              icon: backgroundStyle.icon,
              label: backgroundStyle.label,
              onTap: onToggleBackgroundStyle,
            ),
            const SizedBox(width: 8),
            _GlassChip(
              icon: textPolarity == StoryTextPolarity.light
                  ? CupertinoIcons.moon_fill
                  : CupertinoIcons.sun_max_fill,
              label: textPolarity.label,
              onTap: onToggleTextPolarity,
            ),
          ],
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: isExporting ? 0.45 : 1,
            child: _LiquidDock(items: items, disabled: isExporting),
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

class _DockItem {
  const _DockItem({
    required this.label,
    required this.icon,
    required this.colors,
    required this.onTap,
    this.glyph = Colors.white,
  });

  final String label;
  final IconData icon;
  final List<Color> colors;
  final VoidCallback onTap;
  final Color glyph;
}

/// 54px floating stadium pill. Long-press & slide: a glass lens follows your
/// finger with fluid delay, stretches when you flick, and clicks onto each item.
class _LiquidDock extends StatefulWidget {
  const _LiquidDock({required this.items, required this.disabled});
  final List<_DockItem> items;
  final bool disabled;

  @override
  State<_LiquidDock> createState() => _LiquidDockState();
}

class _LiquidDockState extends State<_LiquidDock> {
  bool _active = false;
  double _lensX = 0;
  double _stretch = 1;
  double _last = 0;
  double _w = 1;
  int _index = -1;
  Timer? _decay;

  @override
  void dispose() {
    _decay?.cancel();
    super.dispose();
  }

  int _indexFor(double dx) {
    final slot = _w / widget.items.length;
    return (dx / slot).floor().clamp(0, widget.items.length - 1);
  }

  void _relax() {
    _decay?.cancel();
    _decay = Timer(const Duration(milliseconds: 90), () {
      if (mounted) setState(() => _stretch = 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.items.length;
    return LayoutBuilder(
      builder: (context, c) {
        _w = c.maxWidth;
        final slot = _w / n;
        final lensW = 54.0 * _stretch;

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onLongPressStart: (d) {
            if (widget.disabled) return;
            HapticFeedback.mediumImpact();
            setState(() {
              _active = true;
              _lensX = d.localPosition.dx.clamp(0.0, _w);
              _last = _lensX;
              _index = _indexFor(_lensX);
              _stretch = 1;
            });
          },
          onLongPressMoveUpdate: (d) {
            if (!_active) return;
            final dx = d.localPosition.dx.clamp(0.0, _w);
            final idx = _indexFor(dx);
            if (idx != _index) HapticFeedback.selectionClick();
            setState(() {
              _stretch = 1 + math.min((dx - _last).abs() / 16, 0.5);
              _last = dx;
              _lensX = dx;
              _index = idx;
            });
            _relax();
          },
          onLongPressEnd: (_) {
            final idx = _index;
            setState(() {
              _active = false;
              _stretch = 1;
            });
            if (idx >= 0 && !widget.disabled) {
              HapticFeedback.lightImpact();
              widget.items[idx].onTap();
            }
          },
          onLongPressCancel: () => setState(() {
            _active = false;
            _stretch = 1;
          }),
          child: LiquidGlass(
            radius: 27,
            blur: 5,
            saturation: 1.7,
            height: 54,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Liquid lens
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 150),
                  curve: Curves.easeOutCubic,
                  left: (_active ? _lensX : (_index >= 0 ? slot * _index + slot / 2 : slot / 2)) -
                      lensW / 2,
                  top: 4,
                  width: lensW,
                  height: 46,
                  child: AnimatedScale(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutBack,
                    scale: _active ? 1.0 : 0.5,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 160),
                      opacity: _active ? 1 : 0,
                      child: const LiquidGlass(
                        radius: 23,
                        blur: 2,
                        shadow: false,
                        tint: Color(0x33FFFFFF),
                        child: SizedBox.expand(),
                      ),
                    ),
                  ),
                ),
                // Items
                Row(
                  children: [
                    for (int i = 0; i < n; i++)
                      Expanded(
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: widget.disabled
                              ? null
                              : () {
                                  HapticFeedback.lightImpact();
                                  widget.items[i].onTap();
                                },
                          child: Center(
                            child: AnimatedScale(
                              duration: const Duration(milliseconds: 220),
                              curve: Curves.easeOutBack,
                              scale: (_active && _index == i) ? 1.2 : 1.0,
                              child: _DockGlyph(item: widget.items[i]),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _DockGlyph extends StatelessWidget {
  const _DockGlyph({required this.item});
  final _DockItem item;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: item.label,
      button: true,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: item.colors,
          ),
          boxShadow: [
            BoxShadow(
              color: item.colors.first.withValues(alpha: 0.40),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Icon(item.icon, size: 18, color: item.glyph),
      ),
    );
  }
}
