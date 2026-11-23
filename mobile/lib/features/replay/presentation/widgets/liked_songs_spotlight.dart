import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F24: Liked Songs Spotlight Widget.
///
/// Features:
/// - Highlights user's favorite liked songs that were played in this period.
/// - Shows total library liked count and played counts.
class LikedSongsSpotlight extends StatelessWidget {
  const LikedSongsSpotlight({
    super.key,
    required this.likedPlayedSongs,
    required this.totalLikedInLibrary,
    this.onPlaySong,
  });

  final List<SongStat> likedPlayedSongs;
  final int totalLikedInLibrary;
  final void Function(SongStat song)? onPlaySong;

  @override
  Widget build(BuildContext context) {
    if (likedPlayedSongs.isEmpty) return const SizedBox.shrink();

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
                    'FAVORITES IN ROTATION',
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
                    'Liked Songs Spotlight',
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
                  color: AppTheme.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.favorite_rounded, size: 13, color: AppTheme.brand),
                    const SizedBox(width: 5),
                    Text(
                      '$totalLikedInLibrary Total Liked',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brand,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Liked Tracks List
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: likedPlayedSongs.take(5).length,
            separatorBuilder: (_, _) => const Padding(
              padding: EdgeInsets.symmetric(vertical: 2),
              child: Divider(color: AppTheme.border, height: 1),
            ),
            itemBuilder: (context, index) {
              final song = likedPlayedSongs[index];

              return InkWell(
                onTap: onPlaySong != null ? () => onPlaySong!(song) : null,
                borderRadius: BorderRadius.circular(12),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  child: Row(
                    children: [
                      // Heart Icon
                      const Icon(
                        Icons.favorite_rounded,
                        color: AppTheme.brand,
                        size: 16,
                      ),
                      const SizedBox(width: 12),

                      // Artwork
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          width: 40,
                          height: 40,
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
                      const SizedBox(width: 12),

                      // Title & Artist
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              song.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.textPrimary,
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
                      const SizedBox(width: 10),

                      // Duration & Plays
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
                            '${song.qualifiedPlays} plays',
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
