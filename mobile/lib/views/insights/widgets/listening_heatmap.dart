import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../design_system/tokens/app_colors.dart';

class ListeningHeatmap extends StatelessWidget {
  const ListeningHeatmap({
    super.key,
    required this.heatmapNormalized,
    this.peakDay,
    this.peakHour,
    this.heatmapInsight,
  });

  final List<List<int>> heatmapNormalized;
  final String? peakDay;
  final int? peakHour;
  final String? heatmapInsight;

  String _formatHour(int h) {
    if (h == 0) return '12 AM';
    if (h == 12) return '12 PM';
    if (h < 12) return '$h AM';
    return '${h - 12} PM';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'LISTENING HEATMAP (24 × 7)',
                style: GoogleFonts.oswald(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: Colors.white,
                ),
              ),
              const Text(
                'Local Time',
                style: TextStyle(fontSize: 10, color: Colors.white38),
              ),
            ],
          ),
          if (heatmapInsight != null && heatmapInsight!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              heatmapInsight!,
              style: const TextStyle(
                fontSize: 12,
                color: Colors.white70,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 120,
            child: CustomPaint(
              size: const Size(double.infinity, 120),
              painter: _HeatmapPainter(levels: heatmapNormalized),
            ),
          ),
          const SizedBox(height: 10),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('12 AM', style: TextStyle(fontSize: 9, color: Colors.white38)),
              Text('6 AM', style: TextStyle(fontSize: 9, color: Colors.white38)),
              Text('12 PM', style: TextStyle(fontSize: 9, color: Colors.white38)),
              Text('6 PM', style: TextStyle(fontSize: 9, color: Colors.white38)),
              Text('11 PM', style: TextStyle(fontSize: 9, color: Colors.white38)),
            ],
          ),
          if (peakDay != null && peakHour != null) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.crimson.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.crimson.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.bolt_rounded, color: AppColors.crimson, size: 14),
                      const SizedBox(width: 4),
                      Text(
                        'PEAK: ${peakDay!.toUpperCase()} AT ${_formatHour(peakHour!)}',
                        style: GoogleFonts.oswald(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.6,
                          color: AppColors.crimson,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _HeatmapPainter extends CustomPainter {
  _HeatmapPainter({required this.levels});

  final List<List<int>> levels;

  @override
  void paint(Canvas canvas, Size size) {
    if (levels.isEmpty) return;

    final days = levels.length; // 7
    final hours = levels[0].length; // 24

    final cellWidth = (size.width - (hours - 1) * 3) / hours;
    final cellHeight = (size.height - (days - 1) * 3) / days;

    final basePaint = Paint()..style = PaintingStyle.fill;

    // Percentile level colors: 0=dark neutral, 1=muted red, 2=mid, 3=radiant, 4=bright crimson
    final levelColors = [
      const Color(0xFF242428),
      AppColors.crimson.withValues(alpha: 0.30),
      AppColors.crimson.withValues(alpha: 0.55),
      AppColors.crimson.withValues(alpha: 0.80),
      const Color(0xFFFF2D55),
    ];

    for (int d = 0; d < days; d++) {
      for (int h = 0; h < hours; h++) {
        final level = levels[d][h].clamp(0, 4);

        final x = h * (cellWidth + 3);
        final y = d * (cellHeight + 3);
        final rect = RRect.fromRectAndRadius(
          Rect.fromLTWH(x, y, cellWidth, cellHeight),
          const Radius.circular(3),
        );

        basePaint.color = levelColors[level];
        canvas.drawRRect(rect, basePaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _HeatmapPainter oldDelegate) {
    return oldDelegate.levels != levels;
  }
}

