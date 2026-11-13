import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template C: Liquid Glass Song
/// Matches user reference: Blurred artwork background with floating frosted glass card,
/// thumbnail cover, song title, artist, subtle waveform, and transparent Zenify logo.
class LiquidGlassSongTemplate extends StatelessWidget {
  const LiquidGlassSongTemplate({
    super.key,
    required this.content,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
  });

  final SongStoryContent content;
  final ArtworkPalette palette;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final StoryAspectRatio aspectRatio;

  @override
  Widget build(BuildContext context) {
    final isSquare = aspectRatio == StoryAspectRatio.square;

    return Stack(
      fit: StackFit.expand,
      children: [
        // Cinematic blurred cover background
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: StoryBackgroundStyle.blurredCover,
          darken: true,
        ),

        // Centered frosted liquid glass card
        Center(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: isSquare ? 20 : 22),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.40),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.18),
                      width: 0.8,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.40),
                        blurRadius: 30,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Top Row: Thumbnail + Title/Artist + Waveform
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          // Squircle thumbnail
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              width: 48,
                              height: 48,
                              color: const Color(0xFF2C2C2E),
                              child: content.coverUrl.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: content.coverUrl,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, _, _) => const Icon(
                                        Icons.music_note_rounded,
                                        color: Colors.white70,
                                        size: 24,
                                      ),
                                    )
                                  : const Icon(
                                      Icons.music_note_rounded,
                                      color: Colors.white70,
                                      size: 24,
                                    ),
                            ),
                          ),

                          const SizedBox(width: 12),

                          // Title and Artist
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  content.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontFamily: 'SF Pro Display',
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.3,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  content.subtitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontFamily: 'SF Pro',
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.white.withValues(alpha: 0.70),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(width: 8),

                          // Subtle waveform visualizer decoration
                          _buildWaveformBars(),
                        ],
                      ),

                      const SizedBox(height: 18),

                      // Bottom brand row
                      const ZenifyStoryBrand(
                        iconSize: 14,
                        isLight: false,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildWaveformBars() {
    const barHeights = [10.0, 18.0, 14.0, 24.0, 12.0, 20.0, 8.0];
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (int i = 0; i < barHeights.length; i++) ...[
          Container(
            width: 2.5,
            height: barHeights[i],
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.75),
              borderRadius: BorderRadius.circular(1.5),
            ),
          ),
          if (i < barHeights.length - 1) const SizedBox(width: 2.5),
        ],
      ],
    );
  }
}
