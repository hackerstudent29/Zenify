import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import 'pressable_scale.dart';

/// Apple Music accent (the red/pink used for the selected tab + search).
const Color kAppleRed = Color(0xFFFA2D48);

/* ====================================================================== */
/*  AppleGlass: "Liquid Glass" surface                                     */
/*   • real backdrop blur                                                  */
/*   • soft translucent tint + diagonal light gradient                     */
/*   • specular rim (bright top-left edge, faint bottom-right edge)        */
/*   • drop shadow painted ONLY outside the shape (never darkens the glass)*/
/* ====================================================================== */
class AppleGlass extends StatelessWidget {
  const AppleGlass({
    super.key,
    required this.borderRadius,
    this.child,
    this.blur = 14,
    this.tint = const Color(0x1F18181C),
    this.shadow = true,
  });

  final BorderRadius borderRadius;
  final Widget? child;
  final double blur;
  final Color tint;
  final bool shadow;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: shadow ? _GlassShadowPainter(borderRadius) : null,
      child: ClipRRect(
        borderRadius: borderRadius,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur),
          child: CustomPaint(
            foregroundPainter: _GlassRimPainter(borderRadius),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: tint,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Colors.white.withValues(alpha: 0.09),
                    Colors.white.withValues(alpha: 0.01),
                    Colors.white.withValues(alpha: 0.04),
                  ],
                  stops: const [0, 0.55, 1],
                ),
              ),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

class _GlassShadowPainter extends CustomPainter {
  _GlassShadowPainter(this.radius);
  final BorderRadius radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = radius.toRRect(Offset.zero & size);
    final outside = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Rect.fromLTWH(-120, -120, size.width + 240, size.height + 360))
      ..addRRect(rrect);
    canvas.save();
    canvas.clipPath(outside);
    canvas.drawRRect(
      rrect.shift(const Offset(0, 8)),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.22)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
    canvas.drawRRect(
      rrect.shift(const Offset(0, 2)),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.12)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _GlassShadowPainter old) => old.radius != radius;
}

class _GlassRimPainter extends CustomPainter {
  _GlassRimPainter(this.radius);
  final BorderRadius radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rrect = radius.toRRect(rect).deflate(0.5);
    final shader = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Colors.white.withValues(alpha: 0.40),
        Colors.white.withValues(alpha: 0.04),
        Colors.white.withValues(alpha: 0.04),
        Colors.white.withValues(alpha: 0.18),
      ],
      stops: const [0, 0.35, 0.65, 1],
    ).createShader(rect);
    canvas.drawRRect(
      rrect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..shader = shader,
    );
    // inner top highlight (the thin "lit edge" of the glass)
    canvas.save();
    canvas.clipRRect(radius.toRRect(rect));
    canvas.drawRRect(
      radius.toRRect(rect).deflate(1.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.white.withValues(alpha: 0.04),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _GlassRimPainter old) => old.radius != radius;
}

/* ====================================================================== */
/*  AppleDock: [ Home · Explore · Library ] pill  +  round Search button   */
/*                                                                         */
/*  • Press and SLIDE across the pill: the glass "lens" follows your       */
/*    finger, magnifies slightly, stretches with speed, and springs to the */
/*    nearest tab on release (flick velocity is respected).                */
/*  • Tapping a tab slides the lens there with the same spring.            */
/*  • index 3 = Search (lens fades out, search icon turns red).            */
/* ====================================================================== */
class _DockSpec {
  const _DockSpec(this.label, this.icon);
  final String label;
  final IconData icon;
}

class AppleDock extends StatefulWidget {
  const AppleDock({
    super.key,
    required this.index,
    required this.onSelect,
    this.height = 64,
  });

  /// 0 Home · 1 Explore · 2 Library · 3 Search
  final int index;
  final ValueChanged<int> onSelect;
  final double height;

  @override
  State<AppleDock> createState() => _AppleDockState();
}

class _AppleDockState extends State<AppleDock> with TickerProviderStateMixin {
  static const _items = [
    _DockSpec('Home', Icons.home_rounded),
    _DockSpec('Explore', Icons.grid_view_rounded),
    _DockSpec('Library', Icons.library_music_rounded),
  ];
  static const _inset = 5.0;

  // Slightly under-damped: a tiny, fluid overshoot like iOS.
  static const _spring = SpringDescription(mass: 1, stiffness: 360, damping: 28);
  static const _soft = SpringDescription(mass: 1, stiffness: 300, damping: 30);

  late final AnimationController _pos = AnimationController.unbounded(
    vsync: this,
    value: widget.index < _items.length ? widget.index.toDouble() : 0,
  ); // lens position in "item units" (0…2)
  late final AnimationController _press = AnimationController.unbounded(vsync: this, value: 0); // lens magnify
  late final AnimationController _vis = AnimationController.unbounded(
    vsync: this,
    value: widget.index < _items.length ? 1 : 0,
  ); // lens visibility

  bool _dragging = false;
  double _itemW = 1;
  double _vel = 0, _lastV = 0;
  int _near = 0;
  int? _handled;

  @override
  void initState() {
    super.initState();
    _lastV = _pos.value;
    _pos.addListener(() {
      final v = _pos.value;
      _vel = _vel * 0.7 + (v - _lastV) * 60 * 0.3;
      _lastV = v;
    });
  }

  @override
  void dispose() {
    _pos.dispose();
    _press.dispose();
    _vis.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant AppleDock old) {
    super.didUpdateWidget(old);
    if (old.index == widget.index || _dragging) return;
    if (_handled == widget.index) {
      _handled = null; // the drag-release spring already owns the motion
      return;
    }
    if (widget.index < _items.length) {
      if (_vis.value < 0.05) _pos.value = widget.index.toDouble(); // coming from Search: appear in place
      _springTo(_pos, widget.index.toDouble());
      _springTo(_vis, 1, spring: _soft);
    } else {
      _springTo(_vis, 0, spring: _soft);
    }
  }

  void _springTo(AnimationController c, double target, {double velocity = 0, SpringDescription spring = _spring}) {
    c.animateWith(SpringSimulation(spring, c.value, target, velocity));
  }

  /* ───────────── slide gesture ───────────── */

  void _dragStart(DragStartDetails d) {
    _dragging = true;
    _handled = null;
    _pos.stop();
    if (widget.index >= _items.length || _vis.value < 0.5) {
      _pos.value = ((d.localPosition.dx - _inset) / _itemW - 0.5).clamp(0.0, 2.0);
    }
    _near = _pos.value.round().clamp(0, 2);
    _springTo(_vis, 1, spring: _soft);
    _springTo(_press, 1, spring: _soft);
  }

  void _dragUpdate(DragUpdateDetails d) {
    final out = _pos.value < 0 || _pos.value > _items.length - 1;
    final resistance = out ? 0.35 : 1.0; // rubber-band past the ends
    _pos.value = (_pos.value + d.delta.dx / _itemW * resistance).clamp(-0.3, 2.3);
    final n = _pos.value.round().clamp(0, 2);
    if (n != _near) {
      _near = n;
      HapticFeedback.selectionClick();
    }
  }

  void _dragEnd(double vxPixels) {
    final v = vxPixels / _itemW; // items / second
    final projected = _pos.value + v * 0.10; // where it would coast to
    final target = projected.round().clamp(0, 2);
    _dragging = false;
    _springTo(_pos, target.toDouble(), velocity: v);
    _springTo(_press, 0, spring: _soft);
    if (target != widget.index) {
      _handled = target;
      widget.onSelect(target);
    }
  }

  /* ───────────── build ───────────── */

  @override
  Widget build(BuildContext context) {
    final h = widget.height;
    return SizedBox(
      height: h,
      child: Row(
        children: [
          Expanded(child: _pill(h)),
          const SizedBox(width: 10),
          _search(h),
        ],
      ),
    );
  }

  Widget _pill(double h) {
    return AppleGlass(
      borderRadius: BorderRadius.circular(h / 2),
      child: LayoutBuilder(
        builder: (context, c) {
          _itemW = (c.maxWidth - _inset * 2) / _items.length;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: _dragStart,
            onHorizontalDragUpdate: _dragUpdate,
            onHorizontalDragEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dx),
            onHorizontalDragCancel: () => _dragEnd(0),
            child: Padding(
              padding: const EdgeInsets.all(_inset),
              child: Stack(
                children: [
                  // the sliding glass lens
                  Align(
                    alignment: Alignment.centerLeft,
                    child: AnimatedBuilder(
                      animation: Listenable.merge([_pos, _press, _vis]),
                      builder: (_, _) {
                        final press = _press.value.clamp(0.0, 1.0);
                        final vis = _vis.value.clamp(0.0, 1.0);
                        final stretch = 1 + (_vel.abs() * 0.035).clamp(0.0, 0.14);
                        final scale = 1 + 0.10 * press;
                        return Opacity(
                          opacity: vis,
                          child: Transform.translate(
                            offset: Offset(_pos.value * _itemW, 0),
                            child: Transform(
                              alignment: Alignment.center,
                              transform: Matrix4.diagonal3Values(scale * stretch, scale, 1),
                              child: Container(
                                width: _itemW,
                                height: h - _inset * 2,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(h / 2),
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Colors.white.withValues(alpha: 0.18 + 0.06 * press),
                                      kAppleRed.withValues(alpha: 0.12 + 0.05 * press),
                                    ],
                                  ),
                                  border: Border.all(
                                    color: Colors.white.withValues(alpha: 0.28 + 0.12 * press),
                                    width: 0.8,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: kAppleRed.withValues(alpha: 0.16),
                                      blurRadius: 12,
                                      offset: const Offset(0, 2),
                                    ),
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.14 * press),
                                      blurRadius: 10,
                                      offset: const Offset(0, 3),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  Row(
                    children: [
                      for (int i = 0; i < _items.length; i++) Expanded(child: _item(i)),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _item(int i) {
    final spec = _items[i];
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        if (i != widget.index) HapticFeedback.selectionClick();
        widget.onSelect(i);
      },
      child: AnimatedBuilder(
        animation: Listenable.merge([_pos, _vis]),
        builder: (_, _) {
          final vis = _vis.value.clamp(0.0, 1.0);
          final prox = (1 - (_pos.value - i).abs()).clamp(0.0, 1.0) * vis;
          final t = Curves.easeOut.transform(prox);
          final color = Color.lerp(const Color(0xD9FFFFFF), kAppleRed, t)!;
          return Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Transform.scale(
                scale: 1 + 0.06 * prox,
                child: Icon(spec.icon, size: 26, color: color),
              ),
              const SizedBox(height: 2),
              Text(
                spec.label,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 10.5,
                  height: 1.2,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.1,
                  color: color,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _search(double h) {
    final selected = widget.index == 3;
    return PressableScale(
      onTap: () {
        if (!selected) HapticFeedback.selectionClick();
        widget.onSelect(3);
      },
      child: AppleGlass(
        borderRadius: BorderRadius.circular(h / 2),
        child: SizedBox(
          width: h,
          height: h,
          child: Padding(
            padding: const EdgeInsets.all(_inset),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeOutCubic,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: selected ? 0.13 : 0),
                border: Border.all(
                  color: Colors.white.withValues(alpha: selected ? 0.16 : 0),
                  width: 0.8,
                ),
              ),
              child: Center(
                child: TweenAnimationBuilder<Color?>(
                  tween: ColorTween(end: selected ? kAppleRed : const Color(0xF2FFFFFF)),
                  duration: const Duration(milliseconds: 260),
                  builder: (_, c, _) => Icon(Icons.search_rounded, size: 29, color: c),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Fades the right edge of single-line text (Apple's mini-player title fade near the buttons).
class RightEdgeFade extends StatelessWidget {
  const RightEdgeFade({super.key, required this.child, this.fade = 28});
  final Widget child;
  final double fade;

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      blendMode: BlendMode.dstIn,
      shaderCallback: (r) => LinearGradient(
        colors: const [Colors.black, Colors.black, Colors.transparent],
        stops: [0, ((r.width - fade) / r.width).clamp(0.0, 1.0), 1],
      ).createShader(r),
      child: child,
    );
  }
}

