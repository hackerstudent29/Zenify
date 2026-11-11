// lib/design_system/zen.dart
//
// Shared Apple-style design system for Zenify:
//   • Rose + graphite palette and SF-like type scale
//   • Real spring physics curves (underdamped harmonic oscillator)
//   • GlassPanel (frosted glassmorphism), skeleton loader, staggered entrances
//   • Haptics, theme and bouncy scroll behaviour

import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter, PointerDeviceKind;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'motion/zen_page_route.dart';
import 'tokens/app_colors.dart';
export 'widgets/marquee_text.dart';
export 'motion/zen_page_route.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Spring curve
// ─────────────────────────────────────────────────────────────────────────────

/// A physically based spring. Plug it into any implicit animation
/// (`AnimatedScale`, `AnimatedPositioned`, `AnimatedSlide`, …) for the
/// overshoot-and-settle feel of iOS animations.
class SpringCurve extends Curve {
  const SpringCurve({
    this.damping = 16,
    this.stiffness = 190,
    this.mass = 1,
    this.settleSeconds = 1.1,
  });

  final double damping;
  final double stiffness;
  final double mass;

  /// Physical time that maps onto the animation's 0 → 1 range.
  final double settleSeconds;

  @override
  double transformInternal(double t) {
    final w0 = math.sqrt(stiffness / mass);
    final zeta = damping / (2 * math.sqrt(stiffness * mass));
    final time = t * settleSeconds;

    if (zeta < 1) {
      final wd = w0 * math.sqrt(1 - zeta * zeta);
      return 1 -
          math.exp(-zeta * w0 * time) *
              (math.cos(wd * time) + (zeta * w0 / wd) * math.sin(wd * time));
    }
    return 1 - math.exp(-w0 * time) * (1 + w0 * time);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

abstract final class Zen {
  // Surfaces (graphite)
  static const bg = AppColors.bg;
  static const bgElevated = Color(0xFF131316);
  static const surface = AppColors.surface;
  static const surfaceHigh = AppColors.surface2;
  static const hairline = AppColors.cardBorder;

  // Labels
  static const label = AppColors.textPrimary;
  static const labelSecondary = AppColors.textSecondary;
  static const labelTertiary = AppColors.textTertiary;
  static const textMuted = AppColors.textSecondary;

  // Rose accent
  static const rose = AppColors.accent;
  static const roseSoft = AppColors.accentSoft;
  static const roseDeep = AppColors.accentMaroon;

  // Radii
  static const double radiusS = 10;
  static const double radiusM = 14;
  static const double radiusL = 20;

  // Springs
  /// Default: friendly, tiny overshoot.
  static const Curve spring = SpringCurve();

  /// Quick and tight — toggles, indicators, nav bar.
  static const Curve springSnappy = SpringCurve(damping: 18, stiffness: 260);

  /// Playful bounce — icon pops.
  static const Curve springBouncy = SpringCurve(damping: 11, stiffness: 190);

  /// Almost no overshoot — layout changes, entrances.
  static const Curve springSmooth = SpringCurve(damping: 26, stiffness: 190);

  // Type scale
  static const largeTitle = TextStyle(
      fontSize: 34,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.8,
      height: 1.1,
      color: label);
  static const title3 = TextStyle(
      fontSize: 20,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.3,
      color: label);
  static const headline = TextStyle(
      fontSize: 17,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.2,
      color: label);
  static const body = TextStyle(
      fontSize: 17,
      fontWeight: FontWeight.w400,
      letterSpacing: -0.2,
      color: label);
  static const subhead = TextStyle(
      fontSize: 15,
      fontWeight: FontWeight.w400,
      letterSpacing: -0.1,
      color: labelSecondary);
  static const footnote = TextStyle(
      fontSize: 13, fontWeight: FontWeight.w500, color: labelSecondary);

  // Browse-card gradients (rose, graphite and a few muted companions)
  static const List<List<Color>> categoryGradients = [
    [Color(0xFFFF4D6D), Color(0xFF9F1239)],
    [Color(0xFF6E6E73), Color(0xFF2C2C2E)],
    [Color(0xFFA855F7), Color(0xFF5B21B6)],
    [Color(0xFF5E7CE2), Color(0xFF2B3A8C)],
    [Color(0xFFF4A3B5), Color(0xFFC2506B)],
    [Color(0xFF5FB49C), Color(0xFF1F6F5C)],
    [Color(0xFFFFB86B), Color(0xFFD9622B)],
    [Color(0xFF8E8E93), Color(0xFF48484A)],
  ];
}

abstract final class ZenHaptics {
  static void tap() => HapticFeedback.selectionClick();
  static void light() => HapticFeedback.lightImpact();
  static void medium() => HapticFeedback.mediumImpact();
}

// ─────────────────────────────────────────────────────────────────────────────
// Glass
// ─────────────────────────────────────────────────────────────────────────────

/// Frosted glass: blur + translucent tint + a faint diagonal highlight and a
/// hairline border, like iOS materials.
class GlassPanel extends StatelessWidget {
  const GlassPanel({
    super.key,
    required this.child,
    this.borderRadius = BorderRadius.zero,
    this.blur = 28,
    this.tint,
    this.border,
    this.highlight = true,
  });

  final Widget child;
  final BorderRadius borderRadius;
  final double blur;
  final Color? tint;
  final BoxBorder? border;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final isSquare = borderRadius == BorderRadius.zero;
    return ClipRRect(
      borderRadius: borderRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: tint ?? const Color(0x99161619),
            gradient: highlight
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withValues(alpha: 0.09),
                      Colors.white.withValues(alpha: 0.02),
                    ],
                  )
                : null,
            borderRadius: isSquare ? null : borderRadius,
            border: border ?? Border.all(color: Zen.hairline, width: 0.5),
          ),
          child: child,
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Motion helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Fades and springs a child up into place. Use [index] for a staggered
/// cascade; set [enabled] to false to skip the effect (e.g. far down a list).
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({
    super.key,
    required this.child,
    this.index = 0,
    this.dy = 0.18,
    this.stagger = const Duration(milliseconds: 45),
    this.enabled = true,
  });

  final Widget child;
  final int index;
  final double dy;
  final Duration stagger;
  final bool enabled;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn> {
  bool _visible = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (!widget.enabled) {
      _visible = true;
      return;
    }
    final steps = widget.index.clamp(0, 10);
    _timer = Timer(widget.stagger * steps, () {
      if (mounted) setState(() => _visible = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) return widget.child;
    return AnimatedOpacity(
      opacity: _visible ? 1 : 0,
      duration: const Duration(milliseconds: 380),
      curve: Curves.easeOut,
      child: AnimatedSlide(
        offset: _visible ? Offset.zero : Offset(0, widget.dy),
        duration: const Duration(milliseconds: 700),
        curve: Zen.springSmooth,
        child: widget.child,
      ),
    );
  }
}

/// Pulsing placeholder rows shown while results load.
class SkeletonList extends StatefulWidget {
  const SkeletonList({super.key, this.count = 7});
  final int count;

  @override
  State<SkeletonList> createState() => _SkeletonListState();
}

class _SkeletonListState extends State<SkeletonList>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Widget _bar(double factor, double height) => Align(
        alignment: Alignment.centerLeft,
        child: FractionallySizedBox(
          widthFactor: factor,
          child: Container(
            height: height,
            decoration: BoxDecoration(
              color: Zen.surface,
              borderRadius: BorderRadius.circular(height / 2),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        child: Column(
          children: List.generate(
            widget.count,
            (i) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: Zen.surface,
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      children: [
                        _bar(0.6, 12),
                        const SizedBox(height: 8),
                        _bar(0.35, 10),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scroll behaviour + theme
// ─────────────────────────────────────────────────────────────────────────────

/// iOS-style rubber-banding everywhere, no Android glow, and mouse/trackpad
/// dragging (handy for web / DevicePreview).
class ZenScrollBehavior extends MaterialScrollBehavior {
  const ZenScrollBehavior();

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) =>
      const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics());

  @override
  Widget buildOverscrollIndicator(
          BuildContext context, Widget child, ScrollableDetails details) =>
      child;

  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.stylus,
        PointerDeviceKind.trackpad,
      };
}

ThemeData zenDarkTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Zen.rose,
    brightness: Brightness.dark,
  ).copyWith(
    primary: Zen.rose,
    secondary: Zen.roseSoft,
    surface: Zen.surface,
    onSurface: Zen.label,
  );

  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: Zen.bg,
    canvasColor: Zen.bg,
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
    hoverColor: Colors.transparent,
    dividerColor: Zen.hairline,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: ZenPageTransitionsBuilder(),
        TargetPlatform.iOS: ZenPageTransitionsBuilder(),
        TargetPlatform.macOS: ZenPageTransitionsBuilder(),
        TargetPlatform.windows: ZenPageTransitionsBuilder(),
        TargetPlatform.linux: ZenPageTransitionsBuilder(),
      },
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: Zen.rose,
      selectionColor: Zen.rose.withValues(alpha: 0.3),
      selectionHandleColor: Zen.rose,
    ),
  );

  return base.copyWith(
    textTheme: base.textTheme.apply(
      fontFamily: 'SF Pro',
      bodyColor: Zen.label,
      displayColor: Zen.label,
    ),
  );
}

