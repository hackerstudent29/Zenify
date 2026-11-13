import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template B: Album Editorial
/// Full-bleed cover top half with cinematic editorial typography, artist, year,
/// and subtle Zenify logo.
class AlbumEditorialTemplate extends StatelessWidget {
  const AlbumEditorialTemplate({
    super.key,
    required this.content,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
  });

  final AlbumStoryContent content;
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
        // Full cover image
        if (content.coverUrl.isNotEmpty)
          CachedNetworkImage(
            imageUrl: content.coverUrl,
            fit: BoxFit.cover,
            errorWidget: (_, _, _) => Container(color: palette.background),
          )
        else
          Container(color: palette.background),

        // Dark gradient overlay
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.35),
                Colors.transparent,
                Colors.black.withValues(alpha: 0.70),
                Colors.black.withValues(alpha: 0.95),
              ],
              stops: const [0.0, 0.35, 0.65, 1.0],
            ),
          ),
        ),

        Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            isSquare ? 20 : 72,
            24,
            isSquare ? 20 : 88,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Align(
                alignment: Alignment.topRight,
                child: ZenifyStoryBrand(
                  iconSize: 14,
                  isLight: false,
                ),
              ),

              const Spacer(),

              Text(
                'ALBUM',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.0,
                  color: palette.primary,
                ),
              ),

              const SizedBox(height: 6),

              Text(
                content.albumTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 28,
                  height: 1.12,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.8,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 6),

              Text(
                content.artistName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.85),
                ),
              ),

              if (content.year != null && content.year!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  content.year!,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: Colors.white.withValues(alpha: 0.55),
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
