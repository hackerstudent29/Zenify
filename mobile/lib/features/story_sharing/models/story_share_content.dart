import 'package:flutter/foundation.dart';
import '../../../models/track.dart';

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

