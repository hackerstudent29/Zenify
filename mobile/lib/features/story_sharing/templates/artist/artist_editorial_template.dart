import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template B: Artist Editorial
/// Large full-canvas portrait with cinematic dark gradient, oversized typography,
/// and transparent Zenify logo.
class ArtistEditorialTemplate extends StatelessWidget {
  const ArtistEditorialTemplate({
    super.key,
    required this.content,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
  });

  final ArtistStoryContent content;
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
        // Full portrait image
        if (content.coverUrl.isNotEmpty)
          CachedNetworkImage(
            imageUrl: content.coverUrl,
            fit: BoxFit.cover,
            errorWidget: (_, _, _) => Container(color: palette.background),
          )
        else
          Container(color: palette.background),

        // Gradient overlay
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.30),
                Colors.transparent,
                Colors.black.withValues(alpha: 0.65),
                Colors.black.withValues(alpha: 0.94),
              ],
              stops: const [0.0, 0.4, 0.7, 1.0],
            ),
          ),
        ),

        // Safe margin content
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
                'ARTIST',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.0,
                  color: palette.primary,
                ),
              ),

              const SizedBox(height: 6),

              Text(
                content.artistName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 32,
                  height: 1.08,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1.0,
                  color: Colors.white,
                ),
              ),

              if (content.audience != null && content.audience!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  content.audience!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.75),
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
