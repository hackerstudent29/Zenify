import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/design_system/widgets/dynamic_island_header.dart';
import 'package:mobile/design_system/widgets/zen_dropdown.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/lyrics_service.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/services/queue_state.dart';
import 'package:mobile/services/song_credits_service.dart';
import 'package:mobile/utils/media_normalizer.dart';
import 'package:mobile/views/details/song_credits_screen.dart';
import 'package:mobile/views/lyrics/full_lyrics_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('SongCreditsService.parseCredits', () {
    test('extracts distributor, movie, cast, composers, lyricists, singers, release date, copyright',
        () {
      final track = Track(
        id: 'yt-V70AlHW4urw',
        title: 'Thaai Kelavi (From "Thiruchitrambalam")',
        artist: 'Dhanush & Anirudh Ravichander',
        album: 'Thiruchitrambalam',
        coverUrl: '',
        durationSeconds: 252,
      );
      final base = SongCreditsService.instance.baselineFromTrack(track);

      const topicDesc = '''
Provided to YouTube by The Orchard Enterprises

Thaai Kelavi (From "Thiruchitrambalam") · Dhanush · Anirudh Ravichander

℗ 2021 Sun Pictures

Released on: 2022-06-24

Producer: Sun Pictures
Music Publisher: Sun Pictures
''';

      const videoDesc = '''
Presenting the official video of "Thaai Kelavi" from the movie "Thiruchitrambalam".

Star Cast : Dhanush, Raashi Khanna, Nithya Menen, Priya Bhavani Shankar, Prakash Raj and Bharathiraja

Movie : Thiruchitrambalam
Directed by Mithran Jawahar
Composed by Anirudh Ravichander
Lyrics - Poetu Dhanush
Vocals - Dhanush
''';

      final parsed = SongCreditsService.parseCredits(
        track: track,
        base: base,
        primaryDescription: topicDesc,
        videoDescription: videoDesc,
        itunesData: {
          'collectionName': 'Thaai Kelavi (From "Thiruchitrambalam") - Single',
          'releaseDate': '2022-06-24T12:00:00Z',
          'primaryGenreName': 'Tamil',
        },
      );

      expect(parsed.distributor, equals('The Orchard Enterprises'));
      expect(parsed.copyright, equals('℗ 2021 Sun Pictures'));
      expect(parsed.label, equals('Sun Pictures'));
      expect(parsed.releaseDate, equals('24 June 2022'));
      expect(parsed.movieName, equals('Thiruchitrambalam'));
      expect(parsed.director, equals('Mithran Jawahar'));
      expect(parsed.genre, equals('Tamil'));

      // Dhanush holds both Actor + Lead Vocals under performingArtists
      final dhanush = parsed.performingArtists.firstWhere(
        (p) => p.name == 'Dhanush',
      );
      expect(dhanush.role, contains('Lead Vocals'));
      expect(dhanush.role, contains('Actor'));

      expect(
        parsed.movieCast.map((p) => p.name),
        containsAll(['Dhanush', 'Raashi Khanna', 'Nithya Menen']),
      );
      expect(
        parsed.compositionAndLyrics.map((p) => p.name),
        containsAll(['Anirudh Ravichander', 'Dhanush']),
      );
    });

    test('parses multi-role Topic credit lines like MIKE DEAN and The Weeknd',
        () {
      final track = Track(
        id: 'yt-p8_ugAjWI5I',
        title: 'São Paulo',
        artist: 'The Weeknd & Anitta',
        album: 'Hurry Up Tomorrow',
        coverUrl: '',
        durationSeconds: 302,
      );
      final base = SongCreditsService.instance.baselineFromTrack(track);

      const topicDesc = '''
Provided to YouTube by Universal Music Group

São Paulo · The Weeknd · Anitta

Hurry Up Tomorrow

℗ 2024 The Weeknd XO Music ULC, marketed by Republic Records

Released on: 2025-01-31

Vocalist, Producer, Programmer: The Weeknd
Drumprogrammer, Mastering Engineer, Producer, Mixing Engineer, Composer Lyricist, Vocal Engineer: MIKE DEAN
Vocalist: Anitta
Composer Lyricist: Abel Tesfaye
''';

      final parsed = SongCreditsService.parseCredits(
        track: track,
        base: base,
        primaryDescription: topicDesc,
      );

      expect(parsed.distributor, equals('Universal Music Group'));
      expect(parsed.releaseDate, equals('31 January 2025'));
      expect(
        parsed.performingArtists.map((p) => p.name),
        containsAll(['The Weeknd', 'Anitta']),
      );
      final mikeDeanProd = parsed.productionAndEngineering.firstWhere(
        (p) => p.name == 'MIKE DEAN',
      );
      expect(mikeDeanProd.role, contains('Mastering Engineer'));
      expect(mikeDeanProd.role, contains('Mixing Engineer'));
      expect(
        parsed.compositionAndLyrics.map((p) => p.name),
        containsAll(['MIKE DEAN', 'Abel Tesfaye']),
      );
    });
  });

  group('SongCreditsScreen & FullLyricsScreen Widgets', () {
    final track = Track(
      id: 'yt-V70AlHW4urw',
      title: 'Thaai Kelavi (From "Thiruchitrambalam")',
      artist: 'Dhanush & Anirudh Ravichander',
      album: 'Thiruchitrambalam',
      coverUrl: '',
      durationSeconds: 252,
    );

    final initialCredits = SongCredits(
      title: 'Thaai Kelavi (From "Thiruchitrambalam")',
      displayArtists: 'Dhanush & Anirudh Ravichander',
      album: 'Thaai Kelavi (From "Thiruchitrambalam") - Single',
      movieName: 'Thiruchitrambalam',
      distributor: 'The Orchard Enterprises',
      releaseDate: '24 June 2022',
      performingArtists: const [
        CreditPerson(
          name: 'Dhanush',
          role: 'Actor, Lead Vocals',
          browseId: 'UC_dhanush_test',
        ),
        CreditPerson(
          name: 'Anirudh Ravichander',
          role: 'Performer',
        ),
      ],
      compositionAndLyrics: const [
        CreditPerson(name: 'Anirudh Ravichander', role: 'Composer'),
        CreditPerson(name: 'Dhanush', role: 'Lyricist'),
      ],
    );

    testWidgets(
        'View Lyrics button on SongCreditsScreen is dimmed and non-clickable when lyrics are unavailable',
        (tester) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final player = PlayerState();
      final queue = QueueState();
      player.attachQueue(queue);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: SongCreditsScreen(
              track: track,
              initialCredits: initialCredits,
              initialLyrics: null,
              lyricsAlreadyChecked: true,
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(DynamicIslandHeader), findsOneWidget);
      expect(find.text('View Lyrics'), findsOneWidget);
      expect(find.text('Performing Artists'), findsOneWidget);

      // Scroll down to verify lower sections (Movie & Release/Distributor)
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -450));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Release & Distribution'), findsOneWidget);
      expect(find.text('The Orchard Enterprises'), findsOneWidget);
      expect(find.text('Thiruchitrambalam'), findsAtLeastNWidgets(1));

      // Scroll back to View Lyrics and verify it is dimmed & non-clickable
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 450));
      await tester.pump(const Duration(milliseconds: 300));
      final ignoreAncestor = tester.widgetList<IgnorePointer>(
        find.ancestor(
          of: find.text('View Lyrics'),
          matching: find.byType(IgnorePointer),
        ),
      );
      expect(ignoreAncestor.any((w) => w.ignoring), isTrue);

      await tester.tap(find.text('View Lyrics'), warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(FullLyricsScreen), findsNothing);
    });

    testWidgets(
        'View Lyrics button on SongCreditsScreen opens FullLyricsScreen when lyrics exist',
        (tester) async {
      final player = PlayerState();
      final queue = QueueState();
      player.attachQueue(queue);

      const lyrics = LyricsResult(
        synced: true,
        source: 'lrc_red_wbw',
        lines: [
          {'text': 'En mukka thuttu'},
          {'text': 'Kappa kelange'},
        ],
      );

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: SongCreditsScreen(
              track: track,
              initialCredits: initialCredits,
              initialLyrics: lyrics,
              lyricsAlreadyChecked: true,
            ),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('View Lyrics'));
      await tester.pumpAndSettle();

      expect(find.byType(FullLyricsScreen), findsOneWidget);
      expect(find.byType(DynamicIslandHeader), findsOneWidget);
      expect(find.text('En mukka thuttu'), findsOneWidget);
      expect(find.text('Kappa kelange'), findsOneWidget);
    });

    testWidgets(
        'Three-dot track menu displays View Credits and View Lyrics (dimmed on video tracks)',
        (tester) async {
      final player = PlayerState();
      final queue = QueueState();
      player.attachQueue(queue);

      final videoTrack = Track(
        id: 'yt-7CajfS_iVQM',
        title: 'Thaai Kelavi - Official Video Song',
        artist: 'Dhanush',
        album: 'Music Video',
        coverUrl: '',
        durationSeconds: 250,
        isVideo: true,
      );

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: Builder(
              builder: (ctx) => Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () =>
                        ZenDropdown.showTrackMenu(context: ctx, track: videoTrack),
                    child: const Text('Menu'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Menu'));
      await tester.pumpAndSettle();

      expect(find.text('View Credits'), findsOneWidget);
      expect(find.text('View Lyrics'), findsOneWidget);

      // View Lyrics row is dimmed (opacity 0.35) and tapping does NOT dismiss/navigate
      final opacityWidgets = tester.widgetList<Opacity>(
        find.ancestor(
          of: find.text('View Lyrics'),
          matching: find.byType(Opacity),
        ),
      );
      expect(opacityWidgets.any((o) => o.opacity < 0.5), isTrue);

      await tester.tap(find.text('View Lyrics'), warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.text('View Credits'), findsOneWidget);
    });
  });

  group('Soundtrack Album vs Song Name Extraction', () {
    test('resolveTrackAlbum & Track map "Hangova (From \\"DC\\")" single album to movie "DC"', () {
      expect(
        MediaNormalizer.resolveTrackAlbum(
          'Hangova (From "DC")',
          rawTitle: 'Hangova (From "DC")',
        ),
        equals('DC'),
      );
      expect(
        MediaNormalizer.resolveTrackAlbum(
          'Hangova (From "DC") - Single',
          rawTitle: 'Hangova (From "DC")',
        ),
        equals('DC'),
      );

      final track = Track(
        id: 'yt-hangova1',
        title: 'Hangova (From "DC")',
        artist: 'Anirudh Ravichander, Heisenberg',
        album: 'Hangova (From "DC")',
        coverUrl: '',
        durationSeconds: 205,
      );
      expect(MediaNormalizer.cleanCompactTitle(track.title), equals('Hangova'));
      expect(track.album, equals('DC'));

      // Preserves non-soundtrack self-titled albums
      final selfTitled = Track(
        id: 'yt-self1',
        title: '1989',
        artist: 'Artist',
        album: '1989',
        coverUrl: '',
      );
      expect(selfTitled.album, equals('1989'));
    });

    test('SongCreditsService replaces song-titled album "Hangova" with soundtrack/movie "DC"', () {
      // Simulate a legacy/cached Track whose album came in identical to song title ("Hangova")
      final legacyTrack = Track(
        id: 'yt-hangova2',
        title: 'Hangova',
        artist: 'Anirudh Ravichander',
        album: 'Hangova',
        albumBrowseId: 'MPREb_single_hangova',
        coverUrl: '',
        durationSeconds: 205,
      );
      final base = SongCreditsService.instance.baselineFromTrack(legacyTrack);

      const topicDesc = '''
Provided to YouTube by Think Music India

Hangova (From "DC") · Anirudh Ravichander · HEISENBERG

Hangova (From "DC")

℗ 2026 Think Music
''';

      // Case 1: Single metadata + Topic description with Movie "DC" (no OST yet)
      final singleOnly = SongCreditsService.parseCredits(
        track: legacyTrack,
        base: base,
        primaryDescription: topicDesc,
        itunesData: {
          'collectionName': 'Hangova (From "DC") - Single',
          'releaseDate': '2026-07-06T12:00:00Z',
          'primaryGenreName': 'Tamil',
        },
      );
      expect(singleOnly.movieName, equals('DC'));
      expect(singleOnly.album, equals('DC'));
      expect(singleOnly.albumBrowseId, isNull);

      // Case 2: OST album present in JioSaavn / iTunes (e.g. "DC (Original Motion Picture Soundtrack)")
      final withOst = SongCreditsService.parseCredits(
        track: legacyTrack,
        base: base,
        primaryDescription: topicDesc,
        jioSaavnData: {
          'album': 'DC (Original Motion Picture Soundtrack)',
          'release_date': '2026-07-06',
        },
        itunesData: {
          'collectionName': 'DC (Original Motion Picture Soundtrack)',
          'releaseDate': '2026-07-06T12:00:00Z',
          'primaryGenreName': 'Tamil',
        },
      );
      expect(withOst.movieName, equals('DC'));
      expect(withOst.album, equals('DC (Original Motion Picture Soundtrack)'));
      expect(withOst.albumBrowseId, isNull);
    });
  });
}
