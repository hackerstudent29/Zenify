import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../services/auth_state.dart';
import 'email_otp_sheet.dart';
import 'google_logo.dart';
import 'onboarding_sheet.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key, this.onFinished});

  final VoidCallback? onFinished;

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  bool _isGoogleLoading = false;
  String? _errorMessage;

  Future<void> _handleGoogleSignIn() async {
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
      if (result.error != null && !result.error!.contains('cancelled')) {
        setState(() => _errorMessage = result.error);
        HapticFeedback.mediumImpact();
      }
    }
  }

  void _openEmailSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
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
      backgroundColor: Colors.transparent,
      builder: (ctx) => OnboardingSheet(
        onCompleted: () {
          Navigator.of(ctx).pop();
          _done();
        },
      ),
    );
  }

  Future<void> _handleGuest() async {
    final auth = context.read<AuthState>();
    await auth.continueAsGuest();
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
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0C),
      body: Stack(
        children: [
          // Ambient glow behind mark
          Positioned(
            top: 140,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppColors.accentMaroon.withValues(alpha: 0.35),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                children: [
                  const Spacer(flex: 3),

                  // 1. App Mark (72pt)
                  SpringIn(
                    delayMs: 0,
                    rise: 36,
                    child: Container(
                      width: 88,
                      height: 88,
                      decoration: ShapeDecoration(
                        shape: ContinuousRectangleBorder(
                          borderRadius: BorderRadius.circular(36),
                          side: BorderSide(
                            color: Colors.white.withValues(alpha: 0.12),
                          ),
                        ),
                        color: const Color(0xFF18181B),
                        shadows: [
                          BoxShadow(
                            color: AppColors.accent.withValues(alpha: 0.25),
                            blurRadius: 32,
                            spreadRadius: -4,
                            offset: const Offset(0, 12),
                          ),
                        ],
                      ),
                      alignment: Alignment.center,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: Image.asset(
                          'assets/images/z_logo.png',
                          width: 58,
                          height: 58,
                          fit: BoxFit.contain,
                          errorBuilder: (context, error, stackTrace) => const Icon(
                            Icons.graphic_eq_rounded,
                            size: 46,
                            color: AppColors.accent,
                          ),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // 2. Title & Tagline
                  SpringIn(
                    delayMs: 60,
                    rise: 28,
                    child: Column(
                      children: [
                        Text(
                          'Zenify',
                          style: GoogleFonts.inter(
                            fontSize: 38,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -1.2,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Music. Elevated to Studio Fidelity.',
                          style: GoogleFonts.inter(
                            fontSize: 15,
                            fontWeight: FontWeight.w400,
                            color: Colors.white.withValues(alpha: 0.55),
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),

                  if (_errorMessage != null) ...[
                    const SizedBox(height: 16),
                    SpringIn(
                      delayMs: 80,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: ShapeDecoration(
                          shape: ContinuousRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                            side: BorderSide(color: AppColors.danger.withValues(alpha: 0.4)),
                          ),
                          color: AppColors.danger.withValues(alpha: 0.12),
                        ),
                        child: Text(
                          _errorMessage!,
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: AppColors.danger,
                            fontWeight: FontWeight.w500,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ],

                  const Spacer(flex: 4),

                  // 3. Action Buttons
                  // Google Sign-In Button (Apple-style squircle, official Google branding)
                  SpringIn(
                    delayMs: 120,
                    rise: 24,
                    child: PressableScale(
                      onTap: _isGoogleLoading ? null : _handleGoogleSignIn,
                      child: Container(
                        height: 56,
                        decoration: ShapeDecoration(
                          shape: ContinuousRectangleBorder(
                            borderRadius: BorderRadius.circular(26),
                          ),
                          color: Colors.white,
                        ),
                        alignment: Alignment.center,
                        child: _isGoogleLoading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.2,
                                  color: Colors.black87,
                                ),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const GoogleLogo(size: 20),
                                  const SizedBox(width: 12),
                                  Text(
                                    'Continue with Google',
                                    style: GoogleFonts.inter(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                      color: const Color(0xFF1F1F1F),
                                      letterSpacing: -0.2,
                                    ),
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  // Continue with Email (Accent Filled Button)
                  SpringIn(
                    delayMs: 180,
                    rise: 24,
                    child: PressableScale(
                      onTap: _openEmailSheet,
                      child: Container(
                        height: 56,
                        decoration: ShapeDecoration(
                          shape: ContinuousRectangleBorder(
                            borderRadius: BorderRadius.circular(26),
                          ),
                          color: AppColors.accent,
                        ),
                        alignment: Alignment.center,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.mail_outline_rounded,
                                size: 20, color: Colors.white),
                            const SizedBox(width: 10),
                            Text(
                              'Continue with email',
                              style: GoogleFonts.inter(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                                letterSpacing: -0.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  // Continue as Guest (Subtle text button)
                  SpringIn(
                    delayMs: 240,
                    rise: 24,
                    child: PressableScale(
                      onTap: _handleGuest,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Text(
                          'Continue as guest',
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.55),
                          ),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Footer: Terms & Privacy
                  SpringIn(
                    delayMs: 300,
                    child: Padding(
                      padding: EdgeInsets.only(bottom: bottomPadding > 0 ? 8 : 16),
                      child: Text(
                        'By continuing you agree to the Terms and Privacy Policy',
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          color: Colors.white.withValues(alpha: 0.35),
                          height: 1.4,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
