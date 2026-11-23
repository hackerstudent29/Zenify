import 'dart:math';

/// Playback media source for a listen event.
enum PlaySource { stream, offline, cache }

/// Context from which playback originated.
enum ContextType { none, playlist, album, artist, search, radio, queue }

/// ============================================================================
/// REPLAY DEFINITIONS (Canonical Definitions - Never Redefine Elsewhere)
/// ============================================================================
/// Qualified play : listenedMs >= min(30,000 ms, 50% of durationMs)
/// Play count     : number of QUALIFIED plays only
/// Listened time  : sum of listenedMs over ALL eligible events (even short ones)
/// Skip           : userAdvanced && listenedMs < min(30,000 ms, 50% of durationMs)
/// Completed      : endedNaturally || listenedMs >= 90% of durationMs
/// Eligible event : not excluded (ExclusionStore) and inside the selected period
/// Local time     : startedAtUtc + tzOffsetMin (all day/hour/weekday buckets use this)
/// ============================================================================
class ListenEvent {
  const ListenEvent({
    required this.id,
    required this.trackId,
    required this.title,
    required this.artistRaw,
    this.albumId,
    this.albumTitle,
    required this.startedAtUtc,
    required this.tzOffsetMin,
    this.endedAtUtc,
    required this.listenedMs,
    required this.durationMs,
    required this.userAdvanced,
    required this.endedNaturally,
    this.loopOne = false,
    this.source = PlaySource.stream,
    this.contextType = ContextType.none,
    this.contextId,
    this.schemaVersion = 2,
  });

  /// Unique event identifier for idempotency.
  final String id;

  /// Stable track ID (YouTube videoId or clean local ID).
  final String trackId;

  /// Song title as played.
  final String title;

  /// Raw artist string exactly as played, e.g. "Anirudh Ravichander, Jonita Gandhi".
  final String artistRaw;

  /// Optional album identifier.
  final String? albumId;

  /// Optional album title.
  final String? albumTitle;

  /// Play start timestamp in UTC.
  final DateTime startedAtUtc;

  /// Device UTC offset in minutes AT PLAY TIME (handles travel and DST transitions).
  final int tzOffsetMin;

  /// Wall-clock end timestamp in UTC (includes pauses).
  final DateTime? endedAtUtc;

  /// Active playback time in milliseconds (pauses strictly excluded).
  final int listenedMs;

  /// Full duration of the track in milliseconds.
  final int durationMs;

  /// Whether the user actively advanced (pressed next/prev/seek-out) before natural end.
  final bool userAdvanced;

  /// Whether the track reached its natural completion.
  final bool endedNaturally;

  /// Whether repeat-one mode was active during this play.
  final bool loopOne;

  /// Source of the audio (stream, offline download, or cache).
  final PlaySource source;

  /// Context type (playlist, album, artist, etc.).
  final ContextType contextType;

  /// ID of the context (e.g. playlist ID) when applicable.
  final String? contextId;

  /// Schema version of the event record (v2 is current).
  final int schemaVersion;

  // ---------------------------------------------------------------------------
  // Derived Canonical Getters (Pure Functions)
  // ---------------------------------------------------------------------------

  /// Qualified play threshold: listenedMs >= min(30,000 ms, 50% of durationMs).
  bool get isQualifiedPlay {
    final threshold = min(30000, (durationMs * 0.5).round());
    return listenedMs >= threshold;
  }

  /// Completion threshold: ended naturally or listened to at least 90% of duration.
  bool get isCompleted {
    if (endedNaturally) return true;
    if (durationMs <= 0) return false;
    return listenedMs >= (durationMs * 0.9).round();
  }

  /// Skip threshold: user actively advanced and listened less than qualified threshold.
  bool get isSkip {
    if (!userAdvanced) return false;
    final threshold = min(30000, (durationMs * 0.5).round());
    return listenedMs < threshold;
  }

  /// Local wall-clock time computed from UTC + tzOffsetMin.
  DateTime get localWall => startedAtUtc.add(Duration(minutes: tzOffsetMin));

  /// Local date key format: YYYY-MM-DD.
  String get localDayKey {
    final w = localWall;
    final y = w.year.toString().padLeft(4, '0');
    final m = w.month.toString().padLeft(2, '0');
    final d = w.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  // ---------------------------------------------------------------------------
  // Serialization & Migration (v1 -> v2)
  // ---------------------------------------------------------------------------

  Map<String, dynamic> toJson() => {
        'id': id,
        'trackId': trackId,
        'title': title,
        'artistRaw': artistRaw,
        if (albumId != null && albumId!.isNotEmpty) 'albumId': albumId,
        if (albumTitle != null && albumTitle!.isNotEmpty) 'albumTitle': albumTitle,
        'startedAtUtc': startedAtUtc.toIso8601String(),
        'tzOffsetMin': tzOffsetMin,
        if (endedAtUtc != null) 'endedAtUtc': endedAtUtc!.toIso8601String(),
        'listenedMs': listenedMs,
        'durationMs': durationMs,
        'userAdvanced': userAdvanced,
        'endedNaturally': endedNaturally,
        'loopOne': loopOne,
        'source': source.name,
        'contextType': contextType.name,
        if (contextId != null && contextId!.isNotEmpty) 'contextId': contextId,
        'schemaVersion': schemaVersion,
      };

  factory ListenEvent.fromJson(Map<String, dynamic> json) {
    // Determine event ID (supports legacy 'eventId' or standard 'id')
    final id = json['id']?.toString() ?? json['eventId']?.toString() ?? '';

    // Determine start time (handles legacy 'startedAt' ISO strings)
    final startStr = json['startedAtUtc']?.toString() ?? json['startedAt']?.toString() ?? '';
    final startedAt = DateTime.tryParse(startStr)?.toUtc() ?? DateTime.now().toUtc();

    // Determine end time
    final endStr = json['endedAtUtc']?.toString() ?? json['endedAt']?.toString();
    final endedAt = endStr != null ? DateTime.tryParse(endStr)?.toUtc() : null;

    // Timezone offset with fallback to device offset at startedAt
    final tzMin = (json['tzOffsetMin'] as num?)?.toInt() ?? startedAt.timeZoneOffset.inMinutes;

    // Durations
    final listened = (json['listenedMs'] as num?)?.toInt() ?? 0;
    final dur = (json['durationMs'] as num?)?.toInt() ??
        (json['trackDurationMs'] as num?)?.toInt() ??
        0;

    // End reason / advance flags (handles legacy 'endReason')
    final endReason = json['endReason']?.toString().toLowerCase();
    final userAdv = json['userAdvanced'] as bool? ??
        (endReason == 'skipped' || endReason == 'queue_replaced');
    final naturally = json['endedNaturally'] as bool? ?? (endReason == 'completed');

    // Artists: extract raw artist string
    String artistRaw = json['artistRaw']?.toString() ?? '';
    if (artistRaw.isEmpty) {
      if (json['artists'] is List && (json['artists'] as List).isNotEmpty) {
        final aList = json['artists'] as List;
        final names = aList
            .map((a) => a is Map ? (a['artistName']?.toString() ?? '') : a.toString())
            .where((s) => s.isNotEmpty)
            .toList();
        artistRaw = names.join(', ');
      } else if (json['artistName'] != null) {
        artistRaw = json['artistName'].toString();
      }
    }

    // Source
    PlaySource playSource = PlaySource.stream;
    final srcStr = json['source']?.toString().toLowerCase();
    if (srcStr == 'offline' || json['offline'] == true) {
      playSource = PlaySource.offline;
    } else if (srcStr == 'cache') {
      playSource = PlaySource.cache;
    }

    // Context Type
    ContextType cType = ContextType.none;
    final cStr = json['contextType']?.toString().toLowerCase();
    if (cStr != null && cStr.isNotEmpty) {
      cType = ContextType.values.firstWhere(
        (v) => v.name.toLowerCase() == cStr,
        orElse: () => ContextType.none,
      );
    }

    return ListenEvent(
      id: id,
      trackId: json['trackId']?.toString() ?? '',
      title: json['title']?.toString() ?? json['trackTitle']?.toString() ?? '',
      artistRaw: artistRaw,
      albumId: json['albumId']?.toString(),
      albumTitle: json['albumTitle']?.toString() ?? json['trackAlbum']?.toString(),
      startedAtUtc: startedAt,
      tzOffsetMin: tzMin,
      endedAtUtc: endedAt,
      listenedMs: listened,
      durationMs: dur,
      userAdvanced: userAdv,
      endedNaturally: naturally,
      loopOne: json['loopOne'] as bool? ?? false,
      source: playSource,
      contextType: cType,
      contextId: json['contextId']?.toString(),
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
    );
  }
}
