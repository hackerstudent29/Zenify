import 'package:flutter/material.dart';

import '../../../design_system/tokens/app_colors.dart';

class SummaryCards extends StatelessWidget {
  const SummaryCards({
    super.key,
    required this.totalListeningMs,
    required this.totalPlays,
    required this.streakDays,
    required this.uniqueTracks,
    required this.uniqueArtists,
    required this.skipRatePct,
    this.timeDeltaPct,
    this.playsDeltaPct,
  });

  final int totalListeningMs;
  final int totalPlays;
  final int streakDays;
  final int uniqueTracks;
  final int uniqueArtists;
  final int skipRatePct;
  final dynamic timeDeltaPct; // num or String ('new')
  final dynamic playsDeltaPct;

  String _formatDuration(int ms) {
    if (ms <= 0) return '0 min';
    final totalSec = ms ~/ 1000;
    final hours = totalSec ~/ 3600;
    final minutes = (totalSec % 3600) ~/ 60;
    if (hours > 0) {
      return '$hours hr ${minutes > 0 ? '$minutes min' : ''}';
    }
    return '$minutes min';
  }

  Widget _buildDeltaBadge(dynamic delta) {
    if (delta == null || delta == 'new') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(6),
        ),
        child: const Text(
          'NEW',
          style: TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: Colors.white70,
            letterSpacing: 0.5,
          ),
        ),
      );
    }
    final numVal = delta is num ? delta : num.tryParse(delta.toString()) ?? 0;
    final isPos = numVal >= 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: (isPos ? const Color(0xFF10B981) : AppColors.crimson).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPos ? Icons.arrow_drop_up_rounded : Icons.arrow_drop_down_rounded,
            color: isPos ? const Color(0xFF10B981) : AppColors.crimson,
            size: 14,
          ),
          Text(
            '${numVal.abs()}%',
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: isPos ? const Color(0xFF10B981) : AppColors.crimson,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Primary 3-card Row
        Row(
          children: [
            Expanded(
              child: _buildTile(
                label: 'TIME PLAYED',
                value: _formatDuration(totalListeningMs),
                icon: Icons.timer_outlined,
                badge: _buildDeltaBadge(timeDeltaPct),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildTile(
                label: 'QUALIFIED PLAYS',
                value: '$totalPlays',
                icon: Icons.play_circle_outline_rounded,
                badge: _buildDeltaBadge(playsDeltaPct),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildTile(
                label: 'STREAK',
                value: streakDays > 0 ? '$streakDays Days' : '1 Day',
                icon: Icons.local_fire_department_rounded,
                iconColor: Colors.amberAccent,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        // Secondary 3-card Row
        Row(
          children: [
            Expanded(
              child: _buildTile(
                label: 'UNIQUE SONGS',
                value: '$uniqueTracks',
                icon: Icons.queue_music_rounded,
                isSecondary: true,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildTile(
                label: 'UNIQUE ARTISTS',
                value: '$uniqueArtists',
                icon: Icons.people_outline_rounded,
                isSecondary: true,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildTile(
                label: 'SKIP RATE',
                value: '$skipRatePct%',
                icon: Icons.skip_next_rounded,
                iconColor: skipRatePct > 20 ? AppColors.crimson : Colors.white60,
                isSecondary: true,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTile({
    required String label,
    required String value,
    required IconData icon,
    Color? iconColor,
    Widget? badge,
    bool isSecondary = false,
  }) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: isSecondary ? 12 : 14),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, color: iconColor ?? AppColors.crimson, size: isSecondary ? 16 : 18),
              ?badge,
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontFamily: 'SF Pro Display',
              fontSize: isSecondary ? 16 : 18,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              letterSpacing: -0.3,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 8.5,
              fontWeight: FontWeight.w600,
              color: Colors.white38,
              letterSpacing: 0.6,
            ),
          ),
        ],
      ),
    );
  }
}

