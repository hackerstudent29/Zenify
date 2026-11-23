import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/replay/domain/models/gift_models.dart';
import 'package:mobile/features/replay/domain/models/match_models.dart';
import 'package:mobile/features/replay/domain/replay_aggregate.dart';
import 'package:mobile/features/replay/domain/replay_period.dart';
import 'package:mobile/features/replay/domain/services/gift_service.dart';
import 'package:mobile/features/replay/domain/services/replay_match_service.dart';
import 'package:mobile/features/replay/presentation/social/dedicate_song_sheet.dart';
import 'package:mobile/features/replay/presentation/social/replay_match_screen.dart';

ReplayAggregate _createMockAggregate({
  required String periodKey,
  int totalListenedMs = 18000000, // 300 mins = 5 hrs
  int totalQualifiedPlays = 100,
  int uniqueArtists = 10,
  double discoveryRatio = 0.40,
}) {
  return ReplayAggregate(
    period: ReplayPeriod.month(DateTime.utc(2026, 11, 1)),
    totalListenedMs: totalListenedMs,
    totalQualifiedPlays: totalQualifiedPlays,
    totalStarts: totalQualifiedPlays,
    topArtists: List.generate(
      uniqueArtists,
      (i) => ArtistStat(
        artistName: 'Artist $i',
        listenedMs: totalListenedMs ~/ uniqueArtists,
        qualifiedPlays: totalQualifiedPlays ~/ uniqueArtists,
        trackCount: 3,
      ),
    ),
    topSongs: List.generate(
      20,
      (i) => SongStat(
        trackId: 'track_$i',
        title: 'Song Title $i',
        artistRaw: 'Artist ${i % uniqueArtists}',
        albumTitle: 'Album $i',
        listenedMs: 180000,
        durationMs: 200000,
        qualifiedPlays: 5,
      ),
    ),
    topAlbums: const [],
    topComposers: const [],
    topSingers: const [],
    daypart: const DaypartStat(
      morningMs: 4500000,
      afternoonMs: 4500000,
      eveningMs: 4500000,
      nightMs: 4500000,
      peakHour: 18,
      hourlyMs: [],
    ),
    dayOfWeekMinutes: const {},
    heatmapDays: const {},
    dayTopSongs: const {},
    loops: const [],
    heavyRotation: const [],
    skips: const [],
    discovery: DiscoveryStat(
      totalArtistsCount: uniqueArtists,
      newArtistsCount: (uniqueArtists * discoveryRatio).round(),
      newRatio: discoveryRatio,
    ),
    geography: const [],
    decades: const DecadesStat(
      twentiesMs: 0,
      tensMs: 0,
      thousandsMs: 0,
      classicsMs: 0,
    ),
    offlineDataSavedBytes: 0,
    completionRate: 0.9,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Phase 10: Social & Viral Features', () {
    test(
      'F17: Mathematical Parity - weightedJaccard, jaccard, distOverlap',
      () {
        // 1. Weighted Jaccard
        // a = {anirudh: 0.6, yuvan: 0.4}
        // b = {anirudh: 0.4, rahman: 0.6}
        // min sum: 0.4 + 0 + 0 = 0.4
        // max sum: 0.6 + 0.4 + 0.6 = 1.6
        // result: 0.4 / 1.6 = 0.25
        final aArtists = {'anirudh': 0.6, 'yuvan': 0.4};
        final bArtists = {'anirudh': 0.4, 'rahman': 0.6};
        final wj = weightedJaccard(aArtists, bArtists);
        expect(wj, closeTo(0.25, 0.001));

        // 2. Set Jaccard
        // a = {1, 2, 3}, b = {2, 3, 4}
        // intersection = {2, 3} (2), union = {1, 2, 3, 4} (4) -> 0.5
        final aTracks = {'t1', 't2', 't3'};
        final bTracks = {'t2', 't3', 't4'};
        final sj = jaccard(aTracks, bTracks);
        expect(sj, closeTo(0.5, 0.001));

        // 3. Distribution Overlap
        // a = {morning: 0.4, evening: 0.6}
        // b = {morning: 0.3, evening: 0.7}
        // diff = |0.4-0.3| + |0.6-0.7| = 0.1 + 0.1 = 0.2
        // overlap = 1 - 0.5 * 0.2 = 0.9
        final aDaypart = {'morning': 0.4, 'evening': 0.6};
        final bDaypart = {'morning': 0.3, 'evening': 0.7};
        final do_ = distOverlap(aDaypart, bDaypart);
        expect(do_, closeTo(0.9, 0.001));
      },
    );

    test(
      'F17: ReplayMatchService buildSnapshot and computeMatch winner logic',
      () {
        final aggMe = _createMockAggregate(
          periodKey: '2026-11',
          totalListenedMs: 36000000, // 600 min (10 hours)
          uniqueArtists: 25,
          discoveryRatio: 0.60,
        );

        final aggFriend = _createMockAggregate(
          periodKey: '2026-11',
          totalListenedMs: 7200000, // 120 min (2 hours)
          uniqueArtists: 5,
          discoveryRatio: 0.10,
        );

        final snapMe = ReplayMatchService.buildSnapshot(
          aggMe,
          userId: 'user_me',
          displayName: 'Dinesh',
        );
        final snapFriend = ReplayMatchService.buildSnapshot(
          aggFriend,
          userId: 'user_friend',
          displayName: 'Priya',
        );

        expect(snapMe.totalMinutes, equals(600));
        expect(snapFriend.totalMinutes, equals(120));
        expect(snapMe.topArtists.isNotEmpty, isTrue);

        final result = ReplayMatchService.match(snapMe, snapFriend);

        expect(result.compatibilityScore, inInclusiveRange(0, 100));
        // Me has vastly higher minutes, discovery, and unique artists
        expect(result.battleScoreMe, greaterThan(0.505));
        expect(result.winner, equals('me'));
        expect(result.iWon, isTrue);
        expect(result.friendWon, isFalse);

        // Symmetrical calculation for Friend
        final reverseResult = ReplayMatchService.match(snapFriend, snapMe);
        expect(reverseResult.winner, equals('friend'));
        expect(reverseResult.friendWon, isTrue);
      },
    );

    test('F18: GiftSong note sanitization and token generation', () {
      const longNote =
          'This is an excessively long note designed to exceed the one hundred and forty character limit enforced for gifted songs in Zenify Replay and Insights so that we can verify truncation.';
      expect(longNote.length, greaterThan(140));

      final sanitized = GiftSong.sanitizeNote(longNote);
      expect(sanitized.length, equals(140));
      expect(
        GiftSong.sanitizeNote('   Clean note with spaces   '),
        equals('Clean note with spaces'),
      );

      const song = SongStat(
        trackId: 'track_badass',
        title: 'Badass',
        artistRaw: 'Anirudh Ravichander',
        albumTitle: 'Leo',
        listenedMs: 240000,
        durationMs: 240000,
        qualifiedPlays: 12,
      );

      final gift = GiftService.createGiftCard(
        song: song,
        note: 'Loved this song, thought of you!',
        senderName: 'Sanjay',
      );

      expect(gift.token.length, equals(16)); // 8 bytes hex = 16 characters
      expect(gift.title, equals('Badass'));
      expect(gift.artist, equals('Anirudh Ravichander'));
      expect(gift.senderName, equals('Sanjay'));

      final shareUrl = GiftService.generateShareUrl(gift);
      expect(shareUrl, equals('https://zenify.app/gift/${gift.token}'));
    });

    testWidgets(
      'F17: ReplayMatchScreen UI renders compatibility, winner, and comparison table',
      (tester) async {
        tester.view.physicalSize = const Size(800, 1600);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(() => tester.view.resetPhysicalSize());

        final snapMe = MatchSnapshot(
          userId: 'me',
          displayName: 'You',
          periodKey: '2026-11',
          totalMinutes: 750,
          uniqueSongsCount: 85,
          uniqueArtistsCount: 22,
          discoveryPct: 45.0,
          topArtists: const {'anirudh': 0.7, 'ar rahman': 0.3},
          topTracks: const {'t1', 't2'},
          daypartDistribution: const {'morning': 0.3, 'evening': 0.7},
        );

        final snapFriend = MatchSnapshot(
          userId: 'friend_1',
          displayName: 'Priya',
          periodKey: '2026-11',
          totalMinutes: 320,
          uniqueSongsCount: 40,
          uniqueArtistsCount: 14,
          discoveryPct: 20.0,
          topArtists: const {'anirudh': 0.5, 'harris': 0.5},
          topTracks: const {'t1', 't3'},
          daypartDistribution: const {'morning': 0.4, 'evening': 0.6},
        );

        final matchResult = computeMatch(snapMe, snapFriend);

        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData.dark(),
            home: ReplayMatchScreen(
              mySnapshot: snapMe,
              friendSnapshot: snapFriend,
              matchResult: matchResult,
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Top Bar
        expect(find.text('MUSICAL BATTLE'), findsOneWidget);

        // Hero Compatibility Score
        expect(find.text('${matchResult.compatibilityScore}%'), findsOneWidget);
        expect(find.text('MUSICALLY COMPATIBLE'), findsOneWidget);

        // Winner Banner
        expect(find.textContaining('MUSIC TITAN'), findsOneWidget);

        // Side-by-Side Comparison Table
        expect(find.text('HEAD-TO-HEAD STATS'), findsOneWidget);
        expect(find.text('12.5h'), findsOneWidget);
        expect(find.text('5.3h'), findsOneWidget);
        expect(find.text('Total Hours'), findsOneWidget);
      },
    );

    testWidgets(
      'F18: DedicateSongSheet interaction - character counter and gift creation',
      (tester) async {
        tester.view.physicalSize = const Size(800, 1400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(() => tester.view.resetPhysicalSize());

        const song = SongStat(
          trackId: 'track_naa_ready',
          title: 'Naa Ready',
          artistRaw: 'Thalapathy Vijay, Anirudh',
          albumTitle: 'Leo',
          listenedMs: 250000,
          durationMs: 250000,
          qualifiedPlays: 8,
        );

        GiftSong? createdGift;

        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData.dark(),
            home: Scaffold(
              body: Builder(
                builder: (ctx) => Center(
                  child: ElevatedButton(
                    onPressed: () {
                      DedicateSongSheet.show(
                        ctx,
                        song: song,
                        onGiftCreated: (g) => createdGift = g,
                      );
                    },
                    child: const Text('OPEN DEDICATE'),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Open sheet
        await tester.tap(find.text('OPEN DEDICATE'));
        await tester.pumpAndSettle();

        expect(find.text('DEDICATE A SONG'), findsOneWidget);
        expect(find.text('Naa Ready'), findsOneWidget);
        expect(find.text('0/140'), findsOneWidget);

        // Enter a note in the second TextField (noteController)
        await tester.enterText(
          find.byType(TextField).at(1),
          'This song always brings great energy!',
        );
        await tester.pumpAndSettle();

        expect(find.text('37/140'), findsOneWidget);

        // Tap generate gift card
        await tester.tap(find.text('CREATE GIFT CARD'));
        await tester.pumpAndSettle();

        expect(createdGift, isNotNull);
        expect(
          createdGift!.note,
          equals('This song always brings great energy!'),
        );
        expect(find.text('A Gift From A Zenify Friend'), findsOneWidget);
        expect(find.text('COPY GIFT LINK'), findsOneWidget);
      },
    );
  });
}
