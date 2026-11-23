import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/features/replay/domain/listen_event.dart';
import 'package:mobile/features/replay/domain/replay_period.dart';
import 'package:mobile/features/replay/domain/all_time_index.dart';
import 'package:mobile/features/replay/data/exclusion_store.dart';
import 'package:mobile/features/replay/data/replay_journal_reader.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Phase 1: ListenEvent Canonical Definitions & Pure Functions', () {
    test('isQualifiedPlay: respects min(30,000ms, 50% of durationMs)', () {
      // 1. Long song: duration 200,000ms (50% is 100,000ms, min is 30,000ms)
      final longSongShortPlay = ListenEvent(
        id: 'evt-1',
        trackId: 'trk-1',
        title: 'Long Song',
        artistRaw: 'Artist A',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 29999,
        durationMs: 200000,
        userAdvanced: true,
        endedNaturally: false,
      );
      expect(longSongShortPlay.isQualifiedPlay, isFalse);

      final longSongQualifiedPlay = ListenEvent(
        id: 'evt-2',
        trackId: 'trk-1',
        title: 'Long Song',
        artistRaw: 'Artist A',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 30000,
        durationMs: 200000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(longSongQualifiedPlay.isQualifiedPlay, isTrue);

      // 2. Short song / Interlude: duration 40,000ms (50% is 20,000ms < 30,000ms)
      final shortSongShortPlay = ListenEvent(
        id: 'evt-3',
        trackId: 'trk-2',
        title: 'Short Interlude',
        artistRaw: 'Artist B',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 19999,
        durationMs: 40000,
        userAdvanced: true,
        endedNaturally: false,
      );
      expect(shortSongShortPlay.isQualifiedPlay, isFalse);

      final shortSongQualifiedPlay = ListenEvent(
        id: 'evt-4',
        trackId: 'trk-2',
        title: 'Short Interlude',
        artistRaw: 'Artist B',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 20000,
        durationMs: 40000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(shortSongQualifiedPlay.isQualifiedPlay, isTrue);
    });

    test('isCompleted: endedNaturally or >= 90% duration', () {
      // Natural end with short listen (e.g. preview mode or skipped forward)
      final naturalEnd = ListenEvent(
        id: 'evt-5',
        trackId: 'trk-3',
        title: 'Song',
        artistRaw: 'Artist C',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 15000,
        durationMs: 100000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(naturalEnd.isCompleted, isTrue);

      // User advanced at 89.9%
      final notCompleted = ListenEvent(
        id: 'evt-6',
        trackId: 'trk-3',
        title: 'Song',
        artistRaw: 'Artist C',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 89900,
        durationMs: 100000,
        userAdvanced: true,
        endedNaturally: false,
      );
      expect(notCompleted.isCompleted, isFalse);

      // User advanced at 90.0%
      final completedByThreshold = ListenEvent(
        id: 'evt-7',
        trackId: 'trk-3',
        title: 'Song',
        artistRaw: 'Artist C',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 90000,
        durationMs: 100000,
        userAdvanced: true,
        endedNaturally: false,
      );
      expect(completedByThreshold.isCompleted, isTrue);
    });

    test('isSkip: userAdvanced AND listenedMs < qualified threshold', () {
      final skipped = ListenEvent(
        id: 'evt-8',
        trackId: 'trk-4',
        title: 'Skipped Song',
        artistRaw: 'Artist D',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 12000,
        durationMs: 180000,
        userAdvanced: true,
        endedNaturally: false,
      );
      expect(skipped.isSkip, isTrue);

      // Advanced AFTER qualified threshold (not a skip, user enjoyed it for 45s)
      final advancedAfterThreshold = ListenEvent(
        id: 'evt-9',
        trackId: 'trk-4',
        title: 'Listened Song',
        artistRaw: 'Artist D',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 45000,
        durationMs: 180000,
        userAdvanced: true,
        endedNaturally: false,
      );
      expect(advancedAfterThreshold.isSkip, isFalse);

      // Not advanced by user (e.g. app paused or closed)
      final notAdvanced = ListenEvent(
        id: 'evt-10',
        trackId: 'trk-4',
        title: 'Interrupted Song',
        artistRaw: 'Artist D',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 10000,
        durationMs: 180000,
        userAdvanced: false,
        endedNaturally: false,
      );
      expect(notAdvanced.isSkip, isFalse);
    });

    test('localWall and localDayKey calculation with timezone offset', () {
      // 2026-11-22 23:30:00 UTC with +05:30 (+330 min) -> 2026-11-23 05:00:00
      final event = ListenEvent(
        id: 'evt-11',
        trackId: 'trk-5',
        title: 'Midnight Shift',
        artistRaw: 'Artist E',
        startedAtUtc: DateTime.utc(2026, 11, 22, 23, 30),
        tzOffsetMin: 330,
        listenedMs: 60000,
        durationMs: 180000,
        userAdvanced: false,
        endedNaturally: true,
      );

      expect(event.localWall, equals(DateTime.utc(2026, 11, 23, 5, 0)));
      expect(event.localDayKey, equals('2026-11-23'));
    });

    test('JSON serialization round-trip & v1 -> v2 migration tolerance', () {
      final original = ListenEvent(
        id: 'evt-12',
        trackId: 'trk-6',
        title: 'Arabic Kuthu',
        artistRaw: 'Anirudh Ravichander, Jonita Gandhi',
        albumId: 'alb-1',
        albumTitle: 'Beast',
        startedAtUtc: DateTime.utc(2026, 11, 20, 15, 30),
        tzOffsetMin: 330,
        endedAtUtc: DateTime.utc(2026, 11, 20, 15, 34),
        listenedMs: 240000,
        durationMs: 240000,
        userAdvanced: false,
        endedNaturally: true,
        loopOne: true,
        source: PlaySource.offline,
        contextType: ContextType.playlist,
        contextId: 'pl-favs',
        schemaVersion: 2,
      );

      final json = original.toJson();
      final restored = ListenEvent.fromJson(json);

      expect(restored.id, equals(original.id));
      expect(restored.trackId, equals(original.trackId));
      expect(restored.title, equals(original.title));
      expect(restored.artistRaw, equals(original.artistRaw));
      expect(restored.albumId, equals(original.albumId));
      expect(restored.albumTitle, equals(original.albumTitle));
      expect(restored.startedAtUtc, equals(original.startedAtUtc));
      expect(restored.tzOffsetMin, equals(original.tzOffsetMin));
      expect(restored.listenedMs, equals(original.listenedMs));
      expect(restored.durationMs, equals(original.durationMs));
      expect(restored.userAdvanced, equals(original.userAdvanced));
      expect(restored.endedNaturally, equals(original.endedNaturally));
      expect(restored.loopOne, isTrue);
      expect(restored.source, equals(PlaySource.offline));
      expect(restored.contextType, equals(ContextType.playlist));
      expect(restored.contextId, equals('pl-favs'));
      expect(restored.schemaVersion, equals(2));

      // Test v1 json compatibility
      final v1Json = {
        'id': 'evt-v1',
        'trackId': 'trk-old',
        'title': 'Old Track',
        'artistRaw': 'Old Artist',
        'startedAtUtc': '2026-10-01T12:00:00.000Z',
        'tzOffsetMin': 0,
        'listenedMs': 45000,
        'durationMs': 180000,
        'userAdvanced': false,
        'endedNaturally': true,
      };

      final migrated = ListenEvent.fromJson(v1Json);
      expect(migrated.id, equals('evt-v1'));
      expect(migrated.source, equals(PlaySource.stream));
      expect(migrated.loopOne, isFalse);
      expect(migrated.contextType, equals(ContextType.none));
      expect(migrated.contextId, isNull);
      expect(migrated.schemaVersion, equals(1));
    });
  });

  group('Phase 1: ReplayPeriod Wall-Clock Interval Math', () {
    test('week period aligns to Monday and computes previous week', () {
      // 2026-11-22 is Sunday (weekday = 7)
      final sunday = DateTime.utc(2026, 11, 22, 14, 30);
      final period = ReplayPeriod.week(sunday);

      expect(period.kind, equals(PeriodKind.week));
      expect(period.startWall, equals(DateTime.utc(2026, 11, 16, 0, 0, 0)));
      expect(period.endWall, equals(DateTime.utc(2026, 11, 23, 0, 0, 0)));
      expect(period.key, equals('W-2026-11-16'));

      final prev = period.previous;
      expect(prev.kind, equals(PeriodKind.week));
      expect(prev.startWall, equals(DateTime.utc(2026, 11, 9, 0, 0, 0)));
      expect(prev.endWall, equals(DateTime.utc(2026, 11, 16, 0, 0, 0)));
      expect(prev.key, equals('W-2026-11-09'));
    });

    test('month period handles standard and year-rollover previous months', () {
      final march = DateTime.utc(2026, 3, 15);
      final marchPeriod = ReplayPeriod.month(march);

      expect(marchPeriod.kind, equals(PeriodKind.month));
      expect(marchPeriod.startWall, equals(DateTime.utc(2026, 3, 1)));
      expect(marchPeriod.endWall, equals(DateTime.utc(2026, 4, 1)));
      expect(marchPeriod.key, equals('M-2026-03'));

      // Rollover from January to December of previous year
      final jan = DateTime.utc(2026, 1, 10);
      final janPeriod = ReplayPeriod.month(jan);
      final prevMonth = janPeriod.previous;

      expect(prevMonth.startWall, equals(DateTime.utc(2025, 12, 1)));
      expect(prevMonth.endWall, equals(DateTime.utc(2026, 1, 1)));
      expect(prevMonth.key, equals('M-2025-12'));
    });

    test('year period handles previous calendar year', () {
      final date = DateTime.utc(2026, 8, 20);
      final yearPeriod = ReplayPeriod.year(date);

      expect(yearPeriod.kind, equals(PeriodKind.year));
      expect(yearPeriod.startWall, equals(DateTime.utc(2026, 1, 1)));
      expect(yearPeriod.endWall, equals(DateTime.utc(2027, 1, 1)));
      expect(yearPeriod.key, equals('Y-2026'));

      final prevYear = yearPeriod.previous;
      expect(prevYear.startWall, equals(DateTime.utc(2025, 1, 1)));
      expect(prevYear.endWall, equals(DateTime.utc(2026, 1, 1)));
      expect(prevYear.key, equals('Y-2025'));
    });

    test('contains: strictly [startWall, endWall) half-open interval', () {
      final period = ReplayPeriod(
        kind: PeriodKind.month,
        startWall: DateTime(2026, 11, 1),
        endWall: DateTime(2026, 12, 1),
      );

      // Event exactly at startWall
      final atStart = ListenEvent(
        id: '1',
        trackId: 't1',
        title: 'T1',
        artistRaw: 'A1',
        startedAtUtc: DateTime.utc(2026, 11, 1, 0, 0),
        tzOffsetMin: 0,
        listenedMs: 40000,
        durationMs: 120000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(period.contains(atStart), isTrue);

      // Event 1 millisecond before endWall
      final beforeEnd = ListenEvent(
        id: '2',
        trackId: 't2',
        title: 'T2',
        artistRaw: 'A2',
        startedAtUtc: DateTime.utc(2026, 11, 30, 23, 59, 59, 999),
        tzOffsetMin: 0,
        listenedMs: 40000,
        durationMs: 120000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(period.contains(beforeEnd), isTrue);

      // Event exactly at endWall (exclusive)
      final atEnd = ListenEvent(
        id: '3',
        trackId: 't3',
        title: 'T3',
        artistRaw: 'A3',
        startedAtUtc: DateTime.utc(2026, 12, 1, 0, 0),
        tzOffsetMin: 0,
        listenedMs: 40000,
        durationMs: 120000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(period.contains(atEnd), isFalse);
    });
  });

  group('Phase 1: ExclusionStore Read-Time Exclusions & Versioning', () {
    test('toggling tracks, playlists, and session ranges marks events correctly', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final store = ExclusionStore(prefs: prefs);
      await store.init();

      final initialVersion = store.version;

      // 1. Track Exclusion
      expect(store.isTrackExcluded('trk-exclude'), isFalse);
      await store.toggleTrackExclusion('trk-exclude');
      expect(store.isTrackExcluded('trk-exclude'), isTrue);
      expect(store.version, equals(initialVersion + 1));

      final excludedTrackEvent = ListenEvent(
        id: 'e1',
        trackId: 'trk-exclude',
        title: 'White Noise',
        artistRaw: 'Sleep Sounds',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 60000,
        durationMs: 60000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(store.isExcluded(excludedTrackEvent), isTrue);

      // 2. Playlist Exclusion
      await store.togglePlaylistExclusion('pl-study');
      expect(store.isPlaylistExcluded('pl-study'), isTrue);

      final playlistEvent = ListenEvent(
        id: 'e2',
        trackId: 'trk-lofi',
        title: 'Lo-Fi Chill',
        artistRaw: 'Lofi Girl',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 60000,
        durationMs: 60000,
        userAdvanced: false,
        endedNaturally: true,
        contextType: ContextType.playlist,
        contextId: 'pl-study',
      );
      expect(store.isExcluded(playlistEvent), isTrue);

      // 3. Private Session Range Exclusion
      final rangeStart = DateTime.utc(2026, 11, 20, 22, 0);
      final rangeEnd = DateTime.utc(2026, 11, 21, 2, 0);
      await store.addPrivateSession(TimeRange(startUtc: rangeStart, endUtc: rangeEnd));

      final insidePrivateSession = ListenEvent(
        id: 'e3',
        trackId: 'trk-clean',
        title: 'Secret Song',
        artistRaw: 'Artist X',
        startedAtUtc: DateTime.utc(2026, 11, 20, 23, 0),
        tzOffsetMin: 0,
        listenedMs: 60000,
        durationMs: 60000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(store.isExcluded(insidePrivateSession), isTrue);

      final outsidePrivateSession = ListenEvent(
        id: 'e4',
        trackId: 'trk-clean',
        title: 'Secret Song',
        artistRaw: 'Artist X',
        startedAtUtc: DateTime.utc(2026, 11, 21, 5, 0),
        tzOffsetMin: 0,
        listenedMs: 60000,
        durationMs: 60000,
        userAdvanced: false,
        endedNaturally: true,
      );
      expect(store.isExcluded(outsidePrivateSession), isFalse);
    });
  });

  group('Phase 1: AllTimeIndex Idempotent Accumulator & Milestones', () {
    test('apply() tracks unique song marks and total play marks without duplicating', () {
      final index = AllTimeIndex();

      final event1 = ListenEvent(
        id: 'evt-unique-1',
        trackId: 'trk-100',
        title: 'Vaathi Coming',
        artistRaw: 'Anirudh Ravichander, Gana Balachandar',
        startedAtUtc: DateTime.utc(2026, 1, 1, 10, 0),
        tzOffsetMin: 330,
        listenedMs: 60000,
        durationMs: 220000,
        userAdvanced: false,
        endedNaturally: true,
      );

      final applied = index.apply(event1);
      expect(applied, isTrue);

      expect(index.totalQualifiedPlays, equals(1));
      expect(index.uniqueSongMarks.length, equals(1));
      expect(index.uniqueSongMarks.first.n, equals(1));
      expect(index.uniqueSongMarks.first.trackTitle, equals('Vaathi Coming'));
      expect(index.totalPlayMarks.length, equals(1));
      expect(index.totalPlayMarks.first.n, equals(1));

      // Check artist splitting in all time index (stored in lowercase for case-insensitivity)
      expect(index.firstQualifiedPlayByArtist.containsKey('anirudh ravichander'), isTrue);
      expect(index.firstQualifiedPlayByArtist.containsKey('gana balachandar'), isTrue);

      // Re-applying same event ID should be idempotent
      final duplicateApplied = index.apply(event1);
      expect(duplicateApplied, isFalse);
      expect(index.totalQualifiedPlays, equals(1));
      expect(index.totalListenedMs, equals(60000));
      expect(index.uniqueSongMarks.length, equals(1));
    });

    test('rebuildFrom matches incremental stream updates', () async {
      final events = <ListenEvent>[];
      for (var i = 1; i <= 15; i++) {
        events.add(ListenEvent(
          id: 'batch-evt-$i',
          trackId: 'track-${i % 5}', // 5 distinct songs
          title: 'Title ${i % 5}',
          artistRaw: 'Artist $i',
          startedAtUtc: DateTime.utc(2026, 1, i, 12, 0),
          tzOffsetMin: 0,
          listenedMs: 40000,
          durationMs: 180000,
          userAdvanced: false,
          endedNaturally: true,
        ));
      }

      // 1. Build incrementally
      final incrementalIndex = AllTimeIndex();
      for (final e in events) {
        incrementalIndex.apply(e);
      }

      // 2. Build via rebuildFrom stream
      final rebuiltIndex = await AllTimeIndex.rebuildFrom(Stream.fromIterable(events));

      expect(rebuiltIndex.totalQualifiedPlays, equals(incrementalIndex.totalQualifiedPlays));
      expect(rebuiltIndex.totalListenedMs, equals(incrementalIndex.totalListenedMs));
      expect(rebuiltIndex.uniqueSongMarks.length, equals(incrementalIndex.uniqueSongMarks.length));
      expect(rebuiltIndex.totalPlayMarks.length, equals(incrementalIndex.totalPlayMarks.length));
      expect(rebuiltIndex.firstQualifiedPlayByTrack.length,
          equals(incrementalIndex.firstQualifiedPlayByTrack.length));
    });
  });

  group('Phase 1: ReplayJournalReader & Stream Processing', () {
    late Directory tempDir;
    late File testFile;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('replay_test_');
      testFile = File('${tempDir.path}/test_journal.jsonl');
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('skips corrupt lines and parses valid JSON lines seamlessly', () async {
      final e1 = ListenEvent(
        id: 'valid-1',
        trackId: 't-1',
        title: 'Song 1',
        artistRaw: 'Artist 1',
        startedAtUtc: DateTime.utc(2026, 11, 20, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 50000,
        durationMs: 150000,
        userAdvanced: false,
        endedNaturally: true,
      );

      final e2 = ListenEvent(
        id: 'valid-2',
        trackId: 't-2',
        title: 'Song 2',
        artistRaw: 'Artist 2',
        startedAtUtc: DateTime.utc(2026, 11, 20, 11, 0),
        tzOffsetMin: 0,
        listenedMs: 50000,
        durationMs: 150000,
        userAdvanced: false,
        endedNaturally: true,
      );

      final contents = [
        jsonEncode(e1.toJson()),
        'CORRUPT_NON_JSON_LINE {{{',
        '', // empty line
        jsonEncode(e2.toJson()),
        '{"partial_json": true', // truncated JSON
      ].join('\n');

      await testFile.writeAsString(contents);

      const reader = ReplayJournalReader();
      final readEvents = await reader.readEvents(testFile).toList();

      expect(readEvents.length, equals(2));
      expect(readEvents[0].id, equals('valid-1'));
      expect(readEvents[1].id, equals('valid-2'));
    });

    test('ReplayEventSource.eligible enforces period and read-time exclusions', () async {
      final period = ReplayPeriod(
        kind: PeriodKind.month,
        startWall: DateTime(2026, 11, 1),
        endWall: DateTime(2026, 12, 1),
      );

      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final exclusionStore = ExclusionStore(prefs: prefs);
      await exclusionStore.init();
      await exclusionStore.toggleTrackExclusion('t-excluded');

      final insideEligible = ListenEvent(
        id: 'in-1',
        trackId: 't-clean',
        title: 'Clean',
        artistRaw: 'Artist',
        startedAtUtc: DateTime.utc(2026, 11, 15, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 40000,
        durationMs: 120000,
        userAdvanced: false,
        endedNaturally: true,
      );

      final insideExcluded = ListenEvent(
        id: 'in-2',
        trackId: 't-excluded',
        title: 'Excluded',
        artistRaw: 'Artist',
        startedAtUtc: DateTime.utc(2026, 11, 15, 11, 0),
        tzOffsetMin: 0,
        listenedMs: 40000,
        durationMs: 120000,
        userAdvanced: false,
        endedNaturally: true,
      );

      final outsidePeriod = ListenEvent(
        id: 'out-1',
        trackId: 't-clean',
        title: 'Clean',
        artistRaw: 'Artist',
        startedAtUtc: DateTime.utc(2026, 10, 15, 10, 0),
        tzOffsetMin: 0,
        listenedMs: 40000,
        durationMs: 120000,
        userAdvanced: false,
        endedNaturally: true,
      );

      // Write events to journal file for ReplayEventSource
      final journalContent = [
        jsonEncode(insideEligible.toJson()),
        jsonEncode(insideExcluded.toJson()),
        jsonEncode(outsidePeriod.toJson()),
      ].join('\n');
      await testFile.writeAsString(journalContent);

      final eligibleEvents = await ReplayEventSource.eligible(
        journalFile: testFile,
        period: period,
        exclusions: exclusionStore,
      ).toList();

      expect(eligibleEvents.length, equals(1));
      expect(eligibleEvents.first.id, equals('in-1'));
    });
  });
}
