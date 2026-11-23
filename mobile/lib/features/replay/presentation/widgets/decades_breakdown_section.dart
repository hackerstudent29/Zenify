import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F13: Era & Decades Breakdown Section.
///
/// Visualizes the distribution of music listened across eras:
/// - 2020s (Modern Hits)
/// - 2010s (Streaming Era)
/// - 2000s (Digital Age)
/// - Classic (70s - 90s Heritage)
class DecadesBreakdownSection extends StatelessWidget {
  const DecadesBreakdownSection({
    super.key,
    required this.decades,
  });

  final DecadesStat decades;

  @override
  Widget build(BuildContext context) {
    if (decades.totalMs == 0) {
      return const SizedBox.shrink();
    }

    final p20 = decades.twentiesPercent.round();
    final p10 = decades.tensPercent.round();
    final p00 = decades.thousandsPercent.round();
    final pCl = decades.classicsPercent.round();

    const color20 = AppTheme.brand; // Crimson
    const color10 = Color(0xFFA855F7); // Purple
    const color00 = Color(0xFF3B82F6); // Blue
    const colorCl = Color(0xFFF59E0B); // Amber

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
                  Icons.history_toggle_off_rounded,
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
                      'ERA & DECADES BREAKDOWN',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'Your journey across musical time periods',
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

          const SizedBox(height: 18),

          // Segmented Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              height: 12,
              child: Row(
                children: [
                  if (decades.twentiesMs > 0)
                    Expanded(
                      flex: decades.twentiesMs,
                      child: Container(color: color20),
                    ),
                  if (decades.tensMs > 0)
                    Expanded(
                      flex: decades.tensMs,
                      child: Container(color: color10),
                    ),
                  if (decades.thousandsMs > 0)
                    Expanded(
                      flex: decades.thousandsMs,
                      child: Container(color: color00),
                    ),
                  if (decades.classicsMs > 0)
                    Expanded(
                      flex: decades.classicsMs,
                      child: Container(color: colorCl),
                    ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 18),

          // Eras Grid / Legend
          Column(
            children: [
              _buildEraRow(
                era: '2020s',
                subtitle: 'Current Hits & Releases',
                pct: p20,
                ms: decades.twentiesMs,
                color: color20,
              ),
              const Divider(color: AppTheme.border, height: 16),
              _buildEraRow(
                era: '2010s',
                subtitle: 'Streaming Boom & Pop Anthems',
                pct: p10,
                ms: decades.tensMs,
                color: color10,
              ),
              const Divider(color: AppTheme.border, height: 16),
              _buildEraRow(
                era: '2000s',
                subtitle: 'Millennium Melodies',
                pct: p00,
                ms: decades.thousandsMs,
                color: color00,
              ),
              const Divider(color: AppTheme.border, height: 16),
              _buildEraRow(
                era: 'Classics',
                subtitle: '70s, 80s & 90s Golden Era',
                pct: pCl,
                ms: decades.classicsMs,
                color: colorCl,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEraRow({
    required String era,
    required String subtitle,
    required int pct,
    required int ms,
    required Color color,
  }) {
    final mins = (ms / 60000).round();

    return Row(
      children: [
        // Color Dot
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 10),

        // Era Name & Subtitle
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                era,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPrimary,
                ),
              ),
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppTheme.textSecondary,
                ),
              ),
            ],
          ),
        ),

        // Percentage & Minutes
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '$pct%',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
            Text(
              '$mins min',
              style: const TextStyle(
                fontSize: 11,
                color: AppTheme.textMuted,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
