import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart' show CupertinoActivityIndicator;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/tokens/app_spacing.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/glass_surface.dart';
import '../../design_system/widgets/marquee_text.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';

/// Floating Glass Mini Player anchored 12pt above the bottom tab bar.
class MiniPlayer extends StatelessWidget {
  const MiniPlayer({
    super.key,
    required this.onTapExpand,
  });

  final VoidCallback onTapExpand;

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final track = player.currentTrack;

    if (track == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: PressableScale(
        onTap: onTapExpand,
        child: Container(
          height: 64,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppSpacing.rCard),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.45),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: GlassSurface(
            borderRadius: BorderRadius.circular(AppSpacing.rCard),
            tintColor: const Color(0xE61C1C1E),
            child: Stack(
              children: [
                // Main Row Content
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(
                    children: [
                      // Squircle Artwork (44pt)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: SizedBox(
                          width: 44,
                          height: 44,
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

                      // Title & Artist Metadata
                      Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            MarqueeText(
                              MediaNormalizer.cleanCompactTitle(track.title),
                              active: player.isPlaying,
                              style: AppTypography.headline.copyWith(fontSize: 14),
                            ),
                            const SizedBox(height: 2),
                            MarqueeText(
                              MediaNormalizer.formatArtists(track.artist),
                              active: player.isPlaying,
                              style: AppTypography.subhead.copyWith(fontSize: 12),
                            ),
                          ],
                        ),
                      ),

                      // Play / Pause Button with Snappy Spring & Buffering Spinner
                      PressableScale(
                        onTap: () => player.togglePlay(),
                        child: Container(
                          width: 40,
                          height: 40,
                          alignment: Alignment.center,
                          child: player.isBuffering
                              ? const CupertinoActivityIndicator(color: Colors.white, radius: 10)
                              : Icon(
                                  player.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                                  color: Colors.white,
                                  size: 28,
                                ),
                        ),
                      ),

                      // Next Button
                      PressableScale(
                        onTap: () => player.next(),
                        child: Container(
                          width: 36,
                          height: 36,
                          alignment: Alignment.center,
                          child: const Icon(
                            Icons.fast_forward_rounded,
                            color: Colors.white,
                            size: 24,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // 2pt Micro Progress Bar Along the Bottom Edge
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 0,
                  child: ValueListenableBuilder<Duration>(
                    valueListenable: player.positionNotifier,
                    builder: (context, position, _) {
                      final totalMs = player.duration.inMilliseconds.toDouble().clamp(1.0, double.infinity);
                      final posMs = position.inMilliseconds.toDouble().clamp(0.0, totalMs);
                      final progress = (posMs / totalMs).clamp(0.0, 1.0);

                      return ClipRRect(
                        borderRadius: BorderRadius.circular(1),
                        child: SizedBox(
                          height: 2.0,
                          child: LinearProgressIndicator(
                            value: progress,
                            backgroundColor: Colors.white.withValues(alpha: 0.1),
                            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.accent),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
