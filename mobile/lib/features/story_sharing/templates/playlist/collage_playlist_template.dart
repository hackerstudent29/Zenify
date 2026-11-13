import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template A: Playlist Collage
/// 2x2 collage of real album covers (adapting gracefully for 1, 2, 3, or 4 covers),
/// playlist title, curator, track count, and transparent Zenify logo.
class CollagePlaylistTemplate extends StatelessWidget {
  const CollagePlaylistTemplate({
    super.key,
    required this.content,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
  });

  final PlaylistStoryContent content;
  final ArtworkPalette palette;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final StoryAspectRatio aspectRatio;

  @override
  Widget build(BuildContext context) {
    final isSquare = aspectRatio == StoryAspectRatio.square;
    final gridCovers = content.covers.take(4).toList();

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
            22,
            isSquare ? 20 : 64,
            22,
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

              // 2x2 Collage Container
              Container(
                width: isSquare ? 190 : 210,
                height: isSquare ? 190 : 210,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.40),
                      blurRadius: 28,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: _buildCollageGrid(gridCovers),
                ),
              ),

              const SizedBox(height: 24),

              // Playlist Title
              Text(
                content.playlistTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: isSquare ? 21 : 24,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 4),

              // Owner & Count
              Text(
                [
                  content.owner,
                  if (content.tracks.isNotEmpty) '${content.tracks.length} Songs',
                ].join(' • '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.70),
                ),
              ),

              const Spacer(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCollageGrid(List<String> covers) {
    if (covers.isEmpty) {
      return Container(
        color: const Color(0xFF2C2C2E),
        child: const Icon(Icons.queue_music_rounded, size: 54, color: Colors.white70),
      );
    }

    if (covers.length == 1) {
      return _buildImage(covers[0]);
    }

    if (covers.length == 2) {
      return Row(
        children: [
          Expanded(child: _buildImage(covers[0])),
          Expanded(child: _buildImage(covers[1])),
        ],
      );
    }

    if (covers.length == 3) {
      return Row(
        children: [
          Expanded(child: _buildImage(covers[0])),
          Expanded(
            child: Column(
              children: [
                Expanded(child: _buildImage(covers[1])),
                Expanded(child: _buildImage(covers[2])),
              ],
            ),
          ),
        ],
      );
    }

    // 4 covers (2x2 grid)
    return Column(
      children: [
        Expanded(
          child: Row(
            children: [
              Expanded(child: _buildImage(covers[0])),
              Expanded(child: _buildImage(covers[1])),
            ],
          ),
        ),
        Expanded(
          child: Row(
            children: [
              Expanded(child: _buildImage(covers[2])),
              Expanded(child: _buildImage(covers[3])),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildImage(String url) {
    if (url.isEmpty) return Container(color: const Color(0xFF2C2C2E));
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      errorWidget: (_, _, _) => Container(
        color: const Color(0xFF2C2C2E),
        child: const Icon(Icons.music_note_rounded, color: Colors.white60),
      ),
    );
  }
}
