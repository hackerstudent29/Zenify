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
  artMesh(label: 'Liquid', icon: Icons.water_drop_rounded),
  blurredCover(label: 'Artwork', icon: Icons.blur_on_rounded),
  solidDark(label: 'Midnight', icon: Icons.dark_mode_rounded),
  vivid(label: 'Vivid', icon: Icons.gradient_rounded);

  const StoryBackgroundStyle({required this.label, required this.icon});
  final String label;
  final IconData icon;
}

/// Color polarity / text brightness mode.
enum StoryTextPolarity {
  light(label: 'Dark Glass', textColor: Colors.white, secondaryColor: Color(0xB3FFFFFF)),
  dark(label: 'Light Glass', textColor: Color(0xFF121214), secondaryColor: Color(0x99121214));

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

  /// Short human label used in minimal captions (e.g. "Song", "Album").
  String get kindLabel;
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

  @override
  String get kindLabel => 'Song';
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

  @override
  String get kindLabel => 'Lyrics';
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

  @override
  String get kindLabel => 'Artist';
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

  @override
  String get kindLabel => 'Album';
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

  @override
  String get kindLabel => 'Playlist';
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. TEMPLATES REGISTRY & DEFINITIONS
//    8 unique designs per category. Visual implementations live in
//    story_templates.dart and are resolved through [StoryTemplateRegistry].
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
    name: 'Glass Card',
    category: StoryCategory.song,
    description: 'Floating squircle artwork on a liquid mesh with a glass caption',
    icon: CupertinoIcons.rectangle_fill_on_rectangle_angled_fill,
  );

  static const songFullPoster = StoryTemplate(
    id: 'song_full_poster',
    name: 'Poster',
    category: StoryCategory.song,
    description: 'Full-bleed cinematic cover with bottom glass title plate',
    icon: CupertinoIcons.photo_fill,
  );

  static const songLiquidGlass = StoryTemplate(
    id: 'song_liquid_glass',
    name: 'Liquid',
    category: StoryCategory.song,
    description: 'Thick refractive glass slab with artwork and live waveform',
    icon: CupertinoIcons.sparkles,
  );

  static const songEditorial = StoryTemplate(
    id: 'song_editorial',
    name: 'Editorial',
    category: StoryCategory.song,
    description: 'Oversized type, offset artwork and hairline details',
    icon: CupertinoIcons.text_alignleft,
  );

  static const songVinyl = StoryTemplate(
    id: 'song_vinyl',
    name: 'Vinyl',
    category: StoryCategory.song,
    description: 'Record sliding out of the artwork sleeve',
    icon: CupertinoIcons.smallcircle_fill_circle,
  );

  static const songPlayer = StoryTemplate(
    id: 'song_player',
    name: 'Now Playing',
    category: StoryCategory.song,
    description: 'Apple Music style player with glass controls',
    icon: CupertinoIcons.play_fill,
  );

  static const songOrb = StoryTemplate(
    id: 'song_orb',
    name: 'Orb',
    category: StoryCategory.song,
    description: 'Circular artwork inside glowing glass halo rings',
    icon: CupertinoIcons.circle_grid_3x3_fill,
  );

  static const songMarquee = StoryTemplate(
    id: 'song_marquee',
    name: 'Marquee',
    category: StoryCategory.song,
    description: 'Giant outlined title rows behind floating artwork',
    icon: CupertinoIcons.textformat,
  );

  static const List<StoryTemplate> songTemplates = [
    songClassic,
    songFullPoster,
    songLiquidGlass,
    songEditorial,
    songVinyl,
    songPlayer,
    songOrb,
    songMarquee,
  ];

  // ── Lyrics Templates ──
  static const lyricsClassic = StoryTemplate(
    id: 'lyrics_classic',
    name: 'Glass',
    category: StoryCategory.lyrics,
    description: 'Frosted glass card with stacked lyrics and artwork',
    icon: CupertinoIcons.quote_bubble_fill,
  );

  static const lyricsTypographyPoster = StoryTemplate(
    id: 'lyrics_typography',
    name: 'Serif',
    category: StoryCategory.lyrics,
    description: 'Expressive editorial serif over warm liquid gradient',
    icon: CupertinoIcons.textformat,
  );

  static const lyricsMinimal = StoryTemplate(
    id: 'lyrics_minimal',
    name: 'Minimal',
    category: StoryCategory.lyrics,
    description: 'Centered lines with generous negative space',
    icon: CupertinoIcons.minus,
  );

  static const lyricsBold = StoryTemplate(
    id: 'lyrics_bold',
    name: 'Bold',
    category: StoryCategory.lyrics,
    description: 'Giant bold lyrics on a vivid solid colour field',
    icon: CupertinoIcons.bold,
  );

  static const lyricsBubbles = StoryTemplate(
    id: 'lyrics_bubbles',
    name: 'Bubbles',
    category: StoryCategory.lyrics,
    description: 'Each line in its own floating glass bubble',
    icon: CupertinoIcons.chat_bubble_2_fill,
  );

  static const lyricsFocus = StoryTemplate(
    id: 'lyrics_focus',
    name: 'Focus',
    category: StoryCategory.lyrics,
    description: 'Lines fade by depth like synced lyrics',
    icon: CupertinoIcons.text_justify,
  );

  static const lyricsCover = StoryTemplate(
    id: 'lyrics_cover',
    name: 'Cover',
    category: StoryCategory.lyrics,
    description: 'Rounded artwork on top, lyrics on a glass sheet below',
    icon: CupertinoIcons.photo_on_rectangle,
  );

  static const lyricsNeon = StoryTemplate(
    id: 'lyrics_neon',
    name: 'Neon',
    category: StoryCategory.lyrics,
    description: 'Glowing accent lyrics on deep midnight',
    icon: CupertinoIcons.bolt_fill,
  );

  static const List<StoryTemplate> lyricsTemplates = [
    lyricsClassic,
    lyricsTypographyPoster,
    lyricsMinimal,
    lyricsBold,
    lyricsBubbles,
    lyricsFocus,
    lyricsCover,
    lyricsNeon,
  ];

  // ── Artist Templates ──
  static const artistProfile = StoryTemplate(
    id: 'artist_profile',
    name: 'Profile',
    category: StoryCategory.artist,
    description: 'Circular portrait in glass ring with top songs',
    icon: CupertinoIcons.person_crop_circle_fill,
  );

  static const artistEditorial = StoryTemplate(
    id: 'artist_editorial',
    name: 'Editorial',
    category: StoryCategory.artist,
    description: 'Full-bleed portrait with oversized name',
    icon: CupertinoIcons.person_fill,
  );

  static const artistDiscography = StoryTemplate(
    id: 'artist_discography',
    name: 'Discography',
    category: StoryCategory.artist,
    description: 'Portrait with a fan of album covers',
    icon: CupertinoIcons.square_stack_3d_up_fill,
  );

  static const artistSpotlight = StoryTemplate(
    id: 'artist_spotlight',
    name: 'Spotlight',
    category: StoryCategory.artist,
    description: 'Stage light beam over a floating portrait',
    icon: CupertinoIcons.lightbulb_fill,
  );

  static const artistRipple = StoryTemplate(
    id: 'artist_ripple',
    name: 'Ripple',
    category: StoryCategory.artist,
    description: 'Portrait radiating concentric glass rings',
    icon: CupertinoIcons.dot_radiowaves_left_right,
  );

  static const artistPass = StoryTemplate(
    id: 'artist_pass',
    name: 'Pass',
    category: StoryCategory.artist,
    description: 'Glass access pass with portrait and details',
    icon: CupertinoIcons.ticket_fill,
  );

  static const artistSplit = StoryTemplate(
    id: 'artist_split',
    name: 'Split',
    category: StoryCategory.artist,
    description: 'Portrait bleeding into colour with outlined name',
    icon: CupertinoIcons.rectangle_split_3x1_fill,
  );

  static const artistTopSongs = StoryTemplate(
    id: 'artist_top_songs',
    name: 'Top Songs',
    category: StoryCategory.artist,
    description: 'Numbered glass rows of top songs',
    icon: CupertinoIcons.list_number,
  );

  static const List<StoryTemplate> artistTemplates = [
    artistProfile,
    artistEditorial,
    artistDiscography,
    artistSpotlight,
    artistRipple,
    artistPass,
    artistSplit,
    artistTopSongs,
  ];

  // ── Album Templates ──
  static const albumStacked = StoryTemplate(
    id: 'album_stacked',
    name: 'Stacked',
    category: StoryCategory.album,
    description: 'Layered artwork with 3D depth',
    icon: CupertinoIcons.square_stack_fill,
  );

  static const albumEditorial = StoryTemplate(
    id: 'album_editorial',
    name: 'Editorial',
    category: StoryCategory.album,
    description: 'Square artwork with bold typographic frame',
    icon: CupertinoIcons.music_albums_fill,
  );

  static const albumLiquid = StoryTemplate(
    id: 'album_liquid',
    name: 'Liquid',
    category: StoryCategory.album,
    description: 'Floating glass composition over artwork light',
    icon: CupertinoIcons.drop_fill,
  );

  static const albumSleeve = StoryTemplate(
    id: 'album_sleeve',
    name: 'Sleeve',
    category: StoryCategory.album,
    description: 'Record peeking out of a printed sleeve',
    icon: CupertinoIcons.rectangle_stack_fill,
  );

  static const albumDisc = StoryTemplate(
    id: 'album_disc',
    name: 'Disc',
    category: StoryCategory.album,
    description: 'Reflective disc with iridescent sheen',
    icon: CupertinoIcons.circle_lefthalf_fill,
  );

  static const albumTilt = StoryTemplate(
    id: 'album_tilt',
    name: 'Tilt',
    category: StoryCategory.album,
    description: 'Artwork in perspective with mirror reflection',
    icon: CupertinoIcons.cube_box_fill,
  );

  static const albumTracklist = StoryTemplate(
    id: 'album_tracklist',
    name: 'Tracklist',
    category: StoryCategory.album,
    description: 'Artwork with a glass tracklist',
    icon: CupertinoIcons.list_bullet,
  );

  static const albumMinimal = StoryTemplate(
    id: 'album_minimal',
    name: 'Minimal',
    category: StoryCategory.album,
    description: 'Tiny artwork centered in calm negative space',
    icon: CupertinoIcons.circle,
  );

  static const List<StoryTemplate> albumTemplates = [
    albumStacked,
    albumEditorial,
    albumLiquid,
    albumSleeve,
    albumDisc,
    albumTilt,
    albumTracklist,
    albumMinimal,
  ];

  // ── Playlist Templates ──
  static const playlistCollage = StoryTemplate(
    id: 'playlist_collage',
    name: 'Collage',
    category: StoryCategory.playlist,
    description: '2x2 artwork collage on glass',
    icon: CupertinoIcons.square_grid_2x2_fill,
  );

  static const playlistPoster = StoryTemplate(
    id: 'playlist_poster',
    name: 'Poster',
    category: StoryCategory.playlist,
    description: 'Cinematic gradient poster with featured songs',
    icon: CupertinoIcons.music_note_list,
  );

  static const playlistEditorialGrid = StoryTemplate(
    id: 'playlist_editorial',
    name: 'Editorial',
    category: StoryCategory.playlist,
    description: 'Asymmetric cover layout with curated typography',
    icon: CupertinoIcons.square_split_2x2_fill,
  );

  static const playlistMosaic = StoryTemplate(
    id: 'playlist_mosaic',
    name: 'Mosaic',
    category: StoryCategory.playlist,
    description: 'Edge-to-edge 3x3 mosaic with glass title',
    icon: CupertinoIcons.rectangle_grid_3x2_fill,
  );

  static const playlistFan = StoryTemplate(
    id: 'playlist_fan',
    name: 'Fan',
    category: StoryCategory.playlist,
    description: 'Covers fanned like a hand of cards',
    icon: CupertinoIcons.rectangle_stack_fill,
  );

  static const playlistGlassList = StoryTemplate(
    id: 'playlist_glass_list',
    name: 'Glass List',
    category: StoryCategory.playlist,
    description: 'Glass track rows with tiny artwork',
    icon: CupertinoIcons.list_bullet_indent,
  );

  static const playlistOrbit = StoryTemplate(
    id: 'playlist_orbit',
    name: 'Orbit',
    category: StoryCategory.playlist,
    description: 'Overlapping circular covers in orbit',
    icon: CupertinoIcons.circle_grid_hex_fill,
  );

  static const playlistFilm = StoryTemplate(
    id: 'playlist_film',
    name: 'Film',
    category: StoryCategory.playlist,
    description: 'Offset horizontal cover strips',
    icon: CupertinoIcons.film,
  );

  static const List<StoryTemplate> playlistTemplates = [
    playlistCollage,
    playlistPoster,
    playlistEditorialGrid,
    playlistMosaic,
    playlistFan,
    playlistGlassList,
    playlistOrbit,
    playlistFilm,
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
