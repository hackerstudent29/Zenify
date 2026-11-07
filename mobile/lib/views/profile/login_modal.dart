import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/widgets/zen_button.dart';
import '../../design_system/zen.dart';
import '../../services/auth_state.dart';

Future<void> showLoginModal(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const LoginModal(),
  );
}

class LoginModal extends StatefulWidget {
  const LoginModal({super.key});

  @override
  State<LoginModal> createState() => _LoginModalState();
}

class _LoginModalState extends State<LoginModal> {
  bool _isRegister = false;
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passController = TextEditingController();
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passController.dispose();
    super.dispose();
  }

  Future<void> _submit(AuthState auth) async {
    final email = _emailController.text.trim();
    final pass = _passController.text;
    final name = _nameController.text.trim();

    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Please enter a valid email');
      return;
    }
    if (pass.length < 4) {
      setState(() => _error = 'Password must be at least 4 characters');
      return;
    }

    setState(() => _error = null);
    HapticFeedback.mediumImpact();

    try {
      if (_isRegister) {
        await auth.register(name, email, pass);
      } else {
        await auth.signIn(email, pass);
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = 'Authentication failed. Please try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      padding: EdgeInsets.fromLTRB(24, 20, 24, 24 + bottomInset),
      decoration: BoxDecoration(
        color: const Color(0xFF141416),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 1.0),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),

            // Logo & Title
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
                  ),
                  child: Image.asset(
                    'assets/images/z_logo.png',
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) => Icon(Icons.music_note_rounded, color: Zen.rose, size: 22),
                  ),
                ),
                const SizedBox(width: 10),
                const Text(
                  'ZENIFY',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 2.0,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              _isRegister ? 'Create your Zenify Hi-Fi account' : 'Welcome back to Zenify',
              style: TextStyle(color: Zen.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 20),

            // Mode Selector
            Container(
              height: 36,
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: const Color(0xFF1C1C20),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() {
                          _isRegister = false;
                          _error = null;
                        });
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: !_isRegister ? Colors.white.withValues(alpha: 0.12) : Colors.transparent,
                          borderRadius: BorderRadius.circular(7),
                        ),
                        child: Text(
                          'SIGN IN',
                          style: TextStyle(
                            color: !_isRegister ? Colors.white : Zen.textMuted,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() {
                          _isRegister = true;
                          _error = null;
                        });
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: _isRegister ? Colors.white.withValues(alpha: 0.12) : Colors.transparent,
                          borderRadius: BorderRadius.circular(7),
                        ),
                        child: Text(
                          'REGISTER',
                          style: TextStyle(
                            color: _isRegister ? Colors.white : Zen.textMuted,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),

            if (_error != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: Zen.rose.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Zen.rose.withValues(alpha: 0.3)),
                ),
                child: Text(
                  _error!,
                  style: TextStyle(color: Zen.rose, fontSize: 12, fontWeight: FontWeight.w500),
                ),
              ),
              const SizedBox(height: 14),
            ],

            if (_isRegister) ...[
              _buildField(
                controller: _nameController,
                hint: 'Full Name',
                icon: Icons.person_outline_rounded,
              ),
              const SizedBox(height: 12),
            ],

            _buildField(
              controller: _emailController,
              hint: 'Email address',
              icon: Icons.mail_outline_rounded,
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),

            _buildField(
              controller: _passController,
              hint: 'Password',
              icon: Icons.lock_outline_rounded,
              obscure: _obscure,
              trailing: IconButton(
                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility, color: Colors.white38, size: 18),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            const SizedBox(height: 22),

            ZenButton(
              label: _isRegister ? 'CREATE ACCOUNT' : 'SIGN IN TO ZENIFY',
              width: double.infinity,
              disabled: auth.isLoading,
              onTap: () => _submit(auth),
            ),
            const SizedBox(height: 14),

            // "or" Divider
            Row(
              children: [
                Expanded(child: Container(height: 1, color: Colors.white.withValues(alpha: 0.10))),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text(
                    'or',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.40),
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                Expanded(child: Container(height: 1, color: Colors.white.withValues(alpha: 0.10))),
              ],
            ),
            const SizedBox(height: 14),

            // Continue with Google Button
            InkWell(
              onTap: auth.isLoading ? null : () => _handleGoogleAuth(context, auth),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                height: 44,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const _GoogleLogo(size: 18),
                    const SizedBox(width: 10),
                    Text(
                      _isRegister ? 'Sign up with Google' : 'Continue with Google',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                'CONTINUE AS GUEST',
                style: TextStyle(color: Zen.textMuted, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 1.1),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleGoogleAuth(BuildContext context, AuthState auth) async {
    HapticFeedback.mediumImpact();

    final emailCtrl = TextEditingController(text: 'user@gmail.com');
    final nameCtrl = TextEditingController(text: 'Zenify Listener');

    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF18181B),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.15)),
        ),
        title: Row(
          children: [
            const _GoogleLogo(size: 22),
            const SizedBox(width: 10),
            Text(
              _isRegister ? 'Sign up with Google' : 'Sign in with Google',
              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Authenticate using your Google Account:',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: emailCtrl,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: InputDecoration(
                labelText: 'Google Email',
                labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.6)),
                filled: true,
                fillColor: const Color(0xFF222226),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: nameCtrl,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: InputDecoration(
                labelText: 'Name',
                labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.6)),
                filled: true,
                fillColor: const Color(0xFF222226),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: Colors.white.withValues(alpha: 0.6))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF4285F4),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await auth.signInWithGoogle();
      if (!context.mounted) return;
      Navigator.pop(context);
    }
  }

  Widget _buildField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscure = false,
    Widget? trailing,
    TextInputType? keyboardType,
  }) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E22),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.white54, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: controller,
              obscureText: obscure,
              keyboardType: keyboardType,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: const TextStyle(color: Colors.white38, fontSize: 14),
                border: InputBorder.none,
                isDense: true,
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

class _GoogleLogo extends StatelessWidget {
  const _GoogleLogo({this.size = 18});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _GooglePainter()),
    );
  }
}

class _GooglePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final center = Offset(w / 2, h / 2);
    final radius = w / 2;
    final strokeWidth = w * 0.22;
    final strokeRect = Rect.fromCircle(center: center, radius: radius - strokeWidth / 2);

    final paintRed = Paint()
      ..color = const Color(0xFFEA4335)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    final paintYellow = Paint()
      ..color = const Color(0xFFFBBC05)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    final paintGreen = Paint()
      ..color = const Color(0xFF34A853)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    final paintBlue = Paint()
      ..color = const Color(0xFF4285F4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    // Google G colored arcs
    canvas.drawArc(strokeRect, -1.9, 1.9, false, paintRed);
    canvas.drawArc(strokeRect, 2.2, 1.2, false, paintYellow);
    canvas.drawArc(strokeRect, 0.4, 1.8, false, paintGreen);
    canvas.drawArc(strokeRect, -0.6, 1.0, false, paintBlue);

    // Blue horizontal bar
    final barPaint = Paint()
      ..color = const Color(0xFF4285F4)
      ..style = PaintingStyle.fill;
    final barRect = Rect.fromLTWH(center.dx - strokeWidth * 0.2, center.dy - strokeWidth / 2, radius * 0.9, strokeWidth);
    canvas.drawRect(barRect, barPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
