import 'dart:async';
import '../../../utils/media_normalizer.dart';
import 'listen_event.dart';

/// Represents the exact song and timestamp of an unlocked lifetime milestone.
class MilestoneMark {
  const MilestoneMark({
    required this.n,
    required this.trackId,
    required this.trackTitle,
    required this.artistRaw,
    required this.utc,
    required this.tzOffsetMin,
  });

  /// The milestone target threshold reached (e.g. 1st, 10th, 100th, 1000th).
  final int n;

  /// Song ID at the moment the milestone was reached.
  final String trackId;

  /// Song title.
  final String trackTitle;

  /// Raw artist string.
  final String artistRaw;

  /// Exact moment the threshold was reached (UTC).
  final DateTime utc;

  /// Device UTC offset at the moment the milestone occurred.
  final int tzOffsetMin;

  /// Wall-clock local time for display in user's timezone.
  DateTime get localWall => utc.add(Duration(minutes: tzOffsetMin));

  Map<String, dynamic> toJson() => {
        'n': n,
        'trackId': trackId,
        'trackTitle': trackTitle,
        'artistRaw': artistRaw,
        'utc': utc.toIso8601String(),
        'tzOffsetMin': tzOffsetMin,
      };

  factory MilestoneMark.fromJson(Map<String, dynamic> json) => MilestoneMark(
        n: (json['n'] as num?)?.toInt() ?? 0,
        trackId: json['trackId']?.toString() ?? '',
        trackTitle: json['trackTitle']?.toString() ?? '',
        artistRaw: json['artistRaw']?.toString() ?? '',
        utc: DateTime.tryParse(json['utc']?.toString() ?? '')?.toUtc() ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        tzOffsetMin: (json['tzOffsetMin'] as num?)?.toInt() ?? 0,
      );
}

/// Lifetime index of listening activity.
///
/// Preserves lifetime facts (first plays, milestones, lifetime totals) across
/// period boundaries and journal rotations. Can be completely reconstructed
/// from the raw event stream.
class AllTimeIndex {
  AllTimeIndex({
    Map<String, DateTime>? firstQualifiedPlayByTrack,
    Map<String, DateTime>? firstQualifiedPlayByArtist,
    this.totalQualifiedPlays = 0,
    this.totalListenedMs = 0,
    List<MilestoneMark>? uniqueSongMarks,
    List<MilestoneMark>? totalPlayMarks,
    Set<String>? processedEventIds,
    this.trackingStartUtc,
    this.schemaVersion = 1,
  })  : firstQualifiedPlayByTrack = firstQualifiedPlayByTrack ?? {},
        firstQualifiedPlayByArtist = firstQualifiedPlayByArtist ?? {},
        uniqueSongMarks = uniqueSongMarks ?? [],
        totalPlayMarks = totalPlayMarks ?? [],
        processedEventIds = processedEventIds ?? {};

  /// First qualified play timestamp per track ID.
  final Map<String, DateTime> firstQualifiedPlayByTrack;

  /// First qualified play timestamp per normalized artist name.
  final Map<String, DateTime> firstQualifiedPlayByArtist;

  /// Lifetime count of qualified plays only.
  int totalQualifiedPlays;

  /// Lifetime active listening time in milliseconds across all events.
  int totalListenedMs;

  /// Milestone marks for Tab A (distinct songs): 1, 10, 50, 100, 500, 1000, 5000, 10000.
  final List<MilestoneMark> uniqueSongMarks;

  /// Milestone marks for Tab B (total plays): 1, 100, 1000, 5000, 10000.
  final List<MilestoneMark> totalPlayMarks;

  /// Set of event IDs already applied (guarantees O(1) idempotency).
  final Set<String> processedEventIds;

  /// The earliest event timestamp seen (marking when tracking began).
  DateTime? trackingStartUtc;

  /// Schema version.
  final int schemaVersion;

  static const List<int> kUniqueMilestones = [1, 10, 50, 100, 500, 1000, 5000, 10000];
  static const List<int> kTotalMilestones = [1, 100, 1000, 5000, 10000];

  /// Incrementally applies an event. Returns true if the event was newly applied,
  /// or false if it was already processed.
  bool apply(ListenEvent e) {
    if (processedEventIds.contains(e.id)) return false;
    processedEventIds.add(e.id);

    // Update tracking start
    if (trackingStartUtc == null || e.startedAtUtc.isBefore(trackingStartUtc!)) {
      trackingStartUtc = e.startedAtUtc;
    }

    // Listened time accumulates over ALL events (even short ones)
    totalListenedMs += e.listenedMs;

    if (!e.isQualifiedPlay) return true;

    totalQualifiedPlays++;

    // Check Tab B total play milestone targets
    if (kTotalMilestones.contains(totalQualifiedPlays)) {
      if (!totalPlayMarks.any((m) => m.n == totalQualifiedPlays)) {
        totalPlayMarks.add(
          MilestoneMark(
            n: totalQualifiedPlays,
            trackId: e.trackId,
            trackTitle: e.title,
            artistRaw: e.artistRaw,
            utc: e.startedAtUtc,
            tzOffsetMin: e.tzOffsetMin,
          ),
        );
      }
    }

    // Check track first play & Tab A unique song milestone targets
    if (!firstQualifiedPlayByTrack.containsKey(e.trackId)) {
      firstQualifiedPlayByTrack[e.trackId] = e.startedAtUtc;
      final uniqueCount = firstQualifiedPlayByTrack.length;

      if (kUniqueMilestones.contains(uniqueCount)) {
        if (!uniqueSongMarks.any((m) => m.n == uniqueCount)) {
          uniqueSongMarks.add(
            MilestoneMark(
              n: uniqueCount,
              trackId: e.trackId,
              trackTitle: e.title,
              artistRaw: e.artistRaw,
              utc: e.startedAtUtc,
              tzOffsetMin: e.tzOffsetMin,
            ),
          );
        }
      }
    }

    // Check artist first play (splits composite artist string into individual names)
    final individualArtists = MediaNormalizer.splitArtistNames(e.artistRaw);
    for (final rawName in individualArtists) {
      final clean = rawName.trim().toLowerCase();
      if (clean.isEmpty) continue;
      if (!firstQualifiedPlayByArtist.containsKey(clean)) {
        firstQualifiedPlayByArtist[clean] = e.startedAtUtc;
      }
    }

    return true;
  }

  /// Reconstructs a clean AllTimeIndex from a chronological stream of events.
  static Future<AllTimeIndex> rebuildFrom(Stream<ListenEvent> events) async {
    final index = AllTimeIndex();
    await for (final e in events) {
      index.apply(e);
    }
    return index;
  }

  Map<String, dynamic> toJson() => {
        'totalQualifiedPlays': totalQualifiedPlays,
        'totalListenedMs': totalListenedMs,
        'trackingStartUtc': trackingStartUtc?.toIso8601String(),
        'firstQualifiedPlayByTrack': firstQualifiedPlayByTrack.map(
          (k, v) => MapEntry(k, v.toIso8601String()),
        ),
        'firstQualifiedPlayByArtist': firstQualifiedPlayByArtist.map(
          (k, v) => MapEntry(k, v.toIso8601String()),
        ),
        'uniqueSongMarks': uniqueSongMarks.map((m) => m.toJson()).toList(),
        'totalPlayMarks': totalPlayMarks.map((m) => m.toJson()).toList(),
        'processedEventIds': processedEventIds.toList(),
        'schemaVersion': schemaVersion,
      };

  factory AllTimeIndex.fromJson(Map<String, dynamic> json) {
    final trackMap = <String, DateTime>{};
    if (json['firstQualifiedPlayByTrack'] is Map) {
      (json['firstQualifiedPlayByTrack'] as Map).forEach((k, v) {
        final dt = DateTime.tryParse(v.toString())?.toUtc();
        if (dt != null) trackMap[k.toString()] = dt;
      });
    }

    final artistMap = <String, DateTime>{};
    if (json['firstQualifiedPlayByArtist'] is Map) {
      (json['firstQualifiedPlayByArtist'] as Map).forEach((k, v) {
        final dt = DateTime.tryParse(v.toString())?.toUtc();
        if (dt != null) artistMap[k.toString()] = dt;
      });
    }

    final uniqueMarks = <MilestoneMark>[];
    if (json['uniqueSongMarks'] is List) {
      for (final item in json['uniqueSongMarks'] as List) {
        if (item is Map) {
          uniqueMarks.add(MilestoneMark.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }

    final totalMarks = <MilestoneMark>[];
    if (json['totalPlayMarks'] is List) {
      for (final item in json['totalPlayMarks'] as List) {
        if (item is Map) {
          totalMarks.add(MilestoneMark.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }

    final ids = <String>{};
    if (json['processedEventIds'] is List) {
      ids.addAll((json['processedEventIds'] as List).map((e) => e.toString()));
    }

    final startStr = json['trackingStartUtc']?.toString();
    final trackingStart = startStr != null ? DateTime.tryParse(startStr)?.toUtc() : null;

    return AllTimeIndex(
      firstQualifiedPlayByTrack: trackMap,
      firstQualifiedPlayByArtist: artistMap,
      totalQualifiedPlays: (json['totalQualifiedPlays'] as num?)?.toInt() ?? 0,
      totalListenedMs: (json['totalListenedMs'] as num?)?.toInt() ?? 0,
      uniqueSongMarks: uniqueMarks,
      totalPlayMarks: totalMarks,
      processedEventIds: ids,
      trackingStartUtc: trackingStart,
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
    );
  }
}
