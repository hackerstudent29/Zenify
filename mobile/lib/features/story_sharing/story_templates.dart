import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'story_models.dart';
import 'story_service.dart';
import 'story_widgets.dart';


// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE A: CLASSIC SONG POSTER
// Centered floating card with squircle album artwork, song title, artist,
// and transparent Zenify logo over dynamic art mesh background.
// ═══════════════════════════════════════════════════════════════════════════════
class ClassicSongTemplate extends StatelessWidget {
  const ClassicSongTemplate({
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
    final isDarkCard = textPolarity == StoryTextPolarity.light;

    final cardBg = isDarkCard
        ? const Color(0xE61C1C1E) // Translucent liquid charcoal
        : const Color(0xF5FFFFFF); // Warm off-white poster

    final titleColor = isDarkCard ? Colors.white : const Color(0xFF121214);
    final artistColor = isDarkCard
        ? Colors.white.withValues(alpha: 0.70)
        : const Color(0xFF121214).withValues(alpha: 0.65);

    final cardWidth = isSquare ? 280.0 : 270.0;
    final coverSize = isSquare ? 230.0 : 230.0;

    return Stack(
      fit: StackFit.expand,
      children: [
        // Background layer
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: backgroundStyle,
        ),

        // Centered floating poster card
        Center(
          child: Container(
            width: cardWidth,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: isDarkCard
                    ? Colors.white.withValues(alpha: 0.12)
                    : Colors.black.withValues(alpha: 0.06),
                width: 0.8,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.35),
                  blurRadius: 28,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Squircle Album Artwork
                Center(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      width: coverSize,
                      height: coverSize,
                      color: const Color(0xFF2C2C2E),
                      child: content.coverUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: content.coverUrl,
                              fit: BoxFit.cover,
                              errorWidget: (_, _, _) => _fallbackArtwork(),
                            )
                          : _fallbackArtwork(),
                    ),
                  ),
                ),

                const SizedBox(height: 14),

                // Song Title
                Text(
                  content.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.4,
                    color: titleColor,
                  ),
                ),

                const SizedBox(height: 3),

                // Artist Name
                Text(
                  content.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                    color: artistColor,
                  ),
                ),

                const SizedBox(height: 14),

                // Footer with subtle transparent Zenify branding
                ZenifyStoryBrand(
                  isLight: !isDarkCard,
                  iconSize: 15,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _fallbackArtwork() {
    return Container(
      color: const Color(0xFF2C2C2E),
      alignment: Alignment.center,
      child: Icon(
        Icons.music_note_rounded,
        size: 54,
        color: palette.primary.withValues(alpha: 0.8),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE B: FULL POSTER SONG
// Artwork fills background with cinematic gradient overlay, large editorial title,
// and Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
class FullPosterSongTemplate extends StatelessWidget {
  const FullPosterSongTemplate({
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

    return Stack(
      fit: StackFit.expand,
      children: [
        // Full-bleed artwork
        if (content.coverUrl.isNotEmpty)
          CachedNetworkImage(
            imageUrl: content.coverUrl,
            fit: BoxFit.cover,
            errorWidget: (_, _, _) => Container(color: palette.background),
          )
        else
          Container(color: palette.background),

        // Cinematic top-to-bottom dark gradient overlay
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.25),
                Colors.transparent,
                Colors.black.withValues(alpha: 0.60),
                Colors.black.withValues(alpha: 0.92),
              ],
              stops: const [0.0, 0.35, 0.65, 1.0],
            ),
          ),
        ),

        // Foreground content inside safe margins
        Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            isSquare ? 24 : 80,
            24,
            isSquare ? 24 : 96,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top tiny subtle brand mark
              const Align(
                alignment: Alignment.topRight,
                child: ZenifyStoryBrand(
                  iconSize: 14,
                  isLight: false,
                ),
              ),

              const Spacer(),

              // Editorial oversized song title
              Text(
                content.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 26,
                  height: 1.15,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 6),

              // Artist line
              Text(
                content.subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.85),
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
                    color: Colors.white.withValues(alpha: 0.60),
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE C: LIQUID GLASS SONG
// Blurred artwork background with floating frosted glass card, thumbnail cover,
// song title, artist, subtle waveform, and transparent Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
class LiquidGlassSongTemplate extends StatelessWidget {
  const LiquidGlassSongTemplate({
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

    return Stack(
      fit: StackFit.expand,
      children: [
        // Cinematic blurred cover background
        ArtMeshBackground(
          coverUrl: content.coverUrl,
          palette: palette,
          style: StoryBackgroundStyle.blurredCover,
          darken: true,
        ),

        // Centered frosted liquid glass card
        Center(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: isSquare ? 20 : 22),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.40),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.18),
                      width: 0.8,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.40),
                        blurRadius: 30,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Top Row: Thumbnail + Title/Artist + Waveform
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          // Squircle thumbnail
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              width: 48,
                              height: 48,
                              color: const Color(0xFF2C2C2E),
                              child: content.coverUrl.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: content.coverUrl,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, _, _) => const Icon(
                                        Icons.music_note_rounded,
                                        color: Colors.white70,
                                        size: 24,
                                      ),
                                    )
                                  : const Icon(
                                      Icons.music_note_rounded,
                                      color: Colors.white70,
                                      size: 24,
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
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.3,
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
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.white.withValues(alpha: 0.70),
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(width: 8),

                          // Subtle waveform visualizer decoration
                          _buildWaveformBars(),
                        ],
                      ),

                      const SizedBox(height: 18),

                      // Bottom brand row
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

  Widget _buildWaveformBars() {
    const barHeights = [14.0, 22.0, 10.0, 26.0, 18.0, 12.0];
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final h in barHeights)
          Container(
            width: 2.8,
            height: h,
            margin: const EdgeInsets.symmetric(horizontal: 1.5),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(1.5),
            ),
          ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE D: EDITORIAL SONG
// Bold asymmetric typography, generous negative space, offset artwork, and
// clean Zenify branding.
// ═══════════════════════════════════════════════════════════════════════════════
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



// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE A: CLASSIC LYRICS FOCUS
// Translucent dark floating container centered over art mesh with bold stacked
// lyric lines, and footer containing mini cover, song title, artist, and
// transparent Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE B: TYPOGRAPHY POSTER LYRICS
// Warm expressive gradient backdrop, large editorial display lyric lines,
// hairline divider, and refined metadata footer with transparent Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
class TypographyPosterLyricsTemplate extends StatelessWidget {
  const TypographyPosterLyricsTemplate({
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
        // Warm vibrant multi-orb gradient backdrop matching reference
        _buildWarmEditorialGradient(),

        // Content
        Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            isSquare ? 20 : 70,
            24,
            isSquare ? 20 : 80,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Zenify brand
              const ZenifyStoryBrand(
                iconSize: 15,
                isLight: false,
              ),

              const Spacer(),

              // Expressive Display Typography Lyrics
              for (int i = 0; i < content.selectedLines.length; i++) ...[
                Text(
                  content.selectedLines[i].toLowerCase(),
                  style: TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: isSquare ? 26 : 30,
                    height: 1.15,
                    fontWeight: FontWeight.w700,
                    fontStyle: FontStyle.italic,
                    letterSpacing: -0.8,
                    color: Colors.white,
                  ),
                ),
                if (i < content.selectedLines.length - 1)
                  const SizedBox(height: 6),
              ],

              const SizedBox(height: 20),

              // Hairline divider
              Container(
                width: double.infinity,
                height: 0.6,
                color: Colors.white.withValues(alpha: 0.25),
              ),

              const SizedBox(height: 14),

              // Bottom 2-column metadata row
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      width: 32,
                      height: 32,
                      color: const Color(0xFF2C2C2E),
                      child: content.coverUrl.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: content.coverUrl,
                              fit: BoxFit.cover,
                              errorWidget: (_, _, _) => const Icon(
                                Icons.music_note_rounded,
                                color: Colors.white70,
                                size: 16,
                              ),
                            )
                          : const Icon(
                              Icons.music_note_rounded,
                              color: Colors.white70,
                              size: 16,
                            ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          content.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'SF Pro Display',
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          content.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.70),
                          ),
                        ),
                      ],
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

  Widget _buildWarmEditorialGradient() {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Base dark warm tone
        Container(
          color: const Color(0xFF1E1418),
        ),

        // Radiant warm orange orb
        Positioned(
          top: 80,
          right: -40,
          width: 320,
          height: 320,
          child: Container(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0xFFE27329),
            ),
          ),
        ),

        // Radiant crimson orb
        Positioned(
          top: -40,
          left: -40,
          width: 300,
          height: 300,
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: palette.primary.withValues(alpha: 0.8),
            ),
          ),
        ),

        // Soft pastel peach / rose orb
        Positioned(
          bottom: 40,
          left: 20,
          width: 280,
          height: 280,
          child: Container(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0xFFE5A17D),
            ),
          ),
        ),

        // Heavy blur for smooth Apple Music Replay mesh feeling
        Positioned.fill(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 70, sigmaY: 70),
            child: Container(
              color: Colors.black.withValues(alpha: 0.28),
            ),
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE C: MINIMAL LYRICS
// Clean, spacious presentation with 1-3 selected lines, large breathing room,
// and subtle bottom metadata.
// ═══════════════════════════════════════════════════════════════════════════════
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



// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE A: STACKED DEPTH ALBUM
// Main album cover with two slightly offset artwork layers behind it creating
// 3D depth, album title, artist, year, track count, and Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
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
          width: 170,
          height: 170,
          color: const Color(0xFF2C2C2E),
          child: content.coverUrl.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: content.coverUrl,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => const Icon(Icons.album, size: 54, color: Colors.white70),
                )
              : const Icon(Icons.album, size: 54, color: Colors.white70),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE B: ALBUM EDITORIAL
// Full-bleed cover top half with cinematic editorial typography, artist, year,
// and subtle Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
class AlbumEditorialTemplate extends StatelessWidget {
  const AlbumEditorialTemplate({
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

    return Stack(
      fit: StackFit.expand,
      children: [
        // Full cover image
        if (content.coverUrl.isNotEmpty)
          CachedNetworkImage(
            imageUrl: content.coverUrl,
            fit: BoxFit.cover,
            errorWidget: (_, _, _) => Container(color: palette.background),
          )
        else
          Container(color: palette.background),

        // Dark gradient overlay
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.35),
                Colors.transparent,
                Colors.black.withValues(alpha: 0.70),
                Colors.black.withValues(alpha: 0.95),
              ],
              stops: const [0.0, 0.35, 0.65, 1.0],
            ),
          ),
        ),

        Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            isSquare ? 20 : 72,
            24,
            isSquare ? 20 : 88,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Align(
                alignment: Alignment.topRight,
                child: ZenifyStoryBrand(
                  iconSize: 14,
                  isLight: false,
                ),
              ),

              const Spacer(),

              Text(
                'ALBUM',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.0,
                  color: palette.primary,
                ),
              ),

              const SizedBox(height: 6),

              Text(
                content.albumTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 28,
                  height: 1.12,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.8,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 6),

              Text(
                content.artistName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.85),
                ),
              ),

              if (content.year != null && content.year!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  content.year!,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    color: Colors.white.withValues(alpha: 0.55),
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE C: LIQUID ALBUM
// Floating glass album composition over blurred artwork backdrop with metadata
// and transparent Zenify branding.
// ═══════════════════════════════════════════════════════════════════════════════
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



// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE A: ARTIST PROFILE
// Circular portrait, real listener/audience line if present, and top 3 real songs.
// ═══════════════════════════════════════════════════════════════════════════════
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
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    topTracks[i].title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontFamily: 'SF Pro',
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                  ),
                                  Text(
                                    topTracks[i].album.isNotEmpty ? topTracks[i].album : 'Single',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontFamily: 'SF Pro',
                                      fontSize: 11,
                                      color: Colors.white.withValues(alpha: 0.60),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (i < topTracks.length - 1)
                          Divider(
                            height: 12,
                            thickness: 0.5,
                            color: Colors.white.withValues(alpha: 0.10),
                          ),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE B: ARTIST EDITORIAL
// Large full-canvas portrait with cinematic dark gradient, oversized typography,
// and transparent Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
class ArtistEditorialTemplate extends StatelessWidget {
  const ArtistEditorialTemplate({
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

    return Stack(
      fit: StackFit.expand,
      children: [
        // Full portrait image
        if (content.coverUrl.isNotEmpty)
          CachedNetworkImage(
            imageUrl: content.coverUrl,
            fit: BoxFit.cover,
            errorWidget: (_, _, _) => Container(color: palette.background),
          )
        else
          Container(color: palette.background),

        // Gradient overlay
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.30),
                Colors.transparent,
                Colors.black.withValues(alpha: 0.65),
                Colors.black.withValues(alpha: 0.94),
              ],
              stops: const [0.0, 0.4, 0.7, 1.0],
            ),
          ),
        ),

        // Safe margin content
        Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            isSquare ? 20 : 72,
            24,
            isSquare ? 20 : 88,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Align(
                alignment: Alignment.topRight,
                child: ZenifyStoryBrand(
                  iconSize: 14,
                  isLight: false,
                ),
              ),

              const Spacer(),

              Text(
                'ARTIST',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.0,
                  color: palette.primary,
                ),
              ),

              const SizedBox(height: 6),

              Text(
                content.artistName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 32,
                  height: 1.08,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1.0,
                  color: Colors.white,
                ),
              ),

              if (content.audience != null && content.audience!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  content.audience!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.75),
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE C: ARTIST DISCOGRAPHY
// Artist portrait, artist name, and 3 representative album / track covers.
// ═══════════════════════════════════════════════════════════════════════════════
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
            ],
          ),
        ),
      ],
    );
  }
}



// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE A: PLAYLIST COLLAGE
// 2x2 collage of real album covers (adapting gracefully for 1, 2, 3, or 4 covers),
// playlist title, curator, track count, and transparent Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
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
    if (url.isEmpty) {
      return Container(color: const Color(0xFF2C2C2E));
    }
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      errorWidget: (_, _, _) => Container(color: const Color(0xFF2C2C2E)),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE B: PLAYLIST POSTER
// Large typography, featured playlist track titles, curator name, and Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
class PlaylistPosterTemplate extends StatelessWidget {
  const PlaylistPosterTemplate({
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
    final featuredTracks = content.tracks.take(4).toList();

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
            24,
            isSquare ? 20 : 68,
            24,
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

              Text(
                'PLAYLIST',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.0,
                  color: palette.primary,
                ),
              ),

              const SizedBox(height: 6),

              Text(
                content.playlistTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: 'SF Pro Display',
                  fontSize: 28,
                  height: 1.12,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.8,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 4),

              Text(
                content.owner,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.70),
                ),
              ),

              const SizedBox(height: 20),

              // Featured Track List
              if (featuredTracks.isNotEmpty)
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
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (int i = 0; i < featuredTracks.length; i++) ...[
                        Row(
                          children: [
                            Text(
                              '${i + 1}',
                              style: TextStyle(
                                fontFamily: 'SF Pro Display',
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: palette.primary,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                '${featuredTracks[i].title} • ${featuredTracks[i].artist}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (i < featuredTracks.length - 1)
                          const Divider(
                            height: 12,
                            thickness: 0.5,
                            color: Color(0x28FFFFFF),
                          ),
                      ],
                    ],
                  ),
                ),

              const SizedBox(height: 12),
            ],
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE C: EDITORIAL GRID PLAYLIST
// Asymmetrical artwork arrangement with featured tracks, title, and Zenify logo.
// ═══════════════════════════════════════════════════════════════════════════════
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
                  if (i < featuredTracks.length - 1) const SizedBox(height: 4),
                ],
              ],
            ],
          ),
        ),
      ],
    );
  }
}



/// Renders the active template dynamically based on content, customization, and template.
class StoryCardPreview extends StatelessWidget {
  const StoryCardPreview({
    super.key,
    required this.content,
    required this.template,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
    this.boundaryKey,
  });

  final StoryShareContent content;
  final StoryTemplate template;
  final ArtworkPalette palette;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final StoryAspectRatio aspectRatio;
  final GlobalKey? boundaryKey;

  @override
  Widget build(BuildContext context) {
    return StoryCardViewport(
      aspectRatio: aspectRatio,
      boundaryKey: boundaryKey,
      child: _buildTemplate(),
    );
  }

  Widget _buildTemplate() {
    // ── Song Templates ──
    if (content is SongStoryContent) {
      final s = content as SongStoryContent;
      switch (template.id) {
        case 'song_full_poster':
          return FullPosterSongTemplate(
            content: s,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'song_liquid_glass':
          return LiquidGlassSongTemplate(
            content: s,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'song_editorial':
          return EditorialSongTemplate(
            content: s,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'song_classic':
        default:
          return ClassicSongTemplate(
            content: s,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
      }
    }

    // ── Lyrics Templates ──
    if (content is LyricsStoryContent) {
      final l = content as LyricsStoryContent;
      switch (template.id) {
        case 'lyrics_typography':
          return TypographyPosterLyricsTemplate(
            content: l,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'lyrics_minimal':
          return MinimalLyricsTemplate(
            content: l,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'lyrics_classic':
        default:
          return ClassicLyricsTemplate(
            content: l,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
      }
    }

    // ── Artist Templates ──
    if (content is ArtistStoryContent) {
      final a = content as ArtistStoryContent;
      switch (template.id) {
        case 'artist_editorial':
          return ArtistEditorialTemplate(
            content: a,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'artist_discography':
          return ArtistDiscographyTemplate(
            content: a,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'artist_profile':
        default:
          return ArtistProfileTemplate(
            content: a,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
      }
    }

    // ── Album Templates ──
    if (content is AlbumStoryContent) {
      final al = content as AlbumStoryContent;
      switch (template.id) {
        case 'album_editorial':
          return AlbumEditorialTemplate(
            content: al,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'album_liquid':
          return LiquidAlbumTemplate(
            content: al,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'album_stacked':
        default:
          return StackedAlbumTemplate(
            content: al,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
      }
    }

    // ── Playlist Templates ──
    if (content is PlaylistStoryContent) {
      final p = content as PlaylistStoryContent;
      switch (template.id) {
        case 'playlist_poster':
          return PlaylistPosterTemplate(
            content: p,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'playlist_editorial':
          return EditorialGridPlaylistTemplate(
            content: p,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
        case 'playlist_collage':
        default:
          return CollagePlaylistTemplate(
            content: p,
            palette: palette,
            backgroundStyle: backgroundStyle,
            textPolarity: textPolarity,
            aspectRatio: aspectRatio,
          );
      }
    }

    return const SizedBox.shrink();
  }
}
