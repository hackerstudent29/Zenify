import 'dart:math' as math;

import 'package:flutter/animation.dart';
import 'package:flutter/physics.dart';

/// Zenify's canonical damped spring (same numbers as design_system/motion/springs).
const SpringDescription kAtlasSpring = SpringDescription(
  mass: 1,
  stiffness: 380,
  damping: 27,
);

/// No-overshoot variant for sheets and anything that must not exceed its bounds.
final SpringDescription kAtlasSpringSmooth = SpringDescription.withDampingRatio(
  mass: 1,
  stiffness: 380,
  ratio: 1.0,
);

/// Lets Material routes / sheets use spring physics as a Curve.
class SpringCurve extends Curve {
  const SpringCurve();
  static const double _seconds = 0.65;

  @override
  double transformInternal(double t) =>
      _sim.x(t * _seconds).clamp(0.0, 1.2).toDouble();

  static final SpringSimulation _sim = SpringSimulation(
    kAtlasSpringSmooth,
    0,
    1,
    0,
  );
}

/// Allocation-free scalar spring for the per-frame globe loop.
class Spring1D {
  Spring1D(this.value, {this.stiffness = 380, this.damping = 27})
    : target = value;

  double value;
  double target;
  double velocity = 0;
  final double stiffness;
  final double damping;

  bool get settled => (value - target).abs() < 0.002 && velocity.abs() < 0.002;

  void snapTo(double v) {
    value = v;
    target = v;
    velocity = 0;
  }

  void step(double dt) {
    if (settled) {
      value = target;
      velocity = 0;
      return;
    }
    var left = dt;
    const h = 1 / 240;
    while (left > 0) {
      final s = math.min(h, left);
      final a = -stiffness * (value - target) - damping * velocity;
      velocity += a * s;
      value += velocity * s;
      left -= s;
    }
  }
}

/// Fast, firm spring for press-down (no overshoot).
final SpringDescription kAtlasPressSpring = SpringDescription.withDampingRatio(
  mass: 1,
  stiffness: 900,
  ratio: 1.0,
);

/// Gentle overshoot for popovers appearing.
final SpringDescription kAtlasPopSpring = SpringDescription.withDampingRatio(
  mass: 1,
  stiffness: 420,
  ratio: 0.78,
);
