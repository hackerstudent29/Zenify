import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../models/story_customization.dart';
import '../services/artwork_palette_service.dart';

/// Reusable dynamic art mesh / blurred cover / charcoal background for story cards.
/// Deterministic and instant-rendering for RepaintBoundary export.
class ArtMeshBackground extends StatelessWidget {
  const ArtMeshBackground({
    super.key,
    required this.coverUrl,
    this.palette,
    this.style = StoryBackgroundStyle.artMesh,
    this.darken = true,
  });

  final String coverUrl;
  final ArtworkPalette? palette;
  final StoryBackgroundStyle style;
  final bool darken;

  @override
  Widget build(BuildContext context) {
    switch (style) {
      case StoryBackgroundStyle.blurredCover:
        return _buildBlurredCover();
      case StoryBackgroundStyle.solidDark:
        return _buildSolidDark();
      case StoryBackgroundStyle.artMesh:
        return _buildArtMesh();
    }
  }

  Widget _buildBlurredCover() {
    return Stack(
      fit: StackFit.expand,
      children: [
        Container(color: const Color(0xFF121214)),
        if (coverUrl.isNotEmpty)
          Positioned.fill(
            child: CachedNetworkImage(
              imageUrl: coverUrl,
              fit: BoxFit.cover,
              errorWidget: (_, _, _) => const SizedBox.shrink(),
            ),
          ),
        BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 55, sigmaY: 55),
          child: Container(
            color: Colors.black.withValues(alpha: darken ? 0.65 : 0.40),
          ),
        ),
      ],
    );
  }

  Widget _buildSolidDark() {
    final p = palette ?? ArtworkPaletteService.instance.getCachedOrFallback(coverUrl);
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF121214),
        gradient: RadialGradient(
          center: const Alignment(0, -0.4),
          radius: 1.1,
          colors: [
            p.primary.withValues(alpha: 0.18),
            const Color(0xFF121214),
          ],
        ),
      ),
    );
  }

  Widget _buildArtMesh() {
    final p = palette ?? ArtworkPaletteService.instance.getCachedOrFallback(coverUrl);

    return Stack(
      fit: StackFit.expand,
      children: [
        // Base dark backdrop
        Container(color: p.background),

        // Fluid colorful orb 1 (top-left)
        Positioned(
          top: -80,
          left: -80,
          width: 320,
          height: 320,
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: p.primary.withValues(alpha: 0.65),
            ),
          ),
        ),

        // Fluid colorful orb 2 (top-right)
        Positioned(
          top: 40,
          right: -70,
          width: 280,
          height: 280,
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: p.secondary.withValues(alpha: 0.55),
            ),
          ),
        ),

        // Fluid colorful orb 3 (center-bottom)
        Positioned(
          bottom: -40,
          left: 30,
          width: 300,
          height: 300,
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: p.accent.withValues(alpha: 0.45),
            ),
          ),
        ),

        // Fluid colorful orb 4 (bottom-right)
        Positioned(
          bottom: -70,
          right: -60,
          width: 260,
          height: 260,
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: p.primary.withValues(alpha: 0.35),
            ),
          ),
        ),

        // Soft frosted blur overlay for cinematic seamless flow
        Positioned.fill(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 65, sigmaY: 65),
            child: Container(
              color: Colors.black.withValues(alpha: darken ? 0.38 : 0.15),
            ),
          ),
        ),

        // Radial vignette to protect edges and text legibility
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.center,
                radius: 1.25,
                colors: [
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.45),
                ],
                stops: const [0.4, 1.0],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

