import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/listen_event.dart';

/// Represents a closed UTC interval for a user-marked "Private Listening Session".
class TimeRange {
  const TimeRange({required this.startUtc, required this.endUtc});

  final DateTime startUtc;
  final DateTime endUtc;

  bool contains(DateTime utc) =>
      !utc.isBefore(startUtc) && !utc.isAfter(endUtc);

  Map<String, dynamic> toJson() => {
        'startUtc': startUtc.toIso8601String(),
        'endUtc': endUtc.toIso8601String(),
      };

  factory TimeRange.fromJson(Map<String, dynamic> json) => TimeRange(
        startUtc: DateTime.tryParse(json['startUtc']?.toString() ?? '')?.toUtc() ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        endUtc: DateTime.tryParse(json['endUtc']?.toString() ?? '')?.toUtc() ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TimeRange &&
          runtimeType == other.runtimeType &&
          startUtc == other.startUtc &&
          endUtc == other.endUtc;

  @override
  int get hashCode => Object.hash(startUtc, endUtc);
}

/// Stores user exclusions (tracks, playlists, and private listening sessions).
///
/// **Exclusion is strictly applied at read time**:
/// Nothing is ever deleted from history; exclusions can be toggled on or off
/// reversibly at any time.
class ExclusionStore extends ChangeNotifier {
  ExclusionStore({SharedPreferences? prefs}) {
    _prefs = prefs;
  }

  static const String _storageKey = 'zenify_replay_exclusions_v1';
  static ExclusionStore? _instance;

  static ExclusionStore get instance => _instance ??= ExclusionStore();

  SharedPreferences? _prefs;
  bool _initialized = false;

  final Set<String> _trackIds = {};
  final Set<String> _playlistIds = {};
  final List<TimeRange> _sessionRanges = [];

  int _version = 0;

  /// Monotonically increasing version counter used to invalidate aggregation caches.
  int get version => _version;

  Set<String> get trackIds => Set.unmodifiable(_trackIds);
  Set<String> get playlistIds => Set.unmodifiable(_playlistIds);
  List<TimeRange> get sessionRanges => List.unmodifiable(_sessionRanges);

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    try {
      _prefs ??= await SharedPreferences.getInstance();
      final raw = _prefs?.getString(_storageKey);
      if (raw != null && raw.isNotEmpty) {
        final map = jsonDecode(raw) as Map<String, dynamic>?;
        if (map != null) {
          _trackIds.clear();
          if (map['trackIds'] is List) {
            _trackIds.addAll((map['trackIds'] as List).map((e) => e.toString()));
          }

          _playlistIds.clear();
          if (map['playlistIds'] is List) {
            _playlistIds.addAll((map['playlistIds'] as List).map((e) => e.toString()));
          }

          _sessionRanges.clear();
          if (map['sessionRanges'] is List) {
            for (final r in map['sessionRanges'] as List) {
              if (r is Map) {
                _sessionRanges.add(TimeRange.fromJson(Map<String, dynamic>.from(r)));
              }
            }
          }
        }
      }
    } catch (e) {
      debugPrint('[ExclusionStore] Error initializing: $e');
    }
  }

  bool isTrackExcluded(String trackId) => _trackIds.contains(trackId);
  bool isPlaylistExcluded(String playlistId) => _playlistIds.contains(playlistId);

  /// True if the event is excluded by track ID, playlist context, or private session range.
  bool isExcluded(ListenEvent e) {
    // 1. Excluded track
    if (_trackIds.contains(e.trackId)) return true;

    // 2. Excluded playlist
    if (e.contextType == ContextType.playlist &&
        e.contextId != null &&
        _playlistIds.contains(e.contextId)) {
      return true;
    }

    // 3. Private listening session time range
    for (final r in _sessionRanges) {
      if (r.contains(e.startedAtUtc)) return true;
    }

    return false;
  }

  Future<void> excludeTrack(String trackId) async {
    if (_trackIds.add(trackId)) {
      _bump();
      await _persist();
    }
  }

  Future<void> unexcludeTrack(String trackId) async {
    if (_trackIds.remove(trackId)) {
      _bump();
      await _persist();
    }
  }

  Future<void> toggleTrackExclusion(String trackId) async {
    if (_trackIds.contains(trackId)) {
      await unexcludeTrack(trackId);
    } else {
      await excludeTrack(trackId);
    }
  }

  Future<void> excludePlaylist(String playlistId) async {
    if (_playlistIds.add(playlistId)) {
      _bump();
      await _persist();
    }
  }

  Future<void> unexcludePlaylist(String playlistId) async {
    if (_playlistIds.remove(playlistId)) {
      _bump();
      await _persist();
    }
  }

  Future<void> togglePlaylistExclusion(String playlistId) async {
    if (_playlistIds.contains(playlistId)) {
      await unexcludePlaylist(playlistId);
    } else {
      await excludePlaylist(playlistId);
    }
  }

  Future<void> addPrivateSessionRange(DateTime startUtc, DateTime endUtc) async {
    _sessionRanges.add(TimeRange(startUtc: startUtc.toUtc(), endUtc: endUtc.toUtc()));
    _bump();
    await _persist();
  }

  Future<void> addPrivateSession(TimeRange range) async {
    _sessionRanges.add(range);
    _bump();
    await _persist();
  }

  Future<void> clearAll() async {
    _trackIds.clear();
    _playlistIds.clear();
    _sessionRanges.clear();
    _bump();
    await _persist();
  }

  void _bump() {
    _version++;
    notifyListeners();
  }

  Future<void> _persist() async {
    try {
      final map = {
        'trackIds': _trackIds.toList(),
        'playlistIds': _playlistIds.toList(),
        'sessionRanges': _sessionRanges.map((r) => r.toJson()).toList(),
      };
      await _prefs?.setString(_storageKey, jsonEncode(map));
    } catch (e) {
      debugPrint('[ExclusionStore] Error saving: $e');
    }
  }
}
