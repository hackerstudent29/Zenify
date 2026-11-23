import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F14: Artist Loyalty Timeline Card.
///
/// Displays enduring artist loyalty:
/// "You've been listening to [Artist] since [Date], and [X] days later they're still your #1."
///
/// Strictly renders [SizedBox.shrink()] if loyalty is null or daysLoyal < 30.
class LoyaltyTimelineCard extends StatelessWidget {
  const LoyaltyTimelineCard({
    super.key,
    this.loyalty,
  });

  final LoyaltyStat? loyalty;

  @override
  Widget build(BuildContext context) {
    final item = loyalty;
    if (item == null || item.daysLoyal < 30) {
      return const SizedBox.shrink();
    }

    final dateFormatted = _formatDate(item.firstPlayDate);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.brand.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Badge
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.favorite_rounded,
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
                      'ARTIST LOYALTY TIMELINE',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'A lasting bond with your favorite artist',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.brand,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${item.daysLoyal} DAYS',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Narrative Callout
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.brand.withValues(alpha: 0.15)),
            ),
            child: Text.rich(
              TextSpan(
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.5,
                  color: AppTheme.textPrimary,
                ),
                children: [
                  const TextSpan(text: "You've been listening to "),
                  TextSpan(
                    text: item.artistName,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppTheme.brand,
                    ),
                  ),
                  const TextSpan(text: ' since '),
                  TextSpan(
                    text: dateFormatted,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const TextSpan(text: ', and '),
                  TextSpan(
                    text: '${item.daysLoyal} days later',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppTheme.brand,
                    ),
                  ),
                  const TextSpan(text: ", they're still in your top rotation."),
                ],
              ),
            ),
          ),

          const SizedBox(height: 16),

          // Visual Timeline Indicator
          Row(
            children: [
              _buildTimelineNode(
                label: 'First Discovered',
                date: dateFormatted,
                isStart: true,
              ),
              Expanded(
                child: Container(
                  height: 2,
                  color: AppTheme.brand.withValues(alpha: 0.4),
                ),
              ),
              _buildTimelineNode(
                label: 'Today',
                date: '${item.daysLoyal} days strong',
                isStart: false,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineNode({
    required String label,
    required String date,
    required bool isStart,
  }) {
    return Column(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: isStart ? AppTheme.brand : Colors.white,
            shape: BoxShape.circle,
            border: Border.all(color: AppTheme.brand, width: 2),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: AppTheme.textMuted,
          ),
        ),
        Text(
          date,
          style: const TextStyle(
            fontSize: 11,
            color: AppTheme.textSecondary,
          ),
        ),
      ],
    );
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
    final m = months[date.month - 1];
    return '$m ${date.day}, ${date.year}';
  }
}
