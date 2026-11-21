import 'dart:ui';

import 'package:flutter/cupertino.dart';

import '../core/atlas_tokens.dart';
import 'atlas_press.dart';

/// Surface. Flat by default (no blur) so it stays cheap over animated content.
/// Pass [blur] > 0 only over static backgrounds.
class Glass extends StatelessWidget {
  const Glass({
    super.key,
    required this.child,
    this.radius = 18,
    this.blur = 0,
    this.tint = const Color(0xF22C2C2E),
  });

  final Widget child;
  final double radius;
  final double blur;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(radius);
    final box = DecoratedBox(
      decoration: BoxDecoration(color: tint, borderRadius: r),
      child: child,
    );
    if (blur <= 0) return box;
    return ClipRRect(
      borderRadius: r,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: box,
      ),
    );
  }
}

/// Circular toolbar button: grey fill, red glyph (Apple Music style).
class GlassIconButton extends StatelessWidget {
  const GlassIconButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.size = 34,
    this.color = AtlasColors.accent,
  });

  final IconData icon;
  final VoidCallback onTap;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AtlasPress(
      onTap: onTap,
      scale: 0.88,
      child: Container(
        width: size,
        height: size,
        decoration: const BoxDecoration(
          color: AtlasColors.surfaceHigh,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: size * 0.5, color: color),
      ),
    );
  }
}
