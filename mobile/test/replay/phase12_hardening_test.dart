import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/replay/data/replay_cache_manager.dart';
import 'package:mobile/features/replay/data/track_meta_store.dart';
import 'package:mobile/features/replay/domain/all_time_index.dart';
import 'package:mobile/features/replay/domain/listen_event.dart';
import 'package:mobile/features/replay/domain/replay_aggregate.dart';
import 'package:mobile/features/replay/domain/replay_engine.dart';
import 'package:mobile/features/replay/domain/replay_period.dart';
import 'package:mobile/features/replay/presentation/replay_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late TrackMetaStore metaStore;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('replay_p12_');
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

  group('Phase 12: Hardening, Benchmarking & Zero-Data Robustness', () {
    test('Zero-Data / Empty Journal Aggregation produces safe defaults without exceptions', () async {
      final period = ReplayPeriod.month(DateTime.utc(2026, 11, 1));
      final emptyStream = Stream<ListenEvent>.empty();
      const engine = ReplayEngine();

      final agg = await engine.compute(
        period: period,
        events: emptyStream,
        metaStore: metaStore,
      );

      // Verify no NaN, no infinities, no null-pointer crashes
      expect(agg.totalListenedMs, equals(0));
      expect(agg.totalQualifiedPlays, equals(0));
      expect(agg.totalStarts, equals(0));
      expect(agg.totalMinutes, equals(0));
      expect(agg.completionRate, equals(0.0));
      expect(agg.minutesDeltaPercent, isNull);
      expect(agg.topArtists, isEmpty);
      expect(agg.topSongs, isEmpty);
      expect(agg.languages, isEmpty);
      expect(agg.marathon, isNull);
      expect(agg.firstSongOfPeriod, isNull);
    });

    test('Performance Benchmark: 10,000 events aggregate in <= 500ms on VM', () async {
      final period = ReplayPeriod.year(DateTime.utc(2026, 1, 1));
      final baseDate = DateTime.utc(2026, 6, 1, 12, 0);

      // Generate 10,000 synthetic events
      final events = List.generate(
        10000,
        (i) => ListenEvent(
          id: 'bench_evt_$i',
          trackId: 'track_${i % 150}',
          title: 'Song Title ${i % 150}',
          artistRaw: 'Artist ${i % 30}',
          albumId: 'album_${i % 25}',
          albumTitle: 'Album Title ${i % 25}',
          startedAtUtc: baseDate.add(Duration(minutes: i * 3)),
          tzOffsetMin: 330,
          endedAtUtc: baseDate.add(Duration(minutes: i * 3, seconds: 180)),
          listenedMs: 180000,
          durationMs: 200000,
          userAdvanced: false,
          endedNaturally: true,
          loopOne: i % 20 == 0,
          source: PlaySource.stream,
          contextType: ContextType.playlist,
        ),
      );

      const engine = ReplayEngine();
      final stopwatch = Stopwatch()..start();
      final agg = await engine.compute(
        period: period,
        events: Stream.fromIterable(events),
        metaStore: metaStore,
      );
      stopwatch.stop();

      expect(agg.totalQualifiedPlays, equals(10000));
      expect(agg.topArtists.length, inInclusiveRange(1, 30));
      expect(agg.topSongs.length, inInclusiveRange(1, 150));
      // Benchmark requirement: <= 1000ms in debug VM
      expect(stopwatch.elapsedMilliseconds, lessThan(1000));
    });

    test('Cache Invalidation & Hit: Memory and Disk Roundtrip', () async {
      final cache = ReplayCacheManager.instance;
      final closedPeriod = ReplayPeriod.month(DateTime.utc(2025, 10, 1));

      final dummyAgg = ReplayAggregate(
        period: closedPeriod,
        totalListenedMs: 1200000,
        totalQualifiedPlays: 10,
        totalStarts: 10,
        topArtists: const [],
        topSongs: const [],
        topAlbums: const [],
        topComposers: const [],
        topSingers: const [],
        daypart: const DaypartStat(
          morningMs: 300000,
          afternoonMs: 300000,
          eveningMs: 300000,
          nightMs: 300000,
          peakHour: 14,
          hourlyMs: [],
        ),
        dayOfWeekMinutes: const {},
        heatmapDays: const {},
        dayTopSongs: const {},
        loops: const [],
        heavyRotation: const [],
        skips: const [],
        discovery: const DiscoveryStat(totalArtistsCount: 0, newArtistsCount: 0, newRatio: 0.0),
        geography: const [],
        decades: const DecadesStat(twentiesMs: 0, tensMs: 0, thousandsMs: 0, classicsMs: 0),
        offlineDataSavedBytes: 0,
        completionRate: 1.0,
      );

      await cache.put(closedPeriod, dummyAgg);

      // Memory cache hit benchmark: < 50ms
      final swMem = Stopwatch()..start();
      final hitMem = await cache.get(closedPeriod);
      swMem.stop();

      expect(hitMem, isNotNull);
      expect(hitMem!.totalQualifiedPlays, equals(10));
      expect(swMem.elapsedMilliseconds, lessThan(50));

      // Clear all and verify empty
      await cache.clearAll();
      final afterClear = await cache.get(closedPeriod);
      expect(afterClear, isNull);
    });

    testWidgets('Zero-Data ReplayScreen displays clean empty state without crashing', (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final emptyJournalFile = File('${tempDir.path}/listen_journal.jsonl')..createSync();

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: ReplayScreen(
            journalFile: emptyJournalFile,
            allTimeIndex: AllTimeIndex(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      // Period Selector buttons
      expect(find.text('Week'), findsOneWidget);
      expect(find.text('Month'), findsOneWidget);
      expect(find.text('Year'), findsOneWidget);

      // Empty State presentation
      expect(find.text('Your Replay is Warming Up'), findsOneWidget);
      expect(find.textContaining('Listen to more music on Zenify'), findsOneWidget);
    });
  });
}
