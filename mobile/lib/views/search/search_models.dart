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

/// Search catalog source provider (YouTube Music / InnerTube native).
enum SearchSource {
  all('All', 'Universal'),
  youtube('YouTube Music', 'YT Music');

  const SearchSource(this.label, this.shortLabel);
  final String label;
  final String shortLabel;
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
    this.sourceStream = 'general',
    this.providerRank = 0,
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
  final String sourceStream;
  final int providerRank;

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
    super.sourceStream = 'general',
    super.providerRank = 0,
    this.artists = const [],
    this.albumName,
    this.albumBrowseId,
    this.durationSeconds = 210,
    this.durationText = '3:30',
    this.musicVideoType = 'ATV', // ATV (Audio), OMV (Video), UGC
    this.playCount,
    this.playCountText,
  }) : super(type: SearchItemType.song);

  final List<ArtistRef> artists;
  final String? albumName;
  final String? albumBrowseId;
  final int durationSeconds;
  final String durationText;
  final String musicVideoType;
  final int? playCount;
  final String? playCountText;

  bool get isOfficialAudio => musicVideoType == 'ATV' || musicVideoType == 'MUSIC_VIDEO_TYPE_ATV';

  Track toTrack() {
    final tLower = title.toLowerCase();
    final isVid = !isOfficialAudio && (
      musicVideoType == 'MUSIC_VIDEO_TYPE_OMV' ||
      musicVideoType == 'OMV' ||
      musicVideoType == 'MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC_VIDEO' ||
      musicVideoType == 'MUSIC_VIDEO_TYPE_UGC' ||
      tLower.contains('video song') ||
      tLower.contains('music video') ||
      tLower.contains('official video') ||
      tLower.contains('full video') ||
      tLower.contains('4k video') ||
      tLower.contains('lyric video') ||
      tLower.contains('visualizer') ||
      tLower.contains('(video)') ||
      tLower.contains('[video]')
    );
    return Track(
      id: id.startsWith('yt-') ? id : 'yt-$id',
      title: title,
      artist: artists.isNotEmpty ? ArtistRef.formatList(artists) : subtitle,
      artists: artists,
      album: isVid && (albumName == null || albumName == 'Single') ? 'Music Video' : (albumName ?? 'Single'),
      albumBrowseId: albumBrowseId,
      coverUrl: thumbnailUrlHiRes.isNotEmpty ? thumbnailUrlHiRes : thumbnailUrl,
      durationSeconds: durationSeconds,
      language: Track.detectLanguage(title, subtitle, albumName ?? '') ?? '',
      source: 'youtube',
      isVideo: isVid,
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
      sourceStream: sourceStream,
      providerRank: providerRank,
      artists: artists,
      albumName: albumName,
      albumBrowseId: albumBrowseId,
      durationSeconds: durationSeconds,
      durationText: durationText,
      musicVideoType: musicVideoType,
      playCount: playCount,
      playCountText: playCountText,
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
    super.sourceStream = 'general',
    super.providerRank = 0,
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
      sourceStream: sourceStream,
      providerRank: providerRank,
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
    super.sourceStream = 'general',
    super.providerRank = 0,
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
      sourceStream: sourceStream,
      providerRank: providerRank,
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
    super.sourceStream = 'general',
    super.providerRank = 0,
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
      sourceStream: sourceStream,
      providerRank: providerRank,
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
    super.sourceStream = 'general',
    super.providerRank = 0,
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
      sourceStream: sourceStream,
      providerRank: providerRank,
      channel: channel,
      viewCountText: viewCountText,
      durationText: durationText,
      views: views,
    );
  }
}

/// Robust filter ensuring only legitimate music video content (music videos, lyric videos,
/// official audio visualizers, full musical albums/jukeboxes, live performances) is admitted,
/// while strictly rejecting Shorts, tech reviews, tutorials, vlogs, reactions, memes, and gaming.
class MusicVideoFilter {
  MusicVideoFilter._();

  static final RegExp _shortsRegex =
      RegExp(r'(#shorts?|\bshorts?\b)', caseSensitive: false);

  static final List<String> _bannedNonMusicKeywords = [
    'tech', 'technology', 'review', 'unboxing', 'unbox', 'tutorial', 'how to',
    'course', 'lecture', 'podcast', 'episode', 'interview', 'vlog',
    'daily vlog', 'gaming', 'gameplay', 'walkthrough', 'politics',
    'political', 'roast', 'prank', 'meme', 'reaction',
    'camera test', 'battery test', 'speed test', 'benchmark', 'specifications',
    'specs', 'trading', 'crypto', 'stock market', 'finance', 'workout routine',
    'gym routine', 'diet plan', 'recipe', 'cooking', 'diy', 'skincare',
    'unfiltered', 'behind the scenes', 'bts interview',
    'press meet', 'audio launch speech', 'trailer reaction', 'teaser reaction',
    'movie review', 'teaser breakdown', 'trailer breakdown', 'public review',
    'theatre response', 'audience reaction', 'press conference', 'status video',
    'whatsapp status', 'instagram reels',
  ];

  static final List<String> _musicPositiveKeywords = [
    'official music video', 'official video', 'music video', 'lyric video',
    'lyrical video', 'lyrics video', 'official lyrical', 'audio', 'visualizer',
    'official audio', 'full song', 'full video', 'full video song', 'video song',
    'song', 'songs', 'track', 'ost', 'mv', 'theme song', 'title track',
    'live performance', 'live concert', 'concert', 'unplugged', 'acoustic session',
    'studio session', 'live session', 'acoustic version', 'remix', 'mashup',
    'jukebox', 'full album', 'audio jukebox', 'video jukebox', 'all songs',
    'nonstop', 'orchestra', 'symphony', 'musical',
  ];

  static final List<String> _longMusicAllowedKeywords = [
    'jukebox', 'full album', 'all songs', 'audio jukebox', 'video jukebox',
    'concert', 'live at', 'dj mix', 'nonstop', 'mashup', 'compilation',
    'audio songs', 'playlist', 'discography', 'complete album',
  ];

  /// Returns true ONLY if the item represents legitimate music video content.
  static bool isLegitMusicVideo({
    required String title,
    required String subtitle,
    String? channel,
    int durationSeconds = 0,
    String? durationText,
  }) {
    final tLower = title.toLowerCase();
    final sLower = subtitle.toLowerCase();
    final cLower = (channel ?? '').toLowerCase();
    final fullText = '$tLower $sLower $cLower';

    // 1. Strict ban on Shorts (< 25s or #shorts)
    if (_shortsRegex.hasMatch(title) || _shortsRegex.hasMatch(subtitle)) {
      return false;
    }
    if (durationSeconds > 0 && durationSeconds < 25) {
      return false;
    }
    if (durationText != null && durationText.isNotEmpty) {
      final parts = durationText.trim().split(':');
      if (parts.length == 2) {
        final mins = int.tryParse(parts[0]) ?? 0;
        final secs = int.tryParse(parts[1]) ?? 0;
        if (mins == 0 && secs < 25) return false;
      }
    }

    // 2. Strict ban on Lengthy normal non-music videos (> 15 minutes = 900 seconds)
    // Long videos are ONLY allowed if they are full albums, jukeboxes, or live concerts
    final dur = durationSeconds > 0
        ? durationSeconds
        : _parseDuration(durationText);
    if (dur > 900) {
      final isLongMusic =
          _longMusicAllowedKeywords.any((kw) => fullText.contains(kw));
      if (!isLongMusic) return false;
    }

    // 3. Strict ban on Tech, reviews, tutorials, vlogs, reactions, memes, news
    for (final bad in _bannedNonMusicKeywords) {
      if (RegExp(r'\b' + RegExp.escape(bad) + r'\b', caseSensitive: false)
          .hasMatch(fullText)) {
        // Absolute bans (never permitted)
        if (bad == 'review' ||
            bad == 'reaction' ||
            bad == 'unboxing' ||
            bad == 'tutorial' ||
            bad == 'how to' ||
            bad == 'podcast' ||
            bad == 'vlog' ||
            bad == 'gaming' ||
            bad == 'gameplay' ||
            bad == 'trailer reaction' ||
            bad == 'movie review' ||
            bad == 'public review' ||
            bad == 'theatre response') {
          return false;
        }
        if (!_musicPositiveKeywords.any((m) => tLower.contains(m))) {
          return false;
        }
      }
    }

    return true;
  }

  static int _parseDuration(String? text) {
    if (text == null || !text.contains(':')) return 0;
    final parts = text.split(':').map((p) => int.tryParse(p.trim())).toList();
    if (parts.length == 2 && parts[0] != null && parts[1] != null) {
      return parts[0]! * 60 + parts[1]!;
    }
    if (parts.length == 3 &&
        parts[0] != null &&
        parts[1] != null &&
        parts[2] != null) {
      return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
    }
    return 0;
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
    super.sourceStream = 'general',
    super.providerRank = 0,
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
      sourceStream: sourceStream,
      providerRank: providerRank,
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

/// Individual candidate breakdown for search ranking diagnostics.
class CandidateDiagnostics {
  const CandidateDiagnostics({
    required this.id,
    required this.title,
    required this.type,
    required this.sourceStream,
    required this.providerRank,
    required this.textScore,
    required this.entityScore,
    required this.popularityScore,
    required this.rrfScore,
    required this.contextScore,
    required this.qualityScore,
    required this.penalties,
    required this.finalScore,
  });

  final String id;
  final String title;
  final SearchItemType type;
  final String sourceStream;
  final int providerRank;
  final double textScore;
  final double entityScore;
  final double popularityScore;
  final double rrfScore;
  final double contextScore;
  final double qualityScore;
  final double penalties;
  final double finalScore;
}

/// Comprehensive internal search request and pipeline diagnostics.
class SearchDiagnostics {
  const SearchDiagnostics({
    required this.query,
    required this.normalizedQuery,
    required this.detectedIntent,
    required this.country,
    required this.requestLanguage,
    required this.streamsQueried,
    required this.streamLatenciesMs,
    required this.totalCandidates,
    required this.dedupedCandidates,
    this.candidateBreakdowns = const [],
    this.deduplicationDecisions = const [],
  });

  final String query;
  final String normalizedQuery;
  final SearchIntent detectedIntent;
  final String country;
  final String requestLanguage;
  final List<String> streamsQueried;
  final Map<String, int> streamLatenciesMs;
  final int totalCandidates;
  final int dedupedCandidates;
  final List<CandidateDiagnostics> candidateBreakdowns;
  final List<String> deduplicationDecisions;
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
    this.diagnostics,
    this.suggestions = const [],
  });

  final SearchTopResult? topResult;
  final Map<SearchItemType, List<SearchItem>> sections;
  final String? correctedQuery;
  final String originalQuery;
  final String? continuation;
  final SearchIntent intent;
  final SearchDiagnostics? diagnostics;
  final List<String> suggestions;

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
