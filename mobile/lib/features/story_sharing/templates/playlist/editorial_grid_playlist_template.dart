import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template C: Editorial Grid Playlist
/// Asymmetrical artwork arrangement with featured tracks, title, and Zenify logo.
class EditorialGridPlaylistTemplate extends StatelessWidget {
  const EditorialGridPlaylistTemplate({
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
    final covers = content.covers.take(3).toList();
    final featuredTracks = content.tracks.take(3).toList();

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
            isSquare ? 20 : 72,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const ZenifyStoryBrand(
                iconSize: 15,
                isLight: false,
              ),

              const Spacer(),

              // Asymmetric mini covers
              if (covers.isNotEmpty)
                Row(
                  children: [
                    // Larger lead cover
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Container(
                        width: 90,
                        height: 90,
                        color: const Color(0xFF2C2C2E),
                        child: CachedNetworkImage(
                          imageUrl: covers.first,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) => const Icon(Icons.music_note, color: Colors.white70),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Secondary smaller stacked covers
                    if (covers.length > 1)
                      Column(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              width: 42,
                              height: 42,
                              color: const Color(0xFF2C2C2E),
                              child: CachedNetworkImage(
                                imageUrl: covers[1],
                                fit: BoxFit.cover,
                                errorWidget: (_, _, _) => const Icon(Icons.music_note, color: Colors.white70),
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          if (covers.length > 2)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                width: 42,
                                height: 42,
                                color: const Color(0xFF2C2C2E),
                                child: CachedNetworkImage(
                                  imageUrl: covers[2],
                                  fit: BoxFit.cover,
                                  errorWidget: (_, _, _) => const Icon(Icons.music_note, color: Colors.white70),
                                ),
                              ),
                            ),
                        ],
                      ),
                  ],
                ),

              const SizedBox(height: 18),

              Text(
                content.playlistTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 3),

              Text(
                [
                  content.owner,
                  if (content.tracks.isNotEmpty) '${content.tracks.length} Songs',
                ].join(' • '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.70),
                ),
              ),

              if (featuredTracks.isNotEmpty) ...[
                const SizedBox(height: 14),
                for (int i = 0; i < featuredTracks.length; i++) ...[
                  Text(
                    '• ${featuredTracks[i].title}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.65),
                    ),
                  ),
                  const SizedBox(height: 2),
                ],
              ],

              const SizedBox(height: 12),
            ],
          ),
        ),
      ],
    );
  }
}
