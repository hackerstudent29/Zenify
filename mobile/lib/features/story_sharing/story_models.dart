import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../models/track.dart';

// ═════════════════════════════════════════════════════════════════════════════
// 1. PER-DESIGN RATIOS, SKINS, BACKGROUNDS, MOTION
//    There is no global ratio toggle any more: every design declares the ratio
//    that suits it (story, tall, post, square, card, wide, widget-strip).
// ═════════════════════════════════════════════════════════════════════════════

enum StoryRatio {
  story(label: '9:16', sublabel: 'Story', width: 360, height: 640, exportWidth: 1080),
  tall(label: '3:4', sublabel: 'Tall', width: 360, height: 480, exportWidth: 1080),
  portrait(label: '4:5', sublabel: 'Post', width: 360, height: 450, exportWidth: 1080),
  square(label: '1:1', sublabel: 'Square', width: 360, height: 360, exportWidth: 1080),
  landscape(label: '4:3', sublabel: 'Card', width: 360, height: 270, exportWidth: 1440),
  wide(label: '16:9', sublabel: 'Wide', width: 384, height: 216, exportWidth: 1920),
  strip(label: '2:1', sublabel: 'Widget', width: 360, height: 180, exportWidth: 1440);

  const StoryRatio({
    required this.label,
    required this.sublabel,
    required this.width,
    required this.height,
    required this.exportWidth,
  });

  final String label;
  final String sublabel;
  final double width;
  final double height;
  final double exportWidth;

  double get ratio => width / height;
  double get exportHeight => exportWidth * height / width;
  bool get isStory => this == StoryRatio.story;
  bool get isTall => height / width > 1.25;
  bool get isWide => width / height > 1.3;
}

/// Visual families. Each skin restyles surfaces, type, artwork frames and logo
/// placement context, so one layout can look retro, clay, neon, glass…
enum StorySkin {
  glass(label: 'Glass', icon: CupertinoIcons.drop_fill),
  minimal(label: 'Minimal', icon: CupertinoIcons.minus_circle),
  retro(label: 'Retro', icon: CupertinoIcons.tv_fill, forceLight: true),
  modern(label: 'Modern', icon: CupertinoIcons.square_grid_2x2_fill),
  clay(label: 'Clay', icon: CupertinoIcons.cloud_fill, forceLight: true),
  neon(label: 'Neon', icon: CupertinoIcons.bolt_fill, forceLight: false),
  editorial(label: 'Editorial', icon: CupertinoIcons.textformat),
  polaroid(label: 'Polaroid', icon: CupertinoIcons.camera_fill, forceLight: true),
  aurora(label: 'Aurora', icon: CupertinoIcons.sparkles),
  brutal(label: 'Pop', icon: CupertinoIcons.rectangle_fill, forceLight: true);

  const StorySkin({required this.label, required this.icon, this.forceLight});
  final String label;
  final IconData icon;

  /// null = the user may toggle light / dark text. true/false = locked.
  final bool? forceLight;
  bool get locksPolarity => forceLight != null;
}

/// Backdrops. [auto] uses the design's own default.
enum StoryBackgroundStyle {
  auto(label: 'Auto', icon: Icons.auto_awesome_rounded),
  liquid(label: 'Liquid', icon: Icons.water_drop_rounded),
  artwork(label: 'Blur', icon: Icons.blur_on_rounded),
  midnight(label: 'Midnight', icon: Icons.dark_mode_rounded),
  vivid(label: 'Vivid', icon: Icons.gradient_rounded),
  aurora(label: 'Aurora', icon: Icons.blur_circular_rounded),
  sunset(label: 'Sunset', icon: Icons.wb_twilight_rounded),
  paper(label: 'Paper', icon: Icons.description_rounded),
  clay(label: 'Clay', icon: Icons.bubble_chart_rounded),
  dots(label: 'Dots', icon: Icons.grid_on_rounded);

  const StoryBackgroundStyle({required this.label, required this.icon});
  final String label;
  final IconData icon;
}

/// How the hero element of a card moves. All motion is transform-only, so the
/// card stays anchored in the screen — it floats, hops or tilts in place.
enum MotionKind { none, float, bounce, sway, pulse, tilt }

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
// 2. POLYMORPHIC STORY CONTENT MODELS (unchanged API)
// ═════════════════════════════════════════════════════════════════════════════

@immutable
abstract class StoryShareContent {
  const StoryShareContent();

  String get title;
  String get subtitle;
  String get coverUrl;
  String get shareUrl;
  String get shareText;
  String get contentType;
  String get kindLabel;
}

class SongStoryContent extends StoryShareContent {
  const SongStoryContent({required this.track, this.customShareUrl});

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
  String get shareUrl => customShareUrl ?? 'https://zenify.app/artist/${Uri.encodeComponent(artistName)}';
  @override
  String get shareText => '$artistName on Zenify: $shareUrl';
  @override
  String get contentType => 'artist';
  @override
  String get kindLabel => 'Artist';
}

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
  String get shareUrl => customShareUrl ?? 'https://zenify.app/album/${Uri.encodeComponent(albumTitle)}';
  @override
  String get shareText => '$albumTitle – $artistName on Zenify: $shareUrl';
  @override
  String get contentType => 'album';
  @override
  String get kindLabel => 'Album';
}

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
  String get shareUrl => customShareUrl ?? 'https://zenify.app/playlist/${Uri.encodeComponent(playlistTitle)}';
  @override
  String get shareText => '$playlistTitle playlist on Zenify: $shareUrl';
  @override
  String get contentType => 'playlist';
  @override
  String get kindLabel => 'Playlist';
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. TEMPLATE REGISTRY — 110 designs
//    Song 30 · Lyrics 30 · Album 20 · Artist 15 · Playlist 15
//    A template = layout × skin × its own ratio × default backdrop × motion.
// ═════════════════════════════════════════════════════════════════════════════

enum StoryCategory { song, lyrics, artist, album, playlist }

enum SongLayout { tile, nowPlaying, player, poster, orb, vinyl, cassette, polaroid, type, marquee, stack, wave, pill, lockscreen, ticket }

enum LyricsLayout { glassCard, center, bold, bubbles, focus, coverTop, serif, note, karaoke, split, outline, receipt }

enum AlbumLayout { sleeve, stacked, disc, tilt, tracklist, minimal, editorial, cd, crate, poster }

enum ArtistLayout { profile, editorial, fan, spotlight, ripple, pass, split, topSongs, poster }

enum PlaylistLayout { collage, poster, editorial, mosaic, fan, list, orbit, film, mixtape }

class StoryTemplate {
  const StoryTemplate(
    this.id,
    this.name,
    this.category,
    this.layout,
    this.skin,
    this.ratio,
    this.bg,
    this.motion,
  );

  final String id;
  final String name;
  final StoryCategory category;
  final Enum layout;
  final StorySkin skin;
  final StoryRatio ratio;
  final StoryBackgroundStyle bg;
  final MotionKind motion;

  IconData get icon => skin.icon;
  String get caption => '${skin.label} · ${ratio.label}';

  static const List<StoryTemplate> songTemplates = [
    StoryTemplate('song_tile_glass_story', 'Glass Tile', StoryCategory.song, SongLayout.tile, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.bounce),
    StoryTemplate('song_tile_minimal_square', 'Minimal Tile', StoryCategory.song, SongLayout.tile, StorySkin.minimal, StoryRatio.square, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('song_tile_clay_portrait', 'Clay Tile', StoryCategory.song, SongLayout.tile, StorySkin.clay, StoryRatio.portrait, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('song_tile_brutal_square', 'Pop Tile', StoryCategory.song, SongLayout.tile, StorySkin.brutal, StoryRatio.square, StoryBackgroundStyle.vivid, MotionKind.bounce),
    StoryTemplate('song_nowplaying_glass_story', 'Now Playing', StoryCategory.song, SongLayout.nowPlaying, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('song_nowplaying_glass_strip', 'Widget', StoryCategory.song, SongLayout.nowPlaying, StorySkin.glass, StoryRatio.strip, StoryBackgroundStyle.artwork, MotionKind.bounce),
    StoryTemplate('song_nowplaying_neon_story', 'Neon Player', StoryCategory.song, SongLayout.nowPlaying, StorySkin.neon, StoryRatio.story, StoryBackgroundStyle.dots, MotionKind.pulse),
    StoryTemplate('song_nowplaying_modern_strip', 'Modern Widget', StoryCategory.song, SongLayout.nowPlaying, StorySkin.modern, StoryRatio.strip, StoryBackgroundStyle.vivid, MotionKind.float),
    StoryTemplate('song_player_glass_story', 'Full Player', StoryCategory.song, SongLayout.player, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('song_player_editorial_portrait', 'Editorial Player', StoryCategory.song, SongLayout.player, StorySkin.editorial, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('song_poster_glass_story', 'Cinema Poster', StoryCategory.song, SongLayout.poster, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('song_poster_modern_portrait', 'Bold Poster', StoryCategory.song, SongLayout.poster, StorySkin.modern, StoryRatio.portrait, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('song_orb_aurora_story', 'Aurora Orb', StoryCategory.song, SongLayout.orb, StorySkin.aurora, StoryRatio.story, StoryBackgroundStyle.aurora, MotionKind.pulse),
    StoryTemplate('song_orb_neon_square', 'Neon Orb', StoryCategory.song, SongLayout.orb, StorySkin.neon, StoryRatio.square, StoryBackgroundStyle.dots, MotionKind.pulse),
    StoryTemplate('song_vinyl_retro_story', 'Retro Vinyl', StoryCategory.song, SongLayout.vinyl, StorySkin.retro, StoryRatio.story, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('song_vinyl_glass_portrait', 'Liquid Vinyl', StoryCategory.song, SongLayout.vinyl, StorySkin.glass, StoryRatio.portrait, StoryBackgroundStyle.liquid, MotionKind.float),
    StoryTemplate('song_cassette_retro_landscape', 'Mixtape', StoryCategory.song, SongLayout.cassette, StorySkin.retro, StoryRatio.landscape, StoryBackgroundStyle.paper, MotionKind.bounce),
    StoryTemplate('song_cassette_clay_square', 'Clay Tape', StoryCategory.song, SongLayout.cassette, StorySkin.clay, StoryRatio.square, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('song_polaroid_polaroid_portrait', 'Polaroid', StoryCategory.song, SongLayout.polaroid, StorySkin.polaroid, StoryRatio.portrait, StoryBackgroundStyle.sunset, MotionKind.sway),
    StoryTemplate('song_polaroid_polaroid_tall', 'Snapshot', StoryCategory.song, SongLayout.polaroid, StorySkin.polaroid, StoryRatio.tall, StoryBackgroundStyle.artwork, MotionKind.bounce),
    StoryTemplate('song_type_editorial_portrait', 'Editorial Type', StoryCategory.song, SongLayout.type, StorySkin.editorial, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('song_type_brutal_story', 'Loud Type', StoryCategory.song, SongLayout.type, StorySkin.brutal, StoryRatio.story, StoryBackgroundStyle.vivid, MotionKind.bounce),
    StoryTemplate('song_marquee_modern_story', 'Marquee', StoryCategory.song, SongLayout.marquee, StorySkin.modern, StoryRatio.story, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('song_marquee_neon_tall', 'Neon Marquee', StoryCategory.song, SongLayout.marquee, StorySkin.neon, StoryRatio.tall, StoryBackgroundStyle.dots, MotionKind.pulse),
    StoryTemplate('song_stack_clay_story', 'Clay Stack', StoryCategory.song, SongLayout.stack, StorySkin.clay, StoryRatio.story, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('song_stack_glass_portrait', 'Glass Stack', StoryCategory.song, SongLayout.stack, StorySkin.glass, StoryRatio.portrait, StoryBackgroundStyle.liquid, MotionKind.float),
    StoryTemplate('song_wave_aurora_story', 'Aurora Wave', StoryCategory.song, SongLayout.wave, StorySkin.aurora, StoryRatio.story, StoryBackgroundStyle.aurora, MotionKind.float),
    StoryTemplate('song_ticket_retro_tall', 'Retro Ticket', StoryCategory.song, SongLayout.ticket, StorySkin.retro, StoryRatio.tall, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('song_pill_glass_wide', 'Island', StoryCategory.song, SongLayout.pill, StorySkin.glass, StoryRatio.wide, StoryBackgroundStyle.artwork, MotionKind.bounce),
    StoryTemplate('song_lockscreen_glass_story', 'Lock Screen', StoryCategory.song, SongLayout.lockscreen, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
  ];

  static const List<StoryTemplate> lyricsTemplates = [
    StoryTemplate('lyr_glasscard_glass_story', 'Apple Glass', StoryCategory.lyrics, LyricsLayout.glassCard, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.bounce),
    StoryTemplate('lyr_glasscard_glass_square', 'Glass Square', StoryCategory.lyrics, LyricsLayout.glassCard, StorySkin.glass, StoryRatio.square, StoryBackgroundStyle.liquid, MotionKind.float),
    StoryTemplate('lyr_glasscard_glass_landscape', 'Glass Card', StoryCategory.lyrics, LyricsLayout.glassCard, StorySkin.glass, StoryRatio.landscape, StoryBackgroundStyle.artwork, MotionKind.bounce),
    StoryTemplate('lyr_center_minimal_story', 'Quiet', StoryCategory.lyrics, LyricsLayout.center, StorySkin.minimal, StoryRatio.story, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('lyr_center_minimal_portrait', 'Paper Quiet', StoryCategory.lyrics, LyricsLayout.center, StorySkin.minimal, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('lyr_bold_modern_story', 'Loud', StoryCategory.lyrics, LyricsLayout.bold, StorySkin.modern, StoryRatio.story, StoryBackgroundStyle.vivid, MotionKind.float),
    StoryTemplate('lyr_bold_brutal_portrait', 'Pop Bold', StoryCategory.lyrics, LyricsLayout.bold, StorySkin.brutal, StoryRatio.portrait, StoryBackgroundStyle.vivid, MotionKind.bounce),
    StoryTemplate('lyr_bubbles_glass_story', 'Bubbles', StoryCategory.lyrics, LyricsLayout.bubbles, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.liquid, MotionKind.float),
    StoryTemplate('lyr_bubbles_clay_story', 'Clay Bubbles', StoryCategory.lyrics, LyricsLayout.bubbles, StorySkin.clay, StoryRatio.story, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('lyr_focus_glass_story', 'Synced', StoryCategory.lyrics, LyricsLayout.focus, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('lyr_focus_aurora_story', 'Aurora Sync', StoryCategory.lyrics, LyricsLayout.focus, StorySkin.aurora, StoryRatio.story, StoryBackgroundStyle.aurora, MotionKind.float),
    StoryTemplate('lyr_covertop_glass_story', 'Cover Sheet', StoryCategory.lyrics, LyricsLayout.coverTop, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('lyr_covertop_modern_tall', 'Modern Sheet', StoryCategory.lyrics, LyricsLayout.coverTop, StorySkin.modern, StoryRatio.tall, StoryBackgroundStyle.midnight, MotionKind.bounce),
    StoryTemplate('lyr_serif_editorial_story', 'Serif', StoryCategory.lyrics, LyricsLayout.serif, StorySkin.editorial, StoryRatio.story, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('lyr_serif_retro_portrait', 'Retro Print', StoryCategory.lyrics, LyricsLayout.serif, StorySkin.retro, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('lyr_note_polaroid_portrait', 'Polaroid Note', StoryCategory.lyrics, LyricsLayout.note, StorySkin.polaroid, StoryRatio.portrait, StoryBackgroundStyle.sunset, MotionKind.sway),
    StoryTemplate('lyr_note_retro_square', 'Sticky Note', StoryCategory.lyrics, LyricsLayout.note, StorySkin.retro, StoryRatio.square, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('lyr_karaoke_glass_story', 'Karaoke', StoryCategory.lyrics, LyricsLayout.karaoke, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.pulse),
    StoryTemplate('lyr_karaoke_neon_story', 'Neon Karaoke', StoryCategory.lyrics, LyricsLayout.karaoke, StorySkin.neon, StoryRatio.story, StoryBackgroundStyle.midnight, MotionKind.pulse),
    StoryTemplate('lyr_split_modern_landscape', 'Split', StoryCategory.lyrics, LyricsLayout.split, StorySkin.modern, StoryRatio.landscape, StoryBackgroundStyle.vivid, MotionKind.float),
    StoryTemplate('lyr_split_editorial_wide', 'Editorial Split', StoryCategory.lyrics, LyricsLayout.split, StorySkin.editorial, StoryRatio.wide, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('lyr_outline_neon_story', 'Neon Outline', StoryCategory.lyrics, LyricsLayout.outline, StorySkin.neon, StoryRatio.story, StoryBackgroundStyle.dots, MotionKind.pulse),
    StoryTemplate('lyr_outline_brutal_tall', 'Pop Outline', StoryCategory.lyrics, LyricsLayout.outline, StorySkin.brutal, StoryRatio.tall, StoryBackgroundStyle.vivid, MotionKind.bounce),
    StoryTemplate('lyr_receipt_retro_tall', 'Receipt', StoryCategory.lyrics, LyricsLayout.receipt, StorySkin.retro, StoryRatio.tall, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('lyr_receipt_minimal_tall', 'Slip', StoryCategory.lyrics, LyricsLayout.receipt, StorySkin.minimal, StoryRatio.tall, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('lyr_glasscard_aurora_story', 'Aurora Glass', StoryCategory.lyrics, LyricsLayout.glassCard, StorySkin.aurora, StoryRatio.story, StoryBackgroundStyle.aurora, MotionKind.float),
    StoryTemplate('lyr_center_neon_square', 'Neon Quiet', StoryCategory.lyrics, LyricsLayout.center, StorySkin.neon, StoryRatio.square, StoryBackgroundStyle.dots, MotionKind.pulse),
    StoryTemplate('lyr_bubbles_aurora_portrait', 'Aurora Bubbles', StoryCategory.lyrics, LyricsLayout.bubbles, StorySkin.aurora, StoryRatio.portrait, StoryBackgroundStyle.aurora, MotionKind.float),
    StoryTemplate('lyr_covertop_clay_portrait', 'Clay Sheet', StoryCategory.lyrics, LyricsLayout.coverTop, StorySkin.clay, StoryRatio.portrait, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('lyr_bold_editorial_square', 'Editorial Bold', StoryCategory.lyrics, LyricsLayout.bold, StorySkin.editorial, StoryRatio.square, StoryBackgroundStyle.paper, MotionKind.float),
  ];

  static const List<StoryTemplate> albumTemplates = [
    StoryTemplate('alb_sleeve_retro_portrait', 'Retro Sleeve', StoryCategory.album, AlbumLayout.sleeve, StorySkin.retro, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('alb_sleeve_glass_story', 'Glass Sleeve', StoryCategory.album, AlbumLayout.sleeve, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('alb_stacked_glass_story', 'Glass Stack', StoryCategory.album, AlbumLayout.stacked, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.liquid, MotionKind.float),
    StoryTemplate('alb_stacked_clay_portrait', 'Clay Stack', StoryCategory.album, AlbumLayout.stacked, StorySkin.clay, StoryRatio.portrait, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('alb_disc_aurora_story', 'Aurora Disc', StoryCategory.album, AlbumLayout.disc, StorySkin.aurora, StoryRatio.story, StoryBackgroundStyle.aurora, MotionKind.pulse),
    StoryTemplate('alb_disc_neon_square', 'Neon Disc', StoryCategory.album, AlbumLayout.disc, StorySkin.neon, StoryRatio.square, StoryBackgroundStyle.dots, MotionKind.pulse),
    StoryTemplate('alb_tilt_glass_story', 'Glass Tilt', StoryCategory.album, AlbumLayout.tilt, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.tilt),
    StoryTemplate('alb_tilt_modern_portrait', 'Modern Tilt', StoryCategory.album, AlbumLayout.tilt, StorySkin.modern, StoryRatio.portrait, StoryBackgroundStyle.midnight, MotionKind.tilt),
    StoryTemplate('alb_tracklist_glass_story', 'Tracklist', StoryCategory.album, AlbumLayout.tracklist, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('alb_tracklist_editorial_tall', 'Liner Notes', StoryCategory.album, AlbumLayout.tracklist, StorySkin.editorial, StoryRatio.tall, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('alb_minimal_minimal_square', 'Minimal', StoryCategory.album, AlbumLayout.minimal, StorySkin.minimal, StoryRatio.square, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('alb_minimal_clay_square', 'Soft Minimal', StoryCategory.album, AlbumLayout.minimal, StorySkin.clay, StoryRatio.square, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('alb_editorial_editorial_portrait', 'Editorial', StoryCategory.album, AlbumLayout.editorial, StorySkin.editorial, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('alb_editorial_brutal_tall', 'Loud Editorial', StoryCategory.album, AlbumLayout.editorial, StorySkin.brutal, StoryRatio.tall, StoryBackgroundStyle.vivid, MotionKind.bounce),
    StoryTemplate('alb_cd_retro_square', 'Jewel Case', StoryCategory.album, AlbumLayout.cd, StorySkin.retro, StoryRatio.square, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('alb_cd_aurora_story', 'Aurora Case', StoryCategory.album, AlbumLayout.cd, StorySkin.aurora, StoryRatio.story, StoryBackgroundStyle.aurora, MotionKind.float),
    StoryTemplate('alb_crate_retro_landscape', 'Crate Dig', StoryCategory.album, AlbumLayout.crate, StorySkin.retro, StoryRatio.landscape, StoryBackgroundStyle.paper, MotionKind.bounce),
    StoryTemplate('alb_crate_modern_wide', 'Crate Modern', StoryCategory.album, AlbumLayout.crate, StorySkin.modern, StoryRatio.wide, StoryBackgroundStyle.midnight, MotionKind.bounce),
    StoryTemplate('alb_poster_glass_story', 'Album Poster', StoryCategory.album, AlbumLayout.poster, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('alb_poster_modern_portrait', 'Bold Album', StoryCategory.album, AlbumLayout.poster, StorySkin.modern, StoryRatio.portrait, StoryBackgroundStyle.vivid, MotionKind.float),
  ];

  static const List<StoryTemplate> artistTemplates = [
    StoryTemplate('art_profile_glass_story', 'Glass Profile', StoryCategory.artist, ArtistLayout.profile, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.liquid, MotionKind.float),
    StoryTemplate('art_profile_clay_portrait', 'Clay Profile', StoryCategory.artist, ArtistLayout.profile, StorySkin.clay, StoryRatio.portrait, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('art_editorial_editorial_story', 'Editorial', StoryCategory.artist, ArtistLayout.editorial, StorySkin.editorial, StoryRatio.story, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('art_editorial_modern_tall', 'Modern Editorial', StoryCategory.artist, ArtistLayout.editorial, StorySkin.modern, StoryRatio.tall, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('art_fan_glass_story', 'Discography', StoryCategory.artist, ArtistLayout.fan, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('art_fan_retro_portrait', 'Retro Fan', StoryCategory.artist, ArtistLayout.fan, StorySkin.retro, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('art_spotlight_neon_story', 'Neon Spot', StoryCategory.artist, ArtistLayout.spotlight, StorySkin.neon, StoryRatio.story, StoryBackgroundStyle.dots, MotionKind.pulse),
    StoryTemplate('art_spotlight_glass_story', 'Glass Spot', StoryCategory.artist, ArtistLayout.spotlight, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('art_ripple_aurora_story', 'Aurora Ripple', StoryCategory.artist, ArtistLayout.ripple, StorySkin.aurora, StoryRatio.story, StoryBackgroundStyle.aurora, MotionKind.pulse),
    StoryTemplate('art_pass_glass_story', 'Access Pass', StoryCategory.artist, ArtistLayout.pass, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.liquid, MotionKind.sway),
    StoryTemplate('art_pass_brutal_tall', 'Pop Pass', StoryCategory.artist, ArtistLayout.pass, StorySkin.brutal, StoryRatio.tall, StoryBackgroundStyle.vivid, MotionKind.bounce),
    StoryTemplate('art_split_modern_story', 'Split', StoryCategory.artist, ArtistLayout.split, StorySkin.modern, StoryRatio.story, StoryBackgroundStyle.vivid, MotionKind.float),
    StoryTemplate('art_topsongs_glass_story', 'Top Songs', StoryCategory.artist, ArtistLayout.topSongs, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('art_topsongs_minimal_portrait', 'Quiet Top', StoryCategory.artist, ArtistLayout.topSongs, StorySkin.minimal, StoryRatio.portrait, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('art_poster_glass_square', 'Artist Poster', StoryCategory.artist, ArtistLayout.poster, StorySkin.glass, StoryRatio.square, StoryBackgroundStyle.artwork, MotionKind.float),
  ];

  static const List<StoryTemplate> playlistTemplates = [
    StoryTemplate('pl_collage_glass_story', 'Glass Collage', StoryCategory.playlist, PlaylistLayout.collage, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.liquid, MotionKind.float),
    StoryTemplate('pl_collage_clay_portrait', 'Clay Collage', StoryCategory.playlist, PlaylistLayout.collage, StorySkin.clay, StoryRatio.portrait, StoryBackgroundStyle.clay, MotionKind.bounce),
    StoryTemplate('pl_poster_modern_story', 'Bold Poster', StoryCategory.playlist, PlaylistLayout.poster, StorySkin.modern, StoryRatio.story, StoryBackgroundStyle.vivid, MotionKind.float),
    StoryTemplate('pl_poster_glass_tall', 'Glass Poster', StoryCategory.playlist, PlaylistLayout.poster, StorySkin.glass, StoryRatio.tall, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('pl_editorial_editorial_portrait', 'Editorial', StoryCategory.playlist, PlaylistLayout.editorial, StorySkin.editorial, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.float),
    StoryTemplate('pl_mosaic_minimal_square', 'Quiet Mosaic', StoryCategory.playlist, PlaylistLayout.mosaic, StorySkin.minimal, StoryRatio.square, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('pl_mosaic_glass_story', 'Glass Mosaic', StoryCategory.playlist, PlaylistLayout.mosaic, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.pulse),
    StoryTemplate('pl_fan_retro_portrait', 'Retro Fan', StoryCategory.playlist, PlaylistLayout.fan, StorySkin.retro, StoryRatio.portrait, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('pl_fan_aurora_story', 'Aurora Fan', StoryCategory.playlist, PlaylistLayout.fan, StorySkin.aurora, StoryRatio.story, StoryBackgroundStyle.aurora, MotionKind.float),
    StoryTemplate('pl_list_glass_story', 'Glass List', StoryCategory.playlist, PlaylistLayout.list, StorySkin.glass, StoryRatio.story, StoryBackgroundStyle.artwork, MotionKind.float),
    StoryTemplate('pl_list_brutal_tall', 'Pop List', StoryCategory.playlist, PlaylistLayout.list, StorySkin.brutal, StoryRatio.tall, StoryBackgroundStyle.vivid, MotionKind.bounce),
    StoryTemplate('pl_orbit_neon_square', 'Neon Orbit', StoryCategory.playlist, PlaylistLayout.orbit, StorySkin.neon, StoryRatio.square, StoryBackgroundStyle.dots, MotionKind.pulse),
    StoryTemplate('pl_film_retro_wide', 'Retro Film', StoryCategory.playlist, PlaylistLayout.film, StorySkin.retro, StoryRatio.wide, StoryBackgroundStyle.paper, MotionKind.sway),
    StoryTemplate('pl_film_modern_story', 'Modern Film', StoryCategory.playlist, PlaylistLayout.film, StorySkin.modern, StoryRatio.story, StoryBackgroundStyle.midnight, MotionKind.float),
    StoryTemplate('pl_mixtape_retro_landscape', 'Mixtape', StoryCategory.playlist, PlaylistLayout.mixtape, StorySkin.retro, StoryRatio.landscape, StoryBackgroundStyle.paper, MotionKind.bounce),
  ];

  static const List<StoryTemplate> all = [
    ...songTemplates,
    ...lyricsTemplates,
    ...albumTemplates,
    ...artistTemplates,
    ...playlistTemplates,
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
    for (final t in all) {
      if (t.id == id) return t;
    }
    return songTemplates.first;
  }
}
