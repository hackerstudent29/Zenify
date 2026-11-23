import 'replay_period.dart';

/// Aggregated stats for an individual artist.
class ArtistStat {
  const ArtistStat({
    required this.artistName,
    required this.listenedMs,
    required this.qualifiedPlays,
    required this.trackCount,
    this.tracks = const [],
    this.imageUrl,
    this.isNewDiscovery = false,
  });

  final String artistName;
  final int listenedMs;
  final int qualifiedPlays;
  final int trackCount;
  final List<SongStat> tracks;
  final String? imageUrl;
  final bool isNewDiscovery;

  int get minutes => (listenedMs / 60000).round();

  Map<String, dynamic> toJson() => {
        'artistName': artistName,
        'listenedMs': listenedMs,
        'qualifiedPlays': qualifiedPlays,
        'trackCount': trackCount,
        'tracks': tracks.map((t) => t.toJson()).toList(),
        'imageUrl': imageUrl,
        'isNewDiscovery': isNewDiscovery,
      };

  factory ArtistStat.fromJson(Map<String, dynamic> json) => ArtistStat(
        artistName: json['artistName']?.toString() ?? '',
        listenedMs: (json['listenedMs'] as num?)?.toInt() ?? 0,
        qualifiedPlays: (json['qualifiedPlays'] as num?)?.toInt() ?? 0,
        trackCount: (json['trackCount'] as num?)?.toInt() ?? 0,
        tracks: (json['tracks'] is List)
            ? (json['tracks'] as List)
                .map((t) => SongStat.fromJson(Map<String, dynamic>.from(t)))
                .toList()
            : const [],
        imageUrl: json['imageUrl']?.toString(),
        isNewDiscovery: json['isNewDiscovery'] as bool? ?? false,
      );
}

/// Aggregated stats for an individual song with exact seconds precision.
class SongStat {
  const SongStat({
    required this.trackId,
    required this.title,
    required this.artistRaw,
    this.albumId,
    this.albumTitle,
    this.coverUrl,
    required this.listenedMs,
    required this.qualifiedPlays,
    this.rank = 0,
    this.durationMs,
  });

  final String trackId;
  final String title;
  final String artistRaw;
  final String? albumId;
  final String? albumTitle;
  final String? coverUrl;
  final int listenedMs;
  final int qualifiedPlays;
  final int rank;
  final int? durationMs;

  int get minutes => (listenedMs / 60000).floor();
  int get seconds => ((listenedMs % 60000) / 1000).round();

  /// Formats exact listened duration (e.g. "4 hr 12 min 34 sec" or "3 min 45 sec").
  static String formatDuration(int ms) {
    final totalSeconds = (ms / 1000).round();
    final h = totalSeconds ~/ 3600;
    final m = (totalSeconds % 3600) ~/ 60;
    final s = totalSeconds % 60;

    if (h > 0) {
      return '$h hr $m min $s sec';
    } else if (m > 0) {
      return '$m min $s sec';
    } else {
      return '$s sec';
    }
  }

  String get formattedDuration => formatDuration(listenedMs);

  Map<String, dynamic> toJson() => {
        'trackId': trackId,
        'title': title,
        'artistRaw': artistRaw,
        'albumId': albumId,
        'albumTitle': albumTitle,
        'coverUrl': coverUrl,
        'listenedMs': listenedMs,
        'qualifiedPlays': qualifiedPlays,
        'rank': rank,
        'durationMs': durationMs,
      };

  factory SongStat.fromJson(Map<String, dynamic> json) => SongStat(
        trackId: json['trackId']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        artistRaw: json['artistRaw']?.toString() ?? '',
        albumId: json['albumId']?.toString(),
        albumTitle: json['albumTitle']?.toString(),
        coverUrl: json['coverUrl']?.toString(),
        listenedMs: (json['listenedMs'] as num?)?.toInt() ?? 0,
        qualifiedPlays: (json['qualifiedPlays'] as num?)?.toInt() ?? 0,
        rank: (json['rank'] as num?)?.toInt() ?? 0,
        durationMs: (json['durationMs'] as num?)?.toInt(),
      );
}

/// Global helper for formatting duration in milliseconds to exact H/M/S.
String formatDuration(int ms) => SongStat.formatDuration(ms);

/// Aggregated stats for an album or soundtrack.
class AlbumStat {
  const AlbumStat({
    required this.albumId,
    required this.title,
    required this.artistRaw,
    this.coverUrl,
    required this.listenedMs,
    required this.qualifiedPlays,
    required this.distinctTrackCount,
    this.tracks = const [],
  });

  final String albumId;
  final String title;
  final String artistRaw;
  final String? coverUrl;
  final int listenedMs;
  final int qualifiedPlays;
  final int distinctTrackCount;
  final List<SongStat> tracks;

  int get minutes => (listenedMs / 60000).round();

  Map<String, dynamic> toJson() => {
        'albumId': albumId,
        'title': title,
        'artistRaw': artistRaw,
        'coverUrl': coverUrl,
        'listenedMs': listenedMs,
        'qualifiedPlays': qualifiedPlays,
        'distinctTrackCount': distinctTrackCount,
        'tracks': tracks.map((t) => t.toJson()).toList(),
      };

  factory AlbumStat.fromJson(Map<String, dynamic> json) => AlbumStat(
        albumId: json['albumId']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        artistRaw: json['artistRaw']?.toString() ?? '',
        coverUrl: json['coverUrl']?.toString(),
        listenedMs: (json['listenedMs'] as num?)?.toInt() ?? 0,
        qualifiedPlays: (json['qualifiedPlays'] as num?)?.toInt() ?? 0,
        distinctTrackCount: (json['distinctTrackCount'] as num?)?.toInt() ?? 0,
        tracks: (json['tracks'] is List)
            ? (json['tracks'] as List)
                .map((t) => SongStat.fromJson(Map<String, dynamic>.from(t)))
                .toList()
            : const [],
      );
}

/// Aggregated stats for a composer / music director.
class ComposerStat {
  const ComposerStat({
    required this.composerName,
    required this.listenedMs,
    required this.qualifiedPlays,
    this.topTracks = const [],
  });

  final String composerName;
  final int listenedMs;
  final int qualifiedPlays;
  final List<SongStat> topTracks;

  int get minutes => (listenedMs / 60000).round();

  Map<String, dynamic> toJson() => {
        'composerName': composerName,
        'listenedMs': listenedMs,
        'qualifiedPlays': qualifiedPlays,
        'topTracks': topTracks.map((t) => t.toJson()).toList(),
      };

  factory ComposerStat.fromJson(Map<String, dynamic> json) => ComposerStat(
        composerName: json['composerName']?.toString() ?? '',
        listenedMs: (json['listenedMs'] as num?)?.toInt() ?? 0,
        qualifiedPlays: (json['qualifiedPlays'] as num?)?.toInt() ?? 0,
        topTracks: (json['topTracks'] is List)
            ? (json['topTracks'] as List)
                .map((t) => SongStat.fromJson(Map<String, dynamic>.from(t)))
                .toList()
            : const [],
      );
}

/// Aggregated stats for a singer / vocalist.
class SingerStat {
  const SingerStat({
    required this.singerName,
    required this.listenedMs,
    required this.qualifiedPlays,
    this.topTracks = const [],
  });

  final String singerName;
  final int listenedMs;
  final int qualifiedPlays;
  final List<SongStat> topTracks;

  int get minutes => (listenedMs / 60000).round();

  Map<String, dynamic> toJson() => {
        'singerName': singerName,
        'listenedMs': listenedMs,
        'qualifiedPlays': qualifiedPlays,
        'topTracks': topTracks.map((t) => t.toJson()).toList(),
      };

  factory SingerStat.fromJson(Map<String, dynamic> json) => SingerStat(
        singerName: json['singerName']?.toString() ?? '',
        listenedMs: (json['listenedMs'] as num?)?.toInt() ?? 0,
        qualifiedPlays: (json['qualifiedPlays'] as num?)?.toInt() ?? 0,
        topTracks: (json['topTracks'] is List)
            ? (json['topTracks'] as List)
                .map((t) => SongStat.fromJson(Map<String, dynamic>.from(t)))
                .toList()
            : const [],
      );
}

/// Aggregated stats for a movie soundtrack album.
class MovieStat {
  const MovieStat({
    required this.movieName,
    required this.listenedMs,
    required this.qualifiedPlays,
    required this.distinctTrackCount,
    this.tracks = const [],
  });

  final String movieName;
  final int listenedMs;
  final int qualifiedPlays;
  final int distinctTrackCount;
  final List<SongStat> tracks;

  int get minutes => (listenedMs / 60000).round();

  Map<String, dynamic> toJson() => {
        'movieName': movieName,
        'listenedMs': listenedMs,
        'qualifiedPlays': qualifiedPlays,
        'distinctTrackCount': distinctTrackCount,
        'tracks': tracks.map((t) => t.toJson()).toList(),
      };

  factory MovieStat.fromJson(Map<String, dynamic> json) => MovieStat(
        movieName: json['movieName']?.toString() ?? '',
        listenedMs: (json['listenedMs'] as num?)?.toInt() ?? 0,
        qualifiedPlays: (json['qualifiedPlays'] as num?)?.toInt() ?? 0,
        distinctTrackCount: (json['distinctTrackCount'] as num?)?.toInt() ?? 0,
        tracks: (json['tracks'] is List)
            ? (json['tracks'] as List)
                .map((t) => SongStat.fromJson(Map<String, dynamic>.from(t)))
                .toList()
            : const [],
      );
}

/// F1: Daypart breakdown (Morning, Afternoon, Evening, Night).
class DaypartStat {
  const DaypartStat({
    required this.morningMs,
    required this.afternoonMs,
    required this.eveningMs,
    required this.nightMs,
    required this.peakHour,
    required this.hourlyMs,
  });

  final int morningMs; // 05:00 - 11:59
  final int afternoonMs; // 12:00 - 16:59
  final int eveningMs; // 17:00 - 21:59
  final int nightMs; // 22:00 - 04:59
  final int peakHour; // 0 - 23
  final List<int> hourlyMs; // 24 buckets

  int get morningMinutes => (morningMs / 60000).round();
  int get afternoonMinutes => (afternoonMs / 60000).round();
  int get eveningMinutes => (eveningMs / 60000).round();
  int get nightMinutes => (nightMs / 60000).round();

  String get dominantDaypart {
    var max = morningMs;
    var name = 'Morning';
    if (afternoonMs > max) {
      max = afternoonMs;
      name = 'Afternoon';
    }
    if (eveningMs > max) {
      max = eveningMs;
      name = 'Evening';
    }
    if (nightMs > max) {
      name = 'Night';
    }
    return name;
  }

  Map<String, dynamic> toJson() => {
        'morningMs': morningMs,
        'afternoonMs': afternoonMs,
        'eveningMs': eveningMs,
        'nightMs': nightMs,
        'peakHour': peakHour,
        'hourlyMs': hourlyMs,
      };

  factory DaypartStat.fromJson(Map<String, dynamic> json) => DaypartStat(
        morningMs: (json['morningMs'] as num?)?.toInt() ?? 0,
        afternoonMs: (json['afternoonMs'] as num?)?.toInt() ?? 0,
        eveningMs: (json['eveningMs'] as num?)?.toInt() ?? 0,
        nightMs: (json['nightMs'] as num?)?.toInt() ?? 0,
        peakHour: (json['peakHour'] as num?)?.toInt() ?? 0,
        hourlyMs: (json['hourlyMs'] is List)
            ? (json['hourlyMs'] as List).map((e) => (e as num).toInt()).toList()
            : List.filled(24, 0),
      );
}

/// F9: Loop & Heavy Rotation stat.
class LoopStat {
  const LoopStat({
    required this.trackId,
    required this.title,
    required this.artistRaw,
    required this.consecutiveRuns,
  });

  final String trackId;
  final String title;
  final String artistRaw;
  final int consecutiveRuns;

  Map<String, dynamic> toJson() => {
        'trackId': trackId,
        'title': title,
        'artistRaw': artistRaw,
        'consecutiveRuns': consecutiveRuns,
      };

  factory LoopStat.fromJson(Map<String, dynamic> json) => LoopStat(
        trackId: json['trackId']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        artistRaw: json['artistRaw']?.toString() ?? '',
        consecutiveRuns: (json['consecutiveRuns'] as num?)?.toInt() ?? 0,
      );
}

/// F10: Skip Hall of Fame stat.
class SkipStat {
  const SkipStat({
    required this.trackId,
    required this.title,
    required this.artistRaw,
    required this.skipCount,
    required this.totalStarts,
    required this.skipRate,
  });

  final String trackId;
  final String title;
  final String artistRaw;
  final int skipCount;
  final int totalStarts;
  final double skipRate;

  Map<String, dynamic> toJson() => {
        'trackId': trackId,
        'title': title,
        'artistRaw': artistRaw,
        'skipCount': skipCount,
        'totalStarts': totalStarts,
        'skipRate': skipRate,
      };

  factory SkipStat.fromJson(Map<String, dynamic> json) => SkipStat(
        trackId: json['trackId']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        artistRaw: json['artistRaw']?.toString() ?? '',
        skipCount: (json['skipCount'] as num?)?.toInt() ?? 0,
        totalStarts: (json['totalStarts'] as num?)?.toInt() ?? 0,
        skipRate: (json['skipRate'] as num?)?.toDouble() ?? 0.0,
      );
}

/// F11: Discovery Score & New Found Artists.
class DiscoveryStat {
  const DiscoveryStat({
    required this.newArtistsCount,
    required this.totalArtistsCount,
    required this.newRatio,
    this.newFoundGems = const [],
    this.topNewArtist,
  });

  final int newArtistsCount;
  final int totalArtistsCount;
  final double newRatio;
  final List<ArtistStat> newFoundGems;
  final ArtistStat? topNewArtist;

  Map<String, dynamic> toJson() => {
        'newArtistsCount': newArtistsCount,
        'totalArtistsCount': totalArtistsCount,
        'newRatio': newRatio,
        'newFoundGems': newFoundGems.map((a) => a.toJson()).toList(),
        'topNewArtist': topNewArtist?.toJson(),
      };

  factory DiscoveryStat.fromJson(Map<String, dynamic> json) => DiscoveryStat(
        newArtistsCount: (json['newArtistsCount'] as num?)?.toInt() ?? 0,
        totalArtistsCount: (json['totalArtistsCount'] as num?)?.toInt() ?? 0,
        newRatio: (json['newRatio'] as num?)?.toDouble() ?? 0.0,
        newFoundGems: (json['newFoundGems'] is List)
            ? (json['newFoundGems'] as List)
                .map((a) => ArtistStat.fromJson(Map<String, dynamic>.from(a)))
                .toList()
            : const [],
        topNewArtist: json['topNewArtist'] != null
            ? ArtistStat.fromJson(Map<String, dynamic>.from(json['topNewArtist']))
            : null,
      );
}

/// F12: Music Geography country stat.
class CountryStat {
  const CountryStat({
    required this.countryCode,
    required this.countryName,
    required this.uniqueTrackCount,
    required this.listenedMs,
    this.flagEmoji,
  });

  final String countryCode;
  final String countryName;
  final int uniqueTrackCount;
  final int listenedMs;
  final String? flagEmoji;

  int get minutes => (listenedMs / 60000).round();

  Map<String, dynamic> toJson() => {
        'countryCode': countryCode,
        'countryName': countryName,
        'uniqueTrackCount': uniqueTrackCount,
        'listenedMs': listenedMs,
        'flagEmoji': flagEmoji,
      };

  factory CountryStat.fromJson(Map<String, dynamic> json) => CountryStat(
        countryCode: json['countryCode']?.toString() ?? '',
        countryName: json['countryName']?.toString() ?? '',
        uniqueTrackCount: (json['uniqueTrackCount'] as num?)?.toInt() ?? 0,
        listenedMs: (json['listenedMs'] as num?)?.toInt() ?? 0,
        flagEmoji: json['flagEmoji']?.toString(),
      );
}

/// F13: Era & Decades Breakdown.
class DecadesStat {
  const DecadesStat({
    required this.twentiesMs,
    required this.tensMs,
    required this.thousandsMs,
    required this.classicsMs,
  });

  final int twentiesMs; // 2020s (>= 2020)
  final int tensMs; // 2010s (2010 - 2019)
  final int thousandsMs; // 2000s (2000 - 2009)
  final int classicsMs; // Classics (< 2000)

  int get totalMs => twentiesMs + tensMs + thousandsMs + classicsMs;

  double get twentiesPercent => totalMs > 0 ? (twentiesMs / totalMs) * 100 : 0.0;
  double get tensPercent => totalMs > 0 ? (tensMs / totalMs) * 100 : 0.0;
  double get thousandsPercent => totalMs > 0 ? (thousandsMs / totalMs) * 100 : 0.0;
  double get classicsPercent => totalMs > 0 ? (classicsMs / totalMs) * 100 : 0.0;

  Map<String, dynamic> toJson() => {
        'twentiesMs': twentiesMs,
        'tensMs': tensMs,
        'thousandsMs': thousandsMs,
        'classicsMs': classicsMs,
      };

  factory DecadesStat.fromJson(Map<String, dynamic> json) => DecadesStat(
        twentiesMs: (json['twentiesMs'] as num?)?.toInt() ?? 0,
        tensMs: (json['tensMs'] as num?)?.toInt() ?? 0,
        thousandsMs: (json['thousandsMs'] as num?)?.toInt() ?? 0,
        classicsMs: (json['classicsMs'] as num?)?.toInt() ?? 0,
      );
}

/// Add-on: Language breakdown stat.
class LanguageStat {
  const LanguageStat({
    required this.language,
    required this.listenedMs,
    required this.songCount,
    required this.percentage,
  });

  final String language;
  final int listenedMs;
  final int songCount;
  final double percentage;

  Map<String, dynamic> toJson() => {
        'language': language,
        'listenedMs': listenedMs,
        'songCount': songCount,
        'percentage': percentage,
      };

  factory LanguageStat.fromJson(Map<String, dynamic> json) => LanguageStat(
        language: json['language']?.toString() ?? 'Unknown',
        listenedMs: (json['listenedMs'] as num?)?.toInt() ?? 0,
        songCount: (json['songCount'] as num?)?.toInt() ?? 0,
        percentage: (json['percentage'] as num?)?.toDouble() ?? 0.0,
      );
}

/// Marathon continuous listening session (gaps <= 5 min, min 30 min duration).
class MarathonSession {
  const MarathonSession({
    required this.startUtc,
    required this.endUtc,
    required this.durationMinutes,
    required this.songCount,
    this.topSongTitle,
    required this.tzOffsetMin,
  });

  final DateTime startUtc;
  final DateTime endUtc;
  final int durationMinutes;
  final int songCount;
  final String? topSongTitle;
  final int tzOffsetMin;

  DateTime get startWall => startUtc.add(Duration(minutes: tzOffsetMin));

  Map<String, dynamic> toJson() => {
        'startUtc': startUtc.toIso8601String(),
        'endUtc': endUtc.toIso8601String(),
        'durationMinutes': durationMinutes,
        'songCount': songCount,
        'topSongTitle': topSongTitle,
        'tzOffsetMin': tzOffsetMin,
      };

  factory MarathonSession.fromJson(Map<String, dynamic> json) => MarathonSession(
        startUtc: DateTime.tryParse(json['startUtc']?.toString() ?? '')?.toUtc() ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        endUtc: DateTime.tryParse(json['endUtc']?.toString() ?? '')?.toUtc() ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        durationMinutes: (json['durationMinutes'] as num?)?.toInt() ?? 0,
        songCount: (json['songCount'] as num?)?.toInt() ?? 0,
        topSongTitle: json['topSongTitle']?.toString(),
        tzOffsetMin: (json['tzOffsetMin'] as num?)?.toInt() ?? 0,
      );
}

/// F14: Artist Loyalty timeline stat.
class LoyaltyStat {
  const LoyaltyStat({
    required this.artistName,
    required this.firstPlayDate,
    required this.daysLoyal,
  });

  final String artistName;
  final DateTime firstPlayDate;
  final int daysLoyal;

  Map<String, dynamic> toJson() => {
        'artistName': artistName,
        'firstPlayDate': firstPlayDate.toIso8601String(),
        'daysLoyal': daysLoyal,
      };

  factory LoyaltyStat.fromJson(Map<String, dynamic> json) => LoyaltyStat(
        artistName: json['artistName']?.toString() ?? '',
        firstPlayDate: DateTime.tryParse(json['firstPlayDate']?.toString() ?? '')?.toUtc() ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        daysLoyal: (json['daysLoyal'] as num?)?.toInt() ?? 0,
      );
}

/// The complete, canonical ReplayAggregate domain model.
class ReplayAggregate {
  const ReplayAggregate({
    required this.period,
    required this.totalListenedMs,
    required this.totalQualifiedPlays,
    required this.totalStarts,
    required this.topArtists,
    required this.topSongs,
    required this.topAlbums,
    required this.topComposers,
    required this.topSingers,
    this.topMovie,
    required this.daypart,
    required this.dayOfWeekMinutes,
    required this.heatmapDays,
    required this.dayTopSongs,
    this.loops = const [],
    this.heavyRotation = const [],
    this.skips = const [],
    required this.discovery,
    this.geography = const [],
    required this.decades,
    this.loyalty,
    required this.offlineDataSavedBytes,
    required this.completionRate,
    this.marathon,
    this.firstSongOfPeriod,
    this.languages = const [],
    this.previousPeriod,
  });

  final ReplayPeriod period;
  final int totalListenedMs;
  final int totalQualifiedPlays;
  final int totalStarts;

  final List<ArtistStat> topArtists;
  final List<SongStat> topSongs;
  final List<AlbumStat> topAlbums;
  final List<ComposerStat> topComposers;
  final List<SingerStat> topSingers;
  final MovieStat? topMovie;

  final DaypartStat daypart;
  final Map<int, int> dayOfWeekMinutes; // 1 (Mon) -> 7 (Sun) to minutes
  final Map<String, int> heatmapDays; // 'YYYY-MM-DD' -> minutes
  final Map<String, SongStat> dayTopSongs; // 'YYYY-MM-DD' -> top song

  final List<LoopStat> loops;
  final List<SongStat> heavyRotation;
  final List<SkipStat> skips;
  final DiscoveryStat discovery;
  final List<CountryStat> geography;
  final DecadesStat decades;
  final LoyaltyStat? loyalty;

  final int offlineDataSavedBytes;
  final double completionRate;
  final MarathonSession? marathon;
  final SongStat? firstSongOfPeriod;
  final List<LanguageStat> languages;

  final ReplayAggregate? previousPeriod;

  int get totalMinutes => (totalListenedMs / 60000).round();

  // ---------------------------------------------------------------------------
  // F4: Period-over-Period Delta Getters
  // ---------------------------------------------------------------------------

  double? get minutesDeltaPercent {
    if (previousPeriod == null || previousPeriod!.totalListenedMs == 0) return null;
    final diff = totalListenedMs - previousPeriod!.totalListenedMs;
    return (diff / previousPeriod!.totalListenedMs) * 100;
  }

  double? get playsDeltaPercent {
    if (previousPeriod == null || previousPeriod!.totalQualifiedPlays == 0) return null;
    final diff = totalQualifiedPlays - previousPeriod!.totalQualifiedPlays;
    return (diff / previousPeriod!.totalQualifiedPlays) * 100;
  }

  bool get topArtistChanged {
    if (previousPeriod == null || topArtists.isEmpty || previousPeriod!.topArtists.isEmpty) {
      return false;
    }
    return topArtists.first.artistName.toLowerCase() !=
        previousPeriod!.topArtists.first.artistName.toLowerCase();
  }

  Map<String, dynamic> toJson() => {
        'periodKey': period.key,
        'totalListenedMs': totalListenedMs,
        'totalQualifiedPlays': totalQualifiedPlays,
        'totalStarts': totalStarts,
        'topArtists': topArtists.map((a) => a.toJson()).toList(),
        'topSongs': topSongs.map((s) => s.toJson()).toList(),
        'topAlbums': topAlbums.map((a) => a.toJson()).toList(),
        'topComposers': topComposers.map((c) => c.toJson()).toList(),
        'topSingers': topSingers.map((s) => s.toJson()).toList(),
        'topMovie': topMovie?.toJson(),
        'daypart': daypart.toJson(),
        'dayOfWeekMinutes': dayOfWeekMinutes.map((k, v) => MapEntry(k.toString(), v)),
        'heatmapDays': heatmapDays,
        'dayTopSongs': dayTopSongs.map((k, v) => MapEntry(k, v.toJson())),
        'loops': loops.map((l) => l.toJson()).toList(),
        'heavyRotation': heavyRotation.map((s) => s.toJson()).toList(),
        'skips': skips.map((s) => s.toJson()).toList(),
        'discovery': discovery.toJson(),
        'geography': geography.map((g) => g.toJson()).toList(),
        'decades': decades.toJson(),
        'loyalty': loyalty?.toJson(),
        'offlineDataSavedBytes': offlineDataSavedBytes,
        'completionRate': completionRate,
        'marathon': marathon?.toJson(),
        'firstSongOfPeriod': firstSongOfPeriod?.toJson(),
        'languages': languages.map((l) => l.toJson()).toList(),
      };

  factory ReplayAggregate.fromJson(Map<String, dynamic> json) {
    final periodKey = json['periodKey']?.toString() ?? '';
    final period = ReplayPeriod.parseKey(periodKey) ?? ReplayPeriod.month(DateTime.now());

    final topArtists = (json['topArtists'] is List)
        ? (json['topArtists'] as List)
            .map((a) => ArtistStat.fromJson(Map<String, dynamic>.from(a)))
            .toList()
        : <ArtistStat>[];

    final topSongs = (json['topSongs'] is List)
        ? (json['topSongs'] as List)
            .map((s) => SongStat.fromJson(Map<String, dynamic>.from(s)))
            .toList()
        : <SongStat>[];

    final topAlbums = (json['topAlbums'] is List)
        ? (json['topAlbums'] as List)
            .map((a) => AlbumStat.fromJson(Map<String, dynamic>.from(a)))
            .toList()
        : <AlbumStat>[];

    final topComposers = (json['topComposers'] is List)
        ? (json['topComposers'] as List)
            .map((c) => ComposerStat.fromJson(Map<String, dynamic>.from(c)))
            .toList()
        : <ComposerStat>[];

    final topSingers = (json['topSingers'] is List)
        ? (json['topSingers'] as List)
            .map((s) => SingerStat.fromJson(Map<String, dynamic>.from(s)))
            .toList()
        : <SingerStat>[];

    final topMovie = json['topMovie'] != null
        ? MovieStat.fromJson(Map<String, dynamic>.from(json['topMovie']))
        : null;

    final daypart = json['daypart'] != null
        ? DaypartStat.fromJson(Map<String, dynamic>.from(json['daypart']))
        : const DaypartStat(
            morningMs: 0,
            afternoonMs: 0,
            eveningMs: 0,
            nightMs: 0,
            peakHour: 0,
            hourlyMs: [],
          );

    final dayOfWeekMinutes = <int, int>{};
    if (json['dayOfWeekMinutes'] is Map) {
      (json['dayOfWeekMinutes'] as Map).forEach((k, v) {
        final day = int.tryParse(k.toString());
        if (day != null) dayOfWeekMinutes[day] = (v as num?)?.toInt() ?? 0;
      });
    }

    final heatmapDays = <String, int>{};
    if (json['heatmapDays'] is Map) {
      (json['heatmapDays'] as Map).forEach((k, v) {
        heatmapDays[k.toString()] = (v as num?)?.toInt() ?? 0;
      });
    }

    final dayTopSongs = <String, SongStat>{};
    if (json['dayTopSongs'] is Map) {
      (json['dayTopSongs'] as Map).forEach((k, v) {
        if (v is Map) {
          dayTopSongs[k.toString()] = SongStat.fromJson(Map<String, dynamic>.from(v));
        }
      });
    }

    final loops = (json['loops'] is List)
        ? (json['loops'] as List)
            .map((l) => LoopStat.fromJson(Map<String, dynamic>.from(l)))
            .toList()
        : <LoopStat>[];

    final heavyRotation = (json['heavyRotation'] is List)
        ? (json['heavyRotation'] as List)
            .map((s) => SongStat.fromJson(Map<String, dynamic>.from(s)))
            .toList()
        : <SongStat>[];

    final skips = (json['skips'] is List)
        ? (json['skips'] as List)
            .map((s) => SkipStat.fromJson(Map<String, dynamic>.from(s)))
            .toList()
        : <SkipStat>[];

    final discovery = json['discovery'] != null
        ? DiscoveryStat.fromJson(Map<String, dynamic>.from(json['discovery']))
        : const DiscoveryStat(
            newArtistsCount: 0,
            totalArtistsCount: 0,
            newRatio: 0,
            newFoundGems: [],
          );

    final geography = (json['geography'] is List)
        ? (json['geography'] as List)
            .map((g) => CountryStat.fromJson(Map<String, dynamic>.from(g)))
            .toList()
        : <CountryStat>[];

    final decades = json['decades'] != null
        ? DecadesStat.fromJson(Map<String, dynamic>.from(json['decades']))
        : const DecadesStat(
            twentiesMs: 0,
            tensMs: 0,
            thousandsMs: 0,
            classicsMs: 0,
          );

    final loyalty = json['loyalty'] != null
        ? LoyaltyStat.fromJson(Map<String, dynamic>.from(json['loyalty']))
        : null;

    final marathon = json['marathon'] != null
        ? MarathonSession.fromJson(Map<String, dynamic>.from(json['marathon']))
        : null;

    final firstSongOfPeriod = json['firstSongOfPeriod'] != null
        ? SongStat.fromJson(Map<String, dynamic>.from(json['firstSongOfPeriod']))
        : null;

    final languages = (json['languages'] is List)
        ? (json['languages'] as List)
            .map((l) => LanguageStat.fromJson(Map<String, dynamic>.from(l)))
            .toList()
        : <LanguageStat>[];

    return ReplayAggregate(
      period: period,
      totalListenedMs: (json['totalListenedMs'] as num?)?.toInt() ?? 0,
      totalQualifiedPlays: (json['totalQualifiedPlays'] as num?)?.toInt() ?? 0,
      totalStarts: (json['totalStarts'] as num?)?.toInt() ?? 0,
      topArtists: topArtists,
      topSongs: topSongs,
      topAlbums: topAlbums,
      topComposers: topComposers,
      topSingers: topSingers,
      topMovie: topMovie,
      daypart: daypart,
      dayOfWeekMinutes: dayOfWeekMinutes,
      heatmapDays: heatmapDays,
      dayTopSongs: dayTopSongs,
      loops: loops,
      heavyRotation: heavyRotation,
      skips: skips,
      discovery: discovery,
      geography: geography,
      decades: decades,
      loyalty: loyalty,
      offlineDataSavedBytes: (json['offlineDataSavedBytes'] as num?)?.toInt() ?? 0,
      completionRate: (json['completionRate'] as num?)?.toDouble() ?? 0.0,
      marathon: marathon,
      firstSongOfPeriod: firstSongOfPeriod,
      languages: languages,
    );
  }
}
