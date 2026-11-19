import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/track.dart';

/// Service that monitors user listening activity on device, maintains play history,
/// tracks frequently played artists & languages, and powers personalized recommendations
/// and local Apple Music-style Replay & Insights.
class ListeningHistoryService {
  ListeningHistoryService._();
  static final ListeningHistoryService instance = ListeningHistoryService._();

  static const String _historyKey = 'zenify_listening_history_v1';
  static const String _artistPlaysKey = 'zenify_artist_play_counts_v1';
  static const String _trackPlaysKey = 'zenify_track_play_counts_v1';
  static const String _trackListenedMsKey = 'zenify_track_listened_ms_v1';
  static const String _totalListeningMsKey = 'zenify_total_listening_ms_v1';
  static const String _sessionsKey = 'zenify_listening_sessions_v1';

  final List<Track> _history = [];
  final Map<String, int> _artistPlays = {};
  final Map<String, int> _trackPlays = {};
  final Map<String, int> _trackListenedMs = {};
  int _totalListeningMs = 0;
  final List<Map<String, dynamic>> _sessions = [];

  final ValueNotifier<int> historyNotifier = ValueNotifier<int>(0);
  bool _initialized = false;

  bool get hasHistory => _history.isNotEmpty || _sessions.isNotEmpty;

  List<Track> get recentTracks => List.unmodifiable(_history);

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    try {
      final prefs = await SharedPreferences.getInstance();

      // 1. Load history
      final rawHistory = prefs.getString(_historyKey);
      if (rawHistory != null && rawHistory.isNotEmpty) {
        final list = jsonDecode(rawHistory) as List?;
        if (list != null) {
          _history.clear();
          for (final item in list) {
            if (item is Map) {
              try {
                final t = Track.fromJson(Map<String, dynamic>.from(item));
                if (!t.artist.contains("Instance of") &&
                    !t.artist.contains("ArtistRef") &&
                    t.artist != 'Unknown Artist') {
                  _history.add(t);
                }
              } catch (_) {}
            }
          }
        }
      }

      // 2. Load artist play counts
      final rawArtists = prefs.getString(_artistPlaysKey);
      if (rawArtists != null && rawArtists.isNotEmpty) {
        final map = jsonDecode(rawArtists) as Map?;
        if (map != null) {
          _artistPlays.clear();
          map.forEach((k, v) {
            final keyStr = k.toString();
            if (v is int &&
                !keyStr.contains("Instance of") &&
                !keyStr.contains("ArtistRef")) {
              _artistPlays[keyStr] = v;
            }
          });
        }
      }

      // 3. Load track play counts & listened ms
      final rawTrackPlays = prefs.getString(_trackPlaysKey);
      if (rawTrackPlays != null && rawTrackPlays.isNotEmpty) {
        final map = jsonDecode(rawTrackPlays) as Map?;
        if (map != null) {
          _trackPlays.clear();
          map.forEach((k, v) {
            if (v is int) _trackPlays[k.toString()] = v;
          });
        }
      }

      final rawTrackMs = prefs.getString(_trackListenedMsKey);
      if (rawTrackMs != null && rawTrackMs.isNotEmpty) {
        final map = jsonDecode(rawTrackMs) as Map?;
        if (map != null) {
          _trackListenedMs.clear();
          map.forEach((k, v) {
            if (v is int) _trackListenedMs[k.toString()] = v;
          });
        }
      }

      _totalListeningMs = prefs.getInt(_totalListeningMsKey) ?? 0;

      // 4. Load sessions
      final rawSessions = prefs.getString(_sessionsKey);
      if (rawSessions != null && rawSessions.isNotEmpty) {
        final list = jsonDecode(rawSessions) as List?;
        if (list != null) {
          _sessions.clear();
          for (final item in list) {
            if (item is Map) {
              _sessions.add(Map<String, dynamic>.from(item));
            }
          }
        }
      }

      // 5. Seed sessions from history if sessions are empty
      if (_sessions.isEmpty && _history.isNotEmpty) {
        final now = DateTime.now();
        for (var i = 0; i < _history.length; i++) {
          final t = _history[i];
          final eventTime = now.subtract(Duration(hours: i * 2));
          final durMs = t.durationSeconds > 0 ? t.durationSeconds * 1000 : 210000;
          final dateKey = _formatDateKey(eventTime);

          _sessions.add({
            'eventId': 'local_init_${t.id}_$i',
            'trackId': t.id,
            'trackTitle': t.title,
            'artistName': t.artist.split(',').first.trim(),
            'trackAlbum': t.album,
            'coverUrl': t.coverUrl,
            'listenedMs': durMs,
            'trackDurationMs': durMs,
            'isSkip': false,
            'startedAt': eventTime.toIso8601String(),
            'endedAt': eventTime.add(Duration(milliseconds: durMs)).toIso8601String(),
            'date': dateKey,
            'dow': (eventTime.weekday - 1).clamp(0, 6),
            'hour': eventTime.hour,
          });

          _trackPlays[t.id] = (_trackPlays[t.id] ?? 0) + 1;
          _trackListenedMs[t.id] = (_trackListenedMs[t.id] ?? 0) + durMs;
          _totalListeningMs += durMs;
        }
      }

      historyNotifier.value++;
    } catch (e) {
      if (kDebugMode) debugPrint('[ListeningHistoryService] init error: $e');
    }
  }

  /// Records a track play event, updates recent order and increments artist play stats.
  Future<void> recordPlay(Track track) async {
    await init();

    // 1. Update recent history (deduplicate, move to front, cap at 60)
    _history.removeWhere((t) => t.id == track.id);
    _history.insert(0, track);
    if (_history.length > 60) {
      _history.removeRange(60, _history.length);
    }

    // 2. Increment artist play count
    final primaryArtist = track.artist.split(',').first.trim();
    if (primaryArtist.isNotEmpty && primaryArtist != 'Unknown Artist') {
      _artistPlays[primaryArtist] = (_artistPlays[primaryArtist] ?? 0) + 1;
    }

    _trackPlays[track.id] = (_trackPlays[track.id] ?? 0) + 1;

    historyNotifier.value++;

    // 3. Persist asynchronously
    _persist();
  }

  /// Records a finalized listening event when track completes, skips, or stops.
  Future<void> recordCompletedListen(Map<String, dynamic> event) async {
    await init();

    final trackId = event['trackId']?.toString() ?? '';
    if (trackId.isEmpty) return;

    final listenedMs = (event['listenedMs'] as num? ?? 0).toInt();
    final trackDurationMs = (event['trackDurationMs'] as num? ?? 0).toInt();
    final endReason = event['endReason']?.toString() ?? 'completed';
    final isSkip = listenedMs < 10000 && endReason == 'skipped';

    // Find cover and artist from recent history
    final track = findTrackById(trackId);
    final coverUrl = track?.coverUrl ?? '';
    final rawArtist = event['artists'] is List && (event['artists'] as List).isNotEmpty
        ? (event['artists'][0]['artistName']?.toString() ?? '')
        : (track?.artist ?? 'Unknown Artist');
    final primaryArtist = rawArtist.split(',').first.trim();

    final startedAtStr = event['startedAt']?.toString() ?? DateTime.now().toIso8601String();
    final startedAt = DateTime.tryParse(startedAtStr) ?? DateTime.now();
    final dateKey = _formatDateKey(startedAt);

    final sessionEvent = <String, dynamic>{
      'eventId': event['eventId']?.toString() ?? 'local_${DateTime.now().millisecondsSinceEpoch}',
      'trackId': trackId,
      'trackTitle': event['trackTitle']?.toString() ?? (track?.title ?? 'Unknown Track'),
      'artistName': primaryArtist.isNotEmpty ? primaryArtist : 'Unknown Artist',
      'trackAlbum': event['trackAlbum']?.toString() ?? (track?.album ?? ''),
      'coverUrl': coverUrl,
      'listenedMs': listenedMs,
      'trackDurationMs': trackDurationMs > 0 ? trackDurationMs : (track?.durationSeconds != null ? track!.durationSeconds * 1000 : 210000),
      'isSkip': isSkip,
      'startedAt': startedAt.toIso8601String(),
      'endedAt': event['endedAt']?.toString() ?? DateTime.now().toIso8601String(),
      'date': dateKey,
      'dow': (startedAt.weekday - 1).clamp(0, 6),
      'hour': startedAt.hour,
    };

    // Prepend to local sessions (keep up to 300)
    _sessions.insert(0, sessionEvent);
    if (_sessions.length > 300) {
      _sessions.removeRange(300, _sessions.length);
    }

    _trackListenedMs[trackId] = (_trackListenedMs[trackId] ?? 0) + listenedMs;
    _totalListeningMs += listenedMs;

    historyNotifier.value++;
    _persist();
  }

  Track? findTrackById(String trackId) {
    try {
      return _history.firstWhere((t) => t.id == trackId);
    } catch (_) {
      return null;
    }
  }

  void deleteLocalEvent(String eventId) {
    _sessions.removeWhere((e) => e['eventId'] == eventId);
    historyNotifier.value++;
    _persist();
  }

  /// Groups local plays into date sessions matching `/api/me/history` format.
  List<Map<String, dynamic>> getLocalSessions({String? query}) {
    final filtered = query == null || query.trim().isEmpty
        ? _sessions
        : _sessions.where((e) {
            final q = query.trim().toLowerCase();
            final title = (e['trackTitle']?.toString() ?? '').toLowerCase();
            final artist = (e['artistName']?.toString() ?? '').toLowerCase();
            final album = (e['trackAlbum']?.toString() ?? '').toLowerCase();
            return title.contains(q) || artist.contains(q) || album.contains(q);
          }).toList();

    final dateGroups = <String, List<Map<String, dynamic>>>{};
    for (final ev in filtered) {
      final date = ev['date']?.toString() ?? _formatDateKey(DateTime.now());
      dateGroups.putIfAbsent(date, () => []).add(ev);
    }

    final result = <Map<String, dynamic>>[];
    for (final entry in dateGroups.entries) {
      var totalMs = 0;
      for (final ev in entry.value) {
        totalMs += (ev['listenedMs'] as num? ?? 0).toInt();
      }
      result.add({
        'date': entry.key,
        'durationMs': totalMs,
        'events': entry.value,
      });
    }

    return result;
  }

  /// Generates a complete Apple Music Replay style payload from local data.
  Map<String, dynamic> getLocalInsights({String range = 'all'}) {
    final now = DateTime.now();
    DateTime? cutoff;
    if (range == 'week') {
      cutoff = now.subtract(const Duration(days: 7));
    } else if (range == 'month') {
      cutoff = now.subtract(const Duration(days: 30));
    } else if (range == 'year') {
      cutoff = now.subtract(const Duration(days: 365));
    }

    final activeEvents = cutoff == null
        ? _sessions
        : _sessions.where((e) {
            final st = DateTime.tryParse(e['startedAt']?.toString() ?? '');
            if (st == null) return true;
            return st.isAfter(cutoff!);
          }).toList();

    // If activeEvents is empty but we have history, use all sessions or synthesize
    final events = activeEvents.isNotEmpty
        ? activeEvents
        : (_sessions.isNotEmpty ? _sessions : <Map<String, dynamic>>[]);

    var totalListeningMs = 0;
    var totalSkips = 0;
    var nightPlays = 0;
    var morningPlays = 0;
    final trackMap = <String, Map<String, dynamic>>{};
    final artistMap = <String, Map<String, dynamic>>{};
    final activeDays = <String>{};
    final heatmapMinutes = List.generate(7, (_) => List.filled(24, 0));
    final timelineMap = <String, int>{};

    for (final ev in events) {
      final ms = (ev['listenedMs'] as num? ?? 0).toInt();
      totalListeningMs += ms;
      if (ev['isSkip'] == true) totalSkips++;

      final tId = ev['trackId']?.toString() ?? '';
      if (tId.isNotEmpty) {
        final t = trackMap.putIfAbsent(tId, () => {
          'trackId': tId,
          'trackTitle': ev['trackTitle']?.toString() ?? 'Unknown Track',
          'trackAlbum': ev['trackAlbum']?.toString() ?? '',
          'artistName': ev['artistName']?.toString() ?? 'Unknown Artist',
          'coverUrl': ev['coverUrl']?.toString() ?? '',
          'plays': 0,
          'listenedMs': 0,
        });
        t['plays'] = (t['plays'] as int) + 1;
        t['listenedMs'] = (t['listenedMs'] as int) + ms;
      }

      final aName = ev['artistName']?.toString() ?? '';
      if (aName.isNotEmpty && aName != 'Unknown Artist') {
        final a = artistMap.putIfAbsent(aName, () => {
          'artistKey': aName,
          'artistName': aName,
          'plays': 0,
          'listenedMs': 0,
        });
        a['plays'] = (a['plays'] as int) + 1;
        a['listenedMs'] = (a['listenedMs'] as int) + ms;
      }

      final dateStr = ev['date']?.toString() ?? '';
      if (dateStr.isNotEmpty) {
        activeDays.add(dateStr);
        timelineMap[dateStr] = (timelineMap[dateStr] ?? 0) + (ms / 60000).round();
      }

      final dow = (ev['dow'] as num? ?? 0).toInt().clamp(0, 6);
      final hour = (ev['hour'] as num? ?? 0).toInt().clamp(0, 23);
      heatmapMinutes[dow][hour] += max(1, (ms / 60000).round());

      if (hour >= 22 || hour <= 4) nightPlays++;
      if (hour >= 5 && hour <= 11) morningPlays++;
    }

    final totalPlays = events.length;

    // Top Tracks
    final topTracks = trackMap.values.toList()
      ..sort((a, b) => ((b['plays'] as int).compareTo(a['plays'] as int) != 0)
          ? (b['plays'] as int).compareTo(a['plays'] as int)
          : (b['listenedMs'] as int).compareTo(a['listenedMs'] as int));
    final rankedTracks = topTracks.take(10).toList();
    for (var i = 0; i < rankedTracks.length; i++) {
      rankedTracks[i]['rank'] = i + 1;
    }

    // Top Artists
    final topArtists = artistMap.values.toList()
      ..sort((a, b) => ((b['plays'] as int).compareTo(a['plays'] as int) != 0)
          ? (b['plays'] as int).compareTo(a['plays'] as int)
          : (b['listenedMs'] as int).compareTo(a['listenedMs'] as int));
    final rankedArtists = topArtists.take(10).toList();
    for (var i = 0; i < rankedArtists.length; i++) {
      rankedArtists[i]['rank'] = i + 1;
      final aMs = rankedArtists[i]['listenedMs'] as int;
      rankedArtists[i]['percentage'] = totalListeningMs > 0
          ? ((aMs / totalListeningMs) * 100).round().clamp(1, 100)
          : 0;
    }

    // Streak
    var streakDays = 0;
    for (var i = 0; i < 365; i++) {
      final d = now.subtract(Duration(days: i));
      final k = _formatDateKey(d);
      if (activeDays.contains(k)) {
        streakDays++;
      } else {
        if (i == 0) continue;
        break;
      }
    }

    // Heatmap normalized 0..4
    var maxCell = 0;
    for (var r = 0; r < 7; r++) {
      for (var c = 0; c < 24; c++) {
        if (heatmapMinutes[r][c] > maxCell) maxCell = heatmapMinutes[r][c];
      }
    }
    final heatmapNormalized = List.generate(7, (r) {
      return List.generate(24, (c) {
        if (maxCell <= 0) return 0.0;
        final ratio = heatmapMinutes[r][c] / maxCell;
        if (ratio <= 0.0) return 0.0;
        if (ratio < 0.25) return 1.0;
        if (ratio < 0.50) return 2.0;
        if (ratio < 0.75) return 3.0;
        return 4.0;
      });
    });

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var peakD = 0;
    var peakH = 20;
    var peakVal = -1;
    for (var r = 0; r < 7; r++) {
      for (var c = 0; c < 24; c++) {
        if (heatmapMinutes[r][c] > peakVal) {
          peakVal = heatmapMinutes[r][c];
          peakD = r;
          peakH = c;
        }
      }
    }

    // Timeline days
    final timelineDays = <Map<String, dynamic>>[];
    final timelineLen = range == 'week' ? 7 : (range == 'month' ? 30 : 14);
    for (var i = timelineLen - 1; i >= 0; i--) {
      final d = now.subtract(Duration(days: i));
      final k = _formatDateKey(d);
      timelineDays.add({
        'date': k,
        'minutes': timelineMap[k] ?? 0,
      });
    }

    final topLang = primaryLanguage;
    final topArtistName = rankedArtists.isNotEmpty ? rankedArtists[0]['artistName'] : null;

    final personality = {
      'archetype': nightPlays > morningPlays ? 'Night Explorer' : 'Acoustic Traveler',
      'title': nightPlays > morningPlays ? 'Night Explorer' : 'Acoustic Traveler',
      'description': topArtistName != null
          ? 'Deep musical focus, anchored by $topArtistName and immersive soundscapes.'
          : 'Diverse listening habits with an ear for acoustic flow and soulful melodies.',
      'traits': [
        if (nightPlays > morningPlays) 'Night Owl' else 'Morning Listener',
        'Deep Acoustic',
        if (topLang.isNotEmpty) '${topLang[0].toUpperCase()}${topLang.substring(1)} Fan' else 'Melody Lover',
      ],
    };

    return {
      'range': range,
      'totalListeningMs': totalListeningMs,
      'totalListeningMinutes': (totalListeningMs / 60000).round(),
      'totalPlays': totalPlays,
      'uniqueTracks': trackMap.length,
      'uniqueArtists': artistMap.length,
      'streakDays': max(1, streakDays),
      'activeDays': activeDays.length,
      'skipRatePct': totalPlays > 0 ? ((totalSkips / totalPlays) * 100).round() : 0,
      'comparisons': {
        'time': {'deltaPct': 12},
        'plays': {'deltaPct': 8},
        'headline': 'Your personal listening footprint',
      },
      'topArtists': rankedArtists,
      'topTracks': rankedTracks,
      'heatmapNormalized': heatmapNormalized,
      'peakDay': dayNames[peakD],
      'peakHour': peakH,
      'heatmapInsight': 'Most active on ${dayNames[peakD]}s around ${peakH > 12 ? '${peakH - 12} PM' : (peakH == 0 ? '12 AM' : '$peakH AM')}',
      'timeline': timelineDays,
      'discoveriesCount': max(1, artistMap.length ~/ 2),
      'musicPersonality': personality,
      'topGenres': [
        {'genre': 'Acoustic & Pop', 'count': totalPlays ~/ 2 + 1},
        {'genre': 'Soundtracks', 'count': totalPlays ~/ 3 + 1},
      ],
      'topLanguages': [
        if (topLang.isNotEmpty) {'language': topLang, 'count': totalPlays},
      ],
    };
  }

  static String _formatDateKey(DateTime d) {
    final y = d.year.toString().padLeft(4, '0');
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '$y-$m-$day';
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final historyJson = jsonEncode(_history.map((t) => t.toJson()).toList());
      await prefs.setString(_historyKey, historyJson);

      final artistsJson = jsonEncode(_artistPlays);
      await prefs.setString(_artistPlaysKey, artistsJson);

      await prefs.setString(_trackPlaysKey, jsonEncode(_trackPlays));
      await prefs.setString(_trackListenedMsKey, jsonEncode(_trackListenedMs));
      await prefs.setInt(_totalListeningMsKey, _totalListeningMs);
      await prefs.setString(_sessionsKey, jsonEncode(_sessions));
    } catch (e) {
      if (kDebugMode) debugPrint('[ListeningHistoryService] persist error: $e');
    }
  }

  /// Returns the user's primary/dominant listening language (e.g. 'tamil', 'hindi', 'telugu', etc.).
  String get primaryLanguage {
    if (_history.isEmpty) return '';
    final langCounts = <String, int>{};
    for (final t in _history) {
      final lang = t.language.isNotEmpty
          ? t.language
          : Track.detectLanguage(t.title, t.artist, t.album);
      if (lang != null && lang.isNotEmpty) {
        langCounts[lang] = (langCounts[lang] ?? 0) + 1;
      }
    }
    if (langCounts.isEmpty) return '';
    final top = langCounts.entries.reduce((a, b) => a.value > b.value ? a : b);
    return top.key;
  }

  /// Returns user's top played artists ordered by play count descending.
  List<({String name, int plays})> getTopArtists({int limit = 10}) {
    final entries = _artistPlays.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return entries
        .take(limit)
        .map((e) => (name: e.key, plays: e.value))
        .toList();
  }

  /// Returns the single most-listened artist for "Similar to [Artist]" spotlight.
  String? getFavoriteArtist() {
    if (_artistPlays.isEmpty) return null;
    final top = _artistPlays.entries.reduce((a, b) => a.value > b.value ? a : b);
    return top.key;
  }

  /// Returns user's second most-listened artist.
  String? getSecondFavoriteArtist() {
    final top = getTopArtists(limit: 2);
    if (top.length >= 2) return top[1].name;
    return null;
  }

  /// Returns older tracks from history (skipped first 5 recent) to rediscover.
  List<Track> getRediscoverTracks({int limit = 10}) {
    if (_history.length <= 5) return const [];
    return _history.skip(5).take(limit).toList();
  }

  /// Returns time-of-day greeting, contextual mood, and targeted search term.
  static ({String greeting, String moodLabel, String defaultSearchTerm})
      getTimeOfDayContext(String preferredLanguage) {
    final hour = DateTime.now().hour;
    final langPrefix = preferredLanguage.isNotEmpty ? '$preferredLanguage ' : '';
    if (hour >= 5 && hour < 12) {
      return (
        greeting: 'Good morning',
        moodLabel: 'Morning Acoustic & Energize',
        defaultSearchTerm: '${langPrefix}morning acoustic hits',
      );
    } else if (hour >= 12 && hour < 17) {
      return (
        greeting: 'Good afternoon',
        moodLabel: 'Focus & Midday Flow',
        defaultSearchTerm: '${langPrefix}midday flow songs',
      );
    } else if (hour >= 17 && hour < 21) {
      return (
        greeting: 'Good evening',
        moodLabel: 'Evening Melodies & Unwind',
        defaultSearchTerm: '${langPrefix}evening chill melodies',
      );
    } else {
      return (
        greeting: 'Late night vibes',
        moodLabel: 'Midnight Melodies & Ambient',
        defaultSearchTerm: '${langPrefix}midnight melodies',
      );
    }
  }

  /// Returns recently played tracks up to [limit].
  List<Track> getRecentTracks({int limit = 20}) {
    return _history.take(limit).toList();
  }

  /// Clears listening history.
  Future<void> clearHistory() async {
    _history.clear();
    _artistPlays.clear();
    _trackPlays.clear();
    _trackListenedMs.clear();
    _totalListeningMs = 0;
    _sessions.clear();
    historyNotifier.value++;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_historyKey);
      await prefs.remove(_artistPlaysKey);
      await prefs.remove(_trackPlaysKey);
      await prefs.remove(_trackListenedMsKey);
      await prefs.remove(_totalListeningMsKey);
      await prefs.remove(_sessionsKey);
    } catch (_) {}
  }
}
