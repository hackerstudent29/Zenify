// lib/services/download_service.dart
//
// Complete Offline Download System for Zenify Mobile
// Stores lightweight offline audio (< 5 MB), compressed cover artwork, and synced lyrics.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'api_service.dart';
import 'innertube_service.dart';
import 'lyrics_service.dart';
import 'settings_service.dart';
import 'stream_resolver_service.dart';
import 'system_notification_service.dart';
import 'zen_player.dart';

class DownloadedSong {
  const DownloadedSong({
    required this.id,
    required this.title,
    required this.artist,
    required this.album,
    required this.coverUrl,
    required this.audioPath,
    required this.coverPath,
    this.lyricsPath,
    required this.durationSeconds,
    required this.fileSizeBytes,
    required this.downloadedAt,
    this.albumBrowseId,
    this.isVideo = false,
    this.videoPath,
  });

  final String id;
  final String title;
  final String artist;
  final String album;
  final String coverUrl;
  final String audioPath;
  final String coverPath;
  final String? lyricsPath;
  final int durationSeconds;
  final int fileSizeBytes;
  final int downloadedAt;
  final String? albumBrowseId;
  final bool isVideo;
  final String? videoPath;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'artist': artist,
    'album': album,
    'coverUrl': coverUrl,
    'audioPath': audioPath,
    'coverPath': coverPath,
    'lyricsPath': lyricsPath,
    'durationSeconds': durationSeconds,
    'fileSizeBytes': fileSizeBytes,
    'downloadedAt': downloadedAt,
    'albumBrowseId': albumBrowseId,
    'isVideo': isVideo,
    'videoPath': videoPath,
  };

  factory DownloadedSong.fromJson(Map<String, dynamic> json) => DownloadedSong(
    id: json['id'] as String? ?? '',
    title: json['title'] as String? ?? '',
    artist: json['artist'] as String? ?? '',
    album: json['album'] as String? ?? '',
    coverUrl: json['coverUrl'] as String? ?? '',
    audioPath: json['audioPath'] as String? ?? '',
    coverPath: json['coverPath'] as String? ?? '',
    lyricsPath: json['lyricsPath'] as String?,
    durationSeconds: (json['durationSeconds'] as num?)?.toInt() ?? 0,
    fileSizeBytes: (json['fileSizeBytes'] as num?)?.toInt() ?? 0,
    downloadedAt: (json['downloadedAt'] as num?)?.toInt() ?? 0,
    albumBrowseId: json['albumBrowseId'] as String?,
    isVideo: json['isVideo'] as bool? ?? false,
    videoPath: json['videoPath'] as String?,
  );

  Track toTrack() => Track(
    id: id,
    title: title,
    artist: artist,
    album: album,
    coverUrl: File(coverPath).existsSync() ? 'file://$coverPath' : coverUrl,
    durationSeconds: durationSeconds,
    albumBrowseId: albumBrowseId,
    isVideo: isVideo,
  );

  String get formattedSize {
    var bytes = fileSizeBytes;
    if (bytes <= 0 && audioPath.isNotEmpty) {
      try {
        final f = File(audioPath);
        if (f.existsSync()) bytes += f.lengthSync();
        if (videoPath != null && videoPath != audioPath) {
          final vf = File(videoPath!);
          if (vf.existsSync()) bytes += vf.lengthSync();
        }
      } catch (_) {}
    }
    if (bytes <= 0) return '0 MB';
    final mb = bytes / (1024 * 1024);
    if (mb < 1000) return '${mb.toStringAsFixed(1)} MB';
    final gb = mb / 1024;
    return '${gb.toStringAsFixed(2)} GB';
  }
}

class DownloadService extends ChangeNotifier {
  DownloadService._();
  static final DownloadService instance = DownloadService._();

  static const String _kIndexFile = 'index.json';
  static const String _kDownloadsSubdir = 'downloads';

  Directory? _downloadsDir;
  final Map<String, DownloadedSong> _items = {};
  final Map<String, double> _downloadingProgress = {};
  bool _initialized = false;

  bool get isInitialized => _initialized;
  int get downloadedCount => _items.length;
  List<DownloadedSong> get downloadedSongs =>
      _items.values.toList()
        ..sort((a, b) => b.downloadedAt.compareTo(a.downloadedAt));

  List<Track> get downloadedTracks =>
      downloadedSongs.map((s) => s.toTrack()).toList();

  int get totalDownloadedBytes =>
      _items.values.fold(0, (sum, item) => sum + item.fileSizeBytes);

  String get formattedTotalSize {
    final bytes = totalDownloadedBytes;
    if (bytes <= 0) return '0 MB';
    final mb = bytes / (1024 * 1024);
    if (mb < 1000) return '${mb.toStringAsFixed(1)} MB';
    final gb = mb / 1024;
    return '${gb.toStringAsFixed(2)} GB';
  }

  bool isDownloaded(String trackId) => _items.containsKey(trackId);
  bool isDownloading(String trackId) =>
      _downloadingProgress.containsKey(trackId);
  double getDownloadProgress(String trackId) =>
      _downloadingProgress[trackId] ?? 0.0;
  DownloadedSong? getDownloaded(String trackId) => _items[trackId];

  String? getLocalAudioPath(String trackId) {
    final item = _items[trackId];
    if (item == null) return null;
    final file = File(item.audioPath);
    if (file.existsSync()) return file.path;
    if (_downloadsDir != null) {
      final safeId = trackId.replaceAll(RegExp(r'[^a-zA-Z0-9_\-]'), '_');
      final fallbackMp4 = File('${_downloadsDir!.path}/$safeId.mp4');
      if (fallbackMp4.existsSync()) return fallbackMp4.path;
      final fallbackM4a = File('${_downloadsDir!.path}/$safeId.m4a');
      if (fallbackM4a.existsSync()) return fallbackM4a.path;
    }
    return null;
  }

  String? getLocalVideoPath(String trackId) {
    final item = _items[trackId];
    if (item == null) return null;
    if (item.videoPath != null) {
      final file = File(item.videoPath!);
      if (file.existsSync()) return file.path;
    }
    if (item.isVideo) {
      final file = File(item.audioPath);
      if (file.existsSync()) return file.path;
    }
    if (_downloadsDir != null) {
      final safeId = trackId.replaceAll(RegExp(r'[^a-zA-Z0-9_\-]'), '_');
      final fallbackMp4 = File('${_downloadsDir!.path}/$safeId.mp4');
      if (fallbackMp4.existsSync()) return fallbackMp4.path;
    }
    return null;
  }

  String? getLocalCoverPath(String trackId) {
    final item = _items[trackId];
    if (item != null) {
      final file = File(item.coverPath);
      if (file.existsSync()) return file.path;
    }
    if (_downloadsDir != null) {
      final safeId = trackId.replaceAll(RegExp(r'[^a-zA-Z0-9_\-]'), '_');
      final fallbackJpg = File('${_downloadsDir!.path}/$safeId.jpg');
      if (fallbackJpg.existsSync()) return fallbackJpg.path;
      final fallbackWebp = File('${_downloadsDir!.path}/$safeId.webp');
      if (fallbackWebp.existsSync()) return fallbackWebp.path;
      final fallbackPng = File('${_downloadsDir!.path}/$safeId.png');
      if (fallbackPng.existsSync()) return fallbackPng.path;
    }
    return null;
  }

  String? getLocalLyricsPath(String trackId) {
    final item = _items[trackId];
    if (item?.lyricsPath == null) return null;
    final file = File(item!.lyricsPath!);
    if (file.existsSync()) return file.path;
    if (_downloadsDir != null) {
      final safeId = trackId.replaceAll(RegExp(r'[^a-zA-Z0-9_\-]'), '_');
      final fallback = File('${_downloadsDir!.path}/$safeId.lyrics.json');
      if (fallback.existsSync()) return fallback.path;
    }
    return null;
  }

  LyricsResult? getLocalLyrics(String trackId) {
    final path = getLocalLyricsPath(trackId);
    if (path == null) return null;
    try {
      final file = File(path);
      if (!file.existsSync()) return null;
      final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
      final lines =
          (json['lines'] as List?)?.cast<Map<String, dynamic>>() ?? [];
      final synced = json['synced'] == true;
      final source = json['source'] as String? ?? 'offline_download';
      final rawLrc = json['rawLrc'] as String?;
      return LyricsResult(
        lines: lines,
        synced: synced,
        source: source,
        rawLrc: rawLrc,
      );
    } catch (e) {
      debugPrint('[DownloadService] getLocalLyrics error: $e');
      return null;
    }
  }

  Future<void> init() async {
    if (_initialized) return;
    try {
      final docDir = await getApplicationDocumentsDirectory();
      _downloadsDir = Directory('${docDir.path}/$_kDownloadsSubdir');
      if (!await _downloadsDir!.exists()) {
        await _downloadsDir!.create(recursive: true);
      }

      final indexFile = File('${_downloadsDir!.path}/$_kIndexFile');
      if (await indexFile.exists()) {
        final content = await indexFile.readAsString();
        if (content.trim().isNotEmpty) {
          final List list = jsonDecode(content) as List;
          bool indexNeedsResave = false;
          for (final raw in list) {
            if (raw is Map<String, dynamic>) {
              var song = DownloadedSong.fromJson(raw);
              var audioFile = File(song.audioPath);
              if (!audioFile.existsSync() && _downloadsDir != null) {
                // Resilient path recovery: if stored absolute path moved across app update/container UUID change
                final fileName = song.audioPath.split(Platform.pathSeparator).last.split('/').last;
                final relFile = File('${_downloadsDir!.path}/$fileName');
                if (relFile.existsSync()) {
                  audioFile = relFile;
                  final coverName = song.coverPath.split(Platform.pathSeparator).last.split('/').last;
                  final relCover = File('${_downloadsDir!.path}/$coverName');
                  final relLyrics = song.lyricsPath != null
                      ? '${_downloadsDir!.path}/${song.lyricsPath!.split(Platform.pathSeparator).last.split('/').last}'
                      : null;
                  final relVideo = song.videoPath != null
                      ? '${_downloadsDir!.path}/${song.videoPath!.split(Platform.pathSeparator).last.split('/').last}'
                      : null;
                  song = DownloadedSong(
                    id: song.id,
                    title: song.title,
                    artist: song.artist,
                    album: song.album,
                    coverUrl: song.coverUrl,
                    audioPath: relFile.path,
                    coverPath: relCover.existsSync() ? relCover.path : song.coverPath,
                    lyricsPath: relLyrics != null && File(relLyrics).existsSync() ? relLyrics : song.lyricsPath,
                    durationSeconds: song.durationSeconds,
                    fileSizeBytes: song.fileSizeBytes,
                    downloadedAt: song.downloadedAt,
                    albumBrowseId: song.albumBrowseId,
                    isVideo: song.isVideo,
                    videoPath: relVideo != null && File(relVideo).existsSync() ? relVideo : song.videoPath,
                  );
                  indexNeedsResave = true;
                }
              }
              if (audioFile.existsSync()) {
                _items[song.id] = song;
              }
            }
          }
          if (indexNeedsResave) {
            unawaited(_saveIndex());
          }
        }
      }
      _initialized = true;
      notifyListeners();
    } catch (e) {
      debugPrint('[DownloadService] init error: $e');
      _initialized = true;
    }
  }

  Future<void> _saveIndex() async {
    try {
      if (_downloadsDir == null) return;
      final indexFile = File('${_downloadsDir!.path}/$_kIndexFile');
      final list = _items.values.map((s) => s.toJson()).toList();
      await indexFile.writeAsString(jsonEncode(list));
    } catch (e) {
      debugPrint('[DownloadService] _saveIndex error: $e');
    }
  }

  void _applyHeaders(HttpClientRequest req, Map<String, String> headers) {
    if (headers.isNotEmpty) {
      headers.forEach((k, v) {
        final lk = k.toLowerCase();
        if (lk != 'host' &&
            lk != 'content-length' &&
            lk != 'connection' &&
            lk != 'range') {
          req.headers.set(k, v);
        }
      });
    } else {
      req.headers.set(
        HttpHeaders.userAgentHeader,
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      );
      req.headers.set(HttpHeaders.acceptHeader, '*/*');
    }
  }

  static const int _kChunkSize = 1048576; // 1 MB per chunk
  static const int _kMaxParallelWorkers = 3;

  /// High-speed multi-threaded chunked range downloader.
  /// Bypasses GoogleVideo CDN 16 KB/s playback rate-limiting by requesting
  /// discrete 1 MB byte ranges in parallel at full network wire speed.
  Future<void> _streamToFile({
    required HttpClient client,
    required String url,
    required Map<String, String> headers,
    required File targetFile,
    required int estimatedDurationSeconds,
    required double startProgress,
    required double endProgress,
    required String trackId,
    int? knownContentLength,
  }) async {
    // 1. Send initial Range probe for chunk 0 (0 to _kChunkSize - 1)
    final probeReq = await client.getUrl(Uri.parse(url));
    _applyHeaders(probeReq, headers);
    probeReq.headers.set(
      HttpHeaders.rangeHeader,
      'bytes=0-${_kChunkSize - 1}',
    );

    final probeRes = await probeReq.close();
    if (probeRes.statusCode >= 400) {
      throw Exception('Stream probe returned HTTP ${probeRes.statusCode}');
    }

    // 2. Fallback: If server does not support Range (HTTP 200 returned instead of 206)
    if (probeRes.statusCode == 200) {
      final contentLength = probeRes.contentLength > 0
          ? probeRes.contentLength
          : (estimatedDurationSeconds > 0
              ? estimatedDurationSeconds * 20000
              : 4000000);

      var receivedBytes = 0;
      final sink = targetFile.openWrite(mode: FileMode.writeOnly);
      int lastNotifyMs = 0;
      double lastProgress = startProgress;

      await for (final chunk in probeRes) {
        sink.add(chunk);
        receivedBytes += chunk.length;
        final now = DateTime.now().millisecondsSinceEpoch;
        if (now - lastNotifyMs >= 200) {
          final fraction = (receivedBytes / contentLength).clamp(0.0, 1.0);
          final p = startProgress + (endProgress - startProgress) * fraction;
          if ((p - lastProgress) >= 0.04 || p >= (endProgress - 0.02)) {
            lastNotifyMs = now;
            lastProgress = p;
            _downloadingProgress[trackId] = p;
            notifyListeners();
          }
        }
      }
      await sink.flush();
      await sink.close();
      return;
    }

    // 3. Partial Content supported (HTTP 206)
    int totalBytes = -1;
    final cr = probeRes.headers.value(HttpHeaders.contentRangeHeader);
    if (cr != null && cr.contains('/')) {
      final totalStr = cr.split('/').last.trim();
      totalBytes = int.tryParse(totalStr) ?? -1;
    }
    if (totalBytes <= 0 && knownContentLength != null && knownContentLength > 0) {
      totalBytes = knownContentLength;
    }

    final chunk0Builder = BytesBuilder(copy: false);
    await for (final b in probeRes) {
      chunk0Builder.add(b);
    }
    final chunk0Bytes = chunk0Builder.takeBytes();

    // If totalBytes is unknown or single chunk covers everything
    if (totalBytes <= 0 || chunk0Bytes.length >= totalBytes) {
      await targetFile.writeAsBytes(chunk0Bytes, flush: true);
      _downloadingProgress[trackId] = endProgress;
      notifyListeners();
      return;
    }

    // 4. Multi-chunk parallel download
    RandomAccessFile? raf;
    try {
      raf = await targetFile.open(mode: FileMode.writeOnly);
      await raf.setPosition(0);
      await raf.writeFrom(chunk0Bytes);

      var receivedBytes = chunk0Bytes.length;
      final fraction0 = (receivedBytes / totalBytes).clamp(0.0, 1.0);
      _downloadingProgress[trackId] =
          startProgress + (endProgress - startProgress) * fraction0;
      notifyListeners();

      final tasks = <({int start, int end})>[];
      for (int start = chunk0Bytes.length; start < totalBytes; start += _kChunkSize) {
        final end = min(start + _kChunkSize - 1, totalBytes - 1);
        tasks.add((start: start, end: end));
      }

      if (tasks.isNotEmpty) {
        final taskQueue = List<({int start, int end})>.from(tasks);
        final writeLock = _AsyncLock();
        int lastNotifyMs = DateTime.now().millisecondsSinceEpoch;

        Future<void> worker() async {
          while (taskQueue.isNotEmpty) {
            final task = taskQueue.removeAt(0);
            Uint8List? chunkBytes;
            int retries = 2;
            while (retries-- > 0 && chunkBytes == null) {
              try {
                final req = await client.getUrl(Uri.parse(url));
                _applyHeaders(req, headers);
                req.headers.set(
                  HttpHeaders.rangeHeader,
                  'bytes=${task.start}-${task.end}',
                );
                final res = await req.close();
                if (res.statusCode == 206 || res.statusCode == 200) {
                  final bb = BytesBuilder(copy: false);
                  await for (final b in res) {
                    bb.add(b);
                  }
                  chunkBytes = bb.takeBytes();
                } else {
                  throw Exception('Chunk HTTP ${res.statusCode}');
                }
              } catch (e) {
                if (retries <= 0) rethrow;
                await Future.delayed(const Duration(milliseconds: 150));
              }
            }

            if (chunkBytes == null || chunkBytes.isEmpty) {
              throw Exception('Empty payload for range ${task.start}-${task.end}');
            }

            await writeLock.synchronized(() async {
              await raf!.setPosition(task.start);
              await raf.writeFrom(chunkBytes!);
            });

            receivedBytes += chunkBytes.length;
            final now = DateTime.now().millisecondsSinceEpoch;
            if (now - lastNotifyMs >= 150 || receivedBytes >= totalBytes) {
              lastNotifyMs = now;
              final fraction = (receivedBytes / totalBytes).clamp(0.0, 1.0);
              _downloadingProgress[trackId] =
                  startProgress + (endProgress - startProgress) * fraction;
              notifyListeners();
            }
          }
        }

        final workerCount = min(_kMaxParallelWorkers, tasks.length);
        await Future.wait(List.generate(workerCount, (_) => worker()));
      }

      await raf.flush();
    } finally {
      if (raf != null) {
        try {
          await raf.close();
        } catch (_) {}
      }
    }
  }

  /// Downloads a single track or music video at jet speed:
  /// Uses direct on-device stream resolution honoring [SettingsState.downloadAudioQuality]
  /// and [SettingsState.downloadVideoQuality], with direct streaming I/O.
  Future<bool> downloadTrack(Track track) async {
    if (isDownloaded(track.id) || isDownloading(track.id)) return true;

    // Check Wi-Fi constraint if "Download on Wi-Fi Only" is enabled
    if (SettingsState.instance.downloadWifiOnly) {
      final isWifi = await ZenPlayer.instance.isWifiConnected();
      if (!isWifi) {
        if (kDebugMode) {
          debugPrint('[DownloadService] Download blocked: Wi-Fi connection required');
        }
        return false;
      }
    }

    await init();
    if (_downloadsDir == null) return false;

    _downloadingProgress[track.id] = 0.05;
    notifyListeners();

    final safeId = track.id.replaceAll(RegExp(r'[^a-zA-Z0-9_\-]'), '_');
    final isVideo = track.isVideo;
    final audioFile = File('${_downloadsDir!.path}/$safeId.m4a');
    final videoFile = File('${_downloadsDir!.path}/$safeId.mp4');
    final coverFile = File('${_downloadsDir!.path}/$safeId.jpg');
    final lyricsFile = File('${_downloadsDir!.path}/$safeId.lyrics.json');

    HttpClient? httpClient;
    try {
      final dlAudioQuality = SettingsState.instance.downloadAudioQuality;
      final dlVideoQuality = SettingsState.instance.downloadVideoQuality;
      final dlImgQuality = SettingsState.instance.downloadImageQuality;
      final cleanVideoId = track.id.replaceFirst('yt-', '').trim();

      httpClient = HttpClient()
        ..connectionTimeout = const Duration(seconds: 12)
        ..idleTimeout = const Duration(seconds: 20);

      String audioPath = audioFile.path;
      String? videoPath;
      String? savedLyricsPath;

      // Start Cover Artwork and Synced Lyrics in parallel with audio/video download
      final coverTargetUrl = MediaNormalizer.upgradeArtworkUrl(
        track.coverUrl,
        videoId: cleanVideoId,
        qualityOverride: dlImgQuality,
      );
      final coverDownloadFuture = () async {
        if (coverTargetUrl.isNotEmpty && coverTargetUrl.startsWith('http')) {
          try {
            final imgRes = await http
                .get(Uri.parse(coverTargetUrl))
                .timeout(const Duration(seconds: 5));
            if (imgRes.statusCode == 200 && imgRes.bodyBytes.isNotEmpty) {
              await coverFile.writeAsBytes(imgRes.bodyBytes);
            }
          } catch (_) {}
        }
      }();

      final lyricsDownloadFuture = () async {
        try {
          final lyrics = await LyricsService.instance
              .fetchLyrics(track)
              .timeout(const Duration(seconds: 4));
          if (lyrics != null && lyrics.lines.isNotEmpty) {
            final lyricsMap = {
              'lines': lyrics.lines,
              'synced': lyrics.synced,
              'source': lyrics.source,
              'rawLrc': lyrics.rawLrc,
            };
            await lyricsFile.writeAsString(jsonEncode(lyricsMap));
            return lyricsFile.path;
          }
        } catch (_) {}
        return null;
      }();

      if (isVideo) {
        // --- Video Song Download ---
        final resolvedVideo = await StreamResolverService.instance.resolveVideoStreams(
          cleanVideoId,
          quality: dlVideoQuality,
          preferMuxed: true,
        );

        if (resolvedVideo != null) {
          final vUrl = resolvedVideo.videoUrl;
          final aUrl = resolvedVideo.audioUrl;
          final headers = resolvedVideo.headers;

          if (vUrl != null && vUrl == aUrl) {
            // Muxed MP4 (single combined stream, e.g. 720p/360p)
            _downloadingProgress[track.id] = 0.15;
            notifyListeners();
            await _streamToFile(
              client: httpClient,
              url: vUrl,
              headers: headers,
              targetFile: videoFile,
              estimatedDurationSeconds: track.durationSeconds,
              startProgress: 0.15,
              endProgress: 0.88,
              trackId: track.id,
            );
            audioPath = videoFile.path;
            videoPath = videoFile.path;
          } else if (vUrl != null && aUrl.isNotEmpty) {
            // Adaptive: separate video (.mp4) and audio (.m4a)
            _downloadingProgress[track.id] = 0.15;
            notifyListeners();
            await _streamToFile(
              client: httpClient,
              url: vUrl,
              headers: headers,
              targetFile: videoFile,
              estimatedDurationSeconds: track.durationSeconds,
              startProgress: 0.15,
              endProgress: 0.65,
              trackId: track.id,
            );
            await _streamToFile(
              client: httpClient,
              url: aUrl,
              headers: headers,
              targetFile: audioFile,
              estimatedDurationSeconds: track.durationSeconds,
              startProgress: 0.65,
              endProgress: 0.88,
              trackId: track.id,
            );
            audioPath = audioFile.path;
            videoPath = videoFile.path;
          } else {
            // Video stream unavailable, fall back to audio stream
            _downloadingProgress[track.id] = 0.15;
            notifyListeners();
            await _streamToFile(
              client: httpClient,
              url: aUrl,
              headers: headers,
              targetFile: audioFile,
              estimatedDurationSeconds: track.durationSeconds,
              startProgress: 0.15,
              endProgress: 0.88,
              trackId: track.id,
            );
            audioPath = audioFile.path;
          }
        } else {
          throw Exception('Unable to resolve video stream for $cleanVideoId');
        }
      } else {
        // --- Audio Song Download ---
        String? streamUrl;
        Map<String, String> streamHeaders = {};
        int? resolvedContentLength;

        // Step A: Try Android native InnerTube channel with user's download quality
        final resolvedNative = await InnerTubeService.instance.getStreamUrl(
          cleanVideoId,
          quality: dlAudioQuality,
        );
        if (resolvedNative != null && resolvedNative.url.isNotEmpty) {
          streamUrl = resolvedNative.url;
          streamHeaders = resolvedNative.headers;
          resolvedContentLength = resolvedNative.contentLength;
        }

        // Step B: Try on-device StreamResolverService (iOS client, clean direct GoogleVideo CDN)
        if (streamUrl == null || streamUrl.isEmpty) {
          final directStream = await StreamResolverService.instance.resolveTrack(
            track,
            quality: dlAudioQuality,
          );
          if (directStream != null && directStream.url.isNotEmpty) {
            streamUrl = directStream.url;
          }
        }

        // Step C: Try direct cleanVideoId on StreamResolverService
        if (streamUrl == null || streamUrl.isEmpty) {
          final directStream = await StreamResolverService.instance.resolveStream(
            cleanVideoId,
            quality: dlAudioQuality,
          );
          if (directStream != null && directStream.url.isNotEmpty) {
            streamUrl = directStream.url;
          }
        }

        // Step D: Fallback to proxy only if on-device resolution completely fails
        if (streamUrl == null || streamUrl.isEmpty) {
          final watch = 'https://www.youtube.com/watch?v=$cleanVideoId';
          streamUrl =
              '${ApiService.liveCloudUrl}/api/utils/stream-youtube?url=${Uri.encodeComponent(watch)}&trackId=yt-$cleanVideoId';
        }

        _downloadingProgress[track.id] = 0.15;
        notifyListeners();

        await _streamToFile(
          client: httpClient,
          url: streamUrl,
          headers: streamHeaders,
          targetFile: audioFile,
          estimatedDurationSeconds: track.durationSeconds,
          startProgress: 0.15,
          endProgress: 0.88,
          trackId: track.id,
          knownContentLength: resolvedContentLength,
        );
        audioPath = audioFile.path;
      }

      httpClient.close();
      httpClient = null;

      _downloadingProgress[track.id] = 0.88;
      notifyListeners();

      await coverDownloadFuture;
      _downloadingProgress[track.id] = 0.94;
      notifyListeners();

      savedLyricsPath = await lyricsDownloadFuture;

      final totalSongBytes =
          (await File(audioPath).exists() ? await File(audioPath).length() : 0) +
          (videoPath != null && videoPath != audioPath && await File(videoPath).exists()
              ? await File(videoPath).length()
              : 0) +
          (await coverFile.exists() ? await coverFile.length() : 0) +
          (savedLyricsPath != null && await lyricsFile.exists()
              ? await lyricsFile.length()
              : 0);

      final song = DownloadedSong(
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        coverUrl: track.coverUrl,
        audioPath: audioPath,
        coverPath: coverFile.path,
        lyricsPath: savedLyricsPath,
        durationSeconds: track.durationSeconds,
        fileSizeBytes: totalSongBytes,
        downloadedAt: DateTime.now().millisecondsSinceEpoch,
        albumBrowseId: track.albumBrowseId,
        isVideo: isVideo,
        videoPath: videoPath,
      );

      _items[track.id] = song;
      await _saveIndex();

      _downloadingProgress.remove(track.id);
      notifyListeners();

      unawaited(SystemNotificationService.instance.notifyDownloadComplete(
        title: track.title,
      ));

      return true;
    } catch (e) {
      debugPrint('[DownloadService] download failed for ${track.id}: $e');
      if (httpClient != null) {
        try {
          httpClient.close(force: true);
        } catch (_) {}
      }
      if (await audioFile.exists()) await audioFile.delete();
      if (await videoFile.exists()) await videoFile.delete();
      if (await coverFile.exists()) await coverFile.delete();
      if (await lyricsFile.exists()) await lyricsFile.delete();
      _downloadingProgress.remove(track.id);
      notifyListeners();
      return false;
    }
  }

  /// Bulk download all tracks in an album, playlist, or queue.
  Future<int> downloadBulk(List<Track> tracks) async {
    if (SettingsState.instance.downloadWifiOnly) {
      final isWifi = await ZenPlayer.instance.isWifiConnected();
      if (!isWifi) {
        if (kDebugMode) {
          debugPrint('[DownloadService] Bulk download blocked: Wi-Fi connection required');
        }
        return 0;
      }
    }
    var successCount = 0;
    for (final track in tracks) {
      if (!isDownloaded(track.id)) {
        final ok = await downloadTrack(track);
        if (ok) successCount++;
      }
    }
    return successCount;
  }

  /// Removes a downloaded song and deletes its local audio, video, image, and lyrics files.
  Future<bool> deleteDownload(String trackId) async {
    final item = _items[trackId];
    if (item == null) return false;

    try {
      final aFile = File(item.audioPath);
      if (await aFile.exists()) await aFile.delete();

      if (item.videoPath != null && item.videoPath != item.audioPath) {
        final vFile = File(item.videoPath!);
        if (await vFile.exists()) await vFile.delete();
      }

      final cFile = File(item.coverPath);
      if (await cFile.exists()) await cFile.delete();

      if (item.lyricsPath != null) {
        final lFile = File(item.lyricsPath!);
        if (await lFile.exists()) await lFile.delete();
      }

      _items.remove(trackId);
      await _saveIndex();
      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('[DownloadService] deleteDownload error: $e');
      return false;
    }
  }

  /// Deletes all downloaded songs and clears the downloads folder.
  Future<void> deleteAllDownloads() async {
    try {
      for (final item in _items.values) {
        try {
          final aFile = File(item.audioPath);
          if (await aFile.exists()) await aFile.delete();

          if (item.videoPath != null && item.videoPath != item.audioPath) {
            final vFile = File(item.videoPath!);
            if (await vFile.exists()) await vFile.delete();
          }

          final cFile = File(item.coverPath);
          if (await cFile.exists()) await cFile.delete();
          if (item.lyricsPath != null) {
            final lFile = File(item.lyricsPath!);
            if (await lFile.exists()) await lFile.delete();
          }
        } catch (_) {}
      }
      _items.clear();
      await _saveIndex();
      notifyListeners();
    } catch (e) {
      debugPrint('[DownloadService] deleteAllDownloads error: $e');
    }
  }
}

/// Simple lightweight async lock for sequential file I/O coordination.
class _AsyncLock {
  Future<void>? _last;
  Future<T> synchronized<T>(Future<T> Function() action) {
    final prev = _last;
    final completer = Completer<void>();
    _last = completer.future;
    return Future<T>(() async {
      if (prev != null) {
        try {
          await prev;
        } catch (_) {}
      }
      try {
        return await action();
      } finally {
        completer.complete();
      }
    });
  }
}
