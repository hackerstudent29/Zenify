import 'package:flutter/cupertino.dart';
import '../../../design_system/apple/apple_tokens.dart';

class ListeningHeatmap extends StatelessWidget {
  final List<List<double>> heatmapNormalized;
  final String? peakDay;
  final int? peakHour;
  final String? heatmapInsight;

  const ListeningHeatmap({
    super.key,
    required this.heatmapNormalized,
    this.peakDay,
    this.peakHour,
    this.heatmapInsight,
  });

  String _formatHour(int h) {
    if (h == 0) return '12 AM';
    if (h == 12) return '12 PM';
    if (h < 12) return '$h AM';
    return '${h - 12} PM';
  }

  @override
  Widget build(BuildContext context) {
    final days = const ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 14, bottom: 8, right: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'LISTENING RHYTHM',
                  style: AT.caption.copyWith(
                    color: AT.label2,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                  ),
                ),
                if (peakDay != null && peakHour != null)
                  Text(
                    'Peak: $peakDay · ${_formatHour(peakHour!)}',
                    style: AT.caption.copyWith(
                      color: AT.accent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AT.surface,
              borderRadius: BorderRadius.circular(AT.rMd),
              border: Border.all(color: AT.hairline, width: 0.6),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: List.generate(7, (d) {
                        return SizedBox(
                          height: 18,
                          width: 16,
                          child: Center(
                            child: Text(
                              days[d],
                              style: AT.micro.copyWith(
                                color: AT.label3,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: SizedBox(
                        height: 126,
                        child: CustomPaint(
                          painter: _HeatmapPainter(heatmap: heatmapNormalized),
                          child: const SizedBox.expand(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.only(left: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('12a', style: AT.micro.copyWith(color: AT.label3)),
                      Text('6a', style: AT.micro.copyWith(color: AT.label3)),
                      Text('12p', style: AT.micro.copyWith(color: AT.label3)),
                      Text('6p', style: AT.micro.copyWith(color: AT.label3)),
                      Text('11p', style: AT.micro.copyWith(color: AT.label3)),
                    ],
                  ),
                ),
                if (heatmapInsight != null && heatmapInsight!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    height: 0.5,
                    color: AT.hairline,
                  ),
                  const SizedBox(height: 10),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        CupertinoIcons.bolt_fill,
                        color: AT.accent,
                        size: 14,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          heatmapInsight!,
                          style: AT.footnote.copyWith(color: AT.label2),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeatmapPainter extends CustomPainter {
  final List<List<double>> heatmap;

  _HeatmapPainter({required this.heatmap});

  @override
  void paint(Canvas canvas, Size size) {
    final cellW = size.width / 24;
    final cellH = size.height / 7;
    const gap = 2.0;

    for (var d = 0; d < 7; d++) {
      for (var h = 0; h < 24; h++) {
        final norm =
            (d < heatmap.length && h < heatmap[d].length) ? heatmap[d][h] : 0.0;
        final rect = RRect.fromRectAndRadius(
          Rect.fromLTWH(
            h * cellW + gap / 2,
            d * cellH + gap / 2,
            (cellW - gap).clamp(2.0, 40.0),
            (cellH - gap).clamp(2.0, 40.0),
          ),
          const Radius.circular(3.5),
        );

        final color = norm <= 0.0
            ? AT.fill
            : AT.accent.withValues(alpha: 0.18 + (norm * 0.82));
        canvas.drawRRect(rect, Paint()..color = color);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _HeatmapPainter oldDelegate) =>
      oldDelegate.heatmap != heatmap;
}
