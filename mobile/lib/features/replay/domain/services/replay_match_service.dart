import '../models/match_models.dart';
import '../replay_aggregate.dart';

/// Service for F17: Replay Match & Musical Battle.
class ReplayMatchService {
  const ReplayMatchService();

  /// Converts a local [ReplayAggregate] into a [MatchSnapshot].
  static MatchSnapshot buildSnapshot(
    ReplayAggregate aggregate, {
    String userId = 'me',
    String displayName = 'You',
  }) {
    // 1. Artist weights (normalized to sum to 1.0)
    final artistMap = <String, double>{};
    final totalArtistPlays = aggregate.topArtists.fold<int>(
      0,
      (sum, a) => sum + a.qualifiedPlays,
    );

    for (final artist in aggregate.topArtists.take(50)) {
      final weight = totalArtistPlays > 0
          ? (artist.qualifiedPlays / totalArtistPlays)
          : (1.0 / aggregate.topArtists.length);
      artistMap[artist.artistName.toLowerCase().trim()] = weight;
    }

    // 2. Track IDs
    final trackSet = aggregate.topSongs.take(50).map((s) => s.trackId).toSet();

    // 3. Daypart distribution (normalized)
    final daypart = aggregate.daypart;
    final totalDaypartMs = daypart.morningMs +
        daypart.afternoonMs +
        daypart.eveningMs +
        daypart.nightMs;

    final daypartDist = <String, double>{
      'morning': totalDaypartMs > 0 ? (daypart.morningMs / totalDaypartMs) : 0.25,
      'afternoon': totalDaypartMs > 0 ? (daypart.afternoonMs / totalDaypartMs) : 0.25,
      'evening': totalDaypartMs > 0 ? (daypart.eveningMs / totalDaypartMs) : 0.25,
      'night': totalDaypartMs > 0 ? (daypart.nightMs / totalDaypartMs) : 0.25,
    };

    // 4. Discovery percent
    final discoveryPct = aggregate.discovery.newRatio * 100.0;

    return MatchSnapshot(
      userId: userId,
      displayName: displayName,
      periodKey: aggregate.period.key,
      totalMinutes: aggregate.totalMinutes,
      uniqueSongsCount: aggregate.topSongs.length,
      uniqueArtistsCount: aggregate.topArtists.length,
      discoveryPct: discoveryPct,
      topArtists: artistMap,
      topTracks: trackSet,
      daypartDistribution: daypartDist,
      topLanguage: aggregate.geography.isNotEmpty ? aggregate.geography.first.countryName : 'Tamil',
      topGenre: aggregate.topMovie?.movieName,
    );
  }

  /// Calculates the compatibility result between two snapshots locally.
  static MatchResult match(MatchSnapshot me, MatchSnapshot friend) {
    return computeMatch(me, friend);
  }
}
