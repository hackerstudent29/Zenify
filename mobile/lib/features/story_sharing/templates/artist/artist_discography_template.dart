import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template C: Artist Discography
/// Artist portrait, artist name, and 3 representative album / track covers.
class ArtistDiscographyTemplate extends StatelessWidget {
  const ArtistDiscographyTemplate({
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

    // Use album covers if present, or extract from topTracks
    final covers = content.albumCovers.isNotEmpty
        ? content.albumCovers.take(3).toList()
        : content.topTracks.map((t) => t.coverUrl).where((u) => u.isNotEmpty).take(3).toList();

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
            isSquare ? 20 : 68,
            22,
            isSquare ? 20 : 76,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const ZenifyStoryBrand(
                iconSize: 15,
                isLight: false,
              ),

              const Spacer(),

              // Circular artist avatar + name
              Row(
                children: [
                  ClipOval(
                    child: Container(
                      width: 52,
                      height: 52,
                      color: const Color(0xFF2C2C2E),
                      child: content.coverUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: content.coverUrl,
                              fit: BoxFit.cover,
                              errorWidget: (_, _, _) => const Icon(Icons.person, color: Colors.white70),
                            )
                          : const Icon(Icons.person, color: Colors.white70),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          content.artistName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'SF Pro Display',
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.4,
                            color: Colors.white,
                          ),
                        ),
                        if (content.audience != null && content.audience!.isNotEmpty)
                          Text(
                            content.audience!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withValues(alpha: 0.70),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // 3 Representative Covers
              if (covers.isNotEmpty) ...[
                Text(
                  'DISCOGRAPHY',
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                    color: Colors.white.withValues(alpha: 0.60),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    for (int i = 0; i < 3; i++)
                      Expanded(
                        child: Padding(
                          padding: EdgeInsets.only(
                            right: i < 2 ? 8.0 : 0.0,
                          ),
                          child: AspectRatio(
                            aspectRatio: 1.0,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                color: const Color(0xFF2C2C2E),
                                child: i < covers.length && covers[i].isNotEmpty
                                    ? CachedNetworkImage(
                                        imageUrl: covers[i],
                                        fit: BoxFit.cover,
                                        errorWidget: (_, _, _) => const Icon(
                                          Icons.music_note_rounded,
                                          color: Colors.white60,
                                        ),
                                      )
                                    : const Icon(
                                        Icons.music_note_rounded,
                                        color: Colors.white60,
                                      ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],

              const SizedBox(height: 12),
            ],
          ),
        ),
      ],
    );
  }
}
