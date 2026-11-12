import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:mobile/design_system/widgets/dynamic_island_header.dart';
import 'package:mobile/design_system/widgets/zen_dropdown.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/auth_state.dart';
import 'package:mobile/services/dock_visibility.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'ZenDropdown.showTrackMenu opens as Layer 1 above docks/miniplayer with song header & share buttons',
      (tester) async {
    final sampleTrack = Track(
      id: 't-1',
      title: 'Starboy',
      artist: 'The Weeknd',
      album: 'Starboy',
      durationSeconds: 230,
      coverUrl: '',
    );

    late BuildContext capturedContext;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) {
              capturedContext = ctx;
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    expect(DockVisibility.hideNavDockNotifier.value, isFalse);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isFalse);

    final future = ZenDropdown.showTrackMenu(
      context: capturedContext,
      track: sampleTrack,
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(DockVisibility.hideNavDockNotifier.value, isTrue);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isTrue);

    expect(find.text('Starboy'), findsAtLeastNWidgets(1));
    expect(find.textContaining('The Weeknd'), findsOneWidget);
    expect(find.text('Copy Link'), findsOneWidget);
    expect(find.text('Message'), findsOneWidget);
    expect(find.text('Stories'), findsNWidgets(2));

    Navigator.of(capturedContext, rootNavigator: true).pop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await future;

    expect(DockVisibility.hideNavDockNotifier.value, isFalse);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isFalse);
  });

  testWidgets(
      'ZenDropdown.show with share header & ZenDropdown.showInputSheet hide docks and return submitted input',
      (tester) async {
    late BuildContext capturedContext;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) {
              capturedContext = ctx;
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    final sheetFuture = ZenDropdown.show<void>(
      context: capturedContext,
      title: 'Midnight Drive',
      subtitle: '12 Songs',
      shareText: 'Midnight Drive',
      shareUrl: 'https://zenify.app/playlist/Midnight',
      items: [
        ZenDropdownItem(
          title: 'Shuffle',
          icon: CupertinoIcons.shuffle,
          onTap: () {},
        ),
      ],
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(DockVisibility.hideNavDockNotifier.value, isTrue);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isTrue);
    expect(find.text('Midnight Drive'), findsOneWidget);
    expect(find.text('12 Songs'), findsOneWidget);
    expect(find.text('Copy Link'), findsOneWidget);
    expect(find.text('Shuffle'), findsOneWidget);

    Navigator.of(capturedContext, rootNavigator: true).pop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await sheetFuture;

    final inputFuture = ZenDropdown.showInputSheet(
      context: capturedContext,
      title: 'New Playlist',
      confirmLabel: 'Create',
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(DockVisibility.hideNavDockNotifier.value, isTrue);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isTrue);

    await tester.enterText(find.byType(CupertinoTextField), 'Late Night Study');
    await tester.pump();
    await tester.tap(find.text('Create'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    final submitted = await inputFuture;

    expect(submitted, equals('Late Night Study'));
    expect(DockVisibility.hideNavDockNotifier.value, isFalse);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isFalse);
  });

  test('IslandNotification produces concise artist-first text', () async {
    expect(
      IslandNotification.artistOrTitle(
        artist: 'Anirudh Ravichander & Vijay',
        title: 'Hukum (From "Jailer")',
      ),
      equals('Anirudh Ravichander & Vijay'),
    );
    expect(
      IslandNotification.artistOrTitle(
        artist: 'Unknown Artist',
        title: 'Starboy (Official Audio)',
      ),
      equals('Starboy'),
    );
  });

  testWidgets('DynamicIslandHeader animates notification open, holds 3s, and animates closed',
      (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>(
        create: (_) => AuthState(),
        child: const MaterialApp(
          home: Scaffold(
            body: Stack(
              children: [
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: DynamicIslandHeader(title: 'Explore', isDockPage: true),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    IslandNotifier.instance.show(
      IslandNotification(
        id: 'test_like_1',
        title: 'Liked',
        body: 'The Weeknd',
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 280));

    expect(IslandNotifier.instance.current?.title, equals('Liked'));
    expect(IslandNotifier.instance.isClosing, isFalse);
    expect(find.textContaining('Liked'), findsOneWidget);

    // Advance past 3.0s short hold -> enters animated closing phase before clearing
    await tester.pump(const Duration(milliseconds: 2800));
    expect(IslandNotifier.instance.isClosing, isTrue);
    expect(IslandNotifier.instance.current?.id, equals('test_like_1'));

    // Closing animation finishes (280ms close + 120ms queue delay)
    await tester.pump(const Duration(milliseconds: 450));
    expect(IslandNotifier.instance.isClosing, isFalse);
    expect(IslandNotifier.instance.current, isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 6));
  });
}
