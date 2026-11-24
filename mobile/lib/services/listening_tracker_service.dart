import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/replay/data/all_time_index_store.dart';
import '../features/replay/domain/listen_event.dart';
import 'api_service.dart';
import 'auth_service.dart';
import 'listening_history_service.dart';
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
    this.loopOne = false,
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
  final bool loopOne;

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
      if (trackAlbum != null && trackAlbum!.isNotEmpty) 'trackAlbum': trackAlbum,
      if (language != null && language!.isNotEmpty) 'language': language,
      if (genre != null && genre!.isNotEmpty) 'genre': genre,
      if (contextType != null && contextType!.isNotEmpty) 'contextType': contextType,
      if (contextId != null && contextId!.isNotEmpty) 'contextId': contextId,
      'offline': offline,
      'source': offline ? 'offline' : 'stream',
      'loopOne': loopOne,
      'quality': quality,
      'artists': artists,
      'schemaVersion': 2,
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

    // Attempt early sync & cloud history restoration
    unawaited(drainJournal());
    unawaited(restoreHistoryFromServer());
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
    bool loopOne = false,
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
      loopOne: loopOne,
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

    final ms = (eventMap['listenedMs'] as int? ?? 0);
    // Record into local listening history service for instant local replay & history
    if (ms >= 1000) {
      unawaited(ListeningHistoryService.instance.recordCompletedListen(eventMap));
      try {
        final listenEvent = ListenEvent.fromJson(eventMap);
        unawaited(AllTimeIndexStore.instance.recordEvent(listenEvent));
      } catch (e) {
        debugPrint('[ListeningTracker] AllTimeIndex update error: $e');
      }
    }

    // Only record to journal for server sync if user listened for at least 3 seconds
    if (ms >= 3000) {
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

      // Trigger sync only for online events (keep offline listening 100% disconnected from network)
      if (event['offline'] != true) {
        unawaited(drainJournal());
      }
    } catch (e) {
      debugPrint('[ListeningTracker] Failed writing to journal: $e');
    }
  }

  static const String _journalSyncOffsetKey = 'zenify_listen_journal_sync_offset_v1';

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

      final prefs = await SharedPreferences.getInstance();
      var syncedCount = prefs.getInt(_journalSyncOffsetKey) ?? 0;
      if (syncedCount > lines.length) {
        syncedCount = 0;
        await prefs.setInt(_journalSyncOffsetKey, 0);
      }
      if (syncedCount >= lines.length) {
        _isSyncing = false;
        return;
      }

      // Take batch up to 50 pending lines
      final batchLines = lines.skip(syncedCount).take(50).toList();
      final batchEvents = <Map<String, dynamic>>[];

      for (final line in batchLines) {
        final trimmed = line.trim();
        if (trimmed.isEmpty) continue;
        try {
          batchEvents.add(jsonDecode(trimmed) as Map<String, dynamic>);
        } catch (_) {}
      }

      if (batchEvents.isEmpty) {
        await prefs.setInt(_journalSyncOffsetKey, syncedCount + batchLines.length);
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
        final newOffset = syncedCount + batchLines.length;
        await prefs.setInt(_journalSyncOffsetKey, newOffset);

        // If more lines left, drain remaining
        if (lines.length > newOffset) {
          _isSyncing = false;
          unawaited(drainJournal());
          return;
        } else if (lines.length >= 200) {
          // Log compaction: Retain the most recent 100 events to prevent unbounded disk & RAM bloat
          try {
            final retained = lines.sublist(lines.length - 100);
            await _journalFile!.writeAsString('${retained.join('\n')}\n', flush: true);
            await prefs.setInt(_journalSyncOffsetKey, 100);
          } catch (_) {}
        }
      }
    } catch (e) {
      debugPrint('[ListeningTracker] Sync failed: $e');
    } finally {
      _isSyncing = false;
    }
  }

  /// Restores cloud listening events from the user's account into the local Replay journal.
  /// Solves the missing history issue on fresh install or app update.
  Future<bool> restoreHistoryFromServer({bool force = false}) async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null || token.isEmpty) return false;

    try {
      if (_journalFile == null) {
        final docDir = await getApplicationDocumentsDirectory();
        _journalFile = File('${docDir.path}/listen_journal.jsonl');
      }

      final exists = await _journalFile!.exists();
      if (!force && exists) {
        final lines = await _journalFile!.readAsLines();
        if (lines.length >= 5) {
          // Already populated with events
          return true;
        }
      }

      final res = await http.get(
        Uri.parse('${ApiService.baseUrl}/api/me/history?limit=200'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final events = data['events'] as List? ?? [];
        if (events.isEmpty) return false;

        final linesToWrite = <String>[];
        for (final raw in events) {
          if (raw is! Map) continue;
          final m = Map<String, dynamic>.from(raw);
          final eventMap = <String, dynamic>{
            'eventId': m['eventId']?.toString() ?? 'ev_${DateTime.now().millisecondsSinceEpoch}',
            'startedAt': m['startedAt']?.toString() ?? DateTime.now().toUtc().toIso8601String(),
            'endedAt': m['endedAt']?.toString() ?? DateTime.now().toUtc().toIso8601String(),
            'tzOffsetMin': (m['tzOffsetMin'] as num?)?.toInt() ?? 0,
            'listenedMs': (m['listenedMs'] as num?)?.toInt() ?? 0,
            'trackDurationMs': (m['trackDurationMs'] as num?)?.toInt() ?? 0,
            'endReason': m['endReason']?.toString() ?? 'completed',
            'trackSource': m['trackSource']?.toString() ?? 'youtube',
            'trackId': m['trackId']?.toString() ?? '',
            'trackTitle': m['trackTitle']?.toString() ?? 'Track',
            if (m['trackAlbum'] != null && m['trackAlbum'].toString().isNotEmpty)
              'trackAlbum': m['trackAlbum'].toString(),
            if (m['language'] != null && m['language'].toString().isNotEmpty)
              'language': m['language'].toString(),
            if (m['genre'] != null && m['genre'].toString().isNotEmpty)
              'genre': m['genre'].toString(),
            if (m['contextType'] != null && m['contextType'].toString().isNotEmpty)
              'contextType': m['contextType'].toString(),
            if (m['contextId'] != null && m['contextId'].toString().isNotEmpty)
              'contextId': m['contextId'].toString(),
            'offline': false,
            'source': 'stream',
            'loopOne': false,
            'quality': 256,
            'artists': [
              {
                'artistName': m['artistName']?.toString() ?? 'Artist',
                'isPrimary': true,
              }
            ],
            'schemaVersion': 2,
          };

          linesToWrite.add(jsonEncode(eventMap));
          unawaited(ListeningHistoryService.instance.recordCompletedListen(eventMap));
          try {
            final ev = ListenEvent.fromJson(eventMap);
            unawaited(AllTimeIndexStore.instance.recordEvent(ev));
          } catch (_) {}
        }

        if (linesToWrite.isNotEmpty) {
          await _journalFile!.writeAsString(
            '${linesToWrite.join('\n')}\n',
            mode: FileMode.write,
            flush: true,
          );
          final prefs = await SharedPreferences.getInstance();
          await prefs.setInt(_journalSyncOffsetKey, linesToWrite.length);
          return true;
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[ListeningTracker] restoreHistoryFromServer error: $e');
    }
    return false;
  }

  void dispose() {
    _periodicSyncTimer?.cancel();
    if (_activeSession != null) {
      endTrack('app_killed');
    }
  }
}
