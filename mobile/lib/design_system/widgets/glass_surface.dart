import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../services/glass_engine.dart';
import '../../services/settings_service.dart';

/// Renders every glass surface in the app (dock, mini player, island, buttons).
class GlassSurface extends StatefulWidget {
  const GlassSurface({
    super.key,
    required this.child,
    this.borderRadius = const BorderRadius.all(Radius.circular(20)),
    this.padding,
    this.config,
    this.tintColor,
  });

  final Widget child;
  final BorderRadius borderRadius;
  final EdgeInsetsGeometry? padding;

  /// Overrides the global look (used for preset previews).
  final GlassConfig? config;

  /// Optional tint override for specific components (e.g. mini player).
  final Color? tintColor;

  @override
  State<GlassSurface> createState() => _GlassSurfaceState();
}

class _GlassSurfaceState extends State<GlassSurface> {
  final _engine = GlassEngine.instance;
  final _settings = SettingsState.instance;
  bool _retained = false;

  GlassConfig get _cfg {
    final base = widget.config ?? _engine.config;
    return _settings.glassEffects
        ? base
        : base.copyWith(fluidity: 0, motion: GlassMotion.still, prism: 0);
  }

  @override
  void initState() {
    super.initState();
    _engine.ensureLoaded();
    _engine.addListener(_onChange);
    _settings.addListener(_onChange);
    _syncMotion();
  }

  @override
  void didUpdateWidget(GlassSurface old) {
    super.didUpdateWidget(old);
    _syncMotion();
  }

  @override
  void dispose() {
    _engine.removeListener(_onChange);
    _settings.removeListener(_onChange);
    if (_retained) _engine.releaseMotion();
    super.dispose();
  }

  void _onChange() {
    if (!mounted) return;
    _syncMotion();
    setState(() {});
  }

  void _syncMotion() {
    final need = _cfg.motion != GlassMotion.still;
    if (need && !_retained) {
      _retained = true;
      _engine.retainMotion();
    } else if (!need && _retained) {
      _retained = false;
      _engine.releaseMotion();
    }
  }

  @override
  Widget build(BuildContext context) {
    final cfg = _cfg;
    final br = widget.borderRadius;
    final solid = cfg.fluidity < 0.03 || cfg.blur < 0.5;

    final content = Stack(
      children: [
        Positioned.fill(
          child: RepaintBoundary(
            child: CustomPaint(
              painter: _GlassPainter(
                cfg,
                br,
                _engine.phase,
                tintOverride: widget.tintColor,
              ),
            ),
          ),
        ),
        if (widget.padding != null)
          Padding(padding: widget.padding!, child: widget.child)
        else
          widget.child,
      ],
    );

    return ClipRRect(
      borderRadius: br,
      child: solid
          ? content
          : BackdropFilter(
              filter: ImageFilter.blur(
                sigmaX: cfg.blur,
                sigmaY: cfg.blur,
                tileMode: TileMode.mirror,
              ),
              child: content,
            ),
    );
  }
}

class _GlassPainter extends CustomPainter {
  _GlassPainter(this.c, this.br, this.phase, {this.tintOverride}) : super(repaint: phase);

  final GlassConfig c;
  final BorderRadius br;
  final ValueListenable<double> phase;
  final Color? tintOverride;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final rect = Offset.zero & size;
    final rrect = br.toRRect(rect);
    final base = GlassPalette.baseColor(c.base);
    final light = GlassPalette.isLight(c.base);
    final ink = light ? Colors.black : Colors.white;
    final t = phase.value * c.speed;

    canvas.save();
    canvas.clipRRect(rrect);

    // 1 ─ base fill (opacity falls as fluidity rises)
    if (tintOverride != null) {
      canvas.drawRect(rect, Paint()..color = tintOverride!);
    } else {
      canvas.drawRect(
        rect,
        Paint()..color = base.withValues(alpha: lerpDouble(0.96, 0.06, c.fluidity)!),
      );
    }

    // 2 ─ tint wash / flowing colour
    final tintColor = GlassPalette.tints[c.tint]?.color;
    final aurora = c.tint == 'aurora';
    final flow = c.motion == GlassMotion.flow;
    final List<Color>? palette = aurora
        ? GlassPalette.aurora
        : tintColor != null
            ? [tintColor, tintColor, tintColor]
            : flow
                ? GlassPalette.aurora
                : null;
    if (palette != null) {
      final strength = (aurora || tintColor != null) ? c.tintStrength : 0.35;
      if (flow) {
        final r = math.max(size.width, size.height) * 0.62;
        for (var i = 0; i < 3; i++) {
          final centre = Offset(
            size.width * (0.5 + 0.45 * math.sin(t * 0.8 + i * 2.1)),
            size.height * (0.5 + 0.55 * math.cos(t * 0.65 + i * 1.7)),
          );
          canvas.drawCircle(
            centre,
            r,
            Paint()
              ..shader = RadialGradient(colors: [
                palette[i].withValues(alpha: 0.55 * strength),
                palette[i].withValues(alpha: 0),
              ]).createShader(Rect.fromCircle(center: centre, radius: r)),
          );
        }
      } else {
        canvas.drawRect(
          rect,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                palette.first.withValues(alpha: 0.45 * strength),
                palette.last.withValues(alpha: 0.10 * strength),
              ],
            ).createShader(rect),
        );
      }
    }

    // 3 ─ frost veil
    if (c.frost > 0) {
      canvas.drawRect(rect, Paint()..color = Colors.white.withValues(alpha: c.frost * 0.35));
    }

    // 4 ─ depth (top highlight, bottom shade)
    if (c.depth > 0) {
      canvas.drawRect(
        rect,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.white.withValues(alpha: (light ? 0.35 : 0.16) * c.depth),
              Colors.transparent,
              Colors.black.withValues(alpha: (light ? 0.06 : 0.20) * c.depth),
            ],
            stops: const [0, 0.45, 1],
          ).createShader(rect),
      );
    }

    // 5 ─ prism fringe across the body
    if (c.prism > 0.01) {
      canvas.drawRect(
        rect,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              for (final col in GlassPalette.spectrum) col.withValues(alpha: 0.07 * c.prism),
            ],
          ).createShader(rect),
      );
    }

    // 6 ─ shimmer band
    if (c.motion == GlassMotion.shimmer) {
      final bandW = size.width * 0.45;
      final progress = (t * 0.22) % 2.2; // sweep, then rest
      if (progress < 1) {
        final x = lerpDouble(-bandW * 1.5, size.width + bandW, progress)!;
        canvas.save();
        canvas.translate(x, 0);
        canvas.skew(-0.35, 0);
        final band = Rect.fromLTWH(0, 0, bandW, size.height);
        canvas.drawRect(
          band,
          Paint()
            ..shader = LinearGradient(colors: [
              Colors.white.withValues(alpha: 0),
              Colors.white.withValues(alpha: light ? 0.5 : 0.22),
              Colors.white.withValues(alpha: 0),
            ]).createShader(band),
        );
        canvas.restore();
      }
    }

    // 7 ─ edges
    final edge = rrect.deflate(0.5);
    canvas.drawRRect(
      edge,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.6
        ..color = ink.withValues(alpha: 0.08),
    );

    final angle = c.lightAngle * math.pi / 180;
    if (c.rim && c.rimStrength > 0.01) {
      final a = c.rimStrength;
      canvas.drawRRect(
        edge,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.1
          ..shader = SweepGradient(
            transform: GradientRotation(angle),
            colors: [
              ink.withValues(alpha: 0.95 * a),
              ink.withValues(alpha: 0.04 * a),
              ink.withValues(alpha: 0.04 * a),
              ink.withValues(alpha: 0.55 * a),
              ink.withValues(alpha: 0.04 * a),
              ink.withValues(alpha: 0.04 * a),
              ink.withValues(alpha: 0.95 * a),
            ],
            stops: const [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1],
          ).createShader(rect),
      );
    }

    if (c.prism > 0.01) {
      final rot = angle + (c.motion == GlassMotion.still ? 0 : t * 0.7);
      Shader sweep(double alpha) => SweepGradient(
            transform: GradientRotation(rot),
            colors: [
              for (final col in GlassPalette.spectrum) col.withValues(alpha: alpha * c.prism),
            ],
          ).createShader(rect);

      canvas.drawRRect(
        edge.deflate(1.2),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5)
          ..shader = sweep(0.35),
      );
      canvas.drawRRect(
        edge,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..shader = sweep(0.9),
      );
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(_GlassPainter old) =>
      !identical(old.c, c) || old.br != br || old.tintOverride != tintOverride;
}
