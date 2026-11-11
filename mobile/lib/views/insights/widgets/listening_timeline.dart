import 'package:flutter/material.dart';

import '../../../design_system/tokens/app_colors.dart';

class ListeningTimeline extends StatelessWidget {
  const ListeningTimeline({
    super.key,
    required this.timeline,
  });

  final List<dynamic> timeline; // [{ date: '2026-11-09', minutes: 84 }, ...]

  @override
  Widget build(BuildContext context) {
    if (timeline.isEmpty) return const SizedBox.shrink();

    int maxMinutes = 1;
    for (final item in timeline) {
      final mins = (item['minutes'] as num? ?? 0).toInt();
      if (mins > maxMinutes) maxMinutes = mins;
    }

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
                'LISTENING ACTIVITY',
                style: const TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: Colors.white,
                ),
              ),
              Text(
                'Peak: ${maxMinutes}m',
                style: const TextStyle(fontSize: 10, color: Colors.white38),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 90,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (int i = 0; i < timeline.length; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(
                    child: _buildBar(timeline[i], maxMinutes),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _formatDateLabel(timeline.first['date']),
                style: const TextStyle(fontSize: 9, color: Colors.white38),
              ),
              Text(
                _formatDateLabel(timeline.last['date']),
                style: const TextStyle(fontSize: 9, color: Colors.white38),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBar(dynamic item, int maxMinutes) {
    final mins = (item['minutes'] as num? ?? 0).toInt();
    final ratio = (mins / maxMinutes).clamp(0.06, 1.0);
    final isPeak = mins == maxMinutes && maxMinutes > 0;

    return Tooltip(
      message: '${_formatDateLabel(item['date'])}: $mins min',
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Container(
            height: 80 * ratio,
            decoration: BoxDecoration(
              color: isPeak
                  ? AppColors.crimson
                  : (mins > 0 ? AppColors.crimson.withValues(alpha: 0.45) : const Color(0xFF27272A)),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateLabel(dynamic dateStr) {
    if (dateStr == null) return '';
    try {
      final parts = dateStr.toString().split('-');
      if (parts.length >= 3) {
        return '${parts[1]}/${parts[2]}';
      }
    } catch (_) {}
    return dateStr.toString();
  }
}

