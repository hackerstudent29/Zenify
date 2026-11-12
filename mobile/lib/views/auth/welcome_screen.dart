import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../services/auth_state.dart';
import '../../services/dock_visibility.dart';
import 'email_otp_sheet.dart';
import 'google_logo.dart';
import 'onboarding_sheet.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key, this.onFinished});

  final VoidCallback? onFinished;

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with TickerProviderStateMixin, HideDocksMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;
  bool _isGoogleLoading = false;
  bool _isGuestLoading = false;
  String? _errorMessage;

  late final AnimationController _auroraCtrl = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 18),
  );

  late final AnimationController _markSpringCtrl = AnimationController.unbounded(
    vsync: this,
    value: 1.0,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _auroraCtrl.stop();
    } else if (!_auroraCtrl.isAnimating) {
      _auroraCtrl.repeat();
    }
  }

  @override
  void dispose() {
    _auroraCtrl.dispose();
    _markSpringCtrl.dispose();
    super.dispose();
  }

  void _pulseMark() {
    HapticFeedback.lightImpact();
    _markSpringCtrl.value = 0.88;
    springTo(_markSpringCtrl, 1.0, Springs.bouncy);
  }

  Future<void> _handleGoogleSignIn() async {
    if (_isGoogleLoading || _isGuestLoading) return;
    setState(() {
      _isGoogleLoading = true;
      _errorMessage = null;
    });

    final auth = context.read<AuthState>();
    final result = await auth.signInWithGoogle();

    if (!mounted) return;

    setState(() => _isGoogleLoading = false);

    if (result.success) {
      if (result.isNewUser) {
        _showOnboarding();
      } else {
        _done();
      }
    } else {
      if (result.error != null &&
          !result.error!.toLowerCase().contains('cancelled')) {
        setState(() => _errorMessage = result.error);
        HapticFeedback.mediumImpact();
      }
    }
  }

  void _openEmailSheet() {
    if (_isGoogleLoading || _isGuestLoading) return;
    setState(() => _errorMessage = null);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.65),
      builder: (ctx) => EmailOtpSheet(
        onAuthenticated: (isNewUser) {
          Navigator.of(ctx).pop();
          if (isNewUser) {
            _showOnboarding();
          } else {
            _done();
          }
        },
      ),
    );
  }

  void _showOnboarding() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.72),
      builder: (ctx) => OnboardingSheet(
        onCompleted: () {
          Navigator.of(ctx).pop();
          _done();
        },
      ),
    );
  }

  Future<void> _handleGuest() async {
    if (_isGoogleLoading || _isGuestLoading) return;
    setState(() {
      _isGuestLoading = true;
      _errorMessage = null;
    });

    final auth = context.read<AuthState>();
    await auth.continueAsGuest();

    if (!mounted) return;
    setState(() => _isGuestLoading = false);
    _done();
  }

  void _done() {
    if (widget.onFinished != null) {
      widget.onFinished!();
    } else if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    final busy = _isGoogleLoading || _isGuestLoading;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Ambient Apple Music spatial aurora motion
          RepaintBoundary(
            child: CustomPaint(
              painter: _AuroraBackdropPainter(_auroraCtrl),
              child: const SizedBox.expand(),
            ),
          ),

          // Subtle top-to-bottom readability vignette
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x330A0A0C),
                  Color(0x000A0A0C),
                  Color(0x880A0A0C),
                  Color(0xF00A0A0C),
                ],
                stops: [0.0, 0.32, 0.68, 1.0],
              ),
            ),
          ),

          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isCompactHeight = constraints.maxHeight < 640;
                final isNarrowWidth = constraints.maxWidth < 360;
                final horizontalPad = isNarrowWidth ? 20.0 : 28.0;
                final markSize = isCompactHeight ? 76.0 : 92.0;

                return SingleChildScrollView(
                  physics: const BouncingScrollPhysics(
                    parent: AlwaysScrollableScrollPhysics(),
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        minHeight: constraints.maxHeight,
                        maxWidth: 440,
                      ),
                      child: Padding(
                        padding: EdgeInsets.symmetric(horizontal: horizontalPad),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Top navigation / dismissal bar
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  if (canPop)
                                    SpringIn(
                                      delayMs: 40,
                                      rise: 12,
                                      child: _GlassCircleIconButton(
                                        icon: CupertinoIcons.xmark,
                                        size: 38,
                                        iconSize: 16,
                                        semanticLabel: 'Close',
                                        onTap: () => Navigator.of(context).maybePop(),
                                      ),
                                    )
                                  else
                                    const SizedBox(height: 38),
                                ],
                              ),
                            ),

                            // Hero Identity Group
                            Padding(
                              padding: EdgeInsets.symmetric(
                                vertical: isCompactHeight ? 20 : 36,
                              ),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  // 1. App Mark with breathing aura & spring tap bounce
                                  SpringIn(
                                    delayMs: 0,
                                    rise: 32,
                                    child: PressableScale(
                                      scale: 0.94,
                                      onTap: _pulseMark,
                                      child: AnimatedBuilder(
                                        animation: Listenable.merge([
                                          _auroraCtrl,
                                          _markSpringCtrl,
                                        ]),
                                        builder: (context, child) {
                                          final breath = 0.5 +
                                              0.5 *
                                                  math.sin(
                                                    _auroraCtrl.value *
                                                        math.pi *
                                                        2,
                                                  );
                                          return Transform.scale(
                                            scale: _markSpringCtrl.value
                                                .clamp(0.84, 1.12),
                                            child: Stack(
                                              alignment: Alignment.center,
                                              children: [
                                                // Ambient pulsing halo
                                                Container(
                                                  width: markSize +
                                                      44 +
                                                      breath * 10,
                                                  height: markSize +
                                                      44 +
                                                      breath * 10,
                                                  decoration: BoxDecoration(
                                                    shape: BoxShape.circle,
                                                    gradient: RadialGradient(
                                                      colors: [
                                                        AppColors.accent
                                                            .withValues(
                                                          alpha:
                                                              0.26 + 0.1 * breath,
                                                        ),
                                                        AppColors.accentMaroon
                                                            .withValues(
                                                          alpha: 0.08,
                                                        ),
                                                        Colors.transparent,
                                                      ],
                                                    ),
                                                  ),
                                                ),
                                                child!,
                                              ],
                                            ),
                                          );
                                        },
                                        child: Container(
                                          width: markSize,
                                          height: markSize,
                                          decoration: ShapeDecoration(
                                            shape: ContinuousRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(
                                                markSize * 0.44,
                                              ),
                                              side: BorderSide(
                                                color: Colors.white
                                                    .withValues(alpha: 0.18),
                                                width: 1,
                                              ),
                                            ),
                                            gradient: const LinearGradient(
                                              begin: Alignment.topLeft,
                                              end: Alignment.bottomRight,
                                              colors: [
                                                Color(0xFF232328),
                                                Color(0xFF141417),
                                              ],
                                            ),
                                            shadows: [
                                              BoxShadow(
                                                color: AppColors.accent
                                                    .withValues(alpha: 0.30),
                                                blurRadius: 34,
                                                spreadRadius: -4,
                                                offset: const Offset(0, 14),
                                              ),
                                              BoxShadow(
                                                color: Colors.black
                                                    .withValues(alpha: 0.55),
                                                blurRadius: 24,
                                                offset: const Offset(0, 12),
                                              ),
                                            ],
                                          ),
                                          alignment: Alignment.center,
                                          child: ClipRRect(
                                            borderRadius: BorderRadius.circular(
                                              markSize * 0.22,
                                            ),
                                            child: Image.asset(
                                              'assets/images/z_logo.png',
                                              width: markSize * 0.64,
                                              height: markSize * 0.64,
                                              fit: BoxFit.contain,
                                              errorBuilder: (_, _, _) => Icon(
                                                CupertinoIcons.waveform,
                                                size: markSize * 0.50,
                                                color: AppColors.accent,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),

                                  SizedBox(height: isCompactHeight ? 20 : 26),

                                  // 2. Title & Tagline
                                  SpringIn(
                                    delayMs: 70,
                                    rise: 24,
                                    child: Column(
                                      children: [
                                        Text(
                                          'Zenify',
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            fontFamily: 'SF Pro Display',
                                            fontSize: isCompactHeight ? 36 : 42,
                                            fontWeight: FontWeight.w700,
                                            letterSpacing: -1.2,
                                            height: 1.08,
                                            color: AppColors.textPrimary,
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        Text(
                                          'Music. Elevated to Studio Fidelity.',
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            fontFamily: 'SF Pro',
                                            fontSize: isCompactHeight ? 15 : 16,
                                            fontWeight: FontWeight.w500,
                                            letterSpacing: -0.2,
                                            height: 1.35,
                                            color: Colors.white
                                                .withValues(alpha: 0.74),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),

                                  // 3. Spring-revealed error banner
                                  SpringReveal(
                                    visible: _errorMessage != null,
                                    child: Padding(
                                      padding: const EdgeInsets.only(top: 18),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 14,
                                          vertical: 10,
                                        ),
                                        decoration: BoxDecoration(
                                          color: AppColors.danger
                                              .withValues(alpha: 0.14),
                                          borderRadius:
                                              BorderRadius.circular(16),
                                          border: Border.all(
                                            color: AppColors.danger
                                                .withValues(alpha: 0.38),
                                            width: 0.8,
                                          ),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(
                                              CupertinoIcons
                                                  .exclamationmark_circle_fill,
                                              size: 16,
                                              color: AppColors.danger,
                                            ),
                                            const SizedBox(width: 8),
                                            Flexible(
                                              child: Text(
                                                _errorMessage ?? '',
                                                style: const TextStyle(
                                                  fontFamily: 'SF Pro',
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w500,
                                                  color: Color(0xFFFF7D75),
                                                  height: 1.3,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            // Bottom CTA Stack + Footer
                            Padding(
                              padding: EdgeInsets.only(
                                bottom: isCompactHeight ? 14 : 20,
                              ),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  // Primary CTA 1: Continue with Google
                                  SpringIn(
                                    delayMs: 130,
                                    rise: 22,
                                    child: PressableScale(
                                      scale: 0.96,
                                      onTap: busy ? null : _handleGoogleSignIn,
                                      child: Container(
                                        height: 52,
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 20,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          borderRadius:
                                              BorderRadius.circular(26),
                                          boxShadow: [
                                            BoxShadow(
                                              color: Colors.black
                                                  .withValues(alpha: 0.28),
                                              blurRadius: 18,
                                              offset: const Offset(0, 8),
                                            ),
                                          ],
                                        ),
                                        alignment: Alignment.center,
                                        child: AnimatedSwitcher(
                                          duration:
                                              const Duration(milliseconds: 220),
                                          child: _isGoogleLoading
                                              ? const Row(
                                                  key: ValueKey('google_load'),
                                                  mainAxisAlignment:
                                                      MainAxisAlignment.center,
                                                  children: [
                                                    SizedBox(
                                                      width: 19,
                                                      height: 19,
                                                      child:
                                                          CircularProgressIndicator(
                                                        strokeWidth: 2.2,
                                                        color:
                                                            Color(0xFF111113),
                                                      ),
                                                    ),
                                                    SizedBox(width: 10),
                                                    Text(
                                                      'Signing in...',
                                                      style: TextStyle(
                                                        fontFamily:
                                                            'SF Pro Display',
                                                        fontSize: 16,
                                                        fontWeight:
                                                            FontWeight.w700,
                                                        letterSpacing: -0.2,
                                                        color:
                                                            Color(0xFF111113),
                                                      ),
                                                    ),
                                                  ],
                                                )
                                              : const Row(
                                                  key: ValueKey('google_idle'),
                                                  mainAxisAlignment:
                                                      MainAxisAlignment.center,
                                                  children: [
                                                    GoogleLogo(size: 20),
                                                    SizedBox(width: 12),
                                                    Flexible(
                                                      child: Text(
                                                        'Continue with Google',
                                                        maxLines: 1,
                                                        overflow: TextOverflow
                                                            .ellipsis,
                                                        style: TextStyle(
                                                          fontFamily:
                                                              'SF Pro Display',
                                                          fontSize: 16,
                                                          fontWeight:
                                                              FontWeight.w700,
                                                          letterSpacing: -0.2,
                                                          color:
                                                              Color(0xFF111113),
                                                        ),
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                        ),
                                      ),
                                    ),
                                  ),

                                  const SizedBox(height: 12),

                                  // Primary CTA 2: Continue with Email
                                  SpringIn(
                                    delayMs: 185,
                                    rise: 22,
                                    child: PressableScale(
                                      scale: 0.96,
                                      onTap: busy ? null : _openEmailSheet,
                                      child: Container(
                                        height: 52,
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 20,
                                        ),
                                        decoration: BoxDecoration(
                                          borderRadius:
                                              BorderRadius.circular(26),
                                          gradient: const LinearGradient(
                                            begin: Alignment.topCenter,
                                            end: Alignment.bottomCenter,
                                            colors: [
                                              AppColors.accent,
                                              AppColors.crimson,
                                            ],
                                          ),
                                          border: Border.all(
                                            color: Colors.white
                                                .withValues(alpha: 0.18),
                                            width: 0.6,
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: AppColors.accent
                                                  .withValues(alpha: 0.36),
                                              blurRadius: 22,
                                              offset: const Offset(0, 8),
                                            ),
                                          ],
                                        ),
                                        alignment: Alignment.center,
                                        child: const Row(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Icon(
                                              CupertinoIcons.mail_solid,
                                              size: 18,
                                              color: Colors.white,
                                            ),
                                            SizedBox(width: 10),
                                            Flexible(
                                              child: Text(
                                                'Continue with Email',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                  fontFamily: 'SF Pro Display',
                                                  fontSize: 16,
                                                  fontWeight: FontWeight.w700,
                                                  letterSpacing: -0.2,
                                                  color: Colors.white,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),

                                  const SizedBox(height: 12),

                                  // Secondary Pill: Continue as Guest
                                  SpringIn(
                                    delayMs: 240,
                                    rise: 18,
                                    child: PressableScale(
                                      scale: 0.96,
                                      onTap: busy ? null : _handleGuest,
                                      child: Container(
                                        height: 50,
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 20,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.white
                                              .withValues(alpha: 0.10),
                                          borderRadius:
                                              BorderRadius.circular(26),
                                          border: Border.all(
                                            color: Colors.white
                                                .withValues(alpha: 0.14),
                                            width: 0.8,
                                          ),
                                        ),
                                        alignment: Alignment.center,
                                        child: AnimatedSwitcher(
                                          duration:
                                              const Duration(milliseconds: 200),
                                          child: _isGuestLoading
                                              ? const SizedBox(
                                                  key: ValueKey('guest_load'),
                                                  width: 19,
                                                  height: 19,
                                                  child:
                                                      CircularProgressIndicator(
                                                    strokeWidth: 2.2,
                                                    color: Colors.white,
                                                  ),
                                                )
                                              : Text(
                                                  'Continue as Guest',
                                                  key: const ValueKey(
                                                      'guest_idle'),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: TextStyle(
                                                    fontFamily: 'SF Pro',
                                                    fontSize: 15.5,
                                                    fontWeight: FontWeight.w600,
                                                    letterSpacing: -0.2,
                                                    color: Colors.white
                                                        .withValues(
                                                            alpha: 0.90),
                                                  ),
                                                ),
                                        ),
                                      ),
                                    ),
                                  ),

                                  const SizedBox(height: 18),

                                  // Footer: Terms & Privacy
                                  SpringIn(
                                    delayMs: 290,
                                    rise: 12,
                                    child: Text(
                                      'By continuing, you agree to the Terms and Privacy Policy.',
                                      style: TextStyle(
                                        fontFamily: 'SF Pro',
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500,
                                        color:
                                            Colors.white.withValues(alpha: 0.56),
                                        height: 1.38,
                                      ),
                                      textAlign: TextAlign.center,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Circular Apple Glass icon-only button (`BoxShape.circle`).
class _GlassCircleIconButton extends StatelessWidget {
  const _GlassCircleIconButton({
    required this.icon,
    required this.onTap,
    this.size = 38,
    this.iconSize = 17,
    this.semanticLabel,
  });

  final IconData icon;
  final VoidCallback onTap;
  final double size;
  final double iconSize;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: PressableScale(
        scale: 0.88,
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.all(3),
          child: AppleGlass(
            borderRadius: BorderRadius.circular(size / 2),
            tint: Colors.white.withValues(alpha: 0.14),
            shadow: false,
            child: Container(
              width: size,
              height: size,
              decoration: const BoxDecoration(shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Icon(icon, size: iconSize, color: Colors.white),
            ),
          ),
        ),
      ),
    );
  }
}

/// Slow orbital Apple Music crimson/plum ambient aurora painted without widget rebuilds.
class _AuroraBackdropPainter extends CustomPainter {
  _AuroraBackdropPainter(this.progress) : super(repaint: progress);

  final Animation<double> progress;

  @override
  void paint(Canvas canvas, Size size) {
    final t = progress.value * math.pi * 2;
    final w = size.width;
    final h = size.height;
    final longest = math.max(w, h);

    // Orb 1: Primary Rose-Crimson behind hero mark
    _drawOrb(
      canvas,
      center: Offset(
        w * (0.50 + 0.14 * math.sin(t)),
        h * (0.28 + 0.06 * math.cos(t * 1.2)),
      ),
      radius: longest * 0.56,
      color: AppColors.crimson.withValues(alpha: 0.28),
    );

    // Orb 2: Deep Maroon-Berry spatial depth
    _drawOrb(
      canvas,
      center: Offset(
        w * (0.20 + 0.16 * math.cos(t * 0.9 + 1.1)),
        h * (0.18 + 0.10 * math.sin(t * 1.1 + 0.6)),
      ),
      radius: longest * 0.52,
      color: AppColors.accentMaroon.withValues(alpha: 0.34),
    );

    // Orb 3: Twilight plum undertone
    _drawOrb(
      canvas,
      center: Offset(
        w * (0.82 + 0.12 * math.sin(t * 0.8 + 2.4)),
        h * (0.42 + 0.08 * math.cos(t * 0.7 + 1.8)),
      ),
      radius: longest * 0.48,
      color: const Color(0xFF4C0D38).withValues(alpha: 0.30),
    );

    // Orb 4: Warm soft rose shimmer
    _drawOrb(
      canvas,
      center: Offset(
        w * (0.54 + 0.18 * math.cos(t + 3.2)),
        h * (0.34 + 0.07 * math.sin(t * 1.3 + 2.0)),
      ),
      radius: longest * 0.34,
      color: AppColors.accentSoft.withValues(alpha: 0.12),
    );
  }

  void _drawOrb(
    Canvas canvas, {
    required Offset center,
    required double radius,
    required Color color,
  }) {
    final rect = Rect.fromCircle(center: center, radius: radius);
    final paint = Paint()
      ..shader = RadialGradient(
        colors: [
          color,
          color.withValues(alpha: color.a * 0.35),
          Colors.transparent,
        ],
        stops: const [0.0, 0.48, 1.0],
      ).createShader(rect);
    canvas.drawCircle(center, radius, paint);
  }

  @override
  bool shouldRepaint(covariant _AuroraBackdropPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
