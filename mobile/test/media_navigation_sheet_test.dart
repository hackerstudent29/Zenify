import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design_system/widgets/media_navigation_sheet.dart';
import 'package:mobile/models/artist_ref.dart';

void main() {
  testWidgets('MediaNavigationSheet renders multiple artists in list style with Go to Artist and Go to Album', (tester) async {
    const artists = [
      ArtistRef(id: 'sai_1', name: 'Sai Abhyankkar', imageUrl: 'https://example.com/sai.jpg'),
      ArtistRef(id: 'thamizh_2', name: 'Thamizh Aadhi', imageUrl: 'https://example.com/thamizh.jpg'),
    ];

    ArtistRef? tappedArtist;
    bool tappedAlbum = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MediaNavigationSheet(
            artists: artists,
            albumTitle: 'FA FA FA (From "O.M: Operation Mole") - Single',
            albumCoverUrl: 'https://example.com/cover.jpg',
            onOpenArtist: (a) => tappedArtist = a,
            onOpenAlbum: () => tappedAlbum = true,
          ),
        ),
      ),
    );

    // Verify "Go to Artist" rows
    expect(find.text('Go to Artist'), findsNWidgets(2));
    expect(find.text('Sai Abhyankkar'), findsOneWidget);
    expect(find.text('Thamizh Aadhi'), findsOneWidget);

    // Verify "Go to Album" row
    expect(find.text('Go to Album'), findsOneWidget);
    expect(find.text('FA FA FA (From "O.M: Operation Mole") - Single'), findsOneWidget);

    // Tap first artist
    await tester.tap(find.text('Sai Abhyankkar'));
    await tester.pump();
    expect(tappedArtist?.name, 'Sai Abhyankkar');

    // Tap album
    await tester.tap(find.text('FA FA FA (From "O.M: Operation Mole") - Single'));
    await tester.pump();
    expect(tappedAlbum, isTrue);
  });

  testWidgets('MediaNavigationSheet omits album row when albumTitle is null', (tester) async {
    const artists = [
      ArtistRef(id: 'anirudh_1', name: 'Anirudh Ravichander', imageUrl: 'https://example.com/anirudh.jpg'),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MediaNavigationSheet(
            artists: artists,
            albumTitle: null,
            onOpenArtist: (_) {},
          ),
        ),
      ),
    );

    expect(find.text('Go to Artist'), findsOneWidget);
    expect(find.text('Anirudh Ravichander'), findsOneWidget);
    expect(find.text('Go to Album'), findsNothing);
  });
}
