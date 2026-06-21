import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'dart:ui';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  bool _isLoading = false;
  bool _isLogin = true;
  bool _showPassword = false;

  Future<void> _submit() async {
    setState(() => _isLoading = true);
    try {
      if (_isLogin) {
        await Supabase.instance.client.auth.signInWithPassword(
          email: _emailController.text.trim(),
          password: _passwordController.text.trim(),
        );
      } else {
        await Supabase.instance.client.auth.signUp(
          email: _emailController.text.trim(),
          password: _passwordController.text.trim(),
          data: {'full_name': _nameController.text.trim()},
        );
      }
      if (mounted) {
        context.go('/');
      }
    } on AuthException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.redAccent,
        ));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    bool isPassword = false,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: Colors.white.withOpacity(0.4),
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          obscureText: isPassword && !_showPassword,
          keyboardType: keyboardType,
          style: const TextStyle(color: Colors.white, fontSize: 13),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
            filled: true,
            fillColor: Colors.white.withOpacity(0.03),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.white.withOpacity(0.08)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: Colors.white.withOpacity(0.08)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFE11D48), width: 1),
            ),
            suffixIcon: isPassword
                ? IconButton(
                    icon: Icon(
                      _showPassword ? LucideIcons.eyeOff : LucideIcons.eye,
                      color: Colors.white.withOpacity(0.4),
                      size: 16,
                    ),
                    onPressed: () => setState(() => _showPassword = !_showPassword),
                  )
                : null,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Animated gradient background
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF1E1E1E), Color(0xFF000000)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),
          Positioned(
            top: -100,
            left: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFE11D48).withOpacity(0.15),
              ),
            ).animate(onPlay: (controller) => controller.repeat()).custom(
              duration: 10.seconds,
              curve: Curves.easeInOut,
              builder: (context, value, child) => Transform.translate(
                offset: Offset(value * 50, value * 50),
                child: child,
              ),
            ),
          ),
          Positioned.fill(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 50, sigmaY: 50),
              child: const SizedBox(),
            ),
          ),
          
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 32.0),
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 340),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Header
                      Column(
                        children: [
                          Icon(LucideIcons.radio, size: 48, color: const Color(0xFFE11D48)),
                          const SizedBox(height: 20),
                          Text(
                            _isLogin ? 'Welcome back' : 'Create account',
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.5,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _isLogin ? 'Sign in to continue listening' : 'Start your music journey',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.white.withOpacity(0.5),
                            ),
                          ),
                        ],
                      ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1),
                      
                      const SizedBox(height: 32),
                      
                      // Form
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (!_isLogin) ...[
                            _buildTextField(
                              controller: _nameController,
                              label: 'Name',
                              hint: 'Your name',
                            ).animate().fadeIn().slideX(),
                            const SizedBox(height: 16),
                          ],
                          _buildTextField(
                            controller: _emailController,
                            label: 'Email',
                            hint: 'you@example.com',
                            keyboardType: TextInputType.emailAddress,
                          ).animate().fadeIn(delay: 100.ms).slideX(),
                          const SizedBox(height: 16),
                          _buildTextField(
                            controller: _passwordController,
                            label: 'Password',
                            hint: '••••••••',
                            isPassword: true,
                          ).animate().fadeIn(delay: 200.ms).slideX(),
                          
                          if (!_isLogin) ...[
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                Checkbox(
                                  value: true,
                                  onChanged: (v) {},
                                  activeColor: const Color(0xFFE11D48),
                                  side: BorderSide(color: Colors.white.withOpacity(0.1)),
                                ),
                                Text(
                                  'I agree to the Terms & Privacy Policy',
                                  style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.5)),
                                ),
                              ],
                            ).animate().fadeIn(delay: 300.ms),
                          ],
                          
                          const SizedBox(height: 24),
                          
                          ElevatedButton(
                            onPressed: _isLoading ? null : _submit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF18181B), // zinc-900
                              foregroundColor: const Color(0xFFE11D48), // brand
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                              elevation: 0,
                            ),
                            child: _isLoading
                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Color(0xFFE11D48), strokeWidth: 2))
                                : Text(
                                    _isLogin ? 'Sign In' : 'Create Account',
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                                  ),
                          ).animate().fadeIn(delay: 300.ms).scale(),
                          
                          const SizedBox(height: 24),
                          
                          // Divider
                          Row(
                            children: [
                              Expanded(child: Divider(color: Colors.white.withOpacity(0.05))),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 12),
                                child: Text('OR', style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.3), letterSpacing: 1.0)),
                              ),
                              Expanded(child: Divider(color: Colors.white.withOpacity(0.05))),
                            ],
                          ).animate().fadeIn(delay: 400.ms),
                          
                          const SizedBox(height: 24),
                          
                          // Google Button
                          OutlinedButton.icon(
                            onPressed: () {},
                            icon: const Icon(LucideIcons.globe, color: Colors.white, size: 16),
                            label: const Text('Google', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
                            style: OutlinedButton.styleFrom(
                              backgroundColor: Colors.white.withOpacity(0.02),
                              side: BorderSide(color: Colors.white.withOpacity(0.08)),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                          ).animate().fadeIn(delay: 500.ms),
                        ],
                      ),
                      
                      const SizedBox(height: 32),
                      
                      // Footer Switcher
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            _isLogin ? "Don't have an account?" : "Already have an account?",
                            style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.4)),
                          ),
                          TextButton(
                            onPressed: () => setState(() {
                              _isLogin = !_isLogin;
                              _emailController.clear();
                              _passwordController.clear();
                            }),
                            child: Text(
                              _isLogin ? "Sign up now" : "Sign in",
                              style: const TextStyle(fontSize: 13, color: Color(0xFFE11D48), fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ).animate().fadeIn(delay: 600.ms),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
