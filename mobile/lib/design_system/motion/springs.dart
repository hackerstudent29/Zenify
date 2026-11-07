import 'dart:math' as math;

import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Motion system modelled on Apple's "Designing Fluid Interfaces" principles
/// and the spring presets used across iOS / Apple Music.
///
/// Rules:
///  1. Every animation is a spring, or follows the finger and is settled by one.
///  2. Springs keep the velocity of an interrupted animation (redirectable).
///  3. Beyond-bounds drags use rubber banding, never a hard clamp.
///  4. Release decisions use *projected* position, not raw position.
class Springs {
  Springs._();

  // ---- Presets (SwiftUI .smooth / .standard / .snappy / .bouncy) ----------
  static const smooth = SpringDescription(mass: 1, stiffness: 158, damping: 25.1);
  static const standard = SpringDescription(mass: 1, stiffness: 158, damping: 20.7);
  static const snappy = SpringDescription(mass: 1, stiffness: 439, damping: 35.6);
  static const bouncy = SpringDescription(mass: 1, stiffness: 158, damping: 16.3);

  // ---- Semantic presets for a music player --------------------------------
  /// Now Playing sheet presenting / dismissing.
  static final SpringDescription sheet = fromResponse(response: 0.44, dampingFraction: 0.92);

  /// Finger-following elements (scrubber thumb, volume knob, drag handles).
  static final SpringDescription interactive = fromResponse(response: 0.15, dampingFraction: 0.86);

  /// Artwork scale when pausing (shrinks) and playing (grows).
  static final SpringDescription artwork = fromResponse(response: 0.45, dampingFraction: 0.75);

  /// Scrubber thickening while touched. Critically damped, no wobble.
  static final SpringDescription scrub = fromResponse(response: 0.25, dampingFraction: 1.0);

  /// Mini player slide-in / queue row reorder settle.
  static final SpringDescription list = fromResponse(response: 0.38, dampingFraction: 0.82);

  /// Sensible tolerance for normalised (0..1) or pixel springs.
  static const Tolerance tolerance = Tolerance(distance: 0.001, velocity: 0.01);

  /// Build a spring the way designers specify it (SwiftUI style).
  /// [response] is the stiffness period in seconds, [dampingFraction] 1 = no overshoot.
  static SpringDescription fromResponse({
    required double response,
    required double dampingFraction,
    double mass = 1.0,
  }) {
    final omega = 2 * math.pi / response;
    return SpringDescription(
      mass: mass,
      stiffness: mass * omega * omega,
      damping: 2 * dampingFraction * mass * omega,
    );
  }

  /// Unbounded controller. Use this (not a bounded one) if the spring may
  /// overshoot, because bounded controllers clamp at lower/upperBound.
  static AnimationController controller(TickerProvider vsync, {double value = 0.0}) =>
      AnimationController.unbounded(vsync: vsync, value: value);
}

/// Non-spring timing, only for opacity/blur style cross-fades.
class AppleCurves {
  AppleCurves._();
  static const Curve fade = Cubic(0.25, 0.1, 0.25, 1.0);
  static const Duration fadeShort = Duration(milliseconds: 180);
  static const Duration fadeMedium = Duration(milliseconds: 320);
  static const Duration fadeLong = Duration(milliseconds: 500);
}

extension SpringAnimationController on AnimationController {
  /// Settle to [target] with a spring. If [velocity] is omitted the current
  /// velocity is carried over so interrupted animations stay fluid.
  TickerFuture springTo(
    double target, {
    SpringDescription spring = Springs.smooth,
    double? velocity,
  }) {
    return animateWith(
      SpringSimulation(spring, value, target, velocity ?? this.velocity, tolerance: Springs.tolerance),
    );
  }
}

/// Apple's rubber band: resistance grows the further you pull past an edge.
class RubberBand {
  RubberBand._();

  static double apply(double offset, double dimension, {double coefficient = 0.55}) {
    if (dimension <= 0) return 0;
    final sign = offset.isNegative ? -1.0 : 1.0;
    final x = offset.abs();
    return sign * (1 - (1 / ((x * coefficient / dimension) + 1))) * dimension;
  }

  /// Clamp [value] into [min]..[max] with rubber banding outside.
  static double clamp(double value, double min, double max, double dimension) {
    if (value < min) return min + apply(value - min, dimension);
    if (value > max) return max + apply(value - max, dimension);
    return value;
  }
}

/// Release logic for draggable sheets (Now Playing, queue, mini player).
class SheetPhysics {
  SheetPhysics._();

  /// iOS UIScrollView deceleration rate.
  static const double decelerationRate = 0.998;

  /// Where a flick would come to rest. [velocity] is in units per second.
  static double project(double velocity, {double rate = decelerationRate}) =>
      (velocity / 1000.0) * rate / (1.0 - rate);

  /// Picks the snap point nearest to the *projected* resting position, so a
  /// fast flick commits even when released near the start.
  static double settleTarget({
    required double progress,
    required double velocity,
    List<double> snapPoints = const [0.0, 1.0],
  }) {
    final projected = progress + project(velocity);
    var best = snapPoints.first;
    var bestDist = double.infinity;
    for (final p in snapPoints) {
      final d = (p - projected).abs();
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }
}

/// iOS-feeling scroll physics: softer, longer spring on overscroll.
class AppleScrollPhysics extends BouncingScrollPhysics {
  const AppleScrollPhysics({super.parent});

  static final SpringDescription _spring =
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 100.0, ratio: 1.1);

  @override
  AppleScrollPhysics applyTo(ScrollPhysics? ancestor) =>
      AppleScrollPhysics(parent: buildParent(ancestor));

  @override
  SpringDescription get spring => _spring;
}

class AppleHaptics {
  AppleHaptics._();
  static void selection() => HapticFeedback.selectionClick();
  static void light() => HapticFeedback.lightImpact();
  static void medium() => HapticFeedback.mediumImpact();
  static void heavy() => HapticFeedback.heavyImpact();
}

/// Apple Music press feedback: shrinks on touch with a snappy spring and
/// releases with a small bounce. Wrap buttons, cards, rows and artwork.
class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.pressedScale = 0.96,
    this.haptic = false,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double pressedScale;
  final bool haptic;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> with SingleTickerProviderStateMixin {
  late final AnimationController _c = Springs.controller(this, value: 1.0);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _down() => _c.springTo(widget.pressedScale, spring: Springs.snappy);
  void _up() => _c.springTo(1.0, spring: Springs.bouncy);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _down(),
      onTapUp: (_) => _up(),
      onTapCancel: _up,
      onTap: widget.onTap == null
          ? null
          : () {
              if (widget.haptic) AppleHaptics.light();
              widget.onTap!();
            },
      onLongPress: widget.onLongPress,
      child: AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) => Transform.scale(scale: _c.value, child: child),
      ),
    );
  }
}

/// Implicitly animates a double to [value] with a spring (like AnimatedScale,
/// but physical and velocity preserving).
///
/// Example, artwork that shrinks on pause:
/// ```dart
/// SpringValue(
///   value: player.isPlaying ? 1.0 : 0.86,
///   spring: Springs.artwork,
///   builder: (_, v, child) => Transform.scale(scale: v, child: child),
///   child: artwork,
/// )
/// ```
class SpringValue extends StatefulWidget {
  const SpringValue({
    super.key,
    required this.value,
    required this.builder,
    this.spring = Springs.smooth,
    this.child,
  });

  final double value;
  final SpringDescription spring;
  final Widget? child;
  final Widget Function(BuildContext context, double value, Widget? child) builder;

  @override
  State<SpringValue> createState() => _SpringValueState();
}

class _SpringValueState extends State<SpringValue> with SingleTickerProviderStateMixin {
  late final AnimationController _c = Springs.controller(this, value: widget.value);

  @override
  void didUpdateWidget(SpringValue old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) _c.springTo(widget.value, spring: widget.spring);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (ctx, child) => widget.builder(ctx, _c.value, child),
    );
  }
}