import 'package:flutter/physics.dart';
import 'package:flutter/widgets.dart';

import '../core/haptics.dart';
import '../core/spring.dart';

/// Spring press-scale + light haptic.
class AtlasPress extends StatefulWidget {
  const AtlasPress({
    super.key,
    required this.child,
    this.onTap,
    this.scale = 0.96,
    this.haptic = true,
  });

  final Widget child;
  final VoidCallback? onTap;
  final double scale;
  final bool haptic;

  @override
  State<AtlasPress> createState() => _AtlasPressState();
}

class _AtlasPressState extends State<AtlasPress>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 1,
  );

  void _to(double v, SpringDescription s) =>
      _c.animateWith(SpringSimulation(s, _c.value, v, _c.velocity));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: enabled ? (_) => _to(widget.scale, kAtlasPressSpring) : null,
      onTapUp: enabled ? (_) => _to(1, kAtlasSpring) : null,
      onTapCancel: enabled ? () => _to(1, kAtlasSpring) : null,
      onTap: enabled
          ? () {
              if (widget.haptic) H.tap();
              widget.onTap!();
            }
          : null,
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, child) => Transform.scale(scale: _c.value, child: child),
        child: widget.child,
      ),
    );
  }
}
