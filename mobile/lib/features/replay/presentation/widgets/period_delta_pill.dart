import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';
import '../../domain/replay_period.dart';

/// F4: Period-over-Period Delta Pill.
///
/// Features:
/// - Displays ▲ / ▼ / • listening time delta percentage compared to the previous period.
/// - Shows top artist shift alerts (e.g. "Top artist changed to Anirudh").
/// - Gracefully handles null previous periods with a welcoming first-replay state.
class PeriodDeltaPill extends StatelessWidget {
  const PeriodDeltaPill({
    super.key,
    required this.aggregate,
  });

  final ReplayAggregate aggregate;

  @override
  Widget build(BuildContext context) {
    final prev = aggregate.previousPeriod;
    final periodName = _periodKindName(aggregate.period.kind);

    if (prev == null) {
      // First Period State
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.border),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppTheme.brand.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.auto_awesome,
                size: 14,
                color: AppTheme.brand,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Welcome to your first Zenify Replay! As you listen, comparisons will appear here.',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w400,
                  color: AppTheme.textSecondary,
                  height: 1.25,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final minutesDelta = aggregate.minutesDeltaPercent;
    final topArtistChanged = aggregate.topArtistChanged;
    final currentTopArtist = aggregate.topArtists.isNotEmpty ? aggregate.topArtists.first.artistName : null;
    final prevTopArtist = prev.topArtists.isNotEmpty ? prev.topArtists.first.artistName : null;

    final isPositive = minutesDelta != null && minutesDelta > 0;
    final isNegative = minutesDelta != null && minutesDelta < 0;

    final deltaText = minutesDelta == null
        ? 'No change'
        : (isPositive
            ? '▲ ${minutesDelta.abs().toStringAsFixed(0)}% more'
            : (isNegative
                ? '▼ ${minutesDelta.abs().toStringAsFixed(0)}% less'
                : '• Same listening time'));

    final deltaColor = isPositive
        ? const Color(0xFF10B981) // Crisp Green
        : (isNegative
            ? AppTheme.textMuted
            : AppTheme.textSecondary);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Delta Badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: deltaColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  deltaText,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: deltaColor,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'vs last $periodName',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ),
            ],
          ),

          // Top Artist Shift Callout
          if (currentTopArtist != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(
                  Icons.sync_alt_rounded,
                  size: 14,
                  color: AppTheme.brand,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    topArtistChanged && prevTopArtist != null
                        ? 'Top artist shifted from $prevTopArtist to $currentTopArtist.'
                        : '$currentTopArtist remains your #1 top artist.',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _periodKindName(PeriodKind kind) {
    switch (kind) {
      case PeriodKind.week:
        return 'week';
      case PeriodKind.month:
        return 'month';
      case PeriodKind.year:
        return 'year';
    }
  }
}
