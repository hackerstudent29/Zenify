import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template B: Full Poster Song
/// Artwork fills background with cinematic gradient overlay, large editorial title, and Zenify logo.
class FullPosterSongTemplate extends StatelessWidget {
  const FullPosterSongTemplate({
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
        // Full-bleed artwork
        if (content.coverUrl.isNotEmpty)
          CachedNetworkImage(
            imageUrl: content.coverUrl,
            fit: BoxFit.cover,
            errorWidget: (_, _, _) => Container(color: palette.background),
          )
        else
          Container(color: palette.background),

        // Cinematic top-to-bottom dark gradient overlay
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.25),
                Colors.transparent,
                Colors.black.withValues(alpha: 0.60),
                Colors.black.withValues(alpha: 0.92),
              ],
              stops: const [0.0, 0.35, 0.65, 1.0],
            ),
          ),
        ),

        // Foreground content inside safe margins
        Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            isSquare ? 24 : 80,
            24,
            isSquare ? 24 : 96,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top tiny subtle brand mark
              const Align(
                alignment: Alignment.topRight,
                child: ZenifyStoryBrand(
                  iconSize: 14,
                  isLight: false,
                ),
              ),

              const Spacer(),

              // Editorial oversized song title
              Text(
                content.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 26,
                  height: 1.15,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 6),

              // Artist line
              Text(
                content.subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.85),
                ),
              ),

              if (content.track.album.isNotEmpty && content.track.album != 'Single') ...[
                const SizedBox(height: 4),
                Text(
                  content.track.album,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: Colors.white.withValues(alpha: 0.60),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
