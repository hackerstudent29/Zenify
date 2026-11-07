import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Apple Music Signature Tokens
  static const Color canvas = Color(0xFF121214);
  static const Color surface = Color(0xFF1C1C1E);
  static const Color cardSurface = Color(0xFF2C2C2E);
  static const Color brand = Color(0xFFE11D48); // Radiant Crimson
  static const Color brandMaroon = Color(0xFF9E2339); // Academic Maroon
  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0x99FFFFFF); // 60% opacity
  static const Color textMuted = Color(0x66FFFFFF); // 40% opacity
  static const Color border = Color(0x14FFFFFF); // 8% stroke
  static const Color cardBorder = Color(0x1FFFFFFF); // 12% stroke

  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: canvas,
      canvasColor: canvas,
      cardColor: cardSurface,
      primaryColor: brand,
      colorScheme: const ColorScheme.dark(
        primary: brand,
        surface: surface,
        onSurface: textPrimary,
      ),
      textTheme: GoogleFonts.interTextTheme(
        ThemeData.dark().textTheme,
      ).copyWith(
        headlineLarge: GoogleFonts.inter(
          fontSize: 28,
          fontWeight: FontWeight.w800,
          color: textPrimary,
          letterSpacing: -0.5,
        ),
        headlineMedium: GoogleFonts.inter(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: textPrimary,
          letterSpacing: -0.3,
        ),
        titleLarge: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: textPrimary,
        ),
        titleMedium: GoogleFonts.inter(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: textPrimary,
        ),
        bodyLarge: GoogleFonts.inter(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: textPrimary,
        ),
        bodyMedium: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: textSecondary,
        ),
        labelSmall: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: textMuted,
          letterSpacing: 0.5,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: brand,
        unselectedItemColor: textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      dividerTheme: const DividerThemeData(
        color: border,
        thickness: 0.5,
        space: 1,
      ),
    );
  }
}

