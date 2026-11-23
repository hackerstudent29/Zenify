import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/features/replay/domain/replay_aggregate.dart';
import 'package:mobile/features/replay/domain/replay_period.dart';
import 'package:mobile/features/replay/presentation/widgets/daypart_card.dart';
import 'package:mobile/features/replay/presentation/widgets/heatmap_calendar.dart';
import 'package:mobile/features/replay/presentation/widgets/day_detail_sheet.dart';
import 'package:mobile/features/replay/presentation/widgets/day_of_week_card.dart';
import 'package:mobile/features/replay/presentation/widgets/period_delta_pill.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget wrapWithTheme(Widget child) {
    return MaterialApp(
      theme: ThemeData.dark(),
      home: Scaffold(
        body: SingleChildScrollView(child: child),
      ),
    );
  }

  group('Phase 4: F1 DaypartCard', () {
    testWidgets('renders Night Owl personality and peak hour', (tester) async {
      final hourly = List.filled(24, 0);
      hourly[23] = 3600000; // 60 mins at 11 PM (peak)

      final daypart = DaypartStat(
        morningMs: 600000, // 10 min
        afternoonMs: 1200000, // 20 min
        eveningMs: 1800000, // 30 min
        nightMs: 5400000, // 90 min (60%) -> Night Owl!
        peakHour: 23,
        hourlyMs: hourly,
      );

      await tester.pumpWidget(wrapWithTheme(DaypartCard(daypart: daypart)));
      await tester.pumpAndSettle();

      expect(find.text('Night Owl'), findsOneWidget);
      expect(find.textContaining('Peak listening at 11 PM'), findsOneWidget);
      expect(find.text('Morning'), findsOneWidget);
      expect(find.text('Night'), findsOneWidget);
    });

    testWidgets('renders Early Bird personality when morning is dominant', (tester) async {
      final hourly = List.filled(24, 0);
      hourly[7] = 3600000; // 7 AM peak

      final daypart = DaypartStat(
        morningMs: 5400000, // 90 min (Dominant)
        afternoonMs: 600000,
        eveningMs: 600000,
        nightMs: 600000,
        peakHour: 7,
        hourlyMs: hourly,
      );

      await tester.pumpWidget(wrapWithTheme(DaypartCard(daypart: daypart)));
      await tester.pumpAndSettle();

      expect(find.text('Early Bird'), findsOneWidget);
      expect(find.textContaining('Peak listening at 7 AM'), findsOneWidget);
    });
  });

  group('Phase 4: F2 HeatmapCalendar & DayDetailSheet', () {
    testWidgets('renders month days and opens DayDetailSheet on tap', (tester) async {
      final period = ReplayPeriod.month(DateTime.utc(2026, 11, 1));
      final heatmapDays = {
        '2026-11-05': 120, // 120 min
        '2026-11-10': 45,
        '2026-11-15': 200,
      };

      final dayTopSongs = {
        '2026-11-05': const SongStat(
          trackId: 'trk-1',
          title: 'Arabic Kuthu',
          artistRaw: 'Anirudh Ravichander',
          listenedMs: 240000,
          qualifiedPlays: 5,
        ),
      };

      await tester.pumpWidget(wrapWithTheme(HeatmapCalendar(
        period: period,
        heatmapDays: heatmapDays,
        dayTopSongs: dayTopSongs,
      )));
      await tester.pumpAndSettle();

      expect(find.text('LISTENING CALENDAR'), findsOneWidget);
      expect(find.text('Daily Activity'), findsOneWidget);
      expect(find.text('3 Active Days'), findsOneWidget);

      // Tap on day 5
      final day5 = find.text('5');
      expect(day5, findsOneWidget);
      await tester.tap(day5);
      await tester.pumpAndSettle();

      // Verify DayDetailSheet opened
      expect(find.textContaining('Arabic Kuthu'), findsOneWidget);
      expect(find.textContaining('Anirudh Ravichander'), findsOneWidget);
      expect(find.text('120 min'), findsOneWidget);
    });

    testWidgets('DayDetailSheet triggers onPlaySong callback', (tester) async {
      SongStat? playedSong;
      const song = SongStat(
        trackId: 't-test',
        title: 'Naa Ready',
        artistRaw: 'Anirudh',
        listenedMs: 180000,
        qualifiedPlays: 3,
      );

      await tester.pumpWidget(wrapWithTheme(
        DayDetailSheet(
          date: DateTime.utc(2026, 11, 20),
          minutes: 45,
          topSong: song,
          onPlaySong: (s) => playedSong = s,
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Naa Ready'), findsOneWidget);
      final playBtn = find.byIcon(Icons.play_arrow_rounded);
      expect(playBtn, findsOneWidget);

      await tester.tap(playBtn);
      await tester.pumpAndSettle();

      expect(playedSong?.trackId, equals('t-test'));
    });
  });

  group('Phase 4: F3 DayOfWeekCard', () {
    testWidgets('highlights top day if >= 18% (e.g. Friday listener)', (tester) async {
      final days = {
        1: 10, // Mon
        2: 10, // Tue
        3: 10, // Wed
        4: 10, // Thu
        5: 50, // Fri -> 50 / 100 = 50% >= 18%!
        6: 5,  // Sat
        7: 5,  // Sun
      };

      await tester.pumpWidget(wrapWithTheme(DayOfWeekCard(dayOfWeekMinutes: days)));
      await tester.pumpAndSettle();

      expect(find.text("You're a Friday listener"), findsOneWidget);
      expect(find.textContaining('50% of your minutes happen on Fridays.'), findsOneWidget);
    });

    testWidgets('shows Balanced Weekly Rhythm when evenly spread', (tester) async {
      final days = {
        1: 15,
        2: 15,
        3: 15,
        4: 15,
        5: 15,
        6: 15,
        7: 15,
      };

      await tester.pumpWidget(wrapWithTheme(DayOfWeekCard(dayOfWeekMinutes: days)));
      await tester.pumpAndSettle();

      expect(find.text('Balanced Weekly Rhythm'), findsOneWidget);
    });
  });

  group('Phase 4: F4 PeriodDeltaPill', () {
    testWidgets('renders positive delta and artist shift', (tester) async {
      final prevPeriod = ReplayPeriod.month(DateTime.utc(2026, 10, 1));
      final currentPeriod = ReplayPeriod.month(DateTime.utc(2026, 11, 1));

      final prev = ReplayAggregate(
        period: prevPeriod,
        totalListenedMs: 6000000, // 100 min
        totalQualifiedPlays: 20,
        totalStarts: 25,
        topArtists: const [
          ArtistStat(artistName: 'Yuvan Shankar Raja', listenedMs: 3000000, qualifiedPlays: 10, trackCount: 5)
        ],
        topSongs: const [],
        topAlbums: const [],
        topComposers: const [],
        topSingers: const [],
        topMovie: null,
        daypart: const DaypartStat(morningMs: 0, afternoonMs: 0, eveningMs: 0, nightMs: 0, peakHour: 0, hourlyMs: []),
        dayOfWeekMinutes: const {},
        heatmapDays: const {},
        dayTopSongs: const {},
        discovery: const DiscoveryStat(newArtistsCount: 0, totalArtistsCount: 0, newRatio: 0, newFoundGems: []),
        decades: const DecadesStat(twentiesMs: 0, tensMs: 0, thousandsMs: 0, classicsMs: 0),
        offlineDataSavedBytes: 0,
        completionRate: 0.8,
      );

      final curr = ReplayAggregate(
        period: currentPeriod,
        totalListenedMs: 7200000, // 120 min (+20%)
        totalQualifiedPlays: 25,
        totalStarts: 30,
        topArtists: const [
          ArtistStat(artistName: 'Anirudh Ravichander', listenedMs: 4000000, qualifiedPlays: 12, trackCount: 6)
        ],
        topSongs: const [],
        topAlbums: const [],
        topComposers: const [],
        topSingers: const [],
        topMovie: null,
        daypart: const DaypartStat(morningMs: 0, afternoonMs: 0, eveningMs: 0, nightMs: 0, peakHour: 0, hourlyMs: []),
        dayOfWeekMinutes: const {},
        heatmapDays: const {},
        dayTopSongs: const {},
        discovery: const DiscoveryStat(newArtistsCount: 0, totalArtistsCount: 0, newRatio: 0, newFoundGems: []),
        decades: const DecadesStat(twentiesMs: 0, tensMs: 0, thousandsMs: 0, classicsMs: 0),
        offlineDataSavedBytes: 0,
        completionRate: 0.8,
        previousPeriod: prev,
      );

      await tester.pumpWidget(wrapWithTheme(PeriodDeltaPill(aggregate: curr)));
      await tester.pumpAndSettle();

      expect(find.text('▲ 20% more'), findsOneWidget);
      expect(find.textContaining('vs last month'), findsOneWidget);
      expect(find.textContaining('Top artist shifted from Yuvan Shankar Raja to Anirudh Ravichander.'), findsOneWidget);
    });

    testWidgets('renders first replay state when previousPeriod is null', (tester) async {
      final period = ReplayPeriod.month(DateTime.utc(2026, 11, 1));
      final curr = ReplayAggregate(
        period: period,
        totalListenedMs: 3600000,
        totalQualifiedPlays: 10,
        totalStarts: 12,
        topArtists: const [
          ArtistStat(artistName: 'Anirudh', listenedMs: 2000000, qualifiedPlays: 6, trackCount: 3)
        ],
        topSongs: const [],
        topAlbums: const [],
        topComposers: const [],
        topSingers: const [],
        topMovie: null,
        daypart: const DaypartStat(morningMs: 0, afternoonMs: 0, eveningMs: 0, nightMs: 0, peakHour: 0, hourlyMs: []),
        dayOfWeekMinutes: const {},
        heatmapDays: const {},
        dayTopSongs: const {},
        discovery: const DiscoveryStat(newArtistsCount: 0, totalArtistsCount: 0, newRatio: 0, newFoundGems: []),
        decades: const DecadesStat(twentiesMs: 0, tensMs: 0, thousandsMs: 0, classicsMs: 0),
        offlineDataSavedBytes: 0,
        completionRate: 0.8,
        previousPeriod: null,
      );

      await tester.pumpWidget(wrapWithTheme(PeriodDeltaPill(aggregate: curr)));
      await tester.pumpAndSettle();

      expect(find.textContaining('Welcome to your first Zenify Replay!'), findsOneWidget);
    });
  });
}
