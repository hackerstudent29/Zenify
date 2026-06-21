import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:marquee/marquee.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:audio_service/audio_service.dart';
import '../../features/player/presentation/full_player_screen.dart';
import '../../features/player/presentation/player_overlay.dart';
import '../../shared/providers/audio_provider.dart';

class AppLayout extends StatelessWidget {
  final StatefulNavigationShell navigationShell;

  const AppLayout({
    super.key,
    required this.navigationShell,
  });

  void _goBranch(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // The main content area
          navigationShell,
          
          // Custom Bottom Navigation Bar matching mobile-nav.tsx
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: ClipRRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                child: Container(
                  height: 64 + bottomPadding,
                  padding: EdgeInsets.only(bottom: bottomPadding),
                  decoration: BoxDecoration(
                    color: const Color.fromRGBO(10, 10, 10, 0.45),
                    border: Border(
                      top: BorderSide(
                        color: Colors.white.withOpacity(0.08),
                        width: 0.5,
                      ),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _NavItem(
                        icon: LucideIcons.home,
                        label: 'Home',
                        isActive: navigationShell.currentIndex == 0,
                        onTap: () => _goBranch(0),
                      ),
                      _NavItem(
                        icon: LucideIcons.search,
                        label: 'Search',
                        isActive: navigationShell.currentIndex == 3,
                        onTap: () => _goBranch(3),
                      ),
                      _NavItem(
                        icon: LucideIcons.sparkles,
                        label: 'Admin',
                        isActive: navigationShell.currentIndex == 1,
                        onTap: () => _goBranch(1),
                      ),
                      _NavItem(
                        icon: LucideIcons.library,
                        label: 'Library',
                        isActive: navigationShell.currentIndex == 4,
                        onTap: () => _goBranch(4),
                      ),
                      _NavItem(
                        icon: LucideIcons.creditCard,
                        label: 'Pricing',
                        isActive: navigationShell.currentIndex == 2,
                        onTap: () => _goBranch(2),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Player Overlay (sits above bottom nav when expanded, miniplayer hovers above when collapsed)
          PlayerOverlay(bottomNavHeight: 64 + bottomPadding),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = isActive ? const Color(0xFFE11D48) : const Color(0xFF71717A);
    final iconWeight = isActive ? FontWeight.w600 : FontWeight.w400;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 64,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 22,
              color: color,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 10,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

