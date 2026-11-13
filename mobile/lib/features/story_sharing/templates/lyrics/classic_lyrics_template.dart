import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template A: Classic Lyrics Focus
/// Matches user reference 1 left: Translucent dark floating container centered
/// over art mesh with bold stacked lyric lines, and footer containing mini cover,
/// song title, artist, and transparent Zenify logo.
class ClassicLyricsTemplate extends StatelessWidget {
  const ClassicLyricsTemplate({
    super.key,
    required this.content,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
  });

  final LyricsStoryContent content;
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
        // Dynamic art mesh backdrop
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: backgroundStyle,
        ),

        // Centered frosted container matching user reference screenshot
        Center(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: isSquare ? 20 : 22),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(22, 24, 22, 20),
              decoration: BoxDecoration(
                color: const Color(0xDE1C1C1E), // Frosted charcoal glass
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.12),
                  width: 0.8,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.45),
                    blurRadius: 36,
                    offset: const Offset(0, 14),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Stacked Lyric Lines (1 to 3 lines)
                  for (int i = 0; i < content.selectedLines.length; i++) ...[
                    Text(
                      content.selectedLines[i],
                      style: TextStyle(
                        fontFamily: 'SF Pro Display',
                        fontSize: isSquare ? 19 : 21,
                        height: 1.35,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.4,
                        color: Colors.white,
                      ),
                    ),
                    if (i < content.selectedLines.length - 1)
                      const SizedBox(height: 6),
                  ],

                  const SizedBox(height: 28),

                  // Footer: Mini Cover + Title + Artist + Zenify Brand
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Mini squircle cover
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          width: 38,
                          height: 38,
                          color: const Color(0xFF2C2C2E),
                          child: content.coverUrl.isNotEmpty
                              ? CachedNetworkImage(
                                  imageUrl: content.coverUrl,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, _, _) => const Icon(
                                    Icons.music_note_rounded,
                                    color: Colors.white60,
                                    size: 20,
                                  ),
                                )
                              : const Icon(
                                  Icons.music_note_rounded,
                                  color: Colors.white60,
                                  size: 20,
                                ),
                        ),
                      ),

                      const SizedBox(width: 12),

                      // Title and Artist
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              content.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'SF Pro Display',
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.2,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              content.subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: Colors.white.withValues(alpha: 0.65),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(width: 8),

                      // Transparent Zenify logo badge
                      const ZenifyStoryBrand(
                        iconSize: 14,
                        isLight: false,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
