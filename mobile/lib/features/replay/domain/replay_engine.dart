import 'dart:async';

import '../../../utils/media_normalizer.dart';
import '../data/track_meta_store.dart';
import 'all_time_index.dart';
import 'listen_event.dart';
import 'replay_aggregate.dart';
import 'replay_period.dart';

/// Pure computation engine for Zenify Replay.
///
/// Features:
/// - Single-pass event stream consumption: O(N) time, O(U) memory.
/// - Zero UI dependency.
/// - Exact precision down to individual milliseconds.
class ReplayEngine {
  const ReplayEngine();

  /// Computes a full [ReplayAggregate] from a stream of eligible events.
  Future<ReplayAggregate> compute({
    required Stream<ListenEvent> events,
    required TrackMetaStore metaStore,
    required ReplayPeriod period,
    AllTimeIndex? allTimeIndex,
    ReplayAggregate? previousPeriod,
  }) async {
    var totalListenedMs = 0;
    var totalQualifiedPlays = 0;
    var totalStarts = 0;
    var naturalEnds = 0;
    var offlineListenedMs = 0;

    final songMap = <String, _SongAcc>{};
    final artistMap = <String, _ArtistAcc>{};
    final albumMap = <String, _AlbumAcc>{};
    final composerMap = <String, _RoleAcc>{};
    final singerMap = <String, _RoleAcc>{};
    final movieMap = <String, _AlbumAcc>{};

    final hourlyMs = List.filled(24, 0);
    var morningMs = 0;
    var afternoonMs = 0;
    var eveningMs = 0;
    var nightMs = 0;

    final dayOfWeekMs = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0};
    final heatmapMs = <String, int>{};
    final daySongMs = <String, Map<String, int>>{};

    var twentiesMs = 0;
    var tensMs = 0;
    var thousandsMs = 0;
    var classicsMs = 0;

    final artistSplitCache = <String, List<_ArtistKey>>{};
    final countryTracks = <String, Set<String>>{};
    final countryMs = <String, int>{};

    final languageTracks = <String, Set<String>>{};
    final languageMs = <String, int>{};
    var totalEventsWithKnownLanguage = 0;

    final loopTracker = <String, int>{};
    String? lastTrackId;
    var consecutiveRun = 0;

    ListenEvent? firstEvent;

    MarathonSession? bestMarathon;
    DateTime? marathonStart;
    DateTime? marathonEnd;
    var marathonActiveMs = 0;
    var marathonCount = 0;
    var marathonTzOffset = 0;
    final marathonSongs = <String, int>{};

    void checkMarathon() {
      if (marathonActiveMs >= 30 * 60 * 1000 && marathonSongs.isNotEmpty) {
        var topTitle = marathonSongs.keys.first;
        var topMs = marathonSongs[topTitle]!;
        marathonSongs.forEach((title, ms) {
          if (ms > topMs) {
            topMs = ms;
            topTitle = title;
          }
        });
        final durationMin = (marathonActiveMs / 60000).round();
        if (bestMarathon == null || durationMin > bestMarathon!.durationMinutes) {
          bestMarathon = MarathonSession(
            startUtc: marathonStart!,
            endUtc: marathonEnd!,
            durationMinutes: durationMin,
            songCount: marathonCount,
            topSongTitle: topTitle,
            tzOffsetMin: marathonTzOffset,
          );
        }
      }
    }

    var lastY = -1;
    var lastM = -1;
    var lastD = -1;
    var lastDayKey = '';

    void processEvent(ListenEvent e) {
      firstEvent ??= e;

      if (marathonEnd != null) {
        final gap = e.startedAtUtc.difference(marathonEnd!);
        if (gap.inMinutes <= 5 && !gap.isNegative) {
          marathonEnd = e.startedAtUtc.add(Duration(milliseconds: e.listenedMs));
          marathonActiveMs += e.listenedMs;
          marathonCount++;
          marathonSongs[e.title] = (marathonSongs[e.title] ?? 0) + e.listenedMs;
        } else {
          checkMarathon();
          marathonStart = e.startedAtUtc;
          marathonEnd = e.startedAtUtc.add(Duration(milliseconds: e.listenedMs));
          marathonActiveMs = e.listenedMs;
          marathonCount = 1;
          marathonTzOffset = e.tzOffsetMin;
          marathonSongs.clear();
          marathonSongs[e.title] = e.listenedMs;
        }
      } else {
        marathonStart = e.startedAtUtc;
        marathonEnd = e.startedAtUtc.add(Duration(milliseconds: e.listenedMs));
        marathonActiveMs = e.listenedMs;
        marathonCount = 1;
        marathonTzOffset = e.tzOffsetMin;
        marathonSongs[e.title] = e.listenedMs;
      }

      totalStarts++;
      totalListenedMs += e.listenedMs;
      if (e.endedNaturally) naturalEnds++;
      if (e.source == PlaySource.offline) offlineListenedMs += e.listenedMs;

      final isQualified = e.isQualifiedPlay;
      final isSkip = e.isSkip;

      // 1. Song Accumulator
      final songAcc = songMap.putIfAbsent(
        e.trackId,
        () => _SongAcc(
          trackId: e.trackId,
          title: e.title,
          artistRaw: e.artistRaw,
          albumId: e.albumId,
          albumTitle: e.albumTitle,
          durationMs: e.durationMs,
        ),
      );
      songAcc.listenedMs += e.listenedMs;
      songAcc.totalStarts++;
      if (isQualified) songAcc.qualifiedPlays++;
      if (isSkip) songAcc.skips++;

      // 2. Artist Splitting Accumulator (F5)
      final artistKeys = artistSplitCache.putIfAbsent(
        e.artistRaw,
        () => MediaNormalizer.splitArtistNames(e.artistRaw)
            .map((a) {
              final clean = a.trim();
              return clean.isNotEmpty ? _ArtistKey(clean, clean.toLowerCase()) : null;
            })
            .whereType<_ArtistKey>()
            .toList(),
      );
      for (final ak in artistKeys) {
        final artistAcc = artistMap.putIfAbsent(
          ak.lowerKey,
          () => _ArtistAcc(displayName: ak.name),
        );
        artistAcc.listenedMs += e.listenedMs;
        if (isQualified) artistAcc.qualifiedPlays++;
        artistAcc.trackIds.add(e.trackId);
      }

      // 3. Metadata Enrichment Lookup (F6, F8, F12, F13)
      final meta = metaStore.get(e.trackId);

      // Album & Movie
      final effectiveAlbumTitle = meta?.movie ?? e.albumTitle;
      final effectiveAlbumId = meta?.albumId ?? e.albumId ?? effectiveAlbumTitle;

      if (effectiveAlbumId != null && effectiveAlbumId.isNotEmpty) {
        final albAcc = albumMap.putIfAbsent(
          effectiveAlbumId,
          () => _AlbumAcc(
            id: effectiveAlbumId,
            title: effectiveAlbumTitle ?? 'Unknown Album',
            artistRaw: e.artistRaw,
          ),
        );
        albAcc.listenedMs += e.listenedMs;
        if (isQualified) albAcc.qualifiedPlays++;
        albAcc.distinctTrackIds.add(e.trackId);
      }

      if (meta?.movie != null && meta!.movie!.isNotEmpty) {
        final movieAcc = movieMap.putIfAbsent(
          meta.movie!,
          () => _AlbumAcc(
            id: meta.movie!,
            title: meta.movie!,
            artistRaw: e.artistRaw,
          ),
        );
        movieAcc.listenedMs += e.listenedMs;
        if (isQualified) movieAcc.qualifiedPlays++;
        movieAcc.distinctTrackIds.add(e.trackId);
      }

      // Composers
      final composers = meta?.composers.isNotEmpty == true
          ? meta!.composers
          : const <String>[];
      for (final comp in composers) {
        final cKey = comp.toLowerCase();
        final cAcc = composerMap.putIfAbsent(cKey, () => _RoleAcc(displayName: comp));
        cAcc.listenedMs += e.listenedMs;
        if (isQualified) cAcc.qualifiedPlays++;
        cAcc.trackIds.add(e.trackId);
      }

      // Singers
      if (meta?.singers.isNotEmpty == true) {
        for (final sng in meta!.singers) {
          final sKey = sng.toLowerCase();
          final sAcc = singerMap.putIfAbsent(sKey, () => _RoleAcc(displayName: sng));
          sAcc.listenedMs += e.listenedMs;
          if (isQualified) sAcc.qualifiedPlays++;
          sAcc.trackIds.add(e.trackId);
        }
      } else {
        for (final ak in artistKeys) {
          final sAcc = singerMap.putIfAbsent(ak.lowerKey, () => _RoleAcc(displayName: ak.name));
          sAcc.listenedMs += e.listenedMs;
          if (isQualified) sAcc.qualifiedPlays++;
          sAcc.trackIds.add(e.trackId);
        }
      }

      // 4. Time Intelligence & Daypart Bucketing (F1, F2, F3)
      final wall = e.localWall;
      final hour = wall.hour;
      hourlyMs[hour] += e.listenedMs;

      if (hour >= 5 && hour < 12) {
        morningMs += e.listenedMs;
      } else if (hour >= 12 && hour < 17) {
        afternoonMs += e.listenedMs;
      } else if (hour >= 17 && hour < 22) {
        eveningMs += e.listenedMs;
      } else {
        nightMs += e.listenedMs;
      }

      dayOfWeekMs[wall.weekday] = (dayOfWeekMs[wall.weekday] ?? 0) + e.listenedMs;

      final y = wall.year;
      final m = wall.month;
      final d = wall.day;
      String dayKey;
      if (y == lastY && m == lastM && d == lastD) {
        dayKey = lastDayKey;
      } else {
        final mStr = m < 10 ? '0$m' : '$m';
        final dStr = d < 10 ? '0$d' : '$d';
        dayKey = '$y-$mStr-$dStr';
        lastY = y;
        lastM = m;
        lastD = d;
        lastDayKey = dayKey;
      }
      heatmapMs[dayKey] = (heatmapMs[dayKey] ?? 0) + e.listenedMs;
      final daySongs = daySongMs.putIfAbsent(dayKey, () => <String, int>{});
      daySongs[e.trackId] = (daySongs[e.trackId] ?? 0) + e.listenedMs;

      // 5. Decades Breakdown (F13)
      final year = meta?.year;
      if (year != null) {
        if (year >= 2020) {
          twentiesMs += e.listenedMs;
        } else if (year >= 2010) {
          tensMs += e.listenedMs;
        } else if (year >= 2000) {
          thousandsMs += e.listenedMs;
        } else {
          classicsMs += e.listenedMs;
        }
      }

      // 6. Geography (F12)
      final country = meta?.country ?? 'IN';
      countryTracks.putIfAbsent(country, () => <String>{}).add(e.trackId);
      countryMs[country] = (countryMs[country] ?? 0) + e.listenedMs;

      // 6b. Language Breakdown (Add-On: Languages Bar)
      final lang = meta?.language;
      if (lang != null && lang.isNotEmpty && lang.toLowerCase() != 'unknown') {
        languageTracks.putIfAbsent(lang, () => <String>{}).add(e.trackId);
        languageMs[lang] = (languageMs[lang] ?? 0) + e.listenedMs;
        totalEventsWithKnownLanguage++;
      }

      // 7. Loop Tracking (F9)
      if (e.trackId == lastTrackId || e.loopOne) {
        consecutiveRun++;
        final currentMax = loopTracker[e.trackId] ?? 0;
        if (consecutiveRun > currentMax) {
          loopTracker[e.trackId] = consecutiveRun;
        }
      } else {
        lastTrackId = e.trackId;
        consecutiveRun = 1;
      }

      if (isQualified) {
        totalQualifiedPlays++;
      }
    }

    final completer = Completer<void>();
    events.listen(
      processEvent,
      onDone: completer.complete,
      onError: completer.completeError,
      cancelOnError: true,
    );
    await completer.future;

    checkMarathon();

    // -------------------------------------------------------------------------
    // Finalizing & Sorting Results
    // -------------------------------------------------------------------------

    // Top Songs
    final sortedSongs = songMap.values.toList()
      ..sort((a, b) {
        final p = b.qualifiedPlays.compareTo(a.qualifiedPlays);
        if (p != 0) return p;
        return b.listenedMs.compareTo(a.listenedMs);
      });

    final topSongs = <SongStat>[];
    for (var i = 0; i < sortedSongs.length; i++) {
      final s = sortedSongs[i];
      topSongs.add(SongStat(
        trackId: s.trackId,
        title: s.title,
        artistRaw: s.artistRaw,
        albumId: s.albumId,
        albumTitle: s.albumTitle,
        listenedMs: s.listenedMs,
        qualifiedPlays: s.qualifiedPlays,
        rank: i + 1,
        durationMs: s.durationMs,
      ));
    }

    // Day Top Songs mapping
    final songLookup = {for (final s in topSongs) s.trackId: s};
    final dayTopSongs = <String, SongStat>{};
    daySongMs.forEach((dayKey, songDurations) {
      if (songDurations.isNotEmpty) {
        var topId = songDurations.keys.first;
        var maxMs = songDurations[topId]!;
        songDurations.forEach((tid, dur) {
          if (dur > maxMs) {
            maxMs = dur;
            topId = tid;
          }
        });
        final songStat = songLookup[topId];
        if (songStat != null) {
          dayTopSongs[dayKey] = songStat;
        }
      }
    });

    // Top Artists
    final sortedArtists = artistMap.values.toList()
      ..sort((a, b) {
        final p = b.qualifiedPlays.compareTo(a.qualifiedPlays);
        if (p != 0) return p;
        return b.listenedMs.compareTo(a.listenedMs);
      });

    final topArtists = <ArtistStat>[];
    for (final a in sortedArtists) {
      final artistTracks = a.trackIds
          .map((id) => songLookup[id])
          .whereType<SongStat>()
          .toList();
      var isNew = false;
      if (allTimeIndex != null) {
        final firstPlay = allTimeIndex.firstQualifiedPlayByArtist[a.displayName.toLowerCase()];
        if (firstPlay != null && period.containsLocalUtc(firstPlay)) {
          isNew = true;
        }
      }
      topArtists.add(ArtistStat(
        artistName: a.displayName,
        listenedMs: a.listenedMs,
        qualifiedPlays: a.qualifiedPlays,
        trackCount: a.trackIds.length,
        tracks: artistTracks,
        isNewDiscovery: isNew,
      ));
    }

    // Top Albums (Requires >= 2 distinct tracks played, F8)
    final eligibleAlbums = albumMap.values
        .where((alb) => alb.distinctTrackIds.length >= 2)
        .toList()
      ..sort((a, b) => b.listenedMs.compareTo(a.listenedMs));

    final topAlbums = eligibleAlbums.map((alb) {
      final albTracks = alb.distinctTrackIds
          .map((id) => songLookup[id])
          .whereType<SongStat>()
          .toList();
      return AlbumStat(
        albumId: alb.id,
        title: alb.title,
        artistRaw: alb.artistRaw,
        listenedMs: alb.listenedMs,
        qualifiedPlays: alb.qualifiedPlays,
        distinctTrackCount: alb.distinctTrackIds.length,
        tracks: albTracks,
      );
    }).toList();

    // Top Movie (Soundtrack with >= 2 distinct tracks, F6)
    MovieStat? topMovie;
    final eligibleMovies = movieMap.values
        .where((m) => m.distinctTrackIds.length >= 2)
        .toList()
      ..sort((a, b) => b.listenedMs.compareTo(a.listenedMs));
    if (eligibleMovies.isNotEmpty) {
      final m = eligibleMovies.first;
      final mTracks = m.distinctTrackIds
          .map((id) => songLookup[id])
          .whereType<SongStat>()
          .toList();
      topMovie = MovieStat(
        movieName: m.title,
        listenedMs: m.listenedMs,
        qualifiedPlays: m.qualifiedPlays,
        distinctTrackCount: m.distinctTrackIds.length,
        tracks: mTracks,
      );
    }

    // Top Composers
    final sortedComposers = composerMap.values.toList()
      ..sort((a, b) => b.listenedMs.compareTo(a.listenedMs));
    final topComposers = sortedComposers.map((c) {
      final cTracks = c.trackIds
          .map((id) => songLookup[id])
          .whereType<SongStat>()
          .toList();
      return ComposerStat(
        composerName: c.displayName,
        listenedMs: c.listenedMs,
        qualifiedPlays: c.qualifiedPlays,
        topTracks: cTracks,
      );
    }).toList();

    // Top Singers
    final sortedSingers = singerMap.values.toList()
      ..sort((a, b) => b.listenedMs.compareTo(a.listenedMs));
    final topSingers = sortedSingers.map((sng) {
      final sTracks = sng.trackIds
          .map((id) => songLookup[id])
          .whereType<SongStat>()
          .toList();
      return SingerStat(
        singerName: sng.displayName,
        listenedMs: sng.listenedMs,
        qualifiedPlays: sng.qualifiedPlays,
        topTracks: sTracks,
      );
    }).toList();

    // Peak Hour
    var peakHour = 0;
    var maxHourMs = -1;
    for (var h = 0; h < 24; h++) {
      if (hourlyMs[h] > maxHourMs) {
        maxHourMs = hourlyMs[h];
        peakHour = h;
      }
    }

    final daypartStat = DaypartStat(
      morningMs: morningMs,
      afternoonMs: afternoonMs,
      eveningMs: eveningMs,
      nightMs: nightMs,
      peakHour: peakHour,
      hourlyMs: hourlyMs,
    );

    // Loops (consecutive runs >= 3)
    final loops = <LoopStat>[];
    loopTracker.forEach((tid, runs) {
      if (runs >= 3 && songLookup.containsKey(tid)) {
        final s = songLookup[tid]!;
        loops.add(LoopStat(
          trackId: tid,
          title: s.title,
          artistRaw: s.artistRaw,
          consecutiveRuns: runs,
        ));
      }
    });
    loops.sort((a, b) => b.consecutiveRuns.compareTo(a.consecutiveRuns));

    // Heavy Rotation (qualified plays >= 5)
    final heavyRotation = topSongs.where((s) => s.qualifiedPlays >= 5).toList();

    // Skips (skips >= 3 && skipRate >= 0.50, F10)
    final skips = <SkipStat>[];
    for (final s in sortedSongs) {
      if (s.skips >= 3) {
        final rate = s.totalStarts > 0 ? s.skips / s.totalStarts : 0.0;
        if (rate >= 0.50) {
          skips.add(SkipStat(
            trackId: s.trackId,
            title: s.title,
            artistRaw: s.artistRaw,
            skipCount: s.skips,
            totalStarts: s.totalStarts,
            skipRate: rate,
          ));
        }
      }
    }
    skips.sort((a, b) => b.skipCount.compareTo(a.skipCount));

    // Discovery Score & Single-Play Gems (F11)
    final newArtists = topArtists.where((a) => a.isNewDiscovery).toList();
    final singlePlayGems = topArtists.where((a) => a.qualifiedPlays == 1).toList();
    final discoveryRatio = topArtists.isNotEmpty ? newArtists.length / topArtists.length : 0.0;

    final discovery = DiscoveryStat(
      newArtistsCount: newArtists.length,
      totalArtistsCount: topArtists.length,
      newRatio: discoveryRatio,
      newFoundGems: singlePlayGems,
      topNewArtist: newArtists.isNotEmpty ? newArtists.first : null,
    );

    // Geography (F12, sorted by unique track count desc)
    final geography = <CountryStat>[];
    countryTracks.forEach((cCode, trackSet) {
      final ms = countryMs[cCode] ?? 0;
      geography.add(CountryStat(
        countryCode: cCode,
        countryName: _countryName(cCode),
        uniqueTrackCount: trackSet.length,
        listenedMs: ms,
        flagEmoji: _countryFlag(cCode),
      ));
    });
    geography.sort((a, b) => b.uniqueTrackCount.compareTo(a.uniqueTrackCount));

    // Decades (F13)
    final decades = DecadesStat(
      twentiesMs: twentiesMs,
      tensMs: tensMs,
      thousandsMs: thousandsMs,
      classicsMs: classicsMs,
    );

    // Loyalty Timeline (F14)
    LoyaltyStat? loyalty;
    if (allTimeIndex != null && topArtists.isNotEmpty) {
      final top1 = topArtists.first;
      final firstPlay = allTimeIndex.firstQualifiedPlayByArtist[top1.artistName.toLowerCase()];
      if (firstPlay != null) {
        final days = period.endWall.difference(firstPlay).inDays;
        if (days >= 30) {
          loyalty = LoyaltyStat(
            artistName: top1.artistName,
            firstPlayDate: firstPlay,
            daysLoyal: days,
          );
        }
      }
    }

    // Marathon Detector (gaps <= 5 min, min 30 min duration)
    final marathon = bestMarathon;

    // First Song of Period
    SongStat? firstSong;
    final fEvt = firstEvent;
    if (fEvt != null && songLookup.containsKey(fEvt.trackId)) {
      firstSong = songLookup[fEvt.trackId];
    }

    // Offline data saved (160 kbps = 20,000 bytes/sec)
    final offlineBytes = ((offlineListenedMs / 1000) * (160 * 1024 / 8)).round();
    final completionRate = totalStarts > 0 ? naturalEnds / totalStarts : 0.0;

    // Languages Bar (min 60% coverage across played events)
    final languages = <LanguageStat>[];
    if (totalStarts > 0 && (totalEventsWithKnownLanguage / totalStarts) >= 0.60 && languageMs.isNotEmpty) {
      final totalKnownMs = languageMs.values.fold<int>(0, (s, v) => s + v);
      if (totalKnownMs > 0) {
        final sorted = languageMs.entries.toList()
          ..sort((a, b) => b.value.compareTo(a.value));
        final top4 = sorted.take(4).toList();
        var otherMs = 0;
        var otherSongs = 0;
        if (sorted.length > 4) {
          for (var i = 4; i < sorted.length; i++) {
            otherMs += sorted[i].value;
            otherSongs += languageTracks[sorted[i].key]?.length ?? 0;
          }
        }
        for (final entry in top4) {
          languages.add(LanguageStat(
            language: entry.key,
            listenedMs: entry.value,
            songCount: languageTracks[entry.key]?.length ?? 0,
            percentage: (entry.value / totalKnownMs) * 100.0,
          ));
        }
        if (otherMs > 0) {
          languages.add(LanguageStat(
            language: 'Other',
            listenedMs: otherMs,
            songCount: otherSongs,
            percentage: (otherMs / totalKnownMs) * 100.0,
          ));
        }
      }
    }

    return ReplayAggregate(
      period: period,
      totalListenedMs: totalListenedMs,
      totalQualifiedPlays: totalQualifiedPlays,
      totalStarts: totalStarts,
      topArtists: topArtists,
      topSongs: topSongs,
      topAlbums: topAlbums,
      topComposers: topComposers,
      topSingers: topSingers,
      topMovie: topMovie,
      daypart: daypartStat,
      dayOfWeekMinutes: dayOfWeekMs.map((k, v) => MapEntry(k, (v / 60000).round())),
      heatmapDays: heatmapMs.map((k, v) => MapEntry(k, (v / 60000).round())),
      dayTopSongs: dayTopSongs,
      loops: loops,
      heavyRotation: heavyRotation,
      skips: skips,
      discovery: discovery,
      geography: geography,
      decades: decades,
      loyalty: loyalty,
      offlineDataSavedBytes: offlineBytes,
      completionRate: completionRate,
      marathon: marathon,
      firstSongOfPeriod: firstSong,
      languages: languages,
      previousPeriod: previousPeriod,
    );
  }

  static String _countryName(String code) {
    switch (code.toUpperCase()) {
      case 'IN':
        return 'India';
      case 'US':
        return 'United States';
      case 'GB':
        return 'United Kingdom';
      case 'CA':
        return 'Canada';
      case 'KR':
        return 'South Korea';
      case 'JP':
        return 'Japan';
      default:
        return code;
    }
  }

  static String _countryFlag(String code) {
    switch (code.toUpperCase()) {
      case 'IN':
        return '🇮🇳';
      case 'US':
        return '🇺🇸';
      case 'GB':
        return '🇬🇧';
      case 'CA':
        return '🇨🇦';
      case 'KR':
        return '🇰🇷';
      case 'JP':
        return '🇯🇵';
      default:
        return '🌍';
    }
  }
}

class _SongAcc {
  _SongAcc({
    required this.trackId,
    required this.title,
    required this.artistRaw,
    this.albumId,
    this.albumTitle,
    this.durationMs,
  });

  final String trackId;
  final String title;
  final String artistRaw;
  final String? albumId;
  final String? albumTitle;
  final int? durationMs;

  int listenedMs = 0;
  int qualifiedPlays = 0;
  int totalStarts = 0;
  int skips = 0;
}

class _ArtistAcc {
  _ArtistAcc({required this.displayName});

  final String displayName;
  int listenedMs = 0;
  int qualifiedPlays = 0;
  final Set<String> trackIds = {};
}

class _AlbumAcc {
  _AlbumAcc({required this.id, required this.title, required this.artistRaw});

  final String id;
  final String title;
  final String artistRaw;
  int listenedMs = 0;
  int qualifiedPlays = 0;
  final Set<String> distinctTrackIds = {};
}

class _RoleAcc {
  _RoleAcc({required this.displayName});

  final String displayName;
  int listenedMs = 0;
  int qualifiedPlays = 0;
  final Set<String> trackIds = {};
}

extension _PeriodContainsUtc on ReplayPeriod {
  bool containsLocalUtc(DateTime utc) {
    // Convert UTC to period interval comparison
    return !utc.isBefore(startWall) && utc.isBefore(endWall);
  }
}

class _ArtistKey {
  const _ArtistKey(this.name, this.lowerKey);
  final String name;
  final String lowerKey;
}
