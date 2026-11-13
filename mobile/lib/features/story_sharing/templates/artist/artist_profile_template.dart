import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template A: Artist Profile
/// Circular portrait, real listener/audience line if present, and top 3 real songs.
class ArtistProfileTemplate extends StatelessWidget {
  const ArtistProfileTemplate({
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
    final topTracks = content.topTracks.take(3).toList();

    return Stack(
      fit: StackFit.expand,
      children: [
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: backgroundStyle,
          darken: true,
        ),

        Padding(
          padding: EdgeInsets.fromLTRB(
            22,
            isSquare ? 20 : 64,
            22,
            isSquare ? 20 : 72,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Top brand
              const Align(
                alignment: Alignment.topLeft,
                child: ZenifyStoryBrand(
                  iconSize: 15,
                  isLight: false,
                ),
              ),

              const Spacer(),

              // Circular Artist Portrait with glowing border
              Container(
                width: isSquare ? 110 : 130,
                height: isSquare ? 110 : 130,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.20),
                    width: 2.0,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.40),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: ClipOval(
                  child: content.coverUrl.isNotEmpty
                      ? CachedNetworkImage(
                          imageUrl: content.coverUrl,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) => Container(
                            color: const Color(0xFF2C2C2E),
                            child: const Icon(Icons.person, size: 48, color: Colors.white70),
                          ),
                        )
                      : Container(
                          color: const Color(0xFF2C2C2E),
                          child: const Icon(Icons.person, size: 48, color: Colors.white70),
                        ),
                ),
              ),

              const SizedBox(height: 14),

              // Artist Name
              Text(
                content.artistName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: isSquare ? 22 : 24,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: Colors.white,
                ),
              ),

              if (content.audience != null && content.audience!.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  content.audience!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.70),
                  ),
                ),
              ],

              const SizedBox(height: 18),

              // Top Songs List (Only real songs!)
              if (topTracks.isNotEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.10),
                      width: 0.7,
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (int i = 0; i < topTracks.length; i++) ...[
                        Row(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: Container(
                                width: 32,
                                height: 32,
                                color: const Color(0xFF2C2C2E),
                                child: topTracks[i].coverUrl.isNotEmpty
                                    ? CachedNetworkImage(
                                        imageUrl: topTracks[i].coverUrl,
                                        fit: BoxFit.cover,
                                        errorWidget: (_, _, _) => const Icon(
                                          Icons.music_note_rounded,
                                          size: 16,
                                          color: Colors.white70,
                                        ),
                                      )
                                    : const Icon(
                                        Icons.music_note_rounded,
                                        size: 16,
                                        color: Colors.white70,
                                      ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                topTracks[i].title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (i < topTracks.length - 1)
                          const Divider(
                            height: 12,
                            thickness: 0.5,
                            color: Color(0x2EFFFFFF),
                          ),
                      ],
                    ],
                  ),
                ),

              const Spacer(),
            ],
          ),
        ),
      ],
    );
  }
}
