import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../design_system/tokens/app_colors.dart';

/// Recreates the luxury entrance animation from Zenify website:
/// Z, E, N, I, F, Y letter cards stagger and fluidly assemble.
class ZenifySplashScreen extends StatefulWidget {
  const ZenifySplashScreen({super.key, required this.onFinished});

  final VoidCallback onFinished;

  @override
  State<ZenifySplashScreen> createState() => _ZenifySplashScreenState();
}

class _ZenifySplashScreenState extends State<ZenifySplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _controller;
  late final AnimationController _scaleController;

  static const List<Map<String, double>> _letterPositions = [
    {'left': 0.07820, 'top': 0.24609, 'width': 0.15166}, // Z
    {'left': 0.24171, 'top': 0.24219, 'width': 0.15047}, // E
    {'left': 0.40521, 'top': 0.23828, 'width': 0.14810}, // N
    {'left': 0.57227, 'top': 0.23828, 'width': 0.02844}, // I
    {'left': 0.61493, 'top': 0.24609, 'width': 0.15047}, // F
    {'left': 0.77962, 'top': 0.23828, 'width': 0.13981}, // Y
  ];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    );

    _scaleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    );

    _controller.forward();
    _scaleController.forward();

    Timer(const Duration(milliseconds: 2750), () {
      if (mounted) widget.onFinished();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scaleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final logoWidth = math.min(w * 0.85, 420.0);
    final logoHeight = logoWidth * (256.0 / 844.0);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final t = _controller.value;

            // Letters animation curves based on exact CSS keyframe offsets
            // Z: 0ms -> 1700ms (t: 0.0 -> 0.65)
            final zT = Curves.easeOutCubic.transform((t / 0.65).clamp(0.0, 1.0));
            // E: 280ms -> 2080ms (t: 0.11 -> 0.80)
            final eT = Curves.easeOutCubic.transform(((t - 0.11) / 0.69).clamp(0.0, 1.0));
            // N: 560ms -> 2260ms (t: 0.21 -> 0.87)
            final nT = Curves.easeOutCubic.transform(((t - 0.21) / 0.66).clamp(0.0, 1.0));
            // I: 840ms -> 2440ms (t: 0.32 -> 0.94)
            final iT = Curves.easeOutBack.transform(((t - 0.32) / 0.62).clamp(0.0, 1.0));
            // F: 1120ms -> 2820ms (t: 0.43 -> 1.0)
            final fT = Curves.easeOutCubic.transform(((t - 0.43) / 0.57).clamp(0.0, 1.0));
            // Y: 1400ms -> 3000ms (t: 0.54 -> 1.0)
            final yT = Curves.easeOutBack.transform(((t - 0.54) / 0.46).clamp(0.0, 1.0));

            final letterTs = [zT, eT, nT, iT, fT, yT];

            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Glowing luxury logo frame
                SizedBox(
                  width: logoWidth,
                  height: logoHeight,
                  child: Stack(
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
                const SizedBox(height: 36),

                // Subtle glowing status text
                Opacity(
                  opacity: ((t - 0.5) / 0.5).clamp(0.0, 1.0),
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
            );
          },
        ),
      ),
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

    // Apply specific motion personality per letter
    switch (index) {
      case 0: // Z: drawn on with subtle skew
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
      case 4: // F: slide in from right with stretch
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

