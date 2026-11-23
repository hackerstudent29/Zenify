import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// Add-on: Listening Focus & Completion Rate card.
/// Shows completion percentage, skip rate, and listening focus assessment.
class CompletionFocusCard extends StatelessWidget {
  final ReplayAggregate aggregate;

  const CompletionFocusCard({
    super.key,
    required this.aggregate,
  });

  @override
  Widget build(BuildContext context) {
    final completionPct = (aggregate.completionRate * 100).round();
    final totalSkips = aggregate.skips.fold<int>(0, (sum, s) => sum + s.skipCount);
    final skipRatePct = aggregate.totalStarts > 0
        ? ((totalSkips / aggregate.totalStarts) * 100).round().clamp(0, 100)
        : 0;

    String focusBadge;
    Color focusColor;
    String focusDesc;

    if (completionPct >= 85) {
      focusBadge = 'DEEP IMMERSION';
      focusColor = const Color(0xFF10B981); // Emerald
      focusDesc = 'You let songs play naturally to their last second.';
    } else if (completionPct >= 65) {
      focusBadge = 'FOCUSED FLOW';
      focusColor = AppTheme.brand; // Radiant Crimson
      focusDesc = 'Steady and engaged with most of your queue.';
    } else {
      focusBadge = 'FAST EXPLORER';
      focusColor = const Color(0xFFF59E0B); // Amber
      focusDesc = 'Quickly sampling vibes and finding new sounds.';
    }

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
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppTheme.brand.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.center_focus_strong_rounded,
                      color: AppTheme.brand,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'LISTENING FOCUS & COMPLETION',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      color: AppTheme.textMuted,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: focusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: focusColor.withValues(alpha: 0.3)),
                ),
                child: Text(
                  focusBadge,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                    color: focusColor,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Hero Completion Stat
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '$completionPct%',
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                  color: AppTheme.textPrimary,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'completion rate',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),

          const SizedBox(height: 4),
          Text(
            focusDesc,
            style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.6)),
          ),

          const SizedBox(height: 16),

          // Two Stat Pillars: Natural Ends vs Skip Rate
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'NATURAL FINISHES',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.textMuted,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${(aggregate.totalStarts * aggregate.completionRate).round()} / ${aggregate.totalStarts}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'SKIP RATE',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.textMuted,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$skipRatePct%',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: skipRatePct > 30 ? Colors.amberAccent : AppTheme.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
