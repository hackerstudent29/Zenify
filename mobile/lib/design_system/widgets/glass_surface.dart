import 'dart:ui';
import 'package:flutter/material.dart';
import '../tokens/app_colors.dart';

/// Apple Music style Frosted Glass Surface specified in 02-DESIGN-SYSTEM.md.
/// Strictly limited to tab bar, mini player, nav bars, sheets, and toasts.
class GlassSurface extends StatelessWidget {
  const GlassSurface({
    super.key,
    required this.child,
    this.blur = 25.0,
    this.tintColor = AppColors.glassTint,
    this.borderRadius = BorderRadius.zero,
    this.border,
    this.fallback = false,
  });

  final Widget child;
  final double blur;
  final Color tintColor;
  final BorderRadius borderRadius;
  final BoxBorder? border;
  final bool fallback;

  @override
  Widget build(BuildContext context) {
    if (fallback) {
      return Container(
        decoration: BoxDecoration(
          color: const Color(0xEB1C1C1E), // 92% solid neutral fallback
          borderRadius: borderRadius,
          border: border ?? Border.all(color: AppColors.hairline, width: 0.5),
        ),
        child: child,
      );
    }

    return RepaintBoundary(
      child: ClipRRect(
        borderRadius: borderRadius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
          child: Container(
            decoration: BoxDecoration(
              color: tintColor,
              borderRadius: borderRadius,
              border: border ?? Border.all(color: AppColors.hairline, width: 0.5),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

