import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../models/track.dart';

// ═════════════════════════════════════════════════════════════════════════════
// 1. STORY ASPECT RATIOS & CUSTOMIZATION ENUMS
// ═════════════════════════════════════════════════════════════════════════════

/// Aspect ratios supported for story & poster export.
enum StoryAspectRatio {
  story(
    label: '9:16',
    sublabel: 'Story',
    width: 360,
    height: 640,
    exportWidth: 1080,
    exportHeight: 1920,
    ratio: 9 / 16,
  ),
  square(
    label: '1:1',
    sublabel: 'Square',
    width: 360,
    height: 360,
    exportWidth: 1080,
    exportHeight: 1080,
    ratio: 1.0,
  );

  const StoryAspectRatio({
    required this.label,
    required this.sublabel,
    required this.width,
    required this.height,
    required this.exportWidth,
    required this.exportHeight,
    required this.ratio,
  });

  final String label;
  final String sublabel;
  final double width;
  final double height;
  final double exportWidth;
  final double exportHeight;
  final double ratio;
}

/// Dynamic background style selection.
enum StoryBackgroundStyle {
  artMesh(label: 'Art Mesh', icon: Icons.gradient_rounded),
  blurredCover(label: 'Blurred', icon: Icons.blur_on_rounded),
  solidDark(label: 'Charcoal', icon: Icons.dark_mode_rounded);

  const StoryBackgroundStyle({required this.label, required this.icon});
  final String label;
  final IconData icon;
}

/// Color polarity / text brightness mode.
enum StoryTextPolarity {
  light(label: 'Light Text', textColor: Colors.white, secondaryColor: Color(0xB3FFFFFF)),
  dark(label: 'Dark Text', textColor: Color(0xFF121214), secondaryColor: Color(0x99121214));

  const StoryTextPolarity({
    required this.label,
    required this.textColor,
    required this.secondaryColor,
  });

  final String label;
  final Color textColor;
  final Color secondaryColor;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. POLYMORPHIC STORY CONTENT MODELS
// ═════════════════════════════════════════════════════════════════════════════

/// Base abstract class for any content that can be shared to Stories.
@immutable
abstract class StoryShareContent {
  const StoryShareContent();

  String get title;
  String get subtitle;
  String get coverUrl;
  String get shareUrl;
  String get shareText;
  String get contentType;
}

/// Song Story Content using real Track model.
class SongStoryContent extends StoryShareContent {
  const SongStoryContent({
    required this.track,
    this.customShareUrl,
  });

  final Track track;
  final String? customShareUrl;

  @override
  String get title => track.title;

  @override
  String get subtitle => track.displayArtists;

  @override
  String get coverUrl => track.coverUrl;

  @override
  String get shareUrl =>
      customShareUrl ?? 'https://zenify.app/track/${Uri.encodeComponent(track.id.isNotEmpty ? track.id : track.title)}';

  @override
  String get shareText => 'Listening to "${track.title}" by ${track.displayArtists} on Zenify: $shareUrl';

  @override
  String get contentType => 'song';
}

/// Lyrics Story Content using real Track and selected lyrics lines.
class LyricsStoryContent extends StoryShareContent {
  const LyricsStoryContent({
    required this.track,
    required this.selectedLines,
    this.customShareUrl,
  });

  final Track track;
  final List<String> selectedLines;
  final String? customShareUrl;

  @override
  String get title => track.title;

  @override
  String get subtitle => track.displayArtists;

  @override
  String get coverUrl => track.coverUrl;

  @override
  String get shareUrl =>
      customShareUrl ?? 'https://zenify.app/track/${Uri.encodeComponent(track.id.isNotEmpty ? track.id : track.title)}';

  @override
  String get shareText =>
      '"${selectedLines.join(' / ')}" — "${track.title}" by ${track.displayArtists} on Zenify: $shareUrl';

  @override
  String get contentType => 'lyrics';
}

/// Artist Story Content using real artist details and real top tracks.
class ArtistStoryContent extends StoryShareContent {
  const ArtistStoryContent({
    required this.artistName,
    required this.coverUrl,
    this.audience,
    this.topTracks = const [],
    this.albumCovers = const [],
    this.customShareUrl,
  });

  final String artistName;
  @override
  final String coverUrl;
  final String? audience;
  final List<Track> topTracks;
  final List<String> albumCovers;
  final String? customShareUrl;

  @override
  String get title => artistName;

  @override
  String get subtitle => (audience != null && audience!.isNotEmpty) ? audience! : 'Artist';

  @override
  String get shareUrl =>
      customShareUrl ?? 'https://zenify.app/artist/${Uri.encodeComponent(artistName)}';

  @override
  String get shareText => '$artistName on Zenify: $shareUrl';

  @override
  String get contentType => 'artist';
}

/// Album Story Content using real album title, artist, tracks, and metadata.
class AlbumStoryContent extends StoryShareContent {
  const AlbumStoryContent({
    required this.albumTitle,
    required this.artistName,
    required this.coverUrl,
    this.year,
    this.trackCount,
    this.tracks = const [],
    this.customShareUrl,
  });

  final String albumTitle;
  final String artistName;
  @override
  final String coverUrl;
  final String? year;
  final int? trackCount;
  final List<Track> tracks;
  final String? customShareUrl;

  @override
  String get title => albumTitle;

  @override
  String get subtitle => artistName;

  @override
  String get shareUrl =>
      customShareUrl ?? 'https://zenify.app/album/${Uri.encodeComponent(albumTitle)}';

  @override
  String get shareText => '$albumTitle – $artistName on Zenify: $shareUrl';

  @override
  String get contentType => 'album';
}

/// Playlist Story Content using real playlist tracks and artwork.
class PlaylistStoryContent extends StoryShareContent {
  const PlaylistStoryContent({
    required this.playlistTitle,
    required this.covers,
    this.owner = 'Curated on Zenify',
    this.tracks = const [],
    this.customShareUrl,
  });

  final String playlistTitle;
  final List<String> covers;
  final String owner;
  final List<Track> tracks;
  final String? customShareUrl;

  @override
  String get title => playlistTitle;

  @override
  String get subtitle => owner;

  @override
  String get coverUrl => covers.isNotEmpty ? covers.first : '';

  @override
  String get shareUrl =>
      customShareUrl ?? 'https://zenify.app/playlist/${Uri.encodeComponent(playlistTitle)}';

  @override
  String get shareText => '$playlistTitle playlist on Zenify: $shareUrl';

  @override
  String get contentType => 'playlist';
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. TEMPLATES REGISTRY & DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════════

enum StoryCategory {
  song,
  lyrics,
  artist,
  album,
  playlist,
}

class StoryTemplate {
  const StoryTemplate({
    required this.id,
    required this.name,
    required this.category,
    required this.description,
    required this.icon,
  });

  final String id;
  final String name;
  final StoryCategory category;
  final String description;
  final IconData icon;

  // ── Song Templates ──
  static const songClassic = StoryTemplate(
    id: 'song_classic',
    name: 'Classic',
    category: StoryCategory.song,
    description: 'Floating Apple-style poster card with rounded artwork and Zenify logo',
    icon: CupertinoIcons.rectangle_fill_on_rectangle_angled_fill,
  );

  static const songFullPoster = StoryTemplate(
    id: 'song_full_poster',
    name: 'Full Poster',
    category: StoryCategory.song,
    description: 'Cinematic full-bleed cover with gradient overlay and large typography',
    icon: CupertinoIcons.photo_fill,
  );

  static const songLiquidGlass = StoryTemplate(
    id: 'song_liquid_glass',
    name: 'Liquid Glass',
    category: StoryCategory.song,
    description: 'Translucent frosted glass card with artwork, metadata, and waveform',
    icon: CupertinoIcons.sparkles,
  );

  static const songEditorial = StoryTemplate(
    id: 'song_editorial',
    name: 'Editorial',
    category: StoryCategory.song,
    description: 'Asymmetrical artwork with bold editorial typography and negative space',
    icon: CupertinoIcons.text_alignleft,
  );

  static const List<StoryTemplate> songTemplates = [
    songClassic,
    songFullPoster,
    songLiquidGlass,
    songEditorial,
  ];

  // ── Lyrics Templates ──
  static const lyricsClassic = StoryTemplate(
    id: 'lyrics_classic',
    name: 'Classic',
    category: StoryCategory.lyrics,
    description: 'Frosted floating card with stacked lyrics, cover, and Zenify logo',
    icon: CupertinoIcons.quote_bubble_fill,
  );

  static const lyricsTypographyPoster = StoryTemplate(
    id: 'lyrics_typography',
    name: 'Typography',
    category: StoryCategory.lyrics,
    description: 'Expressive editorial serif typography over vibrant warm gradient',
    icon: CupertinoIcons.textformat,
  );

  static const lyricsMinimal = StoryTemplate(
    id: 'lyrics_minimal',
    name: 'Minimal',
    category: StoryCategory.lyrics,
    description: 'Clean lines with generous negative space and subtle footer metadata',
    icon: CupertinoIcons.minus,
  );

  static const List<StoryTemplate> lyricsTemplates = [
    lyricsClassic,
    lyricsTypographyPoster,
    lyricsMinimal,
  ];

  // ── Artist Templates ──
  static const artistProfile = StoryTemplate(
    id: 'artist_profile',
    name: 'Profile',
    category: StoryCategory.artist,
    description: 'Circular artist portrait, listener stats, and top song highlights',
    icon: CupertinoIcons.person_crop_circle_fill,
  );

  static const artistEditorial = StoryTemplate(
    id: 'artist_editorial',
    name: 'Editorial',
    category: StoryCategory.artist,
    description: 'Cinematic large artist portrait poster with oversized typography',
    icon: CupertinoIcons.person_fill,
  );

  static const artistDiscography = StoryTemplate(
    id: 'artist_discography',
    name: 'Discography',
    category: StoryCategory.artist,
    description: 'Artist portrait with representative album showcase',
    icon: CupertinoIcons.square_stack_3d_up_fill,
  );

  static const List<StoryTemplate> artistTemplates = [
    artistProfile,
    artistEditorial,
    artistDiscography,
  ];

  // ── Album Templates ──
  static const albumStacked = StoryTemplate(
    id: 'album_stacked',
    name: 'Stacked',
    category: StoryCategory.album,
    description: 'Layered album art with 3D depth, release year, and track count',
    icon: CupertinoIcons.square_stack_fill,
  );

  static const albumEditorial = StoryTemplate(
    id: 'album_editorial',
    name: 'Editorial',
    category: StoryCategory.album,
    description: 'Full-bleed album title with clean typography and minimal borders',
    icon: CupertinoIcons.music_albums_fill,
  );

  static const albumLiquid = StoryTemplate(
    id: 'album_liquid',
    name: 'Liquid',
    category: StoryCategory.album,
    description: 'Floating glass album composition with dynamic artwork gradient',
    icon: CupertinoIcons.drop_fill,
  );

  static const List<StoryTemplate> albumTemplates = [
    albumStacked,
    albumEditorial,
    albumLiquid,
  ];

  // ── Playlist Templates ──
  static const playlistCollage = StoryTemplate(
    id: 'playlist_collage',
    name: 'Collage',
    category: StoryCategory.playlist,
    description: '2x2 album artwork collage with playlist title and total song count',
    icon: CupertinoIcons.square_grid_2x2_fill,
  );

  static const playlistPoster = StoryTemplate(
    id: 'playlist_poster',
    name: 'Poster',
    category: StoryCategory.playlist,
    description: 'Cinematic gradient background with playlist title and featured songs',
    icon: CupertinoIcons.music_note_list,
  );

  static const playlistEditorialGrid = StoryTemplate(
    id: 'playlist_editorial',
    name: 'Editorial Grid',
    category: StoryCategory.playlist,
    description: 'Asymmetrical cover layout with featured tracks and curated branding',
    icon: CupertinoIcons.square_split_2x2_fill,
  );

  static const List<StoryTemplate> playlistTemplates = [
    playlistCollage,
    playlistPoster,
    playlistEditorialGrid,
  ];

  static List<StoryTemplate> templatesForCategory(StoryCategory category) {
    switch (category) {
      case StoryCategory.song:
        return songTemplates;
      case StoryCategory.lyrics:
        return lyricsTemplates;
      case StoryCategory.artist:
        return artistTemplates;
      case StoryCategory.album:
        return albumTemplates;
      case StoryCategory.playlist:
        return playlistTemplates;
    }
  }

  static StoryTemplate byId(String id) {
    for (final t in [
      ...songTemplates,
      ...lyricsTemplates,
      ...artistTemplates,
      ...albumTemplates,
      ...playlistTemplates,
    ]) {
      if (t.id == id) return t;
    }
    return songClassic;
  }
}

