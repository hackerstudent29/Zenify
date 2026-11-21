import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/cupertino.dart' show CupertinoIcons;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../services/glass_engine.dart';
import 'pressable_scale.dart';

/// Apple Music accent (the rose-red used for the selected tab + search).
const Color kAppleRed = Color(0xFFFA2D48);

// ═════════════════════════════════════════════════════════════════════════════
//  CONFIG  — only what matters:
//    mode   : glass | solid (static grey / black / white, zero glass effects)
//    style  : 0 = frosted  …  1 = liquid   (one slider drives the whole look)
//    then blur / transparency / saturation / edge light / refraction / shadow
// ═════════════════════════════════════════════════════════════════════════════
enum GlassMode { glass, solid }

enum GlassTone { clear, dark, light }

class GlassSolids {
  static const ids = <String, (String, Color)>{
    'grey': ('Grey', Color(0xFF2C2C2E)),
    'black': ('Black', Color(0xFF0B0B0D)),
    'white': ('White', Color(0xFFF2F2F7)),
  };
}

class GlassTints {
  static const ids = <String, (String, Color?)>{
    'none': ('None', null),
    'rose': ('Rose', Color(0xFFFA2D48)),
    'orange': ('Orange', Color(0xFFFF9F0A)),
    'yellow': ('Yellow', Color(0xFFFFD60A)),
    'green': ('Green', Color(0xFF30D158)),
    'mint': ('Mint', Color(0xFF63E6E2)),
    'blue': ('Blue', Color(0xFF0A84FF)),
    'purple': ('Purple', Color(0xFFBF5AF2)),
  };
}

class LiquidGlassConfig {
  GlassMode mode = GlassMode.glass;
  String solidId = 'grey';
  GlassTone tone = GlassTone.clear;
  String tintId = 'none';
  double tintStrength = .4;

  double style = .8; // 0 frosted … 1 liquid
  double blur = 10; // 0..40
  double saturation = 1.8; // 1..2.4
  double opacity = .12; // 0..1 fill amount
  double refraction = .7; // edge lens glow 0..1
  double rim = .6; // edge light 0..1 (0 = no edge line at all)
  double depth = .4; // shadow 0..1

  LiquidGlassConfig() {
    applyStyle(style);
  }

  /// Moves the whole look along frosted → liquid.
  void applyStyle(double v) {
    style = v.clamp(0.0, 1.0);
    blur = ui.lerpDouble(30, 8, style)!;
    saturation = ui.lerpDouble(1.25, 1.85, style)!;
    opacity = ui.lerpDouble(.26, .10, style)!;
    refraction = ui.lerpDouble(.10, .85, style)!;
    rim = ui.lerpDouble(.25, .70, style)!;
  }

  bool get isSolid => mode == GlassMode.solid;
  Color get solidColor =>
      GlassSolids.ids[solidId]?.$2 ?? const Color(0xFF2C2C2E);
  Color? get tintColor => GlassTints.ids[tintId]?.$2;

  /// Fill color of the glass body.
  Color get glassFill {
    switch (tone) {
      case GlassTone.clear:
        return Colors.white.withValues(alpha: (opacity * .5).clamp(0.0, 1.0));
      case GlassTone.dark:
        return const Color(
          0xFF16161A,
        ).withValues(alpha: (opacity * 2.2).clamp(0.0, .9));
      case GlassTone.light:
        return Colors.white.withValues(alpha: (opacity * 2.6).clamp(0.0, .9));
    }
  }

  bool get lightSurface =>
      isSolid ? solidId == 'white' : (tone == GlassTone.light && opacity > .15);

  /// Icon / text color that stays readable on this surface.
  Color get foreground => lightSurface ? const Color(0xFF1C1C1E) : Colors.white;

  Map<String, dynamic> toJson() => {
    'mode': mode.name,
    'solidId': solidId,
    'tone': tone.name,
    'tintId': tintId,
    'tintStrength': tintStrength,
    'style': style,
    'blur': blur,
    'saturation': saturation,
    'opacity': opacity,
    'refraction': refraction,
    'rim': rim,
    'depth': depth,
  };

  factory LiquidGlassConfig.fromJson(Map<String, dynamic> j) {
    final c = LiquidGlassConfig();
    double d(String k, double f) => (j[k] as num?)?.toDouble() ?? f;
    c.mode = GlassMode.values.asNameMap()[j['mode']] ?? c.mode;
    c.tone = GlassTone.values.asNameMap()[j['tone']] ?? c.tone;
    c.solidId = GlassSolids.ids.containsKey(j['solidId'])
        ? j['solidId'] as String
        : c.solidId;
    c.tintId = GlassTints.ids.containsKey(j['tintId'])
        ? j['tintId'] as String
        : c.tintId;
    c.tintStrength = d('tintStrength', c.tintStrength);
    c.style = d('style', c.style);
    c.blur = d('blur', c.blur);
    c.saturation = d('saturation', c.saturation);
    c.opacity = d('opacity', c.opacity);
    c.refraction = d('refraction', c.refraction);
    c.rim = d('rim', c.rim);
    c.depth = d('depth', c.depth);
    return c;
  }

  LiquidGlassConfig clone() => LiquidGlassConfig.fromJson(toJson());
}

class LiquidGlassController extends ChangeNotifier {
  LiquidGlassController._() {
    _load();
  }
  static final instance = LiquidGlassController._();
  static const _key = 'liquid_glass_config_v3';

  LiquidGlassConfig c = LiquidGlassConfig();
  Timer? _debounce;

  Future<void> _load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_key);
      if (raw != null) {
        c = LiquidGlassConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        notifyListeners();
      }
    } catch (_) {}
  }

  void _save() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final p = await SharedPreferences.getInstance();
        await p.setString(_key, jsonEncode(c.toJson()));
      } catch (_) {}
    });
  }

  /// Change any field.
  void edit(void Function(LiquidGlassConfig c) f) {
    f(c);
    notifyListeners();
    _save();
  }

  /// Frosted ↔ Liquid slider.
  void setStyle(double v) => edit((c) => c.applyStyle(v));

  void preset(String id) {
    final n = LiquidGlassConfig();
    switch (id) {
      case 'frosted':
        n.applyStyle(0.05);
      case 'clear':
        n
          ..applyStyle(.6)
          ..opacity = .04
          ..blur = 5
          ..rim = .6;
      default:
        n.applyStyle(.85);
    }
    n.mode = GlassMode.glass;
    c = n;
    try {
      GlassEngine.instance.apply(id);
    } catch (_) {}
    notifyListeners();
    _save();
  }

  void reset() {
    c = LiquidGlassConfig();
    try {
      GlassEngine.instance.reset();
    } catch (_) {}
    notifyListeners();
    _save();
  }
}

void lgHaptic({bool tick = false, int level = 1}) {
  if (tick) {
    HapticFeedback.selectionClick();
    return;
  }
  switch (level) {
    case 0:
      HapticFeedback.selectionClick();
    case 2:
      HapticFeedback.mediumImpact();
    default:
      HapticFeedback.lightImpact();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  RENDERER
//  glass : backdrop blur + saturation boost, soft fill, sheen, inner lens glow,
//          ONE thin specular edge (strength 0 = no edge at all).
//  solid : flat color. No blur, no rim, no sheen.
// ═════════════════════════════════════════════════════════════════════════════
class LiquidGlass extends StatefulWidget {
  const LiquidGlass({
    super.key,
    required this.child,
    this.radius = 20,
    this.borderRadius,
    this.config,
    this.tintColor,
    this.shadow = true,
    this.onTap,
    this.interactive = true,
  });

  final Widget child;
  final double radius;
  final BorderRadius? borderRadius;
  final LiquidGlassConfig? config;
  final Color? tintColor;
  final bool shadow;
  final VoidCallback? onTap;
  final bool interactive;

  @override
  State<LiquidGlass> createState() => _LiquidGlassState();
}

class _LiquidGlassState extends State<LiquidGlass>
    with SingleTickerProviderStateMixin {
  late final AnimationController _press = AnimationController.unbounded(
    vsync: this,
  );

  @override
  void dispose() {
    _press.dispose();
    super.dispose();
  }

  void _to(double v) {
    _press.animateWith(
      SpringSimulation(
        const SpringDescription(mass: 1, stiffness: 380, damping: 20),
        _press.value,
        v,
        _press.velocity,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: LiquidGlassController.instance,
      builder: (context, _) {
        final c = widget.config ?? LiquidGlassController.instance.c;
        final br = widget.borderRadius ?? BorderRadius.circular(widget.radius);

        Widget body;
        if (c.isSolid) {
          body = CustomPaint(
            painter: widget.shadow ? _ShadowPainter(c, br) : null,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: widget.tintColor ?? c.solidColor,
                borderRadius: br,
              ),
              child: widget.child,
            ),
          );
        } else {
          body = CustomPaint(
            painter: widget.shadow ? _ShadowPainter(c, br) : null,
            child: ClipRRect(
              borderRadius: br,
              child: Stack(
                fit: StackFit.passthrough,
                children: [
                  Positioned.fill(
                    child: RepaintBoundary(child: _Backdrop(c)),
                  ),
                  Positioned.fill(
                    child: IgnorePointer(
                      child: CustomPaint(
                        painter: _BodyPainter(c, br, widget.tintColor),
                      ),
                    ),
                  ),
                  widget.child,
                  Positioned.fill(
                    child: IgnorePointer(
                      child: CustomPaint(painter: _EdgePainter(c, br)),
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        Widget out = AnimatedBuilder(
          animation: _press,
          child: body,
          builder: (_, ch) {
            final s = 1 + .03 * _press.value;
            return Transform.scale(scale: s, child: ch);
          },
        );

        if (widget.interactive) {
          out = Listener(
            onPointerDown: (_) => _to(1),
            onPointerUp: (_) => _to(0),
            onPointerCancel: (_) => _to(0),
            child: widget.onTap == null
                ? out
                : GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      lgHaptic();
                      widget.onTap!();
                    },
                    child: out,
                  ),
          );
        }
        return out;
      },
    );
  }
}

/// Blur of whatever sits behind.
class _Backdrop extends StatelessWidget {
  const _Backdrop(this.c);
  final LiquidGlassConfig c;

  @override
  Widget build(BuildContext context) {
    final s = math.max(0.01, c.blur);
    final f = ui.ImageFilter.blur(sigmaX: s, sigmaY: s);
    return RepaintBoundary(
      child: BackdropFilter(filter: f, child: const SizedBox.expand()),
    );
  }
}

class _ShadowPainter extends CustomPainter {
  _ShadowPainter(this.c, this.br);
  final LiquidGlassConfig c;
  final BorderRadius br;

  @override
  void paint(Canvas canvas, Size s) {
    if (c.depth < .01 || s.isEmpty) return;
    final rr = br.toRRect(Offset.zero & s);
    // clip OUT the glass body so shadow never darkens the glass itself
    final outside = Path.combine(
      PathOperation.difference,
      Path()..addRect(Rect.fromLTRB(-200, -200, s.width + 200, s.height + 200)),
      Path()..addRRect(rr),
    );
    canvas.save();
    canvas.clipPath(outside);
    canvas.drawRRect(
      rr.shift(Offset(0, 4 + 8 * c.depth)),
      Paint()
        ..color = Colors.black.withValues(alpha: .30 * c.depth)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, 8 + 16 * c.depth),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ShadowPainter o) => true;
}

class _BodyPainter extends CustomPainter {
  _BodyPainter(this.c, this.br, this.tintOverride);
  final LiquidGlassConfig c;
  final BorderRadius br;
  final Color? tintOverride;

  @override
  void paint(Canvas canvas, Size s) {
    if (s.isEmpty) return;
    final rect = Offset.zero & s;
    final rr = br.toRRect(rect);
    canvas.save();
    canvas.clipRRect(rr);

    // 1. fill
    if (tintOverride != null) {
      canvas.drawRect(rect, Paint()..color = tintOverride!);
    } else {
      canvas.drawRect(rect, Paint()..color = c.glassFill);
      final t = c.tintColor;
      if (t != null) {
        canvas.drawRect(
          rect,
          Paint()..color = t.withValues(alpha: c.tintStrength * .45),
        );
      }
    }

    // 2. sheen: light from top-left, soft shade bottom-right
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: .10 + .10 * c.style),
            Colors.transparent,
            Colors.black.withValues(alpha: .04),
          ],
        ).createShader(rect),
    );

    // 3. inner lens glow just inside the edge (liquid thickness)
    if (c.refraction > .02) {
      canvas.drawRRect(
        rr,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 10
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6)
          ..color = Colors.white.withValues(alpha: .03 + .12 * c.refraction),
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _BodyPainter o) => true;
}

/// ONE thin specular edge. rim = 0 → nothing drawn.
class _EdgePainter extends CustomPainter {
  _EdgePainter(this.c, this.br);
  final LiquidGlassConfig c;
  final BorderRadius br;

  @override
  void paint(Canvas canvas, Size s) {
    if (s.isEmpty || c.rim < .01) return;
    final rect = Offset.zero & s;
    final rr = br.toRRect(rect.deflate(.5));
    final a = c.rim;
    canvas.drawRRect(
      rr,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: .85 * a),
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: .5 * a),
          ],
          stops: const [0, .35, .65, 1],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(covariant _EdgePainter o) => true;
}

// ═════════════════════════════════════════════════════════════════════════════
//  APPLE GLASS  — wrapper used all over the app. Same API as before.
// ═════════════════════════════════════════════════════════════════════════════
class AppleGlass extends StatelessWidget {
  const AppleGlass({
    super.key,
    required this.borderRadius,
    this.child,
    this.blur = 5, // kept for call-site compat, ignored
    this.saturation = 1.7, // kept for call-site compat, ignored
    this.tint,
    this.shadow = true,
    this.overrideFluidity, // ignored
    this.overrideBaseColor, // ignored
    this.overrideBlur,
    this.overrideSpecularRim,
    this.interactive = false,
    this.onTap,
  });

  final BorderRadius borderRadius;
  final Widget? child;
  final double blur;
  final double saturation;
  final Color? tint;
  final bool shadow;
  final double? overrideFluidity;
  final String? overrideBaseColor;
  final double? overrideBlur;
  final bool? overrideSpecularRim;
  final bool interactive;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: LiquidGlassController.instance,
      builder: (context, _) {
        var c = LiquidGlassController.instance.c;
        if (overrideBlur != null || overrideSpecularRim == false) {
          c = c.clone();
          if (overrideBlur != null) c.blur = overrideBlur!;
          if (overrideSpecularRim == false) c.rim = 0;
        }
        final neutral =
            tint == null ||
            tint == const Color(0x0F101014) ||
            tint == const Color(0x26121216) ||
            tint == const Color(0x30121216);
        return LiquidGlass(
          borderRadius: borderRadius,
          config: c,
          tintColor: neutral ? null : tint,
          shadow: shadow,
          interactive: interactive,
          onTap: onTap,
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  APPLE DOCK  — floating tab pill (selection capsule) + detached search circle
// ═════════════════════════════════════════════════════════════════════════════
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
    this.height = 54,
    this.searchExpanded = false,
    this.onSearchTap,
    this.onBack,
    this.dockProgress = 1.0,
    this.onRestoreDockTap,
    this.onExploreTap,
  });

  final int index;
  final ValueChanged<int> onSelect;
  final double height;
  final bool searchExpanded;
  final VoidCallback? onSearchTap;
  final VoidCallback? onBack;
  final double dockProgress;
  final VoidCallback? onRestoreDockTap;
  final VoidCallback? onExploreTap;

  @override
  State<AppleDock> createState() => _AppleDockState();
}

class _AppleDockState extends State<AppleDock> with TickerProviderStateMixin {
  static const _items = [
    _DockSpec('Home', CupertinoIcons.house_fill),
    _DockSpec('Atlas', CupertinoIcons.globe),
    _DockSpec('Library', CupertinoIcons.music_albums_fill),
  ];
  static const _inset = 4.0;
  static const _count = 3;
  static const _spring = SpringDescription(
    mass: 1,
    stiffness: 380,
    damping: 27,
  );
  static const _soft = SpringDescription(mass: 1, stiffness: 300, damping: 30);

  late final AnimationController _pos = AnimationController.unbounded(
    vsync: this,
    value: widget.index < _count ? widget.index.toDouble() : 0,
  );
  late final AnimationController _sel = AnimationController.unbounded(
    vsync: this,
    value: widget.index < _count ? 1 : 0,
  );
  late final AnimationController _lens = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  late final AnimationController _exp = AnimationController.unbounded(
    vsync: this,
    value: widget.searchExpanded ? 1 : 0,
  );

  double _itemW = 1;
  bool _dragging = false;
  int _near = 0;

  @override
  void dispose() {
    _pos.dispose();
    _sel.dispose();
    _lens.dispose();
    _exp.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant AppleDock old) {
    super.didUpdateWidget(old);
    if (old.searchExpanded != widget.searchExpanded) {
      _springTo(_exp, widget.searchExpanded ? 1 : 0, spring: _soft);
    }
    if (old.index != widget.index && !_dragging) {
      if (widget.index < _count) {
        if (_sel.value < .05) _pos.value = widget.index.toDouble();
        _springTo(_pos, widget.index.toDouble());
        _springTo(_sel, 1, spring: _soft);
      } else {
        _springTo(_sel, 0, spring: _soft);
      }
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

  int _indexAt(double dx) =>
      ((dx - _inset) / _itemW).floor().clamp(0, _count - 1);

  double _fingerPos(double dx) {
    final raw = (dx - _inset) / _itemW - .5;
    if (raw < 0) return raw * .35;
    if (raw > _count - 1) return (_count - 1) + (raw - (_count - 1)) * .35;
    return raw;
  }

  void _tapAt(double dx) {
    final i = _indexAt(dx);
    if (i != widget.index) HapticFeedback.selectionClick();
    _springTo(_pos, i.toDouble());
    _springTo(_sel, 1, spring: _soft);
    widget.onSelect(i);
  }

  void _dragStart(DragStartDetails d) {
    _dragging = true;
    HapticFeedback.mediumImpact();
    _near = _indexAt(d.localPosition.dx);
    if (_sel.value < .5) _pos.value = _near.toDouble();
    _springTo(_sel, 1, spring: _soft);
    _springTo(_lens, 1, spring: _soft);
  }

  void _dragUpdate(DragUpdateDetails d) {
    if (!_dragging) return;
    final t = _fingerPos(d.localPosition.dx).clamp(-.35, _count - .65);
    _pos.value = _pos.value + (t - _pos.value) * .6;
    final n = _pos.value.round().clamp(0, _count - 1);
    if (n != _near) {
      _near = n;
      HapticFeedback.selectionClick();
    }
  }

  void _dragEnd(DragEndDetails d) {
    if (!_dragging) return;
    _dragging = false;
    final v = d.velocity.pixelsPerSecond.dx / _itemW;
    final target = (_pos.value + v * .08).round().clamp(0, _count - 1);
    _springTo(_pos, target.toDouble(), velocity: v);
    _springTo(_lens, 0, spring: _soft);
    if (target != widget.index) widget.onSelect(target);
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.height;
    final dp = widget.dockProgress.clamp(0.0, 1.0);
    return SizedBox(
      height: h,
      child: LayoutBuilder(
        builder: (context, box) {
          const gap = 8.0;
          final total = box.maxWidth;
          final fullPill = total - gap - h;
          return AnimatedBuilder(
            animation: _exp,
            builder: (_, _) {
              final rawE = _exp.value.clamp(0.0, 1.0);
              final effE = rawE * dp;
              final normalPillW = ui.lerpDouble(h, fullPill, dp)!;
              final pillW = ui.lerpDouble(normalPillW, h, effE)!;
              final searchW = effE > .01 ? (total - gap - pillW) : h;
              return Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  SizedBox(
                    width: pillW,
                    height: h,
                    child: _pill(h, fullPill, effE, rawE, dp),
                  ),
                  SizedBox(width: searchW, height: h, child: _search(h, effE)),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Widget _pill(double h, double fullW, double e, double rawE, double dp) {
    return AppleGlass(
      borderRadius: BorderRadius.circular(h / 2),
      interactive: false,
      child: Stack(
        children: [
          if (dp > .05 && rawE < .95)
            IgnorePointer(
              ignoring: rawE > .02 || dp < .6,
              child: Opacity(
                opacity: (dp * (1 - rawE * 1.8)).clamp(0.0, 1.0),
                child: OverflowBox(
                  alignment: Alignment.centerLeft,
                  minWidth: fullW,
                  maxWidth: fullW,
                  child: SizedBox(width: fullW, height: h, child: _tabs(h)),
                ),
              ),
            ),
          if (dp < .95)
            Positioned.fill(
              child: Opacity(
                opacity: ((1 - dp * 1.8) * (1 - e * 1.2)).clamp(0.0, 1.0),
                child: IgnorePointer(
                  ignoring: dp >= .6,
                  child: PressableScale(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      (widget.onRestoreDockTap ?? widget.onExploreTap)?.call();
                    },
                    child: const Center(
                      child: Icon(
                        Icons.grid_view_rounded,
                        size: 23,
                        color: kAppleRed,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          if (e > .02)
            Positioned.fill(
              child: IgnorePointer(
                ignoring: dp < .6 || e < .5,
                child: Opacity(
                  opacity: (((e - .45) / .55) * dp).clamp(0.0, 1.0),
                  child: PressableScale(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      widget.onBack?.call();
                    },
                    child: Center(
                      child: Icon(
                        CupertinoIcons.chevron_back,
                        size: 24,
                        color: LiquidGlassController.instance.c.foreground,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _tabs(double h) {
    return LayoutBuilder(
      builder: (context, box) {
        _itemW = (box.maxWidth - _inset * 2) / _count;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapUp: (d) => _tapAt(d.localPosition.dx),
          onHorizontalDragStart: _dragStart,
          onHorizontalDragUpdate: _dragUpdate,
          onHorizontalDragEnd: _dragEnd,
          onHorizontalDragCancel: () {
            _dragging = false;
            _springTo(_lens, 0, spring: _soft);
            _springTo(_pos, math.min(widget.index, _count - 1).toDouble());
          },
          child: Padding(
            padding: const EdgeInsets.all(_inset),
            child: Stack(
              children: [
                // selection capsule — always under the active tab
                Positioned.fill(
                  child: AnimatedBuilder(
                    animation: Listenable.merge([_pos, _sel, _lens]),
                    builder: (_, _) {
                      final vis = _sel.value.clamp(0.0, 1.0);
                      if (vis < .01) return const SizedBox.shrink();
                      final grow = 1 + .08 * _lens.value.clamp(0.0, 1.0);
                      return Align(
                        alignment: Alignment.centerLeft,
                        child: Transform.translate(
                          offset: Offset(_pos.value * _itemW, 0),
                          child: Transform.scale(
                            scale: grow,
                            child: _Capsule(
                              width: _itemW,
                              height: h - _inset * 2,
                              vis: vis,
                              press: _lens.value.clamp(0.0, 1.0),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                Row(
                  children: [
                    for (int i = 0; i < _count; i++) Expanded(child: _item(i)),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _search(double h, double e) {
    final selected = widget.index == 3;
    final expanded = widget.searchExpanded;
    return PressableScale(
      onTap: () {
        HapticFeedback.selectionClick();
        expanded ? widget.onSearchTap?.call() : widget.onSelect(3);
      },
      child: AppleGlass(
        borderRadius: BorderRadius.circular(h / 2),
        interactive: false,
        child: ListenableBuilder(
          listenable: LiquidGlassController.instance,
          builder: (context, _) {
            final fg = LiquidGlassController.instance.c.foreground;
            return SizedBox(
              height: h,
              child: Padding(
                padding: EdgeInsets.only(left: 20 * e),
                child: Align(
                  alignment: Alignment(-e, 0),
                  child: ClipRect(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          CupertinoIcons.search,
                          size: ui.lerpDouble(26, 20, e)!,
                          color: (selected || expanded)
                              ? kAppleRed
                              : fg.withValues(alpha: .95),
                        ),
                        if (e > .25) ...[
                          const SizedBox(width: 8),
                          Flexible(
                            child: Opacity(
                              opacity: ((e - .4) / .6).clamp(0.0, 1.0),
                              child: Text(
                                'Search songs, artists, albums',
                                maxLines: 1,
                                softWrap: false,
                                overflow: TextOverflow.clip,
                                style: TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 16,
                                  fontWeight: FontWeight.w500,
                                  color: fg.withValues(alpha: .65),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _item(int i) {
    final spec = _items[i];
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: Listenable.merge([
          _pos,
          _sel,
          LiquidGlassController.instance,
        ]),
        builder: (_, _) {
          final fg = LiquidGlassController.instance.c.foreground;
          final sel = _sel.value.clamp(0.0, 1.0);
          final prox = (1 - (_pos.value - i).abs()).clamp(0.0, 1.0) * sel;
          final color = Color.lerp(
            fg.withValues(alpha: .85),
            kAppleRed,
            Curves.easeOut.transform(prox),
          )!;
          return Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(spec.icon, size: 24, color: color),
              const SizedBox(height: 3),
              Text(
                spec.label,
                maxLines: 1,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 10.5,
                  height: 1.2,
                  fontWeight: FontWeight.w600,
                  letterSpacing: .1,
                  color: color,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Soft translucent capsule behind the active tab (iOS 26 look).
class _Capsule extends StatelessWidget {
  const _Capsule({
    required this.width,
    required this.height,
    required this.vis,
    required this.press,
  });
  final double width, height, vis, press;

  @override
  Widget build(BuildContext context) {
    final c = LiquidGlassController.instance.c;
    final base = c.lightSurface ? Colors.black : Colors.white;
    final r = BorderRadius.circular(height / 2);
    return SizedBox(
      width: width,
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: r,
          color: base.withValues(alpha: (.12 + .10 * press) * vis),
          boxShadow: press > .01
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: .18 * press),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: c.isSolid || c.rim < .01
            ? null
            : CustomPaint(
                foregroundPainter: _CapsuleRim(
                  r,
                  vis * c.rim * (.5 + .5 * press),
                ),
              ),
      ),
    );
  }
}

class _CapsuleRim extends CustomPainter {
  _CapsuleRim(this.r, this.a);
  final BorderRadius r;
  final double a;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRRect(
      r.toRRect(rect).deflate(.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: .7 * a),
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: .4 * a),
          ],
          stops: const [0, .5, 1],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(covariant _CapsuleRim o) => o.a != a || o.r != r;
}

/// Fades the right edge of single-line text.
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
