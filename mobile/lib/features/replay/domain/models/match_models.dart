import 'package:flutter/foundation.dart';

/// Lightweight shareable snapshot containing only the aggregate metrics
/// needed for music compatibility matching.
@immutable
class MatchSnapshot {
  final String userId;
  final String displayName;
  final String periodKey;
  final int totalMinutes;
  final int uniqueSongsCount;
  final int uniqueArtistsCount;
  final double discoveryPct;
  final Map<String, double> topArtists; // normalized artist name -> weight (sum = 1.0)
  final Set<String> topTracks; // trackIds
  final Map<String, double>? languageDistribution;
  final Map<String, double>? genreDistribution;
  final Map<String, double> daypartDistribution;
  final String? topGenre;
  final String? topLanguage;

  const MatchSnapshot({
    required this.userId,
    required this.displayName,
    required this.periodKey,
    required this.totalMinutes,
    required this.uniqueSongsCount,
    required this.uniqueArtistsCount,
    required this.discoveryPct,
    required this.topArtists,
    required this.topTracks,
    this.languageDistribution,
    this.genreDistribution,
    required this.daypartDistribution,
    this.topGenre,
    this.topLanguage,
  });

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'displayName': displayName,
        'periodKey': periodKey,
        'totalMinutes': totalMinutes,
        'uniqueSongsCount': uniqueSongsCount,
        'uniqueArtistsCount': uniqueArtistsCount,
        'discoveryPct': discoveryPct,
        'topArtists': topArtists,
        'topTracks': topTracks.toList(),
        if (languageDistribution != null) 'languageDistribution': languageDistribution,
        if (genreDistribution != null) 'genreDistribution': genreDistribution,
        'daypartDistribution': daypartDistribution,
        if (topGenre != null) 'topGenre': topGenre,
        if (topLanguage != null) 'topLanguage': topLanguage,
      };

  factory MatchSnapshot.fromJson(Map<String, dynamic> json) => MatchSnapshot(
        userId: json['userId']?.toString() ?? 'anon',
        displayName: json['displayName']?.toString() ?? 'Friend',
        periodKey: json['periodKey']?.toString() ?? '',
        totalMinutes: (json['totalMinutes'] as num?)?.toInt() ?? 0,
        uniqueSongsCount: (json['uniqueSongsCount'] as num?)?.toInt() ?? 0,
        uniqueArtistsCount: (json['uniqueArtistsCount'] as num?)?.toInt() ?? 0,
        discoveryPct: (json['discoveryPct'] as num?)?.toDouble() ?? 0.0,
        topArtists: (json['topArtists'] is Map)
            ? (json['topArtists'] as Map).map(
                (k, v) => MapEntry(k.toString(), (v as num).toDouble()),
              )
            : const {},
        topTracks: (json['topTracks'] is List)
            ? (json['topTracks'] as List).map((e) => e.toString()).toSet()
            : const {},
        languageDistribution: (json['languageDistribution'] is Map)
            ? (json['languageDistribution'] as Map).map(
                (k, v) => MapEntry(k.toString(), (v as num).toDouble()),
              )
            : null,
        genreDistribution: (json['genreDistribution'] is Map)
            ? (json['genreDistribution'] as Map).map(
                (k, v) => MapEntry(k.toString(), (v as num).toDouble()),
              )
            : null,
        daypartDistribution: (json['daypartDistribution'] is Map)
            ? (json['daypartDistribution'] as Map).map(
                (k, v) => MapEntry(k.toString(), (v as num).toDouble()),
              )
            : const {},
        topGenre: json['topGenre']?.toString(),
        topLanguage: json['topLanguage']?.toString(),
      );
}

/// The result of comparing two users' [MatchSnapshot]s.
@immutable
class MatchResult {
  final int compatibilityScore; // 0 - 100%
  final double artistOverlap;
  final double trackOverlap;
  final double daypartOverlap;
  final double? languageOverlap;
  final double? genreOverlap;
  final double battleScoreMe;
  final double battleScoreFriend;
  final String winner; // 'me', 'friend', or 'draw'
  final List<String> sharedArtists;
  final List<String> sharedTracks;

  const MatchResult({
    required this.compatibilityScore,
    required this.artistOverlap,
    required this.trackOverlap,
    required this.daypartOverlap,
    this.languageOverlap,
    this.genreOverlap,
    required this.battleScoreMe,
    required this.battleScoreFriend,
    required this.winner,
    this.sharedArtists = const [],
    this.sharedTracks = const [],
  });

  bool get iWon => winner == 'me';
  bool get friendWon => winner == 'friend';
  bool get isDraw => winner == 'draw';
}

/// Weighted Jaccard similarity: sum(min(a, b)) / sum(max(a, b)).
double weightedJaccard(Map<String, double> a, Map<String, double> b) {
  final allKeys = {...a.keys, ...b.keys};
  double sumMin = 0.0;
  double sumMax = 0.0;

  for (final k in allKeys) {
    final valA = a[k] ?? 0.0;
    final valB = b[k] ?? 0.0;
    sumMin += valA < valB ? valA : valB;
    sumMax += valA > valB ? valA : valB;
  }

  return sumMax > 0 ? (sumMin / sumMax) : 0.0;
}

/// Set Jaccard similarity: |a ∩ b| / |a ∪ b|.
double jaccard(Set<String> a, Set<String> b) {
  if (a.isEmpty && b.isEmpty) return 0.0;
  final intersection = a.intersection(b).length;
  final union = a.union(b).length;
  return union > 0 ? (intersection / union) : 0.0;
}

/// Distribution overlap: 1 - 0.5 * sum(|a_i - b_i|).
double distOverlap(Map<String, double> a, Map<String, double> b) {
  final allKeys = {...a.keys, ...b.keys};
  double diffSum = 0.0;

  for (final k in allKeys) {
    final valA = a[k] ?? 0.0;
    final valB = b[k] ?? 0.0;
    diffSum += (valA - valB).abs();
  }

  final overlap = 1.0 - 0.5 * diffSum;
  return overlap.clamp(0.0, 1.0);
}

/// Computes a [MatchResult] matching the server algorithm.
MatchResult computeMatch(MatchSnapshot me, MatchSnapshot friend) {
  final artistOver = weightedJaccard(me.topArtists, friend.topArtists);
  final trackOver = jaccard(me.topTracks, friend.topTracks);
  final daypartOver = distOverlap(me.daypartDistribution, friend.daypartDistribution);

  double weightSum = 0.35 + 0.25 + 0.10;
  double scoreAcc = 0.35 * artistOver + 0.25 * trackOver + 0.10 * daypartOver;

  double? langOver;
  if (me.languageDistribution != null && friend.languageDistribution != null) {
    langOver = distOverlap(me.languageDistribution!, friend.languageDistribution!);
    scoreAcc += 0.15 * langOver;
    weightSum += 0.15;
  }

  double? genOver;
  if (me.genreDistribution != null && friend.genreDistribution != null) {
    genOver = distOverlap(me.genreDistribution!, friend.genreDistribution!);
    scoreAcc += 0.15 * genOver;
    weightSum += 0.15;
  }

  final compatibility = ((scoreAcc / weightSum) * 100).round().clamp(0, 100);

  // Battle score calculation:
  // battleScore(me) = 0.5*h + 0.3*d + 0.2*u
  final hoursMe = me.totalMinutes / 60.0;
  final hoursFriend = friend.totalMinutes / 60.0;
  final h = (hoursMe + hoursFriend) > 0 ? hoursMe / (hoursMe + hoursFriend) : 0.5;

  final dMe = me.discoveryPct;
  final dFriend = friend.discoveryPct;
  final d = (dMe + dFriend) > 0 ? dMe / (dMe + dFriend) : 0.5;

  final uMe = me.uniqueArtistsCount;
  final uFriend = friend.uniqueArtistsCount;
  final u = (uMe + uFriend) > 0 ? uMe / (uMe + uFriend) : 0.5;

  final battleScoreMe = 0.5 * h + 0.3 * d + 0.2 * u;
  final battleScoreFriend = 1.0 - battleScoreMe;

  String winner = 'draw';
  if (battleScoreMe > 0.505) {
    winner = 'me';
  } else if (battleScoreFriend > 0.505) {
    winner = 'friend';
  }

  final sharedArtists = me.topArtists.keys
      .where((a) => friend.topArtists.containsKey(a))
      .take(5)
      .toList();

  final sharedTracks = me.topTracks
      .where((t) => friend.topTracks.contains(t))
      .take(5)
      .toList();

  return MatchResult(
    compatibilityScore: compatibility,
    artistOverlap: artistOver,
    trackOverlap: trackOver,
    daypartOverlap: daypartOver,
    languageOverlap: langOver,
    genreOverlap: genOver,
    battleScoreMe: battleScoreMe,
    battleScoreFriend: battleScoreFriend,
    winner: winner,
    sharedArtists: sharedArtists,
    sharedTracks: sharedTracks,
  );
}
