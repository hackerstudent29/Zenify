import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F7: Top Songs Widget with Exact Seconds Precision.
///
/// Features:
/// - Minimal, simple, and clean layout (user mandated).
/// - Displays artwork, title, clean artist name, qualified play count, and exact duration with seconds (e.g. "3 min 45 sec" or "4 hr 12 min 34 sec").
/// - Numbered ranking (#1, #2, #3...).
/// - Reusable play action.
class TopSongsSection extends StatelessWidget {
  const TopSongsSection({
    super.key,
    required this.songs,
    this.maxDisplay = 10,
    this.onPlaySong,
  });

  final List<SongStat> songs;
  final int maxDisplay;
  final void Function(SongStat song)? onPlaySong;

  @override
  Widget build(BuildContext context) {
    if (songs.isEmpty) return const SizedBox.shrink();

    final displayed = songs.take(maxDisplay).toList();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'TOP SONGS',
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textMuted,
                      letterSpacing: 0.5,
                    ),
                  ),
                  SizedBox(height: 3),
                  Text(
                    'Most Played Tracks',
                    style: TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                      letterSpacing: -0.3,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.border),
                ),
                child: Text(
                  '${songs.length} Tracks',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.brand,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Simple, minimal song list
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: displayed.length,
            separatorBuilder: (_, _) => const Padding(
              padding: EdgeInsets.symmetric(vertical: 2),
              child: Divider(color: AppTheme.border, height: 1),
            ),
            itemBuilder: (context, index) {
              final song = displayed[index];
              final rank = index + 1;
              final isTop = rank == 1;

              return InkWell(
                onTap: onPlaySong != null ? () => onPlaySong!(song) : null,
                borderRadius: BorderRadius.circular(12),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  child: Row(
                    children: [
                      // Rank
                      SizedBox(
                        width: 24,
                        child: Text(
                          '$rank',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: isTop ? AppTheme.brand : AppTheme.textMuted,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Cover Artwork
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          width: 44,
                          height: 44,
                          color: Colors.white.withValues(alpha: 0.08),
                          child: song.coverUrl != null && song.coverUrl!.isNotEmpty
                              ? Image.network(
                                  song.coverUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => const Icon(
                                    Icons.music_note_rounded,
                                    color: AppTheme.brand,
                                    size: 20,
                                  ),
                                )
                              : const Icon(
                                  Icons.music_note_rounded,
                                  color: AppTheme.brand,
                                  size: 20,
                                ),
                        ),
                      ),
                      const SizedBox(width: 14),

                      // Title & Artist
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              song.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: isTop ? AppTheme.brand : AppTheme.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              song.artistRaw,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),

                      // Precise Listened Duration & Plays (Minimal & Simple)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            song.formattedDuration,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${song.qualifiedPlays} ${song.qualifiedPlays == 1 ? 'play' : 'plays'}',
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppTheme.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
