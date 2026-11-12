import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/dock_visibility.dart';
import 'player_kit.dart';

/// Pushes a glass bottom sheet that opens with a real spring curve.
Future<T?> showGlassSheet<T>(BuildContext context, {required WidgetBuilder builder}) {
  return DockVisibility.runModal(
    () => Navigator.of(context, rootNavigator: true).push<T>(GlassSheetRoute<T>(builder: builder)),
  );
}

class GlassSheetRoute<T> extends PopupRoute<T> {
  GlassSheetRoute({required this.builder});
  final WidgetBuilder builder;

  @override
  Color? get barrierColor => Colors.black.withValues(alpha: 0.38);
  @override
  bool get barrierDismissible => true;
  @override
  String? get barrierLabel => 'Dismiss';
  @override
  Duration get transitionDuration => const Duration(milliseconds: 440);
  @override
  Duration get reverseTransitionDuration => const Duration(milliseconds: 320);

  @override
  Widget buildPage(BuildContext context, Animation<double> animation, Animation<double> secondary) {
    return Align(alignment: Alignment.bottomCenter, child: builder(context));
  }

  @override
  Widget buildTransitions(BuildContext context, Animation<double> animation,
      Animation<double> secondaryAnimation, Widget child) {
    final curved = CurvedAnimation(
      parent: animation,
      curve: const SpringCurve(kSnappySpring, 0.45),
      reverseCurve: Curves.easeOutCubic,
    );
    final fade = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOut,
      reverseCurve: Curves.easeIn,
    );
    return FadeTransition(
      opacity: fade,
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, 0.25), end: Offset.zero).animate(curved),
        child: child,
      ),
    );
  }
}

/// Frosted sheet body. Drag the handle / header to dismiss: it follows your
/// finger, rubber-bands upward, and springs back or flings away on release.
class GlassSheet extends StatefulWidget {
  const GlassSheet({super.key, this.header, required this.child, this.maxHeightFactor = 0.92});
  final Widget? header;
  final Widget child;
  final double maxHeightFactor;

  @override
  State<GlassSheet> createState() => _GlassSheetState();
}

class _GlassSheetState extends State<GlassSheet> with SingleTickerProviderStateMixin {
  late final AnimationController _drag = AnimationController.unbounded(vsync: this, value: 0);

  @override
  void dispose() {
    _drag.dispose();
    super.dispose();
  }

  void _update(double dy) {
    final resist = _drag.value <= 0 && dy < 0;
    _drag.value = (_drag.value + (resist ? dy * 0.2 : dy)).clamp(-32.0, double.infinity);
  }

  void _end(double vy) {
    final h = context.size?.height ?? 500;
    if (_drag.value > h * 0.28 || vy > 800) {
      HapticFeedback.lightImpact();
      Navigator.of(context).pop();
      _drag.springTo(0, spring: kSoftSpring); // blends with the route's slide-out
    } else {
      _drag.springTo(0, velocity: vy);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return AnimatedBuilder(
      animation: _drag,
      builder: (_, child) => Transform.translate(offset: Offset(0, _drag.value), child: child),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          minWidth: mq.size.width,
          maxHeight: mq.size.height * widget.maxHeightFactor,
        ),
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
          child: BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: 40, sigmaY: 40),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: const Color(0x8F1C1C1E),
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.white.withValues(alpha: 0.16),
                    Colors.white.withValues(alpha: 0.03),
                  ],
                ),
                border: Border(
                  top: BorderSide(color: Colors.white.withValues(alpha: 0.25), width: 0.8),
                ),
              ),
              child: Material(
                type: MaterialType.transparency,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onVerticalDragStart: (_) => _drag.stop(),
                      onVerticalDragUpdate: (d) => _update(d.delta.dy),
                      onVerticalDragEnd: (d) => _end(d.velocity.pixelsPerSecond.dy),
                      onVerticalDragCancel: () => _end(0),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 10, bottom: 14),
                            child: Container(
                              width: 36,
                              height: 5,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.35),
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                          ),
                          if (widget.header != null)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                              child: widget.header,
                            ),
                        ],
                      ),
                    ),
                    Flexible(
                      child: SingleChildScrollView(
                        physics: const BouncingScrollPhysics(),
                        padding: EdgeInsets.fromLTRB(20, 4, 20, mq.padding.bottom + 20),
                        child: widget.child,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
