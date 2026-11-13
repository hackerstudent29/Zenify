import 'package:flutter/material.dart';
import '../models/story_customization.dart';
import '../models/story_share_content.dart';
import '../models/story_template.dart';
import '../services/artwork_palette_service.dart';
import '../templates/album/album_editorial_template.dart';
import '../templates/album/liquid_album_template.dart';
import '../templates/album/stacked_album_template.dart';
import '../templates/artist/artist_discography_template.dart';
import '../templates/artist/artist_editorial_template.dart';
import '../templates/artist/artist_profile_template.dart';
import '../templates/lyrics/classic_lyrics_template.dart';
import '../templates/lyrics/minimal_lyrics_template.dart';
import '../templates/lyrics/typography_poster_lyrics_template.dart';
import '../templates/playlist/collage_playlist_template.dart';
import '../templates/playlist/editorial_grid_playlist_template.dart';
import '../templates/playlist/playlist_poster_template.dart';
import '../templates/song/classic_song_template.dart';
import '../templates/song/editorial_song_template.dart';
import '../templates/song/full_poster_song_template.dart';
import '../templates/song/liquid_glass_song_template.dart';
import 'story_card_viewport.dart';

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

