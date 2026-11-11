import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/apple_glass.dart';
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
  int _dir = 1;

  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _otpCtrl = TextEditingController();
  final FocusNode _emailFocus = FocusNode();
  final FocusNode _otpFocus = FocusNode();

  bool _isSubmitting = false;
  String? _errorMessage;
  int _resendSeconds = 0;
  Timer? _countdownTimer;
  String? _clipboardCode;

  /// Rests at 0.0; on error oscillates left/right via harmonic spring.
  late final AnimationController _shakeController = AnimationController.unbounded(
    vsync: this,
    value: 0.0,
  );

  @override
  void initState() {
    super.initState();
    _emailCtrl.addListener(_onEmailChanged);
    _otpCtrl.addListener(_onOtpChanged);
    _emailFocus.addListener(_onFocusChanged);
    _otpFocus.addListener(_onFocusChanged);
    _checkClipboard();
  }

  @override
  void dispose() {
    _emailCtrl.removeListener(_onEmailChanged);
    _otpCtrl.removeListener(_onOtpChanged);
    _emailFocus.removeListener(_onFocusChanged);
    _otpFocus.removeListener(_onFocusChanged);
    _emailCtrl.dispose();
    _otpCtrl.dispose();
    _emailFocus.dispose();
    _otpFocus.dispose();
    _countdownTimer?.cancel();
    _shakeController.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (mounted) setState(() {});
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
    _shakeController.value = 0.0;
    _shakeController.animateWith(
      SpringSimulation(
        const SpringDescription(mass: 1, stiffness: 900, damping: 14),
        0,
        0,
        280,
      ),
    );
  }

  void _backToEmailStep() {
    if (_isSubmitting) return;
    HapticFeedback.selectionClick();
    setState(() {
      _dir = -1;
      _step = 0;
      _otpCtrl.clear();
      _errorMessage = null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _emailFocus.requestFocus();
    });
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
        _dir = 1;
        _step = 1;
        _resendSeconds = result.cooldownSec;
      });
      _startCountdown();
      _checkClipboard();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _otpFocus.requestFocus();
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
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _otpFocus.requestFocus();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final avail = mq.size.height - mq.viewInsets.bottom - mq.padding.top - 12;
    final maxHeight = math.max(180.0, math.min(mq.size.height * 0.92, avail));
    final bottomPad =
        mq.viewInsets.bottom > 0 ? 16.0 : math.max(mq.padding.bottom, 16.0) + 8.0;

    return AnimatedPadding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      child: Center(
        heightFactor: 1.0,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: 480,
            maxHeight: maxHeight,
          ),
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: const Color(0xED161619),
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(32)),
                  border: Border(
                    top: BorderSide(
                      color: Colors.white.withValues(alpha: 0.14),
                      width: 0.8,
                    ),
                    left: BorderSide(
                      color: Colors.white.withValues(alpha: 0.06),
                      width: 0.6,
                    ),
                    right: BorderSide(
                      color: Colors.white.withValues(alpha: 0.06),
                      width: 0.6,
                    ),
                  ),
                ),
                child: Stack(
                  children: [
                    // Subtle ambient top rose aura
                    Positioned(
                      top: -70,
                      left: 0,
                      right: 0,
                      child: IgnorePointer(
                        child: Center(
                          child: Container(
                            width: 260,
                            height: 140,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: RadialGradient(
                                colors: [
                                  AppColors.accent.withValues(alpha: 0.20),
                                  Colors.transparent,
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),

                    AnimatedBuilder(
                      animation: _shakeController,
                      builder: (context, child) {
                        final offset = _shakeController.value.clamp(-14.0, 14.0);
                        return Transform.translate(
                          offset: Offset(offset, 0),
                          child: child,
                        );
                      },
                      child: SingleChildScrollView(
                        physics: const BouncingScrollPhysics(),
                        padding: EdgeInsets.fromLTRB(24, 12, 24, bottomPad),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // Grabber Handle
                            Center(
                              child: Container(
                                width: 38,
                                height: 5,
                                margin: const EdgeInsets.only(bottom: 14),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.24),
                                  borderRadius: BorderRadius.circular(2.5),
                                ),
                              ),
                            ),

                            // Sheet Navigation Header
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                AnimatedOpacity(
                                  duration: const Duration(milliseconds: 220),
                                  opacity: _step == 1 ? 1.0 : 0.0,
                                  child: IgnorePointer(
                                    ignoring: _step != 1,
                                    child: _SheetCircleButton(
                                      icon: CupertinoIcons.chevron_back,
                                      iconSize: 18,
                                      semanticLabel: 'Back to email',
                                      onTap: _backToEmailStep,
                                    ),
                                  ),
                                ),
                                _SheetCircleButton(
                                  icon: CupertinoIcons.xmark,
                                  iconSize: 15,
                                  semanticLabel: 'Close',
                                  onTap: () => Navigator.of(context).maybePop(),
                                ),
                              ],
                            ),

                            const SizedBox(height: 12),

                            // Smooth Spring Step Switcher
                            AnimatedSize(
                              duration: const Duration(milliseconds: 380),
                              curve: _SheetSpringCurve(Springs.smooth),
                              alignment: Alignment.topCenter,
                              child: AnimatedSwitcher(
                                duration: const Duration(milliseconds: 380),
                                switchInCurve: _SheetSpringCurve(Springs.smooth),
                                switchOutCurve: Curves.easeOutCubic,
                                layoutBuilder: (currentChild, previousChildren) =>
                                    Stack(
                                  alignment: Alignment.topCenter,
                                  children: [
                                    ...previousChildren,
                                    ?currentChild,
                                  ],
                                ),
                                transitionBuilder: (child, anim) {
                                  final isIncoming =
                                      child.key == ValueKey<int>(_step);
                                  final slideBegin = Offset(
                                    (isIncoming ? 0.12 : -0.12) * _dir,
                                    0,
                                  );
                                  return FadeTransition(
                                    opacity: anim,
                                    child: SlideTransition(
                                      position: Tween<Offset>(
                                        begin: slideBegin,
                                        end: Offset.zero,
                                      ).animate(anim),
                                      child: child,
                                    ),
                                  );
                                },
                                child: KeyedSubtree(
                                  key: ValueKey<int>(_step),
                                  child: _step == 0
                                      ? _buildEmailStep()
                                      : _buildOtpStep(),
                                ),
                              ),
                            ),
                          ],
                        ),
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

  Widget _buildEmailStep() {
    final canSubmit = _isEmailValid && !_isSubmitting;
    final hasFocus = _emailFocus.hasFocus;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const SpringIn(
          delayMs: 0,
          rise: 16,
          child: Text(
            "What's your email?",
            style: TextStyle(
              fontFamily: 'SF Pro Display',
              fontSize: 28,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.7,
              height: 1.12,
              color: AppColors.textPrimary,
            ),
          ),
        ),
        const SizedBox(height: 8),
        SpringIn(
          delayMs: 45,
          rise: 14,
          child: Text(
            "We'll send you a 6-digit confirmation code.",
            style: TextStyle(
              fontFamily: 'SF Pro',
              fontSize: 15,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.15,
              height: 1.35,
              color: Colors.white.withValues(alpha: 0.70),
            ),
          ),
        ),
        const SizedBox(height: 22),

        // Email Input Container
        SpringIn(
          delayMs: 90,
          rise: 14,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            height: 54,
            decoration: BoxDecoration(
              color: const Color(0xFF232328),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: _errorMessage != null
                    ? AppColors.danger
                    : hasFocus
                        ? AppColors.accent.withValues(alpha: 0.85)
                        : Colors.white.withValues(alpha: 0.14),
                width: hasFocus || _errorMessage != null ? 1.4 : 0.8,
              ),
            ),
            padding: const EdgeInsets.only(left: 16, right: 10),
            alignment: Alignment.center,
            child: Row(
              children: [
                Icon(
                  CupertinoIcons.mail,
                  size: 18,
                  color: hasFocus
                      ? AppColors.accentSoft
                      : Colors.white.withValues(alpha: 0.50),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _emailCtrl,
                    focusNode: _emailFocus,
                    autofocus: true,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.email],
                    autocorrect: false,
                    cursorColor: AppColors.accent,
                    style: const TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                    decoration: InputDecoration(
                      hintText: 'name@email.com',
                      hintStyle: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        color: Colors.white.withValues(alpha: 0.45),
                      ),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.zero,
                    ),
                    onSubmitted: (_) => _sendCode(),
                  ),
                ),
                SpringPop(
                  visible: _emailCtrl.text.isNotEmpty,
                  child: PressableScale(
                    scale: 0.85,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      _emailCtrl.clear();
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withValues(alpha: 0.14),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          CupertinoIcons.xmark,
                          size: 12,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        // Inline Error Reveal
        SpringReveal(
          visible: _errorMessage != null,
          child: Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(
              children: [
                const Icon(
                  CupertinoIcons.exclamationmark_circle_fill,
                  size: 15,
                  color: AppColors.danger,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _errorMessage ?? '',
                    style: const TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFFFF7D75),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 22),

        // Unified Stadium Primary CTA
        SpringIn(
          delayMs: 135,
          rise: 14,
          child: PressableScale(
            scale: 0.96,
            onTap: canSubmit ? _sendCode : null,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              height: 52,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(26),
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: canSubmit
                      ? const [AppColors.accent, AppColors.crimson]
                      : [
                          AppColors.accent.withValues(alpha: 0.30),
                          AppColors.crimson.withValues(alpha: 0.30),
                        ],
                ),
                border: Border.all(
                  color: Colors.white.withValues(alpha: canSubmit ? 0.18 : 0.06),
                  width: 0.6,
                ),
                boxShadow: canSubmit
                    ? [
                        BoxShadow(
                          color: AppColors.accent.withValues(alpha: 0.32),
                          blurRadius: 18,
                          offset: const Offset(0, 6),
                        ),
                      ]
                    : const [],
              ),
              alignment: Alignment.center,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 21,
                      height: 21,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.3,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      'Continue',
                      style: TextStyle(
                        fontFamily: 'SF Pro Display',
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.2,
                        color: Colors.white.withValues(alpha: canSubmit ? 1 : 0.6),
                      ),
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
    final canVerify = otpText.length == 6 && !_isSubmitting;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const SpringIn(
          delayMs: 0,
          rise: 16,
          child: Text(
            'Enter the code',
            style: TextStyle(
              fontFamily: 'SF Pro Display',
              fontSize: 28,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.7,
              height: 1.12,
              color: AppColors.textPrimary,
            ),
          ),
        ),
        const SizedBox(height: 8),
        SpringIn(
          delayMs: 40,
          rise: 12,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Sent to $email',
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 14.5,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.70),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              PressableScale(
                scale: 0.94,
                onTap: _backToEmailStep,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Text(
                    'Change',
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.accentSoft,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        // Clipboard quick paste chip
        SpringReveal(
          visible: _clipboardCode != null && otpText.isEmpty,
          child: Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Center(
              child: PressableScale(
                scale: 0.94,
                onTap: () {
                  final code = _clipboardCode;
                  if (code == null) return;
                  HapticFeedback.selectionClick();
                  _otpCtrl.value = TextEditingValue(
                    text: code,
                    selection: TextSelection.collapsed(offset: code.length),
                  );
                  setState(() => _clipboardCode = null);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    color: AppColors.accentMaroon.withValues(alpha: 0.34),
                    border: Border.all(
                      color: AppColors.accentSoft.withValues(alpha: 0.45),
                      width: 0.8,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        CupertinoIcons.doc_on_clipboard_fill,
                        size: 14,
                        color: AppColors.accentSoft,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Paste code ${_clipboardCode ?? ''}',
                        style: const TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.accentSoft,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        const SizedBox(height: 24),

        // Responsive 6 OTP Cells + Hidden Driving TextField
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => _otpFocus.requestFocus(),
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Hidden native driving TextField
              SizedBox(
                width: 1,
                height: 1,
                child: Opacity(
                  opacity: 0,
                  child: TextField(
                    controller: _otpCtrl,
                    focusNode: _otpFocus,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    autofillHints: const [AutofillHints.oneTimeCode],
                    maxLength: 6,
                    buildCounter: (
                      _, {
                      required currentLength,
                      required isFocused,
                      maxLength,
                    }) =>
                        null,
                    enableSuggestions: false,
                    autocorrect: false,
                  ),
                ),
              ),

              // Responsive 6-cell row that never overflows on narrow screens
              LayoutBuilder(
                builder: (context, constraints) {
                  final maxRowWidth = math.min(constraints.maxWidth, 372.0);
                  const gap = 8.0;
                  final cellW = ((maxRowWidth - gap * 5) / 6)
                      .floorToDouble()
                      .clamp(36.0, 54.0);
                  final cellH = (cellW * 1.20).clamp(48.0, 62.0);

                  return Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < 6; i++) ...[
                        if (i > 0) const SizedBox(width: gap),
                        _OtpDigitCell(
                          width: cellW,
                          height: cellH,
                          digit: i < otpText.length ? otpText[i] : '',
                          isActive: _otpFocus.hasFocus &&
                              (i == otpText.length ||
                                  (otpText.length == 6 && i == 5)),
                          hasError: _errorMessage != null,
                        ),
                      ],
                    ],
                  );
                },
              ),
            ],
          ),
        ),

        // Inline Error Reveal
        SpringReveal(
          visible: _errorMessage != null,
          child: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  CupertinoIcons.exclamationmark_circle_fill,
                  size: 15,
                  color: AppColors.danger,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    _errorMessage ?? '',
                    style: const TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFFFF7D75),
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 24),

        // Unified Stadium Primary Verify CTA
        PressableScale(
          scale: 0.96,
          onTap: canVerify ? _submitOtp : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            height: 52,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: (canVerify || _isSubmitting)
                    ? const [AppColors.accent, AppColors.crimson]
                    : [
                        AppColors.accent.withValues(alpha: 0.30),
                        AppColors.crimson.withValues(alpha: 0.30),
                      ],
              ),
              border: Border.all(
                color: Colors.white.withValues(
                  alpha: (canVerify || _isSubmitting) ? 0.18 : 0.06,
                ),
                width: 0.6,
              ),
              boxShadow: canVerify
                  ? [
                      BoxShadow(
                        color: AppColors.accent.withValues(alpha: 0.32),
                        blurRadius: 18,
                        offset: const Offset(0, 6),
                      ),
                    ]
                  : const [],
            ),
            alignment: Alignment.center,
            child: _isSubmitting
                ? const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 19,
                        height: 19,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.3,
                          color: Colors.white,
                        ),
                      ),
                      SizedBox(width: 10),
                      Text(
                        'Verifying...',
                        style: TextStyle(
                          fontFamily: 'SF Pro Display',
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  )
                : Text(
                    'Verify Code',
                    style: TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                      color: Colors.white.withValues(alpha: canVerify ? 1 : 0.6),
                    ),
                  ),
          ),
        ),

        const SizedBox(height: 16),

        // Resend Timer / Action
        Center(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            child: _resendSeconds > 0
                ? Padding(
                    key: const ValueKey('resend_wait'),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      'Resend code in 0:${_resendSeconds.toString().padLeft(2, '0')}',
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: Colors.white.withValues(alpha: 0.60),
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  )
                : PressableScale(
                    key: const ValueKey('resend_ready'),
                    scale: 0.94,
                    onTap: _isSubmitting ? null : _sendCode,
                    child: const Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      child: Text(
                        'Resend Code',
                        style: TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.accentSoft,
                        ),
                      ),
                    ),
                  ),
          ),
        ),
      ],
    );
  }
}

/// Individual OTP digit cell with bouncy spring pop when populated.
class _OtpDigitCell extends StatefulWidget {
  const _OtpDigitCell({
    required this.width,
    required this.height,
    required this.digit,
    required this.isActive,
    required this.hasError,
  });

  final double width;
  final double height;
  final String digit;
  final bool isActive;
  final bool hasError;

  @override
  State<_OtpDigitCell> createState() => _OtpDigitCellState();
}

class _OtpDigitCellState extends State<_OtpDigitCell>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pop = AnimationController.unbounded(
    vsync: this,
    value: 1.0,
  );

  @override
  void didUpdateWidget(covariant _OtpDigitCell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.digit != widget.digit && widget.digit.isNotEmpty) {
      _pop.value = 0.86;
      springTo(_pop, 1.0, Springs.bouncy);
    }
  }

  @override
  void dispose() {
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isFilled = widget.digit.isNotEmpty;
    final borderColor = widget.hasError
        ? AppColors.danger
        : widget.isActive
            ? AppColors.accent
            : isFilled
                ? Colors.white.withValues(alpha: 0.36)
                : Colors.white.withValues(alpha: 0.14);

    return AnimatedBuilder(
      animation: _pop,
      builder: (context, child) => Transform.scale(
        scale: _pop.value.clamp(0.8, 1.16),
        child: child,
      ),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
        width: widget.width,
        height: widget.height,
        decoration: ShapeDecoration(
          shape: ContinuousRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: BorderSide(
              color: borderColor,
              width: widget.isActive || widget.hasError ? 1.8 : 1.0,
            ),
          ),
          color: widget.isActive
              ? const Color(0xFF28282E)
              : const Color(0xFF222227),
          shadows: widget.isActive
              ? [
                  BoxShadow(
                    color: AppColors.accent.withValues(alpha: 0.20),
                    blurRadius: 12,
                    spreadRadius: -2,
                  ),
                ]
              : const [],
        ),
        alignment: Alignment.center,
        child: isFilled
            ? Text(
                widget.digit,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              )
            : (widget.isActive
                ? Container(
                    width: 2,
                    height: 22,
                    decoration: BoxDecoration(
                      color: AppColors.accent,
                      borderRadius: BorderRadius.circular(1),
                    ),
                  )
                : const SizedBox.shrink()),
      ),
    );
  }
}

/// Circular Apple Glass icon-only button (`BoxShape.circle`).
class _SheetCircleButton extends StatelessWidget {
  const _SheetCircleButton({
    required this.icon,
    required this.iconSize,
    required this.onTap,
    this.semanticLabel,
  });

  final IconData icon;
  final double iconSize;
  final VoidCallback onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    const size = 36.0;
    return Semantics(
      button: true,
      label: semanticLabel,
      child: PressableScale(
        scale: 0.88,
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
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
    );
  }
}

/// Curve driven by a physical SpringDescription from `spring_kit.dart`.
class _SheetSpringCurve extends Curve {
  const _SheetSpringCurve(this.description);

  final SpringDescription description;

  @override
  double transformInternal(double t) {
    final sim = SpringSimulation(description, 0, 1, 0);
    return sim.x(t * 0.85).clamp(0.0, 1.0);
  }
}
