// lib/services/download_service.dart
//
// Complete Offline Download System for Zenify Mobile
// Stores lightweight offline audio (< 5 MB), compressed cover artwork, and synced lyrics.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../models/track.dart';
import 'api_service.dart';
import 'innertube_service.dart';
import 'lyrics_service.dart';

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
  );

  Track toTrack() => Track(
    id: id,
    title: title,
    artist: artist,
    album: album,
    coverUrl: File(coverPath).existsSync() ? 'file://$coverPath' : coverUrl,
    durationSeconds: durationSeconds,
    albumBrowseId: albumBrowseId,
  );

  String get formattedSize {
    if (fileSizeBytes <= 0) return '0 MB';
    final mb = fileSizeBytes / (1024 * 1024);
    return '${mb.toStringAsFixed(1)} MB';
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
  List<DownloadedSong> get downloadedSongs => _items.values.toList()
    ..sort((a, b) => b.downloadedAt.compareTo(a.downloadedAt));

  List<Track> get downloadedTracks => downloadedSongs.map((s) => s.toTrack()).toList();

  int get totalDownloadedBytes => _items.values.fold(0, (sum, item) => sum + item.fileSizeBytes);

  String get formattedTotalSize {
    final bytes = totalDownloadedBytes;
    if (bytes <= 0) return '0 MB';
    final mb = bytes / (1024 * 1024);
    if (mb < 1000) return '${mb.toStringAsFixed(1)} MB';
    final gb = mb / 1024;
    return '${gb.toStringAsFixed(2)} GB';
  }

  bool isDownloaded(String trackId) => _items.containsKey(trackId);
  bool isDownloading(String trackId) => _downloadingProgress.containsKey(trackId);
  double getDownloadProgress(String trackId) => _downloadingProgress[trackId] ?? 0.0;
  DownloadedSong? getDownloaded(String trackId) => _items[trackId];

  String? getLocalAudioPath(String trackId) {
    final item = _items[trackId];
    if (item == null) return null;
    final file = File(item.audioPath);
    return file.existsSync() ? file.path : null;
  }

  String? getLocalLyricsPath(String trackId) {
    final item = _items[trackId];
    if (item?.lyricsPath == null) return null;
    final file = File(item!.lyricsPath!);
    return file.existsSync() ? file.path : null;
  }

  LyricsResult? getLocalLyrics(String trackId) {
    final path = getLocalLyricsPath(trackId);
    if (path == null) return null;
    try {
      final file = File(path);
      if (!file.existsSync()) return null;
      final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
      final lines = (json['lines'] as List?)?.cast<Map<String, dynamic>>() ?? [];
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
          for (final raw in list) {
            if (raw is Map<String, dynamic>) {
              final song = DownloadedSong.fromJson(raw);
              if (File(song.audioPath).existsSync()) {
                _items[song.id] = song;
              }
            }
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

  /// Downloads a single track: audio (< 5MB), cover image, and synced lyrics.
  Future<bool> downloadTrack(Track track) async {
    if (isDownloaded(track.id) || isDownloading(track.id)) return true;
    await init();
    if (_downloadsDir == null) return false;

    _downloadingProgress[track.id] = 0.05;
    notifyListeners();

    final safeId = track.id.replaceAll(RegExp(r'[^a-zA-Z0-9_\-]'), '_');
    final audioFile = File('${_downloadsDir!.path}/$safeId.m4a');
    final coverFile = File('${_downloadsDir!.path}/$safeId.jpg');
    final lyricsFile = File('${_downloadsDir!.path}/$safeId.lyrics.json');

    final client = http.Client();
    try {
      // 1. Resolve direct audio stream
      String? streamUrl;
      Map<String, String> streamHeaders = {};

      final cleanVideoId = track.id.replaceFirst('yt-', '').trim();
      final resolvedNative = await InnerTubeService.instance.getStreamUrl(cleanVideoId);
      if (resolvedNative != null && resolvedNative.url.isNotEmpty) {
        streamUrl = resolvedNative.url;
        streamHeaders = resolvedNative.headers;
      } else {
        // Fallback to proxy
        final watch = 'https://www.youtube.com/watch?v=$cleanVideoId';
        streamUrl = '${ApiService.liveCloudUrl}/api/utils/stream-youtube?url=${Uri.encodeComponent(watch)}&trackId=yt-$cleanVideoId';
      }

      _downloadingProgress[track.id] = 0.15;
      notifyListeners();

      // 2. Download Audio Stream
      final request = http.Request('GET', Uri.parse(streamUrl));
      if (streamHeaders.isNotEmpty) {
        request.headers.addAll(streamHeaders);
      }
      final response = await client.send(request);
      if (response.statusCode >= 400) {
        throw Exception('Audio stream returned HTTP ${response.statusCode}');
      }

      final contentLength = response.contentLength ?? (track.durationSeconds * 16000);
      var receivedBytes = 0;
      final sink = audioFile.openWrite();

      await for (final chunk in response.stream) {
        sink.add(chunk);
        receivedBytes += chunk.length;
        if (contentLength > 0) {
          final p = 0.15 + 0.70 * (receivedBytes / contentLength).clamp(0.0, 1.0);
          _downloadingProgress[track.id] = p;
          notifyListeners();
        }
      }
      await sink.flush();
      await sink.close();

      _downloadingProgress[track.id] = 0.88;
      notifyListeners();

      // 3. Download Cover Artwork
      if (track.coverUrl.isNotEmpty && track.coverUrl.startsWith('http')) {
        try {
          final imgRes = await http.get(Uri.parse(track.coverUrl)).timeout(const Duration(seconds: 8));
          if (imgRes.statusCode == 200 && imgRes.bodyBytes.isNotEmpty) {
            await coverFile.writeAsBytes(imgRes.bodyBytes);
          }
        } catch (_) {}
      }

      _downloadingProgress[track.id] = 0.94;
      notifyListeners();

      // 4. Download Synced Lyrics
      String? savedLyricsPath;
      try {
        final lyrics = await LyricsService.instance.fetchLyrics(track);
        if (lyrics != null && lyrics.lines.isNotEmpty) {
          final lyricsMap = {
            'lines': lyrics.lines,
            'synced': lyrics.synced,
            'source': lyrics.source,
            'rawLrc': lyrics.rawLrc,
          };
          await lyricsFile.writeAsString(jsonEncode(lyricsMap));
          savedLyricsPath = lyricsFile.path;
        }
      } catch (_) {}

      final totalSongBytes = (await audioFile.length()) +
          (await coverFile.exists() ? await coverFile.length() : 0) +
          (savedLyricsPath != null && await lyricsFile.exists() ? await lyricsFile.length() : 0);

      final song = DownloadedSong(
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        coverUrl: track.coverUrl,
        audioPath: audioFile.path,
        coverPath: coverFile.path,
        lyricsPath: savedLyricsPath,
        durationSeconds: track.durationSeconds,
        fileSizeBytes: totalSongBytes,
        downloadedAt: DateTime.now().millisecondsSinceEpoch,
        albumBrowseId: track.albumBrowseId,
      );

      _items[track.id] = song;
      await _saveIndex();

      _downloadingProgress.remove(track.id);
      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('[DownloadService] download failed for ${track.id}: $e');
      if (await audioFile.exists()) await audioFile.delete();
      if (await coverFile.exists()) await coverFile.delete();
      if (await lyricsFile.exists()) await lyricsFile.delete();
      _downloadingProgress.remove(track.id);
      notifyListeners();
      return false;
    } finally {
      client.close();
    }
  }

  /// Bulk download all tracks in an album, playlist, or queue.
  Future<int> downloadBulk(List<Track> tracks) async {
    var successCount = 0;
    for (final track in tracks) {
      if (!isDownloaded(track.id)) {
        final ok = await downloadTrack(track);
        if (ok) successCount++;
      }
    }
    return successCount;
  }

  /// Removes a downloaded song and deletes its local audio, image, and lyrics files.
  Future<bool> deleteDownload(String trackId) async {
    final item = _items[trackId];
    if (item == null) return false;

    try {
      final aFile = File(item.audioPath);
      if (await aFile.exists()) await aFile.delete();

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
