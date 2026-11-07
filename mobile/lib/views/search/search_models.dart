import '../../models/track.dart';

class SearchArtist {
  const SearchArtist({
    required this.name,
    this.imageUrl,
    this.subscribers,
    this.browseId,
  });

  final String name;
  final String? imageUrl;
  final String? subscribers;
  final String? browseId;
}

class SearchAlbum {
  const SearchAlbum({
    required this.title,
    required this.artist,
    this.coverUrl,
    this.year,
    this.browseId,
  });

  final String title;
  final String artist;
  final String? coverUrl;
  final String? year;
  final String? browseId;
}

class SearchPlaylist {
  const SearchPlaylist({
    required this.title,
    this.curator,
    this.coverUrl,
    this.trackCount,
    this.browseId,
  });

  final String title;
  final String? curator;
  final String? coverUrl;
  final String? trackCount;
  final String? browseId;
}

enum TopResultType { song, artist, album, playlist }

class SearchTopResult {
  const SearchTopResult({
    required this.title,
    required this.subtitle,
    required this.type,
    this.imageUrl,
    this.track,
    this.artist,
    this.album,
    this.playlist,
  });

  final String title;
  final String subtitle;
  final TopResultType type;
  final String? imageUrl;
  final Track? track;
  final SearchArtist? artist;
  final SearchAlbum? album;
  final SearchPlaylist? playlist;
}

class SearchResultsGroup {
  const SearchResultsGroup({
    this.topResult,
    this.songs = const [],
    this.artists = const [],
    this.albums = const [],
    this.playlists = const [],
  });

  final SearchTopResult? topResult;
  final List<Track> songs;
  final List<SearchArtist> artists;
  final List<SearchAlbum> albums;
  final List<SearchPlaylist> playlists;

  bool get isEmpty =>
      topResult == null &&
      songs.isEmpty &&
      artists.isEmpty &&
      albums.isEmpty &&
      playlists.isEmpty;
}

