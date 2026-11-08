// lib/services/innertube_service.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'country_service.dart';
import 'innertube_transport.dart';

// Existing code imports InnerTubeException from this file; keep that working.
export 'innertube_transport.dart' show InnerTubeException;

/// On-device YouTube Music (WEB_REMIX) client.
///
/// All network behaviour (pacing, backoff, circuit breaker, caching, request
/// de-duplication, stale-if-error) lives in [InnerTubeTransport]. This class
/// only builds requests and parses responses.
class InnerTubeService {
  InnerTubeService._();
  static final InnerTubeService instance = InnerTubeService._();

  static const String hl = InnerTubeTransport.hl;

  final InnerTubeTransport _t = InnerTubeTransport.instance;

  // Cache lifetimes. Longer = fewer requests = fewer blocks.
  static const _tSearch = Duration(minutes: 10);
  static const _tSuggest = Duration(minutes: 5);
  static const _tHome = Duration(minutes: 10);
  static const _tCharts = Duration(minutes: 30);
  static const _tReleases = Duration(minutes: 30);
  static const _tArtistCard = Duration(hours: 24);
  static const _tArtistPage = Duration(minutes: 30);
  static const _tNext = Duration(minutes: 5);

  bool get isCoolingDown => _t.coolingDown;
  Duration get cooldownRemaining => _t.cooldownRemaining;
  void clearCache() => _t.clearCache();

  Future<Map<String, dynamic>> post(
    String endpoint,
    Map<String, dynamic> body, {
    String? countryCode,
    Duration ttl = Duration.zero,
    bool forceRefresh = false,
  }) =>
      _t.post(
        endpoint,
        body,
        gl: countryCode ?? CountryService.instance.currentCode,
        ttl: ttl,
        forceRefresh: forceRefresh,
      );

  // ─────────────────────────────── Native Bridge ──────────────────────────────
  static const MethodChannel _nativeChannel = MethodChannel('zenify/innertube');
  bool get _useNative => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<List<Track>> _searchNative(String query) async {
    try {
      final res = await _nativeChannel.invokeMethod<List<dynamic>>('searchSummary', {'query': query});
      if (res == null || res.isEmpty) return const [];
      final tracks = <Track>[];
      final seen = <String>{};
      for (final s in res) {
        if (s is! Map) continue;
        final items = s['items'] as List?;
        if (items == null) continue;
        for (final item in items) {
          if (item is! Map) continue;
          if (item['type'] == 'song') {
            final id = item['id'] as String?;
            if (id == null || id.isEmpty || !seen.add(id)) continue;
            final title = MediaNormalizer.cleanTitle(item['title'] as String?);
            final rawArtists = item['artists'] as List?;
            final artists = MediaNormalizer.formatArtists(rawArtists?.map((a) => (a is Map ? a['name'] : a)).toList());
            final albumName = (item['album'] is Map) ? (item['album']['name'] as String?) : null;
            final album = albumName != null ? MediaNormalizer.cleanTitle(albumName) : 'Single';
            final thumb = MediaNormalizer.upgradeArtworkUrl(item['thumbnail'] as String?, videoId: id);
            final duration = (item['duration'] as num?)?.toInt() ?? 210;
            tracks.add(Track(
              id: 'yt-$id',
              title: title,
              artist: artists,
              album: album,
              coverUrl: thumb,
              durationSeconds: duration,
              language: Track.detectLanguage(title, artists, album) ?? '',
              source: 'youtube',
            ));
          }
        }
      }
      return tracks;
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] Native searchSummary error: $e');
      return const [];
    }
  }

  // ─────────────────────────────── Search ────────────────────────────────────

  static const _songsFilter = 'EgWKAQIIAWoKEAUQAxAEEAkQEQ%3D%3D';

  /// Throws [InnerTubeException] on failure so callers can decide whether a
  /// fallback is appropriate (it is NOT when `rateLimited` is true).
  Future<List<Track>> searchOrThrow(String query) async {
    final q = query.trim();
    if (q.isEmpty) return const [];

    if (_useNative) {
      final nativeTracks = await _searchNative(q);
      if (nativeTracks.isNotEmpty) return nativeTracks;
    }

    final res = await post(
      'search',
      {'query': q, 'params': _songsFilter},
      ttl: _tSearch,
    );
    return _parseSearchTracks(res);
  }

  /// Never throws; returns an empty list on failure.
  Future<List<Track>> search(String query) async {
    try {
      return await searchOrThrow(query);
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] search error: $e');
      return const [];
    }
  }

  List<Track> _parseSearchTracks(Map<String, dynamic> json) {
    final out = <Track>[];
    final seen = <String>{};
    try {
      final sectionList = json['contents']?['tabbedSearchResultsRenderer']
              ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
              ?['contents'] ??
          json['contents']?['sectionListRenderer']?['contents'];
      if (sectionList is! List) return out;

      for (final section in sectionList) {
        if (section is! Map) continue;
        final sMap = Map<String, dynamic>.from(section);

        // 1. Direct musicShelfRenderer
        final shelfItems = sMap['musicShelfRenderer']?['contents'];
        if (shelfItems is List) {
          for (final item in shelfItems) {
            if (item is Map) {
              final t = _parseResponsiveListItem(item['musicResponsiveListItemRenderer']);
              if (t != null && seen.add(t.id)) out.add(t);
            }
          }
        }

        // 2. itemSectionRenderer (wraps search result items in modern YouTube Music responses)
        final isrContents = sMap['itemSectionRenderer']?['contents'];
        if (isrContents is List) {
          for (final it in isrContents) {
            if (it is! Map) continue;
            if (it['musicResponsiveListItemRenderer'] is Map) {
              final t = _parseResponsiveListItem(it['musicResponsiveListItemRenderer']);
              if (t != null && seen.add(t.id)) out.add(t);
            } else if (it['musicShelfRenderer']?['contents'] is List) {
              for (final subIt in (it['musicShelfRenderer']['contents'] as List)) {
                if (subIt is Map) {
                  final t = _parseResponsiveListItem(subIt['musicResponsiveListItemRenderer']);
                  if (t != null && seen.add(t.id)) out.add(t);
                }
              }
            }
          }
        }

        // 3. musicCardShelfRenderer (top card result)
        final card = sMap['musicCardShelfRenderer'];
        if (card is Map) {
          final cardNav = card['title']?['runs']?[0]?['navigationEndpoint'];
          final cardVideoId = cardNav?['watchEndpoint']?['videoId'];
          if (cardVideoId is String && cardVideoId.isNotEmpty) {
            final cardTitle = card['title']?['runs']?[0]?['text'] as String? ?? 'Top Result';
            final subRuns = card['subtitle']?['runs'] as List?;
            final cardArtist = subRuns != null && subRuns.isNotEmpty
                ? (subRuns[0]['text'] ?? 'Artist').toString()
                : 'Artist';
            final thumbs = card['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
            final t = Track(
              id: 'yt-$cardVideoId',
              title: cardTitle,
              artist: cardArtist,
              album: 'Single',
              coverUrl: _cover(thumbs, cardVideoId),
              durationSeconds: 210,
              language: Track.detectLanguage(cardTitle, cardArtist, '') ?? '',
              source: 'youtube',
            );
            if (seen.add(t.id)) out.insert(0, t);
          }
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] parse error: $e');
    }
    return out;
  }

  // ─────────────────────────── Shared item parsers ───────────────────────────

  String _cover(List? thumbs, String? videoId) {
    final raw = (thumbs != null && thumbs.isNotEmpty)
        ? thumbs.last['url'] as String
        : 'https://i.ytimg.com/vi/$videoId/maxresdefault.jpg';
    return upgradeArtworkUrl(raw, videoId: videoId);
  }

  Track? _parseResponsiveListItem(Map<String, dynamic>? item) {
    if (item == null) return null;
    try {
      final nav = item['overlay']?['musicItemThumbnailOverlayRenderer']
          ?['content']?['musicPlayButtonRenderer']?['playNavigationEndpoint'];
      String? videoId = nav?['watchEndpoint']?['videoId'];
      videoId ??= item['navigationEndpoint']?['watchEndpoint']?['videoId'];
      videoId ??= item['playlistItemData']?['videoId'];
      videoId ??= item['doubleTapEndpoint']?['watchEndpoint']?['videoId'];

      final flex = item['flexColumns'] as List?;
      if (flex == null || flex.isEmpty) return null;

      if (videoId == null && flex.isNotEmpty) {
        final flex0 = flex[0];
        final runs = flex0?['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs'] as List?;
        if (runs != null && runs.isNotEmpty && runs[0] is Map) {
          videoId = runs[0]['navigationEndpoint']?['watchEndpoint']?['videoId'];
        }
      }
      if (videoId == null || videoId.isEmpty) return null;

      List? titleRuns;
      if (flex.isNotEmpty && flex[0] is Map) {
        final f0 = flex[0] as Map;
        titleRuns = f0['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs'] as List?;
      }
      List? subRuns;
      if (flex.length > 1 && flex[1] is Map) {
        final f1 = flex[1] as Map;
        subRuns = f1['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs'] as List?;
      }

      final norm = MediaNormalizer.normalize(
        id: 'yt-$videoId',
        titleRuns: titleRuns,
        subtitleRuns: subRuns,
        videoId: videoId,
      );

      int duration = 210;
      if (subRuns != null) {
        for (final r in subRuns) {
          if (r is Map && r['text'] is String) {
            final t = (r['text'] as String).trim();
            if (t.contains(':')) {
              final nums = t.split(':').map(int.tryParse).toList();
              if (nums.every((p) => p != null)) {
                duration = nums.fold(0, (acc, v) => acc * 60 + v!);
              }
            }
          }
        }
      }

      final thumbs = item['thumbnail']?['musicThumbnailRenderer']?['thumbnail']
          ?['thumbnails'] as List?;

      return Track(
        id: norm.id,
        title: norm.title,
        artist: norm.subtitle,
        album: 'Single',
        coverUrl: _cover(thumbs, videoId),
        durationSeconds: duration,
        language: Track.detectLanguage(norm.title, norm.subtitle, 'Single') ?? '',
        source: 'youtube',
      );
    } catch (_) {
      return null;
    }
  }

  Track? _parseTwoRowItem(Map<String, dynamic>? item) {
    if (item == null) return null;
    try {
      final nav = item['navigationEndpoint'] ??
          item['thumbnailOverlay']?['musicItemThumbnailOverlayRenderer']
              ?['content']?['musicPlayButtonRenderer']?['playNavigationEndpoint'];
      final videoId = nav?['watchEndpoint']?['videoId'];
      if (videoId is! String || videoId.isEmpty) return null;

      final titleRuns = item['title']?['runs'] as List?;
      final subRuns = item['subtitle']?['runs'] as List?;
      final thumbs = item['thumbnailRenderer']?['musicThumbnailRenderer']
          ?['thumbnail']?['thumbnails'] as List?;

      final norm = MediaNormalizer.normalize(
        id: 'yt-$videoId',
        titleRuns: titleRuns,
        subtitleRuns: subRuns,
        videoId: videoId,
      );

      return Track(
        id: norm.id,
        title: norm.title,
        artist: norm.subtitle,
        album: 'Single',
        coverUrl: _cover(thumbs, videoId),
        durationSeconds: 210,
        language: Track.detectLanguage(norm.title, norm.subtitle, 'Single') ?? '',
        source: 'youtube',
      );
    } catch (_) {
      return null;
    }
  }

  Track? _parseAnyItem(dynamic item) =>
      _parseResponsiveListItem(item['musicResponsiveListItemRenderer']) ??
      _parseTwoRowItem(item['musicTwoRowItemRenderer']);

  // ────────────────────────────── Suggestions ────────────────────────────────

  Future<List<String>> getSearchSuggestions(String query) async {
    final q = query.trim();
    if (q.isEmpty) return const [];

    if (_useNative) {
      try {
        final list = await _nativeChannel.invokeMethod<List<dynamic>>('searchSuggestions', {'query': q});
        if (list != null && list.isNotEmpty) {
          return list.whereType<String>().toList();
        }
      } catch (_) {}
    }

    try {
      final res = await post('music/get_search_suggestions', {'input': q},
          ttl: _tSuggest);
      final contents = res['contents'] as List?;
      if (contents == null) return const [];

      final out = <String>[];
      for (final c in contents) {
        final rows = c['searchSuggestionsSectionRenderer']?['contents'];
        if (rows is! List) continue;
        for (final item in rows) {
          final runs = item['searchSuggestionRenderer']?['suggestion']?['runs']
              as List?;
          if (runs != null && runs.isNotEmpty) {
            final text = runs.map((r) => r['text'] ?? '').join();
            if (text.isNotEmpty) out.add(text);
          }
        }
      }
      return out;
    } catch (_) {
      return const [];
    }
  }

  // ────────────────────────────── Home feed ──────────────────────────────────

  Future<List<Track>> getHomeFeed({String? countryCode}) async {
    if (_useNative) {
      try {
        final res = await _nativeChannel.invokeMethod<List<dynamic>>('getHomeFeed');
        if (res != null && res.isNotEmpty) {
          final tracks = <Track>[];
          final seen = <String>{};
          for (final sec in res) {
            if (sec is! Map) continue;
            final items = sec['items'] as List? ?? const [];
            for (final it in items) {
              if (it is! Map || it['type'] != 'song') continue;
              final id = it['id'] as String?;
              if (id == null || id.isEmpty || !seen.add(id)) continue;
              tracks.add(Track(
                id: 'yt-$id',
                title: MediaNormalizer.cleanTitle(it['title'] as String?),
                artist: MediaNormalizer.formatArtists((it['artists'] as List?)?.map((a) => a is Map ? a['name'] : a).toList()),
                album: it['album'] is Map ? MediaNormalizer.cleanTitle(it['album']['name'] as String?) : 'Single',
                coverUrl: MediaNormalizer.upgradeArtworkUrl(it['thumbnail'] as String?, videoId: id),
                durationSeconds: (it['duration'] as num?)?.toInt() ?? 210,
                source: 'youtube',
              ));
            }
          }
          if (tracks.isNotEmpty) return tracks;
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getHomeFeed error: $e');
      }
    }

    try {
      final res = await post('browse', {'browseId': 'FEmusic_home'},
          countryCode: countryCode, ttl: _tHome);
      return _collectShelfTracks(res);
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getHomeFeed error: $e');
      return const [];
    }
  }

  List<Track> _collectShelfTracks(Map<String, dynamic> res) {
    final out = <Track>[];
    final seen = <String>{};
    final sections = res['contents']?['singleColumnBrowseResultsRenderer']
        ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
        ?['contents'];
    if (sections is! List) return out;

    for (final section in sections) {
      final items = section['musicCarouselShelfRenderer']?['contents'];
      if (items is! List) continue;
      for (final item in items) {
        final t = _parseAnyItem(item);
        if (t != null && seen.add(t.id)) out.add(t);
      }
    }
    return out;
  }

  // ────────────────────────────── Charts ─────────────────────────────────────

  Future<({List<Track> tracks, List<({String name, String subs, String image})> artists})>
      getCharts({String? countryCode}) async {
    final tracks = <Track>[];
    final artists = <({String name, String subs, String image})>[];

    if (_useNative) {
      try {
        final res = await _nativeChannel.invokeMethod<List<dynamic>>('getCharts', {'countryCode': countryCode ?? CountryService.instance.currentCode});
        if (res != null && res.isNotEmpty) {
          final seen = <String>{};
          for (final sec in res) {
            if (sec is! Map) continue;
            final items = sec['items'] as List? ?? const [];
            for (final it in items) {
              if (it is! Map) continue;
              if (it['type'] == 'song') {
                final id = it['id'] as String?;
                if (id == null || id.isEmpty || !seen.add(id)) continue;
                tracks.add(Track(
                  id: 'yt-$id',
                  title: MediaNormalizer.cleanTitle(it['title'] as String?),
                  artist: MediaNormalizer.formatArtists((it['artists'] as List?)?.map((a) => a is Map ? a['name'] : a).toList()),
                  album: it['album'] is Map ? MediaNormalizer.cleanTitle(it['album']['name'] as String?) : 'Single',
                  coverUrl: MediaNormalizer.upgradeArtworkUrl(it['thumbnail'] as String?, videoId: id),
                  durationSeconds: (it['duration'] as num?)?.toInt() ?? 210,
                  source: 'youtube',
                ));
              } else if (it['type'] == 'artist') {
                final name = MediaNormalizer.cleanTitle(it['title'] as String?);
                final img = MediaNormalizer.upgradeArtworkUrl(it['thumbnail'] as String?);
                if (name.isNotEmpty && !artists.any((a) => a.name.toLowerCase() == name.toLowerCase())) {
                  artists.add((name: name, subs: 'Top Artist', image: img));
                }
              }
            }
          }
          if (tracks.isNotEmpty || artists.isNotEmpty) {
            return (tracks: tracks, artists: artists);
          }
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getCharts error: $e');
      }
    }
    try {
      final res = await post('browse', {'browseId': 'FEmusic_charts'},
          countryCode: countryCode, ttl: _tCharts);

      final sections = res['contents']?['singleColumnBrowseResultsRenderer']
          ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
          ?['contents'];
      if (sections is! List) return (tracks: tracks, artists: artists);

      final seen = <String>{};
      for (final section in sections) {
        final carousel = section['musicCarouselShelfRenderer'];
        if (carousel == null) continue;
        final title = carousel['header']?['musicCarouselShelfBasicHeaderRenderer']
                ?['title']?['runs']?[0]?['text'] as String? ??
            '';
        final contents = carousel['contents'] as List? ?? const [];

        if (title.toLowerCase().contains('artist')) {
          for (final item in contents) {
            final row = item['musicResponsiveListItemRenderer'];
            if (row is! Map) continue;
            final flex = row['flexColumns'] as List? ?? const [];

            String? textOf(int i) {
              if (flex.length <= i || flex[i] is! Map) return null;
              final runs = (flex[i] as Map)[
                      'musicResponsiveListItemFlexColumnRenderer']?['text']
                  ?['runs'] as List?;
              return (runs != null && runs.isNotEmpty && runs[0] is Map)
                  ? runs[0]['text'] as String?
                  : null;
            }

            final name = textOf(0);
            final subs = textOf(1);
            final thumb = (row['thumbnail'] as Map?)?['musicThumbnailRenderer']
                ?['thumbnail']?['thumbnails']?[0]?['url'] as String?;
            if (name != null && name.isNotEmpty && thumb != null) {
              artists.add((
                name: name,
                subs: subs ?? 'Top Artist',
                image: upgradeArtworkUrl(thumb),
              ));
            }
          }
        } else {
          for (final item in contents) {
            final t = _parseAnyItem(item);
            if (t != null && seen.add(t.id)) tracks.add(t);
          }
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getCharts error: $e');
    }
    return (tracks: tracks, artists: artists);
  }

  // ────────────────────────────── New releases ───────────────────────────────

  Future<List<Track>> getNewReleases({String? countryCode}) async {
    try {
      final res = await post('browse', {'browseId': 'FEmusic_new_releases'},
          countryCode: countryCode, ttl: _tReleases);
      return _collectShelfTracks(res);
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getNewReleases error: $e');
      return const [];
    }
  }

  // ────────────────────────────── Artists ────────────────────────────────────

  Future<({String name, String? browseId, String? audience, String? thumb})?>
      searchArtist(String artistName) async {
    final q = artistName.trim();
    if (q.isEmpty) return null;
    try {
      // 1. Check general search for musicCardShelfRenderer or artist responsive list item
      final res = await post('search', {'query': q}, ttl: _tArtistCard);
      final sections = res['contents']?['tabbedSearchResultsRenderer']
              ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
              ?['contents'] ??
          res['contents']?['sectionListRenderer']?['contents'];

      if (sections is List) {
        for (final section in sections) {
          if (section is! Map) continue;

          // 1a. musicCardShelfRenderer (top card result)
          final card = section['musicCardShelfRenderer'];
          if (card is Map) {
            final titleRuns = card['title']?['runs'] as List?;
            var title = q;
            String? browseId;
            if (titleRuns != null && titleRuns.isNotEmpty && titleRuns[0] is Map) {
              final t0 = titleRuns[0] as Map;
              title = t0['text'] as String? ?? q;
              browseId = (t0['navigationEndpoint'] as Map?)?['browseEndpoint']
                  ?['browseId'] as String?;
            }

            final subRuns = card['subtitle']?['runs'] as List?;
            final audience =
                subRuns?.map((r) => r is Map ? (r['text'] ?? '') : '').join();

            final thumbs = card['thumbnail']?['musicThumbnailRenderer']?['thumbnail']
                ?['thumbnails'] as List?;
            String? raw;
            if (thumbs != null && thumbs.isNotEmpty && thumbs.last is Map) {
              raw = (thumbs.last as Map)['url'] as String?;
            }

            if (browseId != null && browseId.isNotEmpty) {
              return (
                name: title,
                browseId: browseId,
                audience: audience,
                thumb: raw != null ? upgradeArtworkUrl(raw) : null,
              );
            }
          }

          // 1b. itemSectionRenderer with artist item
          final isr = section['itemSectionRenderer'];
          if (isr is Map && isr['contents'] is List) {
            for (final it in (isr['contents'] as List)) {
              if (it is! Map) continue;
              final r = it['musicResponsiveListItemRenderer'];
              if (r is! Map) continue;
              final browseEndpoint = r['navigationEndpoint']?['browseEndpoint'];
              final pageType = browseEndpoint?['browseEndpointContextSupportedConfigs']
                  ?['browseEndpointContextMusicConfig']?['pageType']?.toString() ?? '';
              if (pageType == 'MUSIC_PAGE_TYPE_ARTIST') {
                final browseId = browseEndpoint?['browseId'] as String?;
                final flexCols = r['flexColumns'] as List?;
                List? titleRuns;
                if (flexCols != null && flexCols.isNotEmpty && flexCols[0] is Map) {
                  final col0 = flexCols[0] as Map;
                  titleRuns = col0['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs'] as List?;
                }
                final artistTitle = titleRuns?.isNotEmpty == true ? titleRuns![0]['text'] as String? ?? q : q;
                final thumbs = r['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
                final rawThumb = thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String? : null;
                if (browseId != null && browseId.isNotEmpty) {
                  return (
                    name: artistTitle,
                    browseId: browseId,
                    audience: null,
                    thumb: rawThumb != null ? upgradeArtworkUrl(rawThumb) : null,
                  );
                }
              }
            }
          }
        }
      }

      // 2. Filtered Artist Search via InnerTube params ('EgWKAQIgAWoKEAUQAxAEEAkQEQ%3D%3D')
      final artistSearchRes = await post(
        'search',
        {
          'query': q,
          'params': 'EgWKAQIgAWoKEAUQAxAEEAkQEQ%3D%3D',
        },
        ttl: _tArtistCard,
      );

      final artistSections = artistSearchRes['contents']?['tabbedSearchResultsRenderer']
              ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
              ?['contents'] ??
          artistSearchRes['contents']?['sectionListRenderer']?['contents'];

      if (artistSections is List && artistSections.isNotEmpty) {
        for (final sec in artistSections) {
          if (sec is! Map) continue;
          final items = <dynamic>[];
          if (sec['musicShelfRenderer']?['contents'] is List) {
            items.addAll(sec['musicShelfRenderer']['contents'] as List);
          }
          if (sec['itemSectionRenderer']?['contents'] is List) {
            items.addAll(sec['itemSectionRenderer']['contents'] as List);
          }

          for (final item in items) {
            if (item is! Map) continue;
            final r = item['musicResponsiveListItemRenderer'];
            if (r == null) continue;
            final flexCols = r['flexColumns'] as List?;
            final titleCol = flexCols?.firstWhere(
              (c) => c['musicResponsiveListItemFlexColumnRenderer'] != null,
              orElse: () => null,
            );
            final titleRuns = titleCol?['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs'] as List?;
            final artistTitle = titleRuns?.isNotEmpty == true ? titleRuns![0]['text'] as String? ?? q : q;
            final browseId = r['navigationEndpoint']?['browseEndpoint']?['browseId'] as String?;
            final thumbs = r['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
            final rawThumb = thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String? : null;

            if (browseId != null && browseId.isNotEmpty) {
              return (
                name: artistTitle,
                browseId: browseId,
                audience: null,
                thumb: rawThumb != null ? upgradeArtworkUrl(rawThumb) : null,
              );
            }
          }
        }
      }

      return null;
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] searchArtist error: $e');
      return null;
    }
  }

  Map<String, dynamic>? _twoRowCard(dynamic item) {
    final row = item['musicTwoRowItemRenderer'];
    if (row == null) return null;
    final titleRuns = row['title']?['runs'] as List?;
    final subRuns = row['subtitle']?['runs'] as List?;
    final rawCover = row['thumbnailRenderer']?['musicThumbnailRenderer']
        ?['thumbnail']?['thumbnails']?.last['url'] as String?;
    final browseId = row['navigationEndpoint']?['browseEndpoint']?['browseId'] as String?;

    final norm = MediaNormalizer.normalize(
      id: browseId ?? '',
      titleRuns: titleRuns,
      subtitleRuns: subRuns,
      rawImageUrl: rawCover,
      defaultType: 'album',
    );

    return {
      'title': norm.title,
      'subtitle': norm.subtitle,
      'browseId': browseId,
      'coverUrl': norm.imageUrl,
    };
  }

  Future<Map<String, dynamic>?> getArtistChannel(String browseId) async {
    if (_useNative) {
      try {
        final res = await _nativeChannel.invokeMethod<Map<dynamic, dynamic>>('getArtist', {'browseId': browseId});
        if (res != null && res.isNotEmpty) {
          final artistMap = Map<String, dynamic>.from(res['artist'] as Map? ?? {});
          final name = MediaNormalizer.cleanTitle(artistMap['title'] as String?);
          final rawThumb = artistMap['thumbnail'] as String?;
          final thumb = rawThumb != null ? MediaNormalizer.upgradeArtworkUrl(rawThumb) : null;
          final bio = res['description'] as String?;
          final subscriberCount = res['subscriberCountText'] as String?;

          final topSongs = <Track>[];
          final albums = <Map<String, dynamic>>[];
          final singles = <Map<String, dynamic>>[];
          final playlists = <Map<String, dynamic>>[];
          final related = <Map<String, dynamic>>[];

          final sections = res['sections'] as List? ?? const [];
          for (final sec in sections) {
            if (sec is! Map) continue;
            final title = (sec['title'] ?? '').toString().toLowerCase();
            final items = sec['items'] as List? ?? const [];

            if (title.contains('song') || title.contains('top') || title.contains('popular') || title.contains('track')) {
              for (final it in items) {
                if (it is! Map || it['type'] != 'song') continue;
                final id = it['id'] as String?;
                if (id == null || id.isEmpty) continue;
                topSongs.add(Track(
                  id: 'yt-$id',
                  title: MediaNormalizer.cleanTitle(it['title'] as String?),
                  artist: MediaNormalizer.formatArtists((it['artists'] as List?)?.map((a) => a is Map ? a['name'] : a).toList()),
                  album: it['album'] is Map ? MediaNormalizer.cleanTitle(it['album']['name'] as String?) : 'Single',
                  coverUrl: MediaNormalizer.upgradeArtworkUrl(it['thumbnail'] as String?, videoId: id),
                  durationSeconds: (it['duration'] as num?)?.toInt() ?? 210,
                  source: 'youtube',
                ));
              }
            } else if (title.contains('album')) {
              for (final it in items) {
                if (it is! Map) continue;
                albums.add({
                  'title': MediaNormalizer.cleanTitle(it['title'] as String?),
                  'year': it['year']?.toString() ?? '',
                  'browseId': it['browseId'] ?? it['id'],
                  'coverUrl': MediaNormalizer.upgradeArtworkUrl(it['thumbnail'] as String?),
                });
              }
            } else if (title.contains('single') || title.contains('ep')) {
              for (final it in items) {
                if (it is! Map) continue;
                singles.add({
                  'title': MediaNormalizer.cleanTitle(it['title'] as String?),
                  'year': it['year']?.toString() ?? '',
                  'browseId': it['browseId'] ?? it['id'],
                  'coverUrl': MediaNormalizer.upgradeArtworkUrl(it['thumbnail'] as String?),
                });
              }
            } else if (title.contains('playlist')) {
              for (final it in items) {
                if (it is! Map) continue;
                playlists.add({
                  'title': MediaNormalizer.cleanTitle(it['title'] as String?),
                  'browseId': it['id'],
                  'coverUrl': MediaNormalizer.upgradeArtworkUrl(it['thumbnail'] as String?),
                });
              }
            } else if (title.contains('related') || title.contains('similar') || title.contains('fans might')) {
              for (final it in items) {
                if (it is! Map) continue;
                related.add({
                  'name': MediaNormalizer.cleanTitle(it['title'] as String?),
                  'subs': 'Artist',
                  'imageUrl': MediaNormalizer.upgradeArtworkUrl(it['thumbnail'] as String?),
                  'browseId': it['id'],
                });
              }
            }
          }

          return {
            'name': name,
            'bio': bio,
            'subscriberCount': subscriberCount,
            'thumb': thumb,
            'topSongs': topSongs,
            'albums': albums,
            'singles': singles,
            'playlists': playlists,
            'related': related,
          };
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getArtist error: $e');
      }
    }
    try {
      final res = await post('browse', {'browseId': browseId}, ttl: _tArtistPage);
      final sections = res['contents']?['singleColumnBrowseResultsRenderer']
              ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
              ?['contents'] ??
          res['contents']?['sectionListRenderer']?['contents'];

      var header = res['header']?['musicImmersiveHeaderRenderer'] ??
          res['header']?['musicVisualHeaderRenderer'] ??
          res['header']?['musicHeaderRenderer'] ??
          res['header']?['musicResponsiveHeaderRenderer'];

      if (header == null && sections is List && sections.isNotEmpty) {
        final sec0 = sections[0];
        if (sec0 is Map) {
          header = sec0['musicResponsiveHeaderRenderer'] ?? sec0['musicVisualHeaderRenderer'];
        }
      }

      final thumbs = header?['thumbnail']?['musicThumbnailRenderer']
              ?['thumbnail']?['thumbnails'] as List? ??
          header?['thumbnail']?['croppedSquareThumbnailRenderer']
              ?['thumbnail']?['thumbnails'] as List? ??
          header?['foregroundThumbnail']?['musicThumbnailRenderer']
              ?['thumbnail']?['thumbnails'] as List? ??
          header?['straplineThumbnail']?['musicThumbnailRenderer']
              ?['thumbnail']?['thumbnails'] as List? ??
          header?['thumbnail']?['thumbnails'] as List?;
      final rawThumb =
          thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String : null;

      final topSongs = <Track>[];
      final albums = <Map<String, dynamic>>[];
      final singles = <Map<String, dynamic>>[];
      final playlists = <Map<String, dynamic>>[];
      final related = <Map<String, dynamic>>[];

      if (sections is List) {
        for (final section in sections) {
          if (section is! Map) continue;
          final shelf = section['musicShelfRenderer'] ??
              section['musicCarouselShelfRenderer'];
          if (shelf == null) continue;

          final shelfTitle = (shelf['title']?['runs']?[0]?['text'] ??
                  shelf['header']?['musicCarouselShelfBasicHeaderRenderer']
                      ?['title']?['runs']?[0]?['text'] ??
                  '')
              .toString()
              .toLowerCase();
          final contents = shelf['contents'] as List? ?? const [];

          final isSongShelf = shelfTitle.contains('song') ||
              shelfTitle.contains('popular') ||
              shelfTitle.contains('top') ||
              shelfTitle.contains('track') ||
              (topSongs.isEmpty && shelf.containsKey('contents'));

          if (isSongShelf) {
            for (final item in contents) {
              final t = _parseResponsiveListItem(
                  item['musicResponsiveListItemRenderer']);
              if (t != null) topSongs.add(t);
            }

            // Follow shelf "More" / "See All" browse endpoint to get full songs list
            final moreEndpoint = shelf['bottomEndpoint']?['browseEndpoint'] ??
                shelf['header']?['musicCarouselShelfBasicHeaderRenderer']
                    ?['moreContentButton']?['buttonRenderer']
                    ?['navigationEndpoint']?['browseEndpoint'];
            final moreBrowseId = moreEndpoint?['browseId'] as String?;
            final moreParams = moreEndpoint?['params'] as String?;
            if (moreBrowseId != null && topSongs.length < 25) {
              try {
                final moreBody = <String, dynamic>{'browseId': moreBrowseId};
                if (moreParams != null) moreBody['params'] = moreParams;
                final moreRes = await post('browse', moreBody, ttl: _tArtistPage);
                final moreContents = moreRes['contents']?['singleColumnBrowseResultsRenderer']
                        ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
                        ?['contents'] ??
                    moreRes['contents']?['sectionListRenderer']?['contents'];
                if (moreContents is List) {
                  for (final sec in moreContents) {
                    final items = sec['musicShelfRenderer']?['contents'] ??
                        sec['musicPlaylistShelfRenderer']?['contents'];
                    if (items is List) {
                      for (final it in items) {
                        final t = _parseResponsiveListItem(it['musicResponsiveListItemRenderer']);
                        if (t != null && !topSongs.any((s) => s.id == t.id)) {
                          topSongs.add(t);
                        }
                      }
                    }
                  }
                }
              } catch (_) {}
            }
          } else if (shelfTitle.contains('album')) {
            for (final item in contents) {
              final c = _twoRowCard(item);
              if (c != null) {
                albums.add({
                  'title': c['title'] ?? 'Album',
                  'year': c['subtitle'],
                  'browseId': c['browseId'],
                  'coverUrl': c['coverUrl'],
                });
              }
            }

            // Follow shelf "More" browse endpoint to get full album catalog
            final moreAlbumEndpoint = shelf['bottomEndpoint']?['browseEndpoint'] ??
                shelf['header']?['musicCarouselShelfBasicHeaderRenderer']
                    ?['moreContentButton']?['buttonRenderer']
                    ?['navigationEndpoint']?['browseEndpoint'];
            final moreAlbumBrowseId = moreAlbumEndpoint?['browseId'] as String?;
            final moreAlbumParams = moreAlbumEndpoint?['params'] as String?;
            if (moreAlbumBrowseId != null && albums.length < 15) {
              try {
                final moreBody = <String, dynamic>{'browseId': moreAlbumBrowseId};
                if (moreAlbumParams != null) moreBody['params'] = moreAlbumParams;
                final moreRes = await post('browse', moreBody, ttl: _tArtistPage);
                final moreContents = moreRes['contents']?['singleColumnBrowseResultsRenderer']
                        ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
                        ?['contents'] ??
                    moreRes['contents']?['sectionListRenderer']?['contents'];
                if (moreContents is List) {
                  for (final sec in moreContents) {
                    final items = sec['gridRenderer']?['items'] ??
                        sec['musicShelfRenderer']?['contents'] ??
                        sec['musicCarouselShelfRenderer']?['contents'];
                    if (items is List) {
                      for (final it in items) {
                        final c = _twoRowCard(it);
                        if (c != null && !albums.any((a) => a['browseId'] == c['browseId'])) {
                          albums.add({
                            'title': c['title'] ?? 'Album',
                            'year': c['subtitle'],
                            'browseId': c['browseId'],
                            'coverUrl': c['coverUrl'],
                          });
                        }
                      }
                    }
                  }
                }
              } catch (_) {}
            }
          } else if (shelfTitle.contains('single') ||
              shelfTitle.contains('ep')) {
            for (final item in contents) {
              final c = _twoRowCard(item);
              if (c != null) {
                singles.add({
                  'title': c['title'] ?? 'Single',
                  'year': c['subtitle'],
                  'browseId': c['browseId'],
                  'coverUrl': c['coverUrl'],
                });
              }
            }
          } else if (shelfTitle.contains('featured on') ||
              shelfTitle.contains('playlist')) {
            for (final item in contents) {
              final c = _twoRowCard(item);
              if (c != null) {
                playlists.add({
                  'title': c['title'] ?? 'Playlist',
                  'browseId': c['browseId'],
                  'coverUrl': c['coverUrl'],
                });
              }
            }
          } else if (shelfTitle.contains('fans might') ||
              shelfTitle.contains('similar') ||
              shelfTitle.contains('artist')) {
            for (final item in contents) {
              final c = _twoRowCard(item);
              if (c != null) {
                related.add({
                  'name': c['title'] ?? 'Artist',
                  'subs': (c['subtitle'] as String).isEmpty
                      ? 'Artist'
                      : c['subtitle'],
                  'imageUrl': c['coverUrl'],
                  'browseId': c['browseId'],
                });
              }
            }
          }
        }
      }

      return {
        'name': header?['title']?['runs']?[0]?['text'] as String? ?? 'Artist',
        'bio': header?['description']?['runs']?[0]?['text'] as String?,
        'subscriberCount': header?['subscriptionButton']
                ?['subscribeButtonRenderer']?['subscriberCountText']?['runs']
            ?[0]?['text'] as String?,
        'thumb': rawThumb != null ? upgradeArtworkUrl(rawThumb) : null,
        'topSongs': topSongs,
        'albums': albums,
        'singles': singles,
        'playlists': playlists,
        'related': related,
      };
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getArtistChannel error: $e');
      return null;
    }
  }

  /// Fetches full album tracklist and metadata from YouTube Music browseId.
  Future<({List<Track> tracks, String coverUrl})?> getAlbum(String browseId) async {
    if (_useNative) {
      try {
        final res = await _nativeChannel.invokeMethod<Map<dynamic, dynamic>>('getAlbum', {'browseId': browseId});
        if (res != null && res.isNotEmpty) {
          final albumMap = Map<String, dynamic>.from(res['album'] as Map? ?? {});
          final albumTitle = MediaNormalizer.cleanTitle(albumMap['title'] as String?);
          final coverUrl = MediaNormalizer.upgradeArtworkUrl(albumMap['thumbnail'] as String?);
          final rawSongs = res['songs'] as List? ?? const [];
          final tracks = <Track>[];
          for (final s in rawSongs) {
            if (s is! Map) continue;
            final id = s['id'] as String?;
            if (id == null || id.isEmpty) continue;
            tracks.add(Track(
              id: 'yt-$id',
              title: MediaNormalizer.cleanTitle(s['title'] as String?),
              artist: MediaNormalizer.formatArtists((s['artists'] as List?)?.map((a) => a is Map ? a['name'] : a).toList()),
              album: albumTitle.isNotEmpty ? albumTitle : 'Single',
              coverUrl: MediaNormalizer.upgradeArtworkUrl(s['thumbnail'] as String?, videoId: id),
              durationSeconds: (s['duration'] as num?)?.toInt() ?? 210,
              source: 'youtube',
            ));
          }
          if (tracks.isNotEmpty) {
            return (tracks: tracks, coverUrl: coverUrl);
          }
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getAlbum error: $e');
      }
    }

    try {
      final res = await post('browse', {'browseId': browseId}, ttl: const Duration(hours: 12));
      final header = res['header']?['musicDetailHeaderRenderer'] ??
          res['header']?['musicResponsiveHeaderRenderer'];

      String coverUrl = '';
      final thumbs = (header?['thumbnail']?['croppedSquareThumbnailRenderer']?['thumbnail']?['thumbnails'] ??
              header?['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']) as List?;
      if (thumbs != null && thumbs.isNotEmpty) {
        coverUrl = upgradeArtworkUrl(thumbs.last['url'] as String);
      }

      final albumTitle = (header?['title']?['runs']?[0]?['text'] ?? '').toString();

      final tracks = <Track>[];
      final sectionList = res['contents']?['singleColumnBrowseResultsRenderer']
          ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
          ?['contents'] as List?;

      if (sectionList != null && sectionList.isNotEmpty) {
        for (final sec in sectionList) {
          final shelf = sec['musicShelfRenderer'] ?? sec['musicPlaylistShelfRenderer'];
          final contents = shelf?['contents'] as List?;
          if (contents != null) {
            for (final item in contents) {
              final t = _parseResponsiveListItem(item['musicResponsiveListItemRenderer']);
              if (t != null) {
                if (albumTitle.isNotEmpty && (t.album == 'Single' || t.album.isEmpty)) {
                  tracks.add(t.copyWith(album: albumTitle));
                } else {
                  tracks.add(t);
                }
              }
            }
          }
        }
      }

      return (tracks: tracks, coverUrl: coverUrl);
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getAlbum error: $e');
      return null;
    }
  }

  // ────────────────────────────── Next / radio ───────────────────────────────

  Future<List<Track>> getNextQueue(String videoId) async {
    final cleanId = videoId.replaceFirst('yt-', '');
    try {
      final res = await post(
        'next',
        {
          'videoId': cleanId,
          'playlistId': 'RDAMVM$cleanId',
          'isAudioOnly': true,
        },
        ttl: _tNext,
      );

      final out = <Track>[];
      final tabs = res['contents']?['singleColumnMusicWatchNextResultsRenderer']
          ?['tabbedRenderer']?['watchNextTabbedResultsRenderer']?['tabs'];
      if (tabs is! List || tabs.isEmpty) return out;

      final queue = tabs[0]?['tabRenderer']?['content']?['musicQueueRenderer']
          ?['content']?['playlistPanelRenderer']?['contents'];
      if (queue is! List) return out;

      for (final item in queue) {
        final p = item['playlistPanelVideoRenderer'];
        if (p == null) continue;
        final id = p['videoId'] as String?;
        if (id == null || id.isEmpty) continue;

        final titleRuns = p['title']?['runs'] as List?;
        final title = titleRuns?.isNotEmpty == true
            ? titleRuns![0]['text'] as String
            : 'Unknown Track';
        final byline = p['longBylineText']?['runs'] as List?;
        final artist = (byline != null && byline.isNotEmpty)
            ? (byline[0]['text'] ?? 'Unknown Artist').toString()
            : 'Unknown Artist';

        out.add(Track(
          id: 'yt-$id',
          title: title,
          artist: artist,
          album: 'Single',
          coverUrl: _cover(p['thumbnail']?['thumbnails'] as List?, id),
          durationSeconds: 210,
          language: Track.detectLanguage(title, artist, 'Single') ?? '',
          source: 'youtube',
        ));
      }
      return out;
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getNextQueue error: $e');
      return const [];
    }
  }

  Future<List<Track>> fetchRelated(Track seed) => getNextQueue(seed.id);

  // ────────────────────────────── Lyrics ─────────────────────────────────────

  Future<String?> getLyrics(String videoId) async {
    final cleanId = videoId.replaceFirst('yt-', '');
    try {
      final nextRes = await post('next', {'videoId': cleanId}, ttl: const Duration(hours: 12));
      final tabs = nextRes['contents']?['singleColumnMusicWatchNextResultsRenderer']
          ?['tabbedRenderer']?['watchNextTabbedResultsRenderer']?['tabs'];
      if (tabs is! List) return null;

      String? lyricsBrowseId;
      for (final t in tabs) {
        final tr = t?['tabRenderer'];
        final title = (tr?['title'] ?? '').toString().toLowerCase();
        final bId = tr?['endpoint']?['browseEndpoint']?['browseId'] as String?;
        if ((title.contains('lyric') || bId != null) && bId != null) {
          lyricsBrowseId = bId;
          break;
        }
      }

      if (lyricsBrowseId == null || lyricsBrowseId.isEmpty) return null;

      final browseRes = await post('browse', {'browseId': lyricsBrowseId}, ttl: const Duration(days: 7));
      final shelf = browseRes['contents']?['sectionListRenderer']?['contents']?[0]?['musicDescriptionShelfRenderer'];
      final runs = shelf?['description']?['runs'] as List?;
      if (runs != null && runs.isNotEmpty) {
        final text = runs.map((r) => r['text'] ?? '').join().trim();
        if (text.isNotEmpty) return text;
      }
      return null;
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getLyrics error: $e');
      return null;
    }
  }
}
