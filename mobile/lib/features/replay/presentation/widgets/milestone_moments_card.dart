import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/all_time_index.dart';

/// F16: Milestone Moments Card.
///
/// Features two tabs:
/// - Tab A: "Unique Songs" (counts only different/new songs)
/// - Tab B: "Total Plays" (counts every play, including repeats)
///
/// Shows milestones from 1st song up to 10,000 songs.
class MilestoneMomentsCard extends StatefulWidget {
  const MilestoneMomentsCard({
    super.key,
    required this.allTimeIndex,
    this.onTapMilestoneTrack,
  });

  final AllTimeIndex allTimeIndex;
  final ValueChanged<MilestoneMark>? onTapMilestoneTrack;

  @override
  State<MilestoneMomentsCard> createState() => _MilestoneMomentsCardState();
}

class _MilestoneMomentsCardState extends State<MilestoneMomentsCard> {
  int _selectedTab = 0; // 0 = Unique Songs, 1 = Total Plays

  static const List<int> _uniqueTargets = [1, 10, 50, 100, 500, 1000, 5000, 10000];
  static const List<int> _totalTargets = [1, 100, 500, 1000, 2500, 5000, 10000];

  @override
  Widget build(BuildContext context) {
    final isUniqueTab = _selectedTab == 0;
    final marks = isUniqueTab
        ? widget.allTimeIndex.uniqueSongMarks
        : widget.allTimeIndex.totalPlayMarks;
    final targets = isUniqueTab ? _uniqueTargets : _totalTargets;
    final currentCount = isUniqueTab
        ? widget.allTimeIndex.firstQualifiedPlayByTrack.length
        : widget.allTimeIndex.totalQualifiedPlays;

    // Create a map from milestone target to mark for O(1) lookup
    final marksMap = {for (final m in marks) m.n: m};

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.cake_rounded,
                  color: AppTheme.brand,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'MILESTONE MOMENTS',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'Songs that defined your Zenify journey',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Two-Tab Segmented Pill Controller
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _selectedTab = 0),
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: isUniqueTab ? AppTheme.brand : Colors.transparent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'Unique Songs Only',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: isUniqueTab ? FontWeight.w800 : FontWeight.w500,
                          color: isUniqueTab ? Colors.white : AppTheme.textSecondary,
                        ),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _selectedTab = 1),
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: !isUniqueTab ? AppTheme.brand : Colors.transparent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'Total Plays & Repeats',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: !isUniqueTab ? FontWeight.w800 : FontWeight.w500,
                          color: !isUniqueTab ? Colors.white : AppTheme.textSecondary,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Milestones List
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: targets.length,
            separatorBuilder: (_, _) => const Padding(
              padding: EdgeInsets.symmetric(vertical: 2),
              child: Divider(color: AppTheme.border, height: 1),
            ),
            itemBuilder: (context, index) {
              final target = targets[index];
              final mark = marksMap[target];
              final isReached = mark != null;

              return _buildMilestoneRow(
                target: target,
                mark: mark,
                isReached: isReached,
                currentCount: currentCount,
                isUniqueTab: isUniqueTab,
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildMilestoneRow({
    required int target,
    required MilestoneMark? mark,
    required bool isReached,
    required int currentCount,
    required bool isUniqueTab,
  }) {
    final label = _formatTargetLabel(target);

    return InkWell(
      onTap: isReached && mark != null && widget.onTapMilestoneTrack != null
          ? () => widget.onTapMilestoneTrack!(mark)
          : null,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            // Milestone Badge
            Container(
              width: 58,
              padding: const EdgeInsets.symmetric(vertical: 4),
              decoration: BoxDecoration(
                color: isReached
                    ? AppTheme.brand.withValues(alpha: 0.15)
                    : Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: isReached
                      ? AppTheme.brand.withValues(alpha: 0.35)
                      : AppTheme.border,
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: isReached ? AppTheme.brand : AppTheme.textMuted,
                ),
              ),
            ),

            const SizedBox(width: 14),

            // Milestone Details
            Expanded(
              child: isReached && mark != null
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          mark.trackTitle,
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
                          '${mark.artistRaw} · ${_formatDate(mark.localWall)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Target: ${_formatNumber(target)} ${isUniqueTab ? 'songs' : 'plays'}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textMuted,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          currentCount < target
                              ? 'Need ${(target - currentCount)} more'
                              : 'Achieved',
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppTheme.textMuted,
                          ),
                        ),
                      ],
                    ),
            ),

            // Trailing Status
            if (isReached)
              const Icon(
                Icons.check_circle_rounded,
                color: AppTheme.brand,
                size: 20,
              )
            else
              const Icon(
                Icons.lock_outline_rounded,
                color: AppTheme.textMuted,
                size: 18,
              ),
          ],
        ),
      ),
    );
  }

  static String _formatTargetLabel(int n) {
    if (n == 1) return '1ST';
    if (n == 10) return '10TH';
    if (n == 50) return '50TH';
    if (n == 100) return '100TH';
    if (n == 500) return '500TH';
    if (n == 1000) return '1,000TH';
    if (n == 2500) return '2,500TH';
    if (n == 5000) return '5,000TH';
    if (n == 10000) return '10,000TH';
    return '${n}TH';
  }

  static String _formatNumber(int n) {
    if (n >= 1000) {
      final k = n / 1000;
      return '${k.toStringAsFixed(k.truncateToDouble() == k ? 0 : 1)}k';
    }
    return '$n';
  }

  static String _formatDate(DateTime date) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }
}
