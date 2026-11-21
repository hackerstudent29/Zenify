import 'package:flutter/services.dart';

/// One place for every haptic in Atlas, so intensity stays consistent.
class H {
  /// Any tap on a card, row, or button.
  static void tap() => HapticFeedback.lightImpact();

  /// Selection changes: marker selected, zoom limit hit, search result.
  static void select() => HapticFeedback.selectionClick();

  /// Primary actions: play mix, open sheet.
  static void confirm() => HapticFeedback.mediumImpact();

  /// Reward: a new Passport stamp.
  static void success() => HapticFeedback.heavyImpact();

  /// Nothing to play / failure.
  static void error() => HapticFeedback.vibrate();
}
