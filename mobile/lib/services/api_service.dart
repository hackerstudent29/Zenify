import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'package:shared_preferences/shared_preferences.dart';

import '../models/track.dart';
import 'artist_service.dart';
import 'innertube_service.dart';
import 'lyrics_service.dart';
import 'stream_resolver_service.dart';

/// A horizontal "shelf" on the Listen Now / Browse screens (Apple Music style).
class Shelf {
  const Shelf({required this.id, required this.title, required this.tracks, this.subtitle});
  final String id;
  final String title;
  final String? subtitle;
  final List<Track> tracks;
}

enum ArtworkSize { thumb, medium, large }

class _CacheEntry {
  _CacheEntry(this.value, Duration ttl) : expires = DateTime.now().add(ttl);
  final dynamic value;
  final DateTime expires;
  bool get fresh => DateTime.now().isBefore(expires);
}

class _Resp {
  const _Resp(this.data, this.base);
  final dynamic data;
  final String base;
}

class ApiService {
  /// Live production cloud backend on Heroku
  static const String liveCloudUrl = 'https://zenify-78e257420386.herokuapp.com';
  static const String fallbackHeroku = liveCloudUrl;

  /// Default to live cloud backend so phone works anywhere without USB cable!
  /// Override during local USB debugging with: --dart-define=ZENIFY_API_BASE=http://localhost:3000
  static const String baseUrl =
      String.fromEnvironment('ZENIFY_API_BASE', defaultValue: liveCloudUrl);

  static final http.Client _client = http.Client();
  static String? _authToken;
  static String? get authToken => _authToken;
  static void setAuthToken(String? token) {
    _authToken = token;
  }

  static Map<String, String> get _headers => {
        'Accept': 'application/json',
        if (_authToken != null) 'Authorization': 'Bearer $_authToken',
      };

  /// Prioritizes live cloud or configured baseUrl with failover.
  static List<String> get bases {
    if (baseUrl != liveCloudUrl) {
      return [baseUrl, liveCloudUrl];
    }
    return [liveCloudUrl];
  }
  static List<String> get _bases => bases;

  // ---------------------------------------------------------------------------
  // Cache + in-flight de-duplication, so screens feel instant and never
  // fire the same request twice.
  // ---------------------------------------------------------------------------
  static final Map<String, _CacheEntry> _cache = {};
  static final Map<String, Future<dynamic>> _inflight = {};

  static Future<T> _memo<T>(
    String key,
    Duration ttl,
    Future<T> Function() loader, {
    bool Function(T value)? cacheable,
  }) {
    final hit = _cache[key];
    if (hit != null && hit.fresh) return Future<T>.value(hit.value as T);

    final running = _inflight[key];
    if (running != null) return running as Future<T>;

    final future = loader().then((value) {
      if (cacheable?.call(value) ?? true) {
        _cache[key] = _CacheEntry(value, ttl);
        if (_cache.length > 120) _cache.remove(_cache.keys.first);
      }
      return value;
    }).whenComplete(() => _inflight.remove(key));

    _inflight[key] = future;
    return future;
  }

  static void clearCache() => _cache.clear();

  /// GET with automatic failover. Returns null when nothing worked.
  static Future<_Resp?> _getJson(
    String path, {
    Map<String, String>? query,
    Duration timeout = const Duration(seconds: 8),
  }) async {
    for (final base in _bases) {
      try {
        var uri = Uri.parse('$base$path');
        if (query != null) uri = uri.replace(queryParameters: query);
        final res = await _client.get(uri, headers: _headers).timeout(timeout);
        if (res.statusCode == 200) {
          return _Resp(jsonDecode(utf8.decode(res.bodyBytes)), base);
        }
        // Client errors will not improve on another server.
        if (res.statusCode >= 400 && res.statusCode < 500) return null;
      } catch (e) {
        if (kDebugMode) debugPrint('ApiService GET $base$path failed: $e');
      }
    }
    return null;
  }

  static List<Track> _parseTracks(dynamic data, String base) {
    final raw = data is List ? data : (data is Map ? data['tracks'] : null);
    if (raw is! List) return const [];
    final out = <Track>[];
    for (final item in raw) {
      if (item is Map) {
        try {
          out.add(Track.fromJson(Map<String, dynamic>.from(item), baseUrl: base));
        } catch (_) {}
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Dynamic catalogue loaded from live Cloud API.
  // ---------------------------------------------------------------------------
  static List<Track> featuredTracks = [];

  // ---------------------------------------------------------------------------
  // Streaming + artwork helpers
  // ---------------------------------------------------------------------------

  /// How YouTube tracks get their audio URL:
  ///  - 'device' (default): the native engine resolves on the phone using user IP.
  ///  - 'cloud': through cloud stream endpoint.
  static const String streamMode =
      String.fromEnvironment('ZENIFY_STREAM_MODE', defaultValue: 'device');
  static bool get resolveOnDevice => streamMode == 'device';

  /// Resolves a playable URL for [track] against [base] (defaults to [baseUrl]).
  static String resolveStreamUrl(Track track, {String? base}) {
    if (resolveOnDevice && (track.source == 'youtube' || track.id.startsWith('yt-'))) {
      return 'zenify-yt://${track.id.replaceFirst('yt-', '')}';
    }

    final b = base ?? baseUrl;
    final url = track.streamUrl;

    if (url == null || url.isEmpty) {
      final q = Uri.encodeComponent('${track.artist} - ${track.title}');
      final t = Uri.encodeComponent(track.title);
      final a = Uri.encodeComponent(track.artist);
      final alb = Uri.encodeComponent(track.album);
      return '$b/api/utils/stream-youtube?url=$q&trackId=${track.id}&title=$t&artist=$a&album=$alb';
    }
    if (url.startsWith('/')) return '$b$url';
    // Re-point localhost or legacy Heroku URLs to active base so it never breaks without USB
    if (url.contains('localhost:3000') && b != 'http://localhost:3000') {
      return url.replaceFirst('http://localhost:3000', b);
    }
    if (url.contains('zenify-app-f99a38548ef6.herokuapp.com')) {
      return url.replaceFirst('https://zenify-app-f99a38548ef6.herokuapp.com', b);
    }
    if (b != baseUrl && url.startsWith(baseUrl)) return '$b${url.substring(baseUrl.length)}';
    return url;
  }

  /// Right-sized artwork: small for list rows / mini player, large for Now Playing.
  /// UI should crop YouTube thumbnails to a square (they are 16:9).
  static String artworkUrl(Track track, {ArtworkSize size = ArtworkSize.medium}) {
    final url = track.coverUrl;
    if (!url.contains('ytimg.com/vi/')) return url;
    const names = {
      ArtworkSize.thumb: 'mqdefault',
      ArtworkSize.medium: 'hqdefault',
      ArtworkSize.large: 'sddefault',
    };
    return url.replaceFirst(RegExp(r'/[a-z]+default\.jpg'), '/${names[size]}.jpg');
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /// Direct on-device YouTube Music search with failover and offline fallback.
  static Future<List<Track>> search(String query, {String? source}) async {
    final q = query.trim();
    if (q.isEmpty) return featuredTracks;

    // 1. Direct on-device YouTube InnerTube search
    try {
      final ytTracks = await InnerTubeService.instance.searchOrThrow(q);
      if (ytTracks.isNotEmpty) return ytTracks;
    } on InnerTubeException catch (e) {
      if (kDebugMode) debugPrint('[ApiService] on-device search notice: $e');
      if (e.rateLimited) return _localSearch(q);
    } catch (e) {
      if (kDebugMode) debugPrint('[ApiService] on-device search notice: $e');
    }

    // 2. Cloud fallback
    final remote = await _memo<List<Track>>(
      'search:${q.toLowerCase()}',
      const Duration(minutes: 5),
      () => _remoteSearch(q),
      cacheable: (l) => l.isNotEmpty,
    );
    if (remote.isNotEmpty) return remote;
    return _localSearch(q);
  }

  static Future<List<Track>> _remoteSearch(String q) async {
    final res = await _getJson('/api/search', query: {'q': q}, timeout: const Duration(seconds: 10));
    return res == null ? const [] : _parseTracks(res.data, res.base);
  }

  static List<Track> _localSearch(String query) {
    final q = query.toLowerCase();
    return featuredTracks
        .where((t) =>
            t.title.toLowerCase().contains(q) ||
            t.artist.toLowerCase().contains(q) ||
            t.album.toLowerCase().contains(q))
        .toList();
  }

  // ---------------------------------------------------------------------------
  // Recent searches + suggestions (Apple Music search screen)
  // ---------------------------------------------------------------------------
  static final ValueNotifier<List<String>> recentSearches = ValueNotifier<List<String>>(const []);

  /// Call when the user submits a search (not on every keystroke).
  static void addRecentSearch(String query) {
    final q = query.trim();
    if (q.isEmpty) return;
    final list = recentSearches.value.where((s) => s.toLowerCase() != q.toLowerCase()).toList();
    list.insert(0, q);
    recentSearches.value = list.take(10).toList();
  }

  static void removeRecentSearch(String query) =>
      recentSearches.value = recentSearches.value.where((s) => s != query).toList();

  static void clearRecentSearches() => recentSearches.value = const [];

  /// Instant, offline suggestions: recents first, then catalogue titles/artists.
  static List<String> suggest(String query, {int limit = 6}) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return recentSearches.value.take(limit).toList();

    final seen = <String>{};
    final out = <String>[];
    void add(String s) {
      final v = s.trim();
      if (v.isNotEmpty && v.toLowerCase().contains(q) && seen.add(v.toLowerCase())) out.add(v);
    }

    recentSearches.value.forEach(add);
    for (final t in featuredTracks) {
      add(t.title);
      t.artist.split(',').forEach(add);
      add(t.album);
    }
    out.sort((a, b) {
      final ap = a.toLowerCase().startsWith(q) ? 0 : 1;
      final bp = b.toLowerCase().startsWith(q) ? 0 : 1;
      return ap != bp ? ap - bp : a.length - b.length;
    });
    return out.take(limit).toList();
  }

  // ---------------------------------------------------------------------------
  // Browse
  // ---------------------------------------------------------------------------

  /// Live YouTube Music trending / home feed.
  static Future<List<Track>> fetchTrending() async {
    // 1. Direct on-device YouTube InnerTube home feed
    try {
      final homeTracks = await InnerTubeService.instance.getHomeFeed();
      if (homeTracks.isNotEmpty) {
        featuredTracks = homeTracks;
        return homeTracks;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[ApiService] on-device home feed notice: $e');
    }

    // 2. YouTube Charts / Search fallback
    try {
      final chartData = await InnerTubeService.instance.getCharts();
      if (chartData.tracks.isNotEmpty) {
        featuredTracks = chartData.tracks;
        return chartData.tracks;
      }
      final searchTrending =
          await InnerTubeService.instance.search('Top Hits Trending');
      if (searchTrending.isNotEmpty) {
        featuredTracks = searchTrending;
        return searchTrending;
      }
    } catch (_) {}

    // 3. Fallback
    final tracks = await _memo<List<Track>>(
      'trending',
      const Duration(minutes: 10),
      () async {
        final res = await _getJson('/api/search', query: {'q': 'trending'}, timeout: const Duration(seconds: 10));
        final list = res == null ? const <Track>[] : _parseTracks(res.data, res.base);
        if (list.isNotEmpty) {
          featuredTracks = list;
        }
        return list;
      },
      cacheable: (l) => l.isNotEmpty,
    );
    return tracks.isNotEmpty ? tracks : featuredTracks;
  }

  /// "Listen Now" shelves: Top Picks, Trending, then one shelf per language.
  static Future<List<Shelf>> fetchHomeShelves() {
    return _memo<List<Shelf>>('home-shelves', const Duration(minutes: 5), () async {
      final trending = await fetchTrending();
      final featured = featuredTracks;

      final seen = <String>{};
      final pool = [...featured, ...trending].where((t) => seen.add(t.id)).toList();

      final shelves = <Shelf>[
        Shelf(id: 'top-picks', title: 'Top Picks', subtitle: 'Made for you', tracks: featured),
        Shelf(id: 'trending', title: 'Trending Now', subtitle: 'What everyone is playing', tracks: trending),
      ];

      final byLanguage = <String, List<Track>>{};
      for (final t in pool) {
        final lang = t.language.trim().toLowerCase();
        if (lang.isNotEmpty) (byLanguage[lang] ??= []).add(t);
      }
      byLanguage.forEach((lang, tracks) {
        if (tracks.length >= 3) {
          shelves.add(Shelf(id: 'lang-$lang', title: '${_titleCase(lang)} Hits', tracks: tracks));
        }
      });
      return shelves;
    });
  }

  /// Similar songs for Autoplay, built from the seed's lead artist.
  static Future<List<Track>> fetchRelated(Track seed, {int limit = 20}) async {
    final artist = seed.artist.split(',').first.trim();
    final results = await search(artist);
    final extra = results.length < 5 ? await fetchTrending() : <Track>[];
    final seen = <String>{seed.id};
    return [...results, ...extra].where((t) => seen.add(t.id)).take(limit).toList();
  }

  // ---------------------------------------------------------------------------
  // Lyrics
  // ---------------------------------------------------------------------------

  /// Direct backend proxy for raw cloud lyrics resolution.
  static Future<Map<String, dynamic>?> fetchBackendLyrics(
    String trackId,
    Map<String, String> queryParams,
  ) async {
    final res = await _getJson(
      '/api/lyrics/${Uri.encodeComponent(trackId)}',
      query: queryParams,
      timeout: const Duration(seconds: 8),
    );
    final data = res?.data;
    return data is Map ? Map<String, dynamic>.from(data) : null;
  }

  /// Synced / plain lyrics with multi-provider fallback (Backend -> LRCLIB -> InnerTube).
  static Future<Map<String, dynamic>?> fetchLyrics(Track track) async {
    final res = await LyricsService.instance.fetchLyrics(track);
    if (res == null || res.isEmpty) return null;
    return {
      'lines': res.lines,
      'synced': res.synced,
      'source': res.source,
      if (res.rawLrc != null) 'rawLrc': res.rawLrc,
    };
  }

  /// Fire-and-forget warm-up so the next song's lyrics appear instantly.
  static Future<void> prefetchLyrics(Track track) async {
    try {
      await fetchLyrics(track);
    } catch (_) {}
  }

  /// Call once at app start to pre-fill caches while the splash is visible.
  static void warmUp() {
    unawaited(fetchHomeShelves());
  }

  /// Flushes all memory and persistent caches across all services.
  static Future<void> clearAllCaches() async {
    clearCache();
    StreamResolverService.instance.clearCache();
    ArtistService.clearCache();
    InnerTubeService.instance.clearCache();
    try {
      final prefs = await SharedPreferences.getInstance();
      final keys = prefs.getKeys().where((k) => k.startsWith('lyrics_cache_') || k.startsWith('zenify_search_'));
      for (final k in keys) {
        await prefs.remove(k);
      }
    } catch (_) {}
  }

  static String _titleCase(String s) =>
      s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}