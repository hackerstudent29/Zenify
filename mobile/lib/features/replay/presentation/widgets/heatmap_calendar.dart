import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';
import '../../domain/replay_period.dart';
import 'day_detail_sheet.dart';

/// F2: Listening Heatmap Calendar Widget (GitHub style).
///
/// Features:
/// - 5-level intensity quartiles calculated dynamically from non-zero listening days.
/// - Responsive day grid: 7 columns (Mon-Sun) for month periods; scrollable layout for year periods.
/// - Tap any day to inspect minutes and top song via [DayDetailSheet].
/// - Clean Apple Music dark aesthetic with quartile legend.
class HeatmapCalendar extends StatelessWidget {
  const HeatmapCalendar({
    super.key,
    required this.period,
    required this.heatmapDays,
    required this.dayTopSongs,
    this.onPlaySong,
  });

  final ReplayPeriod period;
  final Map<String, int> heatmapDays; // 'YYYY-MM-DD' -> minutes
  final Map<String, SongStat> dayTopSongs;
  final void Function(SongStat song)? onPlaySong;

  @override
  Widget build(BuildContext context) {
    // 1. Calculate Quartiles for 5-Level Intensity
    final nonZeroMinutes = heatmapDays.values.where((m) => m > 0).toList()..sort();
    final (q1, q2, q3) = _calculateQuartiles(nonZeroMinutes);

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
                    'LISTENING CALENDAR',
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
                    'Daily Activity',
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
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.border),
                ),
                child: Text(
                  '${nonZeroMinutes.length} Active Days',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.brand,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // Day of week labels (M T W T F S S)
          Row(
            children: const [
              _WeekdayHeader('M'),
              _WeekdayHeader('T'),
              _WeekdayHeader('W'),
              _WeekdayHeader('T'),
              _WeekdayHeader('F'),
              _WeekdayHeader('S'),
              _WeekdayHeader('S'),
            ],
          ),

          const SizedBox(height: 8),

          // Calendar Grid
          _buildMonthGrid(context, q1, q2, q3),

          const SizedBox(height: 20),

          // Quartiles Legend
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              const Text(
                'Less',
                style: TextStyle(fontSize: 10, color: AppTheme.textMuted),
              ),
              const SizedBox(width: 8),
              _legendDot(_levelColor(0)),
              const SizedBox(width: 4),
              _legendDot(_levelColor(1)),
              const SizedBox(width: 4),
              _legendDot(_levelColor(2)),
              const SizedBox(width: 4),
              _legendDot(_levelColor(3)),
              const SizedBox(width: 4),
              _legendDot(_levelColor(4)),
              const SizedBox(width: 8),
              const Text(
                'More',
                style: TextStyle(fontSize: 10, color: AppTheme.textMuted),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMonthGrid(BuildContext context, int q1, int q2, int q3) {
    // Generate dates strictly in [period.startWall, period.endWall)
    final days = <DateTime>[];
    var cursor = period.startWall;
    while (cursor.isBefore(period.endWall)) {
      days.add(cursor);
      cursor = cursor.add(const Duration(days: 1));
    }

    if (days.isEmpty) {
      return const SizedBox(
        height: 100,
        child: Center(
          child: Text(
            'No dates in period',
            style: TextStyle(color: AppTheme.textMuted),
          ),
        ),
      );
    }

    // Pad beginning of week so Monday is index 0
    final firstDayWeekday = days.first.weekday; // 1 = Mon, 7 = Sun
    final leadingPadding = firstDayWeekday - 1;

    final totalSlots = leadingPadding + days.length;
    final rowCount = (totalSlots / 7).ceil();

    return Column(
      children: List.generate(rowCount, (rowIndex) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            children: List.generate(7, (colIndex) {
              final slotIndex = rowIndex * 7 + colIndex;
              final dayIndex = slotIndex - leadingPadding;

              if (dayIndex < 0 || dayIndex >= days.length) {
                // Empty placeholder cell
                return const Expanded(
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: SizedBox(),
                  ),
                );
              }

              final date = days[dayIndex];
              final key = _formatKey(date);
              final minutes = heatmapDays[key] ?? 0;
              final level = _determineLevel(minutes, q1, q2, q3);
              final topSong = dayTopSongs[key];

              return Expanded(
                child: AspectRatio(
                  aspectRatio: 1,
                  child: Padding(
                    padding: const EdgeInsets.all(2.5),
                    child: InkWell(
                      onTap: () {
                        DayDetailSheet.show(
                          context,
                          date: date,
                          minutes: minutes,
                          topSong: topSong,
                          onPlaySong: onPlaySong,
                        );
                      },
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        decoration: BoxDecoration(
                          color: _levelColor(level),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: level > 0
                                ? AppTheme.brand.withValues(alpha: 0.2)
                                : Colors.white.withValues(alpha: 0.04),
                            width: 0.8,
                          ),
                        ),
                        child: Center(
                          child: Text(
                            '${date.day}',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: level > 0 ? FontWeight.w700 : FontWeight.w400,
                              color: level >= 3
                                  ? Colors.white
                                  : (level > 0
                                      ? AppTheme.textPrimary
                                      : AppTheme.textMuted.withValues(alpha: 0.5)),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        );
      }),
    );
  }

  Widget _legendDot(Color color) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(3),
      ),
    );
  }

  Color _levelColor(int level) {
    switch (level) {
      case 1:
        return AppTheme.brand.withValues(alpha: 0.25);
      case 2:
        return AppTheme.brand.withValues(alpha: 0.50);
      case 3:
        return AppTheme.brand.withValues(alpha: 0.75);
      case 4:
        return AppTheme.brand;
      case 0:
      default:
        return Colors.white.withValues(alpha: 0.05);
    }
  }

  int _determineLevel(int minutes, int q1, int q2, int q3) {
    if (minutes <= 0) return 0;
    if (minutes <= q1) return 1;
    if (minutes <= q2) return 2;
    if (minutes <= q3) return 3;
    return 4;
  }

  (int, int, int) _calculateQuartiles(List<int> sorted) {
    if (sorted.isEmpty) return (0, 0, 0);
    if (sorted.length == 1) return (sorted.first, sorted.first, sorted.first);

    final n = sorted.length;
    final q1 = sorted[(n * 0.25).floor().clamp(0, n - 1)];
    final q2 = sorted[(n * 0.50).floor().clamp(0, n - 1)];
    final q3 = sorted[(n * 0.75).floor().clamp(0, n - 1)];

    return (q1, q2, q3);
  }

  String _formatKey(DateTime dt) {
    final y = dt.year;
    final m = dt.month < 10 ? '0${dt.month}' : '${dt.month}';
    final d = dt.day < 10 ? '0${dt.day}' : '${dt.day}';
    return '$y-$m-$d';
  }
}

class _WeekdayHeader extends StatelessWidget {
  const _WeekdayHeader(this.letter);
  final String letter;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Center(
        child: Text(
          letter,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: AppTheme.textMuted,
          ),
        ),
      ),
    );
  }
}
