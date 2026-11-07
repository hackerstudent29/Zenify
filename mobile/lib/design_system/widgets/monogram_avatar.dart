import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Apple Music style neutral monogram tile for missing artist avatars and album covers.
/// Generates a deterministic, aesthetically restrained gradient based on the entity's name.
class MonogramAvatar extends StatelessWidget {
  const MonogramAvatar({
    super.key,
    required this.name,
    this.size = 48.0,
    this.isCircle = true,
    this.fontSize,
  });

  final String name;
  final double size;
  final bool isCircle;
  final double? fontSize;

  static const List<List<Color>> _palettes = [
    [Color(0xFF2A2A2E), Color(0xFF1E1E22)],
    [Color(0xFF332024), Color(0xFF1F1417)],
    [Color(0xFF1F2430), Color(0xFF141720)],
    [Color(0xFF242C24), Color(0xFF161B16)],
    [Color(0xFF2E2430), Color(0xFF1C161E)],
    [Color(0xFF2F2920), Color(0xFF1E1A14)],
  ];

  @override
  Widget build(BuildContext context) {
    final clean = name.trim().replaceAll(RegExp(r'^[^\w]+'), '');
    final initial = clean.isNotEmpty ? clean[0].toUpperCase() : 'Z';
    final hash = name.codeUnits.fold(0, (a, b) => (a * 31 + b)) & 0x7FFFFFFF;
    final palette = _palettes[hash % _palettes.length];
    final calculatedFontSize = fontSize ?? (size * 0.42).clamp(10.0, 56.0);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: isCircle ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: isCircle ? null : BorderRadius.circular(math.max(4.0, size * 0.18)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: palette,
        ),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.10),
          width: 0.5,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.88),
          fontSize: calculatedFontSize,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
      ),
    );
  }
}

