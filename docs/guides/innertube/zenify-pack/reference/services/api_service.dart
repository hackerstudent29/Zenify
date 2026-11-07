// lib/services/api_service.dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/track.dart';
import 'country_service.dart';
import 'innertube_service.dart';

/// A horizontal "shelf" on the Listen Now / Browse screens (Apple Music style).
class Shelf {
  const Shelf({required this.id, required this.title, required this.tracks, this.subtitle});
  final String id;
  final String title;
  final String? subtitle;
  final List<Track> tracks;
}

typedef ChartsResult = ({
  List<Track> tracks,
  List<({String name, String subs, String image})> artists,
});

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
  /// Cloud backend. Used for lyrics and as a LAST-RESORT fallback only; it is a
  /// single datacenter IP, so anything that touches YouTube through it will be
  /// the first thing to get throttled when many people use the app.
  static const String liveCloudUrl = 'https://zenify-78e257420386.herokuapp.com';
  static const String fallbackHeroku = liveCloudUrl;

  /// Override for local debugging: --dart-define=ZENIFY_API_BASE=http://localhost:3000
  static const String baseUrl =
      String.fromEnvironment('ZENIFY_API_BASE', defaultValue: liveCloudUrl);

  /// How YouTube tracks get their audio URL:
  ///  - 'cloud'  (current behaviour): through the cloud stream endpoint.
  ///  - 'device' : the native engine resolves on the phone. Every user then
  ///               uses their own IP; this is what scales to many users.
  /// --dart-define=ZENIFY_STREAM_MODE=device
  static const String streamMode =
      String.fromEnvironment('ZENIFY_STREAM_MODE', defaultValue: 'cloud');
  static bool get resolveOnDevice => streamMode == 'device';

  /// Allow cloud search when on-device search fails for non-rate-limit reasons.
  static const bool cloudFallback =
      bool.fromEnvironment('ZENIFY_CLOUD_FALLBACK', defaultValue: true);

  static final http.Client _client = http.Client();
  static const Map<String, String> _headers = {'Accept': 'application/json'};

  static List<String> get bases =>
      baseUrl != liveCloudUrl ? [baseUrl, liveCloudUrl] : [liveCloudUrl];
  static List<String> get _bases => bases;

  // ---------------------------------------------------------------------------
  // Cache + in-flight de-duplication.
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

  static void clearCache() {
    _cache.clear();
    InnerTubeService.instance.clearCache();
  }

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
  // Dynamic catalogue
  // ---------------------------------------------------------------------------
  static List<Track> featuredTracks = [];

  // ---------------------------------------------------------------------------
  // Streaming + artwork helpers
  // ---------------------------------------------------------------------------

  /// Playable URL for [track].
  ///
  /// In 'device' mode YouTube tracks return `zenify-yt://<videoId>`. The native
  /// engine's ResolvingDataSource turns that into a real stream URL on the
  /// phone (see zenify-docs/06-ANDROID-ENGINE.md), so Dart never builds or
  /// proxies a YouTube URL.
  static String resolveStreamUrl(Track track, {String? base}) {
    if (resolveOnDevice && track.source == 'youtube') {
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
    if (url.contains('localhost:3000') && b != 'http://localhost:3000') {
      return url.replaceFirst('http://localhost:3000', b);
    }
    if (url.contains('zenify-app-f99a38548ef6.herokuapp.com')) {
      return url.replaceFirst('https://zenify-app-f99a38548ef6.herokuapp.com', b);
    }
    if (b != baseUrl && url.startsWith(baseUrl)) return '$b${url.substring(baseUrl.length)}';
    return url;
  }

  /// Right-sized artwork. UI should crop YouTube thumbnails to a square.
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

  /// On-device YouTube Music search.
  ///
  ///  - Success (even with zero results): return it. No second request.
  ///  - Rate-limited / cooling down: do NOT fail over to the cloud (that just
  ///    moves the same load to one shared IP). Serve local matches instead.
  ///  - Other failures (offline, parse): cloud fallback if enabled.
  static Future<List<Track>> search(String query, {String? source}) async {
    final q = query.trim();
    if (q.isEmpty) return featuredTracks;

    try {
      return await InnerTubeService.instance.searchOrThrow(q);
    } on InnerTubeException catch (e) {
      if (kDebugMode) debugPrint('[ApiService] on-device search: $e');
      if (e.rateLimited) return _localSearch(q);
    } catch (e) {
      if (kDebugMode) debugPrint('[ApiService] on-device search: $e');
    }

    if (cloudFallback) {
      final remote = await _memo<List<Track>>(
        'search:${q.toLowerCase()}',
        const Duration(minutes: 5),
        () => _remoteSearch(q),
        cacheable: (l) => l.isNotEmpty,
      );
      if (remote.isNotEmpty) return remote;
    }
    return _localSearch(q);
  }

  static Future<List<Track>> _remoteSearch(String q) async {
    final res = await _getJson('/api/search',
        query: {'q': q}, timeout: const Duration(seconds: 10));
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
  // Recent searches + suggestions
  // ---------------------------------------------------------------------------
  static final ValueNotifier<List<String>> recentSearches =
      ValueNotifier<List<String>>(const []);

  /// Call when the user submits a search (not on every keystroke).
  static void addRecentSearch(String query) {
    final q = query.trim();
    if (q.isEmpty) return;
    final list = recentSearches.value
        .where((s) => s.toLowerCase() != q.toLowerCase())
        .toList();
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
      if (v.isNotEmpty && v.toLowerCase().contains(q) && seen.add(v.toLowerCase())) {
        out.add(v);
      }
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

  /// Remote suggestions (cached 5 min by the transport). Call only after the
  /// UI debounce (>= 300 ms) and for queries of 2+ characters.
  static Future<List<String>> suggestRemote(String query) async {
    final q = query.trim();
    if (q.length < 2) return suggest(q);
    final remote = await InnerTubeService.instance.getSearchSuggestions(q);
    return remote.isNotEmpty ? remote.take(8).toList() : suggest(q);
  }

  // ---------------------------------------------------------------------------
  // Browse
  // ---------------------------------------------------------------------------

  static String get _cc => CountryService.instance.currentCode;

  /// Live YouTube Music home feed.
  static Future<List<Track>> fetchTrending() async {
    try {
      final home = await InnerTubeService.instance.getHomeFeed();
      if (home.isNotEmpty) {
        featuredTracks = home;
        return home;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[ApiService] home feed: $e');
    }

    // Do not pile onto the cloud while YouTube is throttling this device.
    if (InnerTubeService.instance.isCoolingDown || !cloudFallback) {
      return featuredTracks;
    }

    final tracks = await _memo<List<Track>>(
      'trending',
      const Duration(minutes: 10),
      () async {
        final res = await _getJson('/api/search',
            query: {'q': 'trending'}, timeout: const Duration(seconds: 10));
        final list = res == null ? const <Track>[] : _parseTracks(res.data, res.base);
        if (list.isNotEmpty) featuredTracks = list;
        return list;
      },
      cacheable: (l) => l.isNotEmpty,
    );
    return tracks.isNotEmpty ? tracks : featuredTracks;
  }

  /// Country charts (tracks + top artists).
  static Future<ChartsResult> fetchCharts() => _memo<ChartsResult>(
        'charts:$_cc',
        const Duration(minutes: 30),
        () => InnerTubeService.instance.getCharts(countryCode: _cc),
        cacheable: (r) => r.tracks.isNotEmpty || r.artists.isNotEmpty,
      );

  /// New releases for the selected country.
  static Future<List<Track>> fetchNewReleases() => _memo<List<Track>>(
        'new-releases:$_cc',
        const Duration(minutes: 30),
        () => InnerTubeService.instance.getNewReleases(countryCode: _cc),
        cacheable: (l) => l.isNotEmpty,
      );

  /// "Listen Now" shelves: Top Picks, Trending, then one shelf per language.
  static Future<List<Shelf>> fetchHomeShelves() {
    return _memo<List<Shelf>>('home-shelves:$_cc', const Duration(minutes: 5), () async {
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
    }, cacheable: (s) => s.any((x) => x.tracks.isNotEmpty));
  }

  /// Similar songs for Autoplay. Uses YouTube's own radio for the seed (one
  /// cached request) and only falls back to an artist search if that is thin.
  static Future<List<Track>> fetchRelated(Track seed, {int limit = 20}) async {
    final seen = <String>{seed.id};

    if (seed.source == 'youtube') {
      final radio = await InnerTubeService.instance.getNextQueue(seed.id);
      final out = radio.where((t) => seen.add(t.id)).take(limit).toList();
      if (out.length >= 5) return out;
    }

    final artist = seed.artist.split(',').first.trim();
    final results = await search(artist);
    final extra = results.length < 5 ? await fetchTrending() : <Track>[];
    return [...results, ...extra].where((t) => seen.add(t.id)).take(limit).toList();
  }

  // ---------------------------------------------------------------------------
  // Lyrics (not YouTube; served by the cloud backend)
  // ---------------------------------------------------------------------------

  static Future<Map<String, dynamic>?> fetchLyrics(Track track) {
    return _memo<Map<String, dynamic>?>(
      'lyrics:${track.id}',
      const Duration(hours: 1),
      () async {
        final queryParams = <String, String>{
          'title': track.title,
          'artist': track.artist,
        };
        if (track.album.isNotEmpty && track.album != 'Single') {
          queryParams['album'] = track.album;
        }
        if (track.language.isNotEmpty) queryParams['language'] = track.language;
        if (track.durationSeconds > 0) {
          queryParams['duration'] = track.durationSeconds.toString();
        }
        final res = await _getJson(
          '/api/lyrics/${Uri.encodeComponent(track.id)}',
          query: queryParams,
          timeout: const Duration(seconds: 8),
        );
        final data = res?.data;
        return data is Map ? Map<String, dynamic>.from(data) : null;
      },
      cacheable: (v) => v != null,
    );
  }

  /// Prefetch the next song's lyrics (single request, cached an hour).
  static Future<void> prefetchLyrics(Track track) async {
    try {
      await fetchLyrics(track);
    } catch (_) {}
  }

  /// Call once at app start. Only the home feed is warmed; everything else is
  /// fetched when the user actually opens it.
  static void warmUp() {
    unawaited(fetchHomeShelves());
  }

  static String _titleCase(String s) =>
      s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}
