import 'package:flutter/cupertino.dart';
import '../../../design_system/apple/apple_tokens.dart';

class SummaryCards extends StatelessWidget {
  final int totalListeningMs;
  final int totalPlays;
  final int streakDays;
  final int uniqueTracks;
  final int uniqueArtists;
  final int skipRatePct;
  final int? timeDeltaPct;
  final int? playsDeltaPct;

  const SummaryCards({
    super.key,
    required this.totalListeningMs,
    required this.totalPlays,
    required this.streakDays,
    required this.uniqueTracks,
    required this.uniqueArtists,
    required this.skipRatePct,
    this.timeDeltaPct,
    this.playsDeltaPct,
  });

  String _formatDuration(int ms) {
    final totalMinutes = (ms / 60000).floor();
    final hours = totalMinutes ~/ 60;
    final minutes = totalMinutes % 60;
    if (hours > 0) return '${hours}h ${minutes}m';
    return '${minutes}m';
  }

  @override
  Widget build(BuildContext context) {
    final items = [
      _MetricItem(
        label: 'Time Played',
        value: _formatDuration(totalListeningMs),
        deltaPct: timeDeltaPct,
        icon: CupertinoIcons.clock_fill,
        color: AT.accent,
      ),
      _MetricItem(
        label: 'Qualified Plays',
        value: '$totalPlays',
        deltaPct: playsDeltaPct,
        icon: CupertinoIcons.play_circle_fill,
        color: AT.blue,
      ),
      _MetricItem(
        label: 'Current Streak',
        value: '$streakDays ${streakDays == 1 ? 'day' : 'days'}',
        icon: CupertinoIcons.flame_fill,
        color: AT.amber,
      ),
      _MetricItem(
        label: 'Unique Songs',
        value: '$uniqueTracks',
        icon: CupertinoIcons.music_note,
        color: AT.green,
      ),
      _MetricItem(
        label: 'Unique Artists',
        value: '$uniqueArtists',
        icon: CupertinoIcons.person_2_fill,
        color: AT.label2,
      ),
      _MetricItem(
        label: 'Skip Rate',
        value: '$skipRatePct%',
        icon: CupertinoIcons.forward_end_fill,
        color: AT.label3,
      ),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 14, bottom: 8),
            child: Text(
              'AT A GLANCE',
              style: AT.caption.copyWith(
                color: AT.label2,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.6,
              ),
            ),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: items.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              mainAxisExtent: 86,
            ),
            itemBuilder: (_, i) => _MetricCard(item: items[i]),
          ),
        ],
      ),
    );
  }
}

class _MetricItem {
  final String label;
  final String value;
  final int? deltaPct;
  final IconData icon;
  final Color color;

  const _MetricItem({
    required this.label,
    required this.value,
    this.deltaPct,
    required this.icon,
    required this.color,
  });
}

class _MetricCard extends StatelessWidget {
  final _MetricItem item;

  const _MetricCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final delta = item.deltaPct;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AT.surface,
        borderRadius: BorderRadius.circular(AT.rMd),
        border: Border.all(color: AT.hairline, width: 0.6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(item.icon, size: 13, color: item.color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AT.footnote.copyWith(color: AT.label2),
                ),
              ),
              if (delta != null && delta != 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: (delta > 0 ? AT.green : AT.red).withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(AT.rPill),
                  ),
                  child: Text(
                    '${delta > 0 ? '+' : ''}$delta%',
                    style: AT.micro.copyWith(
                      color: delta > 0 ? AT.green : AT.red,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          Text(
            item.value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AT.title2.copyWith(
              fontWeight: FontWeight.w700,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
