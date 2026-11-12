import 'dart:math';
import 'package:flutter/material.dart';
import '../../../design_system/apple/apple_tokens.dart';

class ListeningTimeline extends StatelessWidget {
  final List<dynamic> timeline;

  const ListeningTimeline({super.key, required this.timeline});

  String _formatDateLabel(dynamic raw) {
    final s = raw?.toString() ?? '';
    if (s.length >= 10) return s.substring(5, 10);
    return s;
  }

  @override
  Widget build(BuildContext context) {
    if (timeline.isEmpty) return const SizedBox.shrink();

    var maxMins = 1;
    for (final item in timeline) {
      final mins = (item['minutes'] as num? ?? 0).toInt();
      if (mins > maxMins) maxMins = mins;
    }

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
                  'DAILY ACTIVITY',
                  style: AT.caption.copyWith(
                    color: AT.label2,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                  ),
                ),
                Text(
                  'Peak: $maxMins min',
                  style: AT.caption.copyWith(color: AT.label2),
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
                SizedBox(
                  height: 92,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: timeline.map((item) {
                          final mins = (item['minutes'] as num? ?? 0).toInt();
                          final heightFactor = max(0.06, mins / maxMins);
                          final isPeak = mins == maxMins && mins > 0;
                          return Expanded(
                            child: Tooltip(
                              message:
                                  '${_formatDateLabel(item['date'])}: $mins min',
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 1.5),
                                child: FractionallySizedBox(
                                  heightFactor: heightFactor,
                                  alignment: Alignment.bottomCenter,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: isPeak
                                          ? AT.accent
                                          : AT.accent.withValues(
                                              alpha: mins > 0 ? 0.55 : 0.14,
                                            ),
                                      borderRadius: const BorderRadius.vertical(
                                        top: Radius.circular(3.5),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _formatDateLabel(timeline.first['date']),
                      style: AT.micro.copyWith(color: AT.label3),
                    ),
                    Text(
                      _formatDateLabel(timeline.last['date']),
                      style: AT.micro.copyWith(color: AT.label3),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
