import 'package:flutter/cupertino.dart';
import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';

class TopLists extends StatelessWidget {
  final List<dynamic> topArtists;
  final List<dynamic> topTracks;
  final ValueChanged<Map<String, dynamic>>? onTrackTapped;

  const TopLists({
    super.key,
    required this.topArtists,
    required this.topTracks,
    this.onTrackTapped,
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (topArtists.isNotEmpty)
          GroupedSection(
            title: 'TOP ARTISTS',
            children: List.generate(topArtists.length, (i) {
              final art = topArtists[i] as Map<String, dynamic>? ?? const {};
              final name = art['artistName']?.toString() ?? 'Unknown Artist';
              final plays = (art['plays'] as num? ?? 0).toInt();
              final ms = (art['listenedMs'] as num? ?? 0).toInt();
              final percentage = (art['percentage'] as num? ?? 0).toInt();

              return AppleRow(
                leading: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 22,
                      child: Text(
                        '${i + 1}',
                        style: AT.footnote.copyWith(
                          color: i == 0 ? AT.accent : AT.label3,
                          fontWeight: FontWeight.w700,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Avatar(name: name, size: 34),
                  ],
                ),
                title: name,
                subtitle: '$plays plays · ${_formatDuration(ms)}',
                trailing: percentage > 0
                    ? Text(
                        '$percentage%',
                        style: AT.subhead.copyWith(
                          color: i == 0 ? AT.accent : AT.label2,
                          fontWeight: FontWeight.w600,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      )
                    : null,
              );
            }),
          ),
        if (topTracks.isNotEmpty)
          GroupedSection(
            title: 'TOP SONGS',
            children: List.generate(topTracks.length, (i) {
              final track = topTracks[i] as Map<String, dynamic>? ?? const {};
              final title = track['trackTitle']?.toString() ?? 'Unknown Track';
              final artist = track['artistName']?.toString() ?? '';
              final album = track['trackAlbum']?.toString() ?? '';
              final plays = (track['plays'] as num? ?? 0).toInt();

              final subParts = <String>[];
              if (artist.isNotEmpty) subParts.add(artist);
              if (album.isNotEmpty) subParts.add(album);

              return AppleRow(
                leading: SizedBox(
                  width: 22,
                  child: Center(
                    child: Text(
                      '${i + 1}',
                      style: AT.footnote.copyWith(
                        color: i == 0 ? AT.accent : AT.label3,
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ),
                title: title,
                subtitle: subParts.isEmpty ? null : subParts.join(' · '),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '$plays ${plays == 1 ? 'play' : 'plays'}',
                      style: AT.footnote.copyWith(
                        color: AT.label2,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    if (onTrackTapped != null) ...[
                      const SizedBox(width: 8),
                      const Icon(
                        CupertinoIcons.play_fill,
                        size: 13,
                        color: AT.accent,
                      ),
                    ],
                  ],
                ),
                onTap: onTrackTapped != null ? () => onTrackTapped!(track) : null,
              );
            }),
          ),
      ],
    );
  }
}
