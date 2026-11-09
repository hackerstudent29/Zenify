import 'dart:ui' as ui;

import 'package:flutter/cupertino.dart' show CupertinoIcons;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import 'pressable_scale.dart';

/// Apple Music accent (the rose-red used for the selected tab + search).
const Color kAppleRed = Color(0xFFFA2D48);

/* ====================================================================== */
/*  AppleGlass: "Liquid Glass" surface                                     */
/*   • LIGHT blur (the background stays readable, not frosted)             */
/*   • saturation boost on whatever is behind the glass → "lively" colour  */
/*   • near-clear tint + faint diagonal light gradient                     */
/*   • specular rim + thick inner edge glow (the refracting edge)          */
/*   • drop shadow painted ONLY outside the shape                          */
/* ====================================================================== */
class AppleGlass extends StatelessWidget {
  const AppleGlass({
    super.key,
    required this.borderRadius,
    this.child,
    this.blur = 5,
    this.saturation = 1.7,
    this.tint = const Color(0x0F101014),
    this.shadow = true,
  });

  final BorderRadius borderRadius;
  final Widget? child;

  /// Gaussian sigma. Keep it low (3–7) so the content behind stays visible.
  final double blur;

  /// 1 = untouched, >1 = more vivid colours behind the glass.
  final double saturation;
  final Color tint;
  final bool shadow;

  static final Map<double, ui.ColorFilter> _satCache = {};

  static ui.ColorFilter _saturate(double s) {
    return _satCache.putIfAbsent(s, () {
      const r = 0.2126, g = 0.7152, b = 0.0722;
      final i = 1 - s;
      return ui.ColorFilter.matrix(<double>[
        r * i + s, g * i, b * i, 0, 0, //
        r * i, g * i + s, b * i, 0, 0, //
        r * i, g * i, b * i + s, 0, 0, //
        0, 0, 0, 1, 0,
      ]);
    });
  }

  @override
  Widget build(BuildContext context) {
    final filter = ui.ImageFilter.compose(
      outer: _saturate(saturation),
      inner: ui.ImageFilter.blur(
        sigmaX: blur,
        sigmaY: blur,
        tileMode: TileMode.clamp,
      ),
    );

    return RepaintBoundary(
      child: CustomPaint(
        painter: shadow ? _GlassShadowPainter(borderRadius) : null,
        child: ClipRRect(
          borderRadius: borderRadius,
          child: BackdropFilter(
            filter: filter,
            child: CustomPaint(
              foregroundPainter: _GlassRimPainter(borderRadius),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: tint,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withValues(alpha: 0.10),
                      Colors.white.withValues(alpha: 0.0),
                      Colors.white.withValues(alpha: 0.03),
                    ],
                    stops: const [0, 0.55, 1],
                  ),
                ),
                child: child,
              ),
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
        ..color = Colors.black.withValues(alpha: 0.20)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
    canvas.drawRRect(
      rrect.shift(const Offset(0, 2)),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.10)
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
    final full = radius.toRRect(rect);
    final shader = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Colors.white.withValues(alpha: 0.55),
        Colors.white.withValues(alpha: 0.06),
        Colors.white.withValues(alpha: 0.06),
        Colors.white.withValues(alpha: 0.30),
      ],
      stops: const [0, 0.35, 0.65, 1],
    ).createShader(rect);

    // thick, soft inner edge glow: this is what sells the "glass thickness"
    canvas.save();
    canvas.clipRRect(full);
    canvas.drawRRect(
      full.deflate(1),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5
        ..shader = shader
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.5)
        ..color = Colors.white.withValues(alpha: 0.5),
    );
    canvas.restore();

    // crisp specular rim
    canvas.drawRRect(
      full.deflate(0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..shader = shader,
    );
  }

  @override
  bool shouldRepaint(covariant _GlassRimPainter old) => old.radius != radius;
}

/* ====================================================================== */
/*  AppleDock: [ Home · Explore · Library ] pill  +  round Search button   */
/*                                                                         */
/*  • TAP: the icon + label simply turn rose. No glass, no lens.           */
/*  • LONG-PRESS: the glass lens appears over the icon under your finger.  */
/*    Keep holding and slide; it follows the finger, stretches with speed, */
/*    haptic-ticks on every tab and springs onto the nearest tab on        */
/*    release (flick velocity respected). Lens fades away afterwards.      */
/*  • index 3 = Search (no tab highlighted, search icon turns rose).       */
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
  // SF-Symbol style icons: house.fill · square.grid.2x2.fill · music.albums.fill
  static const _items = [
    _DockSpec('Home', CupertinoIcons.house_fill),
    _DockSpec('Explore', CupertinoIcons.square_grid_2x2_fill),
    _DockSpec('Library', CupertinoIcons.music_albums_fill),
  ];
  static const _inset = 5.0;
  static const _count = 3;

  static const _spring = SpringDescription(
    mass: 1,
    stiffness: 380,
    damping: 27,
  );
  static const _soft = SpringDescription(mass: 1, stiffness: 300, damping: 30);

  /// lens / icon-highlight position in "item units" (0 … 2)
  late final AnimationController _pos = AnimationController.unbounded(
    vsync: this,
    value: widget.index < _count ? widget.index.toDouble() : 0,
  );

  /// 0 → 1 while the lens is shown (long-press only)
  late final AnimationController _lens = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );

  /// 1 when a tab is selected, 0 when Search is (no tab is highlighted)
  late final AnimationController _sel = AnimationController.unbounded(
    vsync: this,
    value: widget.index < _count ? 1 : 0,
  );

  bool _pressing = false;
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
    _lens.dispose();
    _sel.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant AppleDock old) {
    super.didUpdateWidget(old);
    if (old.index == widget.index || _pressing) return;
    if (_handled == widget.index) {
      _handled = null; // the long-press release spring already owns the motion
      return;
    }
    if (widget.index < _count) {
      if (_sel.value < 0.05) {
        _pos.value = widget.index.toDouble(); // from Search: appear in place
      }
      _springTo(_pos, widget.index.toDouble());
      _springTo(_sel, 1, spring: _soft);
    } else {
      _springTo(_sel, 0, spring: _soft);
    }
  }

  void _springTo(
    AnimationController c,
    double target, {
    double velocity = 0,
    SpringDescription spring = _spring,
  }) {
    c.animateWith(SpringSimulation(spring, c.value, target, velocity));
  }

  /* ───────────── gestures ───────────── */

  /// Finger x (pill coordinates) → continuous item position, rubber-banded past the ends.
  double _fingerPos(double dx) {
    final raw = (dx - _inset) / _itemW - 0.5;
    if (raw < 0) return raw * 0.35;
    if (raw > _count - 1) return (_count - 1) + (raw - (_count - 1)) * 0.35;
    return raw;
  }

  void _tapAt(double dx) {
    final i = ((dx - _inset) / _itemW).floor().clamp(0, _count - 1);
    if (i != widget.index) HapticFeedback.selectionClick();
    widget.onSelect(i);
  }

  void _lpStart(LongPressStartDetails d) {
    HapticFeedback.mediumImpact();
    _pressing = true;
    _handled = null;
    _near = _fingerPos(d.localPosition.dx).round().clamp(0, _count - 1);
    // slide the lens from wherever the icon highlight currently is to the finger
    if (_sel.value < 0.5) _pos.value = _near.toDouble();
    _springTo(_pos, _fingerPos(d.localPosition.dx));
    _springTo(_sel, 1, spring: _soft);
    _springTo(_lens, 1, spring: _soft);
  }

  void _lpMove(LongPressMoveUpdateDetails d) {
    if (!_pressing) return;
    final target = _fingerPos(d.localPosition.dx);
    _pos.value =
        _pos.value + (target - _pos.value) * 0.6; // slight lag = liquid feel
    final n = _pos.value.round().clamp(0, _count - 1);
    if (n != _near) {
      _near = n;
      HapticFeedback.selectionClick();
    }
  }

  void _lpEnd(double vxPixels) {
    if (!_pressing) return;
    _pressing = false;
    final v = vxPixels / _itemW; // items / second
    final target = (_pos.value + v * 0.08).round().clamp(0, _count - 1);
    _springTo(_pos, target.toDouble(), velocity: v);
    _springTo(_lens, 0, spring: _soft);
    if (target != widget.index) {
      _handled = target;
      widget.onSelect(target);
    } else if (widget.index >= _count) {
      _springTo(_sel, 0, spring: _soft);
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
          _itemW = (c.maxWidth - _inset * 2) / _count;
          return RawGestureDetector(
            behavior: HitTestBehavior.opaque,
            gestures: <Type, GestureRecognizerFactory>{
              TapGestureRecognizer:
                  GestureRecognizerFactoryWithHandlers<TapGestureRecognizer>(
                    () => TapGestureRecognizer(),
                    (t) => t.onTapUp = (d) => _tapAt(d.localPosition.dx),
                  ),
              LongPressGestureRecognizer:
                  GestureRecognizerFactoryWithHandlers<
                    LongPressGestureRecognizer
                  >(
                    () => LongPressGestureRecognizer(
                      duration: const Duration(milliseconds: 230),
                    ),
                    (l) {
                      l.onLongPressStart = _lpStart;
                      l.onLongPressMoveUpdate = _lpMove;
                      l.onLongPressEnd = (d) =>
                          _lpEnd(d.velocity.pixelsPerSecond.dx);
                      l.onLongPressCancel = () => _lpEnd(0);
                    },
                  ),
            },
            child: Padding(
              padding: const EdgeInsets.all(_inset),
              child: Stack(
                children: [
                  // the sliding glass lens: built ONLY while it is visible
                  Positioned.fill(
                    child: AnimatedBuilder(
                      animation: Listenable.merge([_pos, _lens]),
                      builder: (_, _) {
                        final vis = _lens.value.clamp(0.0, 1.0);
                        if (vis < 0.01) return const SizedBox.shrink();
                        final stretch =
                            1 + (_vel.abs() * 0.035).clamp(0.0, 0.14);
                        final scale = (0.82 + 0.28 * vis);
                        return Align(
                          alignment: Alignment.centerLeft,
                          child: Transform.translate(
                            offset: Offset(_pos.value * _itemW, 0),
                            child: Transform(
                              alignment: Alignment.center,
                              transform: Matrix4.diagonal3Values(
                                scale * stretch,
                                scale,
                                1,
                              ),
                              child: _LensBody(
                                width: _itemW,
                                height: h - _inset * 2,
                                vis: vis,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  Row(
                    children: [
                      for (int i = 0; i < _count; i++)
                        Expanded(child: _item(i)),
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
    // IgnorePointer: the RawGestureDetector above owns every touch.
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: Listenable.merge([_pos, _sel]),
        builder: (_, _) {
          final sel = _sel.value.clamp(0.0, 1.0);
          final prox = (1 - (_pos.value - i).abs()).clamp(0.0, 1.0) * sel;
          final t = Curves.easeOut.transform(prox);
          final color = Color.lerp(const Color(0xD9FFFFFF), kAppleRed, t)!;
          return Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Transform.scale(
                scale: 1 + 0.06 * prox,
                child: Icon(spec.icon, size: 24, color: color),
              ),
              const SizedBox(height: 3),
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
          child: Center(
            // colour only: no background disc when selected
            child: TweenAnimationBuilder<Color?>(
              tween: ColorTween(
                end: selected ? kAppleRed : const Color(0xF2FFFFFF),
              ),
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOutCubic,
              builder: (_, c, _) =>
                  Icon(CupertinoIcons.search, size: 26, color: c),
            ),
          ),
        ),
      ),
    );
  }
}

/// The lens itself: clear glass with a bright specular edge. Painted once per frame, no backdrop pass.
class _LensBody extends StatelessWidget {
  const _LensBody({
    required this.width,
    required this.height,
    required this.vis,
  });
  final double width;
  final double height;
  final double vis;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(height / 2);
    return SizedBox(
      width: width,
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: r,
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.white.withValues(alpha: 0.24 * vis),
              Colors.white.withValues(alpha: 0.08 * vis),
              Colors.white.withValues(alpha: 0.14 * vis),
            ],
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18 * vis),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: CustomPaint(foregroundPainter: _LensRimPainter(r, vis)),
      ),
    );
  }
}

class _LensRimPainter extends CustomPainter {
  _LensRimPainter(this.radius, this.vis);
  final BorderRadius radius;
  final double vis;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rrect = radius.toRRect(rect);
    final shader = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Colors.white.withValues(alpha: 0.85 * vis),
        Colors.white.withValues(alpha: 0.10 * vis),
        Colors.white.withValues(alpha: 0.10 * vis),
        Colors.white.withValues(alpha: 0.55 * vis),
      ],
      stops: const [0, 0.35, 0.65, 1],
    ).createShader(rect);
    canvas.save();
    canvas.clipRRect(rrect);
    canvas.drawRRect(
      rrect.deflate(1),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..shader = shader
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
    canvas.restore();
    canvas.drawRRect(
      rrect.deflate(0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..shader = shader,
    );
  }

  @override
  bool shouldRepaint(covariant _LensRimPainter old) =>
      old.vis != vis || old.radius != radius;
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
