import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template C: Liquid Album
/// Floating glass album composition over blurred artwork backdrop with metadata
/// and transparent Zenify branding.
class LiquidAlbumTemplate extends StatelessWidget {
  const LiquidAlbumTemplate({
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
    final coverSize = isSquare ? 150.0 : 170.0;

    return Stack(
      fit: StackFit.expand,
      children: [
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: StoryBackgroundStyle.blurredCover,
          darken: true,
        ),

        Center(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: isSquare ? 20 : 24),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.16),
                      width: 0.8,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.45),
                        blurRadius: 36,
                        offset: const Offset(0, 12),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Floating Cover
                      ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          width: coverSize,
                          height: coverSize,
                          color: const Color(0xFF2C2C2E),
                          child: content.coverUrl.isNotEmpty
                              ? CachedNetworkImage(
                                  imageUrl: content.coverUrl,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, _, _) => const Icon(
                                    Icons.album,
                                    size: 48,
                                    color: Colors.white70,
                                  ),
                                )
                              : const Icon(
                                  Icons.album,
                                  size: 48,
                                  color: Colors.white70,
                                ),
                        ),
                      ),

                      const SizedBox(height: 18),

                      // Title
                      Text(
                        content.albumTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: 'SF Pro Display',
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.4,
                          color: Colors.white,
                        ),
                      ),

                      const SizedBox(height: 3),

                      // Artist
                      Text(
                        content.artistName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 13.5,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.70),
                        ),
                      ),

                      const SizedBox(height: 16),

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
}
