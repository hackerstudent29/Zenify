import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/track.dart';
import 'api_service.dart';
import 'innertube_service.dart';

class YouTubeImportResult {
  const YouTubeImportResult({
    required this.title,
    required this.author,
    required this.coverUrl,
    required this.tracks,
    required this.type,
  });

  final String title;
  final String author;
  final String coverUrl;
  final List<Track> tracks;
  final String type; // 'playlist', 'album', 'song', 'spotify'
}

class YouTubeLinkImporter {
  YouTubeLinkImporter._();

  static final YouTubeLinkImporter instance = YouTubeLinkImporter._();

  /// Resolves any pasted YouTube Music, YouTube, or Spotify link into a tracklist.
  Future<YouTubeImportResult?> resolve(String rawUrl) async {
    try {
      return await _resolveInternal(rawUrl).timeout(
        const Duration(seconds: 14),
        onTimeout: () {
          if (kDebugMode) debugPrint('[YouTubeLinkImporter] resolve timed out after 14s');
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

    // 1. Spotify link handling
    if (input.contains('spotify.com')) {
      try {
        final res = await ApiService.importPlaylist(input);
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
      } catch (e) {
        if (kDebugMode) debugPrint('[YouTubeLinkImporter] Spotify import error: $e');
      }
    }

    // 2. Extract YouTube / YouTube Music parameters
    final extracted = _extractParameters(input);
    final playlistId = extracted.playlistId;
    final albumId = extracted.albumId;
    final videoId = extracted.videoId;

    // 3. Resolve Playlist if playlistId is present
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

      // If getPlaylist failed and playlistId starts with OLAK (album disguised as playlist), try getAlbum
      if (playlistId.startsWith('OLAK') || playlistId.startsWith('MPREb_')) {
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
      }

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

    // 4. Resolve Album if albumId is present
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

    // 5. Resolve Single Video / Track if videoId is present
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

    // 6. Direct fallback: If user passed a bare ID or query
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

    // 7. General search fallback if input is text/query
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

  @visibleForTesting
  static ({String? playlistId, String? albumId, String? videoId}) extractParametersForTesting(String raw) =>
      _extractParameters(raw);

  /// Extracts playlistId, albumId, and videoId from various YouTube and YouTube Music URL formats.
  static ({String? playlistId, String? albumId, String? videoId}) _extractParameters(String raw) {
    String? playlistId;
    String? albumId;
    String? videoId;

    String clean = raw.trim();
    final urlRegex = RegExp(r'https?:\/\/[^\s]+');
    final urlMatch = urlRegex.firstMatch(clean);
    if (urlMatch != null) {
      clean = urlMatch.group(0)!;
    } else if (clean.contains('youtube.com') ||
        clean.contains('youtu.be') ||
        clean.contains('spotify.com')) {
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://$clean';
      }
    }

    try {
      final uri = Uri.tryParse(clean);
      if (uri != null) {
        // Query param 'list'
        if (uri.queryParameters.containsKey('list')) {
          playlistId = uri.queryParameters['list']?.trim();
        }

        // Query param 'v'
        if (uri.queryParameters.containsKey('v')) {
          videoId = uri.queryParameters['v']?.trim();
        }

        // Short link: youtu.be/<videoId>
        if (uri.host.contains('youtu.be') && uri.pathSegments.isNotEmpty) {
          videoId = uri.pathSegments.first.trim();
        }

        // Album browse path: /browse/MPREb_...
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

        // Playlist path: /playlist/<id>
        if (uri.path.contains('/playlist/') && uri.pathSegments.isNotEmpty) {
          playlistId = uri.pathSegments.last;
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
