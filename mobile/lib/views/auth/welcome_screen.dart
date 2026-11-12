import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_tokens.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/artwork_mesh_background.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../services/auth_state.dart';
import '../../services/dock_visibility.dart';
import '../../services/user_preferences_service.dart';
import '../splash/zenify_splash_screen.dart';
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

  /// Strawberry Rose + Blush Pink + Pure White wave palette for the free-flowing
  /// ArtworkMeshBackground behind the transparent ZENIFY logo.
  static const List<Color> _roseWhitePalette = [
    Color(0xFFE11D48), // Strawberry Rose
    Color(0xFFFF4D79), // Bright Strawberry Pink
    Color(0xFFFFFFFF), // Luminous White wave
    Color(0xFFFFDCE5), // Rose Pearl White blend
    Color(0xFFFB7185), // Warm Pastel Rose
    Color(0xFF881337), // Deep Berry undertone
  ];

  bool _isGoogleLoading = false;
  bool _isGuestLoading = false;
  String? _errorMessage;

  late final AnimationController _bgIntroCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1150),
  );

  late final AnimationController _taglineIntroCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  );

  late final AnimationController _ctaEntranceCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 950),
  );

  late final AnimationController _markSpringCtrl = AnimationController.unbounded(
    vsync: this,
    value: 1.0,
  );

  Timer? _ctaFallbackTimer;
  Timer? _taglineTimer;
  bool _ctaStarted = false;

  @override
  void initState() {
    super.initState();
    _bgIntroCtrl.forward();
    _taglineTimer = Timer(const Duration(milliseconds: 520), () {
      if (mounted) _taglineIntroCtrl.forward();
    });
    // Guarantee CTA placement triggers right after the intro beat even if frame rate varies.
    _ctaFallbackTimer = Timer(const Duration(milliseconds: 1350), _startCtaEntrance);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _bgIntroCtrl.value = 1.0;
      _taglineIntroCtrl.value = 1.0;
      _ctaEntranceCtrl.value = 1.0;
      _ctaStarted = true;
    }
  }

  @override
  void dispose() {
    _ctaFallbackTimer?.cancel();
    _taglineTimer?.cancel();
    _bgIntroCtrl.dispose();
    _taglineIntroCtrl.dispose();
    _ctaEntranceCtrl.dispose();
    _markSpringCtrl.dispose();
    super.dispose();
  }

  void _onLogoIntroSettled() {
    if (!mounted) return;
    _startCtaEntrance();
  }

  void _startCtaEntrance() {
    if (_ctaStarted || !mounted) return;
    _ctaStarted = true;
    if (!_taglineIntroCtrl.isCompleted) _taglineIntroCtrl.forward();
    _ctaEntranceCtrl.forward();
  }

  void _pulseMark() {
    HapticFeedback.lightImpact();
    _markSpringCtrl.value = 0.90;
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
    DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
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
      ),
    );
  }

  void _showOnboarding() {
    OnboardingSheet.show(
      context,
      onCompleted: () {
        if (Navigator.of(context, rootNavigator: true).canPop()) {
          Navigator.of(context, rootNavigator: true).pop();
        }
        _done();
      },
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
    await UserPreferencesService.instance.ensureLoaded();

    if (!mounted) return;
    setState(() => _isGuestLoading = false);

    if (!UserPreferencesService.instance.hasCompleted) {
      _showOnboarding();
    } else {
      _done();
    }
  }

  void _done() {
    if (widget.onFinished != null) {
      widget.onFinished!();
    } else if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  Widget _staggeredButton({
    required double begin,
    required double end,
    required Widget child,
  }) {
    final curve = CurvedAnimation(
      parent: _ctaEntranceCtrl,
      curve: Interval(begin, end, curve: Curves.easeOutBack),
    );
    final opacityCurve = CurvedAnimation(
      parent: _ctaEntranceCtrl,
      curve: Interval(begin, (begin + (end - begin) * 0.65).clamp(0.0, 1.0), curve: Curves.easeOut),
    );
    return AnimatedBuilder(
      animation: _ctaEntranceCtrl,
      builder: (_, builtChild) {
        final t = curve.value;
        final op = opacityCurve.value.clamp(0.0, 1.0);
        return IgnorePointer(
          ignoring: op < 0.2,
          child: Opacity(
            opacity: op,
            child: Transform.translate(
              offset: Offset(0, (1.0 - t) * 30.0),
              child: Transform.scale(
                scale: 0.94 + 0.06 * t.clamp(0.0, 1.05),
                child: builtChild,
              ),
            ),
          ),
        );
      },
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    final busy = _isGoogleLoading || _isGuestLoading;

    return Scaffold(
      backgroundColor: const Color(0xFF19060D),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Free-flowing Strawberry Rose & White ArtMesh background (same liquid
          // physics engine as Full-Screen Player) with smooth bloom intro animation.
          AnimatedBuilder(
            animation: _bgIntroCtrl,
            builder: (context, child) {
              final t = Curves.easeOutCubic.transform(_bgIntroCtrl.value);
              return Opacity(
                opacity: t.clamp(0.0, 1.0),
                child: Transform.scale(
                  scale: 1.08 - (0.08 * t),
                  child: child,
                ),
              );
            },
            child: const ArtworkMeshBackground(
              palette: _roseWhitePalette,
              speed: 1.25,
              intensity: 0.35,
              interactive: true,
              dither: true,
              scrimOpacity: 0.28,
              backgroundColor: Color(0xFF1F0610),
            ),
          ),

          // Soft lower-edge contrast gradient so CTA controls pop effortlessly
          // while letting strawberry rose & white waves shine above.
          const IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x2414040A),
                    Color(0x0014040A),
                    Color(0x52120409),
                    Color(0xC20D0307),
                  ],
                  stops: [0.0, 0.35, 0.72, 1.0],
                ),
              ),
            ),
          ),

          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isCompactHeight = constraints.maxHeight < 640;
                final isNarrowWidth = constraints.maxWidth < 360;
                final horizontalPad = isNarrowWidth ? 20.0 : 28.0;
                final logoWidth = math.min(
                  (constraints.maxWidth - horizontalPad * 2) * 0.84,
                  isCompactHeight ? 248.0 : 292.0,
                );

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
                            Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                // Optional top-right close button only when pushed over an existing route
                                Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      if (canPop)
                                        SpringIn(
                                          delayMs: 80,
                                          rise: 10,
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

                                // Center-Top Hero Identity Group:
                                // Transparent full ZENIFY animated logo looping smoothly
                                Padding(
                                  padding: EdgeInsets.only(
                                    top: isCompactHeight ? 12 : 28,
                                    bottom: isCompactHeight ? 16 : 24,
                                  ),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      PressableScale(
                                        scale: 0.96,
                                        onTap: _pulseMark,
                                        child: AnimatedBuilder(
                                          animation: _markSpringCtrl,
                                          builder: (context, child) => Transform.scale(
                                            scale: _markSpringCtrl.value.clamp(0.86, 1.10),
                                            child: child,
                                          ),
                                          child: ZenifyAnimatedLogo(
                                            width: logoWidth,
                                            loop: true,
                                            onIntroSettled: _onLogoIntroSettled,
                                          ),
                                        ),
                                      ),

                                      SizedBox(height: isCompactHeight ? 16 : 22),

                                      // Tagline enters cleanly beneath the full logo
                                      AnimatedBuilder(
                                        animation: _taglineIntroCtrl,
                                        builder: (context, child) {
                                          final t = Curves.easeOutCubic.transform(
                                            _taglineIntroCtrl.value,
                                          );
                                          return Opacity(
                                            opacity: t.clamp(0.0, 1.0),
                                            child: Transform.translate(
                                              offset: Offset(0, (1.0 - t) * 14.0),
                                              child: child,
                                            ),
                                          );
                                        },
                                        child: Text(
                                          'Music. Elevated to Studio Fidelity.',
                                          textAlign: TextAlign.center,
                                          style: AT.callout.copyWith(
                                            color: Colors.white.withValues(alpha: 0.88),
                                            fontWeight: FontWeight.w500,
                                            shadows: [
                                              Shadow(
                                                color: Colors.black.withValues(alpha: 0.35),
                                                blurRadius: 10,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),

                                      // Error Banner
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
                                              color: Colors.black.withValues(alpha: 0.45),
                                              borderRadius: BorderRadius.circular(16),
                                              border: Border.all(
                                                color: AppColors.danger.withValues(alpha: 0.55),
                                                width: 0.9,
                                              ),
                                            ),
                                            child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                const Icon(
                                                  CupertinoIcons.exclamationmark_circle_fill,
                                                  size: 16,
                                                  color: AppColors.danger,
                                                ),
                                                const SizedBox(width: 8),
                                                Flexible(
                                                  child: Text(
                                                    _errorMessage ?? '',
                                                    style: AT.footnote.copyWith(
                                                      color: const Color(0xFFFFB4AF),
                                                      fontWeight: FontWeight.w500,
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
                              ],
                            ),

                            const SizedBox(height: 12),

                            // Sequenced Bottom CTA Buttons (animated into place right after intro)
                            Padding(
                              padding: EdgeInsets.only(
                                bottom: isCompactHeight ? 14 : 22,
                              ),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  // 1. Continue with Google
                                  _staggeredButton(
                                    begin: 0.0,
                                    end: 0.52,
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
                                          borderRadius: BorderRadius.circular(26),
                                          boxShadow: [
                                            BoxShadow(
                                              color: Colors.black.withValues(alpha: 0.28),
                                              blurRadius: 18,
                                              offset: const Offset(0, 8),
                                            ),
                                          ],
                                        ),
                                        alignment: Alignment.center,
                                        child: AnimatedSwitcher(
                                          duration: const Duration(milliseconds: 220),
                                          child: _isGoogleLoading
                                              ? const Row(
                                                  key: ValueKey('google_load'),
                                                  mainAxisAlignment: MainAxisAlignment.center,
                                                  children: [
                                                    SizedBox(
                                                      width: 19,
                                                      height: 19,
                                                      child: CircularProgressIndicator(
                                                        strokeWidth: 2.2,
                                                        color: Color(0xFF111113),
                                                      ),
                                                    ),
                                                    SizedBox(width: 10),
                                                    Text(
                                                      'Signing in...',
                                                      style: TextStyle(
                                                        fontSize: 16,
                                                        fontWeight: FontWeight.w700,
                                                        letterSpacing: -0.2,
                                                        color: Color(0xFF111113),
                                                      ),
                                                    ),
                                                  ],
                                                )
                                              : const Row(
                                                  key: ValueKey('google_idle'),
                                                  mainAxisAlignment: MainAxisAlignment.center,
                                                  children: [
                                                    GoogleLogo(size: 20),
                                                    SizedBox(width: 12),
                                                    Flexible(
                                                      child: Text(
                                                        'Continue with Google',
                                                        maxLines: 1,
                                                        overflow: TextOverflow.ellipsis,
                                                        style: TextStyle(
                                                          fontSize: 16,
                                                          fontWeight: FontWeight.w700,
                                                          letterSpacing: -0.2,
                                                          color: Color(0xFF111113),
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

                                  // 2. Continue with Email
                                  _staggeredButton(
                                    begin: 0.16,
                                    end: 0.68,
                                    child: PressableScale(
                                      scale: 0.96,
                                      onTap: busy ? null : _openEmailSheet,
                                      child: Container(
                                        height: 52,
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 20,
                                        ),
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(26),
                                          gradient: const LinearGradient(
                                            begin: Alignment.topCenter,
                                            end: Alignment.bottomCenter,
                                            colors: [
                                              Color(0xFFFF3B6B),
                                              Color(0xFFE11D48),
                                            ],
                                          ),
                                          border: Border.all(
                                            color: Colors.white.withValues(alpha: 0.22),
                                            width: 0.6,
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: const Color(0xFFE11D48)
                                                  .withValues(alpha: 0.42),
                                              blurRadius: 22,
                                              offset: const Offset(0, 8),
                                            ),
                                          ],
                                        ),
                                        alignment: Alignment.center,
                                        child: const Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
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

                                  // 3. Continue as Guest
                                  _staggeredButton(
                                    begin: 0.32,
                                    end: 0.84,
                                    child: PressableScale(
                                      scale: 0.96,
                                      onTap: busy ? null : _handleGuest,
                                      child: Container(
                                        height: 50,
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 20,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.white.withValues(alpha: 0.14),
                                          borderRadius: BorderRadius.circular(26),
                                          border: Border.all(
                                            color: Colors.white.withValues(alpha: 0.24),
                                            width: 0.8,
                                          ),
                                        ),
                                        alignment: Alignment.center,
                                        child: AnimatedSwitcher(
                                          duration: const Duration(milliseconds: 200),
                                          child: _isGuestLoading
                                              ? const SizedBox(
                                                  key: ValueKey('guest_load'),
                                                  width: 19,
                                                  height: 19,
                                                  child: CircularProgressIndicator(
                                                    strokeWidth: 2.2,
                                                    color: Colors.white,
                                                  ),
                                                )
                                              : Text(
                                                  'Continue as Guest',
                                                  key: const ValueKey('guest_idle'),
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: TextStyle(
                                                    fontSize: 15.5,
                                                    fontWeight: FontWeight.w600,
                                                    letterSpacing: -0.2,
                                                    color: Colors.white
                                                        .withValues(alpha: 0.95),
                                                  ),
                                                ),
                                        ),
                                      ),
                                    ),
                                  ),

                                  const SizedBox(height: 18),

                                  // Footer: Terms & Privacy
                                  _staggeredButton(
                                    begin: 0.45,
                                    end: 1.0,
                                    child: Text(
                                      'By continuing, you agree to the Terms and Privacy Policy.',
                                      style: AT.caption.copyWith(
                                        color: Colors.white.withValues(alpha: 0.65),
                                        fontWeight: FontWeight.w500,
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
            tint: Colors.white.withValues(alpha: 0.16),
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
