import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';
import '../story/story_walkthrough_screen.dart';

/// Add-on: Shareable Listener Personality Card.
/// Displays the user's computed archetype and reasoning.
class ListenerPersonalityCard extends StatelessWidget {
  final ReplayAggregate aggregate;
  final VoidCallback? onShare;

  const ListenerPersonalityCard({
    super.key,
    required this.aggregate,
    this.onShare,
  });

  @override
  Widget build(BuildContext context) {
    final personality = StoryPersonality.compute(aggregate);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.brand.withValues(alpha: 0.18),
            AppTheme.surface,
          ],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.brand.withValues(alpha: 0.25)),
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
                      color: AppTheme.brand.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      personality.icon,
                      color: AppTheme.brand,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'LISTENER PERSONALITY',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      color: AppTheme.textMuted,
                    ),
                  ),
                ],
              ),
              if (onShare != null)
                IconButton(
                  icon: const Icon(Icons.share_rounded, color: AppTheme.brand, size: 18),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: onShare,
                ),
            ],
          ),

          const SizedBox(height: 16),

          // Personality Title
          Text(
            personality.name.toUpperCase(),
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              letterSpacing: 0.5,
            ),
          ),

          const SizedBox(height: 6),

          // Reason description
          Text(
            personality.reason,
            style: TextStyle(
              fontSize: 13,
              color: Colors.white.withValues(alpha: 0.75),
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}
