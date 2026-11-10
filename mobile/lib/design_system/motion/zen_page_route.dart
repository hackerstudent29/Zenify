import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// Semantic page transition types reflecting Apple Music's fluid navigation hierarchy.
enum ZenPageType {
  /// Deep media browsing pages (Albums, Artists, Collaborative Rooms).
  /// Features an Apple-style horizontal fluid spring slide with parallax depth and scrim.
  detail,

  /// Modal, account, and configuration sheets (Profile, Settings, Insights).
  /// Features a vertical modal card presentation with background scale-down and top rounding.
  modal,

  /// Lightweight cross-morph transitions with micro-scale.
  fade,
}

/// Apple-style buttery-smooth page route using fluid spring physics.
///
/// Opening animations are swift, underdamped, and responsive (280ms).
/// Closing / popping animations are instant, crisp, and dismiss without dragging (210ms).
class ZenPageRoute<T> extends CupertinoPageRoute<T> {
  ZenPageRoute({
    required super.builder,
    super.settings,
    this.pageType,
    super.fullscreenDialog = false,
    super.maintainState = true,
  });

  final ZenPageType? pageType;

  @override
  Duration get transitionDuration => const Duration(milliseconds: 280);

  @override
  Duration get reverseTransitionDuration => const Duration(milliseconds: 210);

  ZenPageType _resolveType(Widget builtChild) {
    if (pageType != null) return pageType!;
    if (fullscreenDialog) return ZenPageType.modal;

    final typeName = builtChild.runtimeType.toString();
    if (typeName.contains('Profile') ||
        typeName.contains('Settings') ||
        typeName.contains('Insights') ||
        typeName.contains('Login') ||
        typeName.contains('Otp')) {
      return ZenPageType.modal;
    }
    return ZenPageType.detail;
  }

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (fullscreenDialog) {
      return super.buildTransitions(context, animation, secondaryAnimation, child);
    }
    final type = _resolveType(child);
    return ZenPageTransition(
      animation: animation,
      secondaryAnimation: secondaryAnimation,
      pageType: type,
      child: child,
    );
  }
}

/// Global PageTransitionsBuilder that brings Zenify's spring physics to standard MaterialApp routes.
class ZenPageTransitionsBuilder extends PageTransitionsBuilder {
  const ZenPageTransitionsBuilder({this.pageType});

  final ZenPageType? pageType;

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (route.fullscreenDialog) {
      return const CupertinoPageTransitionsBuilder().buildTransitions(
        route,
        context,
        animation,
        secondaryAnimation,
        child,
      );
    }
    final type = pageType ?? ZenPageType.detail;
    return ZenPageTransition(
      animation: animation,
      secondaryAnimation: secondaryAnimation,
      pageType: type,
      child: child,
    );
  }
}

/// The core transition widget that applies Apple Music-styled fluid spring mechanics.
class ZenPageTransition extends StatelessWidget {
  const ZenPageTransition({
    super.key,
    required this.animation,
    required this.secondaryAnimation,
    required this.pageType,
    required this.child,
  });

  final Animation<double> animation;
  final Animation<double> secondaryAnimation;
  final ZenPageType pageType;
  final Widget child;

  // Apple Music-inspired spring curves:
  // Forward: Crisp initial snap with smooth settling
  static const Curve forwardSpring = Cubic(0.18, 0.98, 0.28, 1.0);
  // Reverse: Instant, snappy pop exit
  static const Curve reverseSpring = Cubic(0.25, 0.1, 0.25, 1.0);

  @override
  Widget build(BuildContext context) {
    final isPopping = animation.status == AnimationStatus.reverse;
    final primaryCurve = CurvedAnimation(
      parent: animation,
      curve: isPopping ? reverseSpring : forwardSpring,
      reverseCurve: reverseSpring,
    );

    final secCurve = CurvedAnimation(
      parent: secondaryAnimation,
      curve: isPopping ? reverseSpring : forwardSpring,
      reverseCurve: reverseSpring,
    );

    switch (pageType) {
      case ZenPageType.modal:
        return _buildModalTransition(primaryCurve, secCurve);
      case ZenPageType.fade:
        return _buildFadeTransition(primaryCurve);
      case ZenPageType.detail:
        return _buildDetailTransition(primaryCurve, secCurve);
    }
  }

  /// Apple Music Horizontal Slide:
  /// Primary page slides from right (+1.0 -> 0.0) with a soft glass edge shadow.
  /// Secondary (underlying) page smoothly parallaxes left (0.0 -> -0.16) with subtle scrim and micro-scale.
  Widget _buildDetailTransition(Animation<double> anim, Animation<double> secAnim) {
    final slideIn = Tween<Offset>(
      begin: const Offset(1.0, 0.0),
      end: Offset.zero,
    ).animate(anim);

    final parallaxOut = Tween<Offset>(
      begin: Offset.zero,
      end: const Offset(-0.16, 0.0),
    ).animate(secAnim);

    final scaleDown = Tween<double>(
      begin: 1.0,
      end: 0.985,
    ).animate(secAnim);

    final scrimOpacity = Tween<double>(
      begin: 0.0,
      end: 0.25,
    ).animate(secAnim);

    return AnimatedBuilder(
      animation: Listenable.merge([anim, secAnim]),
      builder: (context, c) {
        Widget result = SlideTransition(
          position: slideIn,
          child: Container(
            decoration: BoxDecoration(
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.38 * anim.value.clamp(0.0, 1.0)),
                  blurRadius: 28,
                  offset: const Offset(-8, 0),
                ),
              ],
            ),
            child: c,
          ),
        );

        if (secAnim.value > 0.001) {
          result = SlideTransition(
            position: parallaxOut,
            child: Transform.scale(
              scale: scaleDown.value,
              alignment: Alignment.center,
              child: Stack(
                fit: StackFit.passthrough,
                children: [
                  result,
                  Positioned.fill(
                    child: IgnorePointer(
                      child: Container(
                        color: Colors.black.withValues(alpha: scrimOpacity.value.clamp(0.0, 0.25)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return result;
      },
      child: child,
    );
  }

  /// Apple Music Vertical Modal Sheet:
  /// Primary sheet rises smoothly from bottom (+0.12 -> 0.0) with fade in.
  /// Secondary page scales down to 0.96 with top rounded corners and 35% dark glass overlay.
  Widget _buildModalTransition(Animation<double> anim, Animation<double> secAnim) {
    final slideUp = Tween<Offset>(
      begin: const Offset(0.0, 0.12),
      end: Offset.zero,
    ).animate(anim);

    final fadeIn = Tween<double>(
      begin: 0.0,
      end: 1.0,
    ).animate(CurvedAnimation(parent: anim, curve: const Interval(0.0, 0.85, curve: Curves.easeOut)));

    final scaleDown = Tween<double>(
      begin: 1.0,
      end: 0.955,
    ).animate(secAnim);

    final scrim = Tween<double>(
      begin: 0.0,
      end: 0.38,
    ).animate(secAnim);

    final cornerRadius = Tween<double>(
      begin: 0.0,
      end: 18.0,
    ).animate(secAnim);

    return AnimatedBuilder(
      animation: Listenable.merge([anim, secAnim]),
      builder: (context, c) {
        Widget result = SlideTransition(
          position: slideUp,
          child: FadeTransition(
            opacity: fadeIn,
            child: ClipRRect(
              borderRadius: BorderRadius.vertical(top: Radius.circular(16 * (1.0 - secAnim.value))),
              child: c,
            ),
          ),
        );

        if (secAnim.value > 0.001) {
          result = Transform.scale(
            scale: scaleDown.value,
            alignment: Alignment.topCenter,
            child: ClipRRect(
              borderRadius: BorderRadius.vertical(top: Radius.circular(cornerRadius.value)),
              child: Stack(
                fit: StackFit.passthrough,
                children: [
                  result,
                  Positioned.fill(
                    child: IgnorePointer(
                      child: Container(
                        color: Colors.black.withValues(alpha: scrim.value.clamp(0.0, 0.38)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return result;
      },
      child: child,
    );
  }

  /// Soft Cross-Morph Transition:
  /// Instant, subtle cross-fade with micro-scale. Never feels awkward.
  Widget _buildFadeTransition(Animation<double> anim) {
    final fadeIn = Tween<double>(begin: 0.0, end: 1.0).animate(anim);
    final scale = Tween<double>(begin: 0.99, end: 1.0).animate(anim);

    return FadeTransition(
      opacity: fadeIn,
      child: ScaleTransition(
        scale: scale,
        child: child,
      ),
    );
  }
}
