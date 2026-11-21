import 'package:flutter/physics.dart';
import 'package:flutter/widgets.dart';

import '../core/spring.dart';

/// Springs a child in (scale + fade) from [alignment]. Re-key to replay.
class SpringIn extends StatefulWidget {
  const SpringIn({
    super.key,
    required this.child,
    this.alignment = Alignment.center,
    this.from = 0.8,
  });

  final Widget child;
  final Alignment alignment;
  final double from;

  @override
  State<SpringIn> createState() => _SpringInState();
}

class _SpringInState extends State<SpringIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );

  @override
  void initState() {
    super.initState();
    _c.animateWith(SpringSimulation(kAtlasPopSpring, 0, 1, 0));
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
      child: RepaintBoundary(child: widget.child),
      builder: (_, child) {
        final v = _c.value;
        final op = (v * 2).clamp(0.0, 1.0);
        final s = widget.from + (1 - widget.from) * v;
        final scaled = Transform.scale(
          alignment: widget.alignment,
          scale: s,
          child: child,
        );
        return op >= 1 ? scaled : Opacity(opacity: op, child: scaled);
      },
    );
  }
}
