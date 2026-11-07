import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

/// Semantic typography hierarchy (Inter tuned to SF-style tracking).
/// Every original member name is kept.
class AppTypography {
  static TextStyle largeTitle = GoogleFonts.inter(
    fontSize: 34,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.8,
    height: 1.1,
    color: AppColors.textPrimary,
  );

  static TextStyle title1 = GoogleFonts.inter(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    height: 1.15,
    color: AppColors.textPrimary,
  );

  static TextStyle title2 = GoogleFonts.inter(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.5,
    color: AppColors.textPrimary,
  );

  static TextStyle title3 = GoogleFonts.inter(
    fontSize: 20,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.4,
    color: AppColors.textPrimary,
  );

  static TextStyle headline = GoogleFonts.inter(
    fontSize: 17,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  );

  static TextStyle body = GoogleFonts.inter(
    fontSize: 17,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.3,
    color: AppColors.textPrimary,
  );

  static TextStyle subhead = GoogleFonts.inter(
    fontSize: 15,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.2,
    color: AppColors.textSecondary,
  );

  static TextStyle footnote = GoogleFonts.inter(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.1,
    color: AppColors.textTertiary,
  );

  static TextStyle caption = GoogleFonts.inter(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.1,
    color: AppColors.textTertiary,
  );

  static TextStyle timer = GoogleFonts.inter(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    fontFeatures: const [FontFeature.tabularFigures()],
    color: AppColors.textSecondary,
  );

  static TextStyle lyricsActive = GoogleFonts.inter(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    color: AppColors.textPrimary,
  );

  static TextStyle lyricsInactive = GoogleFonts.inter(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.6,
    color: AppColors.textTertiary,
  );
}