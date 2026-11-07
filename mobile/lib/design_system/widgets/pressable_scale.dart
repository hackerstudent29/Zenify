import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import '../motion/springs.dart';

/// Every tappable widget wraps its content in PressableScale for spring feedback.
class PressableScale extends StatefulWidget {
  const PressableScale({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.scale = 0.96,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double scale;

  @override
  State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);

  void _spring(double to) {
    if (!mounted) return;
    _c.animateWith(SpringSimulation(Springs.snappy, _c.value, to, _c.velocity));
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    behavior: HitTestBehavior.opaque,
    onTapDown: (_) => _spring(widget.scale),
    onTapUp: (_) {
      _spring(1);
      try {
        HapticFeedback.lightImpact();
      } catch (_) {}
      widget.onTap?.call();
    },
    onTapCancel: () => _spring(1),
    onLongPress: widget.onLongPress,
    child: AnimatedBuilder(
      animation: _c,
      builder: (_, child) => Transform.scale(scale: _c.value.clamp(0.8, 1.2), child: child),
      child: widget.child,
    ),
  );
}

