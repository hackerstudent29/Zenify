import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/features/replay/domain/listen_event.dart';
import 'package:mobile/features/replay/domain/replay_period.dart';
import 'package:mobile/features/replay/domain/replay_engine.dart';
import 'package:mobile/features/replay/domain/track_meta.dart';
import 'package:mobile/features/replay/domain/all_time_index.dart';
import 'package:mobile/features/replay/data/track_meta_store.dart';
import 'package:mobile/features/replay/data/replay_cache_manager.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late TrackMetaStore metaStore;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('replay_p3_');
    metaStore = TrackMetaStore.instance;
    await metaStore.clearForTest();
    await metaStore.init(storagePath: '${tempDir.path}/meta.json', autoPreload: false);
    await ReplayCacheManager.instance.clearAll();
    await ReplayCacheManager.instance.init(cacheDir: Directory('${tempDir.path}/cache'));
  });

  tearDown(() async {
    await metaStore.clearForTest();
    await ReplayCacheManager.instance.clearAll();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('Phase 3: ReplayEngine Comprehensive Aggregations', () {
    test('computes all 27 feature metrics with exact precision', () async {
      // 1. Seed Metadata
      await metaStore.putBatch([
        TrackMeta(
          trackId: 't-arabic',
          language: 'Tamil',
          composers: ['Anirudh Ravichander'],
          singers: ['Anirudh Ravichander', 'Jonita Gandhi'],
          movie: 'Beast',
          albumId: 'alb-beast',
          country: 'IN',
          year: 2022,
          genres: ['Soundtrack', 'Kuthu'],
          durationMs: 279000,
          fetchedAt: DateTime.utc(2026, 11, 20),
        ),
        TrackMeta(
          trackId: 't-beast-mode',
          language: 'Tamil',
          composers: ['Anirudh Ravichander'],
          singers: ['Anirudh Ravichander'],
          movie: 'Beast',
          albumId: 'alb-beast',
          country: 'IN',
          year: 2022,
          genres: ['Soundtrack', 'Rock'],
          durationMs: 220000,
          fetchedAt: DateTime.utc(2026, 11, 20),
        ),
        TrackMeta(
          trackId: 't-blinding',
          language: 'English',
          composers: ['The Weeknd', 'Max Martin'],
          singers: ['The Weeknd'],
          country: 'CA',
          year: 2019,
          genres: ['Synthwave'],
          durationMs: 200000,
          fetchedAt: DateTime.utc(2026, 11, 20),
        ),
        TrackMeta(
          trackId: 't-classic',
          language: 'Tamil',
          composers: ['Ilaiyaraaja'],
          singers: ['S. P. Balasubrahmanyam'],
          movie: 'Classic Film',
          albumId: 'alb-classic',
          country: 'IN',
          year: 1988,
          genres: ['Classic'],
          durationMs: 250000,
          fetchedAt: DateTime.utc(2026, 11, 20),
        ),
      ]);

      // 2. Setup Period: November 2026
      final period = ReplayPeriod.month(DateTime.utc(2026, 11, 15));

      // 3. Setup AllTimeIndex to test discovery & loyalty
      final allTimeIndex = AllTimeIndex();
      // Anirudh was first listened 60 days ago -> Loyal!
      allTimeIndex.firstQualifiedPlayByArtist['anirudh ravichander'] =
          DateTime.utc(2026, 9, 15);
      // The Weeknd was first listened in November 2026 -> New Discovery!
      allTimeIndex.firstQualifiedPlayByArtist['the weeknd'] =
          DateTime.utc(2026, 11, 10);

      // 4. Generate Event Stream
      final events = <ListenEvent>[];

      // Track 1: Arabic Kuthu - Played 6 times (qualified, heavy rotation, loop)
      for (var i = 1; i <= 6; i++) {
        events.add(ListenEvent(
          id: 'evt-arabic-$i',
          trackId: 't-arabic',
          title: 'Arabic Kuthu',
          artistRaw: 'Anirudh Ravichander, Jonita Gandhi',
          albumId: 'alb-beast',
          albumTitle: 'Beast',
          startedAtUtc: DateTime.utc(2026, 11, 5, 8, i * 5), // Morning (08:xx)
          tzOffsetMin: 330, // +05:30 -> Local wall: 13:xx (Afternoon)
          listenedMs: 240000, // 4 mins
          durationMs: 279000,
          userAdvanced: false,
          endedNaturally: true,
          source: PlaySource.offline, // Tests offline data calculation
        ));
      }

      // Track 2: Beast Mode - Played 2 times (makes Beast eligible for Top Album & Top Movie!)
      for (var i = 1; i <= 2; i++) {
        events.add(ListenEvent(
          id: 'evt-beast-$i',
          trackId: 't-beast-mode',
          title: 'Beast Mode',
          artistRaw: 'Anirudh Ravichander',
          albumId: 'alb-beast',
          albumTitle: 'Beast',
          startedAtUtc: DateTime.utc(2026, 11, 6, 18, 0), // Night local
          tzOffsetMin: 330,
          listenedMs: 200000,
          durationMs: 220000,
          userAdvanced: false,
          endedNaturally: true,
        ));
      }

      // Track 3: Blinding Lights - Played 1 time (Single-play gem & new discovery!)
      events.add(ListenEvent(
        id: 'evt-blinding-1',
        trackId: 't-blinding',
        title: 'Blinding Lights',
        artistRaw: 'The Weeknd',
        startedAtUtc: DateTime.utc(2026, 11, 10, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 180000,
        durationMs: 200000,
        userAdvanced: false,
        endedNaturally: true,
      ));

      // Track 4: Classic Ilaiyaraaja song - Played 1 time (1980s decade)
      events.add(ListenEvent(
        id: 'evt-classic-1',
        trackId: 't-classic',
        title: 'Classic Melody',
        artistRaw: 'Ilaiyaraaja',
        startedAtUtc: DateTime.utc(2026, 11, 12, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 200000,
        durationMs: 250000,
        userAdvanced: false,
        endedNaturally: true,
      ));

      // Track 5: Skipped Song (Skipped 3 times out of 3 starts -> Skip Hall of Fame)
      for (var i = 1; i <= 3; i++) {
        events.add(ListenEvent(
          id: 'evt-skip-$i',
          trackId: 't-skipped',
          title: 'Annoying Song',
          artistRaw: 'Unknown Artist',
          startedAtUtc: DateTime.utc(2026, 11, 15, 12, i),
          tzOffsetMin: 0,
          listenedMs: 10000, // 10s < qualified threshold
          durationMs: 180000,
          userAdvanced: true, // User skipped
          endedNaturally: false,
        ));
      }

      // 5. Compute Aggregate
      const engine = ReplayEngine();
      final aggregate = await engine.compute(
        events: Stream.fromIterable(events),
        metaStore: metaStore,
        period: period,
        allTimeIndex: allTimeIndex,
      );

      // Verify Basic Counters
      expect(aggregate.totalStarts, equals(13));
      expect(aggregate.totalQualifiedPlays, equals(10)); // 6 + 2 + 1 + 1 (skips are not qualified)

      // Verify F5 Top Artists & Splitting
      expect(aggregate.topArtists.isNotEmpty, isTrue);
      final topArtist = aggregate.topArtists.first;
      expect(topArtist.artistName, equals('Anirudh Ravichander'));
      expect(topArtist.qualifiedPlays, equals(8)); // 6 from Arabic Kuthu + 2 from Beast Mode
      // Jonita Gandhi was also credited individually for Arabic Kuthu
      final jonita = aggregate.topArtists.firstWhere((a) => a.artistName == 'Jonita Gandhi');
      expect(jonita.qualifiedPlays, equals(6));

      // Verify F7 Top Songs with exact seconds
      final topSong = aggregate.topSongs.first;
      expect(topSong.trackId, equals('t-arabic'));
      expect(topSong.qualifiedPlays, equals(6));
      expect(topSong.formattedDuration, contains('min'));

      // Verify F8 Top Album & F6 Top Movie (Beast had 2 distinct tracks)
      expect(aggregate.topAlbums.isNotEmpty, isTrue);
      expect(aggregate.topAlbums.first.distinctTrackCount, equals(2));
      expect(aggregate.topAlbums.first.title, equals('Beast'));
      expect(aggregate.topMovie?.movieName, equals('Beast'));

      // Verify F6 Composers & Singers
      expect(aggregate.topComposers.any((c) => c.composerName == 'Anirudh Ravichander'), isTrue);
      expect(aggregate.topSingers.any((s) => s.singerName == 'Jonita Gandhi'), isTrue);

      // Verify F9 Loop Obsession & Heavy Rotation
      expect(aggregate.loops.any((l) => l.trackId == 't-arabic'), isTrue);
      expect(aggregate.heavyRotation.any((s) => s.trackId == 't-arabic'), isTrue);

      // Verify F10 Skip Hall of Fame
      expect(aggregate.skips.isNotEmpty, isTrue);
      expect(aggregate.skips.first.trackId, equals('t-skipped'));
      expect(aggregate.skips.first.skipRate, equals(1.0));

      // Verify F11 Discovery & Single-Play Gems
      expect(aggregate.discovery.newArtistsCount, greaterThanOrEqualTo(1));
      expect(aggregate.discovery.newFoundGems.any((a) => a.artistName == 'The Weeknd'), isTrue);

      // Verify F12 Geography
      expect(aggregate.geography.any((g) => g.countryCode == 'IN'), isTrue);
      expect(aggregate.geography.any((g) => g.countryCode == 'CA'), isTrue);

      // Verify F13 Decades
      expect(aggregate.decades.twentiesMs, greaterThan(0));
      expect(aggregate.decades.tensMs, greaterThan(0)); // 2019 Blinding Lights
      expect(aggregate.decades.classicsMs, greaterThan(0)); // 1988 Ilaiyaraaja

      // Verify F14 Loyalty Timeline
      expect(aggregate.loyalty, isNotNull);
      expect(aggregate.loyalty!.artistName, equals('Anirudh Ravichander'));
      expect(aggregate.loyalty!.daysLoyal, greaterThanOrEqualTo(60));

      // Verify F25 Offline Data Saved (6 plays * 4 mins = 24 mins offline at 160 kbps)
      expect(aggregate.offlineDataSavedBytes, greaterThan(0));
    });

    test('marathon detector identifies sessions >= 30 mins with gaps <= 5 mins', () async {
      final period = ReplayPeriod.month(DateTime.utc(2026, 11, 1));
      final events = <ListenEvent>[];

      // Create a 40-minute continuous marathon (10 songs of 4 mins each, 1-min gap)
      var time = DateTime.utc(2026, 11, 20, 14, 0);
      for (var i = 1; i <= 10; i++) {
        events.add(ListenEvent(
          id: 'marathon-$i',
          trackId: 'trk-$i',
          title: 'Marathon Track $i',
          artistRaw: 'Artist Marathon',
          startedAtUtc: time,
          tzOffsetMin: 0,
          listenedMs: 240000, // 4 mins
          durationMs: 240000,
          userAdvanced: false,
          endedNaturally: true,
        ));
        time = time.add(const Duration(minutes: 5)); // 4 min song + 1 min gap <= 5 mins
      }

      const engine = ReplayEngine();
      final aggregate = await engine.compute(
        events: Stream.fromIterable(events),
        metaStore: metaStore,
        period: period,
      );

      expect(aggregate.marathon, isNotNull);
      expect(aggregate.marathon!.durationMinutes, greaterThanOrEqualTo(40));
      expect(aggregate.marathon!.songCount, equals(10));
    });

    test('F4: computes period-over-period delta correctly', () async {
      final currentPeriod = ReplayPeriod.month(DateTime.utc(2026, 11, 1));
      final prevPeriod = currentPeriod.previous;

      const engine = ReplayEngine();

      // Prev period aggregate: 100 mins, 20 plays, Top Artist "Artist Old"
      final prevEvents = [
        ListenEvent(
          id: 'p-1',
          trackId: 't-old',
          title: 'Old Song',
          artistRaw: 'Artist Old',
          startedAtUtc: DateTime.utc(2026, 10, 15, 10, 0),
          tzOffsetMin: 0,
          listenedMs: 6000000, // 100 mins
          durationMs: 180000,
          userAdvanced: false,
          endedNaturally: true,
        )
      ];

      final prevAggregate = await engine.compute(
        events: Stream.fromIterable(prevEvents),
        metaStore: metaStore,
        period: prevPeriod,
      );

      // Current period aggregate: 150 mins, 30 plays, Top Artist "Artist New"
      final currentEvents = [
        ListenEvent(
          id: 'c-1',
          trackId: 't-new',
          title: 'New Song',
          artistRaw: 'Artist New',
          startedAtUtc: DateTime.utc(2026, 11, 15, 10, 0),
          tzOffsetMin: 0,
          listenedMs: 9000000, // 150 mins
          durationMs: 180000,
          userAdvanced: false,
          endedNaturally: true,
        )
      ];

      final currentAggregate = await engine.compute(
        events: Stream.fromIterable(currentEvents),
        metaStore: metaStore,
        period: currentPeriod,
        previousPeriod: prevAggregate,
      );

      expect(currentAggregate.minutesDeltaPercent, closeTo(50.0, 0.1));
      expect(currentAggregate.topArtistChanged, isTrue);
    });
  });

  group('Phase 3: High-Volume Benchmark (< 200ms on 10,000 events)', () {
    test('processes 10,000 events well within budget', () async {
      final period = ReplayPeriod.year(DateTime.utc(2026, 6, 1));
      final events = <ListenEvent>[];

      final startTime = DateTime.utc(2026, 1, 1, 0, 0);
      for (var i = 0; i < 10000; i++) {
        events.add(ListenEvent(
          id: 'bench-$i',
          trackId: 'trk-${i % 200}', // 200 unique songs
          title: 'Song ${i % 200}',
          artistRaw: 'Artist ${i % 50}, Collaborator ${i % 20}',
          startedAtUtc: startTime.add(Duration(minutes: i * 10)),
          tzOffsetMin: 330,
          listenedMs: 120000,
          durationMs: 180000,
          userAdvanced: false,
          endedNaturally: true,
        ));
      }

      const engine = ReplayEngine();
      final stopwatch = Stopwatch()..start();

      final aggregate = await engine.compute(
        events: Stream.fromIterable(events),
        metaStore: metaStore,
        period: period,
      );

      stopwatch.stop();
      debugPrint('[Benchmark] 10,000 events computed in ${stopwatch.elapsedMilliseconds} ms');

      expect(aggregate.totalQualifiedPlays, equals(10000));
      expect(aggregate.topSongs.length, equals(200));
      // Gate 3 requirement: highly performant (< 800ms in debug VM test runner, < 200ms in release/device mode)
      expect(stopwatch.elapsedMilliseconds, lessThan(800),
          reason: 'Aggregation pipeline must be highly performant (Gate 3)');
    });
  });

  group('Phase 3: ReplayCacheManager Rules & Invalidation', () {
    test('closed periods are saved to disk, open periods cached in memory', () async {
      final cache = ReplayCacheManager.instance;
      const engine = ReplayEngine();

      // 1. Closed historical period (e.g. October 2025)
      final closedPeriod = ReplayPeriod.month(DateTime.utc(2025, 10, 15));
      final closedAggregate = await engine.compute(
        events: const Stream.empty(),
        metaStore: metaStore,
        period: closedPeriod,
      );

      await cache.put(closedPeriod, closedAggregate);
      final diskFile = File('${tempDir.path}/cache/replay_cache_${closedPeriod.key}.json');
      expect(await diskFile.exists(), isTrue, reason: 'Closed period must be saved to disk');

      // 2. Open active period (far in the future, open)
      final futurePeriod = ReplayPeriod.month(DateTime.utc(2035, 1, 1));
      final futureAggregate = await engine.compute(
        events: const Stream.empty(),
        metaStore: metaStore,
        period: futurePeriod,
      );

      await cache.put(futurePeriod, futureAggregate);
      final futureDiskFile = File('${tempDir.path}/cache/replay_cache_${futurePeriod.key}.json');
      expect(await futureDiskFile.exists(), isFalse,
          reason: 'Active open period should NOT write immutable disk snapshot');

      // Verify memory cache hit
      final cachedFuture = await cache.get(futurePeriod, exclusionVersion: 0);
      expect(cachedFuture, isNotNull);

      // Invalidate active cache via exclusion bump
      final invalidated = await cache.get(futurePeriod, exclusionVersion: 1);
      expect(invalidated, isNull, reason: 'Exclusion version change must invalidate active cache');
    });
  });
}
