import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../core/atlas_tokens.dart';
import '../models/atlas_models.dart';
import 'globe_controller.dart';

/// Vector Earth Globe Painter.
/// Renders realistic spherical Earth with Natural Earth country boundaries,
/// continent land fills, country highlights, progressive labels, and city markers.
class GlobePainter extends CustomPainter {
  GlobePainter({
    required this.controller,
    required this.countries,
    required this.isVisited,
    this.isDark = true,
    required Listenable repaint,
  }) : super(repaint: repaint);

  final GlobeController controller;
  final List<AtlasCountry> countries;
  final bool Function(String cityId) isVisited;
  final bool isDark;

  // Reusable paints
  final Paint _fill = Paint()..isAntiAlias = true;
  final Paint _landFill = Paint()..isAntiAlias = true;
  final Paint _border = Paint()
    ..style = PaintingStyle.stroke
    ..isAntiAlias = true;
  final Paint _highlightFill = Paint()..isAntiAlias = true;
  final Paint _highlightBorder = Paint()
    ..style = PaintingStyle.stroke
    ..isAntiAlias = true;
  final Paint _glow = Paint();
  final Paint _ring = Paint()
    ..style = PaintingStyle.stroke
    ..isAntiAlias = true;

  double _shaderRadius = -1;
  Offset _shaderCenter = Offset.zero;
  ui.Shader? _glowShader;
  ui.Shader? _oceanShader;

  static const _d2r = math.pi / 180;

  @override
  void paint(Canvas canvas, Size size) {
    final c = controller;
    final r = c.radius;
    final o = c.center;
    if (r <= 0) return;

    // 1. Atmosphere and Ocean Shader Initialization
    if (r != _shaderRadius || o != _shaderCenter) {
      _shaderRadius = r;
      _shaderCenter = o;

      final glowColor = isDark
          ? AtlasColors.accent.withValues(alpha: 0.16)
          : const Color(0x18007AFF);

      _glowShader = ui.Gradient.radial(
        o,
        r * 1.22,
        [
          const Color(0x00000000),
          const Color(0x00000000),
          glowColor,
          const Color(0x00000000),
        ],
        const [0.0, 0.78, 0.83, 1.0],
      );

      final oceanLight = isDark
          ? const Color(0xFF24242A)
          : const Color(0xFFE9E9E7);
      final oceanDeep = isDark
          ? const Color(0xFF101013)
          : const Color(0xFFD4D4D0);

      _oceanShader = ui.Gradient.radial(
        o + Offset(-r * 0.35, -r * 0.4),
        r * 1.45,
        [oceanLight, oceanDeep],
      );
    }

    // 2. Outer Atmospheric Glow
    _glow.shader = _glowShader;
    canvas.drawCircle(o, r * 1.22, _glow);

    // 3. Ocean Spherical Body
    _fill.shader = _oceanShader;
    canvas.drawCircle(o, r, _fill);
    _fill.shader = null;

    // 4. Clip canvas to Sphere boundary for crisp silhouette
    canvas.save();
    final globeClip = Path()..addOval(Rect.fromCircle(center: o, radius: r));
    canvas.clipPath(globeClip);

    // Camera parameters
    final lat0 = c.lat * _d2r;
    final lng0 = c.lng * _d2r;
    final sl0 = math.sin(lat0);
    final cl0 = math.cos(lat0);
    final zoom = c.zoom;

    // Styling configuration
    _landFill.color = isDark
        ? const Color(0xFF2C2C35)
        : const Color(0xFFFFFFFF);
    _border.color = isDark
        ? Color.fromRGBO(
            255,
            255,
            255,
            (0.16 + 0.12 * (zoom - 1.0)).clamp(0.16, 0.45),
          )
        : Color.fromRGBO(
            0,
            0,
            0,
            (0.12 + 0.10 * (zoom - 1.0)).clamp(0.12, 0.35),
          );
    _border.strokeWidth = math.max(0.5, 0.75 * zoom);

    final selCountry = c.selectedCountry;
    _highlightFill.color = AtlasColors.accent.withValues(
      alpha: isDark ? 0.35 : 0.22,
    );
    _highlightBorder
      ..color = AtlasColors.accent
      ..strokeWidth = math.max(1.4, 1.8 * zoom);

    // 5. Render Country Landmasses & Boundaries
    for (final country in countries) {
      final isSel = selCountry != null && selCountry.iso == country.iso;

      for (final ring in country.rings) {
        final n = ring.length ~/ 2;
        if (n < 3) continue;

        // Fast bounding-box front-hemisphere check
        final midLat = country.lat * _d2r;
        final midLng = country.lng * _d2r - lng0;
        final cosCenter =
            sl0 * math.sin(midLat) + cl0 * math.cos(midLat) * math.cos(midLng);
        // If country center is deeply on back hemisphere and bbox doesn't span close to horizon, skip
        if (cosCenter < -0.45 && !isSel) {
          continue;
        }

        final path = Path();
        var started = false;
        var hasVisiblePoint = false;

        for (var i = 0; i < n; i++) {
          final lat = ring[i * 2] * _d2r;
          final dl = ring[i * 2 + 1] * _d2r - lng0;
          final cd = math.cos(dl);
          final cosc = sl0 * math.sin(lat) + cl0 * math.cos(lat) * cd;

          if (cosc > 0.02) {
            hasVisiblePoint = true;
            final x = o.dx + r * math.cos(lat) * math.sin(dl);
            final y =
                o.dy - r * (cl0 * math.sin(lat) - sl0 * math.cos(lat) * cd);
            if (!started) {
              path.moveTo(x, y);
              started = true;
            } else {
              path.lineTo(x, y);
            }
          } else {
            // Point is behind the horizon
            started = false;
          }
        }

        if (hasVisiblePoint) {
          if (isSel) {
            canvas.drawPath(path, _highlightFill);
            canvas.drawPath(path, _highlightBorder);
          } else {
            canvas.drawPath(path, _landFill);
            canvas.drawPath(path, _border);
          }
        }
      }
    }

    // 6. Progressive Country Labels (visible when zooming in >= 1.3)
    if (zoom >= 1.3) {
      final labelPaint = Paint()..isAntiAlias = true;
      for (final country in countries) {
        if (!country.hasCharts && zoom < 1.6 && country != selCountry) continue;
        final p = c.project(country.lat, country.lng);
        if (p == null) continue;
        if ((p - o).distance > r * 0.88) continue;

        final isSel = selCountry == country;
        final textSpan = TextSpan(
          text: country.name.toUpperCase(),
          style: TextStyle(
            fontSize: (isSel ? 10.5 : 9.0) * math.pow(zoom, 0.25),
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
            color: isSel
                ? AtlasColors.accent
                : (isDark ? const Color(0xB3FFFFFF) : const Color(0xB3000000)),
          ),
        );
        final tp = TextPainter(
          text: textSpan,
          textDirection: TextDirection.ltr,
          maxLines: 1,
        )..layout();

        // Subtle dark backdrop pill for label legibility
        final bgRect = Rect.fromCenter(
          center: p,
          width: tp.width + 8,
          height: tp.height + 4,
        );
        labelPaint.color = isDark
            ? const Color(0xCC121214)
            : const Color(0xE6FFFFFF);
        canvas.drawRRect(
          RRect.fromRectAndRadius(bgRect, const Radius.circular(4)),
          labelPaint,
        );

        tp.paint(canvas, Offset(p.dx - tp.width / 2, p.dy - tp.height / 2));
      }
    }

    canvas.restore(); // Restore clip

    // 7. Spherical Horizon Rim Stroke
    _ring
      ..strokeWidth = 1.0
      ..color = isDark ? const Color(0x22FFFFFF) : const Color(0x22000000);
    canvas.drawCircle(o, r, _ring);

    // 8. City Markers and Progressive Labels
    final zs = math.pow(zoom, 0.35).toDouble();
    final selCity = c.selectedCity;

    for (final city in c.cities) {
      final p = c.projectCity(city);
      if (p == null) continue;

      final isSel = selCity != null && selCity.id == city.id;
      final visited = isVisited(city.id);
      final base = (city.tier == 1 ? 4.8 : 3.5) * zs;

      // Pulsing Selection Halo
      if (isSel) {
        final t = (c.time % 1.6) / 1.6;
        final e = Curves.easeOut.transform(t);
        _ring
          ..strokeWidth = 1.6
          ..color = AtlasColors.accent.withValues(alpha: (1 - t) * 0.65);
        canvas.drawCircle(p, base + 4 + 20 * e, _ring);
      }

      // Visited subtle ring
      if (visited && !isSel) {
        _ring
          ..strokeWidth = 1.2
          ..color = AtlasColors.accent.withValues(alpha: 0.45);
        canvas.drawCircle(p, base + 2.5, _ring);
      }

      // Outer contrast ring
      _fill.color = isDark ? const Color(0xFF121214) : const Color(0xFFFFFFFF);
      canvas.drawCircle(p, base + 1.8, _fill);

      // Core Marker Dot
      _fill.color = (isSel || visited)
          ? AtlasColors.accent
          : (isDark ? const Color(0xFFFFFFFF) : const Color(0xFF1D1D20));
      canvas.drawCircle(p, isSel ? base + 1.0 : base, _fill);

      // Progressive City Labels (zoom >= 1.45 or selected)
      if (zoom >= 1.45 || isSel) {
        if (city.tier == 1 || zoom >= 1.7 || isSel) {
          final labelSpan = TextSpan(
            text: city.name,
            style: TextStyle(
              fontSize: 10.0 * zs,
              fontWeight: isSel ? FontWeight.w800 : FontWeight.w600,
              color: isSel
                  ? AtlasColors.accent
                  : (isDark
                        ? const Color(0xE6FFFFFF)
                        : const Color(0xE6000000)),
              shadows: [
                Shadow(
                  color: isDark
                      ? const Color(0xCC000000)
                      : const Color(0xCCFFFFFF),
                  blurRadius: 4,
                ),
              ],
            ),
          );
          final ltp = TextPainter(
            text: labelSpan,
            textDirection: TextDirection.ltr,
            maxLines: 1,
          )..layout();

          ltp.paint(canvas, Offset(p.dx + base + 5, p.dy - ltp.height / 2));
        }
      }
    }
  }

  @override
  bool shouldRepaint(GlobePainter old) =>
      old.controller != controller ||
      old.countries != countries ||
      old.isDark != isDark;
}
