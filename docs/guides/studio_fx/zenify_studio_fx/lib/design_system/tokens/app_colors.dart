import 'package:flutter/material.dart';

/// Semantic color tokens — Apple-style graphite surfaces with a rose accent.
/// Every original member name is kept, so existing screens keep compiling.
class AppColors {
  // Surfaces (graphite)
  static const bg = Color(0xFF0A0A0C);
  static const canvas = bg;
  static const surface = Color(0xFF1C1C1F);
  static const surface2 = Color(0xFF2A2A2E);
  static const surfaceHigh = surface2;

  // Rose accent
  static const accent = Color(0xFFFF375F); // Rose
  static const accentSoft = Color(0xFFFF7A93); // Soft rose (highlights, icons)
  static const accentMaroon = Color(0xFF9F1239); // Deep rose (gradients)
  static const brandMaroon = accentMaroon;

  // Labels
  static const textPrimary = Color(0xFFF5F5F7);
  static const textSecondary = Color(0x99FFFFFF); // white 60%
  static const textTertiary = Color(0x66FFFFFF); // white 40%

  // Lines & glass
  static const hairline = Color(0x14FFFFFF); // white 8%
  static const cardBorder = Color(0x1FFFFFFF); // white 12%
  static const glassTint = Color(0xB31C1C1F); // surface at 70%
  static const glassHighlight = Color(0x17FFFFFF); // white 9%

  // Status
  static const danger = Color(0xFFFF453A);
}