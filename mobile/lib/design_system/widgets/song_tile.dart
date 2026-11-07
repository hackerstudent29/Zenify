import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/track.dart';
import '../../services/player_state.dart';
import '../../views/details/album_screen.dart';
import '../../views/details/artist_popup.dart';
import '../../views/details/artist_screen.dart';
import '../tokens/app_colors.dart';
import '../tokens/app_spacing.dart';
import '../tokens/app_typography.dart';
import 'equalizer_bars.dart';
import 'marquee_text.dart';
import 'pressable_scale.dart';
import 'zen_dropdown.dart';

/// Reusable Apple Music-style Song Tile for track lists, search results and queues.
class SongTile extends StatelessWidget {
  const SongTile({
    super.key,
    required this.track,
    this.isPlaying = false,
    this.isActive = false,
    this.index,
    this.onTap,
    this.onTrailingTap,
  });

  final Track track;
  final bool isPlaying;
  final bool isActive;
  final int? index;
  final VoidCallback? onTap;
  final VoidCallback? onTrailingTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? AppColors.surface.withValues(alpha: 0.6) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppSpacing.rTile),
        ),
        child: Row(
          children: [
            // Track Index or Equalizer
            if (index != null) ...[
              SizedBox(
                width: 24,
                child: isActive
                    ? Center(child: EqualizerBars(isPlaying: isPlaying, size: 14))
                    : Text(
                        '$index',
                        textAlign: TextAlign.center,
                        style: AppTypography.caption.copyWith(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textTertiary,
                        ),
                      ),
              ),
              const SizedBox(width: 12),
            ],

            // Squircle Artwork
            ClipRRect(
              borderRadius: BorderRadius.circular(AppSpacing.rArtList),
              child: SizedBox(
                width: 46,
                height: 46,
                child: CachedNetworkImage(
                  imageUrl: track.coverUrl,
                  fit: BoxFit.cover,
                  placeholder: (context, _) => Container(color: AppColors.surface2),
                  errorWidget: (context, error, stackTrace) => Container(
                    color: AppColors.surface2,
                    child: const Icon(Icons.music_note, color: AppColors.textTertiary, size: 20),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),

            // Metadata: Title and Artist
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  MarqueeText(
                    track.title,
                    active: isActive,
                    style: AppTypography.headline.copyWith(
                      fontSize: 15,
                      color: isActive ? AppColors.accent : AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      if (track.source == 'youtube') ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEF4444).withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.4), width: 0.5),
                          ),
                          child: const Text('YT', style: TextStyle(color: Color(0xFFEF4444), fontSize: 9, fontWeight: FontWeight.w700)),
                        ),
                      ] else ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: AppColors.accent.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: AppColors.accent.withValues(alpha: 0.3), width: 0.5),
                          ),
                          child: const Text('320K', style: TextStyle(color: AppColors.accent, fontSize: 9, fontWeight: FontWeight.w700)),
                        ),
                      ],
                      Expanded(
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            if (track.artists.length > 1) {
                              showArtistPopup(context, artists: track.artists);
                            } else {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => ArtistScreen(artistName: track.artist),
                                ),
                              );
                            }
                          },
                          onLongPress: () {
                            showArtistPopup(context, artists: track.artists, currentArtistName: track.artist);
                          },
                          child: MarqueeText(
                            track.displayArtists,
                            style: AppTypography.subhead.copyWith(
                              fontSize: 13,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Equalizer (if no index column is shown)
            if (index == null && isActive) ...[
              const SizedBox(width: 8),
              EqualizerBars(isPlaying: isPlaying, size: 16),
            ],

            // Context Menu Button
            const SizedBox(width: 8),
            IconButton(
              icon: const Icon(Icons.more_horiz, color: AppColors.textSecondary, size: 20),
              splashRadius: 20,
              onPressed: onTrailingTap ?? () => _showTrackOptions(context),
            ),
          ],
        ),
      ),
    );
  }

  void _showTrackOptions(BuildContext context) {
    final player = context.read<PlayerState>();
    ZenDropdown.showTrackMenu(
      context: context,
      trackTitle: track.title,
      artistName: track.artist,
      albumName: track.album,
      onPlayNext: () => player.playNext(track),
      onPlayLater: () => player.playLast(track),
      onGoToArtist: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ArtistScreen(artistName: track.artist)),
      ),
      onGoToAlbum: track.album.isNotEmpty && track.album != 'Single'
          ? () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => AlbumScreen(
                    albumTitle: track.album,
                    artistName: track.artist,
                    coverUrl: track.coverUrl,
                  ),
                ),
              )
          : null,
    );
  }
}
