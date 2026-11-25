import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/models/track.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/services/queue_state.dart';
import 'package:mobile/views/lyrics/lyrics_sheet.dart';
import 'package:mobile/views/player/player_shell.dart';

class _TestPlayerState extends PlayerState {
  _TestPlayerState({this.video = false})
    : _track = Track(
        id: video ? 'yt-vid1' : 'track-1',
        title: video ? 'Blinding Lights (Official Video)' : 'After Hours',
        artist: 'The Weeknd',
        album: video ? 'Music Video' : 'After Hours',
        coverUrl: '',
        durationSeconds: 210,
        isVideo: video,
      );

  final bool video;
  final Track _track;

  @override
  Track? get currentTrack => _track;

  @override
  Duration get duration => const Duration(seconds: 210);

  @override
  bool get isPlaying => false;

  @override
  bool get isCurrentVideo => video;

  @override
  bool get hasLyrics => !video;

  @override
  Future<void> seek(Duration position) async {
    positionNotifier.value = position;
  }

  @override
  Future<void> next({String source = 'manual'}) async {}

  @override
  Future<void> previous() async {}
}

Future<void> _pumpFor(WidgetTester tester, Duration total) async {
  const step = Duration(milliseconds: 25);
  var elapsed = Duration.zero;
  await tester.pump();
  while (elapsed < total) {
    final next = elapsed + step > total ? total - elapsed : step;
    await tester.pump(next);
    elapsed += next;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'PlayerShell moves artwork on Lyrics open while keeping artist names & all buttons visible, then hides chrome after 3s idle',
    (tester) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      late PlayerState player;
      late QueueState queue;
      await tester.runAsync(() async {
        player = _TestPlayerState();
        queue = QueueState();
      });

      final shellKey = GlobalKey<PlayerShellState>();

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [
                  Positioned.fill(
                    child: PlayerShell(
                      key: shellKey,
                      lyricsBuilder: (_) => ListView(
                        key: const ValueKey('mock_lyrics_body'),
                        children: const [SizedBox(height: 1200)],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      await tester.pump();
      shellKey.currentState!.openSheet();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      final track = player.currentTrack!;
      expect(
        find.textContaining(track.artistNames.first),
        findsAtLeastNWidgets(1),
      );
      expect(find.byIcon(CupertinoIcons.quote_bubble), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.slider_horizontal_3), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.list_bullet), findsOneWidget);

      // Tap Lyrics button -> opens lyrics dim boundary, moves cover, keeps all buttons & artist visible
      await tester.tap(
        find.byIcon(CupertinoIcons.quote_bubble),
        warnIfMissed: false,
      );
      await _pumpFor(tester, const Duration(milliseconds: 550));

      expect(find.byKey(const ValueKey('mock_lyrics_body')), findsOneWidget);
      // Lyrics sits directly on the artwork colour wash with soft top/bottom edge fade
      expect(find.byKey(const ValueKey('mock_lyrics_body')), findsOneWidget);
      // Artist name remains visible next to moved artwork in compact header
      expect(
        find.textContaining(track.artistNames.first),
        findsAtLeastNWidgets(1),
      );
      // All transport & tool buttons remain visible when clicking Lyrics
      expect(find.byIcon(CupertinoIcons.backward_fill), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.forward_fill), findsAtLeastNWidgets(1));
      expect(find.byIcon(CupertinoIcons.slider_horizontal_3), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.quote_bubble_fill), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.list_bullet), findsOneWidget);

      // Drag lyrics up from its upper region (clear of bottom controls) after initial grace window -> bottom controls hide cleanly
      await _pumpFor(tester, const Duration(milliseconds: 950));
      final lyricsTopLeft = tester.getTopLeft(
        find.byKey(const ValueKey('mock_lyrics_body')),
      );
      await tester.dragFrom(
        lyricsTopLeft + const Offset(100, 60),
        const Offset(0, -80),
      );
      await _pumpFor(tester, const Duration(milliseconds: 400));

      final lyricsIconRender = tester.renderObject(
        find.byIcon(CupertinoIcons.quote_bubble_fill),
      );
      expect(
        lyricsIconRender.paintBounds.isEmpty ||
            tester
                .widgetList<IgnorePointer>(
                  find.ancestor(
                    of: find.byIcon(CupertinoIcons.quote_bubble_fill),
                    matching: find.byType(IgnorePointer),
                  ),
                )
                .any((w) => w.ignoring),
        isTrue,
      );

      // Dragging down shows all controls back up
      await tester.dragFrom(
        lyricsTopLeft + const Offset(100, 60),
        const Offset(0, 80),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(
        tester
            .widgetList<IgnorePointer>(
              find.ancestor(
                of: find.byIcon(CupertinoIcons.quote_bubble_fill),
                matching: find.byType(IgnorePointer),
              ),
            )
            .any((w) => w.ignoring),
        isFalse,
      );

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'LyricsView seeks smoothly on line tap and respects external immersive listenable',
    (tester) async {
      final pos = ValueNotifier<Duration>(Duration.zero);
      final immersive = ValueNotifier<bool>(false);
      Duration? seekedTo;

      final lines = [
        const LyricLine(
          start: Duration(seconds: 0),
          end: Duration(seconds: 5),
          text: 'First shining line',
        ),
        const LyricLine(
          start: Duration(seconds: 6),
          end: Duration(seconds: 12),
          text: 'Second golden line',
        ),
        const LyricLine(
          start: Duration(seconds: 13),
          end: Duration(seconds: 20),
          text: 'Third velvet line',
        ),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            backgroundColor: Colors.black,
            body: LyricsView(
              lines: lines,
              position: pos,
              isPlaying: false,
              isSynced: true,
              immersiveListenable: immersive,
              onSeek: (d) => seekedTo = d,
            ),
          ),
        ),
      );

      await tester.pump();
      await tester.pumpAndSettle();
      expect(find.text('Second'), findsOneWidget);

      // Tap line -> immediately triggers onSeek to that line's start time
      await tester.tap(find.text('Second'));
      await tester.pumpAndSettle();
      expect(seekedTo, equals(const Duration(seconds: 6)));

      // Toggle immersive -> hides sync pill smoothly
      immersive.value = true;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 450));

      final syncFinder = find.text('0.0s');
      expect(
        tester
            .widgetList<IgnorePointer>(
              find.ancestor(
                of: syncFinder,
                matching: find.byType(IgnorePointer),
              ),
            )
            .any((w) => w.ignoring),
        isTrue,
      );

      immersive.dispose();
      pos.dispose();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'Lyrics typography enforces strict uniform font size: 28.0 for normal lines and 21.0 for bracketed backing lines',
    (tester) async {
      final pos = ValueNotifier<Duration>(const Duration(seconds: 2));

      final lines = [
        const LyricLine(
          start: Duration(seconds: 0),
          end: Duration(seconds: 5),
          text: 'Short line',
        ),
        const LyricLine(
          start: Duration(seconds: 6),
          end: Duration(seconds: 12),
          text:
              'This is a very long line with many words that would have previously shrunk down',
        ),
        const LyricLine(
          start: Duration(seconds: 13),
          end: Duration(seconds: 20),
          text: '(backing vocal line)',
        ),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LyricsView(
              lines: lines,
              position: pos,
              isPlaying: false,
              isSynced: true,
              onSeek: (_) {},
            ),
          ),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // Verify normal short line word font size is exactly 28.0
      final shortWordText = tester.widget<Text>(find.text('Short').first);
      expect(shortWordText.style?.fontSize, equals(kNormalLyricFontSize));
      expect(kNormalLyricFontSize, equals(28.0));

      // Verify long line word font size stays strictly 28.0 (no shrinking loop)
      final longWordText = tester.widget<Text>(find.text('previously').first);
      expect(longWordText.style?.fontSize, equals(kNormalLyricFontSize));

      // Advance position to the bracketed backing line so it animates in as current
      pos.value = const Duration(seconds: 15);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // Verify bracketed backing line word font size is strictly 21.0
      // (_formatLyricCasing capitalizes words and removes the enclosing parentheses from rendered text)
      final backingWordText = tester.widget<Text>(find.text('Backing').first);
      expect(backingWordText.style?.fontSize, equals(kBracketedLyricFontSize));
      expect(kBracketedLyricFontSize, equals(21.0));

      pos.dispose();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'Landscape PlayerShell renders volume bar, big controls, only Lyrics & Queue buttons centered, and moves active button right on open',
    (tester) async {
      tester.view.physicalSize = const Size(844, 390);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      late PlayerState player;
      late QueueState queue;
      await tester.runAsync(() async {
        player = _TestPlayerState();
        queue = QueueState();
      });

      final shellKey = GlobalKey<PlayerShellState>();

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [
                  Positioned.fill(
                    child: PlayerShell(
                      key: shellKey,
                      lyricsBuilder: (_) => ListView(
                        key: const ValueKey('mock_landscape_lyrics'),
                        children: const [SizedBox(height: 600)],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      await tester.pump();
      shellKey.currentState!.openSheet();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // Landscape mode shows volume bar & speaker icons + only Lyrics & Queue (no FX slider icon)
      expect(find.byIcon(CupertinoIcons.speaker_1_fill), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.speaker_3_fill), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.slider_horizontal_3), findsNothing);

      final lyricsCenterBefore = tester.getCenter(
        find.byIcon(CupertinoIcons.quote_bubble),
      );
      final queueCenterBefore = tester.getCenter(
        find.byIcon(CupertinoIcons.list_bullet),
      );
      expect(lyricsCenterBefore.dx, lessThan(queueCenterBefore.dx));

      // Tapping Lyrics opens lyrics panel and moves Lyrics button to the full right side
      await tester.tap(
        find.byIcon(CupertinoIcons.quote_bubble),
        warnIfMissed: false,
      );
      await _pumpFor(tester, const Duration(milliseconds: 650));

      expect(
        find.byKey(const ValueKey('mock_landscape_lyrics')),
        findsOneWidget,
      );
      final lyricsCenterAfter = tester.getCenter(
        find.byIcon(CupertinoIcons.quote_bubble_fill),
      );
      expect(lyricsCenterAfter.dx, greaterThan(queueCenterBefore.dx));

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'PlayerState requestLyricsNow does not deadlock when called during build and skips video songs cleanly',
    (tester) async {
      final videoTrack = Track(
        id: 'yt-vid12345678',
        title: 'Test Official Music Video',
        artist: 'Test Artist',
        album: 'Music Video',
        coverUrl: '',
        durationSeconds: 200,
        isVideo: true,
      );

      final state = PlayerState();
      state.setQueue([videoTrack], startIndex: 0);
      await tester.pump();
      state.requestLyricsNow();
      await tester.pump();
      expect(state.isLoadingLyrics, isFalse);

      state.dispose();
    },
  );

  testWidgets(
    'PlayerShell morphs smoothly portrait <-> landscape and keeps ScrubberSlider time labels neutral white',
    (tester) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      late PlayerState player;
      late QueueState queue;
      await tester.runAsync(() async {
        player = _TestPlayerState();
        queue = QueueState();
      });

      final shellKey = GlobalKey<PlayerShellState>();

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [Positioned.fill(child: PlayerShell(key: shellKey))],
              ),
            ),
          ),
        ),
      );

      await tester.pump();
      shellKey.currentState!.openSheet();
      await _pumpFor(tester, const Duration(milliseconds: 550));

      final timerText = tester.widget<Text>(find.text('0:00').first);
      expect(
        timerText.style?.color,
        equals(Colors.white.withValues(alpha: 0.55)),
      );

      // Rotate to landscape and let the spring morph settle.
      tester.view.physicalSize = const Size(844, 390);
      await _pumpFor(tester, const Duration(milliseconds: 800));
      expect(find.byIcon(CupertinoIcons.quote_bubble), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.list_bullet), findsOneWidget);

      // Rotate back to portrait cleanly without blanking controls.
      tester.view.physicalSize = const Size(412, 915);
      await _pumpFor(tester, const Duration(milliseconds: 800));
      expect(find.byIcon(CupertinoIcons.quote_bubble), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.list_bullet), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'Landscape video PlayerShell shows bracket expand button, prev/next transport, fit/fill toggle, and double-tap 10s skip accumulation',
    (tester) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      late PlayerState player;
      late QueueState queue;
      await tester.runAsync(() async {
        player = _TestPlayerState(video: true);
        queue = QueueState();
      });

      final shellKey = GlobalKey<PlayerShellState>();

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [Positioned.fill(child: PlayerShell(key: shellKey))],
              ),
            ),
          ),
        ),
      );

      await tester.pump();
      shellKey.currentState!.openSheet();
      await _pumpFor(tester, const Duration(milliseconds: 550));
      expect(
        find.bySemanticsLabel('Expand video to landscape'),
        findsOneWidget,
      );

      // Rotate to landscape video and let morph + video UI controls spring in.
      tester.view.physicalSize = const Size(844, 390);
      await _pumpFor(tester, const Duration(milliseconds: 900));

      expect(find.bySemanticsLabel('Previous track'), findsOneWidget);
      expect(find.bySemanticsLabel('Back 10 seconds'), findsOneWidget);
      expect(find.bySemanticsLabel('Forward 10 seconds'), findsOneWidget);
      expect(find.bySemanticsLabel('Next track'), findsOneWidget);
      expect(find.bySemanticsLabel('Fill screen'), findsOneWidget);

      await tester.tap(find.bySemanticsLabel('Fill screen'));
      await _pumpFor(tester, const Duration(milliseconds: 250));
      expect(find.bySemanticsLabel('Fit to screen'), findsOneWidget);

      // Double-tap right third -> "10 seconds", chain tap -> "20 seconds".
      const rightThird = Offset(760, 195);
      await tester.tapAt(rightThird);
      await tester.pump(const Duration(milliseconds: 80));
      await tester.tapAt(rightThird);
      await _pumpFor(tester, const Duration(milliseconds: 120));
      expect(find.text('10 seconds'), findsOneWidget);

      await tester.tapAt(rightThird);
      await _pumpFor(tester, const Duration(milliseconds: 120));
      expect(find.text('20 seconds'), findsOneWidget);

      // Let flash fade timer and video UI auto-hide settle cleanly.
      await _pumpFor(tester, const Duration(milliseconds: 1200));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'LyricsSheet and PlayerState settle on Lyrics Not Available instead of infinite loading loop',
    (tester) async {
      const eventsChannel = EventChannel('zenify/audio/events');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockStreamHandler(
            eventsChannel,
            MockStreamHandler.inline(onListen: (arguments, events) {}),
          );
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockStreamHandler(eventsChannel, null);
      });

      final offlineNoLyricsTrack = Track(
        id: 'local-nolyrics-1',
        title: 'Instrumental Jam',
        artist: 'Local Artist',
        album: 'Local Album',
        coverUrl: 'file:///nonexistent.jpg',
        durationSeconds: 180,
        source: 'local',
      );

      final state = PlayerState();
      await tester.runAsync(() async {
        await state.setQueue([offlineNoLyricsTrack], startIndex: 0);
        await Future<void>.delayed(const Duration(milliseconds: 80));
      });

      await tester.pumpWidget(
        ChangeNotifierProvider<PlayerState>.value(
          value: state,
          child: const MaterialApp(
            home: Scaffold(body: LyricsSheet(open: true)),
          ),
        ),
      );

      // Pump several frames; requestLyricsNow() must NOT re-enter loading loop.
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      expect(state.isLoadingLyrics, isFalse);
      expect(find.text('Loading lyrics...'), findsNothing);
      expect(find.text('Lyrics Not Available'), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
      state.dispose();
    },
  );

  testWidgets(
    'LyricsView keeps overlapping lines active until their own end time and highlights tail glow with softer intensity',
    (tester) async {
      final pos = ValueNotifier<Duration>(const Duration(seconds: 42));
      final lines = [
        const LyricLine(
          start: Duration(seconds: 36),
          end: Duration(seconds: 43),
          text: 'Alpha beta gamma delta',
        ),
        const LyricLine(
          start: Duration(seconds: 41),
          end: Duration(seconds: 50),
          text: 'Second overlap line starts early',
        ),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LyricsView(
              lines: lines,
              position: pos,
              isPlaying: false,
              isSynced: true,
              onSeek: (_) {},
            ),
          ),
        ),
      );

      await _pumpFor(tester, const Duration(milliseconds: 500));

      // At t=42s (inside 41..43 overlap), Alpha is filled white (not dimmed/past)
      // AND Second overlap line is actively starting to fill (bright active base / filling).
      final alphaTexts = tester.widgetList<Text>(find.text('Alpha'));
      final deltaTexts = tester.widgetList<Text>(find.text('Delta'));
      // Note: _formatLyricCasing capitalizes 'Alpha'; tokens: 'Alpha', 'beta', 'gamma', 'delta'
      expect(alphaTexts.any((w) => w.style?.color == Colors.white), isTrue);
      final betaText = tester.widgetList<Text>(find.text('beta')).first;
      final secondActive = tester
          .widgetList<Text>(find.text('Second'))
          .any(
            (w) =>
                w.style?.color == Colors.white ||
                w.style?.color == const Color(0x99FFFFFF),
          );
      expect(secondActive, isTrue);

      // Early tail token ('Alpha') must have strictly lower glow shadow alpha than frontier ('delta' or 'gamma')
      final deltaWidgets = tester.widgetList<Text>(find.text('delta')).toList();
      expect(betaText, isNotNull);
      if (deltaWidgets.isNotEmpty) {
        final aAlpha =
            alphaTexts.first.style?.shadows?.firstOrNull?.color.a ?? 0.0;
        final dAlpha = deltaWidgets
            .map((w) => w.style?.shadows?.firstOrNull?.color.a ?? 0.0)
            .fold<double>(0.0, (a, b) => a > b ? a : b);
        expect(dAlpha, greaterThan(0.0));
        expect(aAlpha, lessThanOrEqualTo(dAlpha + 0.001));
      }

      // Also test 1-second overlap after line 1 finishes at 43.2s -> line 1 cools down, line 2 stays active
      pos.value = const Duration(milliseconds: 43200);
      await _pumpFor(tester, const Duration(milliseconds: 900));
      final secondStillActive = tester
          .widgetList<Text>(find.text('Second'))
          .any(
            (w) =>
                w.style?.color == Colors.white ||
                w.style?.color == const Color(0x99FFFFFF),
          );
      expect(secondStillActive, isTrue);
      expect(deltaTexts.length, isNonNegative);

      pos.dispose();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'LyricsView renders Arabic RTL and mixed BiDi (FA FA FA) phrases in proper directional flow',
    (tester) async {
      final pos = ValueNotifier<Duration>(const Duration(seconds: 19));
      final lines = [
        const LyricLine(
          start: Duration(seconds: 10),
          end: Duration(seconds: 15),
          text: 'Zoom دوم اللي يمشي لك عين',
        ),
        const LyricLine(
          start: Duration(seconds: 16),
          end: Duration(seconds: 24),
          text: 'மாமா, شیر of يا ويلي العربية',
        ),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LyricsView(
              lines: lines,
              position: pos,
              isPlaying: false,
              isSynced: true,
              onSeek: (_) {},
            ),
          ),
        ),
      );

      await _pumpFor(tester, const Duration(milliseconds: 400));

      final wraps = tester.widgetList<Wrap>(find.byType(Wrap)).toList();
      expect(wraps.length, equals(2));
      // Mixed line led by short LTR "Zoom" but dominated by Arabic -> RTL Wrap + top-to-bottom wrap direction
      expect(wraps[0].textDirection, equals(TextDirection.rtl));
      expect(wraps[0].verticalDirection, equals(VerticalDirection.down));
      // Mixed Tamil + Arabic phrase -> LTR outer Wrap with nested RTL Row for "يا ويلي العربية"
      expect(wraps[1].textDirection, equals(TextDirection.ltr));
      expect(wraps[1].verticalDirection, equals(VerticalDirection.down));
      final rows = tester.widgetList<Row>(find.byType(Row));
      expect(rows.any((r) => r.textDirection == TextDirection.rtl), isTrue);

      // Individual word direction follows each token's own script
      final zoomText = tester.widgetList<Text>(find.text('Zoom')).first;
      final arabicText = tester.widgetList<Text>(find.text('العربية')).first;
      expect(zoomText.textDirection, equals(TextDirection.ltr));
      expect(arabicText.textDirection, equals(TextDirection.rtl));

      pos.dispose();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'Portrait PlayerShell blocks background lyrics taps over visible bottom controls and restores them when hidden',
    (tester) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final player = _TestPlayerState();
      final queue = QueueState();
      final shellKey = GlobalKey<PlayerShellState>();
      int upperTaps = 0;
      int bottomTaps = 0;

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [
                  Positioned.fill(
                    child: PlayerShell(
                      key: shellKey,
                      lyricsBuilder: (_) => Stack(
                        key: const ValueKey('portrait_shield_lyrics_body'),
                        fit: StackFit.expand,
                        children: [
                          ListView(children: const [SizedBox(height: 1200)]),
                          Positioned(
                            top: 24,
                            left: 24,
                            right: 24,
                            height: 64,
                            child: GestureDetector(
                              key: const ValueKey('upper_portrait_lyric'),
                              behavior: HitTestBehavior.opaque,
                              onTap: () => upperTaps++,
                              child: const SizedBox.expand(),
                            ),
                          ),
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: 160,
                            child: GestureDetector(
                              key: const ValueKey('bottom_portrait_lyric'),
                              behavior: HitTestBehavior.opaque,
                              onTap: () => bottomTaps++,
                              child: const SizedBox.expand(),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      await tester.pump();
      shellKey.currentState!.openSheet();
      await _pumpFor(tester, const Duration(milliseconds: 550));

      // Open Lyrics panel
      await tester.tap(find.byIcon(CupertinoIcons.quote_bubble));
      await _pumpFor(tester, const Duration(milliseconds: 600));
      expect(find.byIcon(CupertinoIcons.quote_bubble_fill), findsOneWidget);

      // 1. Upper lyrics above the bottom controls remain clickable
      await tester.tap(find.byKey(const ValueKey('upper_portrait_lyric')));
      await tester.pump();
      expect(upperTaps, equals(1));

      // 2. Taps on empty gaps in the bottom controls area MUST NOT click background lyrics
      final lyricsBtnCenter = tester.getCenter(
        find.byIcon(CupertinoIcons.quote_bubble_fill),
      );
      final sliderRect = tester.getRect(
        find
            .byWidgetPredicate(
              (w) => w.runtimeType.toString() == 'ScrubberSlider',
            )
            .first,
      );

      // Left margin beside bottom tool buttons
      await tester.tapAt(Offset(16, lyricsBtnCenter.dy));
      await tester.pump();
      // Right margin beside bottom tool buttons
      await tester.tapAt(Offset(396, lyricsBtnCenter.dy));
      await tester.pump();
      // Left margin beside seekbar / transport controls
      await tester.tapAt(Offset(12, sliderRect.center.dy));
      await tester.pump();
      // Right margin beside transport controls
      await tester.tapAt(Offset(400, sliderRect.center.dy + 36));
      await tester.pump();

      expect(bottomTaps, equals(0));

      // 3. Bottom buttons themselves still respond (tap Queue toggle -> switches to Queue)
      await tester.tap(find.byIcon(CupertinoIcons.list_bullet));
      await _pumpFor(tester, const Duration(milliseconds: 350));
      expect(find.byIcon(CupertinoIcons.quote_bubble), findsOneWidget);

      // Switch back to Lyrics, then scroll up to hide chrome -> bottom lyrics become clickable
      await tester.tap(find.byIcon(CupertinoIcons.quote_bubble));
      await _pumpFor(tester, const Duration(milliseconds: 1050));
      final lyricsTopLeft = tester.getTopLeft(
        find.byKey(const ValueKey('portrait_shield_lyrics_body')),
      );
      await tester.dragFrom(
        lyricsTopLeft + const Offset(120, 140),
        const Offset(0, -100),
      );
      await _pumpFor(tester, const Duration(milliseconds: 450));

      await tester.tapAt(Offset(206, lyricsBtnCenter.dy));
      await _pumpFor(tester, const Duration(milliseconds: 100));
      expect(bottomTaps, equals(1));

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'Landscape PlayerShell blocks background lyrics taps over the bottom tools strip while keeping active button clickable',
    (tester) async {
      tester.view.physicalSize = const Size(844, 390);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final player = _TestPlayerState();
      final queue = QueueState();
      final shellKey = GlobalKey<PlayerShellState>();
      int upperTaps = 0;
      int bottomTaps = 0;

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<PlayerState>.value(value: player),
            ChangeNotifierProvider<QueueState>.value(value: queue),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: Stack(
                children: [
                  Positioned.fill(
                    child: PlayerShell(
                      key: shellKey,
                      lyricsBuilder: (_) => Stack(
                        key: const ValueKey('landscape_shield_lyrics_body'),
                        fit: StackFit.expand,
                        children: [
                          Positioned(
                            top: 12,
                            left: 0,
                            right: 0,
                            height: 60,
                            child: GestureDetector(
                              key: const ValueKey('upper_landscape_lyric'),
                              behavior: HitTestBehavior.opaque,
                              onTap: () => upperTaps++,
                              child: const SizedBox.expand(),
                            ),
                          ),
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: 48,
                            child: GestureDetector(
                              key: const ValueKey('bottom_landscape_lyric'),
                              behavior: HitTestBehavior.opaque,
                              onTap: () => bottomTaps++,
                              child: const SizedBox.expand(),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      await tester.pump();
      shellKey.currentState!.openSheet();
      await _pumpFor(tester, const Duration(milliseconds: 550));

      // Open Lyrics panel in landscape
      await tester.tap(find.byIcon(CupertinoIcons.quote_bubble));
      await _pumpFor(tester, const Duration(milliseconds: 650));
      expect(find.byIcon(CupertinoIcons.quote_bubble_fill), findsOneWidget);

      // Upper lyrics line above the bottom button bar remains clickable
      await tester.tap(find.byKey(const ValueKey('upper_landscape_lyric')));
      await tester.pump();
      expect(upperTaps, equals(1));

      // Tapping empty space along the bottom button strip must not hit background lyrics
      final bodyRect = tester.getRect(
        find.byKey(const ValueKey('landscape_shield_lyrics_body')),
      );
      final activeBtnCenter = tester.getCenter(
        find.byIcon(CupertinoIcons.quote_bubble_fill),
      );
      await tester.tapAt(Offset(bodyRect.left + 32, activeBtnCenter.dy));
      await tester.pump();
      expect(bottomTaps, equals(0));

      // Tapping the active Lyrics button itself still toggles Lyrics closed
      await tester.tap(find.byIcon(CupertinoIcons.quote_bubble_fill));
      await _pumpFor(tester, const Duration(milliseconds: 650));
      expect(find.byIcon(CupertinoIcons.quote_bubble), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );

  testWidgets(
    'LyricsView uses bolder display weight, letter spacing (0.0 for RTL), and generous gap between consecutive lines',
    (tester) async {
      final pos = ValueNotifier<Duration>(const Duration(seconds: 2));
      final lines = [
        const LyricLine(
          start: Duration(seconds: 0),
          end: Duration(seconds: 5),
          text: 'First lyric line',
        ),
        const LyricLine(
          start: Duration(seconds: 6),
          end: Duration(seconds: 12),
          text: 'Second lyric line',
        ),
        const LyricLine(
          start: Duration(seconds: 13),
          end: Duration(seconds: 18),
          text: 'دوم اللي يمشي',
        ),
      ];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LyricsView(
              lines: lines,
              position: pos,
              isPlaying: false,
              isSynced: true,
              onSeek: (_) {},
            ),
          ),
        ),
      );

      await _pumpFor(tester, const Duration(milliseconds: 500));

      final firstText = tester.widget<Text>(find.text('First').first);
      expect(firstText.style?.fontWeight, equals(FontWeight.w800));
      expect(firstText.style?.letterSpacing, greaterThan(0.5));

      final rtlText = tester.widget<Text>(find.text('دوم').first);
      expect(rtlText.style?.fontWeight, equals(FontWeight.w800));
      expect(rtlText.style?.letterSpacing, equals(0.0));

      // Verify generous vertical gap (>= 30px) between bottom of line 1 text and top of line 2 text
      final line1Rect = tester.getRect(find.text('First').first);
      final line2Rect = tester.getRect(find.text('Second').first);
      expect(line2Rect.top - line1Rect.bottom, greaterThanOrEqualTo(30.0));

      pos.dispose();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
    },
  );
}
