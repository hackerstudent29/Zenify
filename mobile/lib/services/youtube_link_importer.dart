import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../models/artist_ref.dart';
import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'api_service.dart';
import 'innertube_service.dart';

class YouTubeImportResult {
  const YouTubeImportResult({
    required this.title,
    required this.author,
    required this.coverUrl,
    required this.tracks,
    required this.type, // 'playlist', 'album', 'song', 'spotify', 'jiosaavn', 'applemusic'
  });

  final String title;
  final String author;
  final String coverUrl;
  final List<Track> tracks;
  final String type;
}

class YouTubeLinkImporter {
  YouTubeLinkImporter._();

  static final YouTubeLinkImporter instance = YouTubeLinkImporter._();

  /// Resolves any pasted YouTube Music, YouTube, Spotify, Apple Music, or JioSaavn link into a tracklist.
  Future<YouTubeImportResult?> resolve(String rawUrl) async {
    try {
      return await _resolveInternal(rawUrl).timeout(
        const Duration(seconds: 25),
        onTimeout: () {
          if (kDebugMode) debugPrint('[YouTubeLinkImporter] resolve timed out after 25s');
          return null;
        },
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[YouTubeLinkImporter] resolve unhandled error: $e');
      return null;
    }
  }

  Future<YouTubeImportResult?> _resolveInternal(String rawUrl) async {
    final input = rawUrl.trim();
    if (input.isEmpty) return null;

    // 1. Spotify link handling (Direct Embed Scraping + ApiService fallback)
    if (input.contains('spotify.com') || input.startsWith('spotify:')) {
      final spotifyRes = await _resolveSpotify(input);
      if (spotifyRes != null && spotifyRes.tracks.isNotEmpty) {
        return spotifyRes;
      }
    }

    // 2. JioSaavn link handling (Direct WebAPI Token Resolution)
    if (input.contains('jiosaavn.com')) {
      final saavnRes = await _resolveJioSaavn(input);
      if (saavnRes != null && saavnRes.tracks.isNotEmpty) {
        return saavnRes;
      }
    }

    // 3. Apple Music link handling (Direct Schema.org LD+JSON Parsing)
    if (input.contains('music.apple.com')) {
      final appleRes = await _resolveAppleMusic(input);
      if (appleRes != null && appleRes.tracks.isNotEmpty) {
        return appleRes;
      }
    }

    // 4. Extract YouTube / YouTube Music parameters
    final extracted = _extractParameters(input);
    final playlistId = extracted.playlistId;
    final albumId = extracted.albumId;
    final videoId = extracted.videoId;

    // 5. If playlistId represents an album release (OLAK... or MPREb_...), resolve as Album first
    if (playlistId != null && (playlistId.startsWith('OLAK') || playlistId.startsWith('MPREb_'))) {
      try {
        final albumRes = await InnerTubeService.instance.getAlbum(playlistId);
        if (albumRes != null && albumRes.tracks.isNotEmpty) {
          return YouTubeImportResult(
            title: albumRes.title ?? 'Album',
            author: albumRes.artist ?? 'Artist',
            coverUrl: albumRes.coverUrl,
            tracks: albumRes.tracks,
            type: 'album',
          );
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[YouTubeLinkImporter] OLAK getAlbum error for $playlistId: $e');
      }
    }

    // 6. Resolve Playlist if playlistId is present
    if (playlistId != null && playlistId.isNotEmpty) {
      try {
        final res = await InnerTubeService.instance.getPlaylist(playlistId);
        if (res != null && res.tracks.isNotEmpty) {
          return YouTubeImportResult(
            title: res.title.isNotEmpty ? res.title : 'YouTube Playlist',
            author: res.author.isNotEmpty ? res.author : 'YouTube Music',
            coverUrl: res.coverUrl.isNotEmpty
                ? res.coverUrl
                : (res.tracks.isNotEmpty ? res.tracks.first.coverUrl : ''),
            tracks: res.tracks,
            type: 'playlist',
          );
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[YouTubeLinkImporter] getPlaylist error for $playlistId: $e');
      }

      // If getPlaylist failed, try getAlbum as fallback
      try {
        final albumRes = await InnerTubeService.instance.getAlbum(playlistId);
        if (albumRes != null && albumRes.tracks.isNotEmpty) {
          return YouTubeImportResult(
            title: albumRes.title ?? 'Album',
            author: albumRes.artist ?? 'Artist',
            coverUrl: albumRes.coverUrl,
            tracks: albumRes.tracks,
            type: 'album',
          );
        }
      } catch (_) {}

      // If playlist resolution failed and this was a watch?v=...&list=RD... link, fall back to single video
      if (videoId != null && videoId.isNotEmpty) {
        try {
          final track = await InnerTubeService.instance.getTrack(videoId);
          if (track != null) {
            return YouTubeImportResult(
              title: track.title,
              author: track.artist,
              coverUrl: track.coverUrl,
              tracks: [track],
              type: 'song',
            );
          }
        } catch (_) {}
      }
    }

    // 6. Resolve Album if albumId is present
    if (albumId != null && albumId.isNotEmpty) {
      try {
        final albumRes = await InnerTubeService.instance.getAlbum(albumId);
        if (albumRes != null && albumRes.tracks.isNotEmpty) {
          return YouTubeImportResult(
            title: albumRes.title ?? 'Album',
            author: albumRes.artist ?? 'Artist',
            coverUrl: albumRes.coverUrl,
            tracks: albumRes.tracks,
            type: 'album',
          );
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[YouTubeLinkImporter] getAlbum error for $albumId: $e');
      }
    }

    // 7. Resolve Single Video / Track if videoId is present
    if (videoId != null && videoId.isNotEmpty) {
      try {
        final track = await InnerTubeService.instance.getTrack(videoId);
        if (track != null) {
          return YouTubeImportResult(
            title: track.title,
            author: track.artist,
            coverUrl: track.coverUrl,
            tracks: [track],
            type: 'song',
          );
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[YouTubeLinkImporter] getTrack error for $videoId: $e');
      }
    }

    // 8. Direct fallback: If user passed a bare ID or query
    if (input.startsWith('PL') || input.startsWith('RD') || input.startsWith('VLPL')) {
      final res = await InnerTubeService.instance.getPlaylist(input);
      if (res != null && res.tracks.isNotEmpty) {
        return YouTubeImportResult(
          title: res.title,
          author: res.author,
          coverUrl: res.coverUrl,
          tracks: res.tracks,
          type: 'playlist',
        );
      }
    }

    // 9. General search fallback if input is text/query
    if (!input.startsWith('http') && input.length >= 3) {
      try {
        final songs = await InnerTubeService.instance.searchSongsNative(input);
        if (songs.isNotEmpty) {
          final track = songs.first;
          return YouTubeImportResult(
            title: track.title,
            author: track.artist,
            coverUrl: track.coverUrl,
            tracks: [track],
            type: 'song',
          );
        }
      } catch (_) {}
    }

    return null;
  }

  // ───────────────────────────── Spotify Resolver ─────────────────────────────

  Future<YouTubeImportResult?> _resolveSpotify(String rawInput) async {
    // A. Direct Embed Scraping (zero auth, 100% public, works without backend server)
    try {
      final cleanUrl = _extractRawUrl(rawInput);
      String? embedUrl;
      if (cleanUrl.contains('spotify.com/playlist/')) {
        final id = RegExp(r'playlist\/([a-zA-Z0-9]+)').firstMatch(cleanUrl)?.group(1);
        if (id != null) embedUrl = 'https://open.spotify.com/embed/playlist/$id';
      } else if (cleanUrl.contains('spotify.com/album/')) {
        final id = RegExp(r'album\/([a-zA-Z0-9]+)').firstMatch(cleanUrl)?.group(1);
        if (id != null) embedUrl = 'https://open.spotify.com/embed/album/$id';
      } else if (cleanUrl.contains('spotify.com/track/')) {
        final id = RegExp(r'track\/([a-zA-Z0-9]+)').firstMatch(cleanUrl)?.group(1);
        if (id != null) embedUrl = 'https://open.spotify.com/embed/track/$id';
      }

      if (embedUrl != null) {
        final client = HttpClient(context: SecurityContext.defaultContext)
          ..badCertificateCallback = ((X509Certificate cert, String host, int port) => true);

        final req = await client.getUrl(Uri.parse(embedUrl)).timeout(const Duration(seconds: 8));
        req.headers.set(HttpHeaders.userAgentHeader, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        req.headers.set(HttpHeaders.acceptHeader, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');

        final resp = await req.close().timeout(const Duration(seconds: 8));
        if (resp.statusCode == 200) {
          final html = await resp.transform(utf8.decoder).join();
          client.close();

          final match = RegExp(r'<script id="__NEXT_DATA__" type="application/json">({.*?})</script>').firstMatch(html);
          if (match != null) {
            final jsonMap = jsonDecode(match.group(1)!) as Map<String, dynamic>;
            final entity = jsonMap['props']?['pageProps']?['state']?['data']?['entity'] as Map<String, dynamic>?;
            if (entity != null) {
              final title = (entity['title'] ?? entity['name'] ?? 'Spotify Playlist').toString();
              final author = (entity['subtitle'] ?? 'Spotify').toString();
              final coverList = (entity['coverArt']?['sources'] as List?) ?? [];
              final coverUrl = coverList.isNotEmpty ? (coverList[0]['url'] as String? ?? '') : '';
              final rawTracks = (entity['trackList'] as List?) ?? [];

              final tracks = <Track>[];
              for (int i = 0; i < rawTracks.length; i++) {
                final pt = rawTracks[i];
                if (pt is! Map) continue;
                final tTitle = (pt['title'] ?? '').toString().trim();
                if (tTitle.isEmpty) continue;
                final tArtist = (pt['subtitle'] ?? author).toString().trim();
                final durMs = (pt['duration'] as num?)?.toInt() ?? 210000;
                final uri = (pt['uri'] ?? 'sp-$i').toString();
                final trackId = uri.contains(':') ? uri.split(':').last : 'sp-$i';

                tracks.add(Track(
                  id: 'sp-$trackId',
                  title: MediaNormalizer.cleanTitle(tTitle),
                  artist: MediaNormalizer.formatArtists(tArtist),
                  album: title,
                  coverUrl: coverUrl,
                  durationSeconds: durMs ~/ 1000,
                  source: 'jiosaavn', // Streams full audio via JioSaavn 320kbps CDN or yt-dlp, NEVER 30s previews
                ));
              }

              if (tracks.isNotEmpty) {
                return YouTubeImportResult(
                  title: title,
                  author: author,
                  coverUrl: coverUrl.isNotEmpty ? coverUrl : tracks.first.coverUrl,
                  tracks: tracks,
                  type: 'spotify',
                );
              }
            }
          }
        } else {
          client.close();
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[YouTubeLinkImporter] Spotify embed error: $e');
    }

    // B. Fallback: ApiService backend if running
    try {
      final res = await ApiService.importPlaylist(rawInput);
      if (res != null) {
        final name = (res['name'] ?? res['title'] ?? 'Spotify Playlist').toString();
        final rawTracks = res['tracks'];
        final List<Track> tracks = [];
        if (rawTracks is List) {
          for (final pt in rawTracks) {
            final dynamic rawItem = (pt is Map && pt['track'] != null) ? pt['track'] : pt;
            if (rawItem is Map) {
              tracks.add(Track.fromJson(Map<String, dynamic>.from(rawItem)));
            }
          }
        }
        if (tracks.isNotEmpty) {
          return YouTubeImportResult(
            title: name,
            author: 'Spotify',
            coverUrl: tracks.first.coverUrl,
            tracks: tracks,
            type: 'spotify',
          );
        }
      }
    } catch (_) {}

    return null;
  }

  // ──────────────────────────── JioSaavn Resolver ────────────────────────────

  Future<YouTubeImportResult?> _resolveJioSaavn(String rawInput) async {
    try {
      final cleanUrl = _extractRawUrl(rawInput);
      final uri = Uri.tryParse(cleanUrl);
      if (uri == null) return null;

      final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segments.isEmpty) return null;

      final token = segments.last;
      String type = 'playlist';
      if (cleanUrl.contains('/album/')) {
        type = 'album';
      } else if (cleanUrl.contains('/song/')) {
        type = 'song';
      }

      final apiUrl = 'https://www.jiosaavn.com/api.php?__call=webapi.get&token=$token&type=$type&_format=json&p=1&n=50';
      final client = HttpClient();
      final req = await client.getUrl(Uri.parse(apiUrl)).timeout(const Duration(seconds: 8));
      req.headers.set(HttpHeaders.userAgentHeader, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      final resp = await req.close().timeout(const Duration(seconds: 8));
      if (resp.statusCode == 200) {
        final body = await resp.transform(utf8.decoder).join();
        client.close();
        final data = jsonDecode(body) as Map<String, dynamic>;

        final title = (data['listname'] ?? data['title'] ?? data['name'] ?? 'JioSaavn Playlist').toString();
        final author = (data['username'] ?? data['primary_artists'] ?? 'JioSaavn').toString();
        final rawCover = (data['image'] ?? '').toString();
        final coverUrl = MediaNormalizer.upgradeArtworkUrl(rawCover);

        final rawSongs = (data['songs'] as List?) ?? (data['list'] as List?) ?? (type == 'song' ? [data] : []);
        final tracks = <Track>[];

        for (final s in rawSongs) {
          if (s is! Map) continue;
          final sId = (s['id'] ?? '').toString();
          if (sId.isEmpty) continue;
          final sTitle = (s['song'] ?? s['title'] ?? '').toString();
          final sArtist = (s['primary_artists'] ?? s['singers'] ?? author).toString();
          final sAlbum = (s['album'] ?? title).toString();
          final sImg = (s['image'] ?? rawCover).toString();
          final sDur = int.tryParse(s['duration']?.toString() ?? '') ??
              int.tryParse(s['more_info']?['duration']?.toString() ?? '') ?? 210;

          final refs = <ArtistRef>[];
          for (final a in ArtistRef.splitFromName(sArtist)) {
            refs.add(a);
          }

          tracks.add(Track(
            id: 'saavn-$sId',
            title: MediaNormalizer.cleanTitle(sTitle),
            artist: MediaNormalizer.formatArtists(sArtist),
            artists: refs,
            album: MediaNormalizer.cleanTitle(sAlbum),
            coverUrl: MediaNormalizer.upgradeArtworkUrl(sImg),
            durationSeconds: sDur,
            source: 'jiosaavn',
            language: (s['language'] ?? 'Tamil').toString(),
          ));
        }

        if (tracks.isNotEmpty) {
          return YouTubeImportResult(
            title: title,
            author: author,
            coverUrl: coverUrl.isNotEmpty ? coverUrl : tracks.first.coverUrl,
            tracks: tracks,
            type: 'jiosaavn',
          );
        }
      } else {
        client.close();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[YouTubeLinkImporter] JioSaavn error: $e');
    }
    return null;
  }

  // ─────────────────────────── Apple Music Resolver ──────────────────────────

  Future<YouTubeImportResult?> _resolveAppleMusic(String rawInput) async {
    try {
      final cleanUrl = _extractRawUrl(rawInput);
      final client = HttpClient();
      final req = await client.getUrl(Uri.parse(cleanUrl)).timeout(const Duration(seconds: 8));
      req.headers.set(HttpHeaders.userAgentHeader, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      req.headers.set(HttpHeaders.acceptHeader, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
      req.headers.set(HttpHeaders.acceptLanguageHeader, 'en-US,en;q=0.9');

      final resp = await req.close().timeout(const Duration(seconds: 8));
      if (resp.statusCode == 200) {
        final html = await resp.transform(utf8.decoder).join();
        client.close();

        final match = RegExp(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', dotAll: true).firstMatch(html);
        if (match != null) {
          final data = jsonDecode(match.group(1)!) as Map<String, dynamic>;
          final name = (data['name'] ?? 'Apple Music Playlist').toString();
          final author = (data['author']?['name'] ?? data['creator']?['name'] ?? 'Apple Music').toString();
          final rawThumb = (data['thumbnailUrl'] ?? data['image'] ?? '').toString();
          final coverUrl = MediaNormalizer.upgradeArtworkUrl(rawThumb);

          final rawTracks = (data['track'] as List?) ?? [];
          final tracks = <Track>[];

          for (int i = 0; i < rawTracks.length; i++) {
            final t = rawTracks[i];
            if (t is! Map) continue;
            final tName = (t['name'] ?? '').toString().trim();
            if (tName.isEmpty) continue;
            final tArtist = (t['byArtist']?['name'] ?? author).toString().trim();
            final isoDur = (t['duration'] ?? 'PT3M30S').toString();
            final durSec = _parseIsoDuration(isoDur);
            final tThumb = (t['thumbnailUrl'] ?? t['audio']?['thumbnailUrl'] ?? rawThumb).toString();
            final tUrl = (t['url'] ?? '').toString();
            final trackId = tUrl.isNotEmpty ? tUrl.split('/').last : 'am-$i';

            tracks.add(Track(
              id: 'am-$trackId',
              title: MediaNormalizer.cleanTitle(tName),
              artist: MediaNormalizer.formatArtists(tArtist),
              album: name,
              coverUrl: MediaNormalizer.upgradeArtworkUrl(tThumb),
              durationSeconds: durSec,
              source: 'youtube', // Full streaming via JioSaavn CDN / YouTube proxy, NEVER 30s iTunes previews
            ));
          }

          if (tracks.isNotEmpty) {
            return YouTubeImportResult(
              title: name,
              author: author,
              coverUrl: coverUrl.isNotEmpty ? coverUrl : tracks.first.coverUrl,
              tracks: tracks,
              type: 'applemusic',
            );
          }
        }
      } else {
        client.close();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[YouTubeLinkImporter] Apple Music error: $e');
    }
    return null;
  }

  static int _parseIsoDuration(String iso) {
    try {
      final m = RegExp(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?').firstMatch(iso);
      if (m != null) {
        final hours = int.tryParse(m.group(1) ?? '0') ?? 0;
        final minutes = int.tryParse(m.group(2) ?? '0') ?? 0;
        final seconds = int.tryParse(m.group(3) ?? '0') ?? 0;
        return hours * 3600 + minutes * 60 + seconds;
      }
    } catch (_) {}
    return 210;
  }

  // ──────────────────────────── Parameter Extractors ──────────────────────────

  static String _extractRawUrl(String raw) {
    final trimmed = raw.trim();
    final urlStart = trimmed.indexOf(RegExp(r'https?:\/\/'));
    if (urlStart != -1) {
      final sub = trimmed.substring(urlStart);
      final spaceIdx = sub.indexOf(RegExp(r'[\s\r\n\t]'));
      if (spaceIdx != -1) {
        return sub.substring(0, spaceIdx);
      }
      return sub;
    }
    return trimmed;
  }

  @visibleForTesting
  static ({String? playlistId, String? albumId, String? videoId}) extractParametersForTesting(String raw) =>
      _extractParameters(raw);

  /// Extracts playlistId, albumId, and videoId from various YouTube and YouTube Music URL formats.
  static ({String? playlistId, String? albumId, String? videoId}) _extractParameters(String raw) {
    String? playlistId;
    String? albumId;
    String? videoId;

    final clean = _extractRawUrl(raw);

    try {
      final uri = Uri.tryParse(clean);
      if (uri != null) {
        // Query param 'list' (e.g. ?list=PL...&si=...)
        if (uri.queryParameters.containsKey('list')) {
          final l = uri.queryParameters['list']?.trim();
          if (l != null && l.isNotEmpty) {
            playlistId = l;
          }
        }

        // Query param 'v'
        if (uri.queryParameters.containsKey('v')) {
          final v = uri.queryParameters['v']?.trim();
          if (v != null && v.isNotEmpty) {
            videoId = v;
          }
        }

        // Short link: youtu.be/<videoId>
        if (uri.host.contains('youtu.be') && uri.pathSegments.isNotEmpty) {
          final seg = uri.pathSegments.first.trim();
          if (seg.isNotEmpty && seg != 'playlist') {
            videoId = seg;
          }
        }

        // Album browse path: /browse/MPREb_... or /browse/OLAK... or /browse/VL...
        if (uri.path.contains('/browse/')) {
          final browsePart = uri.pathSegments.lastWhere(
            (s) => s.isNotEmpty,
            orElse: () => '',
          );
          if (browsePart.startsWith('MPREb_') || browsePart.startsWith('OLAK')) {
            albumId = browsePart;
          } else if (browsePart.startsWith('VL')) {
            playlistId = browsePart.substring(2);
          }
        }

        // Playlist path: /playlist/<id> (only if not literal 'playlist')
        if (playlistId == null && uri.path.contains('/playlist/') && uri.pathSegments.isNotEmpty) {
          final seg = uri.pathSegments.last;
          if (seg.isNotEmpty && seg != 'playlist') {
            playlistId = seg;
          }
        }
      }
    } catch (_) {}

    // Regex fallbacks for unescaped or copied text
    if (playlistId == null) {
      final match = RegExp(r'[?&]list=([a-zA-Z0-9_\-]+)').firstMatch(clean);
      if (match != null) {
        playlistId = match.group(1);
      } else if (clean.startsWith('PL') ||
          clean.startsWith('VLPL') ||
          clean.startsWith('RD') ||
          clean.startsWith('VLRD') ||
          clean.startsWith('LM') ||
          clean.startsWith('LL')) {
        playlistId = clean;
      }
    }

    if (videoId == null) {
      final match = RegExp(r'(?:v=|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_\-]{11})').firstMatch(clean);
      if (match != null) {
        videoId = match.group(1);
      } else if (RegExp(r'^[a-zA-Z0-9_\-]{11}$').hasMatch(clean)) {
        videoId = clean;
      }
    }

    if (albumId == null && (clean.contains('MPREb_') || clean.contains('OLAK5uy_'))) {
      final match = RegExp(r'(MPREb_[a-zA-Z0-9_\-]+|OLAK5uy_[a-zA-Z0-9_\-]+)').firstMatch(clean);
      if (match != null) albumId = match.group(1);
    }

    return (playlistId: playlistId, albumId: albumId, videoId: videoId);
  }
}
