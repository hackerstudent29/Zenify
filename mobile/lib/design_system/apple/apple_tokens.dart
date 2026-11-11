import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';

/// Zenify "Apple-kit" tokens. Inspired by Apple HIG / Apple Music, not a copy.
/// Android has no SF Pro. Bundle `Inter` (or similar) and set fontFamily in
/// [AT.font] if you want a closer feel. Null = system default (Roboto).
abstract final class AT {
  static const String? font = null;

  // ── Color ──────────────────────────────────────────────────────────
  static const Color bg = Color(0xFF000000);
  static const Color surface = Color(0xFF1C1C1E);
  static const Color surfaceHi = Color(0xFF2C2C2E);
  static const Color fill = Color(0x1FFFFFFF); // grouped-row fill
  static const Color fillStrong = Color(0x2EFFFFFF);
  static const Color hairline = Color(0x1FFFFFFF);
  static const Color label = Color(0xFFFFFFFF);
  static const Color label2 = Color(0x99EBEBF5);
  static const Color label3 = Color(0x4DEBEBF5);
  static const Color accent = Color(0xFFFA586A);
  static const Color green = Color(0xFF30D158);
  static const Color amber = Color(0xFFFFD60A);
  static const Color red = Color(0xFFFF453A);
  static const Color blue = Color(0xFF0A84FF);

  // ── Radius ─────────────────────────────────────────────────────────
  static const double rSm = 10;
  static const double rMd = 14;
  static const double rLg = 20;
  static const double rXl = 28;
  static const double rPill = 999;

  // ── Spacing (4pt grid) ─────────────────────────────────────────────
  static const double s4 = 4;
  static const double s8 = 8;
  static const double s12 = 12;
  static const double s16 = 16;
  static const double s20 = 20;
  static const double s24 = 24;
  static const double s32 = 32;

  // ── Type ───────────────────────────────────────────────────────────
  static const TextStyle largeTitle = TextStyle(fontFamily: font, fontSize: 34, fontWeight: FontWeight.w700, letterSpacing: -0.9, height: 1.1, color: label);
  static const TextStyle title1 = TextStyle(fontFamily: font, fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -0.6, color: label);
  static const TextStyle title2 = TextStyle(fontFamily: font, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4, color: label);
  static const TextStyle title3 = TextStyle(fontFamily: font, fontSize: 20, fontWeight: FontWeight.w600, letterSpacing: -0.3, color: label);
  static const TextStyle headline = TextStyle(fontFamily: font, fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: -0.4, color: label);
  static const TextStyle body = TextStyle(fontFamily: font, fontSize: 17, fontWeight: FontWeight.w400, letterSpacing: -0.4, color: label);
  static const TextStyle callout = TextStyle(fontFamily: font, fontSize: 16, fontWeight: FontWeight.w400, letterSpacing: -0.3, color: label);
  static const TextStyle subhead = TextStyle(fontFamily: font, fontSize: 15, fontWeight: FontWeight.w400, letterSpacing: -0.2, color: label2);
  static const TextStyle footnote = TextStyle(fontFamily: font, fontSize: 13, fontWeight: FontWeight.w400, letterSpacing: -0.1, color: label2);
  static const TextStyle caption = TextStyle(fontFamily: font, fontSize: 12, fontWeight: FontWeight.w400, color: label2);
  static const TextStyle micro = TextStyle(fontFamily: font, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.3, color: label2);

  // ── Springs ────────────────────────────────────────────────────────
  static const SpringDescription snappy = SpringDescription(mass: 1, stiffness: 520, damping: 36);
  static const SpringDescription smooth = SpringDescription(mass: 1, stiffness: 260, damping: 28);
  static const SpringDescription bouncy = SpringDescription(mass: 1, stiffness: 320, damping: 17);
}

/// Spring as a [Curve]. Use with implicit animations and short durations (~400-500ms).
class SpringCurve extends Curve {
  SpringCurve({double stiffness = 420, double damping = 30})
      : _sim = SpringSimulation(SpringDescription(mass: 1, stiffness: stiffness, damping: damping), 0, 1, 0);
  final SpringSimulation _sim;
  static const double _span = 0.7; // seconds of simulation mapped to t:0..1

  @override
  double transformInternal(double t) => _sim.x(t * _span);
}
