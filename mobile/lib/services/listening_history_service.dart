import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/track.dart';

/// Service that monitors user listening activity on device, maintains play history,
/// tracks frequently played artists & languages, and powers personalized recommendations.
class ListeningHistoryService {
  ListeningHistoryService._();
  static final ListeningHistoryService instance = ListeningHistoryService._();

  static const String _historyKey = 'zenify_listening_history_v1';
  static const String _artistPlaysKey = 'zenify_artist_play_counts_v1';

  final List<Track> _history = [];
  final Map<String, int> _artistPlays = {};

  final ValueNotifier<int> historyNotifier = ValueNotifier<int>(0);
  bool _initialized = false;

  bool get hasHistory => _history.isNotEmpty;

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
                if (!t.artist.contains("Instance of") && !t.artist.contains("ArtistRef") && t.artist != 'Unknown Artist') {
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
            if (v is int && !keyStr.contains("Instance of") && !keyStr.contains("ArtistRef")) {
              _artistPlays[keyStr] = v;
            }
          });
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

    historyNotifier.value++;

    // 3. Persist asynchronously
    _persist();
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final historyJson = jsonEncode(_history.map((t) => t.toJson()).toList());
      await prefs.setString(_historyKey, historyJson);

      final artistsJson = jsonEncode(_artistPlays);
      await prefs.setString(_artistPlaysKey, artistsJson);
    } catch (e) {
      if (kDebugMode) debugPrint('[ListeningHistoryService] persist error: $e');
    }
  }

  /// Returns the user's primary/dominant listening language (e.g. 'tamil', 'hindi', 'telugu', etc.).
  String get primaryLanguage {
    if (_history.isEmpty) return '';
    final langCounts = <String, int>{};
    for (final t in _history) {
      final lang = t.language.isNotEmpty ? t.language : Track.detectLanguage(t.title, t.artist, t.album);
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
  static ({String greeting, String moodLabel, String defaultSearchTerm}) getTimeOfDayContext(String preferredLanguage) {
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
    historyNotifier.value++;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_historyKey);
      await prefs.remove(_artistPlaysKey);
    } catch (_) {}
  }
}

