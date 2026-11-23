import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F5: Top Artists Widget with Tap-to-Expand played songs.
///
/// Features:
/// - Individual artist splitting (resolves "multiple artist as single artist" glitch).
/// - Displays rank, avatar/initials, artist name, total minutes, and qualified plays.
/// - Tap to expand: accordion expands to reveal all songs played by this artist in the period
///   with artwork, title, exact listened duration (with seconds), and play button.
class TopArtistsSection extends StatefulWidget {
  const TopArtistsSection({
    super.key,
    required this.artists,
    this.maxDisplay = 5,
    this.onPlaySong,
  });

  final List<ArtistStat> artists;
  final int maxDisplay;
  final void Function(SongStat song)? onPlaySong;

  @override
  State<TopArtistsSection> createState() => _TopArtistsSectionState();
}

class _TopArtistsSectionState extends State<TopArtistsSection> {
  final Set<String> _expandedArtists = {};

  @override
  Widget build(BuildContext context) {
    if (widget.artists.isEmpty) return const SizedBox.shrink();

    final displayed = widget.artists.take(widget.maxDisplay).toList();

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
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'TOP ARTISTS',
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
                    'Your Soundtrack Creators',
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
                  '${widget.artists.length} Artists',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.brand,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),

          // Artist List
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: displayed.length,
            separatorBuilder: (_, _) => const Padding(
              padding: EdgeInsets.symmetric(vertical: 4),
              child: Divider(color: AppTheme.border, height: 1),
            ),
            itemBuilder: (context, index) {
              final artist = displayed[index];
              final rank = index + 1;
              final isExpanded = _expandedArtists.contains(artist.artistName);

              return _buildArtistRow(context, artist, rank, isExpanded);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildArtistRow(
    BuildContext context,
    ArtistStat artist,
    int rank,
    bool isExpanded,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: () {
            setState(() {
              if (isExpanded) {
                _expandedArtists.remove(artist.artistName);
              } else {
                _expandedArtists.add(artist.artistName);
              }
            });
          },
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
            child: Row(
              children: [
                // Rank
                SizedBox(
                  width: 24,
                  child: Text(
                    '#$rank',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: rank == 1 ? AppTheme.brand : AppTheme.textMuted,
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // Avatar / Image
                CircleAvatar(
                  radius: 20,
                  backgroundColor: rank == 1
                      ? AppTheme.brand.withValues(alpha: 0.2)
                      : Colors.white.withValues(alpha: 0.08),
                  backgroundImage: artist.imageUrl != null && artist.imageUrl!.isNotEmpty
                      ? NetworkImage(artist.imageUrl!)
                      : null,
                  child: artist.imageUrl == null || artist.imageUrl!.isEmpty
                      ? Text(
                          artist.artistName.isNotEmpty
                              ? artist.artistName.substring(0, 1).toUpperCase()
                              : '?',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: rank == 1 ? AppTheme.brand : AppTheme.textPrimary,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 14),

                // Artist Name & Play Count
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              artist.artistName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                          ),
                          if (artist.isNewDiscovery) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppTheme.brand.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                'NEW',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.brand,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${artist.qualifiedPlays} plays · ${artist.trackCount} ${artist.trackCount == 1 ? 'song' : 'songs'}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),

                // Minutes Badge
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${artist.minutes} min',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Icon(
                      isExpanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      size: 18,
                      color: AppTheme.textMuted,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),

        // Expanded Song List Accordion
        if (isExpanded) ...[
          Container(
            margin: const EdgeInsets.only(left: 32, top: 4, bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: artist.tracks.isEmpty
                ? const Text(
                    'No song breakdown available for this artist.',
                    style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'SONGS PLAYED BY ${artist.artistName.toUpperCase()}',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textMuted,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ...artist.tracks.map((song) => _buildTrackSubRow(song)),
                    ],
                  ),
          ),
        ],
      ],
    );
  }

  Widget _buildTrackSubRow(SongStat song) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          // Thumbnail
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: Container(
              width: 34,
              height: 34,
              color: Colors.white.withValues(alpha: 0.06),
              child: song.coverUrl != null && song.coverUrl!.isNotEmpty
                  ? Image.network(
                      song.coverUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.music_note_rounded,
                        color: AppTheme.brand,
                        size: 16,
                      ),
                    )
                  : const Icon(
                      Icons.music_note_rounded,
                      color: AppTheme.brand,
                      size: 16,
                    ),
            ),
          ),
          const SizedBox(width: 10),

          // Title & Duration
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  song.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${song.qualifiedPlays} plays · ${song.formattedDuration}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),

          // Play button
          if (widget.onPlaySong != null)
            IconButton(
              icon: const Icon(
                Icons.play_circle_fill_rounded,
                color: AppTheme.brand,
                size: 26,
              ),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              onPressed: () => widget.onPlaySong!(song),
            ),
        ],
      ),
    );
  }
}
