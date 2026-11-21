import 'package:flutter/painting.dart';

/// Apple Music dark palette aligned with Zenify design tokens (#121214 bg, #E11D48 radiant crimson accent).
class AtlasColors {
  static const bg = Color(0xFF121214);
  static const surface = Color(0xFF18181B);
  static const surfaceHigh = Color(0xFF27272A);
  static const accent = Color(0xFFE11D48);
  static const hairline = Color(0x1FFFFFFF);
  static const fill = Color(0x3D767680);
  static const textPrimary = Color(0xFFFFFFFF);
  static const textSecondary = Color(0x99EBEBF5);
  static const textTertiary = Color(0x4DEBEBF5);
  static const glassBg = surfaceHigh;
  static const glassBorder = Color(0x00000000);
  static const divider = Color(0x33545458);
}

/// iOS text scale, system font (SF on iOS, Roboto fallback elsewhere).
class AtlasText {
  static const _tab = [FontFeature.tabularFigures()];

  static const largeTitle = TextStyle(
    fontSize: 34,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.4,
    height: 1.1,
    color: AtlasColors.textPrimary,
  );
  static const display = largeTitle;
  static const title2 = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.3,
    color: AtlasColors.textPrimary,
  );
  static const title3 = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.3,
    color: AtlasColors.textPrimary,
  );
  static const headline = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.4,
    color: AtlasColors.textPrimary,
  );
  static const body = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.4,
    color: AtlasColors.textPrimary,
  );
  static const sub = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.2,
    color: AtlasColors.textSecondary,
  );
  static const footnote = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.1,
    color: AtlasColors.textSecondary,
  );
  static const caption = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: AtlasColors.textSecondary,
  );
  static const number = TextStyle(
    fontSize: 34,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.4,
    fontFeatures: _tab,
    color: AtlasColors.textPrimary,
  );
}
