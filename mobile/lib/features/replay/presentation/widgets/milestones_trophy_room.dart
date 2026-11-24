import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../services/dock_visibility.dart';
import '../../domain/all_time_index.dart';
import '../../domain/replay_aggregate.dart';

/// Represents an unlockable milestone badge in Zenify Replay.
class ReplayBadge {
  const ReplayBadge({
    required this.id,
    required this.title,
    required this.description,
    required this.icon,
    required this.category,
    required this.isUnlocked,
    required this.currentProgress,
    required this.target,
    this.unit = '',
    this.unlockedAt,
  });

  final String id;
  final String title;
  final String description;
  final IconData icon;
  final String category; // 'Listening Time', 'Habits & Streaks', 'Collection'
  final bool isUnlocked;
  final num currentProgress;
  final num target;
  final String unit;
  final DateTime? unlockedAt;

  double get progressRatio => target > 0
      ? (currentProgress / target).clamp(0.0, 1.0)
      : (isUnlocked ? 1.0 : 0.0);

  int get progressPercent => (progressRatio * 100).round();
}

/// F15: Milestones & Trophy Room.
///
/// Features:
/// - Unlock badges: 1,000 Minutes, 10,000 Minutes, 100 Songs, 500 Songs,
///   Night Owl, Early Bird, Heavy Rotation, Marathoner, 7-Day Streak, True Loyalist.
/// - Progress rings & percentage calculation for locked badges.
/// - Category filtering: All, Time, Habits, Collection.
/// - Tap to view celebration / badge detail sheet.
/// - Can be embedded in-page or opened full-screen/modal via [show].
class MilestonesTrophyRoom extends StatefulWidget {
  const MilestonesTrophyRoom({
    super.key,
    required this.aggregate,
    this.allTimeIndex,
    this.onTapBadge,
  });

  final ReplayAggregate aggregate;
  final AllTimeIndex? allTimeIndex;
  final ValueChanged<ReplayBadge>? onTapBadge;

  static Future<void> show(
    BuildContext context, {
    required ReplayAggregate aggregate,
    AllTimeIndex? allTimeIndex,
  }) {
    return DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (ctx) => DraggableScrollableSheet(
          initialChildSize: 0.9,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          builder: (ctx, scrollController) => Container(
            decoration: const BoxDecoration(
              color: AppTheme.canvas,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              children: [
                const SizedBox(height: 12),
                Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: SingleChildScrollView(
                    controller: scrollController,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    child: MilestonesTrophyRoom(
                      aggregate: aggregate,
                      allTimeIndex: allTimeIndex,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  State<MilestonesTrophyRoom> createState() => _MilestonesTrophyRoomState();
}

class _MilestonesTrophyRoomState extends State<MilestonesTrophyRoom> {
  String _selectedCategory = 'All';

  List<ReplayBadge> _computeBadges() {
    final agg = widget.aggregate;
    final totalMins = agg.totalMinutes;
    final totalPlays = agg.totalQualifiedPlays;

    // Streak: number of days with >= 1 minute
    final activeDays = agg.dayOfWeekMinutes.values.where((m) => m > 0).length;
    final is7DayStreak = activeDays >= 7;

    final isNightOwl = agg.daypart.dominantDaypart == 'Night';
    final isEarlyBird = agg.daypart.dominantDaypart == 'Morning';
    final hasHeavyRotation =
        agg.heavyRotation.isNotEmpty || agg.loops.isNotEmpty;
    final isMarathoner =
        agg.marathon != null && agg.marathon!.durationMinutes >= 60;
    final isLoyal = agg.loyalty != null && agg.loyalty!.daysLoyal >= 30;

    return [
      // 1. 1,000 Minutes
      ReplayBadge(
        id: '1k_minutes',
        title: '1,000 Minutes Club',
        description: 'Listen to 1,000 minutes of music in a single period.',
        icon: Icons.timer_rounded,
        category: 'Listening Time',
        isUnlocked: totalMins >= 1000,
        currentProgress: totalMins,
        target: 1000,
        unit: 'min',
      ),

      // 2. 10,000 Minutes
      ReplayBadge(
        id: '10k_minutes',
        title: '10,000 Minutes Legend',
        description: 'Log 10,000 minutes of pure musical obsession.',
        icon: Icons.all_inclusive_rounded,
        category: 'Listening Time',
        isUnlocked: totalMins >= 10000,
        currentProgress: totalMins,
        target: 10000,
        unit: 'min',
      ),

      // 3. 100 Songs Played
      ReplayBadge(
        id: '100_songs',
        title: 'Century Club',
        description: 'Complete 100 qualified songs in this period.',
        icon: Icons.library_music_rounded,
        category: 'Collection',
        isUnlocked: totalPlays >= 100,
        currentProgress: totalPlays,
        target: 100,
        unit: 'songs',
      ),

      // 4. 500 Songs Played
      ReplayBadge(
        id: '500_songs',
        title: 'Melody Collector',
        description: 'Accumulate 500 qualified song plays.',
        icon: Icons.album_rounded,
        category: 'Collection',
        isUnlocked: totalPlays >= 500,
        currentProgress: totalPlays,
        target: 500,
        unit: 'songs',
      ),

      // 5. Night Owl
      ReplayBadge(
        id: 'night_owl',
        title: 'Night Owl',
        description:
            'Spend your dominant listening hours between 10 PM and 5 AM.',
        icon: Icons.nightlight_round,
        category: 'Habits & Streaks',
        isUnlocked: isNightOwl,
        currentProgress: agg.daypart.nightMinutes,
        target: (agg.totalMinutes * 0.35).round(),
        unit: 'min',
      ),

      // 6. Early Bird
      ReplayBadge(
        id: 'early_bird',
        title: 'Early Bird',
        description:
            'Spend your dominant listening hours in the morning sunshine.',
        icon: Icons.wb_sunny_rounded,
        category: 'Habits & Streaks',
        isUnlocked: isEarlyBird,
        currentProgress: agg.daypart.morningMinutes,
        target: (agg.totalMinutes * 0.35).round(),
        unit: 'min',
      ),

      // 7. Heavy Rotation
      ReplayBadge(
        id: 'heavy_rotation',
        title: 'Heavy Rotation',
        description: 'Play a single song 5 or more times on obsessive repeat.',
        icon: Icons.repeat_one_rounded,
        category: 'Habits & Streaks',
        isUnlocked: hasHeavyRotation,
        currentProgress: agg.heavyRotation.isNotEmpty
            ? agg.heavyRotation.first.qualifiedPlays
            : 0,
        target: 5,
        unit: 'plays',
      ),

      // 8. Marathoner
      ReplayBadge(
        id: 'marathoner',
        title: 'Marathoner',
        description:
            'Listen continuously for 60+ minutes without interruption.',
        icon: Icons.directions_run_rounded,
        category: 'Habits & Streaks',
        isUnlocked: isMarathoner,
        currentProgress: agg.marathon?.durationMinutes ?? 0,
        target: 60,
        unit: 'min',
      ),

      // 9. 7-Day Streak
      ReplayBadge(
        id: '7day_streak',
        title: '7-Day Streak',
        description: 'Listen to Zenify across all 7 days of the week.',
        icon: Icons.local_fire_department_rounded,
        category: 'Habits & Streaks',
        isUnlocked: is7DayStreak,
        currentProgress: activeDays,
        target: 7,
        unit: 'days',
      ),

      // 10. True Loyalist
      ReplayBadge(
        id: 'loyal_fan',
        title: 'True Loyalist',
        description:
            'Maintain 30+ days of unwavering devotion to your #1 artist.',
        icon: Icons.favorite_rounded,
        category: 'Collection',
        isUnlocked: isLoyal,
        currentProgress: agg.loyalty?.daysLoyal ?? 0,
        target: 30,
        unit: 'days',
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final badges = _computeBadges();
    final unlockedCount = badges.where((b) => b.isUnlocked).length;
    final totalCount = badges.length;
    final overallRatio = totalCount > 0 ? unlockedCount / totalCount : 0.0;

    final categories = [
      'All',
      'Listening Time',
      'Habits & Streaks',
      'Collection',
    ];
    final displayedBadges = _selectedCategory == 'All'
        ? badges
        : badges.where((b) => b.category == _selectedCategory).toList();

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
          // Section Title
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppTheme.brand.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.emoji_events_rounded,
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
                            'TROPHY ROOM & BADGES',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.5,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                          Text(
                            'Earn badges through your listening milestones',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
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
              ),
              const SizedBox(width: 8),
              // Unlocked count pill and Close button
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.brand.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppTheme.brand.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      '$unlockedCount / $totalCount',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brand,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(
                      Icons.close_rounded,
                      color: AppTheme.textMuted,
                    ),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Progress Overview Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(
              height: 6,
              child: LinearProgressIndicator(
                value: overallRatio,
                backgroundColor: Colors.white.withValues(alpha: 0.08),
                valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.brand),
              ),
            ),
          ),

          const SizedBox(height: 16),

          // Category Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: categories.map((cat) {
                final isSelected = cat == _selectedCategory;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: InkWell(
                    onTap: () => setState(() => _selectedCategory = cat),
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppTheme.brand
                            : Colors.white.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: isSelected ? AppTheme.brand : AppTheme.border,
                        ),
                      ),
                      child: Text(
                        cat,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: isSelected
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: isSelected
                              ? Colors.white
                              : AppTheme.textSecondary,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),

          const SizedBox(height: 16),

          // Badges Grid
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: displayedBadges.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.85,
            ),
            itemBuilder: (context, index) {
              final badge = displayedBadges[index];
              return _buildBadgeCard(context, badge);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildBadgeCard(BuildContext context, ReplayBadge badge) {
    return InkWell(
      onTap: () {
        if (widget.onTapBadge != null) {
          widget.onTapBadge!(badge);
        } else {
          _showBadgeDialog(context, badge);
        }
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: badge.isUnlocked
              ? AppTheme.brand.withValues(alpha: 0.08)
              : Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: badge.isUnlocked
                ? AppTheme.brand.withValues(alpha: 0.35)
                : AppTheme.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Icon with glowing or frosted frame
            Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: badge.isUnlocked
                        ? AppTheme.brand.withValues(alpha: 0.2)
                        : Colors.white.withValues(alpha: 0.06),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: badge.isUnlocked
                          ? AppTheme.brand
                          : AppTheme.border,
                      width: 1.5,
                    ),
                  ),
                  child: Icon(
                    badge.icon,
                    size: 26,
                    color: badge.isUnlocked
                        ? AppTheme.brand
                        : AppTheme.textMuted,
                  ),
                ),
                if (badge.isUnlocked)
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(
                        color: Colors.greenAccent,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check,
                        size: 11,
                        color: Colors.black,
                      ),
                    ),
                  ),
              ],
            ),

            const SizedBox(height: 10),

            // Badge Title
            Text(
              badge.title,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: badge.isUnlocked
                    ? AppTheme.textPrimary
                    : AppTheme.textSecondary,
              ),
            ),

            const SizedBox(height: 4),

            // Description
            Text(
              badge.description,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
            ),

            const Spacer(),

            // Status Pill or Progress Indicator
            if (badge.isUnlocked)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.brand,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'UNLOCKED',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              )
            else
              Column(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(2),
                    child: LinearProgressIndicator(
                      value: badge.progressRatio,
                      minHeight: 4,
                      backgroundColor: Colors.white.withValues(alpha: 0.08),
                      valueColor: const AlwaysStoppedAnimation<Color>(
                        AppTheme.textMuted,
                      ),
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${badge.currentProgress}/${badge.target} ${badge.unit}',
                    style: const TextStyle(
                      fontSize: 9,
                      color: AppTheme.textMuted,
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  void _showBadgeDialog(BuildContext context, ReplayBadge badge) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppTheme.border),
        ),
        title: Row(
          children: [
            Icon(
              badge.icon,
              color: badge.isUnlocked ? AppTheme.brand : AppTheme.textMuted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                badge.title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.textPrimary,
                ),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              badge.description,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 16),
            if (badge.isUnlocked)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.stars_rounded, color: AppTheme.brand, size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Badge successfully unlocked in your Replay!',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.brand,
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Text(
                'Current Progress: ${badge.currentProgress} / ${badge.target} ${badge.unit} (${badge.progressPercent}%)',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted,
                ),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text(
              'Close',
              style: TextStyle(
                color: AppTheme.brand,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
