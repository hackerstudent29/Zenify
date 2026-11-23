import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/playback_context.dart';
import 'package:mobile/features/replay/domain/replay_aggregate.dart';
import 'package:mobile/features/replay/domain/replay_period.dart';
import 'package:mobile/features/replay/domain/services/replay_archive_service.dart';
import 'package:mobile/features/replay/domain/services/replay_mix_service.dart';
import 'package:mobile/features/replay/presentation/archive/replay_archive_sheet.dart';
import 'package:mobile/features/replay/presentation/quiz/replay_quiz_screen.dart';
import 'package:mobile/features/replay/presentation/story/story_walkthrough_screen.dart';

ReplayAggregate _createMockAggregate({
  int totalListenedMs = 1200000,
  int totalQualifiedPlays = 40,
  int topSongPlays = 12,
  int nightMs = 0,
  double completionRate = 0.90,
  double discoveryRatio = 0.20,
  int consecutiveLoopRuns = 1,
}) {
  return ReplayAggregate(
    period: ReplayPeriod.month(DateTime.utc(2026, 11, 1)),
    totalListenedMs: totalListenedMs,
    totalQualifiedPlays: totalQualifiedPlays,
    totalStarts: totalQualifiedPlays + 2,
    topArtists: const [
      ArtistStat(
        artistName: 'Anirudh Ravichander',
        listenedMs: 600000,
        qualifiedPlays: 20,
        trackCount: 5,
      ),
      ArtistStat(
        artistName: 'A.R. Rahman',
        listenedMs: 300000,
        qualifiedPlays: 10,
        trackCount: 3,
      ),
      ArtistStat(
        artistName: 'Yuvan Shankar Raja',
        listenedMs: 200000,
        qualifiedPlays: 6,
        trackCount: 2,
      ),
      ArtistStat(
        artistName: 'Harris Jayaraj',
        listenedMs: 100000,
        qualifiedPlays: 4,
        trackCount: 2,
      ),
    ],
    topSongs: [
      SongStat(
        trackId: 'hukum_01',
        title: 'Hukum',
        artistRaw: 'Anirudh Ravichander',
        albumTitle: 'Jailer',
        listenedMs: 360000,
        qualifiedPlays: topSongPlays,
        durationMs: 210000,
      ),
      const SongStat(
        trackId: 'badass_02',
        title: 'Badass',
        artistRaw: 'Anirudh Ravichander',
        albumTitle: 'Leo',
        listenedMs: 240000,
        qualifiedPlays: 8,
        durationMs: 230000,
      ),
    ],
    topAlbums: const [],
    topComposers: const [],
    topSingers: const [],
    daypart: DaypartStat(
      morningMs: 300000,
      afternoonMs: 300000,
      eveningMs: 300000,
      nightMs: nightMs,
      peakHour: 23,
      hourlyMs: List.filled(24, 50000),
    ),
    dayOfWeekMinutes: {1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10},
    heatmapDays: {'2026-11-15': 20},
    dayTopSongs: {},
    loops: [
      LoopStat(
        trackId: 'hukum_01',
        title: 'Hukum',
        artistRaw: 'Anirudh Ravichander',
        consecutiveRuns: consecutiveLoopRuns,
      ),
    ],
    heavyRotation: const [],
    skips: const [],
    discovery: DiscoveryStat(
      newArtistsCount: (discoveryRatio * 10).round(),
      totalArtistsCount: 10,
      newRatio: discoveryRatio,
    ),
    geography: const [],
    decades: const DecadesStat(
      twentiesMs: 800000,
      tensMs: 200000,
      thousandsMs: 100000,
      classicsMs: 100000,
    ),
    offlineDataSavedBytes: 15000000,
    completionRate: completionRate,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Phase 9: Delight Features (F19 - F22)', () {
    test('F22 ReplayMixService builds playable tracks and context', () {
      final agg = _createMockAggregate();
      final tracks = ReplayMixService.buildMixTracks(agg, limit: 10);

      expect(tracks.length, equals(2));
      expect(tracks[0].id, equals('hukum_01'));
      expect(tracks[0].title, equals('Hukum'));
      expect(tracks[0].artist, equals('Anirudh Ravichander'));
      expect(tracks[0].durationSeconds, equals(210));

      final context = ReplayMixService.buildMixContext(agg);
      expect(context.type, equals(PlaybackContextType.queueOnly));
      expect(context.id, contains('replay_M-2026-11'));
      expect(context.tracks.length, equals(2));
    });

    test(
      'F21 ReplayArchiveService saves, loads, lists, and deletes snapshots atomically',
      () async {
        final tempDir = Directory.systemTemp.createTempSync(
          'zenify_replay_archive_test_',
        );
        addTearDown(() {
          try {
            tempDir.deleteSync(recursive: true);
          } catch (_) {}
        });

        final service = ReplayArchiveService(customDirectory: tempDir);
        final agg = _createMockAggregate();

        // Initially empty
        var list = await service.listSnapshots();
        expect(list, isEmpty);

        // Save snapshot
        await service.saveSnapshot(agg);

        // Verify file exists
        final savedFile = File('${tempDir.path}/${agg.period.key}.json');
        expect(savedFile.existsSync(), isTrue);

        // List snapshots
        list = await service.listSnapshots();
        expect(list.length, equals(1));
        expect(list.first.periodKey, equals('M-2026-11'));
        expect(list.first.topSongTitle, equals('Hukum'));
        expect(list.first.uniqueSongs, equals(2));

        // Load snapshot
        final loaded = await service.loadSnapshot('M-2026-11');
        expect(loaded, isNotNull);
        expect(loaded!.totalListenedMs, equals(agg.totalListenedMs));
        expect(
          loaded.topArtists.first.artistName,
          equals('Anirudh Ravichander'),
        );

        // Delete snapshot
        final deleted = await service.deleteSnapshot('M-2026-11');
        expect(deleted, isTrue);
        expect(savedFile.existsSync(), isFalse);
      },
    );

    test(
      'F19 StoryPersonality computes correct deterministic personality rules',
      () {
        // 1. Midnight Melodist: lateNightMs >= 40%
        final nightAgg = _createMockAggregate(
          totalListenedMs: 1000000,
          nightMs: 450000, // 45%
        );
        final p1 = StoryPersonality.compute(nightAgg);
        expect(p1.name, equals('Midnight Melodist'));
        expect(p1.reason, contains('45%'));

        // 2. Loyal Looper: consecutive loop >= 5
        final loopAgg = _createMockAggregate(
          totalListenedMs: 1000000,
          consecutiveLoopRuns: 6,
        );
        final p2 = StoryPersonality.compute(loopAgg);
        expect(p2.name, equals('Loyal Looper'));

        // 3. Explorer: discovery >= 40% (with low top-song repeat to not trigger Loyal Looper)
        final exploreAgg = _createMockAggregate(
          totalListenedMs: 1000000,
          totalQualifiedPlays: 100,
          topSongPlays: 2,
          discoveryRatio: 0.50,
        );
        final p3 = StoryPersonality.compute(exploreAgg);
        expect(p3.name, equals('Explorer'));

        // 4. Beat Chaser: completion >= 85%, skip <= 8%, daytime >= 50%
        final chaserAgg = _createMockAggregate(
          totalListenedMs: 1000000,
          totalQualifiedPlays: 100,
          topSongPlays: 2,
          completionRate: 0.92,
          discoveryRatio: 0.10,
        );
        final p4 = StoryPersonality.compute(chaserAgg);
        expect(p4.name, equals('Beat Chaser'));
      },
    );

    testWidgets(
      'F19 StoryWalkthroughScreen renders slides and responds to navigation',
      (tester) async {
        final agg = _createMockAggregate();
        bool closed = false;

        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData.dark(),
            home: StoryWalkthroughScreen(
              snapshot: agg,
              onClose: () => closed = true,
            ),
          ),
        );

        await tester.pump();

        // Slide 1: Total Minutes & Peak Time
        expect(find.text('YOUR SOUNDTRACK'), findsOneWidget);
        expect(find.text('MINUTES LISTENED'), findsOneWidget);

        // Tap right 75% to advance to Slide 2
        final size = tester.getSize(find.byType(StoryWalkthroughScreen));
        await tester.tapAt(Offset(size.width * 0.8, size.height * 0.5));
        await tester.pumpAndSettle();

        // Slide 2: Top Song
        expect(find.text('#1 SONG'), findsOneWidget);
        expect(find.text('Hukum'), findsOneWidget);

        // Tap left 20% to go back to Slide 1
        await tester.tapAt(Offset(size.width * 0.2, size.height * 0.5));
        await tester.pumpAndSettle();
        expect(find.text('YOUR SOUNDTRACK'), findsOneWidget);

        // Tap close button
        await tester.tap(find.byIcon(Icons.close_rounded));
        await tester.pump();
        expect(closed, isTrue);
      },
    );

    testWidgets('F20 ReplayQuizScreen handles clues, scoring, and answering', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final agg = _createMockAggregate();
      bool continued = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: ReplayQuizScreen(
            snapshot: agg,
            onContinue: () => continued = true,
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Initial state: clue 1 is revealed, clues 2 and 3 locked
      expect(find.text('REPLAY QUIZ'), findsOneWidget);
      expect(
        find.textContaining('You listened to this artist for'),
        findsOneWidget,
      );
      expect(find.text('REVEAL CLUE 2'), findsOneWidget);

      // Reveal Clue 2
      await tester.tap(find.text('REVEAL CLUE 2'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('different tracks from their catalog'),
        findsOneWidget,
      );

      // Select correct artist: Anirudh Ravichander (guessed after clue 2 -> 2 pts)
      await tester.tap(find.text('Anirudh Ravichander'));
      await tester.pumpAndSettle();

      expect(find.text('Spot on! +2 pts 🎯'), findsOneWidget);
      expect(find.text('CONTINUE TO REPLAY'), findsOneWidget);

      // Tap Continue
      await tester.tap(find.text('CONTINUE TO REPLAY'));
      await tester.pump();
      expect(continued, isTrue);
    });

    testWidgets(
      'F21 ReplayArchiveSheet displays saved snapshots and handles empty state',
      (tester) async {
        final tempDir = Directory.systemTemp.createTempSync(
          'zenify_archive_sheet_test_',
        );
        addTearDown(() {
          try {
            tempDir.deleteSync(recursive: true);
          } catch (_) {}
        });

        final service = ReplayArchiveService(customDirectory: tempDir);
        final agg = _createMockAggregate();
        await service.saveSnapshot(agg);

        ReplayAggregate? selectedSnap;

        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData.dark(),
            home: Scaffold(
              body: ReplayArchiveSheet(
                archiveService: service,
                currentSnapshot: agg,
                onSelectSnapshot: (s) => selectedSnap = s,
              ),
            ),
          ),
        );

        await tester.pumpAndSettle();

        // Verify header and saved snapshot card
        expect(find.text('REPLAY ARCHIVE'), findsOneWidget);
        expect(find.text('NOVEMBER 2026'), findsOneWidget);
        expect(find.text('VIEW'), findsOneWidget);

        // Tap VIEW
        await tester.tap(find.text('VIEW'));
        await tester.pumpAndSettle();

        expect(selectedSnap, isNotNull);
        expect(selectedSnap!.period.key, equals('M-2026-11'));
      },
    );
  });
}
