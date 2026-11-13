import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template A: Classic Song Poster
/// Matches user reference: Floating poster card centered over dynamic art mesh
/// with rounded album artwork, bold title, artist, and transparent Zenify logo.
class ClassicSongTemplate extends StatelessWidget {
  const ClassicSongTemplate({
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
    final isDarkCard = textPolarity == StoryTextPolarity.light;

    final cardBg = isDarkCard
        ? const Color(0xE61C1C1E) // Translucent liquid charcoal
        : const Color(0xF5FFFFFF); // Warm off-white poster

    final titleColor = isDarkCard ? Colors.white : const Color(0xFF121214);
    final artistColor = isDarkCard
        ? Colors.white.withValues(alpha: 0.70)
        : const Color(0xFF121214).withValues(alpha: 0.65);

    final cardWidth = isSquare ? 280.0 : 270.0;
    final coverSize = isSquare ? 230.0 : 230.0;

    return Stack(
      fit: StackFit.expand,
      children: [
        // Background layer
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: backgroundStyle,
        ),

        // Centered floating poster card
        Center(
          child: Container(
            width: cardWidth,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: isDarkCard
                    ? Colors.white.withValues(alpha: 0.12)
                    : Colors.black.withValues(alpha: 0.06),
                width: 0.8,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.35),
                  blurRadius: 28,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Squircle Album Artwork
                Center(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      width: coverSize,
                      height: coverSize,
                      color: const Color(0xFF2C2C2E),
                      child: content.coverUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: content.coverUrl,
                              fit: BoxFit.cover,
                              errorWidget: (_, _, _) => _fallbackArtwork(),
                            )
                          : _fallbackArtwork(),
                    ),
                  ),
                ),

                const SizedBox(height: 14),

                // Song Title
                Text(
                  content.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.4,
                    color: titleColor,
                  ),
                ),

                const SizedBox(height: 3),

                // Artist Name
                Text(
                  content.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                    color: artistColor,
                  ),
                ),

                const SizedBox(height: 14),

                // Footer with subtle transparent Zenify branding
                ZenifyStoryBrand(
                  isLight: !isDarkCard,
                  iconSize: 15,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _fallbackArtwork() {
    return Container(
      color: const Color(0xFF2C2C2E),
      alignment: Alignment.center,
      child: Icon(
        Icons.music_note_rounded,
        size: 54,
        color: palette.primary.withValues(alpha: 0.8),
      ),
    );
  }
}
