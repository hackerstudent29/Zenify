import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'api_service.dart';
import 'auth_service.dart';
import 'settings_service.dart';

class ActiveListenSession {
  ActiveListenSession({
    required this.eventId,
    required this.trackId,
    required this.trackTitle,
    this.trackAlbum,
    this.language,
    this.genre,
    this.contextType,
    this.contextId,
    required this.trackDurationMs,
    required this.startedAt,
    this.offline = false,
    this.quality = 256,
    this.artists = const [],
  });

  final String eventId;
  final String trackId;
  final String trackTitle;
  final String? trackAlbum;
  final String? language;
  final String? genre;
  final String? contextType;
  final String? contextId;
  final int trackDurationMs;
  final DateTime startedAt;
  final bool offline;
  final int quality;
  final List<Map<String, dynamic>> artists;

  int listenedMs = 0;
  DateTime? _playSegmentStart;
  bool _isPlaying = false;

  void onPlay() {
    if (_isPlaying) return;
    _isPlaying = true;
    _playSegmentStart = DateTime.now();
  }

  void onPause() {
    if (!_isPlaying) return;
    _isPlaying = false;
    if (_playSegmentStart != null) {
      listenedMs += DateTime.now().difference(_playSegmentStart!).inMilliseconds;
      _playSegmentStart = null;
    }
  }

  Map<String, dynamic> finalize(String endReason) {
    if (_isPlaying && _playSegmentStart != null) {
      listenedMs += DateTime.now().difference(_playSegmentStart!).inMilliseconds;
      _playSegmentStart = null;
      _isPlaying = false;
    }

    final endedAt = DateTime.now();
    final tzOffsetMin = endedAt.timeZoneOffset.inMinutes;

    return {
      'eventId': eventId,
      'startedAt': startedAt.toUtc().toIso8601String(),
      'endedAt': endedAt.toUtc().toIso8601String(),
      'tzOffsetMin': tzOffsetMin,
      'listenedMs': listenedMs,
      'trackDurationMs': trackDurationMs,
      'endReason': endReason,
      'trackSource': 'youtube',
      'trackId': trackId,
      'trackTitle': trackTitle,
      'trackAlbum': trackAlbum,
      'language': language,
      'genre': genre,
      'contextType': contextType,
      'contextId': contextId,
      'offline': offline,
      'quality': quality,
      'artists': artists,
    };
  }
}

class ListeningTrackerService {
  ListeningTrackerService._();

  static final ListeningTrackerService instance = ListeningTrackerService._();

  ActiveListenSession? _activeSession;
  File? _journalFile;
  bool _isSyncing = false;
  Timer? _periodicSyncTimer;

  Future<void> initialize() async {
    try {
      final docDir = await getApplicationDocumentsDirectory();
      _journalFile = File('${docDir.path}/listen_journal.jsonl');
      if (!await _journalFile!.exists()) {
        await _journalFile!.create(recursive: true);
      }
    } catch (e) {
      debugPrint('[ListeningTracker] Journal init error: $e');
    }

    // Periodic sync every 2 minutes
    _periodicSyncTimer?.cancel();
    _periodicSyncTimer = Timer.periodic(const Duration(minutes: 2), (_) {
      drainJournal();
    });

    // Attempt early sync
    drainJournal();
  }

  void startTrack({
    required String trackId,
    required String trackTitle,
    String? trackAlbum,
    String? language,
    String? genre,
    String? contextType,
    String? contextId,
    int trackDurationMs = 0,
    bool offline = false,
    int quality = 256,
    List<Map<String, dynamic>> artists = const [],
  }) {
    // If previous session wasn't finalized, close it with 'queue_replaced'
    if (_activeSession != null) {
      endTrack('queue_replaced');
    }

    // Check privacy gates
    final settings = SettingsState.instance;
    if (!settings.saveListeningHistory || settings.privateSession) {
      return;
    }

    final eventId = 'ev_${DateTime.now().millisecondsSinceEpoch}_${trackId.hashCode.abs()}';

    _activeSession = ActiveListenSession(
      eventId: eventId,
      trackId: trackId,
      trackTitle: trackTitle,
      trackAlbum: trackAlbum,
      language: language,
      genre: genre,
      contextType: contextType,
      contextId: contextId,
      trackDurationMs: trackDurationMs,
      startedAt: DateTime.now(),
      offline: offline,
      quality: quality,
      artists: artists,
    );

    _activeSession!.onPlay();
  }

  void onPlaybackStateChanged(bool isPlaying) {
    if (_activeSession == null) return;
    if (isPlaying) {
      _activeSession!.onPlay();
    } else {
      _activeSession!.onPause();
    }
  }

  void endTrack(String endReason) {
    if (_activeSession == null) return;

    final eventMap = _activeSession!.finalize(endReason);
    _activeSession = null;

    // Only record if user listened for at least 3 seconds
    if ((eventMap['listenedMs'] as int? ?? 0) >= 3000) {
      _writeToJournal(eventMap);
    }
  }

  Future<void> _writeToJournal(Map<String, dynamic> event) async {
    try {
      if (_journalFile == null) {
        final docDir = await getApplicationDocumentsDirectory();
        _journalFile = File('${docDir.path}/listen_journal.jsonl');
      }

      final line = '${jsonEncode(event)}\n';
      await _journalFile!.writeAsString(line, mode: FileMode.append, flush: true);

      // Trigger sync
      unawaited(drainJournal());
    } catch (e) {
      debugPrint('[ListeningTracker] Failed writing to journal: $e');
    }
  }

  Future<void> drainJournal() async {
    if (_isSyncing || _journalFile == null) return;
    if (!await _journalFile!.exists()) return;

    final token = await AuthService.instance.getAccessToken();
    if (token == null) return;

    _isSyncing = true;

    try {
      final lines = await _journalFile!.readAsLines();
      if (lines.isEmpty) {
        _isSyncing = false;
        return;
      }

      // Take batch up to 50
      final batchLines = lines.take(50).toList();
      final batchEvents = <Map<String, dynamic>>[];

      for (final line in batchLines) {
        final trimmed = line.trim();
        if (trimmed.isEmpty) continue;
        try {
          batchEvents.add(jsonDecode(trimmed) as Map<String, dynamic>);
        } catch (_) {}
      }

      if (batchEvents.isEmpty) {
        // Clear corrupted lines
        await _journalFile!.writeAsString('', mode: FileMode.write);
        _isSyncing = false;
        return;
      }

      final res = await http.post(
        Uri.parse('${ApiService.baseUrl}/api/me/listening/batch'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({'events': batchEvents}),
      ).timeout(const Duration(seconds: 15));

      if (res.statusCode == 200) {
        // Remove uploaded lines from file
        final remaining = lines.skip(batchLines.length).join('\n');
        await _journalFile!.writeAsString(
          remaining.isEmpty ? '' : '$remaining\n',
          mode: FileMode.write,
        );

        // If more lines left, drain remaining
        if (lines.length > batchLines.length) {
          _isSyncing = false;
          unawaited(drainJournal());
          return;
        }
      }
    } catch (e) {
      debugPrint('[ListeningTracker] Sync failed: $e');
    } finally {
      _isSyncing = false;
    }
  }

  void dispose() {
    _periodicSyncTimer?.cancel();
    if (_activeSession != null) {
      endTrack('app_killed');
    }
  }
}
