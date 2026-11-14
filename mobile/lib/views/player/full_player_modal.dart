import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/tokens/app_spacing.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/artwork_mesh_background.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/scrubber_slider.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../services/dock_visibility.dart';
import '../../services/player_state.dart';
import '../details/album_screen.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../lyrics/lyrics_sheet.dart';
import 'studio_fx_sheet.dart';

/// Flagship Fullscreen Apple Music Player Modal with Ambient Color Wash.
class FullPlayerModal extends StatefulWidget {
  const FullPlayerModal({super.key});

  @override
  State<FullPlayerModal> createState() => _FullPlayerModalState();
}

class _FullPlayerModalState extends State<FullPlayerModal> {
  bool _isLiked = false;

  void _openStudioFx(BuildContext context) {
    DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => const StudioFxSheet(),
      ),
    );
  }

  void _openLyrics(BuildContext context) {
    DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => const LyricsSheet(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final track = player.currentTrack;

    if (track == null) {
      return const SizedBox.shrink();
    }

    final screenWidth = MediaQuery.of(context).size.width;
    final artSize = (screenWidth - 64).clamp(260.0, 360.0);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: Stack(
        children: [
          // Liquid Artwork Mesh Background
          Positioned.fill(
            child: ArtworkMeshBackground(
              coverUrl: track.coverUrl,
              paused: !player.isPlaying,
            ),
          ),

          // Main Interactive Layout
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              child: Column(
                children: [
                  // Top Bar: Dismiss Chevron, Origin Label, Options
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      PressableScale(
                        onTap: () => Navigator.of(context).pop(),
                        child: Container(
                          width: 40,
                          height: 40,
                          alignment: Alignment.center,
                          child: const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white, size: 32),
                        ),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Text(
                              'PLAYING FROM ALBUM',
                              style: AppTypography.caption.copyWith(letterSpacing: 1.0),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              track.album,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.caption.copyWith(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.more_horiz_rounded, color: Colors.white),
                        onPressed: () {
                          ZenDropdown.showTrackMenu(context: context, track: track);
                        },
                      ),
                    ],
                  ),
                  const Spacer(),

                  // Squircle Album Artwork (28 Radius) with Deep Shadow
                  Center(
                    child: Container(
                      width: artSize,
                      height: artSize,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppSpacing.rArtPlayer),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.65),
                            blurRadius: 36,
                            offset: const Offset(0, 18),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(AppSpacing.rArtPlayer),
                        child: CachedNetworkImage(
                          imageUrl: track.coverUrl,
                          fit: BoxFit.cover,
                          placeholder: (context, _) => Container(color: AppColors.surface2),
                          errorWidget: (context, error, stackTrace) => Container(
                            color: AppColors.surface2,
                            child: const Icon(Icons.music_note, color: AppColors.textTertiary, size: 64),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const Spacer(),

                  // Metadata Block: Title, Artist, Like Heart
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              track.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'SF Pro Display',
                                fontSize: 22,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.45,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 4),
                            InteractiveArtistsText(
                              artists: track.resolvedArtists,
                              style: AppTypography.body.copyWith(
                                color: AppColors.textSecondary,
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                              maxLines: 1,
                            ),
                            if (track.album.isNotEmpty && track.album != 'Single') ...[
                              const SizedBox(height: 2),
                              GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => AlbumScreen(
                                        albumTitle: track.album,
                                        artistName: track.artist,
                                        coverUrl: track.coverUrl,
                                        browseId: track.albumBrowseId,
                                        initialTracks: [track],
                                      ),
                                    ),
                                  );
                                },
                                child: Text(
                                  track.album,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppTypography.footnote.copyWith(
                                    color: AppColors.textTertiary,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      PressableScale(
                        onTap: () {
                          setState(() {
                            _isLiked = !_isLiked;
                          });
                        },
                        child: Container(
                          width: 44,
                          height: 44,
                          alignment: Alignment.center,
                          child: Icon(
                            _isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                            color: _isLiked ? AppColors.accent : Colors.white,
                            size: 26,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Scrubber Slider
                  ScrubberSlider(
                    positionNotifier: player.positionNotifier,
                    duration: player.duration,
                    onSeek: (pos) => player.seek(pos),
                  ),
                  const SizedBox(height: 16),

                  // Main Transport Controls
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      // Shuffle
                      PressableScale(
                        onTap: () => player.toggleShuffle(),
                        child: Icon(
                          Icons.shuffle_rounded,
                          color: player.isShuffle ? AppColors.accent : AppColors.textSecondary,
                          size: 24,
                        ),
                      ),

                      // Previous
                      PressableScale(
                        onTap: () => player.previous(),
                        child: const Icon(Icons.skip_previous_rounded, color: Colors.white, size: 40),
                      ),

                      // Center Play / Pause Button with Accent Spring
                      PressableScale(
                        onTap: () => player.togglePlay(),
                        scale: 0.92,
                        child: Container(
                          width: 72,
                          height: 72,
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            player.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                            color: AppColors.canvas,
                            size: 40,
                          ),
                        ),
                      ),

                      // Next
                      PressableScale(
                        onTap: () => player.next(),
                        child: const Icon(Icons.skip_next_rounded, color: Colors.white, size: 40),
                      ),

                      // Repeat
                      PressableScale(
                        onTap: () => player.toggleRepeat(),
                        child: Icon(
                          player.repeatMode == ZenifyRepeatMode.one
                              ? Icons.repeat_one_rounded
                              : Icons.repeat_rounded,
                          color: player.repeatMode != ZenifyRepeatMode.off
                              ? AppColors.accent
                              : AppColors.textSecondary,
                          size: 24,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Secondary Action Dock: Studio FX, Lyrics, Audio Output
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      // Synced Lyrics Button
                      PressableScale(
                        onTap: (player.hasLyrics || player.isLoadingLyrics)
                            ? () => _openLyrics(context)
                            : null,
                        child: Opacity(
                          opacity: (player.hasLyrics || player.isLoadingLyrics) ? 1.0 : 0.28,
                          child: Row(
                            children: [
                              Icon(
                                Icons.chat_bubble_outline_rounded,
                                color: (player.hasLyrics || player.isLoadingLyrics)
                                    ? AppColors.textSecondary
                                    : Colors.white24,
                                size: 20,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Lyrics',
                                style: AppTypography.caption.copyWith(
                                  color: (player.hasLyrics || player.isLoadingLyrics)
                                      ? AppColors.textSecondary
                                      : Colors.white24,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                      // Studio FX DSP Button
                      PressableScale(
                        onTap: () => _openStudioFx(context),
                        child: Row(
                          children: [
                            const Icon(Icons.equalizer_rounded, color: AppColors.accent, size: 20),
                            const SizedBox(width: 6),
                            Text('Studio FX', style: AppTypography.caption.copyWith(color: AppColors.accent, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),

                      // AirPlay / Cast Picker
                      PressableScale(
                        onTap: () {},
                        child: const Icon(Icons.speaker_group_outlined, color: AppColors.textSecondary, size: 20),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
