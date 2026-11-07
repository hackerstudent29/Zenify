// lib/services/innertube_service.dart
import 'package:flutter/foundation.dart';

import '../models/track.dart';
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

  // ─────────────────────────────── Search ────────────────────────────────────

  static const _songsFilter = 'EgWKAQIIAWoKEAUQAxAEEAkQEQ%3D%3D';

  /// Throws [InnerTubeException] on failure so callers can decide whether a
  /// fallback is appropriate (it is NOT when `rateLimited` is true).
  Future<List<Track>> searchOrThrow(String query) async {
    final q = query.trim();
    if (q.isEmpty) return const [];
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
    try {
      final sectionList = json['contents']?['tabbedSearchResultsRenderer']
          ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
          ?['contents'];
      if (sectionList is! List) return out;

      for (final section in sectionList) {
        final items = section['musicShelfRenderer']?['contents'];
        if (items is! List) continue;
        for (final item in items) {
          final t = _parseResponsiveListItem(
              item['musicResponsiveListItemRenderer']);
          if (t != null) out.add(t);
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
      videoId ??= item['playlistItemData']?['videoId'];
      if (videoId == null || videoId.isEmpty) return null;

      final flex = item['flexColumns'] as List?;
      if (flex == null || flex.isEmpty) return null;

      final titleRuns = flex[0]?['musicResponsiveListItemFlexColumnRenderer']
          ?['text']?['runs'] as List?;
      final title = titleRuns?.isNotEmpty == true
          ? titleRuns![0]['text'] as String
          : 'Unknown Track';

      String artist = 'Unknown Artist';
      String album = 'Single';
      int duration = 210;

      if (flex.length > 1) {
        final subRuns = flex[1]?['musicResponsiveListItemFlexColumnRenderer']
            ?['text']?['runs'] as List?;
        if (subRuns != null && subRuns.isNotEmpty) {
          final parts = subRuns
              .map((r) => (r['text'] ?? '').toString())
              .where((s) => s != ' • ' && s.trim().isNotEmpty)
              .toList();
          if (parts.isNotEmpty) artist = parts[0];
          if (parts.length > 1) album = parts[1];
          final last = parts.last;
          if (last.contains(':')) {
            final nums = last.split(':').map(int.tryParse).toList();
            if (nums.every((p) => p != null)) {
              duration = nums.fold(0, (acc, v) => acc * 60 + v!);
            }
          }
        }
      }

      final thumbs = item['thumbnail']?['musicThumbnailRenderer']?['thumbnail']
          ?['thumbnails'] as List?;

      return Track(
        id: 'yt-$videoId',
        title: title,
        artist: artist,
        album: album,
        coverUrl: _cover(thumbs, videoId),
        durationSeconds: duration,
        language: Track.detectLanguage(title, artist, album) ?? '',
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
      final title = titleRuns?.isNotEmpty == true
          ? titleRuns![0]['text'] as String
          : 'Unknown Track';

      final subRuns = item['subtitle']?['runs'] as List?;
      final artist = (subRuns != null && subRuns.isNotEmpty)
          ? (subRuns[0]['text'] ?? 'Unknown Artist').toString()
          : 'Unknown Artist';

      final thumbs = item['thumbnailRenderer']?['musicThumbnailRenderer']
          ?['thumbnail']?['thumbnails'] as List?;

      return Track(
        id: 'yt-$videoId',
        title: title,
        artist: artist,
        album: 'Single',
        coverUrl: _cover(thumbs, videoId),
        durationSeconds: 210,
        language: Track.detectLanguage(title, artist, 'Single') ?? '',
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
      final res = await post('search', {'query': q}, ttl: _tArtistCard);
      final sections = res['contents']?['tabbedSearchResultsRenderer']
          ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
          ?['contents'];
      if (sections is! List) return null;

      for (final section in sections) {
        final card = section['musicCardShelfRenderer'];
        if (card is! Map) continue;

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

        return (
          name: title,
          browseId: browseId,
          audience: audience,
          thumb: raw != null ? upgradeArtworkUrl(raw) : null,
        );
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
    final rawCover = row['thumbnailRenderer']?['musicThumbnailRenderer']
        ?['thumbnail']?['thumbnails']?.last['url'] as String?;
    return {
      'title': row['title']?['runs']?[0]?['text'] as String?,
      'subtitle': row['subtitle']?['runs']?.map((r) => r['text']).join(' ') ?? '',
      'browseId': row['navigationEndpoint']?['browseEndpoint']?['browseId']
          as String?,
      'coverUrl': rawCover != null ? upgradeArtworkUrl(rawCover) : '',
    };
  }

  Future<Map<String, dynamic>?> getArtistChannel(String browseId) async {
    try {
      final res = await post('browse', {'browseId': browseId}, ttl: _tArtistPage);
      final header = res['header']?['musicImmersiveHeaderRenderer'] ??
          res['header']?['musicVisualHeaderRenderer'];

      final thumbs = header?['thumbnail']?['musicThumbnailRenderer']
          ?['thumbnail']?['thumbnails'] as List?;
      final rawThumb =
          thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String : null;

      final topSongs = <Track>[];
      final albums = <Map<String, dynamic>>[];
      final singles = <Map<String, dynamic>>[];
      final playlists = <Map<String, dynamic>>[];
      final related = <Map<String, dynamic>>[];

      final sections = res['contents']?['singleColumnBrowseResultsRenderer']
          ?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']
          ?['contents'];

      if (sections is List) {
        for (final section in sections) {
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

          if (shelfTitle.contains('top song') ||
              shelfTitle.contains('popular')) {
            for (final item in contents) {
              final t = _parseResponsiveListItem(
                  item['musicResponsiveListItemRenderer']);
              if (t != null) topSongs.add(t);
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
}
