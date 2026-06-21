import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static const Color background = Color(0xFF0A0A0B);
  static const Color surface = Color(0xFF121214);
  static const Color elevated = Color(0xFF1B1D24);
  static const Color brand = Color(0xFFE11D48); // Rose-600
  static const Color textPrimary = Color(0xFFF2F2F3);
  static const Color textSecondary = Color(0xFFA3A4AB);
  static const Color textMuted = Color(0xFF64666F);
  static const Color border = Color(0x0FFFFFFF); // white with 6% opacity

  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      primaryColor: brand,
      colorScheme: const ColorScheme.dark(
        primary: brand,
        background: background,
        surface: surface,
        secondary: elevated,
      ),
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme).copyWith(
        displayLarge: GoogleFonts.inter(color: textPrimary, fontWeight: FontWeight.bold),
        titleLarge: const TextStyle(fontFamily: 'Orange Avenue', color: textPrimary, fontWeight: FontWeight.bold),
        bodyLarge: GoogleFonts.inter(color: textPrimary),
        bodyMedium: GoogleFonts.inter(color: textSecondary),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: background,
        selectedItemColor: brand,
        unselectedItemColor: textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      useMaterial3: true,
    );
  }
}
