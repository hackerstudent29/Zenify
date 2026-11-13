import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template A: Stacked Depth Album
/// Main album cover with two slightly offset artwork layers behind it creating
/// 3D depth, album title, artist, year, track count, and Zenify logo.
class StackedAlbumTemplate extends StatelessWidget {
  const StackedAlbumTemplate({
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
    final coverSize = isSquare ? 170.0 : 190.0;

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
            isSquare ? 20 : 76,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Align(
                alignment: Alignment.topLeft,
                child: ZenifyStoryBrand(
                  iconSize: 15,
                  isLight: false,
                ),
              ),

              const Spacer(),

              // 3D Stacked Album Artwork
              SizedBox(
                width: coverSize + 30,
                height: coverSize + 20,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Layer 3 (deepest offset)
                    Transform.translate(
                      offset: const Offset(14, -14),
                      child: Transform.scale(
                        scale: 0.88,
                        child: _buildCoverLayer(alpha: 0.35, blur: 16),
                      ),
                    ),

                    // Layer 2 (middle offset)
                    Transform.translate(
                      offset: const Offset(8, -8),
                      child: Transform.scale(
                        scale: 0.94,
                        child: _buildCoverLayer(alpha: 0.60, blur: 20),
                      ),
                    ),

                    // Layer 1 (primary front cover)
                    _buildCoverLayer(alpha: 1.0, blur: 30),
                  ],
                ),
              ),

              const SizedBox(height: 28),

              // Album Title
              Text(
                content.albumTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: isSquare ? 20 : 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 4),

              // Artist Name
              Text(
                content.artistName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 14.5,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.75),
                ),
              ),

              if (content.year != null || content.trackCount != null) ...[
                const SizedBox(height: 4),
                Text(
                  [
                    if (content.year != null && content.year!.isNotEmpty) content.year!,
                    if (content.trackCount != null && content.trackCount! > 0)
                      '${content.trackCount} Songs',
                  ].join(' • '),
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: Colors.white.withValues(alpha: 0.55),
                  ),
                ),
              ],

              const Spacer(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCoverLayer({required double alpha, required double blur}) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.40 * alpha),
            blurRadius: blur,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: 190,
          height: 190,
          color: const Color(0xFF2C2C2E),
          child: content.coverUrl.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: content.coverUrl,
                  fit: BoxFit.cover,
                  color: alpha < 1.0 ? Colors.black.withValues(alpha: 1.0 - alpha) : null,
                  colorBlendMode: alpha < 1.0 ? BlendMode.darken : null,
                  errorWidget: (_, _, _) => const Icon(Icons.album, color: Colors.white70),
                )
              : const Icon(Icons.album, color: Colors.white70),
        ),
      ),
    );
  }
}
