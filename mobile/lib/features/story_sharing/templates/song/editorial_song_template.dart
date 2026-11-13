import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template D: Editorial Song
/// Bold asymmetric typography, generous negative space, offset artwork, and clean Zenify branding.
class EditorialSongTemplate extends StatelessWidget {
  const EditorialSongTemplate({
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
    final isLightText = textPolarity == StoryTextPolarity.light;
    final textColor = isLightText ? Colors.white : const Color(0xFF121214);
    final secondaryColor = isLightText
        ? Colors.white.withValues(alpha: 0.70)
        : const Color(0xFF121214).withValues(alpha: 0.65);

    return Stack(
      fit: StackFit.expand,
      children: [
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: backgroundStyle,
        ),

        Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            isSquare ? 20 : 64,
            24,
            isSquare ? 20 : 80,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top brand
              ZenifyStoryBrand(
                iconSize: 15,
                isLight: !isLightText,
              ),

              const Spacer(),

              // Asymmetric large artwork
              Align(
                alignment: Alignment.centerRight,
                child: Container(
                  width: isSquare ? 160 : 190,
                  height: isSquare ? 160 : 190,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.40),
                        blurRadius: 26,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: content.coverUrl.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: content.coverUrl,
                            fit: BoxFit.cover,
                            errorWidget: (_, _, _) => Container(color: const Color(0xFF2C2C2E)),
                          )
                        : Container(color: const Color(0xFF2C2C2E)),
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // Editorial Headline
              Text(
                content.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 28,
                  height: 1.12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.8,
                  color: textColor,
                ),
              ),

              const SizedBox(height: 6),

              // Artist Line
              Text(
                content.subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: secondaryColor,
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
                    color: secondaryColor.withValues(alpha: 0.6),
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
