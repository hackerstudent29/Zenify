import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template B: Typography Poster Lyrics
/// Matches user reference 1 right: Warm expressive gradient backdrop, large editorial serif/display
/// lyric lines, hairline divider, and refined metadata footer with transparent Zenify logo.
class TypographyPosterLyricsTemplate extends StatelessWidget {
  const TypographyPosterLyricsTemplate({
    super.key,
    required this.content,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
  });

  final LyricsStoryContent content;
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
        // Warm vibrant multi-orb gradient backdrop matching reference
        _buildWarmEditorialGradient(),

        // Content
        Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            isSquare ? 20 : 70,
            24,
            isSquare ? 20 : 80,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Zenify brand
              const ZenifyStoryBrand(
                iconSize: 15,
                isLight: false,
              ),

              const Spacer(),

              // Expressive Display Typography Lyrics
              for (int i = 0; i < content.selectedLines.length; i++) ...[
                Text(
                  content.selectedLines[i].toLowerCase(),
                  style: TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: isSquare ? 26 : 30,
                    height: 1.15,
                    fontWeight: FontWeight.w700,
                    fontStyle: FontStyle.italic,
                    letterSpacing: -0.8,
                    color: Colors.white,
                  ),
                ),
                if (i < content.selectedLines.length - 1)
                  const SizedBox(height: 6),
              ],

              const SizedBox(height: 20),

              // Hairline divider
              Container(
                width: double.infinity,
                height: 0.6,
                color: Colors.white.withValues(alpha: 0.25),
              ),

              const SizedBox(height: 14),

              // Bottom 2-column metadata row
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      width: 32,
                      height: 32,
                      color: const Color(0xFF2C2C2E),
                      child: content.coverUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: content.coverUrl,
                              fit: BoxFit.cover,
                              errorWidget: (_, _, _) => const Icon(
                                Icons.music_note_rounded,
                                color: Colors.white70,
                                size: 16,
                              ),
                            )
                          : const Icon(
                              Icons.music_note_rounded,
                              color: Colors.white70,
                              size: 16,
                            ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          content.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'SF Pro Display',
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          content.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.70),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildWarmEditorialGradient() {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Base dark warm tone
        Container(
          color: const Color(0xFF1E1418),
        ),

        // Radiant warm orange orb
        Positioned(
          top: 80,
          right: -40,
          width: 320,
          height: 320,
          child: Container(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0xFFE27329),
            ),
          ),
        ),

        // Radiant crimson orb
        Positioned(
          top: -40,
          left: -40,
          width: 300,
          height: 300,
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: palette.primary.withValues(alpha: 0.8),
            ),
          ),
        ),

        // Soft pastel peach / rose orb
        Positioned(
          bottom: 40,
          left: 20,
          width: 280,
          height: 280,
          child: Container(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0xFFE5A17D),
            ),
          ),
        ),

        // Heavy blur for smooth Apple Music Replay mesh feeling
        Positioned.fill(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 70, sigmaY: 70),
            child: Container(
              color: Colors.black.withValues(alpha: 0.28),
            ),
          ),
        ),
      ],
    );
  }
}
