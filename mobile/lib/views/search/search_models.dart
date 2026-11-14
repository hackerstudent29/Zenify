import '../../models/artist_ref.dart';
import '../../models/track.dart';

/// Supported search item types across InnerTube and Zenify.
enum SearchItemType {
  song,
  artist,
  album,
  playlist,
  video,
  podcast,
  episode,
  topResult,
}

/// Official InnerTube filter parameters verified against YouTube.kt / SearchFilter.
enum SearchFilter {
  all(null, 'All'),
  songs('EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D', 'Songs'),
  artists('EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D', 'Artists'),
  albums('EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D', 'Albums'),
  featuredPlaylists('EgeKAQQoADgBagwQDhAKEAMQBRAJEAQ%3D', 'Playlists'),
  communityPlaylists('EgeKAQQoAEABagoQAxAEEAoQCRAF', 'Community'),
  videos('EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D', 'Videos');

  const SearchFilter(this.params, this.label);
  final String? params;
  final String label;
}

/// Layout mode driven by user search intent.
enum SearchLayoutMode {
  exactArtist, // Artist hero -> artist top songs -> albums -> playlists -> videos
  artistType, // Requested type leads (e.g. songs or albums) -> remaining types
  songTitle, // Best song matches first -> artist -> album -> playlists
  albumOrPlaylist, // Matching album/playlist leads -> songs -> artist
  generic, // Blended ranking across all types
}

/// Detected user intent from search query.
class SearchIntent {
  const SearchIntent({
    required this.originalQuery,
    required this.normalizedQuery,
    required this.entityText,
    this.intentType,
    this.modifiers = const [],
    this.artistIntent = false,
    this.matchedArtistBrowseId,
    this.matchedArtistName,
    this.layoutMode = SearchLayoutMode.generic,
  });

  final String originalQuery;
  final String normalizedQuery;
  final String entityText;
  final SearchItemType? intentType;
  final List<String> modifiers;
  final bool artistIntent;
  final String? matchedArtistBrowseId;
  final String? matchedArtistName;
  final SearchLayoutMode layoutMode;

  SearchIntent copyWith({
    String? originalQuery,
    String? normalizedQuery,
    String? entityText,
    SearchItemType? intentType,
    List<String>? modifiers,
    bool? artistIntent,
    String? matchedArtistBrowseId,
    String? matchedArtistName,
    SearchLayoutMode? layoutMode,
  }) {
    return SearchIntent(
      originalQuery: originalQuery ?? this.originalQuery,
      normalizedQuery: normalizedQuery ?? this.normalizedQuery,
      entityText: entityText ?? this.entityText,
      intentType: intentType ?? this.intentType,
      modifiers: modifiers ?? this.modifiers,
      artistIntent: artistIntent ?? this.artistIntent,
      matchedArtistBrowseId: matchedArtistBrowseId ?? this.matchedArtistBrowseId,
      matchedArtistName: matchedArtistName ?? this.matchedArtistName,
      layoutMode: layoutMode ?? this.layoutMode,
    );
  }
}

/// Immutable base class for any item parsed from InnerTube search.
sealed class SearchItem {
  const SearchItem({
    required this.id,
    required this.type,
    required this.title,
    required this.subtitle,
    required this.thumbnailUrl,
    required this.thumbnailUrlHiRes,
    this.browseId,
    this.videoId,
    this.playlistId,
    this.radioPlaylistId,
    this.isExplicit = false,
    this.rawRank = 0,
    this.finalScore = 0.0,
  });

  final String id;
  final SearchItemType type;
  final String title;
  final String subtitle;
  final String thumbnailUrl;
  final String thumbnailUrlHiRes;
  final String? browseId;
  final String? videoId;
  final String? playlistId;
  final String? radioPlaylistId;
  final bool isExplicit;
  final int rawRank;
  final double finalScore;

  SearchItem copyWithScore(double score);
}

/// Song search result item.
class SearchSongItem extends SearchItem {
  const SearchSongItem({
    required super.id,
    required super.title,
    required super.subtitle,
    required super.thumbnailUrl,
    required super.thumbnailUrlHiRes,
    super.videoId,
    super.browseId,
    super.playlistId,
    super.radioPlaylistId,
    super.isExplicit = false,
    super.rawRank = 0,
    super.finalScore = 0.0,
    this.artists = const [],
    this.albumName,
    this.albumBrowseId,
    this.durationSeconds = 210,
    this.durationText = '3:30',
    this.musicVideoType = 'ATV', // ATV (Audio), OMV (Video), UGC
  }) : super(type: SearchItemType.song);

  final List<ArtistRef> artists;
  final String? albumName;
  final String? albumBrowseId;
  final int durationSeconds;
  final String durationText;
  final String musicVideoType;

  bool get isOfficialAudio => musicVideoType == 'ATV' || musicVideoType == 'MUSIC_VIDEO_TYPE_ATV';

  Track toTrack() {
    return Track(
      id: id.startsWith('yt-') ? id : 'yt-$id',
      title: title,
      artist: subtitle,
      artists: artists,
      album: albumName ?? 'Single',
      albumBrowseId: albumBrowseId,
      coverUrl: thumbnailUrlHiRes.isNotEmpty ? thumbnailUrlHiRes : thumbnailUrl,
      durationSeconds: durationSeconds,
      language: Track.detectLanguage(title, subtitle, albumName ?? '') ?? '',
      source: 'youtube',
    );
  }

  @override
  SearchSongItem copyWithScore(double score) {
    return SearchSongItem(
      id: id,
      title: title,
      subtitle: subtitle,
      thumbnailUrl: thumbnailUrl,
      thumbnailUrlHiRes: thumbnailUrlHiRes,
      videoId: videoId,
      browseId: browseId,
      playlistId: playlistId,
      radioPlaylistId: radioPlaylistId,
      isExplicit: isExplicit,
      rawRank: rawRank,
      finalScore: score,
      artists: artists,
      albumName: albumName,
      albumBrowseId: albumBrowseId,
      durationSeconds: durationSeconds,
      durationText: durationText,
      musicVideoType: musicVideoType,
    );
  }
}

/// Artist search result item.
class SearchArtistItem extends SearchItem {
  const SearchArtistItem({
    required super.id,
    required super.title,
    required super.subtitle,
    required super.thumbnailUrl,
    required super.thumbnailUrlHiRes,
    super.browseId,
    super.radioPlaylistId,
    super.rawRank = 0,
    super.finalScore = 0.0,
    this.subscriberText,
    this.subscriberCount,
    this.isVerified = false,
    this.isProfile = false,
  }) : super(type: SearchItemType.artist);

  final String? subscriberText;
  final int? subscriberCount;
  final bool isVerified;
  final bool isProfile;

  String get name => title;

  @override
  SearchArtistItem copyWithScore(double score) {
    return SearchArtistItem(
      id: id,
      title: title,
      subtitle: subtitle,
      thumbnailUrl: thumbnailUrl,
      thumbnailUrlHiRes: thumbnailUrlHiRes,
      browseId: browseId,
      radioPlaylistId: radioPlaylistId,
      rawRank: rawRank,
      finalScore: score,
      subscriberText: subscriberText,
      subscriberCount: subscriberCount,
      isVerified: isVerified,
      isProfile: isProfile,
    );
  }
}

/// Album search result item.
class SearchAlbumItem extends SearchItem {
  const SearchAlbumItem({
    required super.id,
    required super.title,
    required super.subtitle,
    required super.thumbnailUrl,
    required super.thumbnailUrlHiRes,
    super.browseId,
    super.playlistId,
    super.isExplicit = false,
    super.rawRank = 0,
    super.finalScore = 0.0,
    this.albumType = 'Album', // Album, Single, EP
    this.year,
    this.artists = const [],
  }) : super(type: SearchItemType.album);

  final String albumType;
  final int? year;
  final List<ArtistRef> artists;

  @override
  SearchAlbumItem copyWithScore(double score) {
    return SearchAlbumItem(
      id: id,
      title: title,
      subtitle: subtitle,
      thumbnailUrl: thumbnailUrl,
      thumbnailUrlHiRes: thumbnailUrlHiRes,
      browseId: browseId,
      playlistId: playlistId,
      isExplicit: isExplicit,
      rawRank: rawRank,
      finalScore: score,
      albumType: albumType,
      year: year,
      artists: artists,
    );
  }
}

/// Playlist search result item.
class SearchPlaylistItem extends SearchItem {
  const SearchPlaylistItem({
    required super.id,
    required super.title,
    required super.subtitle,
    required super.thumbnailUrl,
    required super.thumbnailUrlHiRes,
    super.browseId,
    super.playlistId,
    super.rawRank = 0,
    super.finalScore = 0.0,
    this.author,
    this.songCountText,
    this.isOfficial = false,
    this.isCommunity = false,
  }) : super(type: SearchItemType.playlist);

  final String? author;
  final String? songCountText;
  final bool isOfficial;
  final bool isCommunity;

  @override
  SearchPlaylistItem copyWithScore(double score) {
    return SearchPlaylistItem(
      id: id,
      title: title,
      subtitle: subtitle,
      thumbnailUrl: thumbnailUrl,
      thumbnailUrlHiRes: thumbnailUrlHiRes,
      browseId: browseId,
      playlistId: playlistId,
      rawRank: rawRank,
      finalScore: score,
      author: author,
      songCountText: songCountText,
      isOfficial: isOfficial,
      isCommunity: isCommunity,
    );
  }
}

/// Video search result item.
class SearchVideoItem extends SearchItem {
  const SearchVideoItem({
    required super.id,
    required super.title,
    required super.subtitle,
    required super.thumbnailUrl,
    required super.thumbnailUrlHiRes,
    super.videoId,
    super.browseId,
    super.rawRank = 0,
    super.finalScore = 0.0,
    this.channel,
    this.viewCountText,
    this.durationText = '',
    this.views = 0,
  }) : super(type: SearchItemType.video);

  final String? channel;
  final String? viewCountText;
  final String durationText;
  final int views;

  Track toTrack() {
    final cleanId = (videoId != null && videoId!.trim().isNotEmpty)
        ? videoId!.trim()
        : id.replaceFirst('yt-', '').trim();
    final trackId = cleanId.startsWith('yt-') ? cleanId : 'yt-$cleanId';
    final artistName = (channel != null && channel!.trim().isNotEmpty)
        ? channel!.trim()
        : (subtitle.isNotEmpty ? subtitle : 'YouTube');
    return Track(
      id: trackId,
      title: title,
      artist: artistName,
      album: 'Video',
      coverUrl: thumbnailUrlHiRes.isNotEmpty ? thumbnailUrlHiRes : thumbnailUrl,
      durationSeconds: _parseDurationSeconds(durationText),
      language: Track.detectLanguage(title, artistName, '') ?? '',
      source: 'youtube',
      isVideo: true,
    );
  }

  static int _parseDurationSeconds(String raw) {
    final parts = raw.trim().split(':');
    if (parts.length == 2) {
      final m = int.tryParse(parts[0]) ?? 0;
      final s = int.tryParse(parts[1]) ?? 0;
      return m * 60 + s;
    }
    if (parts.length == 3) {
      final h = int.tryParse(parts[0]) ?? 0;
      final m = int.tryParse(parts[1]) ?? 0;
      final s = int.tryParse(parts[2]) ?? 0;
      return h * 3600 + m * 60 + s;
    }
    return 0;
  }

  @override
  SearchVideoItem copyWithScore(double score) {
    return SearchVideoItem(
      id: id,
      title: title,
      subtitle: subtitle,
      thumbnailUrl: thumbnailUrl,
      thumbnailUrlHiRes: thumbnailUrlHiRes,
      videoId: videoId,
      browseId: browseId,
      rawRank: rawRank,
      finalScore: score,
      channel: channel,
      viewCountText: viewCountText,
      durationText: durationText,
      views: views,
    );
  }
}

/// Podcast / Episode search result item.
class SearchPodcastItem extends SearchItem {
  const SearchPodcastItem({
    required super.id,
    required super.title,
    required super.subtitle,
    required super.thumbnailUrl,
    required super.thumbnailUrlHiRes,
    super.browseId,
    super.rawRank = 0,
    super.finalScore = 0.0,
    this.host,
    this.episodeCountText,
    this.isEpisode = false,
    this.durationText,
    this.publishDateText,
  }) : super(type: SearchItemType.podcast);

  final String? host;
  final String? episodeCountText;
  final bool isEpisode;
  final String? durationText;
  final String? publishDateText;

  @override
  SearchPodcastItem copyWithScore(double score) {
    return SearchPodcastItem(
      id: id,
      title: title,
      subtitle: subtitle,
      thumbnailUrl: thumbnailUrl,
      thumbnailUrlHiRes: thumbnailUrlHiRes,
      browseId: browseId,
      rawRank: rawRank,
      finalScore: score,
      host: host,
      episodeCountText: episodeCountText,
      isEpisode: isEpisode,
      durationText: durationText,
      publishDateText: publishDateText,
    );
  }
}

/// Top Result featured card wrapping a primary item and action endpoints.
class SearchTopResult {
  const SearchTopResult({
    required this.item,
    this.playVideoId,
    this.radioPlaylistId,
    this.shufflePlaylistId,
  });

  final SearchItem item;
  final String? playVideoId;
  final String? radioPlaylistId;
  final String? shufflePlaylistId;

  String get title => item.title;
  String get subtitle => item.subtitle;
  SearchItemType get type => item.type;
  String get imageUrl => item.thumbnailUrlHiRes.isNotEmpty ? item.thumbnailUrlHiRes : item.thumbnailUrl;
}

/// Root search result structure returned by the search pipeline.
class SearchResult {
  const SearchResult({
    this.topResult,
    this.sections = const {},
    this.correctedQuery,
    required this.originalQuery,
    this.continuation,
    required this.intent,
  });

  final SearchTopResult? topResult;
  final Map<SearchItemType, List<SearchItem>> sections;
  final String? correctedQuery;
  final String originalQuery;
  final String? continuation;
  final SearchIntent intent;

  List<SearchSongItem> get songs =>
      sections[SearchItemType.song]?.whereType<SearchSongItem>().toList() ?? const [];
  List<SearchArtistItem> get artists =>
      sections[SearchItemType.artist]?.whereType<SearchArtistItem>().toList() ?? const [];
  List<SearchAlbumItem> get albums =>
      sections[SearchItemType.album]?.whereType<SearchAlbumItem>().toList() ?? const [];
  List<SearchPlaylistItem> get playlists =>
      sections[SearchItemType.playlist]?.whereType<SearchPlaylistItem>().toList() ?? const [];
  List<SearchVideoItem> get videos =>
      sections[SearchItemType.video]?.whereType<SearchVideoItem>().toList() ?? const [];
  List<SearchPodcastItem> get podcasts =>
      sections[SearchItemType.podcast]?.whereType<SearchPodcastItem>().toList() ?? const [];

  bool get isEmpty =>
      topResult == null &&
      songs.isEmpty &&
      artists.isEmpty &&
      albums.isEmpty &&
      playlists.isEmpty &&
      videos.isEmpty &&
      podcasts.isEmpty;
}
