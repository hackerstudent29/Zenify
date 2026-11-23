import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/features/replay/domain/replay_aggregate.dart';
import 'package:mobile/features/replay/presentation/widgets/top_artists_section.dart';
import 'package:mobile/features/replay/presentation/widgets/composers_singers_section.dart';
import 'package:mobile/features/replay/presentation/widgets/top_songs_section.dart';
import 'package:mobile/features/replay/presentation/widgets/top_album_card.dart';
import 'package:mobile/features/replay/presentation/widgets/on_repeat_section.dart';
import 'package:mobile/features/replay/presentation/widgets/skip_hall_of_fame_card.dart';
import 'package:mobile/features/replay/presentation/widgets/created_playlists_section.dart';
import 'package:mobile/features/replay/presentation/widgets/liked_songs_spotlight.dart';
import 'package:mobile/services/library_store.dart';

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

  group('Phase 5: F5 TopArtistsSection (Splitting + Tap-to-Expand)', () {
    testWidgets('renders individual split artists and expands played songs on tap', (tester) async {
      const song1 = SongStat(
        trackId: 't-1',
        title: 'Arabic Kuthu',
        artistRaw: 'Anirudh, Jonita Gandhi',
        listenedMs: 240000,
        qualifiedPlays: 4,
      );

      final artists = [
        const ArtistStat(
          artistName: 'Anirudh Ravichander',
          listenedMs: 600000,
          qualifiedPlays: 10,
          trackCount: 3,
          tracks: [song1],
        ),
        const ArtistStat(
          artistName: 'Jonita Gandhi',
          listenedMs: 240000,
          qualifiedPlays: 4,
          trackCount: 1,
          tracks: [song1],
        ),
      ];

      await tester.pumpWidget(wrapWithTheme(TopArtistsSection(artists: artists)));
      await tester.pumpAndSettle();

      expect(find.text('TOP ARTISTS'), findsOneWidget);
      expect(find.text('Anirudh Ravichander'), findsOneWidget);
      expect(find.text('Jonita Gandhi'), findsOneWidget);

      // Initially song breakdown is collapsed
      expect(find.text('SONGS PLAYED BY ANIRUDH RAVICHANDER'), findsNothing);

      // Tap on Anirudh to expand
      await tester.tap(find.text('Anirudh Ravichander'));
      await tester.pumpAndSettle();

      // Verify accordion expanded
      expect(find.text('SONGS PLAYED BY ANIRUDH RAVICHANDER'), findsOneWidget);
      expect(find.text('Arabic Kuthu'), findsOneWidget);
    });
  });

  group('Phase 5: F6 ComposersSingersSection & Movie Soundtrack', () {
    testWidgets('renders composers, vocalists and expandable movie soundtrack', (tester) async {
      final composers = [
        const ComposerStat(composerName: 'Anirudh Ravichander', listenedMs: 1200000, qualifiedPlays: 6),
      ];
      final singers = [
        const SingerStat(singerName: 'Jonita Gandhi', listenedMs: 600000, qualifiedPlays: 3),
      ];
      const movie = MovieStat(
        movieName: 'Leo',
        listenedMs: 1800000,
        qualifiedPlays: 8,
        distinctTrackCount: 3,
        tracks: [
          SongStat(trackId: 't-leo-1', title: 'Badass', artistRaw: 'Anirudh', listenedMs: 200000, qualifiedPlays: 4),
        ],
      );

      await tester.pumpWidget(wrapWithTheme(
        ComposersSingersSection(
          topComposers: composers,
          topSingers: singers,
          topMovie: movie,
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('TOP FILM SOUNDTRACK'), findsOneWidget);
      expect(find.text('Leo'), findsOneWidget);
      expect(find.text('Anirudh Ravichander'), findsOneWidget);
      expect(find.text('Jonita Gandhi'), findsOneWidget);

      // Tap to expand movie tracks
      await tester.tap(find.byIcon(Icons.keyboard_arrow_down_rounded));
      await tester.pumpAndSettle();

      expect(find.text('Badass'), findsOneWidget);
    });
  });

  group('Phase 5: F7 TopSongsSection (Exact Seconds Precision)', () {
    testWidgets('renders songs with clean artist and formatted duration with seconds', (tester) async {
      final songs = [
        const SongStat(
          trackId: 's-1',
          title: 'Hukum',
          artistRaw: 'Anirudh Ravichander',
          listenedMs: 234000, // 3 min 54 sec
          qualifiedPlays: 8,
        ),
      ];

      await tester.pumpWidget(wrapWithTheme(TopSongsSection(songs: songs)));
      await tester.pumpAndSettle();

      expect(find.text('TOP SONGS'), findsOneWidget);
      expect(find.text('Hukum'), findsOneWidget);
      expect(find.text('Anirudh Ravichander'), findsOneWidget);
      expect(find.text('3 min 54 sec'), findsOneWidget);
      expect(find.text('8 plays'), findsOneWidget);
    });
  });

  group('Phase 5: F8 TopAlbumCard', () {
    testWidgets('renders top album with >= 2 distinct tracks and expands tracklist', (tester) async {
      const album = AlbumStat(
        albumId: 'alb-jailer',
        title: 'Jailer',
        artistRaw: 'Anirudh Ravichander',
        listenedMs: 3600000,
        qualifiedPlays: 12,
        distinctTrackCount: 2,
        tracks: [
          SongStat(trackId: 't-hukum', title: 'Hukum', artistRaw: 'Anirudh', listenedMs: 234000, qualifiedPlays: 8),
          SongStat(trackId: 't-kaavaalaa', title: 'Kaavaalaa', artistRaw: 'Anirudh', listenedMs: 210000, qualifiedPlays: 4),
        ],
      );

      await tester.pumpWidget(wrapWithTheme(const TopAlbumCard(album: album)));
      await tester.pumpAndSettle();

      expect(find.text('MOST LISTENED ALBUM'), findsOneWidget);
      expect(find.text('Jailer'), findsOneWidget);
      expect(find.textContaining('2 tracks'), findsOneWidget);

      // Expand tracklist
      await tester.tap(find.byIcon(Icons.keyboard_arrow_down_rounded));
      await tester.pumpAndSettle();

      expect(find.text('Hukum'), findsOneWidget);
      expect(find.text('Kaavaalaa'), findsOneWidget);
    });
  });

  group('Phase 5: F9 OnRepeatSection', () {
    testWidgets('renders consecutive loop runs and heavy rotation', (tester) async {
      final loops = [
        const LoopStat(
          trackId: 't-loop',
          title: 'Arabic Kuthu',
          artistRaw: 'Anirudh',
          consecutiveRuns: 5,
        ),
      ];
      final heavyRotation = [
        const SongStat(
          trackId: 't-heavy',
          title: 'Chaleya',
          artistRaw: 'Anirudh',
          listenedMs: 600000,
          qualifiedPlays: 7,
        ),
      ];

      await tester.pumpWidget(wrapWithTheme(
        OnRepeatSection(
          loops: loops,
          heavyRotation: heavyRotation,
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('ON REPEAT'), findsOneWidget);
      expect(find.text('Arabic Kuthu'), findsOneWidget);
      expect(find.textContaining('Played 5 times consecutively'), findsOneWidget);
      expect(find.text('Chaleya'), findsOneWidget);
      expect(find.text('7 plays'), findsOneWidget);
    });
  });

  group('Phase 5: F10 SkipHallOfFameCard', () {
    testWidgets('renders skipped track callout with skip count and rate', (tester) async {
      final skips = [
        const SkipStat(
          trackId: 't-skip',
          title: 'Skip Track',
          artistRaw: 'Random Artist',
          skipCount: 14,
          totalStarts: 16,
          skipRate: 0.875,
        ),
      ];

      await tester.pumpWidget(wrapWithTheme(SkipHallOfFameCard(skips: skips)));
      await tester.pumpAndSettle();

      expect(find.text('SKIP HALL OF FAME'), findsOneWidget);
      expect(find.text('Skip Track'), findsOneWidget);
      expect(find.textContaining('Skipped 14 times (88% skip rate).'), findsOneWidget);
    });
  });

  group('Phase 5: F23 CreatedPlaylistsSection', () {
    testWidgets('renders live playlists with creation timestamp', (tester) async {
      final playlists = [
        UserPlaylist(
          id: 'pl-1',
          name: 'Night Drives',
          trackIds: ['t-1', 't-2', 't-3'],
          createdAt: DateTime.utc(2026, 11, 14),
        ),
      ];

      await tester.pumpWidget(wrapWithTheme(CreatedPlaylistsSection(playlists: playlists)));
      await tester.pumpAndSettle();

      expect(find.text('PLAYLIST COLLECTIONS'), findsOneWidget);
      expect(find.text('Night Drives'), findsOneWidget);
      expect(find.textContaining('3 songs · Created Nov 14, 2026'), findsOneWidget);
    });
  });

  group('Phase 5: F24 LikedSongsSpotlight', () {
    testWidgets('renders liked songs in rotation and total count', (tester) async {
      final likedPlayed = [
        const SongStat(
          trackId: 't-like-1',
          title: 'Hayyoda',
          artistRaw: 'Anirudh',
          listenedMs: 240000,
          qualifiedPlays: 5,
        ),
      ];

      await tester.pumpWidget(wrapWithTheme(
        LikedSongsSpotlight(
          likedPlayedSongs: likedPlayed,
          totalLikedInLibrary: 42,
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('FAVORITES IN ROTATION'), findsOneWidget);
      expect(find.text('42 Total Liked'), findsOneWidget);
      expect(find.text('Hayyoda'), findsOneWidget);
      expect(find.text('5 plays'), findsOneWidget);
    });
  });
}
