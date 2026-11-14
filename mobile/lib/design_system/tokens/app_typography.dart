import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Apple Music SF Pro Typography Hierarchy.
/// Uses native San Francisco Pro Text and Display families bundled in the app,
/// with platform-aware resolution and comprehensive Indic/Asian/Arabic fallbacks.
class AppTypography {
  static const String fontPro = 'SF Pro';
  static const String fontDisplay = 'SF Pro Display';

  static final bool isApple = defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  static String get effectiveFontPro => isApple ? '.SF Pro Text' : fontPro;
  static String get effectiveFontDisplay => isApple ? '.SF Pro Display' : fontDisplay;

  /// Universal fallback fonts for Indic, Asian, Arabic, Hebrew and Emoji scripts
  /// to ensure consistent rendering across Android and iOS devices.
  static const List<String> fontFamilyFallback = [
    'Noto Sans Tamil',
    'Noto Sans Devanagari',
    'Noto Sans Telugu',
    'Noto Sans Malayalam',
    'Noto Sans Kannada',
    'Noto Sans Bengali',
    'Noto Sans Gurmukhi',
    'Noto Sans Gujarati',
    'Noto Sans Oriya',
    'Noto Sans Hebrew',
    'Noto Sans Arabic',
    'Noto Sans JP',
    'Noto Sans KR',
    'Nirmala UI',
    'Tamil Sangam MN',
    'Kohinoor Devanagari',
    'Kohinoor Telugu',
    'Kohinoor Bangla',
    'Apple Color Emoji',
    'Noto Color Emoji',
    'Roboto',
    'sans-serif',
  ];

  static const TextStyle largeTitle = TextStyle(
    fontFamily: fontDisplay,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 34,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.8,
    height: 1.1,
    color: AppColors.textPrimary,
  );

  static const TextStyle title1 = TextStyle(
    fontFamily: fontDisplay,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    height: 1.15,
    color: AppColors.textPrimary,
  );

  static const TextStyle title2 = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 22,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  );

  static const TextStyle title3 = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 20,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  );

  static const TextStyle headline = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 17,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  );

  static const TextStyle body = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 16,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.2,
    color: AppColors.textPrimary,
  );

  static const TextStyle subhead = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 15,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.2,
    color: AppColors.textSecondary,
  );

  static const TextStyle footnote = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.1,
    color: AppColors.textTertiary,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 11,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.1,
    color: AppColors.textTertiary,
  );

  static const TextStyle timer = TextStyle(
    fontFamily: fontPro,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 12,
    fontWeight: FontWeight.w500,
    fontFeatures: [FontFeature.tabularFigures()],
    color: AppColors.textSecondary,
  );

  static const TextStyle lyricsActive = TextStyle(
    fontFamily: fontDisplay,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    color: AppColors.textPrimary,
  );

  static const TextStyle lyricsInactive = TextStyle(
    fontFamily: fontDisplay,
    fontFamilyFallback: fontFamilyFallback,
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    color: AppColors.textTertiary,
  );
}
