import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import '../zen.dart';

/// Apple "glass" component kit: translucent surfaces with a specular edge,
/// spring-driven press / toggle / slider motion, and Apple-style controls.
/// Every animation is a spring (or follows the finger and is settled by one).

const _snappy = SpringDescription(mass: 1, stiffness: 439, damping: 35.6);
const _bouncy = SpringDescription(mass: 1, stiffness: 158, damping: 16.3);
const _standard = SpringDescription(mass: 1, stiffness: 158, damping: 20.7);
const _tol = Tolerance(distance: 0.001, velocity: 0.01);

extension _Spring on AnimationController {
  void spring(double to, SpringDescription s) =>
      animateWith(SpringSimulation(s, value, to, velocity, tolerance: _tol));
}

/// A spring sampled as a Curve, for implicit animations (AnimatedSize etc).
class SpringCurve extends Curve {
  const SpringCurve({this.damping = 1.0, this.response = 0.4});
  final double damping;
  final double response;

  Duration get duration => Duration(milliseconds: (response * 1.6 * 1000).round());

  @override
  double transformInternal(double t) {
    final w = 2 * math.pi / response;
    final sim = SpringSimulation(
      SpringDescription(mass: 1, stiffness: w * w, damping: 2 * damping * w),
      0, 1, 0,
    );
    return sim.x(t * response * 1.6);
  }
}

// -----------------------------------------------------------------------------
// Surface
// -----------------------------------------------------------------------------
class GlassSurface extends StatelessWidget {
  const GlassSurface({
    super.key,
    required this.child,
    this.radius = 16,
    this.blur = 0,
    this.gradient,
    this.padding,
    this.glow,
  });

  final Widget child;
  final double radius;
  final double blur;
  final Gradient? gradient;
  final EdgeInsetsGeometry? padding;
  final Color? glow;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(radius);
    Widget body = DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: r,
        gradient: gradient ??
            LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Colors.white.withValues(alpha: 0.17), Colors.white.withValues(alpha: 0.06)],
            ),
      ),
      child: padding == null ? child : Padding(padding: padding!, child: child),
    );
    if (blur > 0) {
      body = ClipRRect(
        borderRadius: r,
        child: BackdropFilter(filter: ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur), child: body),
      );
    }
    body = CustomPaint(foregroundPainter: _GlassEdge(radius), child: body);
    if (glow != null) {
      body = DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: r,
          boxShadow: [BoxShadow(color: glow!.withValues(alpha: 0.38), blurRadius: 18, offset: const Offset(0, 6))],
        ),
        child: body,
      );
    }
    return body;
  }
}

class _GlassEdge extends CustomPainter {
  _GlassEdge(this.radius);
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rr = RRect.fromRectAndRadius(rect.deflate(0.4), Radius.circular(radius));
    canvas.drawRRect(
      rr,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: 0.46),
            Colors.white.withValues(alpha: 0.05),
            Colors.white.withValues(alpha: 0.2),
          ],
          stops: const [0, 0.5, 1],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_GlassEdge old) => old.radius != radius;
}

// -----------------------------------------------------------------------------
// Press feedback
// -----------------------------------------------------------------------------
class GlassPress extends StatefulWidget {
  const GlassPress({super.key, required this.child, this.onTap, this.onLongPress, this.scale = 0.95, this.enabled = true});
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double scale;
  final bool enabled;

  @override
  State<GlassPress> createState() => _GlassPressState();
}

class _GlassPressState extends State<GlassPress> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: widget.enabled ? (_) => _c.spring(widget.scale, _snappy) : null,
      onTapUp: (_) => _c.spring(1, _bouncy),
      onTapCancel: () => _c.spring(1, _bouncy),
      onTap: widget.enabled ? widget.onTap : null,
      onLongPress: widget.enabled ? widget.onLongPress : null,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: widget.enabled ? 1 : 0.35,
        child: AnimatedBuilder(
          animation: _c,
          child: widget.child,
          builder: (_, child) => Transform.scale(scale: _c.value, child: child),
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Buttons
// -----------------------------------------------------------------------------
enum GlassButtonStyle { prominent, regular, plain, destructive }

class GlassButton extends StatelessWidget {
  const GlassButton({
    super.key,
    required this.label,
    required this.onTap,
    this.icon,
    this.style = GlassButtonStyle.regular,
    this.compact = false,
    this.enabled = true,
  });

  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final GlassButtonStyle style;
  final bool compact;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final h = compact ? 40.0 : 44.0;
    final fg = switch (style) {
      GlassButtonStyle.prominent => Colors.white,
      GlassButtonStyle.regular => Colors.white,
      GlassButtonStyle.plain => Zen.rose,
      GlassButtonStyle.destructive => const Color(0xFFFF6B6B),
    };
    final content = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[Icon(icon, size: compact ? 15 : 18, color: fg), const SizedBox(width: 6)],
        Text(label, style: TextStyle(color: fg, fontSize: compact ? 13 : 15, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
      ],
    );

    Widget body;
    switch (style) {
      case GlassButtonStyle.prominent:
        body = GlassSurface(
          radius: 12,
          glow: Zen.rose,
          padding: EdgeInsets.symmetric(horizontal: compact ? 18 : 22),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Zen.rose.withValues(alpha: 0.98), Zen.rose.withValues(alpha: 0.74)],
          ),
          child: SizedBox(
            height: h,
            child: Center(widthFactor: 1, child: content),
          ),
        );
      case GlassButtonStyle.regular:
        body = GlassSurface(
          radius: 12,
          blur: 18,
          padding: EdgeInsets.symmetric(horizontal: compact ? 18 : 22),
          child: SizedBox(
            height: h,
            child: Center(widthFactor: 1, child: content),
          ),
        );
      case GlassButtonStyle.plain:
      case GlassButtonStyle.destructive:
        body = SizedBox(
          height: h,
          child: Center(
            widthFactor: 1,
            child: Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: content),
          ),
        );
    }

    return GlassPress(
      enabled: enabled,
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: body,
    );
  }
}

class GlassIconButton extends StatelessWidget {
  const GlassIconButton({super.key, required this.icon, required this.onTap, this.size = 32});
  final IconData icon;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return GlassPress(
      scale: 0.88,
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: SizedBox(
        width: size,
        height: size,
        child: GlassSurface(
          radius: size / 2,
          blur: 14,
          child: Icon(icon, size: size * 0.5, color: Colors.white.withValues(alpha: 0.8)),
        ),
      ),
    );
  }
}

class GlassTextButton extends StatelessWidget {
  const GlassTextButton({super.key, required this.label, required this.onTap, this.enabled = true});
  final String label;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return GlassPress(
      enabled: enabled,
      scale: 0.92,
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: Text(label, style: TextStyle(color: Zen.rose, fontSize: 12.5, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Switch (Apple 51x31, thumb stretches on press)
// -----------------------------------------------------------------------------
class GlassSwitch extends StatefulWidget {
  const GlassSwitch({super.key, required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  State<GlassSwitch> createState() => _GlassSwitchState();
}

class _GlassSwitchState extends State<GlassSwitch> with TickerProviderStateMixin {
  late final AnimationController _pos = AnimationController.unbounded(vsync: this, value: widget.value ? 1 : 0);
  late final AnimationController _press = AnimationController.unbounded(vsync: this, value: 0);

  @override
  void didUpdateWidget(GlassSwitch old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) _pos.spring(widget.value ? 1 : 0, _standard);
  }

  @override
  void dispose() {
    _pos.dispose();
    _press.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const w = 51.0, h = 31.0, pad = 2.0;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _press.spring(1, _snappy),
      onTapUp: (_) => _press.spring(0, _bouncy),
      onTapCancel: () => _press.spring(0, _bouncy),
      onTap: () {
        HapticFeedback.lightImpact();
        widget.onChanged(!widget.value);
      },
      child: SizedBox(
        width: w,
        height: h,
        child: AnimatedBuilder(
          animation: Listenable.merge([_pos, _press]),
          builder: (_, _) {
            final p = _pos.value;
            final tw = 27.0 + 6.0 * _press.value.clamp(0.0, 1.0);
            final x = pad + p * (w - 2 * pad - tw);
            final track = Color.lerp(Colors.white.withValues(alpha: 0.18), Zen.rose, p.clamp(0.0, 1.0))!;
            return Stack(
              children: [
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: track,
                      borderRadius: BorderRadius.circular(h / 2),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 0.8),
                    ),
                  ),
                ),
                Positioned(
                  left: x,
                  top: pad,
                  width: tw,
                  height: 27,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(13.5),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 6, offset: const Offset(0, 2))],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Segmented control (sliding glass pill)
// -----------------------------------------------------------------------------
class GlassSegmented<T> extends StatefulWidget {
  const GlassSegmented({super.key, required this.value, required this.options, required this.onChanged, this.fontSize = 12.5});
  final T value;
  final Map<T, String> options;
  final ValueChanged<T> onChanged;
  final double fontSize;

  @override
  State<GlassSegmented<T>> createState() => _GlassSegmentedState<T>();
}

class _GlassSegmentedState<T> extends State<GlassSegmented<T>> with SingleTickerProviderStateMixin {
  int get _idx => math.max(0, widget.options.keys.toList().indexOf(widget.value));
  late final AnimationController _pos = AnimationController.unbounded(vsync: this, value: _idx.toDouble());

  @override
  void didUpdateWidget(GlassSegmented<T> old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) _pos.spring(_idx.toDouble(), _standard);
  }

  @override
  void dispose() {
    _pos.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final entries = widget.options.entries.toList();
    return Container(
      height: 34,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06), width: 0.8),
      ),
      child: LayoutBuilder(
        builder: (_, cs) {
          final segW = cs.maxWidth / entries.length;
          return Stack(
            children: [
              AnimatedBuilder(
                animation: _pos,
                builder: (_, _) => Positioned(
                  left: _pos.value * segW,
                  top: 0,
                  bottom: 0,
                  width: segW,
                  child: GlassSurface(
                    radius: 9,
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.white.withValues(alpha: 0.3), Colors.white.withValues(alpha: 0.16)],
                    ),
                    child: const SizedBox.expand(),
                  ),
                ),
              ),
              Row(
                children: [
                  for (final e in entries)
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          if (e.key != widget.value) {
                            HapticFeedback.selectionClick();
                            widget.onChanged(e.key);
                          }
                        },
                        child: Center(
                          child: AnimatedDefaultTextStyle(
                            duration: const Duration(milliseconds: 200),
                            style: TextStyle(
                              fontSize: widget.fontSize,
                              fontWeight: FontWeight.w600,
                              color: e.key == widget.value ? Colors.white : Colors.white.withValues(alpha: 0.55),
                            ),
                            child: Text(e.value, maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Chip
// -----------------------------------------------------------------------------
class GlassChip extends StatelessWidget {
  const GlassChip({super.key, required this.label, required this.selected, required this.onTap, this.onDelete});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return GlassPress(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
        padding: EdgeInsets.fromLTRB(13, 7, onDelete == null ? 13 : 8, 7),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(99),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: selected
                ? [Zen.rose.withValues(alpha: 0.98), Zen.rose.withValues(alpha: 0.72)]
                : [Colors.white.withValues(alpha: 0.15), Colors.white.withValues(alpha: 0.06)],
          ),
          border: Border.all(color: Colors.white.withValues(alpha: selected ? 0.36 : 0.13), width: 0.8),
          boxShadow: [
            BoxShadow(
              color: Zen.rose.withValues(alpha: selected ? 0.3 : 0),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : Colors.white.withValues(alpha: 0.78),
              ),
            ),
            if (onDelete != null) ...[
              const SizedBox(width: 4),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  HapticFeedback.selectionClick();
                  onDelete!();
                },
                child: Padding(
                  padding: const EdgeInsets.all(3),
                  child: Icon(Icons.close_rounded, size: 13, color: Colors.white.withValues(alpha: 0.6)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Sections (inset grouped)
// -----------------------------------------------------------------------------
class GlassHeader extends StatelessWidget {
  const GlassHeader(this.title, {super.key, this.action});
  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
      child: action != null
          ? ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 38),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Text(
                      title.toUpperCase(),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.5),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                  action!,
                ],
              ),
            )
          : SizedBox(
              height: 22,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title.toUpperCase(),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.5),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class GlassSection extends StatelessWidget {
  const GlassSection({super.key, this.title, this.action, required this.children});
  final String? title;
  final Widget? action;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) rows.add(Divider(height: 0.5, thickness: 0.5, color: Colors.white.withValues(alpha: 0.08)));
      rows.add(Padding(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), child: children[i]));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null || action != null) GlassHeader(title ?? '', action: action),
        GlassSurface(
          radius: 16,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white.withValues(alpha: 0.10), Colors.white.withValues(alpha: 0.05)],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows),
        ),
      ],
    );
  }
}

/// Springy reveal (height + fade) that keeps its child mounted.
class GlassCollapse extends StatelessWidget {
  const GlassCollapse({super.key, required this.open, required this.child});
  final bool open;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    const curve = SpringCurve();
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(end: open ? 1.0 : 0.0),
      duration: curve.duration,
      curve: curve,
      builder: (_, v, c) {
        final t = v.clamp(0.0, 1.0);
        return IgnorePointer(
          ignoring: !open,
          child: ClipRect(
            child: Align(alignment: Alignment.topCenter, heightFactor: t, child: Opacity(opacity: t, child: c)),
          ),
        );
      },
      child: child,
    );
  }
}

// -----------------------------------------------------------------------------
// Slider (white fill, spring thumb, snap-to-centre with haptic tick)
// -----------------------------------------------------------------------------
class GlassSlider extends StatefulWidget {
  const GlassSlider({
    super.key,
    required this.value,
    required this.onChanged,
    this.onChangeEnd,
    this.min = 0,
    this.max = 1,
    this.step,
    this.center,
    this.snap = 0,
    this.bipolar = false,
    this.axis = Axis.horizontal,
    this.enabled = true,
    this.title,
    this.hint,
    this.format,
  });

  final double value, min, max;
  final double? step, center;
  final double snap;
  final bool bipolar, enabled;
  final Axis axis;
  final String? title, hint;
  final String Function(double)? format;
  final ValueChanged<double> onChanged;
  final ValueChanged<double>? onChangeEnd;

  @override
  State<GlassSlider> createState() => _GlassSliderState();
}

class _GlassSliderState extends State<GlassSlider> with SingleTickerProviderStateMixin {
  late double _v = widget.value;
  bool _drag = false;
  bool _snapped = false;
  late final AnimationController _thumb = AnimationController.unbounded(vsync: this, value: 1);
  static const double _r = 11;

  @override
  void didUpdateWidget(GlassSlider old) {
    super.didUpdateWidget(old);
    if (!_drag) _v = widget.value;
  }

  @override
  void dispose() {
    _thumb.dispose();
    super.dispose();
  }

  double _calc(Offset p, double len) {
    final usable = math.max(1.0, len - 2 * _r);
    final t = widget.axis == Axis.horizontal ? p.dx : len - p.dy;
    final f = ((t - _r) / usable).clamp(0.0, 1.0);
    var v = widget.min + f * (widget.max - widget.min);
    final s = widget.step;
    if (s != null && s > 0) v = widget.min + ((v - widget.min) / s).round() * s;
    final c = widget.center;
    if (c != null && widget.snap > 0 && (v - c).abs() <= widget.snap) {
      v = c;
      if (!_snapped) {
        _snapped = true;
        HapticFeedback.selectionClick();
      }
    } else {
      _snapped = false;
    }
    return v.clamp(widget.min, widget.max).toDouble();
  }

  void _set(Offset p, double len) {
    final nv = _calc(p, len);
    if (nv != _v) {
      setState(() => _v = nv);
      widget.onChanged(nv);
    }
  }

  void _begin(Offset p, double len) {
    if (!widget.enabled || _drag) return;
    _drag = true;
    _thumb.spring(1.22, _snappy);
    _set(p, len);
  }

  void _end() {
    if (!_drag) return;
    _drag = false;
    _thumb.spring(1, _bouncy);
    widget.onChangeEnd?.call(_v);
  }

  @override
  Widget build(BuildContext context) {
    final horizontal = widget.axis == Axis.horizontal;
    final text = (widget.format ?? (v) => v.toStringAsFixed(2))(_v);
    final span = widget.max - widget.min;
    final frac = span == 0 ? 0.0 : ((_v - widget.min) / span).clamp(0.0, 1.0);
    final originVal = widget.bipolar ? (widget.center ?? (widget.min + widget.max) / 2) : widget.min;
    final origin = span == 0 ? 0.0 : ((originVal - widget.min) / span).clamp(0.0, 1.0);

    final track = LayoutBuilder(
      builder: (_, cs) {
        final len = horizontal ? cs.maxWidth : cs.maxHeight;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          dragStartBehavior: DragStartBehavior.down,
          onTapUp: (d) {
            _begin(d.localPosition, len);
            _end();
          },
          onLongPress: widget.center == null || !widget.enabled
              ? null
              : () {
                  HapticFeedback.mediumImpact();
                  setState(() => _v = widget.center!);
                  widget.onChanged(widget.center!);
                  widget.onChangeEnd?.call(widget.center!);
                },
          onHorizontalDragStart: horizontal ? (d) => _begin(d.localPosition, len) : null,
          onHorizontalDragUpdate: horizontal ? (d) => _set(d.localPosition, len) : null,
          onHorizontalDragEnd: horizontal ? (_) => _end() : null,
          onHorizontalDragCancel: horizontal ? _end : null,
          onVerticalDragStart: horizontal ? null : (d) => _begin(d.localPosition, len),
          onVerticalDragUpdate: horizontal ? null : (d) => _set(d.localPosition, len),
          onVerticalDragEnd: horizontal ? null : (_) => _end(),
          onVerticalDragCancel: horizontal ? null : _end,
          child: AnimatedBuilder(
            animation: _thumb,
            builder: (_, _) => CustomPaint(
              size: Size.infinite,
              painter: _SliderPainter(frac, origin, horizontal, _thumb.value, widget.enabled),
            ),
          ),
        );
      },
    );

    final titleStyle = TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13);
    final valueStyle = TextStyle(
      color: Colors.white.withValues(alpha: 0.5),
      fontSize: 12,
      fontFeatures: const [ui.FontFeature.tabularFigures()],
    );

    final content = horizontal
        ? Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.title != null)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [Text(widget.title!, style: titleStyle), Text(text, style: valueStyle)],
                ),
              SizedBox(height: 28, child: track),
            ],
          )
        : Column(
            children: [
              Text(text, style: valueStyle.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Expanded(child: SizedBox(width: 28, child: track)),
              const SizedBox(height: 6),
              if (widget.title != null) Text(widget.title!, style: titleStyle.copyWith(fontSize: 12, fontWeight: FontWeight.w600)),
              if (widget.hint != null)
                Text(widget.hint!, style: TextStyle(color: Colors.white.withValues(alpha: 0.35), fontSize: 10)),
            ],
          );

    return AnimatedOpacity(duration: const Duration(milliseconds: 200), opacity: widget.enabled ? 1 : 0.4, child: content);
  }
}

class _SliderPainter extends CustomPainter {
  _SliderPainter(this.frac, this.origin, this.horizontal, this.thumbScale, this.enabled);
  final double frac, origin, thumbScale;
  final bool horizontal, enabled;

  @override
  void paint(Canvas canvas, Size size) {
    const r = 11.0, th = 6.0;
    final len = horizontal ? size.width : size.height;
    final cross = horizontal ? size.height : size.width;
    double along(double f) => r + f * (len - 2 * r);
    Offset pt(double a) => horizontal ? Offset(a, cross / 2) : Offset(cross / 2, len - a);
    const rad = Radius.circular(th / 2);

    final trackRect = horizontal
        ? Rect.fromLTWH(0, (cross - th) / 2, len, th)
        : Rect.fromLTWH((cross - th) / 2, 0, th, len);
    canvas.drawRRect(RRect.fromRectAndRadius(trackRect, rad), Paint()..color = Colors.white.withValues(alpha: 0.18));

    final a = along(origin), b = along(frac);
    final lo = math.min(a, b), hi = math.max(a, b);
    final fillRect = horizontal
        ? Rect.fromLTRB(lo, (cross - th) / 2, hi, (cross + th) / 2)
        : Rect.fromLTRB((cross - th) / 2, len - hi, (cross + th) / 2, len - lo);
    if (hi - lo > 0.5) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(fillRect, rad),
        Paint()..color = Colors.white.withValues(alpha: enabled ? 0.95 : 0.5),
      );
    }

    final c = pt(b);
    final tr = r * thumbScale.clamp(0.8, 1.4);
    canvas.drawCircle(
      c.translate(0, 1.5),
      tr,
      Paint()
        ..color = Colors.black.withValues(alpha: 0.32)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );
    canvas.drawCircle(c, tr, Paint()..color = Colors.white);
    canvas.drawCircle(
      c,
      tr,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.5
        ..color = Colors.black.withValues(alpha: 0.12),
    );
  }

  @override
  bool shouldRepaint(_SliderPainter o) =>
      o.frac != frac || o.origin != origin || o.thumbScale != thumbScale || o.enabled != enabled;
}
