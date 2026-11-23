import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F9: "On Repeat" & Loop Obsession Widget.
///
/// Features:
/// - Loop Obsession: Songs with >= 3 consecutive loop runs.
/// - Heavy Rotation: Songs with >= 5 qualified plays in the period.
/// - Play action integration.
class OnRepeatSection extends StatelessWidget {
  const OnRepeatSection({
    super.key,
    required this.loops,
    required this.heavyRotation,
    this.onPlaySong,
  });

  final List<LoopStat> loops;
  final List<SongStat> heavyRotation;
  final void Function(String trackId)? onPlaySong;

  @override
  Widget build(BuildContext context) {
    if (loops.isEmpty && heavyRotation.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'ON REPEAT',
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textMuted,
                      letterSpacing: 0.5,
                    ),
                  ),
                  SizedBox(height: 3),
                  Text(
                    'Loop Obsessions',
                    style: TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                      letterSpacing: -0.3,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.repeat_one_rounded, size: 14, color: AppTheme.brand),
                    SizedBox(width: 4),
                    Text(
                      'Repeat Mode',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brand,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),

          // Consecutive Loop Highlight (if any)
          if (loops.isNotEmpty) ...[
            ...loops.take(2).map((loop) => Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppTheme.brand.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppTheme.brand.withValues(alpha: 0.25)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppTheme.brand.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.repeat_rounded, color: AppTheme.brand, size: 18),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              loop.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Played ${loop.consecutiveRuns} times consecutively without stopping!',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppTheme.brand,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (onPlaySong != null)
                        IconButton(
                          icon: const Icon(Icons.play_circle_fill_rounded, color: AppTheme.brand, size: 26),
                          onPressed: () => onPlaySong!(loop.trackId),
                        ),
                    ],
                  ),
                )),
          ],

          // Heavy Rotation Tracks
          if (heavyRotation.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Text(
              'HEAVY ROTATION (≥ 5 PLAYS)',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppTheme.textMuted,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),
            ...heavyRotation.take(4).map((song) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.local_fire_department_rounded, size: 16, color: AppTheme.brand),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          song.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
                        ),
                      ),
                      Text(
                        '${song.qualifiedPlays} plays',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.brand),
                      ),
                    ],
                  ),
                )),
          ],
        ],
      ),
    );
  }
}
