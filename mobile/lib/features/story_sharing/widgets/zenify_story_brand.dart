import 'package:flutter/material.dart';

/// Clean, subtle Zenify branding badge for Story and poster cards.
/// Uses the transparent Zenify brand asset and SF Pro Display wordmark.
class ZenifyStoryBrand extends StatelessWidget {
  const ZenifyStoryBrand({
    super.key,
    this.color,
    this.isLight = false,
    this.iconSize = 15,
    this.showWordmark = true,
  });

  /// Explicit tint color for the brand mark and text.
  final Color? color;

  /// If true, adapts for a light-background card (e.g. Classic Song Poster).
  final bool isLight;

  final double iconSize;
  final bool showWordmark;

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color ??
        (isLight
            ? const Color(0xFF121214).withValues(alpha: 0.85)
            : Colors.white.withValues(alpha: 0.90));

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Transparent brand symbol
        Image.asset(
          'assets/images/z_logo.png',
          width: iconSize,
          height: iconSize,
          fit: BoxFit.contain,
          errorBuilder: (_, _, _) => Icon(
            Icons.graphic_eq_rounded,
            size: iconSize,
            color: const Color(0xFFE11D48),
          ),
        ),
        if (showWordmark) ...[
          const SizedBox(width: 6),
          Text(
            'Zenify',
            style: TextStyle(
              fontFamily: 'SF Pro Display',
              fontSize: iconSize * 0.88,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
              color: effectiveColor,
            ),
          ),
        ],
      ],
    );
  }
}

