import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F11: Discovery Score & New Found Artists Carousel.
///
/// Highlights new discoveries, the new-vs-familiar ratio, the #1 new artist,
/// and a carousel of "Single-Play Gems" (artists where the user played only 1 song).
class DiscoverySection extends StatelessWidget {
  const DiscoverySection({
    super.key,
    required this.discovery,
    this.onTapArtist,
    this.onPlaySong,
  });

  final DiscoveryStat discovery;
  final ValueChanged<ArtistStat>? onTapArtist;
  final ValueChanged<SongStat>? onPlaySong;

  @override
  Widget build(BuildContext context) {
    if (discovery.totalArtistsCount == 0) {
      return const SizedBox.shrink();
    }

    final newPct = (discovery.newRatio * 100).round();
    final familiarPct = 100 - newPct;

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
                  Icons.explore_rounded,
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
                      'DISCOVERY & NEW FINDS',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'Fresh artists and hidden single-play gems',
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

          // Discovery Summary Highlight
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Text(
                          '${discovery.newArtistsCount}',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: AppTheme.brand,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          discovery.newArtistsCount == 1 ? 'new artist' : 'new artists',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      '$newPct% fresh listening',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brand,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Ratio Progress Bar
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: SizedBox(
                    height: 8,
                    child: Row(
                      children: [
                        // New portion
                        if (newPct > 0)
                          Expanded(
                            flex: newPct,
                            child: Container(color: AppTheme.brand),
                          ),
                        // Familiar portion
                        if (familiarPct > 0)
                          Expanded(
                            flex: familiarPct,
                            child: Container(color: Colors.white.withValues(alpha: 0.15)),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),

                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '$newPct% New Artists',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    Text(
                      '$familiarPct% Familiar Favorites',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Top New Artist Spotlight
          if (discovery.topNewArtist != null) ...[
            const SizedBox(height: 16),
            const Text(
              'TOP NEW DISCOVERY',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.textMuted,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),
            InkWell(
              onTap: onTapArtist != null ? () => onTapArtist!(discovery.topNewArtist!) : null,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.brand.withValues(alpha: 0.2)),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: AppTheme.brand.withValues(alpha: 0.2),
                      backgroundImage: discovery.topNewArtist!.imageUrl != null &&
                              discovery.topNewArtist!.imageUrl!.isNotEmpty
                          ? NetworkImage(discovery.topNewArtist!.imageUrl!)
                          : null,
                      child: discovery.topNewArtist!.imageUrl == null ||
                              discovery.topNewArtist!.imageUrl!.isEmpty
                          ? Text(
                              discovery.topNewArtist!.artistName.isNotEmpty
                                  ? discovery.topNewArtist!.artistName.substring(0, 1).toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppTheme.brand,
                              ),
                            )
                          : null,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  discovery.topNewArtist!.artistName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.textPrimary,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppTheme.brand,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text(
                                  '#1 NEW',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${discovery.topNewArtist!.qualifiedPlays} plays · ${discovery.topNewArtist!.minutes} minutes',
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: AppTheme.textMuted,
                      size: 20,
                    ),
                  ],
                ),
              ),
            ),
          ],

          // Single-Play Gems Section
          if (discovery.newFoundGems.isNotEmpty) ...[
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'SINGLE-PLAY GEMS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textMuted,
                    letterSpacing: 0.5,
                  ),
                ),
                Text(
                  '${discovery.newFoundGems.length} artists',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Horizontal Snap Carousel of Single-Play Gems
            SizedBox(
              height: 150,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: discovery.newFoundGems.length,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final gem = discovery.newFoundGems[index];
                  final singleSong = gem.tracks.isNotEmpty ? gem.tracks.first : null;

                  return Container(
                    width: 130,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.03),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Artwork & Avatar Row
                        Stack(
                          children: [
                            // Song Artwork
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                width: double.infinity,
                                height: 60,
                                color: Colors.white.withValues(alpha: 0.08),
                                child: singleSong?.coverUrl != null &&
                                        singleSong!.coverUrl!.isNotEmpty
                                    ? Image.network(
                                        singleSong.coverUrl!,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, _, _) => const Icon(
                                          Icons.music_note_rounded,
                                          color: AppTheme.brand,
                                          size: 24,
                                        ),
                                      )
                                    : const Icon(
                                        Icons.music_note_rounded,
                                        color: AppTheme.brand,
                                        size: 24,
                                      ),
                              ),
                            ),
                            // Floating Artist Avatar Badge
                            Positioned(
                              bottom: 4,
                              right: 4,
                              child: CircleAvatar(
                                radius: 12,
                                backgroundColor: AppTheme.surface,
                                backgroundImage:
                                    gem.imageUrl != null && gem.imageUrl!.isNotEmpty
                                        ? NetworkImage(gem.imageUrl!)
                                        : null,
                                child: gem.imageUrl == null || gem.imageUrl!.isEmpty
                                    ? Text(
                                        gem.artistName.isNotEmpty
                                            ? gem.artistName.substring(0, 1).toUpperCase()
                                            : '?',
                                        style: const TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: AppTheme.brand,
                                        ),
                                      )
                                    : null,
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: 8),

                        // Song Title
                        Text(
                          singleSong?.title ?? 'Unknown Song',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.textPrimary,
                          ),
                        ),

                        // Artist Name
                        Text(
                          gem.artistName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppTheme.textSecondary,
                          ),
                        ),

                        const Spacer(),

                        // Play Action
                        InkWell(
                          onTap: singleSong != null && onPlaySong != null
                              ? () => onPlaySong!(singleSong)
                              : null,
                          child: const Row(
                            children: [
                              Icon(
                                Icons.play_circle_fill_rounded,
                                color: AppTheme.brand,
                                size: 16,
                              ),
                              SizedBox(width: 4),
                              Text(
                                'Play',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.brand,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}
