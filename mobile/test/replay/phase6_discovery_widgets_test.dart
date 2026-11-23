import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/replay/domain/replay_aggregate.dart';
import 'package:mobile/features/replay/presentation/widgets/discovery_section.dart';
import 'package:mobile/features/replay/presentation/widgets/music_geography_section.dart';
import 'package:mobile/features/replay/presentation/widgets/decades_breakdown_section.dart';
import 'package:mobile/features/replay/presentation/widgets/loyalty_timeline_card.dart';

void main() {
  group('Phase 6: F11 DiscoverySection', () {
    testWidgets('renders new artists, ratio bar, top discovery, and single-play gems',
        (tester) async {
      SongStat? playedSong;

      final discovery = DiscoveryStat(
        newArtistsCount: 12,
        totalArtistsCount: 30,
        newRatio: 0.40,
        topNewArtist: const ArtistStat(
          artistName: 'Santhosh Narayanan',
          listenedMs: 3600000,
          qualifiedPlays: 15,
          trackCount: 4,
          isNewDiscovery: true,
        ),
        newFoundGems: const [
          ArtistStat(
            artistName: 'Dhee',
            listenedMs: 240000,
            qualifiedPlays: 1,
            trackCount: 1,
            isNewDiscovery: true,
            tracks: [
              SongStat(
                trackId: 'dhee_1',
                title: 'Enjoy Enjaami',
                artistRaw: 'Dhee',
                listenedMs: 240000,
                qualifiedPlays: 1,
              ),
            ],
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DiscoverySection(
              discovery: discovery,
              onPlaySong: (s) => playedSong = s,
            ),
          ),
        ),
      );

      expect(find.text('DISCOVERY & NEW FINDS'), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('40% fresh listening'), findsOneWidget);
      expect(find.text('Santhosh Narayanan'), findsOneWidget);
      expect(find.text('#1 NEW'), findsOneWidget);
      expect(find.text('SINGLE-PLAY GEMS'), findsOneWidget);
      expect(find.text('Enjoy Enjaami'), findsOneWidget);
      expect(find.text('Dhee'), findsOneWidget);

      // Tap Play on single-play gem
      await tester.tap(find.text('Play'));
      await tester.pump();
      expect(playedSong?.trackId, 'dhee_1');
    });

    testWidgets('renders empty when totalArtistsCount == 0', (tester) async {
      const emptyDiscovery = DiscoveryStat(
        newArtistsCount: 0,
        totalArtistsCount: 0,
        newRatio: 0.0,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: DiscoverySection(discovery: emptyDiscovery),
          ),
        ),
      );

      expect(find.text('DISCOVERY & NEW FINDS'), findsNothing);
    });
  });

  group('Phase 6: F12 MusicGeographySection', () {
    testWidgets('renders top 3 podium and remaining countries list with distinct songs',
        (tester) async {
      final countries = [
        const CountryStat(
          countryCode: 'IN',
          countryName: 'India',
          uniqueTrackCount: 45,
          listenedMs: 7200000, // 120 min = 2 hr 0 min
          flagEmoji: '🇮🇳',
        ),
        const CountryStat(
          countryCode: 'US',
          countryName: 'United States',
          uniqueTrackCount: 18,
          listenedMs: 3600000, // 60 min = 1 hr 0 min
          flagEmoji: '🇺🇸',
        ),
        const CountryStat(
          countryCode: 'GB',
          countryName: 'United Kingdom',
          uniqueTrackCount: 8,
          listenedMs: 1800000, // 30 min
          flagEmoji: '🇬🇧',
        ),
        const CountryStat(
          countryCode: 'KR',
          countryName: 'South Korea',
          uniqueTrackCount: 3,
          listenedMs: 600000, // 10 min
          flagEmoji: '🇰🇷',
        ),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MusicGeographySection(countries: countries),
          ),
        ),
      );

      expect(find.text('MUSIC GEOGRAPHY'), findsOneWidget);
      expect(find.text('India'), findsOneWidget);
      expect(find.text('45 songs'), findsOneWidget);
      expect(find.text('2 hr 0 min'), findsOneWidget);
      expect(find.text('United States'), findsOneWidget);
      expect(find.text('United Kingdom'), findsOneWidget);
      expect(find.text('OTHER REGIONS & COUNTRIES'), findsOneWidget);
      expect(find.text('South Korea'), findsOneWidget);
      expect(find.text('3 distinct songs'), findsOneWidget);
    });

    testWidgets('renders empty when countries list is empty', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: MusicGeographySection(countries: []),
          ),
        ),
      );

      expect(find.text('MUSIC GEOGRAPHY'), findsNothing);
    });
  });

  group('Phase 6: F13 DecadesBreakdownSection', () {
    testWidgets('renders era breakdown with segmented percentages and minutes',
        (tester) async {
      const decades = DecadesStat(
        twentiesMs: 2700000, // 45 min = 45%
        tensMs: 1800000, // 30 min = 30%
        thousandsMs: 900000, // 15 min = 15%
        classicsMs: 600000, // 10 min = 10%
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: DecadesBreakdownSection(decades: decades),
          ),
        ),
      );

      expect(find.text('ERA & DECADES BREAKDOWN'), findsOneWidget);
      expect(find.text('2020s'), findsOneWidget);
      expect(find.text('45%'), findsOneWidget);
      expect(find.text('2010s'), findsOneWidget);
      expect(find.text('30%'), findsOneWidget);
      expect(find.text('2000s'), findsOneWidget);
      expect(find.text('15%'), findsOneWidget);
      expect(find.text('Classics'), findsOneWidget);
      expect(find.text('10%'), findsOneWidget);
    });

    testWidgets('renders empty when total listening is 0', (tester) async {
      const emptyDecades = DecadesStat(
        twentiesMs: 0,
        tensMs: 0,
        thousandsMs: 0,
        classicsMs: 0,
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: DecadesBreakdownSection(decades: emptyDecades),
          ),
        ),
      );

      expect(find.text('ERA & DECADES BREAKDOWN'), findsNothing);
    });
  });

  group('Phase 6: F14 LoyaltyTimelineCard', () {
    testWidgets('renders loyalty narrative when daysLoyal >= 30', (tester) async {
      final loyalty = LoyaltyStat(
        artistName: 'Yuvan Shankar Raja',
        firstPlayDate: DateTime.utc(2025, 3, 3),
        daysLoyal: 214,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LoyaltyTimelineCard(loyalty: loyalty),
          ),
        ),
      );

      expect(find.text('ARTIST LOYALTY TIMELINE'), findsOneWidget);
      expect(find.text('214 DAYS'), findsOneWidget);
      expect(find.textContaining('Yuvan Shankar Raja', findRichText: true), findsOneWidget);
      expect(find.textContaining('Mar 3, 2025', findRichText: true), findsWidgets);
      expect(find.textContaining('214 days later', findRichText: true), findsOneWidget);
    });

    testWidgets('hides when loyalty is null or daysLoyal < 30', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: LoyaltyTimelineCard(loyalty: null),
          ),
        ),
      );
      expect(find.text('ARTIST LOYALTY TIMELINE'), findsNothing);

      final shortLoyalty = LoyaltyStat(
        artistName: 'Anirudh',
        firstPlayDate: DateTime.utc(2025, 11, 10),
        daysLoyal: 12,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LoyaltyTimelineCard(loyalty: shortLoyalty),
          ),
        ),
      );
      expect(find.text('ARTIST LOYALTY TIMELINE'), findsNothing);
    });
  });
}
