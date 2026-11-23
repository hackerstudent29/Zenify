import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F12: Music Geography Section.
///
/// Displays countries of origin for listened songs with:
/// - Top 3 podium (#1, #2, #3 favorite countries)
/// - Strict UNIQUE track count (different songs only, never counting a song multiple times)
/// - Total listening duration per country
/// - Country flag emoji
class MusicGeographySection extends StatelessWidget {
  const MusicGeographySection({
    super.key,
    required this.countries,
  });

  final List<CountryStat> countries;

  @override
  Widget build(BuildContext context) {
    if (countries.isEmpty) {
      return const SizedBox.shrink();
    }

    final top3 = countries.take(3).toList();
    final remaining = countries.skip(3).toList();

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
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.public_rounded,
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
                      'MUSIC GEOGRAPHY',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'Origin places of your distinct songs & listening time',
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

          const SizedBox(height: 20),

          // Podium for Top 3 (or fewer if < 3)
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // #2 Country (Left)
              if (top3.length > 1)
                Expanded(
                  child: _buildPodiumStep(
                    country: top3[1],
                    rank: 2,
                    height: 110,
                    rankColor: const Color(0xFFC0C0C0), // Silver
                  ),
                )
              else
                const Spacer(),

              const SizedBox(width: 8),

              // #1 Country (Center - Tallest)
              Expanded(
                child: _buildPodiumStep(
                  country: top3[0],
                  rank: 1,
                  height: 135,
                  rankColor: AppTheme.brand, // Gold/Brand Crimson
                  isTop: true,
                ),
              ),

              const SizedBox(width: 8),

              // #3 Country (Right)
              if (top3.length > 2)
                Expanded(
                  child: _buildPodiumStep(
                    country: top3[2],
                    rank: 3,
                    height: 95,
                    rankColor: const Color(0xFFCD7F32), // Bronze
                  ),
                )
              else
                const Spacer(),
            ],
          ),

          // Remaining Countries List (if any)
          if (remaining.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text(
              'OTHER REGIONS & COUNTRIES',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.textMuted,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: remaining.length,
              separatorBuilder: (_, _) => const Padding(
                padding: EdgeInsets.symmetric(vertical: 2),
                child: Divider(color: AppTheme.border, height: 1),
              ),
              itemBuilder: (context, index) {
                final country = remaining[index];
                final rank = index + 4;

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 24,
                        child: Text(
                          '#$rank',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textMuted,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        country.flagEmoji ?? '🌍',
                        style: const TextStyle(fontSize: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              country.countryName,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                            Text(
                              '${country.uniqueTrackCount} ${country.uniqueTrackCount == 1 ? 'distinct song' : 'distinct songs'}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        _formatDuration(country.listenedMs),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPodiumStep({
    required CountryStat country,
    required int rank,
    required double height,
    required Color rankColor,
    bool isTop = false,
  }) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Flag
        Text(
          country.flagEmoji ?? '🌍',
          style: TextStyle(fontSize: isTop ? 28 : 22),
        ),
        const SizedBox(height: 4),

        // Country Name
        Text(
          country.countryName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: isTop ? 13 : 12,
            fontWeight: FontWeight.w700,
            color: AppTheme.textPrimary,
          ),
        ),

        const SizedBox(height: 2),

        // Unique Songs (strictly distinct songs)
        Text(
          '${country.uniqueTrackCount} ${country.uniqueTrackCount == 1 ? 'song' : 'songs'}',
          style: const TextStyle(
            fontSize: 11,
            color: AppTheme.textSecondary,
          ),
        ),

        const SizedBox(height: 6),

        // Podium Block
        Container(
          width: double.infinity,
          height: height,
          decoration: BoxDecoration(
            color: isTop
                ? AppTheme.brand.withValues(alpha: 0.18)
                : Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isTop ? AppTheme.brand.withValues(alpha: 0.4) : AppTheme.border,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: rankColor.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                  border: Border.all(color: rankColor, width: 1.5),
                ),
                alignment: Alignment.center,
                child: Text(
                  '$rank',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: rankColor,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  _formatDuration(country.listenedMs),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: isTop ? 13 : 11,
                    fontWeight: FontWeight.w800,
                    color: isTop ? AppTheme.brand : AppTheme.textPrimary,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _formatDuration(int ms) {
    final totalMinutes = (ms / 60000).round();
    final h = totalMinutes ~/ 60;
    final m = totalMinutes % 60;

    if (h > 0) {
      return '$h hr $m min';
    } else {
      return '$m min';
    }
  }
}
