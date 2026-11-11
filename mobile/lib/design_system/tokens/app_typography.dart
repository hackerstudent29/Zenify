import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Apple Music SF Pro Typography Hierarchy.
/// Uses native San Francisco Pro Text and Display families bundled in the app.
class AppTypography {
  static const String fontPro = 'SF Pro';
  static const String fontDisplay = 'SF Pro Display';

  static const TextStyle largeTitle = TextStyle(
    fontFamily: fontDisplay,
    fontSize: 34,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.8,
    height: 1.1,
    color: AppColors.textPrimary,
  );

  static const TextStyle title1 = TextStyle(
    fontFamily: fontDisplay,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    height: 1.15,
    color: AppColors.textPrimary,
  );

  static const TextStyle title2 = TextStyle(
    fontFamily: fontPro,
    fontSize: 22,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  );

  static const TextStyle title3 = TextStyle(
    fontFamily: fontPro,
    fontSize: 20,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  );

  static const TextStyle headline = TextStyle(
    fontFamily: fontPro,
    fontSize: 17,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  );

  static const TextStyle body = TextStyle(
    fontFamily: fontPro,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontFamily: fontPro,
    fontSize: 16,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.2,
    color: AppColors.textPrimary,
  );

  static const TextStyle subhead = TextStyle(
    fontFamily: fontPro,
    fontSize: 15,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.2,
    color: AppColors.textSecondary,
  );

  static const TextStyle footnote = TextStyle(
    fontFamily: fontPro,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.1,
    color: AppColors.textTertiary,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: fontPro,
    fontSize: 11,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.1,
    color: AppColors.textTertiary,
  );

  static const TextStyle timer = TextStyle(
    fontFamily: fontPro,
    fontSize: 12,
    fontWeight: FontWeight.w500,
    fontFeatures: [FontFeature.tabularFigures()],
    color: AppColors.textSecondary,
  );

  static const TextStyle lyricsActive = TextStyle(
    fontFamily: fontDisplay,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    color: AppColors.textPrimary,
  );

  static const TextStyle lyricsInactive = TextStyle(
    fontFamily: fontDisplay,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    color: AppColors.textTertiary,
  );
}
