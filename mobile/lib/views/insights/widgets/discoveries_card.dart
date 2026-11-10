import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../design_system/tokens/app_colors.dart';

class DiscoveriesCard extends StatelessWidget {
  const DiscoveriesCard({
    super.key,
    required this.discoveriesCount,
  });

  final int discoveriesCount;

  @override
  Widget build(BuildContext context) {
    if (discoveriesCount <= 0) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.crimson.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.crimson.withValues(alpha: 0.3)),
            ),
            alignment: Alignment.center,
            child: const Icon(Icons.explore_rounded, color: AppColors.crimson, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      '$discoveriesCount NEW DISCOVERIES',
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                const Text(
                  'Artists heard for the very first time during this period.',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.white54,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

