import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/design_system/zen.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/auth_state.dart';
import 'package:mobile/services/dock_visibility.dart';
import 'package:mobile/services/library_store.dart';
import 'package:mobile/services/lyrics_service.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/services/queue_state.dart';
import 'package:mobile/services/settings_service.dart';
import 'package:mobile/services/studio_fx_state.dart';
import 'package:mobile/services/together_service.dart';
import 'package:mobile/views/lyrics/full_lyrics_screen.dart';
import 'package:mobile/views/shell_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final sampleTrack = Track(
    id: 'track-lyrics-1',
    title: 'After Hours',
    artist: 'The Weeknd',
    album: 'After Hours',
    coverUrl: '',
    durationSeconds: 361,
  );

  testWidgets(
      'FullLyricsScreen renders plain static Text, strips LRC tags, keeps RTL, and reserves safeBottom + 180 padding',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    const lyrics = LyricsResult(
      synced: true,
      source: 'lrc',
      lines: [
        {'text': '[00:01.00]<00:01.20>First clean line'},
        {'text': '[00:05.50]Second clean line'},
        {'text': '<00:10.00>مرحبا بالعالم'},
      ],
    );

    final player = PlayerState();
    final queue = QueueState();
    player.attachQueue(queue);
    final auth = AuthState();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<PlayerState>.value(value: player),
          ChangeNotifierProvider<QueueState>.value(value: queue),
          ChangeNotifierProvider<AuthState>.value(value: auth),
          ChangeNotifierProvider<IslandNotifier>.value(
            value: IslandNotifier.instance,
          ),
        ],
        child: MaterialApp(
          theme: zenDarkTheme(),
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(412, 915),
              padding: EdgeInsets.only(top: 44, bottom: 34),
            ),
            child: FullLyricsScreen(
              track: sampleTrack,
              initialLyrics: lyrics,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(SelectableText), findsNothing);
    expect(find.text('First clean line'), findsOneWidget);
    expect(find.text('Second clean line'), findsOneWidget);
    expect(find.textContaining('[00:'), findsNothing);
    expect(find.textContaining('<00:'), findsNothing);

    final rtlText = tester.widget<Text>(find.text('مرحبا بالعالم'));
    expect(rtlText.textDirection, TextDirection.rtl);

    final sliverPaddings = tester.widgetList<SliverPadding>(
      find.byType(SliverPadding),
    );
    expect(
      sliverPaddings.any(
        (p) => p.padding.resolve(TextDirection.ltr).bottom == 34.0 + 180.0,
      ),
      isTrue,
    );
  });

  testWidgets(
      'FullLyricsScreen keeps header stationary and absorbs ScrollNotification when scrolling down',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final longLyrics = LyricsResult(
      synced: false,
      source: 'plain',
      lines: List.generate(
        45,
        (i) => {'text': 'Plain lyric line ${i + 1}'},
      ),
    );

    final player = PlayerState();
    final queue = QueueState();
    player.attachQueue(queue);
    final auth = AuthState();

    var bubbledScrollCount = 0;

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<PlayerState>.value(value: player),
          ChangeNotifierProvider<QueueState>.value(value: queue),
          ChangeNotifierProvider<AuthState>.value(value: auth),
          ChangeNotifierProvider<IslandNotifier>.value(
            value: IslandNotifier.instance,
          ),
        ],
        child: MaterialApp(
          theme: zenDarkTheme(),
          home: NotificationListener<ScrollNotification>(
            onNotification: (_) {
              bubbledScrollCount++;
              return false;
            },
            child: FullLyricsScreen(
              track: sampleTrack,
              initialLyrics: longLyrics,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final headerFinder = find.byType(DynamicIslandHeader);
    expect(headerFinder, findsOneWidget);
    final headerRectBefore = tester.getRect(headerFinder);
    final scrollableFinder = find.byType(Scrollable);
    expect(tester.state<ScrollableState>(scrollableFinder).position.pixels, 0.0);

    await tester.drag(find.byType(CustomScrollView), const Offset(0, -600));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 200));

    final headerRectAfter = tester.getRect(headerFinder);
    expect(headerRectAfter, equals(headerRectBefore));
    expect(bubbledScrollCount, equals(0));
    expect(
      tester.state<ScrollableState>(scrollableFinder).position.pixels,
      greaterThan(300.0),
    );
  });

  testWidgets(
      'ShellNavigationScope.openPage from a root-navigator modal pushes inside ShellScreen active tab with dock intact',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    SharedPreferences.setMockInitialValues({});
    LibraryStore.storage = MemoryLibraryStorage();
    await LibraryStore.instance.ensureLoaded();
    DockVisibility.reset();

    final fx = StudioFxState();
    final player = PlayerState()..attachStudioFx(fx);
    final queue = QueueState();
    player.attachQueue(queue);
    final auth = AuthState();
    final together = TogetherService.instance..attachPlayer(player);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<StudioFxState>.value(value: fx),
          ChangeNotifierProvider<PlayerState>.value(value: player),
          ChangeNotifierProvider<QueueState>.value(value: queue),
          ChangeNotifierProvider<TogetherService>.value(value: together),
          ChangeNotifierProvider<AuthState>.value(value: auth),
          ChangeNotifierProvider<SettingsState>.value(
            value: SettingsState.instance,
          ),
          ChangeNotifierProvider<IslandNotifier>.value(
            value: IslandNotifier.instance,
          ),
        ],
        child: MaterialApp(
          theme: zenDarkTheme(),
          home: const ShellScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final shellCtx = tester.element(find.byType(ShellScreen));
    showModalBottomSheet<void>(
      context: shellCtx,
      useRootNavigator: true,
      builder: (modalCtx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ElevatedButton(
            onPressed: () {
              ShellNavigationScope.openPage(
                modalCtx,
                FullLyricsScreen(
                  track: sampleTrack,
                  initialLyrics: const LyricsResult(
                    synced: false,
                    source: 'plain',
                    lines: [
                      {'text': 'Modal pushed tab lyric line'},
                    ],
                  ),
                ),
              );
            },
            child: const Text('Open Lyrics From Modal'),
          ),
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('Open Lyrics From Modal'), findsOneWidget);

    await tester.tap(find.text('Open Lyrics From Modal'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 450));

    expect(find.text('Open Lyrics From Modal'), findsNothing);
    expect(
      find.descendant(
        of: find.byType(ShellScreen),
        matching: find.byType(FullLyricsScreen),
      ),
      findsOneWidget,
    );
    expect(find.text('Modal pushed tab lyric line'), findsOneWidget);
    expect(DockVisibility.hideNavDockNotifier.value, isFalse);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isFalse);

    await tester.pumpWidget(const SizedBox.shrink());
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(seconds: 5));
    }
  });
}
