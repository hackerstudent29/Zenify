import 'package:flutter/material.dart';
import '../../models/story_customization.dart';
import '../../models/story_share_content.dart';
import '../../services/artwork_palette_service.dart';
import '../../widgets/art_mesh_background.dart';
import '../../widgets/zenify_story_brand.dart';

/// Template C: Minimal Lyrics
/// Clean, spacious presentation with 1-3 selected lines, large breathing room,
/// and subtle bottom metadata.
class MinimalLyricsTemplate extends StatelessWidget {
  const MinimalLyricsTemplate({
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
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: backgroundStyle,
          darken: true,
        ),

        Padding(
          padding: EdgeInsets.fromLTRB(
            28,
            isSquare ? 24 : 72,
            28,
            isSquare ? 24 : 88,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const ZenifyStoryBrand(
                iconSize: 15,
                isLight: false,
              ),

              const Spacer(),

              // Minimal quotes mark
              Text(
                '“',
                style: TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 48,
                  height: 0.6,
                  fontWeight: FontWeight.w700,
                  color: palette.primary.withValues(alpha: 0.8),
                ),
              ),

              const SizedBox(height: 8),

              // Selected Lines
              for (int i = 0; i < content.selectedLines.length; i++) ...[
                Text(
                  content.selectedLines[i],
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: isSquare ? 20 : 22,
                    height: 1.4,
                    fontWeight: FontWeight.w600,
                    letterSpacing: -0.4,
                    color: Colors.white,
                  ),
                ),
                if (i < content.selectedLines.length - 1)
                  const SizedBox(height: 8),
              ],

              const Spacer(),

              // Clean footer line
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      '${content.title} • ${content.subtitle}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.white.withValues(alpha: 0.70),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}
