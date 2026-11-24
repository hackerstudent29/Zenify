import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart';

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'download_service.dart';
import 'innertube_service.dart';
import 'settings_service.dart';

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

  bool get isFresh =>
      DateTime.now().isBefore(expiresAt.subtract(const Duration(minutes: 10)));
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
  final Map<
    String,
    ({String audioUrl, String? videoUrl, Map<String, String> headers})
  >
  _videoStreamsCache = {};

  /// Resolves direct audio stream for a track, either by video ID or by direct on-device search.
  Future<ResolvedStream?> resolveTrack(Track track, {String? quality}) async {
    // 0. Fast path: Offline / Downloaded local audio check (0 network bytes)
    final localPath = DownloadService.instance.getLocalAudioPath(track.id);
    if (localPath != null && localPath.isNotEmpty) {
      return ResolvedStream(
        url: localPath,
        headers: const {},
        expiresAt: DateTime.now().add(const Duration(days: 365)),
        bitrate: 320000,
      );
    }

    final qPref = quality ?? SettingsState.instance.audioQuality;
    // 1. Direct YouTube video ID (yt-XXXXX or 11 chars)
    var videoId = track.id.replaceFirst('yt-', '').trim();
    if (videoId.length == 11 &&
        !videoId.contains(' ') &&
        !videoId.startsWith('http')) {
      final direct = await resolveStream(videoId, quality: qPref);
      if (direct != null && direct.url.isNotEmpty) return direct;
    }

    // 2. Search on-device directly via YouTube Music InnerTube for this track title & artist
    try {
      final cleanTitle = MediaNormalizer.cleanCompactTitle(track.title);
      final cleanArtist = MediaNormalizer.stripIdNoise(
        MediaNormalizer.formatArtists(track.artist),
      );
      final String q =
          (cleanArtist.isNotEmpty && cleanArtist != 'Unknown Artist')
          ? '$cleanTitle $cleanArtist'.trim()
          : cleanTitle;

      // Prefer YouTube Music song filter first (pure official music tracks, no videos/trailers)
      List<Track> songs = await InnerTubeService.instance
          .searchSongsNative(q)
          .timeout(const Duration(milliseconds: 1600));
      if (songs.isEmpty) {
        songs = await InnerTubeService.instance
            .search(q)
            .timeout(const Duration(milliseconds: 1600));
      }
      if (songs.isNotEmpty) {
        final lowerTarget = cleanTitle.toLowerCase();
        final lowerArtist = cleanArtist.toLowerCase();
        final exact = songs.firstWhere(
          (s) {
            final st = MediaNormalizer.cleanCompactTitle(s.title).toLowerCase();
            final sa = s.artist.toLowerCase();
            final titleMatches =
                st == lowerTarget ||
                st.contains(lowerTarget) ||
                lowerTarget.contains(st);
            final artistMatches =
                lowerArtist.isEmpty ||
                lowerArtist == 'unknown artist' ||
                sa.contains(lowerArtist) ||
                lowerArtist.contains(sa);
            return titleMatches && artistMatches;
          },
          orElse: () => songs.firstWhere((s) {
            final st = MediaNormalizer.cleanCompactTitle(s.title).toLowerCase();
            return st == lowerTarget ||
                st.contains(lowerTarget) ||
                lowerTarget.contains(st);
          }, orElse: () => songs.first),
        );
        final topId = exact.id.replaceFirst('yt-', '').trim();
        if (topId.length == 11) {
          final direct = await resolveStream(topId, quality: qPref);
          if (direct != null && direct.url.isNotEmpty) return direct;
        }
      }
    } catch (_) {}

    return null;
  }

  Future<String?> resolveAudioUrl(String rawVideoId, {String? quality}) async {
    final stream = await resolveStream(rawVideoId, quality: quality);
    return stream?.url;
  }

  Future<ResolvedStream?> resolveStream(
    String rawVideoId, {
    String? quality,
  }) async {
    final cleanId = rawVideoId.replaceFirst('yt-', '').trim();
    if (cleanId.isEmpty) return null;

    final localAudio = DownloadService.instance.getLocalAudioPath(cleanId) ??
        DownloadService.instance.getLocalAudioPath(rawVideoId);
    if (localAudio != null && localAudio.isNotEmpty) {
      return ResolvedStream(
        url: localAudio,
        headers: const {},
        expiresAt: DateTime.now().add(const Duration(days: 365)),
        bitrate: 320000,
      );
    }

    final qPref = quality ?? SettingsState.instance.audioQuality;
    final cacheKey = '${cleanId}_$qPref';
    final cached = _cache[cacheKey];
    if (cached != null && cached.isFresh) {
      return cached;
    }

    final running = _inflight[cacheKey];
    if (running != null) {
      return running;
    }

    final future = _resolve(cleanId, quality: qPref, cacheKey: cacheKey);
    _inflight[cacheKey] = future;

    try {
      final res = await future;
      if (res != null) {
        _cache[cacheKey] = res;
      }
      return res;
    } finally {
      _inflight.remove(cacheKey);
    }
  }

  Future<ResolvedStream?> _resolve(
    String videoId, {
    String? quality,
    String? cacheKey,
  }) async {
    try {
      StreamManifest? manifest;
      var usedClient = 'ios';
      final qPref = quality ?? SettingsState.instance.audioQuality;

      // Waterfall strategy tailored to requested quality:
      // - For 'ultra_low' & 'low': iOS client lacks 50k/70k Opus streams, so query androidSdkless first!
      // - For 'medium' & 'high': query iOS client first (instant AAC/Opus, no PoToken blocks)
      final clientWaterfall = (qPref == 'ultra_low' || qPref == 'low')
          ? <(String, List<YoutubeApiClient>?)>[
              ('androidSdkless', [YoutubeApiClient.androidSdkless]),
              ('ios', [YoutubeApiClient.ios]),
              ('default', null),
            ]
          : <(String, List<YoutubeApiClient>?)>[
              ('ios', [YoutubeApiClient.ios]),
              ('androidSdkless', [YoutubeApiClient.androidSdkless]),
              ('default', null),
            ];

      for (final (clientName, clientList) in clientWaterfall) {
        try {
          manifest = await _yt.videos.streamsClient
              .getManifest(
                videoId,
                ytClients: clientList,
                requireWatchPage: false,
              )
              .timeout(const Duration(milliseconds: 1600));
          if (manifest.audioOnly.isNotEmpty || manifest.muxed.isNotEmpty) {
            usedClient = clientName;
            break;
          }
        } catch (e) {
          if (kDebugMode) {
            debugPrint('[StreamResolver] $clientName client notice: $e');
          }
        }
      }

      if (manifest == null) return null;

      final audioStreams = manifest.audioOnly.toList();
      final StreamInfo chosen;

      if (audioStreams.isNotEmpty) {
        if (qPref == 'ultra_low') {
          // Ultra Data Saver (~50kbps, itag 249 Opus or itag 139 AAC)
          audioStreams.sort(
            (a, b) =>
                a.bitrate.bitsPerSecond.compareTo(b.bitrate.bitsPerSecond),
          );
          chosen = audioStreams.first;
        } else if (qPref == 'low') {
          // Data Saver (~70kbps, itag 250 Opus)
          const target = 70000;
          audioStreams.sort((a, b) {
            final aDiff = (a.bitrate.bitsPerSecond - target).abs();
            final bDiff = (b.bitrate.bitsPerSecond - target).abs();
            return aDiff.compareTo(bDiff);
          });
          chosen = audioStreams.first;
        } else if (qPref == 'medium') {
          // Medium / Standard (~128kbps, prefer MP4/AAC itag 140 or 128k Opus)
          const target = 128000;
          audioStreams.sort((a, b) {
            final aMp4 = a.container.name.toLowerCase() == 'mp4' ? 1 : 0;
            final bMp4 = b.container.name.toLowerCase() == 'mp4' ? 1 : 0;
            if (aMp4 != bMp4) return bMp4.compareTo(aMp4);
            final aDiff = (a.bitrate.bitsPerSecond - target).abs();
            final bDiff = (b.bitrate.bitsPerSecond - target).abs();
            return aDiff.compareTo(bDiff);
          });
          chosen = audioStreams.first;
        } else {
          // High / Studio (~160kbps Opus, itag 251 or highest available)
          audioStreams.sort(
            (a, b) =>
                b.bitrate.bitsPerSecond.compareTo(a.bitrate.bitsPerSecond),
          );
          chosen = audioStreams.first;
        }
      } else if (manifest.muxed.isNotEmpty) {
        final muxed = manifest.muxed.toList();
        if (qPref == 'ultra_low') {
          muxed.sort(
            (a, b) =>
                a.bitrate.bitsPerSecond.compareTo(b.bitrate.bitsPerSecond),
          );
        } else {
          muxed.sort(
            (a, b) =>
                b.bitrate.bitsPerSecond.compareTo(a.bitrate.bitsPerSecond),
          );
        }
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

      final streamHeaders = usedClient == 'androidSdkless'
          ? const {
              'User-Agent':
                  'com.google.android.youtube/19.44.38 (Linux; U; Android 14; en_US) gzip',
              'Referer': 'https://music.youtube.com/',
            }
          : const {
              'User-Agent':
                  'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU OS 18_3_2 like Mac OS X)',
              'Referer': 'https://music.youtube.com/',
            };

      final resolved = ResolvedStream(
        url: url,
        headers: streamHeaders,
        expiresAt: expiresAt,
        bitrate: chosen.bitrate.bitsPerSecond,
      );

      final k = cacheKey ?? '${videoId}_$qPref';
      _cache[k] = resolved;
      return resolved;
    } catch (e) {
      if (kDebugMode)
        debugPrint('[StreamResolver] resolve error for $videoId: $e');
      return null;
    }
  }

  static int videoQualityToMaxHeight(String quality) =>
      switch (quality.toLowerCase()) {
        '8k' => 4320,
        '4k' => 2160,
        '2k' => 1440,
        '1080p' => 1080,
        '720p' => 720,
        '480p' => 480,
        '360p' => 360,
        _ => 720,
      };

  /// Resolves video + audio streams (for YouTube video playback & offline download)
  /// honoring user-selected quality from 8K down to 360p.
  /// Uses TV client for 1080p+ UHD streams and iOS client for <= 720p streams.
  Future<({String audioUrl, String? videoUrl, Map<String, String> headers})?>
  resolveVideoStreams(
    String rawVideoId, {
    String? quality,
    bool preferMuxed = false,
  }) async {
    final videoId = rawVideoId.replaceFirst('yt-', '').trim();
    if (videoId.isEmpty) return null;

    // Fast path: Offline / Downloaded local video check (0 network bytes)
    final localVid = DownloadService.instance.getLocalVideoPath(videoId) ??
        DownloadService.instance.getLocalVideoPath(rawVideoId);
    final localAud = DownloadService.instance.getLocalAudioPath(videoId) ??
        DownloadService.instance.getLocalAudioPath(rawVideoId);
    if (localVid != null || localAud != null) {
      final audioPath = localAud ?? localVid!;
      final videoPath = localVid;
      return (
        audioUrl: audioPath,
        videoUrl: videoPath,
        headers: const <String, String>{},
      );
    }

    final qPref = quality ?? SettingsState.instance.videoQuality;
    final targetMaxHeight = videoQualityToMaxHeight(qPref);
    final cacheKey = '${videoId}_$targetMaxHeight';

    final cached = _videoStreamsCache[cacheKey];
    if (cached != null) return cached;

    try {
      StreamManifest? manifest;
      var usedClient = targetMaxHeight > 720 ? 'tv' : 'ios';

      final clientWaterfall = targetMaxHeight > 720
          ? <List<YoutubeApiClient>>[
              [YoutubeApiClient.tv],
              [YoutubeApiClient.ios],
              [YoutubeApiClient.androidSdkless],
              [],
            ]
          : <List<YoutubeApiClient>>[
              [YoutubeApiClient.ios],
              [YoutubeApiClient.tv],
              [YoutubeApiClient.androidSdkless],
              [],
            ];

      for (final clientSet in clientWaterfall) {
        try {
          manifest = await _yt.videos.streamsClient
              .getManifest(
                videoId,
                ytClients: clientSet.isEmpty ? null : clientSet,
                requireWatchPage: false,
              )
              .timeout(const Duration(milliseconds: 1800));
          if (manifest.videoOnly.isNotEmpty || manifest.muxed.isNotEmpty) {
            if (clientSet.isNotEmpty) {
              if (clientSet.first == YoutubeApiClient.ios) {
                usedClient = 'ios';
              } else if (clientSet.first == YoutubeApiClient.tv) {
                usedClient = 'tv';
              } else {
                usedClient = 'android';
              }
            }
            break;
          }
        } catch (e) {
          if (kDebugMode) {
            debugPrint('[StreamResolver] video manifest fallback notice: $e');
          }
        }
      }
      if (manifest == null) return null;

      final streamHeaders = usedClient == 'tv'
          ? const {
              'User-Agent':
                  'Mozilla/5.0 (ChromiumStylePlatform; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
              'Origin': 'https://www.youtube.com',
              'Referer': 'https://www.youtube.com/tv',
            }
          : const {
              'User-Agent':
                  'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU OS 18_3_2 like Mac OS X)',
              'Referer': 'https://music.youtube.com/',
            };

      // 1. Prepare Audio streams
      final audioPref = SettingsState.instance.audioQuality;
      final audioList = manifest.audioOnly.toList();
      if (audioList.isNotEmpty) {
        if (audioPref == 'ultra_low') {
          audioList.sort(
            (a, b) =>
                a.bitrate.bitsPerSecond.compareTo(b.bitrate.bitsPerSecond),
          );
        } else if (audioPref == 'low') {
          const target = 70000;
          audioList.sort((a, b) {
            final aDiff = (a.bitrate.bitsPerSecond - target).abs();
            final bDiff = (b.bitrate.bitsPerSecond - target).abs();
            return aDiff.compareTo(bDiff);
          });
        } else if (audioPref == 'medium') {
          const target = 128000;
          audioList.sort((a, b) {
            final aMp4 = a.container.name.toLowerCase() == 'mp4' ? 1 : 0;
            final bMp4 = b.container.name.toLowerCase() == 'mp4' ? 1 : 0;
            if (aMp4 != bMp4) return bMp4.compareTo(aMp4);
            final aDiff = (a.bitrate.bitsPerSecond - target).abs();
            final bDiff = (b.bitrate.bitsPerSecond - target).abs();
            return aDiff.compareTo(bDiff);
          });
        } else {
          audioList.sort((a, b) {
            final aMp4 = a.container.name.toLowerCase() == 'mp4' ? 1 : 0;
            final bMp4 = b.container.name.toLowerCase() == 'mp4' ? 1 : 0;
            if (aMp4 != bMp4) return bMp4.compareTo(aMp4);
            return b.bitrate.bitsPerSecond.compareTo(a.bitrate.bitsPerSecond);
          });
        }
      }

      // 2. Prepare Video streams (videoOnly)
      final allVideos = manifest.videoOnly.toList();

      int videoCodecScore(VideoOnlyStreamInfo v) {
        final codec = v.videoCodec.toLowerCase();
        final isAvc = codec.contains('avc') || codec.contains('h264');
        final isMp4 = v.container.name.toLowerCase() == 'mp4';
        // Hardware AVC/H.264 decodes with 0 dropped frames on mobile SoCs (MediaTek/Snapdragon)
        if (isAvc && isMp4) return 5;
        if (isAvc || isMp4) return 4;
        if (codec.contains('vp9') || codec.contains('vp09')) return 2;
        return 1; // av01
      }

      // Check streams that are <= targetMaxHeight
      final underOrAtCap = allVideos
          .where((v) => v.videoResolution.height <= targetMaxHeight)
          .toList();

      final List<VideoOnlyStreamInfo> candidates;
      if (underOrAtCap.isNotEmpty) {
        // Pick from streams <= targetMaxHeight, sorted descending so highest available is first
        underOrAtCap.sort((a, b) {
          final hCmp = b.videoResolution.height.compareTo(
            a.videoResolution.height,
          );
          if (hCmp != 0) return hCmp;
          final sCmp = videoCodecScore(b).compareTo(videoCodecScore(a));
          if (sCmp != 0) return sCmp;
          return b.bitrate.bitsPerSecond.compareTo(a.bitrate.bitsPerSecond);
        });
        candidates = underOrAtCap;
      } else if (allVideos.isNotEmpty) {
        // If all available videos are above target, sort ascending to pick lowest above cap
        allVideos.sort(
          (a, b) =>
              a.videoResolution.height.compareTo(b.videoResolution.height),
        );
        candidates = allVideos;
      } else {
        candidates = [];
      }

      // 3. Prepare Muxed streams
      MuxedStreamInfo? chosenMuxed;
      if (manifest.muxed.isNotEmpty) {
        final muxed = manifest.muxed.toList();
        final underCapMuxed = muxed
            .where((m) => m.videoResolution.height <= targetMaxHeight)
            .toList();
        if (underCapMuxed.isNotEmpty) {
          underCapMuxed.sort(
            (a, b) =>
                b.videoResolution.height.compareTo(a.videoResolution.height),
          );
          chosenMuxed = underCapMuxed.first;
        }
      }

      // DECISION RULES:
      // A. If preferMuxed is explicitly requested (e.g. single-file download) and available:
      if (preferMuxed && chosenMuxed != null) {
        final url = chosenMuxed.url.toString();
        final res = (audioUrl: url, videoUrl: url, headers: streamHeaders);
        _videoStreamsCache[cacheKey] = res;
        return res;
      }

      // B. If user requested High-Res (> 720p: 1080p, 2K, 4K, 8K) and separate video stream exists:
      // Always pair the high-res separate video stream with high-quality audio!
      if (targetMaxHeight > 720 &&
          candidates.isNotEmpty &&
          audioList.isNotEmpty) {
        final chosen = candidates.first;
        final res = (
          audioUrl: audioList.first.url.toString(),
          videoUrl: chosen.url.toString(),
          headers: streamHeaders,
        );
        _videoStreamsCache[cacheKey] = res;
        return res;
      }

      // C. For standard/lower resolutions (<= 720p):
      // If muxed stream matches or is better/equal to separate, use muxed (faster, single stream).
      if (chosenMuxed != null) {
        final separateHeight = candidates.isNotEmpty
            ? candidates.first.videoResolution.height
            : 0;
        if (chosenMuxed.videoResolution.height >= separateHeight ||
            audioList.isEmpty) {
          final url = chosenMuxed.url.toString();
          final res = (audioUrl: url, videoUrl: url, headers: streamHeaders);
          _videoStreamsCache[cacheKey] = res;
          return res;
        }
      }

      // D. Use separate video stream + audio
      if (candidates.isNotEmpty && audioList.isNotEmpty) {
        final chosen = candidates.first;
        final res = (
          audioUrl: audioList.first.url.toString(),
          videoUrl: chosen.url.toString(),
          headers: streamHeaders,
        );
        _videoStreamsCache[cacheKey] = res;
        return res;
      }

      // E. Fallback to any muxed stream
      if (manifest.muxed.isNotEmpty) {
        final muxed = manifest.muxed.toList();
        final underCapMuxed = muxed
            .where((m) => m.videoResolution.height <= targetMaxHeight)
            .toList();
        final chosenFallbackMuxed = underCapMuxed.isNotEmpty
            ? (underCapMuxed..sort(
                    (a, b) => b.videoResolution.height.compareTo(
                      a.videoResolution.height,
                    ),
                  ))
                  .first
            : (muxed..sort(
                    (a, b) => a.videoResolution.height.compareTo(
                      b.videoResolution.height,
                    ),
                  ))
                  .first;
        final url = chosenFallbackMuxed.url.toString();
        final res = (audioUrl: url, videoUrl: url, headers: streamHeaders);
        _videoStreamsCache[cacheKey] = res;
        return res;
      }

      if (audioList.isNotEmpty) {
        final res = (
          audioUrl: audioList.first.url.toString(),
          videoUrl: null,
          headers: streamHeaders,
        );
        _videoStreamsCache[cacheKey] = res;
        return res;
      }
      return null;
    } catch (e) {
      if (kDebugMode)
        debugPrint('[StreamResolver] video error for $videoId: $e');
      return null;
    }
  }

  void clearCache() {
    _cache.clear();
    _videoStreamsCache.clear();
  }
}
