// lib/services/innertube_service.dart
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../models/artist_ref.dart';
import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'album_resolver.dart';
import 'country_service.dart';
import 'innertube_transport.dart';
import 'settings_service.dart';

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

  static String? _extractAlbumBrowseIdFromMap(dynamic rawAlbum) {
    if (rawAlbum is! Map) return null;
    final id = (rawAlbum['id'] ?? rawAlbum['browseId'])?.toString();
    return AlbumResolver.sanitizeAlbumBrowseId(id);
  }

  static List<ArtistRef> parseArtistRefs(
    List? rawArtists, [
    String? fallbackString,
  ]) {
    final refs = <ArtistRef>[];
    if (rawArtists != null) {
      for (final a in rawArtists) {
        if (a is Map) {
          final aName = (a['name'] as String?)?.trim();
          final aId = (a['id'] as String?)?.trim();
          if (aName != null && aName.isNotEmpty) {
            final split = ArtistRef.splitFromName(aName);
            if (split.length > 1) {
              refs.addAll(split);
            } else if (split.length == 1) {
              refs.add(ArtistRef.fromName(split.first.name, id: aId));
            } else {
              refs.add(ArtistRef.fromName(aName, id: aId ?? ''));
            }
          }
        } else if (a is String && a.trim().isNotEmpty) {
          refs.addAll(ArtistRef.splitFromName(a));
        } else if (a is ArtistRef) {
          refs.addAll(
            ArtistRef.splitFromName(a.name, defaultImageUrl: a.imageUrl),
          );
        }
      }
    }
    if (refs.isEmpty &&
        fallbackString != null &&
        fallbackString.trim().isNotEmpty) {
      refs.addAll(ArtistRef.splitFromName(fallbackString));
    }
    return refs;
  }

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

  ({List<ReleaseSummary> albums, List<ReleaseSummary> singles})?
  _homeReleasesCache;
  DateTime? _homeReleasesExpires;

  bool get isCoolingDown => _t.coolingDown;
  Duration get cooldownRemaining => _t.cooldownRemaining;
  void clearCache() {
    _homeReleasesCache = null;
    _homeReleasesExpires = null;
    AlbumResolver.clearCache();
    _t.clearCache();
  }

  Future<Map<String, dynamic>> post(
    String endpoint,
    Map<String, dynamic> body, {
    String? countryCode,
    Duration ttl = Duration.zero,
    bool forceRefresh = false,
  }) => _t.post(
    endpoint,
    body,
    gl: countryCode ?? CountryService.instance.currentCode,
    ttl: ttl,
    forceRefresh: forceRefresh,
  );

  // ─────────────────────────────── Native Bridge ──────────────────────────────
  static const MethodChannel _nativeChannel = MethodChannel('zenify/innertube');
  bool get _useNative =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  bool get isNativeAvailable => _useNative;

  /// Resolves direct audio/video stream URL and HTTP headers via Android InnerTube pipeline.
  Future<
    ({
      String url,
      String? videoUrl,
      int? videoHeight,
      bool isHls,
      Map<String, String> headers,
      int? itag,
      int? contentLength,
    })?
  >
  getStreamUrl(
    String videoId, {
    String? quality,
    bool wantVideo = false,
    int? maxVideoHeight,
    bool allowHls = true,
  }) async {
    if (!_useNative) return null;
    try {
      final res = await _nativeChannel
          .invokeMapMethod<String, dynamic>('getStreamUrl', {
            'videoId': videoId,
            'quality': quality ?? SettingsState.instance.audioQuality,
            if (wantVideo) 'wantVideo': true,
            if (maxVideoHeight != null) 'maxVideoHeight': maxVideoHeight,
            if (!allowHls) 'allowHls': false,
          });
      if (res == null) return null;
      final rawUrl = res['url'] as String?;
      if (rawUrl == null || rawUrl.isEmpty) return null;

      final rawHeaders =
          (res['headers'] as Map?)?.cast<String, String>() ??
          <String, String>{};
      final itag = (res['itag'] as num?)?.toInt();
      final contentLength = (res['contentLength'] as num?)?.toInt();
      final videoUrl = res['videoUrl'] as String?;
      final videoHeight = (res['videoHeight'] as num?)?.toInt();
      final isHls = res['isHls'] == true;

      return (
        url: rawUrl,
        videoUrl: videoUrl,
        videoHeight: videoHeight,
        isHls: isHls,
        headers: rawHeaders,
        itag: itag,
        contentLength: contentLength,
      );
    } catch (e) {
      debugPrint('[InnerTube] getStreamUrl error for $videoId: $e');
      return null;
    }
  }

  Future<List<Track>> searchSongsNative(String query) async {
    if (!_useNative) return const [];
    try {
      final res = await _nativeChannel
          .invokeMethod<List<dynamic>>('searchSongs', {'query': query})
          .timeout(const Duration(seconds: 14), onTimeout: () => null);
      if (res == null || res.isEmpty) return const [];
      final tracks = <Track>[];
      final seen = <String>{};
      for (final item in res) {
        if (item is! Map) continue;
        final id = item['id'] as String?;
        if (id == null || id.isEmpty || !seen.add(id)) continue;
        final rawTitle = item['title'] as String?;
        final title = MediaNormalizer.cleanTitle(rawTitle);
        final rawArtists = item['artists'] as List?;
        final artistRefs = parseArtistRefs(rawArtists);
        final artists = artistRefs.isNotEmpty
            ? ArtistRef.formatList(artistRefs)
            : MediaNormalizer.formatArtists(
                rawArtists?.map((a) => (a is Map ? a['name'] : a)).toList(),
              );
        final albumMap = (item['album'] is Map) ? (item['album'] as Map) : null;
        final albumName = albumMap?['name'] as String?;
        final albumBrowseId = albumMap?['id'] as String?;
        final album = MediaNormalizer.resolveTrackAlbum(
          albumName,
          rawTitle: rawTitle,
        );
        final thumb = MediaNormalizer.upgradeArtworkUrl(
          item['thumbnail'] as String?,
          videoId: id,
        );
        final duration = (item['duration'] as num?)?.toInt() ?? 210;
        tracks.add(
          Track(
            id: 'yt-$id',
            title: title,
            artist: artists,
            artists: artistRefs,
            album: album,
            albumBrowseId: albumBrowseId,
            coverUrl: thumb,
            durationSeconds: duration,
            language: Track.detectLanguage(title, artists, album) ?? '',
            source: 'youtube',
          ),
        );
      }
      return tracks;
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] Native searchSongs error: $e');
      return const [];
    }
  }

  Future<Map<String, dynamic>?> searchSummaryNative(String query) async {
    if (!_useNative) return null;
    try {
      final res = await _nativeChannel
          .invokeMethod<List<dynamic>>('searchSummary', {'query': query})
          .timeout(const Duration(seconds: 14), onTimeout: () => null);
      if (res == null || res.isEmpty) return null;
      return {'summaries': res};
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] Native searchSummary error: $e');
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> searchAlbumsNative(String query) async {
    if (!_useNative) return const [];
    try {
      final res = await _nativeChannel
          .invokeMethod<List<dynamic>>('searchAlbums', {'query': query})
          .timeout(const Duration(seconds: 14), onTimeout: () => null);
      if (res == null || res.isEmpty) return const [];
      return res
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] Native searchAlbums error: $e');
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> searchArtistsNative(String query) async {
    if (!_useNative) return const [];
    try {
      final res = await _nativeChannel
          .invokeMethod<List<dynamic>>('searchArtists', {'query': query})
          .timeout(const Duration(seconds: 14), onTimeout: () => null);
      if (res == null || res.isEmpty) return const [];
      return res
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] Native searchArtists error: $e');
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> searchPlaylistsNative(String query) async {
    if (!_useNative) return const [];
    try {
      final res = await _nativeChannel
          .invokeMethod<List<dynamic>>('searchPlaylists', {'query': query})
          .timeout(const Duration(seconds: 14), onTimeout: () => null);
      if (res == null || res.isEmpty) return const [];
      return res
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
    } catch (e) {
      if (kDebugMode)
        debugPrint('[InnerTube] Native searchPlaylists error: $e');
      return const [];
    }
  }

  Future<List<Map<String, dynamic>>> searchVideosNative(String query) async {
    if (!_useNative) return const [];
    try {
      final res = await _nativeChannel
          .invokeMethod<List<dynamic>>('searchVideos', {'query': query})
          .timeout(const Duration(seconds: 14), onTimeout: () => null);
      if (res == null || res.isEmpty) return const [];
      return res
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] Native searchVideos error: $e');
      return const [];
    }
  }

  Future<List<Track>> _searchNative(String query) async {
    try {
      final directSongs = await searchSongsNative(query);
      if (directSongs.isNotEmpty) return directSongs;

      final res = await _nativeChannel
          .invokeMethod<List<dynamic>>('searchSummary', {'query': query})
          .timeout(const Duration(seconds: 4), onTimeout: () => null);
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
            final rawTitle = item['title'] as String?;
            final title = MediaNormalizer.cleanTitle(rawTitle);
            final rawArtists = item['artists'] as List?;
            final artistRefs = parseArtistRefs(rawArtists);
            final artists = artistRefs.isNotEmpty
                ? ArtistRef.formatList(artistRefs)
                : MediaNormalizer.formatArtists(
                    rawArtists?.map((a) => (a is Map ? a['name'] : a)).toList(),
                  );
            final albumName = (item['album'] is Map)
                ? (item['album']['name'] as String?)
                : null;
            final albumBrowseId = _extractAlbumBrowseIdFromMap(item['album']);
            final album = MediaNormalizer.resolveTrackAlbum(
              albumName,
              rawTitle: rawTitle,
            );
            final thumb = MediaNormalizer.upgradeArtworkUrl(
              item['thumbnail'] as String?,
              videoId: id,
            );
            final duration = (item['duration'] as num?)?.toInt() ?? 210;
            final bool isVid = Track.detectIsVideo(
              title,
              album,
              coverUrl: thumb,
            );
            tracks.add(
              Track(
                id: 'yt-$id',
                title: title,
                artist: artists,
                artists: artistRefs,
                album: isVid ? 'Music Video' : album,
                albumBrowseId: isVid ? null : albumBrowseId,
                coverUrl: thumb,
                durationSeconds: duration,
                language: Track.detectLanguage(title, artists, album) ?? '',
                source: 'youtube',
                isVideo: isVid,
              ),
            );
          } else if (item['type'] == 'video') {
            final id = item['id'] as String?;
            if (id == null || id.isEmpty || !seen.add(id)) continue;
            final rawTitle = item['title'] as String? ?? '';
            final rawArtists = item['artists'] as List? ?? [item['author']];
            final artistRefs = parseArtistRefs(rawArtists);
            var artists = artistRefs.isNotEmpty
                ? ArtistRef.formatList(artistRefs)
                : MediaNormalizer.formatArtists(
                    rawArtists.map((a) => (a is Map ? a['name'] : a)).toList(),
                  );
            if (artists.isEmpty ||
                artists.toLowerCase() == 'unknown artist' ||
                MediaNormalizer.isDistributorOrLabel(artists) ||
                MediaNormalizer.isNonArtistCreditSegment(artists)) {
              final extracted = MediaNormalizer.extractArtistsFromVideoTitle(
                rawTitle,
              );
              if (extracted.isNotEmpty) artists = extracted;
            }
            if (MediaNormalizer.isDistributorOrLabel(artists) ||
                MediaNormalizer.isNonArtistCreditSegment(artists)) {
              artists = '';
            }
            final title = MediaNormalizer.cleanVideoTitle(
              rawTitle,
              knownArtists: artists,
            );
            final thumb = MediaNormalizer.upgradeArtworkUrl(
              item['thumbnail'] as String?,
              videoId: id,
            );
            final duration = (item['duration'] as num?)?.toInt() ?? 210;
            String? vidYear = item['year']?.toString();
            if (vidYear == null || vidYear.isEmpty) {
              final pub =
                  item['publishDate']?.toString() ??
                  item['uploadDate']?.toString();
              if (pub != null && pub.length >= 4) {
                vidYear = pub.substring(0, 4);
              } else {
                final ym = RegExp(
                  r'\b(19\d{2}|20\d{2})\b',
                ).firstMatch(rawTitle);
                if (ym != null) vidYear = ym.group(0);
              }
            }
            tracks.add(
              Track(
                id: 'yt-$id',
                title: title,
                artist: artists,
                artists: artistRefs,
                album: 'Music Video',
                coverUrl: thumb,
                durationSeconds: duration,
                language:
                    Track.detectLanguage(title, artists, 'Music Video') ?? '',
                source: 'youtube',
                isVideo: true,
                year: vidYear,
              ),
            );
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
  static const _videosFilter = 'EgWKAQIQAWoKEAMQBBAKEAkQBQ%3D%3D';

  /// Throws [InnerTubeException] on failure so callers can decide whether a
  /// fallback is appropriate (it is NOT when `rateLimited` is true).
  Future<List<Track>> searchOrThrow(
    String query, {
    bool forceRefresh = false,
  }) async {
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
      forceRefresh: forceRefresh,
    );
    return _parseSearchTracks(res);
  }

  /// Never throws; returns an empty list on failure.
  Future<List<Track>> search(String query, {bool forceRefresh = false}) async {
    try {
      return await searchOrThrow(query, forceRefresh: forceRefresh);
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] search error: $e');
      return const [];
    }
  }

  /// Searches official music videos on YouTube Music InnerTube and upgrades
  /// video artwork to crisp 1280x720 (`maxresdefault.jpg`) thumbnails.
  Future<List<Track>> searchVideos(
    String query, {
    bool forceRefresh = false,
  }) async {
    final q = query.trim();
    if (q.isEmpty) return const [];
    try {
      final res = await post(
        'search',
        {'query': q, 'params': _videosFilter},
        ttl: _tSearch,
        forceRefresh: forceRefresh,
      );
      final list = _parseSearchTracks(res);
      return list.map((t) {
        var a = t.artist;
        if (a.isEmpty ||
            a.toLowerCase() == 'unknown artist' ||
            MediaNormalizer.isDistributorOrLabel(a) ||
            MediaNormalizer.isNonArtistCreditSegment(a)) {
          final extracted = MediaNormalizer.extractArtistsFromVideoTitle(
            t.title,
          );
          a = extracted;
        } else {
          final formatted = MediaNormalizer.formatArtists(a);
          a = (formatted.toLowerCase() == 'unknown artist' ||
                  MediaNormalizer.isDistributorOrLabel(formatted))
              ? ''
              : formatted;
        }
        var y = t.year;
        if (y == null || y.isEmpty) {
          final ym = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(t.title);
          if (ym != null) y = ym.group(0);
        }
        final cleanVidTitle = MediaNormalizer.cleanVideoTitle(
          t.title,
          knownArtists: a,
        );
        return t.copyWith(
          title: cleanVidTitle,
          isVideo: true,
          artist: a,
          year: y,
        );
      }).toList();
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] searchVideos error: $e');
      return const [];
    }
  }

  List<Track> _parseSearchTracks(Map<String, dynamic> json) {
    final out = <Track>[];
    final seen = <String>{};
    try {
      final sectionList =
          json['contents']?['tabbedSearchResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'] ??
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
              final t = _parseResponsiveListItem(
                item['musicResponsiveListItemRenderer'],
              );
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
              final t = _parseResponsiveListItem(
                it['musicResponsiveListItemRenderer'],
              );
              if (t != null && seen.add(t.id)) out.add(t);
            } else if (it['musicShelfRenderer']?['contents'] is List) {
              for (final subIt
                  in (it['musicShelfRenderer']['contents'] as List)) {
                if (subIt is Map) {
                  final t = _parseResponsiveListItem(
                    subIt['musicResponsiveListItemRenderer'],
                  );
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
            final titleRuns = card['title']?['runs'] as List?;
            final cardTitle = titleRuns != null && titleRuns.isNotEmpty
                ? (titleRuns[0]['text'] as String? ?? 'Top Result')
                : 'Top Result';
            final subRuns = card['subtitle']?['runs'] as List?;
            final norm = MediaNormalizer.normalize(
              id: 'yt-$cardVideoId',
              titleRuns: titleRuns,
              subtitleRuns: subRuns,
              videoId: cardVideoId,
            );
            final cardArtist = norm.subtitle.isNotEmpty
                ? norm.subtitle
                : (subRuns != null && subRuns.isNotEmpty
                      ? (subRuns[0]['text'] ?? 'Artist').toString()
                      : 'Artist');
            final thumbs =
                card['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
                    as List?;
            final bool isCardVid =
                norm.isVideo || Track.detectIsVideo(cardTitle, cardArtist);
            final parsedDur = _parseDurationFromRuns(subRuns);
            final t = Track(
              id: 'yt-$cardVideoId',
              title: norm.title.isNotEmpty ? norm.title : cardTitle,
              artist: cardArtist,
              album: isCardVid ? 'Music Video' : 'Single',
              coverUrl: _cover(thumbs, cardVideoId),
              durationSeconds: parsedDur ?? 210,
              language:
                  Track.detectLanguage(norm.title, cardArtist, '') ?? '',
              source: 'youtube',
              isVideo: isCardVid,
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

  static int? _parseDurationFromRuns(List? runs) {
    if (runs == null) return null;
    for (final r in runs) {
      if (r is Map && r['text'] is String) {
        final t = (r['text'] as String).trim();
        if (RegExp(r'^\d{1,2}:\d{2}(?::\d{2})?$').hasMatch(t)) {
          final nums = t.split(':').map(int.tryParse).toList();
          if (nums.every((p) => p != null)) {
            return nums.fold<int>(0, (acc, v) => acc * 60 + v!);
          }
        }
      }
    }
    return null;
  }

  String _cover(List? thumbs, String? videoId) {
    final raw = (thumbs != null && thumbs.isNotEmpty)
        ? thumbs.last['url'] as String
        : 'https://i.ytimg.com/vi/$videoId/hqdefault.jpg';
    return upgradeArtworkUrl(raw, videoId: videoId);
  }

  Track? _parseResponsiveListItem(Map<String, dynamic>? item) {
    if (item == null) return null;
    try {
      final nav =
          item['overlay']?['musicItemThumbnailOverlayRenderer']?['content']?['musicPlayButtonRenderer']?['playNavigationEndpoint'];
      String? videoId = nav?['watchEndpoint']?['videoId'];
      videoId ??= item['navigationEndpoint']?['watchEndpoint']?['videoId'];
      videoId ??= item['playlistItemData']?['videoId'];
      videoId ??= item['doubleTapEndpoint']?['watchEndpoint']?['videoId'];

      final flex = item['flexColumns'] as List?;
      if (flex == null || flex.isEmpty) return null;

      if (videoId == null && flex.isNotEmpty) {
        final flex0 = flex[0];
        final runs =
            flex0?['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs']
                as List?;
        if (runs != null && runs.isNotEmpty && runs[0] is Map) {
          videoId = runs[0]['navigationEndpoint']?['watchEndpoint']?['videoId'];
        }
      }
      if (videoId == null || videoId.isEmpty) return null;

      List? titleRuns;
      if (flex.isNotEmpty && flex[0] is Map) {
        final f0 = flex[0] as Map;
        titleRuns =
            f0['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs']
                as List?;
      }
      List? subRuns;
      if (flex.length > 1 && flex[1] is Map) {
        final f1 = flex[1] as Map;
        subRuns =
            f1['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs']
                as List?;
      }

      // Extract album and album browseId from flexColumns[2]
      String? albumName;
      String? albumBrowseId;
      if (flex.length > 2 && flex[2] is Map) {
        final f2 = flex[2] as Map;
        final albumRuns =
            f2['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs']
                as List?;
        if (albumRuns != null && albumRuns.isNotEmpty && albumRuns[0] is Map) {
          final t = albumRuns[0]['text'] as String?;
          final b =
              albumRuns[0]['navigationEndpoint']?['browseEndpoint']?['browseId']
                  as String?;
          if (t != null &&
              t.trim().isNotEmpty &&
              !MediaNormalizer.isMetadataNoise(t)) {
            albumName = t.trim();
          }
          if (b != null && b.isNotEmpty) {
            albumBrowseId = b;
          }
        }
      }

      // Also check menuNavigationItemRenderer with iconType == MUSIC_ALBUM
      final menuItems = item['menu']?['menuRenderer']?['items'] as List?;
      if (menuItems != null) {
        for (final mi in menuItems) {
          final mni = mi?['menuNavigationItemRenderer'];
          final icon = mni?['icon']?['iconType'];
          if (icon == 'MUSIC_ALBUM') {
            albumBrowseId ??=
                mni?['navigationEndpoint']?['browseEndpoint']?['browseId']
                    as String?;
            final runs = mni?['text']?['runs'] as List?;
            if (runs != null && runs.isNotEmpty && albumName == null) {
              final t = runs[0]['text'] as String?;
              if (t != null && t.trim().isNotEmpty) albumName = t.trim();
            }
            break;
          }
        }
      }

      final norm = MediaNormalizer.normalize(
        id: 'yt-$videoId',
        titleRuns: titleRuns,
        subtitleRuns: subRuns,
        videoId: videoId,
      );
      final rawTitleText =
          titleRuns
              ?.whereType<Map>()
              .map((r) => r['text']?.toString() ?? '')
              .join()
              .trim() ??
          '';
      final cleanAlbum = MediaNormalizer.resolveTrackAlbum(
        albumName,
        rawTitle: rawTitleText.isNotEmpty ? rawTitleText : norm.title,
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

      final thumbs =
          item['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
              as List?;

      final navEndpoint =
          item['overlay']?['musicItemThumbnailOverlayRenderer']?['content']?['musicPlayButtonRenderer']?['playNavigationEndpoint'] ??
          item['navigationEndpoint'] ??
          item['playlistItemData'];
      final mvt =
          navEndpoint?['watchEndpoint']?['watchEndpointMusicSupportedConfigs']?['watchEndpointMusicConfig']?['musicVideoType']
              ?.toString() ??
          item['musicVideoType']?.toString();
      final bool isOmvOrUgc =
          mvt == 'MUSIC_VIDEO_TYPE_OMV' ||
          mvt == 'OMV' ||
          mvt == 'MUSIC_VIDEO_TYPE_UGC' ||
          mvt == 'MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC_VIDEO';

      bool has16x9Thumb = false;
      if (thumbs != null && thumbs.isNotEmpty) {
        for (final t in thumbs) {
          if (t is Map) {
            final w = (t['width'] as num?)?.toDouble() ?? 0;
            final h = (t['height'] as num?)?.toDouble() ?? 0;
            if (w > 0 && h > 0 && (w / h) > 1.35) {
              has16x9Thumb = true;
              break;
            }
          }
        }
      }

      final bool subSaysVideo =
          subRuns != null &&
          subRuns.any((r) {
            final txt = (r is Map ? r['text']?.toString() : null)
                ?.toLowerCase()
                .trim();
            return txt == 'video' || txt == 'music video';
          });

      final bool isVid =
          norm.isVideo || isOmvOrUgc || subSaysVideo || has16x9Thumb;

      return Track(
        id: norm.id,
        title: norm.title,
        artist: norm.subtitle,
        album: isVid ? 'Music Video' : cleanAlbum,
        albumBrowseId: albumBrowseId,
        coverUrl: _cover(thumbs, videoId),
        durationSeconds: duration,
        language:
            Track.detectLanguage(norm.title, norm.subtitle, cleanAlbum) ?? '',
        source: 'youtube',
        isVideo: isVid,
      );
    } catch (_) {
      return null;
    }
  }

  Track? _parseTwoRowItem(Map<String, dynamic>? item) {
    if (item == null) return null;
    try {
      final nav =
          item['navigationEndpoint'] ??
          item['thumbnailOverlay']?['musicItemThumbnailOverlayRenderer']?['content']?['musicPlayButtonRenderer']?['playNavigationEndpoint'];
      final videoId = nav?['watchEndpoint']?['videoId'];
      if (videoId is! String || videoId.isEmpty) return null;

      final titleRuns = item['title']?['runs'] as List?;
      final subRuns = item['subtitle']?['runs'] as List?;
      final thumbs =
          item['thumbnailRenderer']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
              as List?;

      final navEndpoint = nav;
      final mvt =
          navEndpoint?['watchEndpoint']?['watchEndpointMusicSupportedConfigs']?['watchEndpointMusicConfig']?['musicVideoType']
              ?.toString() ??
          item['musicVideoType']?.toString();
      final bool isOmvOrUgc =
          mvt == 'MUSIC_VIDEO_TYPE_OMV' ||
          mvt == 'OMV' ||
          mvt == 'MUSIC_VIDEO_TYPE_UGC' ||
          mvt == 'MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC_VIDEO';

      bool has16x9Thumb = false;
      if (thumbs != null && thumbs.isNotEmpty) {
        for (final t in thumbs) {
          if (t is Map) {
            final w = (t['width'] as num?)?.toDouble() ?? 0;
            final h = (t['height'] as num?)?.toDouble() ?? 0;
            if (w > 0 && h > 0 && (w / h) > 1.35) {
              has16x9Thumb = true;
              break;
            }
          }
        }
      }

      final bool subSaysVideo =
          subRuns != null &&
          subRuns.any((r) {
            final txt = (r is Map ? r['text']?.toString() : null)
                ?.toLowerCase()
                .trim();
            return txt == 'video' || txt == 'music video';
          });

      String? albumName;
      String? albumBrowseId;
      if (subRuns != null && subRuns.length > 2) {
        final r = subRuns[2];
        if (r is Map) {
          final t = r['text'] as String?;
          final b =
              r['navigationEndpoint']?['browseEndpoint']?['browseId']
                  as String?;
          if (t != null &&
              t.trim().isNotEmpty &&
              !MediaNormalizer.isMetadataNoise(t)) {
            albumName = t.trim();
          }
          if (b != null && b.isNotEmpty) {
            albumBrowseId = b;
          }
        }
      }

      final norm = MediaNormalizer.normalize(
        id: 'yt-$videoId',
        titleRuns: titleRuns,
        subtitleRuns: subRuns,
        videoId: videoId,
      );

      final bool isVid =
          norm.isVideo || isOmvOrUgc || subSaysVideo || has16x9Thumb;
      final rawTitleText =
          titleRuns
              ?.whereType<Map>()
              .map((r) => r['text']?.toString() ?? '')
              .join()
              .trim() ??
          '';
      final cleanAlbum = MediaNormalizer.resolveTrackAlbum(
        albumName,
        rawTitle: rawTitleText.isNotEmpty ? rawTitleText : norm.title,
        isVideo: isVid,
      );

      return Track(
        id: norm.id,
        title: norm.title,
        artist: norm.subtitle,
        album: isVid ? 'Music Video' : cleanAlbum,
        albumBrowseId: albumBrowseId,
        coverUrl: _cover(thumbs, videoId),
        durationSeconds: _parseDurationFromRuns(subRuns) ?? 210,
        language:
            Track.detectLanguage(norm.title, norm.subtitle, cleanAlbum) ?? '',
        source: 'youtube',
        isVideo: isVid,
      );
    } catch (_) {
      return null;
    }
  }

  Track? _parseAnyItem(dynamic item) =>
      _parseResponsiveListItem(item['musicResponsiveListItemRenderer']) ??
      _parseTwoRowItem(item['musicTwoRowItemRenderer']);

  // ────────────────────────────── Suggestions ────────────────────────────────

  Future<void> syncNativeLocale([String? countryCode]) async {
    if (!_useNative) return;
    try {
      await _nativeChannel.invokeMethod('setLocale', {
        'gl': (countryCode ?? CountryService.instance.currentCode)
            .toUpperCase(),
        'hl': hl,
      });
    } catch (_) {}
  }

  /// Fetches raw `music/get_search_suggestions` response JSON (including both
  /// `contents[0]` query completions and `contents[1]` recommended entities).
  Future<Map<String, dynamic>?> getSearchSuggestionsRaw(String query) async {
    final q = query.trim();
    if (q.isEmpty) return null;
    try {
      return await post('music/get_search_suggestions', {
        'input': q,
      }, ttl: _tSuggest);
    } catch (_) {
      return null;
    }
  }

  Future<List<String>> getSearchSuggestions(String query) async {
    final q = query.trim();
    if (q.isEmpty) return const [];

    try {
      final res = await post('music/get_search_suggestions', {
        'input': q,
      }, ttl: _tSuggest);
      final contents = res['contents'] as List?;
      if (contents != null) {
        final out = <String>[];
        for (final c in contents) {
          final rows = c['searchSuggestionsSectionRenderer']?['contents'];
          if (rows is! List) continue;
          for (final item in rows) {
            final runs =
                item['searchSuggestionRenderer']?['suggestion']?['runs']
                    as List?;
            if (runs != null && runs.isNotEmpty) {
              final text = runs.map((r) => r['text'] ?? '').join();
              if (text.isNotEmpty) out.add(text);
            }
          }
        }
        if (out.isNotEmpty) return out;
      }
    } catch (_) {}

    if (_useNative) {
      try {
        final list = await _nativeChannel
            .invokeMethod<List<dynamic>>('searchSuggestions', {'query': q})
            .timeout(const Duration(seconds: 3), onTimeout: () => null);
        if (list != null && list.isNotEmpty) {
          return list.whereType<String>().toList();
        }
      } catch (_) {}
    }

    return const [];
  }

  // ────────────────────────────── Home feed ──────────────────────────────────

  Future<List<Track>> getHomeFeed({
    String? countryCode,
    bool forceRefresh = false,
  }) async {
    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMethod<List<dynamic>>('getHomeFeed')
            .timeout(const Duration(seconds: 4), onTimeout: () => null);
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
              final rawArtists = it['artists'] as List?;
              final artistRefs = parseArtistRefs(rawArtists);
              final artists = artistRefs.isNotEmpty
                  ? ArtistRef.formatList(artistRefs)
                  : MediaNormalizer.formatArtists(
                      rawArtists?.map((a) => a is Map ? a['name'] : a).toList(),
                    );
              final rawTitleStr = it['title'] as String?;
              final rawAlbStr = it['album'] is Map
                  ? (it['album']['name'] as String?)
                  : null;
              final rawAlbumName = MediaNormalizer.resolveTrackAlbum(
                rawAlbStr,
                rawTitle: rawTitleStr,
              );
              final albumBrowseId = _extractAlbumBrowseIdFromMap(it['album']);
              final thumb = MediaNormalizer.upgradeArtworkUrl(
                it['thumbnail'] as String?,
                videoId: id,
              );
              final isVid =
                  it['type'] == 'video' ||
                  Track.detectIsVideo(
                    it['title'] as String? ?? '',
                    rawAlbumName,
                    coverUrl: thumb,
                  );
              tracks.add(
                Track(
                  id: 'yt-$id',
                  title: MediaNormalizer.cleanTitle(it['title'] as String?),
                  artist: artists,
                  artists: artistRefs,
                  album: isVid ? 'Music Video' : rawAlbumName,
                  albumBrowseId: isVid ? null : albumBrowseId,
                  coverUrl: thumb,
                  durationSeconds: (it['duration'] as num?)?.toInt() ?? 210,
                  source: 'youtube',
                  isVideo: isVid,
                ),
              );
            }
          }
          if (tracks.isNotEmpty) return tracks;
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getHomeFeed error: $e');
      }
    }

    try {
      final res = await post(
        'browse',
        {'browseId': 'FEmusic_home'},
        countryCode: countryCode,
        ttl: _tHome,
        forceRefresh: forceRefresh,
      );
      return _collectShelfTracks(res);
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getHomeFeed error: $e');
      return const [];
    }
  }

  List<Track> _collectShelfTracks(Map<String, dynamic> res) {
    final out = <Track>[];
    final seen = <String>{};
    final sections =
        res['contents']?['singleColumnBrowseResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'];
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

  /// Fetches genuine, strictly classified Albums and Singles for Home shelves
  /// (never extracts random songs into the Albums shelf).
  Future<({List<ReleaseSummary> albums, List<ReleaseSummary> singles})>
  getHomeAlbumsAndSingles({
    String? countryCode,
    String? primaryLanguage,
    List<String> favoriteArtists = const [],
    bool forceRefresh = false,
  }) async {
    if (!forceRefresh &&
        _homeReleasesCache != null &&
        _homeReleasesExpires != null &&
        DateTime.now().isBefore(_homeReleasesExpires!)) {
      return _homeReleasesCache!;
    }

    final albums = <ReleaseSummary>[];
    final singles = <ReleaseSummary>[];
    final seenIds = <String>{};
    final seenKeys = <String>{};

    void addCandidate({
      required String rawTitle,
      required String rawArtist,
      required String rawCover,
      String? browseId,
      String? rawType,
      bool explicitSingle = false,
      String? year,
    }) {
      final validBrowseId = AlbumResolver.sanitizeAlbumBrowseId(browseId);
      if (validBrowseId == null) return;

      final title = MediaNormalizer.cleanAlbumTitle(rawTitle);
      if (!AlbumResolver.isValidAlbumTitle(title) &&
          !explicitSingle &&
          (rawType ?? '').toLowerCase() != 'single') {
        return;
      }
      if (AlbumResolver.isVideoContext(
        isVideo: false,
        title: rawTitle,
        album: title,
        coverUrl: rawCover,
      )) {
        return;
      }
      if (AlbumResolver.isVariantConflict('', rawTitle)) return;

      final lowerType = (rawType ?? '').trim().toLowerCase();
      final looksSingle =
          explicitSingle ||
          lowerType == 'single' ||
          AlbumResolver.isSingleReleaseTitle(rawTitle);
      final looksEp = lowerType == 'ep';

      final artist = MediaNormalizer.formatArtists(rawArtist);
      final key = '${title.toLowerCase()}|${artist.toLowerCase()}';
      if (!seenIds.add(validBrowseId) || !seenKeys.add(key)) return;

      final kind = looksSingle
          ? MediaReleaseKind.single
          : (looksEp ? MediaReleaseKind.ep : MediaReleaseKind.album);
      final summary = ReleaseSummary(
        title: looksSingle ? MediaNormalizer.cleanTitle(rawTitle) : title,
        artist: artist.isNotEmpty ? artist : 'Artist',
        coverUrl: MediaNormalizer.upgradeArtworkUrl(rawCover),
        browseId: validBrowseId,
        kind: kind,
        year: year,
      );
      if (kind == MediaReleaseKind.album) {
        albums.add(summary);
      } else {
        singles.add(summary);
      }
    }

    try {
      final futures = <Future<void>>[];

      if (_useNative) {
        futures.add(
          _nativeChannel
              .invokeMethod<List<dynamic>>('getHomeFeed')
              .timeout(const Duration(seconds: 4), onTimeout: () => null)
              .then((res) {
                if (res == null) return;
                for (final sec in res) {
                  if (sec is! Map) continue;
                  final secTitle = (sec['title'] ?? '')
                      .toString()
                      .toLowerCase();
                  final secIsSingle = secTitle.contains('single');
                  final items = sec['items'] as List? ?? const [];
                  for (final it in items) {
                    if (it is! Map || it['type'] != 'album') continue;
                    final rawArtists = it['artists'] as List?;
                    final artStr = MediaNormalizer.formatArtists(
                      rawArtists?.map((a) => a is Map ? a['name'] : a).toList(),
                    );
                    addCandidate(
                      rawTitle: (it['title'] ?? '').toString(),
                      rawArtist: artStr,
                      rawCover: (it['thumbnail'] ?? '').toString(),
                      browseId: (it['browseId'] ?? it['id'])?.toString(),
                      rawType: it['albumType']?.toString(),
                      explicitSingle: it['isSingle'] == true || secIsSingle,
                      year: it['year']?.toString(),
                    );
                  }
                }
              })
              .catchError((_) {}),
        );

        futures.add(
          _nativeChannel
              .invokeMethod<Map<dynamic, dynamic>>('getExplore')
              .timeout(const Duration(seconds: 4), onTimeout: () => null)
              .then((res) {
                if (res == null) return;
                final list = res['newReleaseAlbums'] as List? ?? const [];
                for (final it in list) {
                  if (it is! Map) continue;
                  final rawArtists = it['artists'] as List?;
                  final artStr = MediaNormalizer.formatArtists(
                    rawArtists?.map((a) => a is Map ? a['name'] : a).toList(),
                  );
                  addCandidate(
                    rawTitle: (it['title'] ?? '').toString(),
                    rawArtist: artStr,
                    rawCover: (it['thumbnail'] ?? '').toString(),
                    browseId: (it['browseId'] ?? it['id'])?.toString(),
                    rawType: it['albumType']?.toString(),
                    explicitSingle: it['isSingle'] == true,
                    year: it['year']?.toString(),
                  );
                }
              })
              .catchError((_) {}),
        );

        final queries = <String>[
          if (primaryLanguage != null && primaryLanguage.trim().isNotEmpty)
            '${primaryLanguage.trim()} movie album hits'
          else
            'new music albums',
          if (favoriteArtists.isNotEmpty &&
              favoriteArtists.first.trim().isNotEmpty)
            '${favoriteArtists.first.trim()} album',
        ];
        for (final q in queries) {
          futures.add(
            searchAlbumsNative(q)
                .then((list) {
                  for (final it in list) {
                    final rawArtists = it['artists'] as List?;
                    final artStr = MediaNormalizer.formatArtists(
                      rawArtists?.map((a) => a is Map ? a['name'] : a).toList(),
                    );
                    addCandidate(
                      rawTitle: (it['title'] ?? '').toString(),
                      rawArtist: artStr,
                      rawCover: (it['thumbnail'] ?? '').toString(),
                      browseId: (it['browseId'] ?? it['id'])?.toString(),
                      rawType: it['albumType']?.toString(),
                      explicitSingle: it['isSingle'] == true,
                      year: it['year']?.toString(),
                    );
                  }
                })
                .catchError((_) {}),
          );
        }
      }

      await Future.wait(futures);

      if (albums.isEmpty) {
        final res = await post(
          'browse',
          {'browseId': 'FEmusic_new_releases'},
          countryCode: countryCode,
          ttl: _tReleases,
          forceRefresh: forceRefresh,
        );
        final sections =
            res['contents']?['singleColumnBrowseResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'];
        if (sections is List) {
          for (final section in sections) {
            final carousel = section['musicCarouselShelfRenderer'];
            final items = carousel?['contents'];
            if (items is! List) continue;
            for (final item in items) {
              final row = item['musicTwoRowItemRenderer'];
              if (row == null) continue;
              final browseEndpoint =
                  row['navigationEndpoint']?['browseEndpoint'];
              final pageType =
                  browseEndpoint?['browseEndpointContextSupportedConfigs']?['browseEndpointContextMusicConfig']?['pageType']
                      ?.toString() ??
                  '';
              final bId = browseEndpoint?['browseId']?.toString();
              if (pageType != 'MUSIC_PAGE_TYPE_ALBUM' &&
                  !AlbumResolver.isValidAlbumBrowseId(bId)) {
                continue;
              }
              final c = _twoRowCard(item);
              if (c == null) continue;
              final subRuns = row['subtitle']?['runs'] as List? ?? const [];
              final subText = subRuns
                  .map((r) => (r is Map ? r['text'] : '') ?? '')
                  .join(' ')
                  .toLowerCase();
              final inferredType = subText.contains('single')
                  ? 'Single'
                  : (subText.contains('ep') ? 'EP' : 'Album');
              addCandidate(
                rawTitle: (c['title'] ?? '').toString(),
                rawArtist: (c['subtitle'] ?? '').toString(),
                rawCover: (c['coverUrl'] ?? '').toString(),
                browseId: bId,
                rawType: inferredType,
                explicitSingle: inferredType == 'Single',
              );
            }
          }
        }
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[InnerTube] getHomeAlbumsAndSingles error: $e');
      }
    }

    final result = (
      albums: albums.take(12).toList(),
      singles: singles.take(12).toList(),
    );
    if (result.albums.isNotEmpty || result.singles.isNotEmpty) {
      _homeReleasesCache = result;
      _homeReleasesExpires = DateTime.now().add(_tReleases);
    }
    return result;
  }

  // ────────────────────────────── Charts ─────────────────────────────────────

  Future<
    ({
      List<Track> tracks,
      List<({String name, String subs, String image})> artists,
    })
  >
  getCharts({String? countryCode, bool forceRefresh = false}) async {
    final tracks = <Track>[];
    final artists = <({String name, String subs, String image})>[];

    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMethod<List<dynamic>>('getCharts', {
              'countryCode': countryCode ?? CountryService.instance.currentCode,
            })
            .timeout(const Duration(seconds: 4), onTimeout: () => null);
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
                final rawArtists = it['artists'] as List?;
                final artistRefs = parseArtistRefs(rawArtists);
                final artistsList = artistRefs.isNotEmpty
                    ? ArtistRef.formatList(artistRefs)
                    : MediaNormalizer.formatArtists(
                        rawArtists
                            ?.map((a) => a is Map ? a['name'] : a)
                            .toList(),
                      );
                final rawTitleStr = it['title'] as String?;
                final rawAlbStr = it['album'] is Map
                    ? (it['album']['name'] as String?)
                    : null;
                final rawAlbumName = MediaNormalizer.resolveTrackAlbum(
                  rawAlbStr,
                  rawTitle: rawTitleStr,
                );
                final albumBrowseId = _extractAlbumBrowseIdFromMap(it['album']);
                final thumb = MediaNormalizer.upgradeArtworkUrl(
                  it['thumbnail'] as String?,
                  videoId: id,
                );
                final isVid =
                    it['type'] == 'video' ||
                    Track.detectIsVideo(
                      it['title'] as String? ?? '',
                      rawAlbumName,
                      coverUrl: thumb,
                    );
                tracks.add(
                  Track(
                    id: 'yt-$id',
                    title: MediaNormalizer.cleanTitle(it['title'] as String?),
                    artist: artistsList,
                    artists: artistRefs,
                    album: isVid ? 'Music Video' : rawAlbumName,
                    albumBrowseId: isVid ? null : albumBrowseId,
                    coverUrl: thumb,
                    durationSeconds: (it['duration'] as num?)?.toInt() ?? 210,
                    source: 'youtube',
                    isVideo: isVid,
                  ),
                );
              } else if (it['type'] == 'artist') {
                final name = MediaNormalizer.cleanTitle(it['title'] as String?);
                final img = MediaNormalizer.upgradeArtworkUrl(
                  it['thumbnail'] as String?,
                  isArtistAvatar: true,
                );
                if (name.isNotEmpty &&
                    !artists.any(
                      (a) => a.name.toLowerCase() == name.toLowerCase(),
                    )) {
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
      final res = await post(
        'browse',
        {'browseId': 'FEmusic_charts'},
        countryCode: countryCode,
        ttl: _tCharts,
        forceRefresh: forceRefresh,
      );

      final sections =
          res['contents']?['singleColumnBrowseResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'];
      if (sections is! List) return (tracks: tracks, artists: artists);

      final seen = <String>{};
      for (final section in sections) {
        final carousel = section['musicCarouselShelfRenderer'];
        if (carousel == null) continue;
        final title =
            carousel['header']?['musicCarouselShelfBasicHeaderRenderer']?['title']?['runs']?[0]?['text']
                as String? ??
            '';
        final contents = carousel['contents'] as List? ?? const [];

        if (title.toLowerCase().contains('artist')) {
          for (final item in contents) {
            final row = item['musicResponsiveListItemRenderer'];
            if (row is! Map) continue;
            final flex = row['flexColumns'] as List? ?? const [];

            String? textOf(int i) {
              if (flex.length <= i || flex[i] is! Map) return null;
              final runs =
                  (flex[i]
                          as Map)['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs']
                      as List?;
              return (runs != null && runs.isNotEmpty && runs[0] is Map)
                  ? runs[0]['text'] as String?
                  : null;
            }

            final name = textOf(0);
            final subs = textOf(1);
            final thumb =
                (row['thumbnail']
                        as Map?)?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']?[0]?['url']
                    as String?;
            if (name != null && name.isNotEmpty && thumb != null) {
              artists.add((
                name: name,
                subs: subs ?? 'Top Artist',
                image: upgradeArtworkUrl(thumb, isArtistAvatar: true),
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

  Future<List<Track>> getNewReleases({
    String? countryCode,
    bool forceRefresh = false,
  }) async {
    try {
      final res = await post(
        'browse',
        {'browseId': 'FEmusic_new_releases'},
        countryCode: countryCode,
        ttl: _tReleases,
        forceRefresh: forceRefresh,
      );
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

    if (_useNative) {
      try {
        final nativeArtists = await searchArtistsNative(q);
        if (nativeArtists.isNotEmpty) {
          final first = nativeArtists.first;
          final title = (first['title'] ?? q).toString();
          final bId = (first['channelId'] ?? first['id'] ?? '').toString();
          final thumb = first['thumbnail'] as String?;
          if (bId.isNotEmpty) {
            return (
              name: title,
              browseId: bId,
              audience: null,
              thumb: thumb != null
                  ? MediaNormalizer.upgradeArtworkUrl(
                      thumb,
                      isArtistAvatar: true,
                    )
                  : null,
            );
          }
        }
      } catch (_) {}
    }

    try {
      // 1. Check general search for musicCardShelfRenderer or artist responsive list item
      final res = await post('search', {'query': q}, ttl: _tArtistCard);
      final sections =
          res['contents']?['tabbedSearchResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'] ??
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
            if (titleRuns != null &&
                titleRuns.isNotEmpty &&
                titleRuns[0] is Map) {
              final t0 = titleRuns[0] as Map;
              title = t0['text'] as String? ?? q;
              browseId =
                  (t0['navigationEndpoint']
                          as Map?)?['browseEndpoint']?['browseId']
                      as String?;
            }

            final subRuns = card['subtitle']?['runs'] as List?;
            final audience = subRuns
                ?.map((r) => r is Map ? (r['text'] ?? '') : '')
                .join();

            final thumbs =
                card['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
                    as List?;
            String? raw;
            if (thumbs != null && thumbs.isNotEmpty && thumbs.last is Map) {
              raw = (thumbs.last as Map)['url'] as String?;
            }

            if (browseId != null && browseId.isNotEmpty) {
              return (
                name: title,
                browseId: browseId,
                audience: audience,
                thumb: raw != null
                    ? MediaNormalizer.upgradeArtworkUrl(
                        raw,
                        isArtistAvatar: true,
                      )
                    : null,
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
              final pageType =
                  browseEndpoint?['browseEndpointContextSupportedConfigs']?['browseEndpointContextMusicConfig']?['pageType']
                      ?.toString() ??
                  '';
              if (pageType == 'MUSIC_PAGE_TYPE_ARTIST') {
                final browseId = browseEndpoint?['browseId'] as String?;
                final flexCols = r['flexColumns'] as List?;
                List? titleRuns;
                if (flexCols != null &&
                    flexCols.isNotEmpty &&
                    flexCols[0] is Map) {
                  final col0 = flexCols[0] as Map;
                  titleRuns =
                      col0['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs']
                          as List?;
                }
                final artistTitle = titleRuns?.isNotEmpty == true
                    ? titleRuns![0]['text'] as String? ?? q
                    : q;
                final thumbs =
                    r['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
                        as List?;
                final rawThumb = thumbs?.isNotEmpty == true
                    ? thumbs!.last['url'] as String?
                    : null;
                if (browseId != null && browseId.isNotEmpty) {
                  return (
                    name: artistTitle,
                    browseId: browseId,
                    audience: null,
                    thumb: rawThumb != null
                        ? MediaNormalizer.upgradeArtworkUrl(
                            rawThumb,
                            isArtistAvatar: true,
                          )
                        : null,
                  );
                }
              }
            }
          }
        }
      }

      // 2. Filtered Artist Search via InnerTube params ('EgWKAQIgAWoKEAUQAxAEEAkQEQ%3D%3D')
      final artistSearchRes = await post('search', {
        'query': q,
        'params': 'EgWKAQIgAWoKEAUQAxAEEAkQEQ%3D%3D',
      }, ttl: _tArtistCard);

      final artistSections =
          artistSearchRes['contents']?['tabbedSearchResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'] ??
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
            final titleRuns =
                titleCol?['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs']
                    as List?;
            final artistTitle = titleRuns?.isNotEmpty == true
                ? titleRuns![0]['text'] as String? ?? q
                : q;
            final browseId =
                r['navigationEndpoint']?['browseEndpoint']?['browseId']
                    as String?;
            final thumbs =
                r['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
                    as List?;
            final rawThumb = thumbs?.isNotEmpty == true
                ? thumbs!.last['url'] as String?
                : null;

            if (browseId != null && browseId.isNotEmpty) {
              return (
                name: artistTitle,
                browseId: browseId,
                audience: null,
                thumb: rawThumb != null
                    ? MediaNormalizer.upgradeArtworkUrl(
                        rawThumb,
                        isArtistAvatar: true,
                      )
                    : null,
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

  /// Searches YouTube Music specifically for artist profiles (name + browseId + avatar).
  /// Uses native Android FILTER_ARTIST channel when available, with WEB_REMIX fallback.
  Future<List<({String id, String name, String image})>> searchArtists(
    String query, {
    int limit = 12,
  }) async {
    final q = query.trim();
    if (q.isEmpty) return const [];

    final out = <({String id, String name, String image})>[];
    final seenNames = <String>{};

    if (_useNative) {
      try {
        final raw = await _nativeChannel.invokeMethod<List<dynamic>>(
          'searchArtists',
          {'query': q},
        );
        if (raw != null && raw.isNotEmpty) {
          for (final item in raw) {
            if (item is! Map) continue;
            final name = MediaNormalizer.cleanTitle(item['title'] as String?);
            final id = (item['id'] as String?) ?? name;
            final thumb = item['thumbnail'] as String?;
            if (name.isEmpty || !seenNames.add(name.toLowerCase())) continue;
            out.add((
              id: id,
              name: name,
              image: thumb != null && thumb.isNotEmpty
                  ? MediaNormalizer.upgradeArtworkUrl(
                      thumb,
                      isArtistAvatar: true,
                    )
                  : '',
            ));
            if (out.length >= limit) return out;
          }
          if (out.isNotEmpty) return out;
        }
      } catch (e) {
        if (kDebugMode)
          debugPrint('[InnerTube] Native searchArtists error: $e');
      }
    }

    try {
      final res = await post('search', {
        'query': q,
        'params': 'EgWKAQIgAWoKEAUQAxAEEAkQEQ%3D%3D',
      }, ttl: _tArtistCard);
      final sections =
          res['contents']?['tabbedSearchResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'] ??
          res['contents']?['sectionListRenderer']?['contents'];

      if (sections is List) {
        for (final sec in sections) {
          if (sec is! Map) continue;
          final items = <dynamic>[
            ...?sec['musicShelfRenderer']?['contents'] as List?,
            ...?sec['itemSectionRenderer']?['contents'] as List?,
          ];
          for (final item in items) {
            if (item is! Map) continue;
            final r = item['musicResponsiveListItemRenderer'];
            if (r is! Map) continue;
            final flexCols = r['flexColumns'] as List?;
            final titleCol = flexCols?.firstWhere(
              (c) =>
                  c is Map &&
                  c['musicResponsiveListItemFlexColumnRenderer'] != null,
              orElse: () => null,
            );
            final titleRuns =
                titleCol?['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs']
                    as List?;
            final name = titleRuns?.isNotEmpty == true
                ? MediaNormalizer.cleanTitle(titleRuns![0]['text'] as String?)
                : '';
            final browseId =
                r['navigationEndpoint']?['browseEndpoint']?['browseId']
                    as String?;
            final thumbs =
                r['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
                    as List?;
            final rawThumb = thumbs?.isNotEmpty == true
                ? thumbs!.last['url'] as String?
                : null;
            if (name.isEmpty || !seenNames.add(name.toLowerCase())) continue;
            out.add((
              id: (browseId != null && browseId.isNotEmpty) ? browseId : name,
              name: name,
              image: rawThumb != null && rawThumb.isNotEmpty
                  ? MediaNormalizer.upgradeArtworkUrl(
                      rawThumb,
                      isArtistAvatar: true,
                    )
                  : '',
            ));
            if (out.length >= limit) return out;
          }
        }
      }
    } catch (e) {
      if (kDebugMode)
        debugPrint('[InnerTube] searchArtists fallback error: $e');
    }
    return out;
  }

  Map<String, dynamic>? _twoRowCard(dynamic item) {
    final row = item['musicTwoRowItemRenderer'];
    if (row == null) return null;
    final titleRuns = row['title']?['runs'] as List?;
    final subRuns = row['subtitle']?['runs'] as List?;
    final rawCover =
        row['thumbnailRenderer']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
                ?.last['url']
            as String?;
    final browseId =
        row['navigationEndpoint']?['browseEndpoint']?['browseId'] as String?;
    final videoId =
        row['navigationEndpoint']?['watchEndpoint']?['videoId'] as String? ??
        row['thumbnailOverlay']?['musicItemThumbnailOverlayRenderer']?['content']?['musicPlayButtonRenderer']?['playNavigationEndpoint']?['watchEndpoint']?['videoId']
            as String?;

    final norm = MediaNormalizer.normalize(
      id: videoId != null ? 'yt-$videoId' : (browseId ?? ''),
      titleRuns: titleRuns,
      subtitleRuns: subRuns,
      rawImageUrl: rawCover,
      defaultType: videoId != null ? 'video' : 'album',
      videoId: videoId,
      browseId: browseId,
    );

    return {
      'title': norm.title,
      'subtitle': norm.subtitle,
      'browseId': browseId,
      'videoId': videoId,
      'id': videoId ?? browseId,
      'coverUrl': norm.imageUrl,
      'year': norm.year,
    };
  }

  Future<Map<String, dynamic>?> getArtistChannel(
    String browseId, {
    String? artistName,
  }) async {
    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMethod<Map<dynamic, dynamic>>('getArtist', {
              'browseId': browseId,
              'name': artistName ?? '',
              'artistName': artistName ?? '',
            })
            .timeout(const Duration(seconds: 12), onTimeout: () => null);
        if (res != null && res.isNotEmpty) {
          final artistMap = Map<String, dynamic>.from(
            res['artist'] as Map? ?? {},
          );
          final name = MediaNormalizer.cleanTitle(
            artistMap['title'] as String?,
          );
          final rawThumb = artistMap['thumbnail'] as String?;
          final thumb = rawThumb != null
              ? MediaNormalizer.upgradeArtworkUrl(
                  rawThumb,
                  isArtistAvatar: true,
                )
              : null;
          final rawBanner =
              res['banner'] as String? ??
              artistMap['banner'] as String? ??
              rawThumb;
          final banner = rawBanner != null
              ? MediaNormalizer.upgradeBannerUrl(rawBanner)
              : thumb;
          final bio = res['description'] as String?;
          final subscriberCount = res['subscriberCountText'] as String?;
          final monthlyListenerCount = res['monthlyListenerCount'] as String?;

          final topSongs = <Track>[];
          final videos = <Track>[];
          final albums = <Map<String, dynamic>>[];
          final singles = <Map<String, dynamic>>[];
          final playlists = <Map<String, dynamic>>[];
          final related = <Map<String, dynamic>>[];

          final sections = res['sections'] as List? ?? const [];
          for (final sec in sections) {
            if (sec is! Map) continue;
            final title = (sec['title'] ?? '').toString().toLowerCase();
            final items = sec['items'] as List? ?? const [];

            if (title.contains('song') ||
                title.contains('top') ||
                title.contains('popular') ||
                title.contains('track')) {
              for (final it in items) {
                if (it is! Map) continue;
                final id = it['id'] as String?;
                if (id == null || id.isEmpty) continue;
                final albumMap = it['album'];
                final albBrowseId = _extractAlbumBrowseIdFromMap(albumMap);
                final albName = albumMap is Map
                    ? MediaNormalizer.cleanTitle(albumMap['name'] as String?)
                    : 'Single';
                topSongs.add(
                  Track(
                    id: 'yt-$id',
                    title: MediaNormalizer.cleanTitle(it['title'] as String?),
                    artist: MediaNormalizer.formatArtists(
                      (it['artists'] as List?)
                          ?.map((a) => a is Map ? a['name'] : a)
                          .toList(),
                    ),
                    album: albName.isNotEmpty ? albName : 'Single',
                    albumBrowseId: albBrowseId,
                    coverUrl: MediaNormalizer.upgradeArtworkUrl(
                      it['thumbnail'] as String?,
                      videoId: id,
                    ),
                    durationSeconds: (it['duration'] as num?)?.toInt() ?? 210,
                    source: 'youtube',
                  ),
                );
              }
            } else if (title.contains('video')) {
              for (final it in items) {
                if (it is! Map) continue;
                final id = it['id'] as String?;
                if (id == null || id.isEmpty) continue;
                final rawTitle = it['title'] as String? ?? 'Video';
                final rawArtist = MediaNormalizer.formatArtists(
                  (it['artists'] as List?)
                      ?.map((a) => a is Map ? a['name'] : a)
                      .toList(),
                );
                String resolvedArtist = rawArtist;
                if (resolvedArtist.isEmpty ||
                    resolvedArtist.toLowerCase() == 'unknown artist' ||
                    MediaNormalizer.isDistributorOrLabel(resolvedArtist) ||
                    MediaNormalizer.isNonArtistCreditSegment(resolvedArtist)) {
                  resolvedArtist = MediaNormalizer.extractArtistsFromVideoTitle(
                    rawTitle,
                    defaultArtist: artistName ?? name,
                  );
                }
                if (resolvedArtist.isEmpty ||
                    MediaNormalizer.isDistributorOrLabel(resolvedArtist)) {
                  resolvedArtist = (artistName != null && artistName.isNotEmpty)
                      ? artistName
                      : (name.isNotEmpty ? name : 'Artist');
                }
                final cleanVidTitle = MediaNormalizer.cleanVideoTitle(
                  rawTitle,
                  knownArtists: resolvedArtist,
                );
                String? vidYear = it['year']?.toString();
                if (vidYear == null || vidYear.isEmpty) {
                  final ym = RegExp(
                    r'\b(19\d{2}|20\d{2})\b',
                  ).firstMatch(rawTitle);
                  if (ym != null) vidYear = ym.group(0);
                }
                videos.add(
                  Track(
                    id: 'yt-$id',
                    title: cleanVidTitle,
                    artist: resolvedArtist,
                    album: 'Music Video',
                    coverUrl: MediaNormalizer.upgradeArtworkUrl(
                      it['thumbnail'] as String?,
                      videoId: id,
                    ),
                    durationSeconds: (it['duration'] as num?)?.toInt() ?? 240,
                    source: 'youtube',
                    isVideo: true,
                    year: vidYear,
                  ),
                );
              }
            } else if (title.contains('album')) {
              for (final it in items) {
                if (it is! Map) continue;
                final rawTitle = MediaNormalizer.cleanTitle(
                  it['title'] as String?,
                );
                final rawType = (it['albumType'] ?? '').toString().trim();
                final isSingleFlag =
                    it['isSingle'] == true ||
                    rawType.toLowerCase() == 'single' ||
                    rawTitle.toLowerCase().endsWith('- single');
                final target = isSingleFlag ? singles : albums;
                target.add({
                  'title': rawTitle,
                  'year': it['year']?.toString() ?? '',
                  'browseId': it['browseId'] ?? it['id'],
                  'albumType': isSingleFlag
                      ? 'Single'
                      : (rawType.isNotEmpty ? rawType : 'Album'),
                  'isSingle': isSingleFlag,
                  'coverUrl': MediaNormalizer.upgradeArtworkUrl(
                    it['thumbnail'] as String?,
                  ),
                });
              }
            } else if (title.contains('single') || title.contains('ep')) {
              for (final it in items) {
                if (it is! Map) continue;
                final rawTitle = MediaNormalizer.cleanTitle(
                  it['title'] as String?,
                );
                final rawType = (it['albumType'] ?? '').toString().trim();
                singles.add({
                  'title': rawTitle,
                  'year': it['year']?.toString() ?? '',
                  'browseId': it['browseId'] ?? it['id'],
                  'albumType': rawType.isNotEmpty ? rawType : 'Single',
                  'isSingle': true,
                  'coverUrl': MediaNormalizer.upgradeArtworkUrl(
                    it['thumbnail'] as String?,
                  ),
                });
              }
            } else if (title.contains('playlist')) {
              for (final it in items) {
                if (it is! Map) continue;
                playlists.add({
                  'title': MediaNormalizer.cleanTitle(it['title'] as String?),
                  'browseId': it['id'],
                  'coverUrl': MediaNormalizer.upgradeArtworkUrl(
                    it['thumbnail'] as String?,
                  ),
                });
              }
            } else if (title.contains('related') ||
                title.contains('similar') ||
                title.contains('fans might')) {
              for (final it in items) {
                if (it is! Map) continue;
                related.add({
                  'name': MediaNormalizer.cleanTitle(it['title'] as String?),
                  'subs': 'Artist',
                  'imageUrl': MediaNormalizer.upgradeArtworkUrl(
                    it['thumbnail'] as String?,
                    isArtistAvatar: true,
                  ),
                  'browseId': it['id'],
                });
              }
            }
          }

          return {
            'name': name.isNotEmpty ? name : (artistName ?? 'Artist'),
            'bio': bio,
            'subscriberCount': subscriberCount,
            'monthlyListenerCount': monthlyListenerCount,
            'thumb': thumb,
            'banner': banner,
            'topSongs': topSongs,
            'albums': albums,
            'singles': singles,
            'playlists': playlists,
            'related': related,
            'videos': videos,
            'sections': sections,
          };
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getArtist error: $e');
      }
    }

    if (browseId.trim().isEmpty) return null;
    try {
      final res = await post('browse', {
        'browseId': browseId,
      }, ttl: _tArtistPage);
      final sections =
          res['contents']?['singleColumnBrowseResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'] ??
          res['contents']?['sectionListRenderer']?['contents'];

      var header =
          res['header']?['musicImmersiveHeaderRenderer'] ??
          res['header']?['musicVisualHeaderRenderer'] ??
          res['header']?['musicHeaderRenderer'] ??
          res['header']?['musicResponsiveHeaderRenderer'];

      if (header == null && sections is List && sections.isNotEmpty) {
        final sec0 = sections[0];
        if (sec0 is Map) {
          header =
              sec0['musicResponsiveHeaderRenderer'] ??
              sec0['musicVisualHeaderRenderer'];
        }
      }

      final bannerThumbs =
          header?['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
              as List? ??
          header?['thumbnail']?['thumbnails'] as List?;
      final fgThumbs =
          header?['foregroundThumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
              as List? ??
          header?['thumbnail']?['croppedSquareThumbnailRenderer']?['thumbnail']?['thumbnails']
              as List? ??
          header?['straplineThumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails']
              as List?;
      final thumbs = bannerThumbs ?? fgThumbs;
      final rawBanner = bannerThumbs?.isNotEmpty == true
          ? bannerThumbs!.last['url'] as String
          : null;
      final rawFg = fgThumbs?.isNotEmpty == true
          ? fgThumbs!.last['url'] as String
          : null;
      final rawThumb =
          rawFg ??
          rawBanner ??
          (thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String : null);

      final topSongs = <Track>[];
      final albums = <Map<String, dynamic>>[];
      final singles = <Map<String, dynamic>>[];
      final playlists = <Map<String, dynamic>>[];
      final related = <Map<String, dynamic>>[];
      final videos = <Track>[];

      if (sections is List) {
        for (final section in sections) {
          if (section is! Map) continue;
          final shelf =
              section['musicShelfRenderer'] ??
              section['musicCarouselShelfRenderer'];
          if (shelf == null) continue;

          final shelfTitle =
              (shelf['title']?['runs']?[0]?['text'] ??
                      shelf['header']?['musicCarouselShelfBasicHeaderRenderer']?['title']?['runs']?[0]?['text'] ??
                      '')
                  .toString()
                  .toLowerCase();
          final contents = shelf['contents'] as List? ?? const [];

          final isSongShelf =
              shelfTitle.contains('song') ||
              shelfTitle.contains('popular') ||
              shelfTitle.contains('top') ||
              shelfTitle.contains('track') ||
              (topSongs.isEmpty && shelf.containsKey('contents'));

          if (isSongShelf) {
            for (final item in contents) {
              final t = _parseResponsiveListItem(
                item['musicResponsiveListItemRenderer'],
              );
              if (t != null) topSongs.add(t);
            }

            // Follow shelf "More" / "See All" browse endpoint to get full songs list
            final moreEndpoint =
                shelf['bottomEndpoint']?['browseEndpoint'] ??
                shelf['header']?['musicCarouselShelfBasicHeaderRenderer']?['moreContentButton']?['buttonRenderer']?['navigationEndpoint']?['browseEndpoint'];
            final moreBrowseId = moreEndpoint?['browseId'] as String?;
            final moreParams = moreEndpoint?['params'] as String?;
            if (moreBrowseId != null && topSongs.length < 25) {
              try {
                final moreBody = <String, dynamic>{'browseId': moreBrowseId};
                if (moreParams != null) moreBody['params'] = moreParams;
                final moreRes = await post(
                  'browse',
                  moreBody,
                  ttl: _tArtistPage,
                );
                final moreContents =
                    moreRes['contents']?['singleColumnBrowseResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'] ??
                    moreRes['contents']?['sectionListRenderer']?['contents'];
                if (moreContents is List) {
                  for (final sec in moreContents) {
                    final items =
                        sec['musicShelfRenderer']?['contents'] ??
                        sec['musicPlaylistShelfRenderer']?['contents'];
                    if (items is List) {
                      for (final it in items) {
                        final t = _parseResponsiveListItem(
                          it['musicResponsiveListItemRenderer'],
                        );
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
            final moreAlbumEndpoint =
                shelf['bottomEndpoint']?['browseEndpoint'] ??
                shelf['header']?['musicCarouselShelfBasicHeaderRenderer']?['moreContentButton']?['buttonRenderer']?['navigationEndpoint']?['browseEndpoint'];
            final moreAlbumBrowseId = moreAlbumEndpoint?['browseId'] as String?;
            final moreAlbumParams = moreAlbumEndpoint?['params'] as String?;
            if (moreAlbumBrowseId != null && albums.length < 15) {
              try {
                final moreBody = <String, dynamic>{
                  'browseId': moreAlbumBrowseId,
                };
                if (moreAlbumParams != null)
                  moreBody['params'] = moreAlbumParams;
                final moreRes = await post(
                  'browse',
                  moreBody,
                  ttl: _tArtistPage,
                );
                final moreContents =
                    moreRes['contents']?['singleColumnBrowseResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'] ??
                    moreRes['contents']?['sectionListRenderer']?['contents'];
                if (moreContents is List) {
                  for (final sec in moreContents) {
                    final items =
                        sec['gridRenderer']?['items'] ??
                        sec['musicShelfRenderer']?['contents'] ??
                        sec['musicCarouselShelfRenderer']?['contents'];
                    if (items is List) {
                      for (final it in items) {
                        final c = _twoRowCard(it);
                        if (c != null &&
                            !albums.any(
                              (a) => a['browseId'] == c['browseId'],
                            )) {
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
          } else if (shelfTitle.contains('video')) {
            for (final item in contents) {
              final c = _twoRowCard(item);
              if (c != null) {
                final vid = c['videoId'] ?? c['browseId'] ?? c['id'];
                if (vid != null) {
                  final rawTitle = c['title'] ?? 'Video';
                  String resolvedArtist =
                      (c['subtitle'] != null &&
                          c['subtitle'].toString().isNotEmpty &&
                          c['subtitle'].toString().toLowerCase() !=
                              'unknown artist' &&
                          !MediaNormalizer.isDistributorOrLabel(
                            c['subtitle'].toString(),
                          ))
                      ? c['subtitle'].toString()
                      : MediaNormalizer.extractArtistsFromVideoTitle(
                          rawTitle,
                          defaultArtist: artistName ?? 'Artist',
                        );
                  if (resolvedArtist.isEmpty) {
                    resolvedArtist = artistName ?? 'Artist';
                  }
                  String? vidYear = c['year']?.toString();
                  if (vidYear == null || vidYear.isEmpty) {
                    final sub = c['subtitle']?.toString() ?? '';
                    final ym =
                        RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(sub) ??
                        RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(rawTitle);
                    if (ym != null) vidYear = ym.group(0);
                  }
                  videos.add(
                    Track(
                      id: 'yt-$vid',
                      title: rawTitle,
                      artist: resolvedArtist,
                      album: 'Music Video',
                      coverUrl: c['coverUrl'] ?? '',
                      durationSeconds: 240,
                      source: 'youtube',
                      isVideo: true,
                      year: vidYear,
                    ),
                  );
                }
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
        'subscriberCount':
            header?['subscriptionButton']?['subscribeButtonRenderer']?['subscriberCountText']?['runs']?[0]?['text']
                as String?,
        'thumb': rawThumb != null
            ? MediaNormalizer.upgradeArtworkUrl(rawThumb, isArtistAvatar: true)
            : null,
        'banner': (rawBanner ?? rawThumb) != null
            ? MediaNormalizer.upgradeBannerUrl((rawBanner ?? rawThumb)!)
            : null,
        'topSongs': topSongs,
        'albums': albums,
        'singles': singles,
        'playlists': playlists,
        'related': related,
        'videos': videos,
      };
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getArtistChannel error: $e');
      return null;
    }
  }

  /// Fetches full album/single tracklist and metadata from YouTube Music browseId.
  Future<
    ({
      List<Track> tracks,
      String coverUrl,
      String? title,
      String? artist,
      List<String>? artists,
      int? year,
      String? label,
      String? description,
      String? albumType,
    })?
  >
  getAlbum(
    String browseId, {
    String? albumTitle,
    String? artistName,
    String? videoId,
    String? songTitle,
    bool isSingle = false,
    bool isVideo = false,
  }) async {
    if (isVideo) return null;

    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMethod<Map<dynamic, dynamic>>('getAlbum', {
              'browseId': browseId,
              'title': albumTitle ?? '',
              'albumTitle': albumTitle ?? '',
              'artist': artistName ?? '',
              'artistName': artistName ?? '',
              'videoId': videoId ?? '',
              'songTitle': songTitle ?? '',
              'isSingle': isSingle,
              'isVideo': isVideo,
            })
            .timeout(const Duration(seconds: 12), onTimeout: () => null);
        if (res != null && res.isNotEmpty) {
          final albumMap = Map<String, dynamic>.from(
            res['album'] as Map? ?? {},
          );
          final rawAlbType = albumMap['albumType']?.toString();
          final isSingleResolved =
              isSingle ||
              albumMap['isSingle'] == true ||
              (rawAlbType ?? '').toLowerCase() == 'single';
          final resolvedTitle = isSingleResolved
              ? MediaNormalizer.cleanTitle(albumMap['title'] as String?)
              : MediaNormalizer.cleanAlbumTitle(albumMap['title'] as String?);
          final titleToUse = resolvedTitle.isNotEmpty
              ? resolvedTitle
              : (albumTitle ?? (isSingleResolved ? 'Single' : 'Album'));
          final coverUrl = MediaNormalizer.upgradeArtworkUrl(
            albumMap['thumbnail'] as String?,
          );
          final resolvedBrowseId =
              AlbumResolver.sanitizeAlbumBrowseId(
                (albumMap['browseId'] ?? albumMap['id'])?.toString(),
              ) ??
              AlbumResolver.sanitizeAlbumBrowseId(browseId);
          final rawArtists = albumMap['artists'] as List?;
          final artistsList = rawArtists
              ?.map(
                (a) => a is Map ? (a['name']?.toString() ?? '') : a.toString(),
              )
              .where((name) => name.isNotEmpty)
              .toList();
          final artistResolved = (artistsList != null && artistsList.isNotEmpty)
              ? artistsList.join(', ')
              : (albumMap['artist']?.toString() ?? artistName);
          final year = (albumMap['year'] as num?)?.toInt();
          final rawSongs = res['songs'] as List? ?? const [];
          final tracks = <Track>[];
          for (final s in rawSongs) {
            if (s is! Map) continue;
            final id = s['id'] as String?;
            if (id == null || id.isEmpty) continue;
            tracks.add(
              Track(
                id: 'yt-$id',
                title: MediaNormalizer.cleanTitle(s['title'] as String?),
                artist: MediaNormalizer.formatArtists(
                  (s['artists'] as List?)
                      ?.map((a) => a is Map ? a['name'] : a)
                      .toList(),
                ),
                album: titleToUse,
                albumBrowseId: resolvedBrowseId,
                coverUrl: MediaNormalizer.upgradeArtworkUrl(
                  s['thumbnail'] as String?,
                  videoId: id,
                ),
                durationSeconds: (s['duration'] as num?)?.toInt() ?? 210,
                source: 'youtube',
              ),
            );
          }
          if (tracks.isNotEmpty) {
            final computedType = isSingleResolved
                ? (tracks.length >= 2 && tracks.length <= 6 ? 'EP' : 'Single')
                : (rawAlbType != null && rawAlbType.isNotEmpty
                      ? rawAlbType
                      : (tracks.length == 1
                            ? 'Single'
                            : (tracks.length <= 6 ? 'EP' : 'Album')));
            return (
              tracks: tracks,
              coverUrl: coverUrl,
              title: titleToUse,
              artist: artistResolved,
              artists: artistsList,
              year: year,
              label: null,
              description: null,
              albumType: computedType,
            );
          }
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getAlbum error: $e');
      }
    }

    if (browseId.isNotEmpty) {
      try {
        final res = await post('browse', {
          'browseId': browseId,
        }, ttl: const Duration(hours: 12));
        final header =
            res['header']?['musicDetailHeaderRenderer'] ??
            res['header']?['musicResponsiveHeaderRenderer'] ??
            res['contents']?['twoColumnBrowseResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents']?[0]?['musicResponsiveHeaderRenderer'];

        String coverUrl = '';
        final thumbs =
            (header?['thumbnail']?['croppedSquareThumbnailRenderer']?['thumbnail']?['thumbnails'] ??
                    header?['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'])
                as List?;
        if (thumbs != null && thumbs.isNotEmpty) {
          coverUrl = upgradeArtworkUrl(thumbs.last['url'] as String);
        }

        final rawTitle = (header?['title']?['runs']?[0]?['text'] ?? '')
            .toString();
        final albumTitleResolved = isSingle
            ? MediaNormalizer.cleanTitle(rawTitle)
            : MediaNormalizer.cleanAlbumTitle(rawTitle);
        final titleToUse = albumTitleResolved.isNotEmpty
            ? albumTitleResolved
            : (albumTitle ?? (isSingle ? 'Single' : 'Album'));

        // Extract artists, release type, and release year from subtitle runs
        final subtitleRuns = header?['subtitle']?['runs'] as List? ?? [];
        String? fallbackArtist;
        int? fallbackYear;
        String? parsedAlbumType;
        for (final run in subtitleRuns) {
          final text = (run['text'] ?? '').toString().trim();
          final lower = text.toLowerCase();
          final parsedYear = int.tryParse(text);
          if (parsedYear != null && parsedYear > 1900 && parsedYear < 2100) {
            fallbackYear = parsedYear;
          } else if (lower == 'single') {
            parsedAlbumType ??= 'Single';
          } else if (lower == 'ep') {
            parsedAlbumType ??= 'EP';
          } else if (lower == 'album') {
            parsedAlbumType ??= 'Album';
          } else if (text.isNotEmpty && text != '•') {
            fallbackArtist ??= text;
          }
        }

        final strapline = header?['straplineTextOne']?['runs']?[0]?['text']
            ?.toString();
        final description = header?['description']?['runs']?[0]?['text']
            ?.toString();

        final tracks = <Track>[];
        final sectionList =
            res['contents']?['singleColumnBrowseResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents']
                as List?;

        final List<Map<String, dynamic>> shelves = [];
        if (sectionList != null && sectionList.isNotEmpty) {
          for (final sec in sectionList) {
            final shelf =
                sec['musicShelfRenderer'] ?? sec['musicPlaylistShelfRenderer'];
            if (shelf is Map<String, dynamic>) shelves.add(shelf);
          }
        }
        final twoCol = res['contents']?['twoColumnBrowseResultsRenderer'];
        if (twoCol != null) {
          final secContents =
              twoCol['secondaryContents']?['sectionListRenderer']?['contents']
                  as List?;
          if (secContents != null) {
            for (final s in secContents) {
              final shelf =
                  s['musicPlaylistShelfRenderer'] ?? s['musicShelfRenderer'];
              if (shelf is Map<String, dynamic>) shelves.add(shelf);
            }
          }
          final tabSecs =
              twoCol['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents']
                  as List?;
          if (tabSecs != null) {
            for (final s in tabSecs) {
              final shelf =
                  s['musicPlaylistShelfRenderer'] ?? s['musicShelfRenderer'];
              if (shelf is Map<String, dynamic>) shelves.add(shelf);
            }
          }
        }

        for (final shelf in shelves) {
          final contents = shelf['contents'] as List?;
          if (contents != null) {
            for (final item in contents) {
              final t = _parseResponsiveListItem(
                item['musicResponsiveListItemRenderer'],
              );
              if (t != null) {
                if (titleToUse.isNotEmpty &&
                    (t.album == 'Single' || t.album.isEmpty)) {
                  tracks.add(t.copyWith(album: titleToUse));
                } else {
                  tracks.add(t);
                }
              }
            }
          }
        }

        return (
          tracks: tracks,
          coverUrl: coverUrl,
          title: titleToUse,
          artist: strapline ?? fallbackArtist ?? artistName,
          artists: fallbackArtist != null ? [fallbackArtist] : null,
          year: fallbackYear,
          label: strapline,
          description: description,
          albumType: isSingle
              ? (tracks.length >= 2 && tracks.length <= 6 ? 'EP' : 'Single')
              : (parsedAlbumType ??
                    (tracks.length == 1
                        ? 'Single'
                        : (tracks.length <= 6 ? 'EP' : 'Album'))),
        );
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] getAlbum error: $e');
        return null;
      }
    }
    return null;
  }

  /// Fetches playlist tracklist and metadata from YouTube Music playlistId / browseId.
  Future<({List<Track> tracks, String coverUrl, String title, String author})?>
  getPlaylist(String playlistId) async {
    var cleanId = playlistId.trim();
    if (cleanId.startsWith('VL')) cleanId = cleanId.substring(2);
    final qIdx = cleanId.indexOf('?');
    if (qIdx != -1) cleanId = cleanId.substring(0, qIdx);
    final ampIdx = cleanId.indexOf('&');
    if (ampIdx != -1) cleanId = cleanId.substring(0, ampIdx);

    // 1. PRIMARY (Android Native): Instant Metrolist YouTube.playlist pipeline (~600-800ms)
    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMethod<Map<dynamic, dynamic>>('getPlaylist', {
              'playlistId': cleanId,
              'browseId': cleanId,
            })
            .timeout(const Duration(seconds: 20), onTimeout: () => null);
        if (res != null && res.isNotEmpty) {
          final tracks = <Track>[];
          final rawTracks =
              (res['songs'] as List?) ?? (res['tracks'] as List?) ?? const [];
          if (rawTracks.isNotEmpty) {
            final pMeta = res['playlist'] is Map
                ? res['playlist'] as Map
                : null;
            final fallbackTitle =
                (pMeta?['title'] as String?) ??
                (res['title'] as String?) ??
                'Playlist';
            for (final it in rawTracks) {
              if (it is! Map) continue;
              final id = it['id'] as String?;
              if (id == null || id.isEmpty) continue;
              tracks.add(
                Track(
                  id: 'yt-$id',
                  title: MediaNormalizer.cleanTitle(it['title'] as String?),
                  artist: MediaNormalizer.formatArtists(
                    (it['artists'] as List?)
                        ?.map((a) => a is Map ? a['name'] : a)
                        .toList(),
                  ),
                  album: it['album'] is Map
                      ? MediaNormalizer.cleanTitle(
                          it['album']['name'] as String?,
                        )
                      : fallbackTitle,
                  coverUrl: MediaNormalizer.upgradeArtworkUrl(
                    it['thumbnail'] as String?,
                    videoId: id,
                  ),
                  durationSeconds: (it['duration'] as num?)?.toInt() ?? 210,
                  source: 'youtube',
                ),
              );
            }
            if (tracks.isNotEmpty) {
              final coverUrl = MediaNormalizer.upgradeArtworkUrl(
                (pMeta?['thumbnail'] as String?) ??
                    (res['thumbnail'] as String?),
              );
              final title = fallbackTitle;
              final author =
                  (pMeta?['author'] as String?) ??
                  (res['author'] as String?) ??
                  'YouTube Music';
              return (
                tracks: tracks,
                coverUrl: coverUrl.isNotEmpty
                    ? coverUrl
                    : tracks.first.coverUrl,
                title: title.isNotEmpty ? title : 'YouTube Playlist',
                author: author.isNotEmpty ? author : 'YouTube Music',
              );
            }
          }
        }
      } catch (e) {
        if (kDebugMode)
          debugPrint('[InnerTube] Native getPlaylist error for $cleanId: $e');
      }
    }

    // 2. HTTP BROWSE: Direct InnerTube HTTP Browse (Web/Desktop or Native fallback)
    try {
      final browseRes = await post('browse', {
        'browseId': 'VL$cleanId',
      }, ttl: const Duration(hours: 6)).timeout(const Duration(seconds: 16));

      final twoCol = browseRes['contents']?['twoColumnBrowseResultsRenderer'];
      final singleCol =
          browseRes['contents']?['singleColumnBrowseResultsRenderer'];

      final header =
          browseRes['header']?['musicDetailHeaderRenderer'] ??
          browseRes['header']?['musicResponsiveHeaderRenderer'] ??
          browseRes['header']?['musicEditablePlaylistDetailHeaderRenderer']?['header']?['musicResponsiveHeaderRenderer'] ??
          twoCol?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents']?[0]?['musicResponsiveHeaderRenderer'] ??
          twoCol?['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents']?[0]?['musicEditablePlaylistDetailHeaderRenderer']?['header']?['musicResponsiveHeaderRenderer'];

      String coverUrl = '';
      final thumbs =
          (header?['thumbnail']?['croppedSquareThumbnailRenderer']?['thumbnail']?['thumbnails'] ??
                  header?['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'])
              as List?;
      if (thumbs != null && thumbs.isNotEmpty) {
        coverUrl = upgradeArtworkUrl(thumbs.last['url'] as String);
      }

      String title = (header?['title']?['runs']?[0]?['text'] ?? '').toString();
      String author = (header?['subtitle']?['runs']?[0]?['text'] ?? '')
          .toString();

      if (title.isEmpty) {
        final mf = browseRes['microformat']?['microformatDataRenderer'];
        title = (mf?['title'] ?? '').toString();
        if (author.isEmpty) {
          author = (mf?['description'] ?? 'YouTube Music').toString();
        }
      }
      if (author.isEmpty) author = 'YouTube Music';

      final List<Map<String, dynamic>> shelves = [];
      void extractShelves(dynamic container) {
        if (container is! List) return;
        for (final s in container) {
          if (s is! Map) continue;
          final shelf =
              s['musicPlaylistShelfRenderer'] ?? s['musicShelfRenderer'];
          if (shelf is Map<String, dynamic>) {
            shelves.add(shelf);
          } else if (s['itemSectionRenderer']?['contents'] is List) {
            for (final sub in (s['itemSectionRenderer']['contents'] as List)) {
              if (sub is Map) {
                final subShelf =
                    sub['musicPlaylistShelfRenderer'] ??
                    sub['musicShelfRenderer'];
                if (subShelf is Map<String, dynamic>) shelves.add(subShelf);
              }
            }
          }
        }
      }

      if (singleCol != null) {
        extractShelves(
          singleCol['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'],
        );
      }
      if (twoCol != null) {
        extractShelves(
          twoCol['secondaryContents']?['sectionListRenderer']?['contents'],
        );
        extractShelves(
          twoCol['tabs']?[0]?['tabRenderer']?['content']?['sectionListRenderer']?['contents'],
        );
      }
      extractShelves(
        browseRes['contents']?['sectionListRenderer']?['contents'],
      );

      final tracks = <Track>[];
      for (final shelf in shelves) {
        final contents = shelf['contents'] as List?;
        if (contents != null) {
          for (final item in contents) {
            final t = _parseResponsiveListItem(
              item['musicResponsiveListItemRenderer'],
            );
            if (t != null) tracks.add(t);
          }
        }
      }

      if (tracks.isNotEmpty) {
        if (coverUrl.isEmpty) {
          coverUrl = tracks.first.coverUrl;
        }
        return (
          tracks: tracks,
          coverUrl: coverUrl,
          title: title.isNotEmpty ? title : 'YouTube Playlist',
          author: author.isNotEmpty ? author : 'YouTube Music',
        );
      }
    } catch (e) {
      if (kDebugMode)
        debugPrint('[InnerTube] Direct getPlaylist error for $cleanId: $e');
    }

    return null;
  }

  static const int _maxVideoDetailsCache = 200;
  final Map<String, VideoDetailsResult> _videoDetailsCache = {};
  final Map<String, Future<VideoDetailsResult?>> _videoDetailsInflight = {};

  void _storeVideoDetails(String cleanId, VideoDetailsResult res) {
    if (_videoDetailsCache.length >= _maxVideoDetailsCache &&
        !_videoDetailsCache.containsKey(cleanId)) {
      _videoDetailsCache.remove(_videoDetailsCache.keys.first);
    }
    _videoDetailsCache[cleanId] = res;
  }

  /// Synchronously returns already-cached video details without hitting the network.
  VideoDetailsResult? getCachedVideoDetails(String videoId) {
    final cleanId = videoId.replaceFirst(RegExp(r'^(yt-|yt:)'), '').trim();
    if (cleanId.isEmpty) return null;
    return _videoDetailsCache[cleanId];
  }

  /// Fetches comprehensive video details including original upload/posted date,
  /// description credits, YouTube "Music in this video" panel, clean song title,
  /// and authentic artist names (bypassing distributors/producers/actors).
  Future<VideoDetailsResult?> getVideoDetails(String videoId) async {
    final cleanId = videoId.replaceFirst(RegExp(r'^(yt-|yt:)'), '').trim();
    if (cleanId.isEmpty) return null;

    final cached = _videoDetailsCache[cleanId];
    if (cached != null) return cached;

    final inflight = _videoDetailsInflight[cleanId];
    if (inflight != null) return inflight;

    final fut = _fetchVideoDetails(cleanId)
        .then((res) {
          if (res != null) {
            _storeVideoDetails(cleanId, res);
          }
          return res;
        })
        .whenComplete(() {
          _videoDetailsInflight.remove(cleanId);
        });

    _videoDetailsInflight[cleanId] = fut;
    return fut;
  }

  static void _scanMusicInfoRowsJson(dynamic node, Map<String, String> out) {
    if (node is Map) {
      final infoRow = node['infoRowRenderer'];
      if (infoRow is Map) {
        String readText(dynamic o) {
          if (o is! Map) return '';
          final s = o['simpleText']?.toString().trim() ?? '';
          if (s.isNotEmpty) return s;
          final runs = o['runs'] as List?;
          if (runs == null) return '';
          return runs
              .whereType<Map>()
              .map((r) => r['text']?.toString() ?? '')
              .join()
              .trim();
        }

        final label = readText(infoRow['title']).toLowerCase();
        var value = readText(infoRow['defaultMetadata']);
        if (value.isEmpty) value = readText(infoRow['expandedMetadata']);
        if (value.isNotEmpty) {
          if (label == 'song' && !out.containsKey('song')) {
            out['song'] = value;
          } else if ((label == 'artist' || label == 'artists') &&
              !out.containsKey('artist')) {
            out['artist'] = value;
          } else if (label == 'album' && !out.containsKey('album')) {
            out['album'] = value;
          }
        }
      }
      for (final entry in node.entries) {
        if (entry.key == 'infoRowRenderer') continue;
        _scanMusicInfoRowsJson(entry.value, out);
        if (out.containsKey('song') && out.containsKey('artist')) break;
      }
    } else if (node is List) {
      for (final item in node) {
        _scanMusicInfoRowsJson(item, out);
        if (out.containsKey('song') && out.containsKey('artist')) break;
      }
    }
  }

  Future<Map<String, String>> _fetchMusicPanelFromWebNext(
    String cleanId,
  ) async {
    final out = <String, String>{};
    try {
      final client = HttpClient()
        ..connectionTimeout = const Duration(seconds: 6);
      try {
        final req = await client.postUrl(
          Uri.parse(
            'https://www.youtube.com/youtubei/v1/next?prettyPrint=false',
          ),
        );
        req.headers.set('Content-Type', 'application/json');
        req.headers.set(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );
        req.headers.set('Origin', 'https://www.youtube.com');
        req.headers.set('Referer', 'https://www.youtube.com/');
        final payload = utf8.encode(
          jsonEncode({
            'context': {
              'client': {
                'clientName': 'WEB',
                'clientVersion': '2.20240101.01.00',
                'hl': 'en',
                'gl': CountryService.instance.currentCode,
              },
            },
            'videoId': cleanId,
          }),
        );
        req.contentLength = payload.length;
        req.add(payload);
        final res = await req.close().timeout(const Duration(seconds: 6));
        if (res.statusCode == 200) {
          final body = await res.transform(utf8.decoder).join();
          final json = jsonDecode(body);
          if (json is Map) {
            _scanMusicInfoRowsJson(json['engagementPanels'], out);
          }
        }
      } finally {
        client.close(force: false);
      }
    } catch (_) {}
    return out;
  }

  Future<VideoDetailsResult?> _buildCleanVideoDetails({
    required String cleanId,
    required String title,
    required String author,
    String? publishDate,
    String? uploadDate,
    String? year,
    required String description,
    String? musicPanelSong,
    String? musicPanelArtist,
    String? musicPanelAlbum,
  }) async {
    var resolvedYear = year;
    if (resolvedYear == null || resolvedYear.isEmpty) {
      if (publishDate != null && publishDate.length >= 4) {
        resolvedYear = publishDate.substring(0, 4);
      } else if (uploadDate != null && uploadDate.length >= 4) {
        resolvedYear = uploadDate.substring(0, 4);
      }
    }
    if (resolvedYear == null || resolvedYear.isEmpty) {
      resolvedYear = MediaNormalizer.extractYearFromDescription(description);
    }
    if (resolvedYear == null || resolvedYear.isEmpty) {
      final ym = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(title);
      if (ym != null) resolvedYear = ym.group(0);
    }

    final descArtists = MediaNormalizer.extractArtistsFromDescription(
      description,
    );
    final descTitle = MediaNormalizer.extractTitleFromDescription(description);
    final descMovie = MediaNormalizer.extractMovieOrAlbumFromDescription(
      description,
    );

    final rawPanelArtist = (musicPanelArtist ?? '').trim();
    final panelArtist = (rawPanelArtist.isNotEmpty &&
            !MediaNormalizer.isDistributorOrLabel(rawPanelArtist) &&
            !MediaNormalizer.isNonArtistCreditSegment(rawPanelArtist))
        ? MediaNormalizer.formatArtists(rawPanelArtist)
        : '';

    final rawPanelSong = (musicPanelSong ?? '').trim();
    final panelSong =
        rawPanelSong.isNotEmpty &&
                !MediaNormalizer.isDistributorOrLabel(rawPanelSong)
            ? rawPanelSong
            : null;
    final rawPanelAlbum = (musicPanelAlbum ?? '').trim();
    final panelAlbum =
        rawPanelAlbum.isNotEmpty &&
                !MediaNormalizer.isDistributorOrLabel(rawPanelAlbum)
            ? MediaNormalizer.cleanAlbumTitle(rawPanelAlbum)
            : null;

    var artists = '';
    if (descArtists.isNotEmpty && descArtists.toLowerCase() != 'unknown artist') {
      artists = descArtists;
    } else if (panelArtist.isNotEmpty &&
        panelArtist.toLowerCase() != 'unknown artist') {
      artists = panelArtist;
    }

    if (artists.isEmpty || MediaNormalizer.isDistributorOrLabel(artists)) {
      artists = MediaNormalizer.extractArtistsFromVideoTitle(title);
    }

    if (artists.isEmpty &&
        author.trim().isNotEmpty &&
        !MediaNormalizer.isDistributorOrLabel(author) &&
        !MediaNormalizer.isNonArtistCreditSegment(author)) {
      final cleanedAuthor = MediaNormalizer.cleanArtistName(author);
      if (cleanedAuthor.isNotEmpty &&
          cleanedAuthor.toLowerCase() != 'unknown artist') {
        artists = cleanedAuthor;
      }
    }

    final movieHint = descMovie ?? panelAlbum;
    final preferredDescTitle = panelSong ?? descTitle;
    var cleanTitle = MediaNormalizer.cleanVideoTitle(
      title,
      knownArtists: artists,
      knownMovieOrAlbum: movieHint,
      descriptionTitle: preferredDescTitle,
    );

    // Multi-source fallback: cross-reference official YouTube Music audio track if credits are missing
    if ((artists.isEmpty ||
            artists.toLowerCase() == 'unknown artist' ||
            MediaNormalizer.isDistributorOrLabel(artists)) &&
        cleanTitle.length >= 2 &&
        cleanTitle != 'Unknown Title') {
      try {
        final songQuery = movieHint != null && movieHint.isNotEmpty
            ? '$cleanTitle $movieHint'
            : cleanTitle;
        final candidates = _useNative
            ? await searchSongsNative(songQuery).timeout(
                const Duration(seconds: 4),
                onTimeout: () => const [],
              )
            : const <Track>[];
        for (final cand in candidates) {
          if (cand.isVideo) continue;
          if (!AlbumResolver.titlesMatch(cleanTitle, cand.title)) continue;
          if (AlbumResolver.isVariantConflict(title, cand.title)) continue;
          final candArtist = cand.artist.trim();
          if (candArtist.isEmpty ||
              candArtist.toLowerCase() == 'unknown artist' ||
              MediaNormalizer.isDistributorOrLabel(candArtist)) {
            continue;
          }
          artists = MediaNormalizer.formatArtists(candArtist);
          if ((resolvedYear == null || resolvedYear.isEmpty) &&
              cand.year != null &&
              cand.year!.isNotEmpty) {
            resolvedYear = cand.year;
          }
          cleanTitle = MediaNormalizer.cleanVideoTitle(
            title,
            knownArtists: artists,
            knownMovieOrAlbum: movieHint,
            descriptionTitle: preferredDescTitle,
          );
          break;
        }
      } catch (_) {}
    }

    return VideoDetailsResult(
      videoId: cleanId,
      title: title,
      cleanTitle: cleanTitle,
      author: author,
      publishDate: publishDate,
      uploadDate: uploadDate,
      year: (resolvedYear != null && resolvedYear.isNotEmpty)
          ? resolvedYear
          : null,
      description: description,
      artists: artists,
      musicPanelSong: panelSong,
      musicPanelArtist: panelArtist.isNotEmpty ? panelArtist : null,
      musicPanelAlbum: panelAlbum,
    );
  }

  /// Checks whether a video track needs background enrichment (noisy title, distributor/missing artist, or missing year).
  static bool needsVideoEnrichment(
    Track vt, {
    bool requireYear = false,
  }) {
    final cleanedTitle = MediaNormalizer.cleanVideoTitle(
      vt.title,
      knownArtists: vt.artist,
    );
    final rawArtist = vt.artist.trim();
    final badArtist =
        rawArtist.isEmpty ||
        rawArtist.toLowerCase() == 'unknown artist' ||
        rawArtist.toLowerCase() == 'youtube music' ||
        MediaNormalizer.isDistributorOrLabel(rawArtist) ||
        MediaNormalizer.isNonArtistCreditSegment(rawArtist);
    final badTitle =
        cleanedTitle != vt.title ||
        vt.title.contains('|') ||
        vt.title.contains('#') ||
        RegExp(r'\b(video\s*song|lyric(?:al)?\s*video|official\s*video|4k)\b',
                caseSensitive: false)
            .hasMatch(vt.title);
    final badYear =
        requireYear &&
        (vt.year == null ||
            !RegExp(r'\b(19\d{2}|20\d{2})\b').hasMatch(vt.year!));
    return badArtist || badTitle || badYear;
  }

  static Track _applyVideoDetailsToTrack(
    Track vt,
    VideoDetailsResult details, {
    String? knownArtist,
  }) {
    var resolvedArtist = details.artists.trim();
    if (resolvedArtist.isEmpty ||
        MediaNormalizer.isDistributorOrLabel(resolvedArtist)) {
      final currentClean = MediaNormalizer.formatArtists(vt.artist);
      if (currentClean.isNotEmpty &&
          currentClean.toLowerCase() != 'unknown artist' &&
          !MediaNormalizer.isDistributorOrLabel(currentClean) &&
          !MediaNormalizer.isNonArtistCreditSegment(currentClean)) {
        resolvedArtist = currentClean;
      } else if (knownArtist != null &&
          knownArtist.trim().isNotEmpty &&
          !MediaNormalizer.isDistributorOrLabel(knownArtist)) {
        resolvedArtist = MediaNormalizer.cleanArtistName(knownArtist);
      }
    }

    final cleanTitle = MediaNormalizer.cleanVideoTitle(
      details.title.isNotEmpty ? details.title : vt.title,
      knownArtists: resolvedArtist,
      knownMovieOrAlbum:
          details.musicPanelAlbum ??
          MediaNormalizer.extractMovieOrAlbumFromDescription(details.description),
      descriptionTitle:
          details.cleanTitle.isNotEmpty
              ? details.cleanTitle
              : (details.musicPanelSong ??
                  MediaNormalizer.extractTitleFromDescription(details.description)),
    );

    final resolvedYear =
        (details.year != null && details.year!.isNotEmpty)
            ? details.year
            : vt.year;

    final nextArtist = resolvedArtist.isNotEmpty ? resolvedArtist : vt.artist;
    final refs = nextArtist.isNotEmpty &&
            nextArtist.toLowerCase() != 'unknown artist'
        ? ArtistRef.splitFromName(nextArtist)
        : vt.artists;

    return vt.copyWith(
      title: cleanTitle.isNotEmpty && cleanTitle != 'Unknown Title'
          ? cleanTitle
          : vt.title,
      artist: nextArtist,
      artists: refs,
      album: 'Music Video',
      isVideo: true,
      year: resolvedYear,
    );
  }

  /// Optimizes video metadata enrichment with deduplication, synchronous cache hydration,
  /// and bounded concurrency, streaming updated batches to callers.
  Future<List<Track>> enrichVideoTracks(
    List<Track> videos, {
    String? knownArtist,
    bool requireYear = false,
    int maxConcurrent = 3,
    void Function(List<Track> updated)? onBatchProgress,
  }) async {
    if (videos.isEmpty) return const [];
    final working = List<Track>.of(videos);
    final pendingIds = <String>[];
    final seenIds = <String>{};
    bool hydratedAny = false;

    for (var i = 0; i < working.length; i++) {
      final vt = working[i];
      final cleanId = vt.id.replaceFirst(RegExp(r'^(yt-|yt:)'), '').trim();
      if (cleanId.isEmpty) continue;

      final cached = getCachedVideoDetails(cleanId);
      if (cached != null) {
        final next = _applyVideoDetailsToTrack(
          vt,
          cached,
          knownArtist: knownArtist,
        );
        if (next.title != vt.title ||
            next.artist != vt.artist ||
            next.year != vt.year) {
          working[i] = next;
          hydratedAny = true;
        }
        continue;
      }

      if (needsVideoEnrichment(vt, requireYear: requireYear) &&
          seenIds.add(cleanId)) {
        pendingIds.add(cleanId);
      }
    }

    if (hydratedAny) {
      onBatchProgress?.call(List<Track>.of(working));
    }

    if (pendingIds.isEmpty) return working;

    for (var start = 0; start < pendingIds.length; start += maxConcurrent) {
      final chunk = pendingIds.sublist(
        start,
        (start + maxConcurrent).clamp(0, pendingIds.length),
      );
      final results = await Future.wait(
        chunk.map((id) => getVideoDetails(id).catchError((_) => null)),
      );
      bool batchChanged = false;
      for (var k = 0; k < chunk.length; k++) {
        final details = results[k];
        if (details == null) continue;
        final id = chunk[k];
        for (var idx = 0; idx < working.length; idx++) {
          final vt = working[idx];
          if (vt.id.replaceFirst(RegExp(r'^(yt-|yt:)'), '').trim() != id) {
            continue;
          }
          final next = _applyVideoDetailsToTrack(
            vt,
            details,
            knownArtist: knownArtist,
          );
          if (next.title != vt.title ||
              next.artist != vt.artist ||
              next.year != vt.year) {
            working[idx] = next;
            batchChanged = true;
          }
        }
      }
      if (batchChanged) {
        onBatchProgress?.call(List<Track>.of(working));
      }
    }

    return working;
  }

  Future<VideoDetailsResult?> _fetchVideoDetails(String cleanId) async {
    // 1. Try native channel first (includes player + conditional music credit panel + Kotlin LRU)
    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMapMethod<String, dynamic>('getVideoDetails', {
              'videoId': cleanId,
            })
            .timeout(const Duration(seconds: 8), onTimeout: () => null);
        if (res != null && res.isNotEmpty) {
          return _buildCleanVideoDetails(
            cleanId: cleanId,
            title: (res['title'] ?? '').toString(),
            author: (res['author'] ?? '').toString(),
            publishDate: res['publishDate']?.toString(),
            uploadDate: res['uploadDate']?.toString(),
            year: res['year']?.toString(),
            description: (res['description'] ?? '').toString(),
            musicPanelSong: res['musicPanelSong']?.toString(),
            musicPanelArtist: res['musicPanelArtist']?.toString(),
            musicPanelAlbum: res['musicPanelAlbum']?.toString(),
          );
        }
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[InnerTube] Native getVideoDetails error: $e');
        }
      }
    }

    // 2. Direct YouTube WEB player (+ conditional next panel) endpoint fallback
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 8);
    try {
      final req = await client.postUrl(
        Uri.parse(
          'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        ),
      );
      req.headers.set('Content-Type', 'application/json');
      req.headers.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      req.headers.set('Origin', 'https://www.youtube.com');
      req.headers.set('Referer', 'https://www.youtube.com/');
      final payload = utf8.encode(
        jsonEncode({
          'context': {
            'client': {
              'clientName': 'WEB',
              'clientVersion': '2.20240101.01.00',
              'hl': 'en',
              'gl': CountryService.instance.currentCode,
            },
          },
          'videoId': cleanId,
        }),
      );
      req.contentLength = payload.length;
      req.add(payload);
      final res = await req.close().timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final body = await res.transform(utf8.decoder).join();
        final json = jsonDecode(body) as Map<String, dynamic>;
        final mf = json['microformat']?['playerMicroformatRenderer'];
        final vd = json['videoDetails'];
        final pubDate = mf?['publishDate']?.toString();
        final upDate = mf?['uploadDate']?.toString();
        final desc = vd?['shortDescription']?.toString() ?? '';
        final title = vd?['title']?.toString() ?? '';
        final author = vd?['author']?.toString() ?? '';

        Map<String, String> panel = const {};
        if (MediaNormalizer.extractArtistsFromDescription(desc).isEmpty) {
          panel = await _fetchMusicPanelFromWebNext(cleanId);
        }

        return _buildCleanVideoDetails(
          cleanId: cleanId,
          title: title,
          author: author,
          publishDate: pubDate,
          uploadDate: upDate,
          description: desc,
          musicPanelSong: panel['song'],
          musicPanelArtist: panel['artist'],
          musicPanelAlbum: panel['album'],
        );
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[InnerTube] Direct getVideoDetails error: $e');
      }
    } finally {
      client.close(force: false);
    }

    return null;
  }

  /// Fetches single song/video details by videoId using native InnerTube / next queue.
  Future<Track?> getTrack(String videoId) async {
    final cleanId = videoId.replaceFirst('yt-', '').trim();
    if (cleanId.isEmpty) return null;

    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMapMethod<String, dynamic>('getSong', {'videoId': cleanId})
            .timeout(const Duration(seconds: 20), onTimeout: () => null);

        if (res != null && res.isNotEmpty) {
          final id = res['id'] as String? ?? cleanId;
          final title = MediaNormalizer.cleanTitle(res['title'] as String?);
          final artistsRaw = (res['artists'] as List?)
              ?.map((a) => a is Map ? a['name'] : a)
              .toList();
          var artist = MediaNormalizer.formatArtists(artistsRaw);
          final albRaw = res['album'];
          final album = albRaw is Map
              ? MediaNormalizer.cleanTitle(albRaw['name'] as String?)
              : 'Single';
          final albumBrowseId = _extractAlbumBrowseIdFromMap(albRaw);
          final thumb = MediaNormalizer.upgradeArtworkUrl(
            res['thumbnail'] as String?,
            videoId: id,
          );
          final dur = (res['duration'] as num?)?.toInt() ?? 210;
          final isVid = Track.detectIsVideo(title, album, coverUrl: thumb);
          String? vidYear = res['year']?.toString();

          if (isVid ||
              artist.isEmpty ||
              artist.toLowerCase() == 'unknown artist' ||
              MediaNormalizer.isDistributorOrLabel(artist)) {
            final vidDet = await getVideoDetails(cleanId);
            if (vidDet != null) {
              if (vidDet.artists.isNotEmpty) artist = vidDet.artists;
              if (vidDet.year != null && vidDet.year!.isNotEmpty) {
                vidYear = vidDet.year;
              }
            }
            if (artist.isEmpty ||
                artist.toLowerCase() == 'unknown artist' ||
                MediaNormalizer.isDistributorOrLabel(artist)) {
              artist = MediaNormalizer.extractArtistsFromVideoTitle(
                res['title'] as String?,
              );
            }
          }

          return Track(
            id: 'yt-$id',
            title: title.isNotEmpty ? title : 'YouTube Track',
            artist: artist.isNotEmpty ? artist : 'YouTube Music',
            album: isVid ? 'Music Video' : album,
            albumBrowseId: isVid ? null : albumBrowseId,
            coverUrl: thumb,
            durationSeconds: dur,
            source: 'youtube',
            isVideo: isVid,
            year: vidYear,
          );
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getTrack error: $e');
      }

      try {
        final songs = await searchSongsNative(cleanId);
        for (final t in songs) {
          if (t.id == 'yt-$cleanId' || t.id == cleanId) return t;
        }
        if (songs.isNotEmpty) return songs.first;
      } catch (_) {}
    }

    try {
      final queue = await getNextQueue(
        cleanId,
      ).timeout(const Duration(seconds: 8), onTimeout: () => const []);
      if (queue.isNotEmpty) {
        for (final t in queue) {
          if (t.id == 'yt-$cleanId' || t.id == cleanId) return t;
        }
        return queue.first;
      }
    } catch (_) {}

    try {
      final res = await post('player', {
        'videoId': cleanId,
      }).timeout(const Duration(seconds: 8));
      final details = res['videoDetails'] as Map?;
      if (details != null) {
        final rawTitle = details['title']?.toString();
        final title = MediaNormalizer.cleanTitle(rawTitle);
        final author = details['author']?.toString() ?? '';
        final dur =
            int.tryParse(details['lengthSeconds']?.toString() ?? '210') ?? 210;
        final thumb = MediaNormalizer.upgradeArtworkUrl(null, videoId: cleanId);
        final isVid = Track.detectIsVideo(title, 'Single', coverUrl: thumb);
        var artist = MediaNormalizer.cleanArtistName(author);
        String? vidYear;

        if (isVid ||
            artist.isEmpty ||
            artist.toLowerCase() == 'unknown artist' ||
            MediaNormalizer.isDistributorOrLabel(artist)) {
          final vidDet = await getVideoDetails(cleanId);
          if (vidDet != null) {
            if (vidDet.artists.isNotEmpty) artist = vidDet.artists;
            if (vidDet.year != null && vidDet.year!.isNotEmpty) {
              vidYear = vidDet.year;
            }
          }
          if (artist.isEmpty ||
              artist.toLowerCase() == 'unknown artist' ||
              MediaNormalizer.isDistributorOrLabel(artist)) {
            artist = MediaNormalizer.extractArtistsFromVideoTitle(rawTitle);
          }
        }

        return Track(
          id: 'yt-$cleanId',
          title: title.isNotEmpty ? title : 'YouTube Track',
          artist: artist.isNotEmpty ? artist : 'YouTube Music',
          album: isVid ? 'Music Video' : 'Single',
          coverUrl: thumb,
          durationSeconds: dur,
          source: 'youtube',
          isVideo: isVid,
          year: vidYear,
        );
      }
    } catch (_) {}

    return null;
  }

  // ────────────────────────────── Next / radio ───────────────────────────────

  Future<List<Track>> getNextQueue(String videoId, {String? playlistId}) async {
    final cleanId = videoId.replaceFirst('yt-', '').trim();
    if (cleanId.isEmpty) return const [];

    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMethod<List<dynamic>>('getNext', {
              'videoId': cleanId,
              'playlistId': ?playlistId,
            })
            .timeout(const Duration(seconds: 20), onTimeout: () => null);
        if (res != null && res.isNotEmpty) {
          final tracks = <Track>[];
          for (final raw in res) {
            if (raw is Map) {
              final norm = MediaNormalizer.normalizeMap(
                Map<String, dynamic>.from(raw),
              );
              if (norm.id.isNotEmpty && norm.id != cleanId) {
                final rawTitleStr = raw['title']?.toString();
                final rawAlbum = raw['album'];
                final albName = rawAlbum is Map
                    ? (rawAlbum['name'] ?? rawAlbum['title'])?.toString()
                    : rawAlbum?.toString();
                final albumBrowseId = _extractAlbumBrowseIdFromMap(rawAlbum);
                final cleanAlbum = MediaNormalizer.resolveTrackAlbum(
                  albName,
                  rawTitle: rawTitleStr ?? norm.cleanTitle,
                );
                final isVid =
                    norm.isVideo ||
                    Track.detectIsVideo(
                      norm.cleanTitle,
                      cleanAlbum,
                      coverUrl: norm.imageUrl,
                    );
                tracks.add(
                  Track(
                    id: norm.id.startsWith('yt-') ? norm.id : 'yt-${norm.id}',
                    title: norm.cleanTitle,
                    artist: norm.subtitle,
                    album: isVid ? 'Music Video' : cleanAlbum,
                    albumBrowseId: isVid ? null : albumBrowseId,
                    coverUrl: norm.imageUrl,
                    durationSeconds: (raw['duration'] as num?)?.toInt() ?? 210,
                    language:
                        Track.detectLanguage(
                          norm.cleanTitle,
                          norm.subtitle,
                          isVid ? 'Music Video' : cleanAlbum,
                        ) ??
                        '',
                    source: 'youtube',
                    isVideo: isVid,
                  ),
                );
              }
            }
          }
          if (tracks.isNotEmpty) return tracks;
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[InnerTube] Native getNext error: $e');
      }
    }

    try {
      final res = await post('next', {
        'videoId': cleanId,
        'playlistId': playlistId ?? 'RDAMVM$cleanId',
        'isAudioOnly': true,
      }, ttl: _tNext);

      final out = <Track>[];
      final tabs =
          res['contents']?['singleColumnMusicWatchNextResultsRenderer']?['tabbedRenderer']?['watchNextTabbedResultsRenderer']?['tabs'];
      if (tabs is! List || tabs.isEmpty) return out;

      final queue =
          tabs[0]?['tabRenderer']?['content']?['musicQueueRenderer']?['content']?['playlistPanelRenderer']?['contents'];
      if (queue is! List) return out;

      for (final item in queue) {
        final p = item['playlistPanelVideoRenderer'];
        if (p == null) continue;
        final id = p['videoId'] as String?;
        if (id == null || id.isEmpty || id == cleanId) continue;

        final titleRuns = p['title']?['runs'] as List?;
        final rawTitle = titleRuns?.isNotEmpty == true
            ? titleRuns![0]['text'] as String
            : 'Unknown Track';
        final byline = p['longBylineText']?['runs'] as List?;
        final rawArtist = (byline != null && byline.isNotEmpty)
            ? (byline[0]['text'] ?? 'Unknown Artist').toString()
            : 'Unknown Artist';

        final norm = MediaNormalizer.normalize(
          id: id,
          rawTitle: rawTitle,
          rawSubtitle: rawArtist,
          rawImageUrl: _cover(p['thumbnail']?['thumbnails'] as List?, id),
        );

        final isVid =
            norm.isVideo ||
            Track.detectIsVideo(
              norm.cleanTitle,
              'Single',
              coverUrl: norm.imageUrl,
            );
        out.add(
          Track(
            id: 'yt-$id',
            title: norm.cleanTitle,
            artist: norm.subtitle,
            album: isVid ? 'Music Video' : 'Single',
            coverUrl: norm.imageUrl,
            durationSeconds: 210,
            language:
                Track.detectLanguage(
                  norm.cleanTitle,
                  norm.subtitle,
                  isVid ? 'Music Video' : 'Single',
                ) ??
                '',
            source: 'youtube',
            isVideo: isVid,
          ),
        );
      }
      return out;
    } catch (e) {
      if (kDebugMode) debugPrint('[InnerTube] getNextQueue error: $e');
      return const [];
    }
  }

  Future<List<Track>> fetchRelated(Track seed, {String? targetLanguage}) async {
    final cleanId = seed.id.replaceFirst('yt-', '').trim();
    final raw = await getNextQueue(cleanId);
    final targetLang = (targetLanguage != null && targetLanguage.isNotEmpty)
        ? targetLanguage.toLowerCase()
        : (seed.language.isNotEmpty
              ? seed.language.toLowerCase()
              : (Track.detectLanguage(seed.title, seed.artist, seed.album) ??
                    ''));

    final results = <Track>[];
    final seen = <String>{seed.id, cleanId};

    bool isMatch(Track t) {
      final tClean = t.id.replaceFirst('yt-', '');
      if (seen.contains(t.id) || seen.contains(tClean)) return false;
      if (targetLang.isEmpty) return true;
      final tLang = t.language.isNotEmpty
          ? t.language.toLowerCase()
          : (Track.detectLanguage(t.title, t.artist, t.album) ?? '');
      if (tLang.isEmpty) return true;
      return tLang == targetLang;
    }

    // 1. Filter raw nextQueue by target language so conflicting languages (e.g. Hindi in Tamil) never leak
    for (final t in raw) {
      if (isMatch(t)) {
        seen.add(t.id);
        seen.add(t.id.replaceFirst('yt-', ''));
        results.add(t);
      }
    }

    // 2. If YouTube's nextQueue had language drift or returned fewer than 10 tracks, backfill with search in same language!
    if (results.length < 10) {
      try {
        final query = targetLang.isNotEmpty
            ? '${seed.artist} $targetLang songs'
            : '${seed.artist} radio';
        final searchHits = await search(query);
        for (final t in searchHits) {
          if (isMatch(t)) {
            seen.add(t.id);
            seen.add(t.id.replaceFirst('yt-', ''));
            results.add(t);
            if (results.length >= 25) break;
          }
        }
      } catch (_) {}
    }

    return results;
  }

  // ────────────────────────────── Album & Metadata Resolution ───────────────────

  /// Resolves the canonical album browse ID (`MPREb_...`), album title, and artist channel ID
  /// directly from the track's YouTube Music WatchNext (`next`) payload.
  /// Guarantees 100% precision without fuzzy text matching.
  Future<
    ({
      String? albumBrowseId,
      String? albumTitle,
      String? artistChannelId,
      String? artistName,
    })?
  >
  resolveSongAlbumDetails(String videoId) async {
    final cleanId = videoId.replaceFirst('yt-', '').trim();
    if (cleanId.isEmpty) return null;
    try {
      final nextRes = await post('next', {
        'videoId': cleanId,
      }, ttl: const Duration(hours: 12));
      final panelContents =
          nextRes['contents']?['singleColumnMusicWatchNextResultsRenderer']?['tabbedRenderer']?['watchNextTabbedResultsRenderer']?['tabs']?[0]?['tabRenderer']?['content']?['musicQueueRenderer']?['content']?['playlistPanelRenderer']?['contents']
              as List?;
      Map<String, dynamic>? currentVideo;
      if (panelContents != null) {
        for (final entry in panelContents) {
          final r = entry is Map ? entry['playlistPanelVideoRenderer'] : null;
          if (r is Map && r['videoId']?.toString() == cleanId) {
            currentVideo = Map<String, dynamic>.from(r);
            break;
          }
        }
      }
      if (currentVideo == null) return null;

      final songTitle =
          (currentVideo['title']?['runs'] as List?)?.firstOrNull?['text']
              ?.toString() ??
          '';

      String? albumBrowseId;
      String? albumTitle;
      String? artistChannelId;
      String? artistName;

      // 1. Check longBylineText runs
      final runs = currentVideo['longBylineText']?['runs'] as List?;
      if (runs != null) {
        for (final r in runs) {
          if (r is Map) {
            final bId =
                r['navigationEndpoint']?['browseEndpoint']?['browseId']
                    as String?;
            final text = r['text'] as String?;
            if (bId != null) {
              if (AlbumResolver.isValidAlbumBrowseId(bId)) {
                final candAlb = text?.trim() ?? '';
                if (!AlbumResolver.isVariantConflict(songTitle, candAlb)) {
                  albumBrowseId = bId;
                  if (candAlb.isNotEmpty) albumTitle = candAlb;
                }
              } else if (bId.startsWith('UC') || bId.contains('artist')) {
                artistChannelId = bId;
                if (text != null && text.trim().isNotEmpty) {
                  artistName = text.trim();
                }
              }
            }
          }
        }
      }

      // 2. Check menuNavigationItemRenderer (MUSIC_ALBUM icon)
      final menuItems =
          currentVideo['menu']?['menuRenderer']?['items'] as List?;
      if (menuItems != null) {
        for (final mi in menuItems) {
          final mni = mi?['menuNavigationItemRenderer'];
          final icon = mni?['icon']?['iconType'];
          if (icon == 'MUSIC_ALBUM') {
            final candBId =
                mni?['navigationEndpoint']?['browseEndpoint']?['browseId']
                    as String?;
            final tRuns = mni?['text']?['runs'] as List?;
            final candTitle = (tRuns != null && tRuns.isNotEmpty)
                ? (tRuns[0]['text'] as String? ?? '')
                : '';
            if (AlbumResolver.isValidAlbumBrowseId(candBId) &&
                !AlbumResolver.isVariantConflict(songTitle, candTitle)) {
              albumBrowseId ??= candBId;
              if (candTitle.isNotEmpty && albumTitle == null) {
                albumTitle = candTitle;
              }
            }
          } else if (icon == 'ARTIST') {
            artistChannelId ??=
                mni?['navigationEndpoint']?['browseEndpoint']?['browseId']
                    as String?;
          }
        }
      }

      if (kDebugMode) {
        debugPrint(
          '[InnerTube] resolveSongAlbumDetails videoId=$cleanId -> album=$albumTitle ($albumBrowseId) artist=$artistName ($artistChannelId)',
        );
      }

      return (
        albumBrowseId: albumBrowseId,
        albumTitle: albumTitle,
        artistChannelId: artistChannelId,
        artistName: artistName,
      );
    } catch (e) {
      if (kDebugMode)
        debugPrint('[InnerTube] resolveSongAlbumDetails error: $e');
      return null;
    }
  }

  // ────────────────────────────── Lyrics ─────────────────────────────────────

  Future<String?> getLyrics(String videoId) async {
    final cleanId = videoId.replaceFirst('yt-', '').trim();
    if (_useNative) {
      try {
        final res = await _nativeChannel
            .invokeMethod<String>('getLyrics', {'videoId': cleanId})
            .timeout(const Duration(seconds: 6), onTimeout: () => null);
        if (res != null && res.trim().isNotEmpty) {
          if (kDebugMode)
            debugPrint(
              '[LyricsFlow] Native InnerTube lyrics found for videoId=$cleanId',
            );
          return res.trim();
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[LyricsFlow] Native getLyrics error: $e');
      }
    }
    try {
      final nextRes = await post('next', {
        'videoId': cleanId,
      }, ttl: const Duration(hours: 12));
      final tabs =
          nextRes['contents']?['singleColumnMusicWatchNextResultsRenderer']?['tabbedRenderer']?['watchNextTabbedResultsRenderer']?['tabs'];
      if (tabs is! List) return null;

      String? lyricsBrowseId;
      for (final t in tabs) {
        final tr = t?['tabRenderer'];
        if (tr == null) continue;
        if (tr['unselectable'] == true)
          continue; // If unselectable, lyrics are unavailable
        final title = (tr['title'] ?? '').toString().toLowerCase();
        final tabId = (tr['tabIdentifier'] ?? '').toString().toLowerCase();
        final bId = tr['endpoint']?['browseEndpoint']?['browseId'] as String?;
        if (bId != null &&
            bId.isNotEmpty &&
            (tabId == 'lyrics' ||
                title.contains('lyric') ||
                title.contains('பாடல்') ||
                title.contains('సాహిత్యం') ||
                title.contains('गीत') ||
                title.contains('गाने') ||
                title.contains('வரிகள்'))) {
          lyricsBrowseId = bId;
          break;
        }
      }

      if (lyricsBrowseId == null || lyricsBrowseId.isEmpty) {
        if (kDebugMode)
          debugPrint('[LyricsFlow] No lyrics tab found for videoId=$cleanId');
        return null;
      }

      if (kDebugMode) {
        debugPrint(
          '[LyricsFlow] Found official InnerTube lyrics browseId=$lyricsBrowseId for videoId=$cleanId',
        );
      }

      final browseRes = await post('browse', {
        'browseId': lyricsBrowseId,
      }, ttl: const Duration(days: 7));
      final shelf =
          browseRes['contents']?['sectionListRenderer']?['contents']?[0]?['musicDescriptionShelfRenderer'];
      final runs = shelf?['description']?['runs'] as List?;
      if (runs != null && runs.isNotEmpty) {
        final text = runs.map((r) => r['text'] ?? '').join().trim();
        if (text.isNotEmpty) return text;
      }
      return null;
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsFlow] InnerTube getLyrics error: $e');
      return null;
    }
  }
}

class VideoDetailsResult {
  const VideoDetailsResult({
    required this.videoId,
    required this.title,
    this.cleanTitle = '',
    required this.author,
    this.publishDate,
    this.uploadDate,
    this.year,
    required this.description,
    required this.artists,
    this.musicPanelSong,
    this.musicPanelArtist,
    this.musicPanelAlbum,
  });

  final String videoId;
  final String title;
  final String cleanTitle;
  final String author;
  final String? publishDate;
  final String? uploadDate;
  final String? year;
  final String description;
  final String artists;
  final String? musicPanelSong;
  final String? musicPanelArtist;
  final String? musicPanelAlbum;

  String get shortDescription => description;
}
