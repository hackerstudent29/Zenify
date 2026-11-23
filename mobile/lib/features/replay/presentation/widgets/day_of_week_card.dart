import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

/// F3: Day-of-Week Personality Widget.
///
/// Features:
/// - Visual distribution across Mon through Sun.
/// - Personality trigger: If top day >= 18% of listening, highlights e.g. "You're a Friday listener".
/// - Crisp Apple Music bars with proportional width and exact percentages.
class DayOfWeekCard extends StatelessWidget {
  const DayOfWeekCard({
    super.key,
    required this.dayOfWeekMinutes,
  });

  /// 1 (Mon) -> 7 (Sun) to minutes
  final Map<int, int> dayOfWeekMinutes;

  @override
  Widget build(BuildContext context) {
    var totalMinutes = 0;
    var maxMinutes = 1;
    var topDay = 1;
    var topDayMinutes = -1;

    for (var i = 1; i <= 7; i++) {
      final mins = dayOfWeekMinutes[i] ?? 0;
      totalMinutes += mins;
      if (mins > maxMinutes) maxMinutes = mins;
      if (mins > topDayMinutes) {
        topDayMinutes = mins;
        topDay = i;
      }
    }

    final topPct = totalMinutes > 0 ? (topDayMinutes / totalMinutes * 100).round() : 0;
    final isTopDominant = topPct >= 18;
    final topDayName = _weekdayName(topDay);

    final headline = isTopDominant
        ? "You're a $topDayName listener"
        : 'Balanced Weekly Rhythm';

    final subtitle = isTopDominant
        ? '$topPct% of your minutes happen on ${topDayName}s.'
        : 'Your soundtrack is smoothly distributed across every day of the week.';

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
          // Header
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.brand.withValues(alpha: 0.2)),
                ),
                child: const Icon(
                  Icons.calendar_today_rounded,
                  color: AppTheme.brand,
                  size: 20,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      headline,
                      style: const TextStyle(
                        fontFamily: 'SF Pro Display',
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w400,
                        color: AppTheme.textSecondary,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // 7 Horizontal Day Bars
          Column(
            children: List.generate(7, (idx) {
              final dayIndex = idx + 1; // 1 = Mon .. 7 = Sun
              final mins = dayOfWeekMinutes[dayIndex] ?? 0;
              final pct = totalMinutes > 0 ? (mins / totalMinutes * 100).round() : 0;
              final fraction = (mins / maxMinutes).clamp(0.02, 1.0);
              final isTop = dayIndex == topDay && mins > 0;

              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    SizedBox(
                      width: 34,
                      child: Text(
                        _weekdayShort(dayIndex),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: isTop ? FontWeight.w700 : FontWeight.w500,
                          color: isTop ? AppTheme.brand : AppTheme.textSecondary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Stack(
                        children: [
                          // Background track
                          Container(
                            height: 10,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.05),
                              borderRadius: BorderRadius.circular(5),
                            ),
                          ),
                          // Filled bar
                          FractionallySizedBox(
                            widthFactor: fraction,
                            child: Container(
                              height: 10,
                              decoration: BoxDecoration(
                                color: isTop ? AppTheme.brand : Colors.white.withValues(alpha: 0.25),
                                borderRadius: BorderRadius.circular(5),
                                boxShadow: isTop
                                    ? [
                                        BoxShadow(
                                          color: AppTheme.brand.withValues(alpha: 0.4),
                                          blurRadius: 4,
                                          offset: const Offset(0, 1),
                                        )
                                      ]
                                    : null,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    ConstrainedBox(
                      constraints: const BoxConstraints(minWidth: 72),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Text(
                            '$pct%',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: isTop ? FontWeight.w700 : FontWeight.w500,
                              color: isTop ? AppTheme.brand : AppTheme.textPrimary,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${mins}m',
                            style: const TextStyle(
                              fontSize: 10,
                              color: AppTheme.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  String _weekdayName(int day) {
    const names = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ];
    return names[(day - 1).clamp(0, 6)];
  }

  String _weekdayShort(int day) {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return names[(day - 1).clamp(0, 6)];
  }
}
