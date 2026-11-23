import '../../../../models/playback_context.dart';
import '../../../../models/track.dart';
import '../../../../services/player_state.dart';
import '../../../../services/queue_state.dart';
import '../replay_aggregate.dart';

/// Service for F22: "Play Your Replay Mix".
/// Converts top songs from a [ReplayAggregate] into playable [Track] objects,
/// sets up the playback queue, and triggers playback.
class ReplayMixService {
  const ReplayMixService();

  /// Converts top songs from [snapshot] into a list of [Track] objects.
  /// Limits to [limit] (default: 25, or 50 for yearly snapshots).
  static List<Track> buildMixTracks(
    ReplayAggregate snapshot, {
    int? limit,
  }) {
    final maxCount = limit ?? (snapshot.period.isYear ? 50 : 25);
    final topSongs = snapshot.topSongs.take(maxCount).toList();

    return topSongs.map((s) {
      final durationSec = s.durationMs != null && s.durationMs! > 0
          ? (s.durationMs! ~/ 1000)
          : (s.listenedMs > 0 ? (s.listenedMs ~/ 1000) : 210);

      return Track(
        id: s.trackId,
        title: s.title,
        artist: s.artistRaw,
        album: s.albumTitle ?? '',
        coverUrl: s.coverUrl ?? '',
        durationSeconds: durationSec,
      );
    }).toList();
  }

  /// Builds a [PlaybackContext] for the replay mix.
  static PlaybackContext buildMixContext(
    ReplayAggregate snapshot, {
    int? limit,
  }) {
    final tracks = buildMixTracks(snapshot, limit: limit);
    return PlaybackContext(
      type: PlaybackContextType.queueOnly,
      id: 'replay_${snapshot.period.key}',
      title: '${snapshot.period.label} Replay Mix',
      tracks: tracks,
      startTrack: tracks.isNotEmpty ? tracks.first : Track.empty(),
    );
  }

  /// Sets the queue and starts playback of the replay mix.
  /// Returns the number of songs queued.
  static Future<int> playReplayMix({
    required ReplayAggregate snapshot,
    required QueueState queueState,
    required PlayerState playerState,
    int? limit,
    bool shuffle = false,
  }) async {
    final context = buildMixContext(snapshot, limit: limit);
    if (context.tracks.isEmpty) return 0;

    queueState.setContext(context, startIndex: 0, shuffle: shuffle);
    await playerState.playTrack(context.tracks.first);
    return context.tracks.length;
  }
}
