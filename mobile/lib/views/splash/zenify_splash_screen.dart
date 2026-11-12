import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../design_system/tokens/app_colors.dart';

/// Shared transparent full Z-E-N-I-F-Y animated logo widget.
/// Renders the 6 transparent letter assets cleanly with zero box/background,
/// supporting either a single launch entrance (`loop: false`) or a continuous
/// silky intro-breathe-fade loop (`loop: true`) for the Welcome / Sign-In screen.
class ZenifyAnimatedLogo extends StatefulWidget {
  const ZenifyAnimatedLogo({
    super.key,
    required this.width,
    this.loop = false,
    this.onIntroSettled,
  });

  final double width;
  final bool loop;
  final VoidCallback? onIntroSettled;

  @override
  State<ZenifyAnimatedLogo> createState() => _ZenifyAnimatedLogoState();
}

class _ZenifyAnimatedLogoState extends State<ZenifyAnimatedLogo>
    with SingleTickerProviderStateMixin {
  static const List<Map<String, double>> _letterPositions = [
    {'left': 0.07820, 'top': 0.24609, 'width': 0.15166}, // Z
    {'left': 0.24171, 'top': 0.24219, 'width': 0.15047}, // E
    {'left': 0.40521, 'top': 0.23828, 'width': 0.14810}, // N
    {'left': 0.57227, 'top': 0.23828, 'width': 0.02844}, // I
    {'left': 0.61493, 'top': 0.24609, 'width': 0.15047}, // F
    {'left': 0.77962, 'top': 0.23828, 'width': 0.13981}, // Y
  ];

  late final AnimationController _controller;
  bool _settledNotified = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: widget.loop ? 3900 : 2600),
    )..addListener(_checkSettled);

    if (widget.loop) {
      _controller.repeat();
    } else {
      _controller.forward();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
      _controller.value = widget.loop ? 0.56 : 1.0;
      _notifySettledOnce();
    } else if (widget.loop && !_controller.isAnimating) {
      _controller.repeat();
    }
  }

  void _checkSettled() {
    final threshold = widget.loop ? 0.55 : 0.92;
    if (!_settledNotified && _controller.value >= threshold) {
      _notifySettledOnce();
    }
  }

  void _notifySettledOnce() {
    if (_settledNotified) return;
    _settledNotified = true;
    widget.onIntroSettled?.call();
  }

  @override
  void dispose() {
    _controller.removeListener(_checkSettled);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final logoWidth = widget.width;
    final logoHeight = logoWidth * (256.0 / 844.0);

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final raw = _controller.value;

        // Normalize assembly progress across [0..1]:
        // In loop mode, letters assemble during [0.0..0.56], hold/breathe [0.56..0.86],
        // and gently dissolve [0.86..1.0] before repeating cleanly.
        final double assemblyT;
        final double loopFade;
        final double breatheScale;
        final double exitDriftY;

        if (!widget.loop) {
          assemblyT = raw;
          loopFade = 1.0;
          breatheScale = 1.0;
          exitDriftY = 0.0;
        } else {
          assemblyT = (raw / 0.56).clamp(0.0, 1.0);
          if (raw < 0.56) {
            loopFade = 1.0;
            breatheScale = 1.0;
            exitDriftY = 0.0;
          } else if (raw < 0.86) {
            final holdP = ((raw - 0.56) / 0.30).clamp(0.0, 1.0);
            loopFade = 1.0;
            breatheScale = 1.0 + 0.022 * math.sin(holdP * math.pi);
            exitDriftY = 0.0;
          } else {
            final outP = Curves.easeInOutCubic.transform(
              ((raw - 0.86) / 0.14).clamp(0.0, 1.0),
            );
            loopFade = 1.0 - outP;
            breatheScale = 1.0 - 0.03 * outP;
            exitDriftY = -8.0 * outP;
          }
        }

        // Exact staggered letter timings: Z, E, N, I, F, Y
        final zT = Curves.easeOutCubic.transform((assemblyT / 0.65).clamp(0.0, 1.0));
        final eT = Curves.easeOutCubic.transform(((assemblyT - 0.11) / 0.69).clamp(0.0, 1.0));
        final nT = Curves.easeOutCubic.transform(((assemblyT - 0.21) / 0.66).clamp(0.0, 1.0));
        final iT = Curves.easeOutBack.transform(((assemblyT - 0.32) / 0.62).clamp(0.0, 1.0));
        final fT = Curves.easeOutCubic.transform(((assemblyT - 0.43) / 0.57).clamp(0.0, 1.0));
        final yT = Curves.easeOutBack.transform(((assemblyT - 0.54) / 0.46).clamp(0.0, 1.0));

        final letterTs = [zT, eT, nT, iT, fT, yT];

        return Opacity(
          opacity: loopFade.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, exitDriftY),
            child: Transform.scale(
              scale: breatheScale,
              child: SizedBox(
                width: logoWidth,
                height: logoHeight,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    for (int i = 0; i < 6; i++)
                      _buildLetter(
                        index: i,
                        t: letterTs[i],
                        parentWidth: logoWidth,
                        parentHeight: logoHeight,
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildLetter({
    required int index,
    required double t,
    required double parentWidth,
    required double parentHeight,
  }) {
    final spec = _letterPositions[index];
    final left = spec['left']! * parentWidth;
    final top = spec['top']! * parentHeight;
    final width = spec['width']! * parentWidth;

    Widget child = Image.asset(
      'assets/letters/letter_$index.png',
      width: width,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
    );

    switch (index) {
      case 0: // Z: slides & rotates into place
        child = Transform(
          transform: Matrix4.identity()
            ..setTranslationRaw((1 - t) * -20, 0, 0)
            ..setRotationZ((1 - t) * -0.08),
          child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
        );
      case 1: // E: unspins and scales
        child = Transform.scale(
          scale: 0.7 + 0.3 * t,
          child: Transform.rotate(
            angle: (1 - t) * -0.5,
            child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
          ),
        );
      case 2: // N: curtain rise
        child = Transform.translate(
          offset: Offset(0, (1 - t) * 24),
          child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
        );
      case 3: // I: drop and squash bounce
        child = Transform.translate(
          offset: Offset(0, (1 - t) * -40),
          child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
        );
      case 4: // F: slide in from right
        child = Transform.translate(
          offset: Offset((1 - t) * 30, 0),
          child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
        );
      case 5: // Y: 3D perspective flip up from base
        child = Transform(
          transform: Matrix4.identity()
            ..setEntry(3, 2, 0.002)
            ..rotateX((1 - t) * -0.8),
          alignment: Alignment.bottomCenter,
          child: Opacity(opacity: t.clamp(0.0, 1.0), child: child),
        );
    }

    return Positioned(
      left: left,
      top: top,
      width: width,
      child: child,
    );
  }
}

/// Launch splash screen playing the full 6-letter Zenify logo once before
/// entering the Sign-In gate or main app shell.
class ZenifySplashScreen extends StatefulWidget {
  const ZenifySplashScreen({super.key, required this.onFinished});

  final VoidCallback onFinished;

  @override
  State<ZenifySplashScreen> createState() => _ZenifySplashScreenState();
}

class _ZenifySplashScreenState extends State<ZenifySplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _taglineCtrl;
  Timer? _finishTimer;

  @override
  void initState() {
    super.initState();
    _taglineCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..forward();

    _finishTimer = Timer(const Duration(milliseconds: 2750), () {
      if (mounted) widget.onFinished();
    });
  }

  @override
  void dispose() {
    _finishTimer?.cancel();
    _taglineCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final logoWidth = math.min(w * 0.85, 420.0);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ZenifyAnimatedLogo(width: logoWidth, loop: false),
            const SizedBox(height: 36),
            AnimatedBuilder(
              animation: _taglineCtrl,
              builder: (context, child) => Opacity(
                opacity: ((_taglineCtrl.value - 0.5) / 0.5).clamp(0.0, 1.0),
                child: child,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.accent,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.accent.withValues(alpha: 0.8),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'PURE HI-FI AUDIO',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.65),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2.2,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
