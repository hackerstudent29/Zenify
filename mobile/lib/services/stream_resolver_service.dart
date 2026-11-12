import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart';

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'innertube_service.dart';

class ResolvedStream {
  ResolvedStream({
    required this.url,
    required this.headers,
    required this.expiresAt,
    required this.bitrate,
  });

  final String url;
  final Map<String, String> headers;
  final DateTime expiresAt;
  final int bitrate;

  bool get isFresh => DateTime.now().isBefore(expiresAt.subtract(const Duration(minutes: 10)));
}

/// On-Device Direct Stream Resolver for Zenify.
/// Resolves direct audio streams (googlevideo.com) straight on the user's phone
/// from the user's own IP address.
/// Eliminates dependency on backend proxy servers, Heroku, or USB cables.
class StreamResolverService {
  StreamResolverService._();
  static final StreamResolverService instance = StreamResolverService._();

  final YoutubeExplode _yt = YoutubeExplode();
  final Map<String, ResolvedStream> _cache = {};
  final Map<String, Future<ResolvedStream?>> _inflight = {};

  /// Resolves direct audio stream for a track, either by video ID or by direct on-device search.
  Future<ResolvedStream?> resolveTrack(Track track) async {
    // 1. Direct YouTube video ID (yt-XXXXX or 11 chars)
    var videoId = track.id.replaceFirst('yt-', '').trim();
    if (videoId.length == 11 && !videoId.contains(' ') && !videoId.startsWith('http')) {
      final direct = await resolveStream(videoId);
      if (direct != null && direct.url.isNotEmpty) return direct;
    }

    // 2. Search on-device directly via YouTube Music InnerTube for this track title & artist
    try {
      final cleanTitle = MediaNormalizer.cleanCompactTitle(track.title);
      final cleanArtist = MediaNormalizer.stripIdNoise(MediaNormalizer.formatArtists(track.artist));
      final String q = (cleanArtist.isNotEmpty && cleanArtist != 'Unknown Artist')
          ? '$cleanTitle $cleanArtist'.trim()
          : cleanTitle;

      // Prefer YouTube Music song filter first (pure official music tracks, no videos/trailers)
      List<Track> songs = await InnerTubeService.instance.searchSongsNative(q).timeout(const Duration(seconds: 8));
      if (songs.isEmpty) {
        songs = await InnerTubeService.instance.search(q).timeout(const Duration(seconds: 8));
      }
      if (songs.isNotEmpty) {
        final lowerTarget = cleanTitle.toLowerCase();
        final lowerArtist = cleanArtist.toLowerCase();
        final exact = songs.firstWhere(
          (s) {
            final st = MediaNormalizer.cleanCompactTitle(s.title).toLowerCase();
            final sa = s.artist.toLowerCase();
            final titleMatches = st == lowerTarget || st.contains(lowerTarget) || lowerTarget.contains(st);
            final artistMatches = lowerArtist.isEmpty || lowerArtist == 'unknown artist' || sa.contains(lowerArtist) || lowerArtist.contains(sa);
            return titleMatches && artistMatches;
          },
          orElse: () => songs.firstWhere(
            (s) {
              final st = MediaNormalizer.cleanCompactTitle(s.title).toLowerCase();
              return st == lowerTarget || st.contains(lowerTarget) || lowerTarget.contains(st);
            },
            orElse: () => songs.first,
          ),
        );
        final topId = exact.id.replaceFirst('yt-', '').trim();
        if (topId.length == 11) {
          final direct = await resolveStream(topId);
          if (direct != null && direct.url.isNotEmpty) return direct;
        }
      }
    } catch (_) {}

    return null;
  }

  Future<String?> resolveAudioUrl(String rawVideoId) async {
    final stream = await resolveStream(rawVideoId);
    return stream?.url;
  }

  Future<ResolvedStream?> resolveStream(String rawVideoId) async {
    final cleanId = rawVideoId.replaceFirst('yt-', '').trim();
    if (cleanId.isEmpty) return null;

    final cached = _cache[cleanId];
    if (cached != null && cached.isFresh) {
      return cached;
    }

    final running = _inflight[cleanId];
    if (running != null) {
      return running;
    }

    final future = _resolve(cleanId);
    _inflight[cleanId] = future;

    try {
      return await future;
    } finally {
      _inflight.remove(cleanId);
    }
  }

  Future<ResolvedStream?> _resolve(String videoId) async {
    try {
      StreamManifest? manifest;

      // 1. Primary: iOS client without watch page (clean AAC audio, NO PoToken, NO 403 on GoogleVideo)
      try {
        manifest = await _yt.videos.streamsClient.getManifest(
          videoId,
          ytClients: [YoutubeApiClient.ios],
          requireWatchPage: false,
        ).timeout(const Duration(seconds: 8));
      } catch (e) {
        if (kDebugMode) debugPrint('[StreamResolver] ios client notice: $e');
        manifest = null;
      }

      // 2. Secondary fallback: androidSdkless with requireWatchPage: false
      if (manifest == null || manifest.audioOnly.isEmpty) {
        try {
          manifest = await _yt.videos.streamsClient.getManifest(
            videoId,
            ytClients: [YoutubeApiClient.androidSdkless],
            requireWatchPage: false,
          ).timeout(const Duration(seconds: 8));
        } catch (e) {
          if (kDebugMode) debugPrint('[StreamResolver] androidSdkless notice: $e');
        }
      }

      // 3. Tertiary fallback: default client without watch page
      if (manifest == null || manifest.audioOnly.isEmpty) {
        try {
          manifest = await _yt.videos.streamsClient.getManifest(
            videoId,
            requireWatchPage: false,
          ).timeout(const Duration(seconds: 8));
        } catch (e) {
          if (kDebugMode) debugPrint('[StreamResolver] default client notice: $e');
        }
      }

      if (manifest == null) return null;

      final audioStreams = manifest.audioOnly.toList();
      final StreamInfo chosen;
      if (audioStreams.isNotEmpty) {
        // Sort descending by bitrate (highest audio fidelity: 160kbps Opus / 128kbps AAC)
        audioStreams.sort((a, b) => b.bitrate.bitsPerSecond.compareTo(a.bitrate.bitsPerSecond));
        chosen = audioStreams.first;
      } else if (manifest.muxed.isNotEmpty) {
        final muxed = manifest.muxed.toList();
        muxed.sort((a, b) => b.bitrate.bitsPerSecond.compareTo(a.bitrate.bitsPerSecond));
        chosen = muxed.first;
      } else {
        return null;
      }

      final url = chosen.url.toString();
      DateTime expiresAt = DateTime.now().add(const Duration(hours: 5));

      final uri = Uri.tryParse(url);
      final expireSec = uri?.queryParameters['expire'];
      if (expireSec != null) {
        final sec = int.tryParse(expireSec);
        if (sec != null) {
          expiresAt = DateTime.fromMillisecondsSinceEpoch(sec * 1000);
        }
      }

      const streamHeaders = {
        'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        'Referer': 'https://music.youtube.com/',
      };

      final resolved = ResolvedStream(
        url: url,
        headers: streamHeaders,
        expiresAt: expiresAt,
        bitrate: chosen.bitrate.bitsPerSecond,
      );

      _cache[videoId] = resolved;
      return resolved;
    } catch (e) {
      if (kDebugMode) debugPrint('[StreamResolver] resolve error for $videoId: $e');
      return null;
    }
  }

  /// Resolves video + audio streams (for YouTube video playback) using on-device
  /// YouTube clients (prefers <= 720p H.264/VP9 paired with highest audio).
  Future<({String audioUrl, String? videoUrl})?> resolveVideoStreams(
    String rawVideoId,
  ) async {
    final videoId = rawVideoId.replaceFirst('yt-', '').trim();
    if (videoId.isEmpty) return null;
    try {
      StreamManifest? manifest;
      for (final clientSet in <List<YoutubeApiClient>>[
        [YoutubeApiClient.androidSdkless],
        [YoutubeApiClient.ios],
        [],
      ]) {
        try {
          manifest = await _yt.videos.streamsClient
              .getManifest(
                videoId,
                ytClients: clientSet.isEmpty ? null : clientSet,
                requireWatchPage: false,
              )
              .timeout(const Duration(seconds: 9));
          if (manifest.videoOnly.isNotEmpty || manifest.muxed.isNotEmpty) {
            break;
          }
        } catch (e) {
          if (kDebugMode) {
            debugPrint('[StreamResolver] video manifest fallback notice: $e');
          }
        }
      }
      if (manifest == null) return null;

      final audioList = manifest.audioOnly.toList()
        ..sort((a, b) => b.bitrate.bitsPerSecond.compareTo(a.bitrate.bitsPerSecond));
      final videoList = manifest.videoOnly.toList();
      if (videoList.isNotEmpty && audioList.isNotEmpty) {
        // Prefer <= 720p for crisp mobile playback without excessive bandwidth
        final capped = videoList
            .where((v) => v.videoResolution.height <= 720)
            .toList();
        final pool = capped.isNotEmpty ? capped : videoList;
        pool.sort((a, b) {
          final hCmp = b.videoResolution.height.compareTo(a.videoResolution.height);
          if (hCmp != 0) return hCmp;
          return b.bitrate.bitsPerSecond.compareTo(a.bitrate.bitsPerSecond);
        });
        return (
          audioUrl: audioList.first.url.toString(),
          videoUrl: pool.first.url.toString(),
        );
      }

      if (manifest.muxed.isNotEmpty) {
        final muxed = manifest.muxed.toList()
          ..sort((a, b) => b.videoResolution.height.compareTo(a.videoResolution.height));
        final url = muxed.first.url.toString();
        return (audioUrl: url, videoUrl: url);
      }

      if (audioList.isNotEmpty) {
        return (audioUrl: audioList.first.url.toString(), videoUrl: null);
      }
      return null;
    } catch (e) {
      if (kDebugMode) debugPrint('[StreamResolver] video error for $videoId: $e');
      return null;
    }
  }

  void clearCache() => _cache.clear();
}
