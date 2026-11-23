import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// Add-on: Languages Bar showing segmented percentage breakdown.
/// Hidden if coverage < 60% of played tracks with language metadata.
class LanguagesBarCard extends StatelessWidget {
  final List<LanguageStat> languages;

  const LanguagesBarCard({
    super.key,
    required this.languages,
  });

  static const List<Color> _palette = [
    Color(0xFFE11D48), // Brand Radiant Crimson
    Color(0xFFF59E0B), // Amber
    Color(0xFF10B981), // Emerald
    Color(0xFF3B82F6), // Blue
    Color(0xFF71717A), // Neutral Zinc (Other)
  ];

  @override
  Widget build(BuildContext context) {
    if (languages.isEmpty) {
      return const SizedBox.shrink();
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
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.translate_rounded,
                  color: AppTheme.brand,
                  size: 16,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'LANGUAGES',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Multi-Segmented Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              height: 10,
              child: Row(
                children: [
                  for (var i = 0; i < languages.length; i++)
                    Expanded(
                      flex: (languages[i].percentage * 10).round().clamp(1, 1000),
                      child: Container(
                        color: _palette[i % _palette.length],
                      ),
                    ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 14),

          // Legend
          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              for (var i = 0; i < languages.length; i++)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: _palette[i % _palette.length],
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${languages[i].language} · ${languages[i].percentage.round()}%',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}
