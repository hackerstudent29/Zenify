import 'package:flutter/material.dart';

/// Spacing, radius and squircle helpers.
class AppSpacing {
  static const double s4 = 4.0;
  static const double s8 = 8.0;
  static const double s12 = 12.0;
  static const double s16 = 16.0;
  static const double s20 = 20.0;
  static const double s24 = 24.0;
  static const double s32 = 32.0;

  static const double screenPadding = 16.0;
  static const double homePadding = 20.0;

  // Radii
  static const double rTile = 12.0;
  static const double rCard = 22.0;
  static const double rSheet = 28.0;
  static const double rArtList = 10.0;
  static const double rArtGrid = 22.0;
  static const double rArtPlayer = 28.0;
  static const double rControl = 14.0; // search field, buttons
  static const double rPill = 32.0; // floating tab bar, chips

  /// Squircle border radius shape helper (~2x design value for ContinuousRectangleBorder)
  static ShapeBorder squircle(double radius, {BorderSide side = BorderSide.none}) {
    return ContinuousRectangleBorder(
      borderRadius: BorderRadius.circular(radius * 2.0),
      side: side,
    );
  }

  static BorderRadius squircleRadius(double radius) {
    return BorderRadius.circular(radius * 1.5);
  }
}