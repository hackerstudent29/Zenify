import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/features/replay/domain/replay_aggregate.dart';
import 'package:mobile/features/replay/domain/replay_period.dart';
import 'package:mobile/features/replay/domain/services/weekly_digest_service.dart';
import 'package:mobile/features/replay/presentation/widgets/completion_focus_card.dart';
import 'package:mobile/features/replay/presentation/widgets/first_song_card.dart';
import 'package:mobile/features/replay/presentation/widgets/languages_bar_card.dart';
import 'package:mobile/features/replay/presentation/widgets/listener_personality_card.dart';
import 'package:mobile/features/replay/presentation/widgets/marathon_session_card.dart';

ReplayAggregate _createMockAggregate({
  int totalListenedMs = 18000000, // 300 min = 5 hours
  int totalQualifiedPlays = 60,
  double completionRate = 0.88,
  MarathonSession? marathon,
  SongStat? firstSong,
  List<LanguageStat> languages = const [],
  int nightMs = 0,
}) {
  return ReplayAggregate(
    period: ReplayPeriod.month(DateTime.utc(2026, 11, 1)),
    totalListenedMs: totalListenedMs,
    totalQualifiedPlays: totalQualifiedPlays,
    totalStarts: totalQualifiedPlays + 5,
    topArtists: const [
      ArtistStat(
        artistName: 'Anirudh Ravichander',
        listenedMs: 9000000,
        qualifiedPlays: 30,
        trackCount: 8,
      ),
      ArtistStat(
        artistName: 'A.R. Rahman',
        listenedMs: 5000000,
        qualifiedPlays: 15,
        trackCount: 5,
      ),
    ],
    topSongs: const [
      SongStat(
        trackId: 'hukum_01',
        title: 'Hukum',
        artistRaw: 'Anirudh Ravichander',
        albumTitle: 'Jailer',
        listenedMs: 400000,
        durationMs: 200000,
        qualifiedPlays: 8,
      ),
      SongStat(
        trackId: 'badass_02',
        title: 'Badass',
        artistRaw: 'Anirudh Ravichander',
        albumTitle: 'Leo',
        listenedMs: 360000,
        durationMs: 230000,
        qualifiedPlays: 6,
      ),
    ],
    topAlbums: const [],
    topComposers: const [],
    topSingers: const [],
    daypart: DaypartStat(
      morningMs: 4000000,
      afternoonMs: 4000000,
      eveningMs: 4000000,
      nightMs: nightMs,
      peakHour: 20,
      hourlyMs: List.filled(24, 0),
    ),
    dayOfWeekMinutes: const {},
    heatmapDays: const {},
    dayTopSongs: const {},
    loops: const [],
    heavyRotation: const [],
    skips: const [
      SkipStat(
        trackId: 'skip_01',
        title: 'Skipped Track',
        artistRaw: 'Some Artist',
        skipCount: 4,
        totalStarts: 5,
        skipRate: 0.8,
      ),
    ],
    discovery: const DiscoveryStat(
      totalArtistsCount: 12,
      newArtistsCount: 4,
      newRatio: 0.33,
    ),
    geography: const [],
    decades: const DecadesStat(
      twentiesMs: 0,
      tensMs: 0,
      thousandsMs: 0,
      classicsMs: 0,
    ),
    offlineDataSavedBytes: 15000000,
    completionRate: completionRate,
    marathon: marathon,
    firstSongOfPeriod: firstSong,
    languages: languages,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Phase 11: Add-ons & Weekly Replay Digest', () {
    test('F27: WeeklyDigestService date math, title, body, and storage', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();

      // Wednesday Nov 18, 2026 -> Next Sunday is Nov 22, 2026 at 20:00:00
      final wednesday = DateTime(2026, 11, 18, 14, 30);
      final sundayTarget = WeeklyDigestService.getNextSunday8PM(wednesday);

      expect(sundayTarget.weekday, equals(DateTime.sunday));
      expect(sundayTarget.day, equals(22));
      expect(sundayTarget.hour, equals(20));
      expect(sundayTarget.minute, equals(0));

      // Sunday Nov 22 at 18:00 (before 8 PM) -> Today at 20:00
      final sundayBefore8 = DateTime(2026, 11, 22, 18, 0);
      final sameDayTarget = WeeklyDigestService.getNextSunday8PM(sundayBefore8);
      expect(sameDayTarget.day, equals(22));
      expect(sameDayTarget.hour, equals(20));

      // Sunday Nov 22 at 21:00 (after 8 PM) -> Next Sunday Nov 29 at 20:00
      final sundayAfter8 = DateTime(2026, 11, 22, 21, 0);
      final nextWeekTarget = WeeklyDigestService.getNextSunday8PM(sundayAfter8);
      expect(nextWeekTarget.day, equals(29));
      expect(nextWeekTarget.hour, equals(20));

      // Message generation
      final agg = _createMockAggregate();
      final title = WeeklyDigestService.buildDigestTitle();
      expect(title, contains('Ready'));

      final body = WeeklyDigestService.buildDigestBody(agg);
      expect(body, contains('Anirudh Ravichander'));
      expect(body, contains('5.0h this week'));

      // Schedule into prefs
      final scheduled = await WeeklyDigestService.scheduleWeeklyDigest(
        weekAggregate: agg,
        now: wednesday,
        prefs: prefs,
      );
      expect(scheduled, isTrue);
      expect(prefs.getInt(WeeklyDigestService.lastScheduledKey), equals(sundayTarget.millisecondsSinceEpoch));
    });

    testWidgets('MarathonSessionCard renders runtime and consecutive tracks if >= 30 min', (tester) async {
      final marathon = MarathonSession(
        startUtc: DateTime.utc(2026, 11, 14, 18, 0),
        endUtc: DateTime.utc(2026, 11, 14, 21, 15),
        durationMinutes: 195, // 3h 15m
        songCount: 42,
        topSongTitle: 'Hukum',
        tzOffsetMin: 330, // IST (+5:30)
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: MarathonSessionCard(marathon: marathon),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('LONGEST LISTENING MARATHON'), findsOneWidget);
      expect(find.text('3h 15m'), findsOneWidget);
      expect(find.text('unbroken listening'), findsOneWidget);
      expect(find.text('42 consecutive tracks'), findsOneWidget);
      expect(find.textContaining('Hukum'), findsOneWidget);

      // Verify hide when < 30 min
      final shortMarathon = MarathonSession(
        startUtc: DateTime.utc(2026, 11, 14, 18, 0),
        endUtc: DateTime.utc(2026, 11, 14, 18, 20),
        durationMinutes: 20,
        songCount: 5,
        tzOffsetMin: 0,
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: MarathonSessionCard(marathon: shortMarathon),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('LONGEST LISTENING MARATHON'), findsNothing);
    });

    testWidgets('LanguagesBarCard renders segmented breakdown when languages are present', (tester) async {
      const languages = [
        LanguageStat(language: 'Tamil', listenedMs: 600000, songCount: 15, percentage: 60.0),
        LanguageStat(language: 'Hindi', listenedMs: 300000, songCount: 8, percentage: 30.0),
        LanguageStat(language: 'English', listenedMs: 100000, songCount: 3, percentage: 10.0),
      ];

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: LanguagesBarCard(languages: languages),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('LANGUAGES'), findsOneWidget);
      expect(find.text('Tamil · 60%'), findsOneWidget);
      expect(find.text('Hindi · 30%'), findsOneWidget);
      expect(find.text('English · 10%'), findsOneWidget);

      // Verify hide when empty
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: LanguagesBarCard(languages: []),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('LANGUAGES'), findsNothing);
    });

    testWidgets('CompletionFocusCard renders focus badge and completion rate', (tester) async {
      final highFocusAgg = _createMockAggregate(completionRate: 0.92);

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: CompletionFocusCard(aggregate: highFocusAgg),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('LISTENING FOCUS & COMPLETION'), findsOneWidget);
      expect(find.text('92%'), findsOneWidget);
      expect(find.text('DEEP IMMERSION'), findsOneWidget);
      expect(find.text('NATURAL FINISHES'), findsOneWidget);
      expect(find.text('SKIP RATE'), findsOneWidget);
    });

    testWidgets('FirstSongCard renders first song details and triggers onPlaySong', (tester) async {
      const song = SongStat(
        trackId: 'first_track',
        title: 'Chaleya',
        artistRaw: 'Anirudh Ravichander, Arijit Singh',
        albumTitle: 'Jawan',
        listenedMs: 200000,
        durationMs: 200000,
        qualifiedPlays: 5,
      );

      SongStat? playedSong;

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: FirstSongCard(
              firstSong: song,
              onPlaySong: (s) => playedSong = s,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('HOW IT STARTED'), findsOneWidget);
      expect(find.text('Chaleya'), findsOneWidget);
      expect(find.text('Anirudh Ravichander, Arijit Singh'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.play_arrow_rounded));
      await tester.pumpAndSettle();

      expect(playedSong, equals(song));

      // Verify hide when null
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: FirstSongCard(firstSong: null),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('HOW IT STARTED'), findsNothing);
    });

    testWidgets('ListenerPersonalityCard computes and renders deterministic archetype', (tester) async {
      // Midnight Melodist (nightMs >= 40%)
      final nightAgg = _createMockAggregate(nightMs: 9000000); // 9M / 18M = 50%

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: ListenerPersonalityCard(aggregate: nightAgg),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('LISTENER PERSONALITY'), findsOneWidget);
      expect(find.text('MIDNIGHT MELODIST'), findsOneWidget);
      expect(find.textContaining('after 10 PM'), findsOneWidget);
    });
  });
}
