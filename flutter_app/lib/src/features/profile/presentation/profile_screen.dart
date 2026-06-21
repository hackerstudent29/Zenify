import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:go_router/go_router.dart';
import 'dart:math' as math;

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  String? _openSection;

  final List<Map<String, dynamic>> _sections = [
    {'id': 'profile', 'title': 'Profile', 'icon': LucideIcons.user, 'isDanger': false},
    {'id': 'analytics', 'title': 'Analytics', 'icon': LucideIcons.barChart3, 'isDanger': false},
    {'id': 'subscription', 'title': 'Subscription', 'icon': LucideIcons.creditCard, 'isDanger': false},
    {'id': 'security', 'title': 'Security', 'icon': LucideIcons.shield, 'isDanger': false},
    {'id': 'danger', 'title': 'Danger Zone', 'icon': LucideIcons.alertOctagon, 'isDanger': true},
  ];

  Future<void> _logout() async {
    await Supabase.instance.client.auth.signOut();
    if (mounted) {
      context.go('/login');
    }
  }

  Widget _buildContent(String id) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Center(
        child: Text(
          '$id settings coming soon...',
          style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 14),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;
    final user = session?.user;
    
    // For demo/UI if not logged in
    final email = user?.email ?? 'demo@zenify.com';
    final name = user?.userMetadata?['full_name'] ?? email.split('@').first;
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Column(
            children: [
              // Header
              Row(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: const Color(0xFF18181B), // zinc-900
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white.withOpacity(0.1)),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Center(
                      child: Text(
                        initial,
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          email,
                          style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.3)),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 16),
                  GestureDetector(
                    onTap: () => context.push('/settings'),
                    child: Container(
                      width: 36,
                      height: 36,
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.05),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white.withOpacity(0.1)),
                      ),
                      child: const Center(
                        child: Icon(LucideIcons.settings, color: Colors.white, size: 15),
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: _logout,
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFFF43F5E).withOpacity(0.1), // rose-500/10
                        shape: BoxShape.circle,
                        border: Border.all(color: const Color(0xFFF43F5E).withOpacity(0.2)),
                      ),
                      child: const Center(
                        child: Icon(LucideIcons.logOut, color: Color(0xFFF43F5E), size: 15),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Accordions
              ..._sections.map((section) {
                final id = section['id'] as String;
                final isOpen = _openSection == id;
                final isDanger = section['isDanger'] as bool;
                
                final borderColor = isOpen
                    ? (isDanger ? const Color(0xFFF43F5E).withOpacity(0.3) : Colors.white.withOpacity(0.1))
                    : Colors.white.withOpacity(0.05);
                final bgColor = isOpen
                    ? (isDanger ? Colors.black : Colors.white.withOpacity(0.05))
                    : Colors.white.withOpacity(0.02);

                final iconBg = isOpen
                    ? (isDanger ? Colors.black : const Color(0xFF18181B)) // zinc-900
                    : Colors.white.withOpacity(0.08); // white/8
                final iconColor = isOpen
                    ? (isDanger ? const Color(0xFFF43F5E) : const Color(0xFFE11D48)) // text-rose-500 or text-brand
                    : const Color(0xFFE11D48).withOpacity(0.5); // text-brand/50

                final iconBorderColor = isOpen && isDanger
                    ? const Color(0xFFF43F5E).withOpacity(0.2)
                    : Colors.transparent;

                final textColor = isOpen
                    ? (isDanger ? const Color(0xFFF43F5E) : Colors.white)
                    : Colors.white.withOpacity(0.5);

                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.only(bottom: 8),
                  decoration: BoxDecoration(
                    color: bgColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: borderColor),
                  ),
                  child: Column(
                    children: [
                      InkWell(
                        onTap: () {
                          setState(() {
                            _openSection = isOpen ? null : id;
                          });
                        },
                        borderRadius: BorderRadius.circular(16),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: iconBg,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: iconBorderColor),
                                ),
                                child: Center(
                                  child: Icon(section['icon'] as IconData, size: 18, color: iconColor),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Text(
                                  section['title'] as String,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: textColor,
                                  ),
                                ),
                              ),
                              AnimatedRotation(
                                turns: isOpen ? 0.5 : 0,
                                duration: const Duration(milliseconds: 200),
                                child: Icon(LucideIcons.chevronDown, color: Colors.white.withOpacity(0.2), size: 16),
                              ),
                            ],
                          ),
                        ),
                      ),
                      AnimatedCrossFade(
                        firstChild: const SizedBox(width: double.infinity, height: 0),
                        secondChild: Container(
                          width: double.infinity,
                          decoration: BoxDecoration(
                            border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05))),
                          ),
                          child: _buildContent(id),
                        ),
                        crossFadeState: isOpen ? CrossFadeState.showSecond : CrossFadeState.showFirst,
                        duration: const Duration(milliseconds: 250),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ],
          ),
        ),
      ),
    );
  }
}
