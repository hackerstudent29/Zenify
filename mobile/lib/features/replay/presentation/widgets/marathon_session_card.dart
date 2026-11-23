import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// Add-on: Longest Listening Marathon continuous session card.
/// Hidden if no continuous session >= 30 minutes occurred.
class MarathonSessionCard extends StatelessWidget {
  final MarathonSession? marathon;

  const MarathonSessionCard({
    super.key,
    required this.marathon,
  });

  static const _months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  static String _formatTime(DateTime dt) {
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final mStr = dt.minute < 10 ? '0${dt.minute}' : '${dt.minute}';
    final ampm = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:$mStr $ampm';
  }

  @override
  Widget build(BuildContext context) {
    if (marathon == null || marathon!.durationMinutes < 30) {
      return const SizedBox.shrink();
    }

    final m = marathon!;
    final hours = m.durationMinutes ~/ 60;
    final mins = m.durationMinutes % 60;
    final runtimeStr = hours > 0 ? '${hours}h ${mins}m' : '${mins}m';

    final startDateStr = '${_months[m.startWall.month - 1]} ${m.startWall.day}';
    final startTimeStr = _formatTime(m.startWall);
    final endWall = m.startWall.add(Duration(minutes: m.durationMinutes));
    final endTimeStr = _formatTime(endWall);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section Title
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.local_fire_department_rounded,
                  color: AppTheme.brand,
                  size: 16,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'LONGEST LISTENING MARATHON',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Hero Runtime
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                runtimeStr,
                style: const TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w900,
                  color: AppTheme.textPrimary,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'unbroken listening',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Colors.white.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),

          const SizedBox(height: 8),

          // Metadata row (Date, tracks count, top song)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.schedule_rounded, size: 14, color: AppTheme.textMuted),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        '$startDateStr · $startTimeStr – $endTimeStr',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.queue_music_rounded, size: 14, color: AppTheme.brand),
                    const SizedBox(width: 6),
                    Text(
                      '${m.songCount} consecutive tracks',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brand,
                      ),
                    ),
                    if (m.topSongTitle != null && m.topSongTitle!.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Text(
                        '· Led by "${m.topSongTitle}"',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
