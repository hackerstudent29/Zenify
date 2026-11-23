import 'dart:math';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F1: Daypart & Peak Hour Widget.
///
/// Features:
/// - 4 Daypart breakdown: Morning (05-12), Afternoon (12-17), Evening (17-22), Night (22-05).
/// - Dynamic listener personality title ("Night Owl", "Early Bird", etc.) with exact percentage.
/// - 24-hour interactive histogram with peak hour highlighted.
/// - Visual daypart distribution pills.
class DaypartCard extends StatelessWidget {
  const DaypartCard({
    super.key,
    required this.daypart,
  });

  final DaypartStat daypart;

  @override
  Widget build(BuildContext context) {
    final totalMs = daypart.morningMs +
        daypart.afternoonMs +
        daypart.eveningMs +
        daypart.nightMs;

    final morningPct = totalMs > 0 ? (daypart.morningMs / totalMs * 100).round() : 0;
    final afternoonPct = totalMs > 0 ? (daypart.afternoonMs / totalMs * 100).round() : 0;
    final eveningPct = totalMs > 0 ? (daypart.eveningMs / totalMs * 100).round() : 0;
    final nightPct = totalMs > 0 ? (daypart.nightMs / totalMs * 100).round() : 0;

    final (personalityTitle, personalitySubtitle, personalityIcon) = _getPersonality(
      morningPct: morningPct,
      afternoonPct: afternoonPct,
      eveningPct: eveningPct,
      nightPct: nightPct,
    );

    final peakFormatted = _formatHour(daypart.peakHour);

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
          // Header / Personality Title
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
                child: Icon(personalityIcon, color: AppTheme.brand, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      personalityTitle,
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
                      personalitySubtitle,
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

          // Peak Listening Highlight Pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.flash_on_rounded, size: 16, color: AppTheme.brand),
                const SizedBox(width: 8),
                Text(
                  'Peak listening at $peakFormatted',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                    letterSpacing: -0.1,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 24-Hour Histogram
          _buildHourlyHistogram(context),

          const SizedBox(height: 20),

          // 4 Daypart Chips
          Row(
            children: [
              Expanded(
                child: _buildDaypartPill(
                  label: 'Morning',
                  timeSpan: '5 AM–12 PM',
                  percentage: morningPct,
                  minutes: daypart.morningMinutes,
                  icon: '🌅',
                  isHighest: morningPct >= max(afternoonPct, max(eveningPct, nightPct)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildDaypartPill(
                  label: 'Afternoon',
                  timeSpan: '12 PM–5 PM',
                  percentage: afternoonPct,
                  minutes: daypart.afternoonMinutes,
                  icon: '☀️',
                  isHighest: afternoonPct >= max(morningPct, max(eveningPct, nightPct)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildDaypartPill(
                  label: 'Evening',
                  timeSpan: '5 PM–10 PM',
                  percentage: eveningPct,
                  minutes: daypart.eveningMinutes,
                  icon: '🌇',
                  isHighest: eveningPct >= max(morningPct, max(afternoonPct, nightPct)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildDaypartPill(
                  label: 'Night',
                  timeSpan: '10 PM–5 AM',
                  percentage: nightPct,
                  minutes: daypart.nightMinutes,
                  icon: '🌙',
                  isHighest: nightPct >= max(morningPct, max(afternoonPct, eveningPct)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHourlyHistogram(BuildContext context) {
    var maxHourlyMs = 1;
    for (final ms in daypart.hourlyMs) {
      if (ms > maxHourlyMs) maxHourlyMs = ms;
    }

    return Column(
      children: [
        SizedBox(
          height: 64,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: List.generate(24, (h) {
              final ms = h < daypart.hourlyMs.length ? daypart.hourlyMs[h] : 0;
              final fraction = (ms / maxHourlyMs).clamp(0.06, 1.0);
              final isPeak = h == daypart.peakHour && ms > 0;

              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 1.5),
                  child: Tooltip(
                    message: '${_formatHour(h)}: ${(ms / 60000).round()} mins',
                    child: Container(
                      height: 64 * fraction,
                      decoration: BoxDecoration(
                        color: isPeak
                            ? AppTheme.brand
                            : (ms > 0
                                ? Colors.white.withValues(alpha: 0.22)
                                : Colors.white.withValues(alpha: 0.05)),
                        borderRadius: BorderRadius.circular(3),
                        boxShadow: isPeak
                            ? [
                                BoxShadow(
                                  color: AppTheme.brand.withValues(alpha: 0.5),
                                  blurRadius: 6,
                                  offset: const Offset(0, 1),
                                )
                              ]
                            : null,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
        const SizedBox(height: 6),
        // Time labels along bottom
        const Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('12 AM', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
            Text('6 AM', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
            Text('12 PM', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
            Text('6 PM', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
            Text('11 PM', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
          ],
        ),
      ],
    );
  }

  Widget _buildDaypartPill({
    required String label,
    required String timeSpan,
    required int percentage,
    required int minutes,
    required String icon,
    required bool isHighest,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: isHighest
            ? AppTheme.brand.withValues(alpha: 0.1)
            : Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isHighest
              ? AppTheme.brand.withValues(alpha: 0.3)
              : AppTheme.border,
        ),
      ),
      child: Column(
        children: [
          Text(icon, style: const TextStyle(fontSize: 14)),
          const SizedBox(height: 4),
          Text(
            '$percentage%',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: isHighest ? AppTheme.brand : AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: AppTheme.textSecondary,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            '$minutes m',
            style: const TextStyle(
              fontSize: 9,
              color: AppTheme.textMuted,
            ),
          ),
        ],
      ),
    );
  }

  (String, String, IconData) _getPersonality({
    required int morningPct,
    required int afternoonPct,
    required int eveningPct,
    required int nightPct,
  }) {
    final maxPct = max(morningPct, max(afternoonPct, max(eveningPct, nightPct)));
    if (maxPct == 0) {
      return (
        'Music Explorer',
        'Your listening hours will appear here as you enjoy songs.',
        Icons.timelapse_rounded,
      );
    }

    if (nightPct == maxPct) {
      return (
        'Night Owl',
        '$nightPct% of your listening happens under the stars between 10 PM and 5 AM.',
        Icons.bedtime_rounded,
      );
    } else if (morningPct == maxPct) {
      return (
        'Early Bird',
        '$morningPct% of your minutes begin bright and early between 5 AM and 12 PM.',
        Icons.wb_sunny_rounded,
      );
    } else if (eveningPct == maxPct) {
      return (
        'Evening Unwinder',
        '$eveningPct% of your soundtrack plays during twilight between 5 PM and 10 PM.',
        Icons.nights_stay_rounded,
      );
    } else {
      return (
        'Afternoon Groover',
        '$afternoonPct% of your beats fuel your workday between 12 PM and 5 PM.',
        Icons.wb_cloudy_rounded,
      );
    }
  }

  String _formatHour(int h) {
    if (h == 0) return '12 AM';
    if (h < 12) return '$h AM';
    if (h == 12) return '12 PM';
    return '${h - 12} PM';
  }
}
