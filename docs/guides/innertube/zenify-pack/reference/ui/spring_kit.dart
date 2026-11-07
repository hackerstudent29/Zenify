// lib/design_system/widgets/spring_kit.dart
//
// Shared motion + chrome used by Explore, Library and the screens to come.
// Rule of this file: every value that moves is either scroll-driven (1:1 with
// the finger) or settled by a spring that inherits the current velocity.

import 'dart:async';
import 'dart:ui' show ImageFilter, lerpDouble;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import '../tokens/app_colors.dart';
import '../tokens/app_typography.dart';
import 'pressable_scale.dart';

/// Apple-style springs as Flutter SpringDescriptions
/// (mass 1, stiffness (2π/response)², damping 4πζ/response).
class Springs {
  Springs._();
  static const smooth = SpringDescription(mass: 1, stiffness: 158, damping: 25.1);
  static const standard = SpringDescription(mass: 1, stiffness: 158, damping: 20.7);
  static const snappy = SpringDescription(mass: 1, stiffness: 439, damping: 35.6);
  static const bouncy = SpringDescription(mass: 1, stiffness: 158, damping: 16.3);
}

/// Animates [controller] to [target] with [spring], carrying current velocity.
void springTo(AnimationController controller, double target,
    [SpringDescription spring = Springs.smooth]) {
  controller.animateWith(
      SpringSimulation(spring, controller.value, target, controller.velocity));
}

// ---------------------------------------------------------------------------
// SpringIn: one-shot entrance (fade + rise with a small settle)
// ---------------------------------------------------------------------------

class SpringIn extends StatefulWidget {
  const SpringIn({super.key, this.delayMs = 0, this.rise = 28, required this.child});
  final int delayMs;
  final double rise;
  final Widget child;

  @override
  State<SpringIn> createState() => _SpringInState();
}

class _SpringInState extends State<SpringIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController.unbounded(vsync: this, value: 0);
  Timer? _timer;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = 1;
      return;
    }
    _timer = Timer(Duration(milliseconds: widget.delayMs), () {
      if (mounted) _c.animateWith(SpringSimulation(Springs.smooth, 0, 1, 0));
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) {
          final v = _c.value;
          return Opacity(
            opacity: v.clamp(0.0, 1.0).toDouble(),
            child: Transform.translate(
                offset: Offset(0, (1 - v) * widget.rise), child: child),
          );
        },
      );
}

// ---------------------------------------------------------------------------
// SpringReveal: spring-driven collapse/expand of a block (height + fade).
// The child stays mounted so its state survives being hidden.
// ---------------------------------------------------------------------------

class SpringReveal extends StatefulWidget {
  const SpringReveal({super.key, required this.visible, required this.child});
  final bool visible;
  final Widget child;

  @override
  State<SpringReveal> createState() => _SpringRevealState();
}

class _SpringRevealState extends State<SpringReveal>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
      vsync: this, value: widget.visible ? 1 : 0);

  @override
  void didUpdateWidget(covariant SpringReveal old) {
    super.didUpdateWidget(old);
    if (old.visible == widget.visible) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = widget.visible ? 1 : 0;
    } else {
      springTo(_c, widget.visible ? 1 : 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) {
          final v = _c.value.clamp(0.0, 1.0).toDouble();
          return IgnorePointer(
            ignoring: !widget.visible,
            child: ClipRect(
              child: Align(
                alignment: Alignment.topCenter,
                heightFactor: v,
                child: Opacity(opacity: v, child: child),
              ),
            ),
          );
        },
      );
}

// ---------------------------------------------------------------------------
// SpringPop: bouncy scale/fade in and out (clear buttons, badges)
// ---------------------------------------------------------------------------

class SpringPop extends StatefulWidget {
  const SpringPop({super.key, required this.visible, required this.child});
  final bool visible;
  final Widget child;

  @override
  State<SpringPop> createState() => _SpringPopState();
}

class _SpringPopState extends State<SpringPop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
      vsync: this, value: widget.visible ? 1 : 0);

  @override
  void didUpdateWidget(covariant SpringPop old) {
    super.didUpdateWidget(old);
    if (old.visible != widget.visible) {
      springTo(_c, widget.visible ? 1 : 0, Springs.bouncy);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) => IgnorePointer(
          ignoring: !widget.visible,
          child: Opacity(
            opacity: _c.value.clamp(0.0, 1.0).toDouble(),
            child: Transform.scale(
                scale: _c.value.clamp(0.0, 1.2).toDouble(), child: child),
          ),
        ),
      );
}

// ---------------------------------------------------------------------------
// SpringIconSegmented: iOS segmented control, thumb slides on a spring
// ---------------------------------------------------------------------------

class SpringIconSegmented extends StatefulWidget {
  const SpringIconSegmented({
    super.key,
    required this.icons,
    required this.index,
    required this.onChanged,
    this.segmentWidth = 46,
    this.height = 32,
  });
  final List<IconData> icons;
  final int index;
  final ValueChanged<int> onChanged;
  final double segmentWidth;
  final double height;

  @override
  State<SpringIconSegmented> createState() => _SpringIconSegmentedState();
}

class _SpringIconSegmentedState extends State<SpringIconSegmented>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController.unbounded(vsync: this, value: widget.index.toDouble());

  @override
  void didUpdateWidget(covariant SpringIconSegmented old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index) {
      springTo(_c, widget.index.toDouble(), Springs.snappy);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.icons.length;
    final w = widget.segmentWidth;
    return Container(
      width: w * n + 4,
      height: widget.height,
      padding: const EdgeInsets.all(2),
      decoration: ShapeDecoration(
        shape: ContinuousRectangleBorder(
            borderRadius: BorderRadius.circular(widget.height * 0.6)),
        color: const Color(0xFF2C2C2E),
      ),
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, __) => Stack(
          children: [
            Positioned(
              left: _c.value * w,
              width: w,
              top: 0,
              bottom: 0,
              child: DecoratedBox(
                decoration: ShapeDecoration(
                  shape: ContinuousRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(widget.height * 0.5)),
                  color: const Color(0xFF636366),
                  shadows: const [
                    BoxShadow(
                        color: Color(0x55000000),
                        blurRadius: 6,
                        offset: Offset(0, 2)),
                  ],
                ),
              ),
            ),
            Row(
              children: [
                for (var i = 0; i < n; i++)
                  SizedBox(
                    width: w,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        if (i == widget.index) return;
                        HapticFeedback.selectionClick();
                        widget.onChanged(i);
                      },
                      child: Center(
                        child: Icon(
                          widget.icons[i],
                          size: 18,
                          color: Color.lerp(
                              Colors.white60,
                              Colors.white,
                              (1 - (_c.value - i).abs())
                                  .clamp(0.0, 1.0)
                                  .toDouble()),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Collapsing large title -> frosted centered bar (scroll-driven)
// ---------------------------------------------------------------------------

class CollapsingTitleDelegate extends SliverPersistentHeaderDelegate {
  CollapsingTitleDelegate({
    required this.topInset,
    required this.title,
    this.actionsBuilder,
  });

  final double topInset;
  final String title;

  /// Right-side actions. Receives the current control size (36 -> 30) and the
  /// collapse progress t (0 expanded, 1 collapsed).
  final List<Widget> Function(double size, double t)? actionsBuilder;

  static const _expanded = 96.0;
  static const _collapsed = 44.0;

  @override
  double get maxExtent => topInset + _expanded;
  @override
  double get minExtent => topInset + _collapsed;

  @override
  bool shouldRebuild(covariant CollapsingTitleDelegate old) =>
      old.topInset != topInset || old.title != title;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final t =
        (shrinkOffset / (maxExtent - minExtent)).clamp(0.0, 1.0).toDouble();
    final size = lerpDouble(36, 30, t)!;
    final actions = actionsBuilder?.call(size, t) ?? const <Widget>[];

    return Stack(
      clipBehavior: Clip.none,
      children: [
        if (t > 0.01)
          Positioned.fill(
            child: ClipRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
                child: ColoredBox(
                    color: AppColors.bg.withValues(alpha: 0.72 * t)),
              ),
            ),
          ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          height: 0.5,
          child: ColoredBox(color: Colors.white.withValues(alpha: 0.10 * t)),
        ),
        Padding(
          padding: EdgeInsets.only(
            top: topInset,
            left: lerpDouble(20, 0, t)!,
            bottom: lerpDouble(10, 12, t)!,
          ),
          child: Align(
            alignment: Alignment.lerp(
                Alignment.bottomLeft, Alignment.bottomCenter, t)!,
            child: Text(
              title,
              style: AppTypography.largeTitle.copyWith(
                fontSize: lerpDouble(34, 17, t)!,
                fontWeight: FontWeight.lerp(FontWeight.w700, FontWeight.w600, t),
                letterSpacing: lerpDouble(-0.6, -0.4, t)!,
                color: Colors.white,
              ),
            ),
          ),
        ),
        if (actions.isNotEmpty)
          Positioned(
            right: 20,
            bottom: lerpDouble(8, 7, t)!,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(width: 10),
                  actions[i],
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class ProfileAvatarButton extends StatelessWidget {
  const ProfileAvatarButton({super.key, required this.size, this.onTap});
  final double size;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        onTap: onTap ?? () {},
        child: Container(
          width: size,
          height: size,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFE11D48), Color(0xFF831843)],
            ),
          ),
          child: Icon(Icons.person_rounded,
              size: size * 0.58, color: Colors.white),
        ),
      );
}

// ---------------------------------------------------------------------------
// SquircleArtwork: continuous-corner artwork, decoded at display size
// ---------------------------------------------------------------------------

class SquircleArtwork extends StatelessWidget {
  const SquircleArtwork({
    super.key,
    required this.url,
    required this.size,
    required this.radius,
    this.overlay,
  });
  final String? url;
  final double size;
  final double radius; // design radius; doubled for the squircle curve
  final Widget? overlay; // should be a Positioned

  @override
  Widget build(BuildContext context) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    const placeholder = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3A3A3C), Color(0xFF2C2C2E)],
        ),
      ),
      child: Center(
        child: Icon(Icons.music_note_rounded, size: 24, color: Colors.white24),
      ),
    );

    return SizedBox(
      width: size,
      height: size,
      child: ClipPath(
        clipper: ShapeBorderClipper(
          shape: ContinuousRectangleBorder(
              borderRadius: BorderRadius.circular(radius * 2)),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            placeholder,
            if (url != null && url!.isNotEmpty)
              Image.network(
                url!,
                fit: BoxFit.cover,
                cacheWidth: (size * dpr).round(),
                gaplessPlayback: true,
                frameBuilder: (_, child, frame, sync) => AnimatedOpacity(
                  opacity: (sync || frame != null) ? 1 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: child,
                ),
                errorBuilder: (_, __, ___) => placeholder,
              ),
            if (overlay != null) overlay!,
          ],
        ),
      ),
    );
  }
}
