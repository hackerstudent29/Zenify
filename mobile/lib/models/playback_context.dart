// lib/models/playback_context.dart
//
// Immutable snapshot of where playback originated (album, artist, playlist, etc.)
// used by context-aware Shuffle and Repeat All.

import 'track.dart';

enum PlaybackContextType {
  search,
  homeSection,
  artist,
  album,
  playlist,
  podcast,
  likedSongs,
  library,
  history,
  queueOnly,
}

enum RepeatMode {
  off,
  all,
  one,
}

enum AdvanceReason {
  userNext,
  trackCompleted,
}

/// Constant controlling Repeat One behavior:
/// 0 (or -1) = infinite Apple Music style (keeps looping until switched off).
/// 1 = repeat exactly once and then fall back to Repeat All.
// ignore: constant_identifier_names
const int REPEAT_ONE_LOOPS = 0;

class PlaybackContext {
  const PlaybackContext({
    required this.type,
    required this.id,
    required this.tracks,
    required this.startTrack,
    this.title,
  });

  final PlaybackContextType type;
  final String id;
  final List<Track> tracks;
  final Track startTrack;
  final String? title;

  Map<String, dynamic> toJson() => {
        'type': type.name,
        'id': id,
        'tracks': tracks.map((t) => t.toJson()).toList(),
        'startTrack': startTrack.toJson(),
        if (title != null) 'title': title,
      };

  factory PlaybackContext.fromJson(Map<String, dynamic> json) {
    final typeName = json['type'] as String? ?? 'queueOnly';
    final type = PlaybackContextType.values.firstWhere(
      (e) => e.name == typeName,
      orElse: () => PlaybackContextType.queueOnly,
    );

    final rawTracks = json['tracks'] as List<dynamic>? ?? [];
    final tracks = rawTracks
        .whereType<Map<String, dynamic>>()
        .map(Track.fromJson)
        .toList();

    final startRaw = json['startTrack'] as Map<String, dynamic>?;
    final startTrack = startRaw != null
        ? Track.fromJson(startRaw)
        : (tracks.isNotEmpty ? tracks.first : Track.empty());

    return PlaybackContext(
      type: type,
      id: json['id'] as String? ?? '',
      tracks: tracks,
      startTrack: startTrack,
      title: json['title'] as String?,
    );
  }

  PlaybackContext copyWith({
    PlaybackContextType? type,
    String? id,
    List<Track>? tracks,
    Track? startTrack,
    String? title,
  }) {
    return PlaybackContext(
      type: type ?? this.type,
      id: id ?? this.id,
      tracks: tracks ?? this.tracks,
      startTrack: startTrack ?? this.startTrack,
      title: title ?? this.title,
    );
  }
}

