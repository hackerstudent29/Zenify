import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/features/replay/data/exclusion_store.dart';
import 'package:mobile/features/replay/domain/all_time_index.dart';
import 'package:mobile/features/replay/domain/replay_aggregate.dart';
import 'package:mobile/features/replay/domain/replay_period.dart';
import 'package:mobile/features/replay/presentation/widgets/milestone_moments_card.dart';
import 'package:mobile/features/replay/presentation/widgets/milestones_trophy_room.dart';
import 'package:mobile/features/replay/presentation/widgets/offline_data_saved_card.dart';
import 'package:mobile/features/replay/presentation/widgets/private_listening_sheet.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  ReplayAggregate createSampleAggregate({
    int totalMins = 1200,
    int totalPlays = 150,
    int offlineBytes = 50 * 1024 * 1024,
    String dominantDaypart = 'Night',
    int consecutiveLoopRuns = 4,
  }) {
    return ReplayAggregate(
      period: ReplayPeriod(
        kind: PeriodKind.month,
        startWall: DateTime.utc(2025, 1, 1),
        endWall: DateTime.utc(2025, 2, 1),
      ),
      totalListenedMs: totalMins * 60000,
      totalQualifiedPlays: totalPlays,
      totalStarts: totalPlays + 10,
      topArtists: const [],
      topSongs: const [],
      topAlbums: const [],
      topComposers: const [],
      topSingers: const [],
      daypart: DaypartStat(
        morningMs: dominantDaypart == 'Morning' ? 36000000 : 3600000,
        afternoonMs: 3600000,
        eveningMs: 7200000,
        nightMs: dominantDaypart == 'Night' ? 36000000 : 3600000,
        peakHour: 23,
        hourlyMs: List.filled(24, 0),
      ),
      dayOfWeekMinutes: {1: 100, 2: 120, 3: 90, 4: 150, 5: 200, 6: 250, 7: 300},
      heatmapDays: const {},
      dayTopSongs: const {},
      loops: [
        LoopStat(
          trackId: 'loop_1',
          title: 'Hukum',
          artistRaw: 'Anirudh',
          consecutiveRuns: consecutiveLoopRuns,
        ),
      ],
      heavyRotation: const [
        SongStat(
          trackId: 'hr_1',
          title: 'Hukum',
          artistRaw: 'Anirudh',
          listenedMs: 1800000,
          qualifiedPlays: 6,
        ),
      ],
      skips: const [],
      discovery: const DiscoveryStat(
        newArtistsCount: 5,
        totalArtistsCount: 20,
        newRatio: 0.25,
      ),
      decades: const DecadesStat(
        twentiesMs: 36000000,
        tensMs: 18000000,
        thousandsMs: 9000000,
        classicsMs: 9000000,
      ),
      offlineDataSavedBytes: offlineBytes,
      completionRate: 0.85,
      marathon: MarathonSession(
        startUtc: DateTime.utc(2025, 1, 15, 10),
        endUtc: DateTime.utc(2025, 1, 15, 11, 30),
        durationMinutes: 90,
        songCount: 22,
        tzOffsetMin: 330,
      ),
    );
  }

  group('Phase 7: F15 MilestonesTrophyRoom', () {
    testWidgets('evaluates badges and renders unlocked and progress states',
        (tester) async {
      final agg = createSampleAggregate(
        totalMins: 1200,
        totalPlays: 150,
        dominantDaypart: 'Night',
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: MilestonesTrophyRoom(aggregate: agg),
            ),
          ),
        ),
      );

      expect(find.text('TROPHY ROOM & BADGES'), findsOneWidget);
      expect(find.text('1,000 Minutes Club'), findsOneWidget);
      expect(find.text('Century Club'), findsOneWidget);
      expect(find.text('Night Owl'), findsOneWidget);
      expect(find.text('Heavy Rotation'), findsOneWidget);
      expect(find.text('Marathoner'), findsOneWidget);
      expect(find.text('7-Day Streak'), findsOneWidget);

      // Verify category filter tab changes displayed badges
      await tester.tap(find.text('Listening Time'));
      await tester.pump();
      expect(find.text('1,000 Minutes Club'), findsOneWidget);
      expect(find.text('10,000 Minutes Legend'), findsOneWidget);
      expect(find.text('Century Club'), findsNothing); // filtered out
    });
  });

  group('Phase 7: F16 MilestoneMomentsCard', () {
    testWidgets('supports two tabs (Unique Songs vs Total Plays) with milestone marks',
        (tester) async {
      final allTimeIndex = AllTimeIndex(
        totalQualifiedPlays: 120,
        uniqueSongMarks: [
          MilestoneMark(
            n: 1,
            trackId: 'track_1',
            trackTitle: 'First Melody',
            artistRaw: 'Ilaiyaraaja',
            utc: DateTime.utc(2024, 1, 1),
            tzOffsetMin: 330,
          ),
          MilestoneMark(
            n: 10,
            trackId: 'track_10',
            trackTitle: 'Tenth Song',
            artistRaw: 'A.R. Rahman',
            utc: DateTime.utc(2024, 2, 1),
            tzOffsetMin: 330,
          ),
        ],
        totalPlayMarks: [
          MilestoneMark(
            n: 1,
            trackId: 'track_1',
            trackTitle: 'First Ever Play',
            artistRaw: 'Ilaiyaraaja',
            utc: DateTime.utc(2024, 1, 1),
            tzOffsetMin: 330,
          ),
          MilestoneMark(
            n: 100,
            trackId: 'track_100',
            trackTitle: 'Centennial Anthem',
            artistRaw: 'Anirudh',
            utc: DateTime.utc(2024, 8, 14),
            tzOffsetMin: 330,
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: MilestoneMomentsCard(allTimeIndex: allTimeIndex),
            ),
          ),
        ),
      );

      // Tab A (Unique Songs) default
      expect(find.text('MILESTONE MOMENTS'), findsOneWidget);
      expect(find.text('First Melody'), findsOneWidget);
      expect(find.text('Tenth Song'), findsOneWidget);

      // Switch to Tab B (Total Plays)
      await tester.tap(find.text('Total Plays & Repeats'));
      await tester.pump();

      expect(find.text('First Ever Play'), findsOneWidget);
      expect(find.text('Centennial Anthem'), findsOneWidget);
      expect(find.text('First Melody'), findsNothing); // from Tab A
    });
  });

  group('Phase 7: F25 OfflineDataSavedCard', () {
    testWidgets('renders data saved in GB / MB calculated at 160 kbps',
        (tester) async {
      const gigabyteBytes = 2576980377; // 2.4 GB

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: OfflineDataSavedCard(bytesSaved: gigabyteBytes),
          ),
        ),
      );

      expect(find.text('DATA SAVED OFFLINE'), findsOneWidget);
      expect(find.text('2.4 GB'), findsOneWidget);
      expect(find.text('mobile data conserved'), findsOneWidget);
    });

    testWidgets('hides cleanly when bytes saved is below 10 MB', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: OfflineDataSavedCard(bytesSaved: 5 * 1024 * 1024), // 5 MB < 10 MB
          ),
        ),
      );

      expect(find.text('DATA SAVED OFFLINE'), findsNothing);
    });
  });

  group('Phase 7: F26 PrivateListeningSheet', () {
    testWidgets('manages excluded tracks and playlists without deletion',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final store = ExclusionStore(prefs: prefs);
      await store.init();

      await store.excludeTrack('annoying_song_123');

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: PrivateListeningSheet(exclusionStore: store),
            ),
          ),
        ),
      );

      expect(find.text('PRIVATE LISTENING'), findsOneWidget);
      expect(find.text('annoying_song_123'), findsOneWidget);
      expect(find.text('1 excluded'), findsOneWidget);

      // Tap unexclude (delete icon)
      await tester.tap(find.byIcon(Icons.delete_outline_rounded));
      await tester.pump();

      expect(store.trackIds.contains('annoying_song_123'), isFalse);
    });
  });
}
