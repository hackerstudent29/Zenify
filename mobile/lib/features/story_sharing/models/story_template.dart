import 'package:flutter/cupertino.dart';

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

