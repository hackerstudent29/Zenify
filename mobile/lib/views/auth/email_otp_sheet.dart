import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../services/auth_state.dart';
import '../../services/dock_visibility.dart';

class EmailOtpSheet extends StatefulWidget {
  const EmailOtpSheet({
    super.key,
    required this.onAuthenticated,
  });

  final void Function(bool isNewUser) onAuthenticated;

  @override
  State<EmailOtpSheet> createState() => _EmailOtpSheetState();
}

class _EmailOtpSheetState extends State<EmailOtpSheet>
    with TickerProviderStateMixin, HideDocksMixin {
  int _step = 0; // 0 = email, 1 = otp
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _otpCtrl = TextEditingController();
  final FocusNode _emailFocus = FocusNode();
  final FocusNode _otpFocus = FocusNode();

  bool _isSubmitting = false;
  String? _errorMessage;
  int _resendSeconds = 0;
  Timer? _countdownTimer;
  String? _clipboardCode;

  // Spring shake controllers
  late final AnimationController _shakeController = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );

  @override
  void initState() {
    super.initState();
    _emailCtrl.addListener(_onEmailChanged);
    _otpCtrl.addListener(_onOtpChanged);
    _checkClipboard();
  }

  @override
  void dispose() {
    _emailCtrl.removeListener(_onEmailChanged);
    _otpCtrl.removeListener(_onOtpChanged);
    _emailCtrl.dispose();
    _otpCtrl.dispose();
    _emailFocus.dispose();
    _otpFocus.dispose();
    _countdownTimer?.cancel();
    _shakeController.dispose();
    super.dispose();
  }

  void _onEmailChanged() {
    setState(() {
      _errorMessage = null;
    });
  }

  void _onOtpChanged() {
    setState(() {
      _errorMessage = null;
    });
    if (_otpCtrl.text.length == 6 && !_isSubmitting) {
      _submitOtp();
    }
  }

  bool get _isEmailValid {
    final text = _emailCtrl.text.trim();
    return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(text);
  }

  Future<void> _checkClipboard() async {
    try {
      final data = await Clipboard.getData('text/plain');
      final text = data?.text?.trim();
      if (text != null && text.length == 6 && int.tryParse(text) != null) {
        if (mounted) setState(() => _clipboardCode = text);
      }
    } catch (_) {}
  }

  void _triggerShake() {
    HapticFeedback.mediumImpact();
    _shakeController.animateWith(
      SpringSimulation(
        const SpringDescription(mass: 1, stiffness: 600, damping: 18),
        0,
        1,
        25,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1: Send OTP
  // ---------------------------------------------------------------------------
  Future<void> _sendCode() async {
    if (!_isEmailValid || _isSubmitting) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final auth = context.read<AuthState>();
    final result = await auth.requestEmailOtp(_emailCtrl.text.trim());

    if (!mounted) return;

    if (result.success) {
      setState(() {
        _isSubmitting = false;
        _step = 1;
        _resendSeconds = result.cooldownSec;
      });
      _startCountdown();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _otpFocus.requestFocus();
      });
    } else {
      setState(() {
        _isSubmitting = false;
        _errorMessage = result.message;
      });
      _triggerShake();
    }
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_resendSeconds <= 1) {
        timer.cancel();
        setState(() => _resendSeconds = 0);
      } else {
        setState(() => _resendSeconds--);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Step 2: Verify OTP
  // ---------------------------------------------------------------------------
  Future<void> _submitOtp() async {
    if (_isSubmitting) return;

    final code = _otpCtrl.text.trim();
    if (code.length != 6) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final auth = context.read<AuthState>();
    final result = await auth.verifyEmailOtp(_emailCtrl.text.trim(), code);

    if (!mounted) return;

    if (result.success) {
      HapticFeedback.lightImpact();
      widget.onAuthenticated(result.isNewUser);
    } else {
      setState(() {
        _isSubmitting = false;
        _errorMessage = result.error ?? 'Invalid verification code';
        _otpCtrl.clear();
      });
      _triggerShake();
      _otpFocus.requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return AnimatedPadding(
      padding: EdgeInsets.only(bottom: bottomInset),
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF161618),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: AnimatedBuilder(
          animation: _shakeController,
          builder: (context, child) {
            final offset = (1 - _shakeController.value).clamp(-1.0, 1.0) * 8.0;
            return Transform.translate(
              offset: Offset(offset, 0),
              child: child,
            );
          },
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Drag Indicator
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 24),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              if (_step == 0) _buildEmailStep() else _buildOtpStep(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmailStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          "What's your email?",
          style: const TextStyle(
            fontFamily: 'SF Pro Display',
            fontSize: 26,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.6,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          "We'll send you a 6-digit confirmation code.",
          style: TextStyle(
            fontFamily: 'SF Pro',
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.white.withValues(alpha: 0.65),
          ),
        ),
        const SizedBox(height: 24),

        // Email textfield container
        Container(
          height: 56,
          decoration: ShapeDecoration(
            shape: ContinuousRectangleBorder(
              borderRadius: BorderRadius.circular(24),
              side: BorderSide(
                color: _errorMessage != null
                    ? AppColors.danger
                    : Colors.white.withValues(alpha: 0.12),
              ),
            ),
            color: const Color(0xFF222226),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          alignment: Alignment.center,
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _emailCtrl,
                  focusNode: _emailFocus,
                  autofocus: true,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  autocorrect: false,
                  style: const TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 16,
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                  ),
                  decoration: InputDecoration(
                    hintText: 'name@email.com',
                    hintStyle: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 16,
                      fontWeight: FontWeight.w400,
                      color: Colors.white.withValues(alpha: 0.35),
                    ),
                    border: InputBorder.none,
                    isDense: true,
                  ),
                  onSubmitted: (_) => _sendCode(),
                ),
              ),
              SpringPop(
                visible: _emailCtrl.text.isNotEmpty,
                child: IconButton(
                  icon: const Icon(Icons.cancel, size: 18, color: Colors.white38),
                  onPressed: () => _emailCtrl.clear(),
                ),
              ),
            ],
          ),
        ),

        if (_errorMessage != null) ...[
          const SizedBox(height: 10),
          Text(
            _errorMessage!,
            style: const TextStyle(
              fontFamily: 'SF Pro',
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.danger,
            ),
          ),
        ],

        const SizedBox(height: 24),

        // Continue Button
        PressableScale(
          onTap: _isEmailValid && !_isSubmitting ? _sendCode : null,
          child: Container(
            height: 54,
            decoration: ShapeDecoration(
              shape: ContinuousRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              color: _isEmailValid && !_isSubmitting
                  ? AppColors.accent
                  : AppColors.accent.withValues(alpha: 0.3),
            ),
            alignment: Alignment.center,
            child: _isSubmitting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : const Text(
                    'Continue',
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildOtpStep() {
    final email = _emailCtrl.text.trim();
    final otpText = _otpCtrl.text;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Enter the code',
          style: const TextStyle(
            fontFamily: 'SF Pro Display',
            fontSize: 26,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.6,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Text(
                'Sent to $email',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.65),
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            PressableScale(
              onTap: () {
                setState(() {
                  _step = 0;
                  _otpCtrl.clear();
                  _errorMessage = null;
                });
                _emailFocus.requestFocus();
              },
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: Text(
                  'Change',
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accentSoft,
                  ),
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 28),

        // Clipboard quick paste chip
        if (_clipboardCode != null && otpText.isEmpty) ...[
          Center(
            child: PressableScale(
              onTap: () {
                _otpCtrl.text = _clipboardCode!;
                setState(() => _clipboardCode = null);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: ShapeDecoration(
                  shape: ContinuousRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: AppColors.accentSoft.withValues(alpha: 0.4)),
                  ),
                  color: AppColors.accentMaroon.withValues(alpha: 0.3),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.paste_rounded, size: 14, color: AppColors.accentSoft),
                    const SizedBox(width: 6),
                    Text(
                      'Paste code $_clipboardCode',
                      style: const TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accentSoft,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],

        // 6 OTP Cells with Hidden Driving TextField
        Stack(
          alignment: Alignment.center,
          children: [
            // Hidden native textfield for keyboard & autofill
            Opacity(
              opacity: 0,
              child: TextField(
                controller: _otpCtrl,
                focusNode: _otpFocus,
                autofocus: true,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                maxLength: 6,
                enableSuggestions: false,
                autocorrect: false,
              ),
            ),

            // Visible 6 continuous squircle cells
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(6, (index) {
                final isFilled = index < otpText.length;
                final isActive = index == otpText.length;
                final char = isFilled ? otpText[index] : '';

                return AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 48,
                  height: 58,
                  decoration: ShapeDecoration(
                    shape: ContinuousRectangleBorder(
                      borderRadius: BorderRadius.circular(22),
                      side: BorderSide(
                        color: _errorMessage != null
                            ? AppColors.danger
                            : isActive
                                ? AppColors.accent
                                : Colors.white.withValues(alpha: isFilled ? 0.35 : 0.12),
                        width: isActive ? 2 : 1,
                      ),
                    ),
                    color: const Color(0xFF222226),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    char,
                    style: const TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                );
              }),
            ),
          ],
        ),

        if (_errorMessage != null) ...[
          const SizedBox(height: 12),
          Text(
            _errorMessage!,
            style: const TextStyle(
              fontFamily: 'SF Pro',
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.danger,
            ),
            textAlign: TextAlign.center,
          ),
        ],

        const SizedBox(height: 28),

        // Resend Timer / Action
        Center(
          child: _resendSeconds > 0
              ? Text(
                  'Resend code in 0:${_resendSeconds.toString().padLeft(2, '0')}',
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.55),
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                )
              : PressableScale(
                  onTap: _isSubmitting ? null : _sendCode,
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Text(
                      'Resend Code',
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accentSoft,
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}
