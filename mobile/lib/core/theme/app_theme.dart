import 'package:flutter/material.dart';

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
      fontFamily: 'SF Pro',
      scaffoldBackgroundColor: canvas,
      canvasColor: canvas,
      cardColor: cardSurface,
      primaryColor: brand,
      colorScheme: const ColorScheme.dark(
        primary: brand,
        surface: surface,
        onSurface: textPrimary,
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontFamily: 'SF Pro Display',
          fontSize: 28,
          fontWeight: FontWeight.w700,
          color: textPrimary,
          letterSpacing: -0.5,
        ),
        headlineMedium: TextStyle(
          fontFamily: 'SF Pro Display',
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: textPrimary,
          letterSpacing: -0.3,
        ),
        titleLarge: TextStyle(
          fontFamily: 'SF Pro',
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: textPrimary,
          letterSpacing: -0.2,
        ),
        titleMedium: TextStyle(
          fontFamily: 'SF Pro',
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: textPrimary,
          letterSpacing: -0.15,
        ),
        bodyLarge: TextStyle(
          fontFamily: 'SF Pro',
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: textPrimary,
          letterSpacing: -0.2,
        ),
        bodyMedium: TextStyle(
          fontFamily: 'SF Pro',
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: textSecondary,
          letterSpacing: -0.1,
        ),
        labelSmall: TextStyle(
          fontFamily: 'SF Pro',
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: textMuted,
          letterSpacing: 0.3,
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
