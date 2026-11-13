import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/models/track.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/services/queue_state.dart';
import 'package:mobile/views/lyrics/lyrics_sheet.dart';
import 'package:mobile/views/player/player_shell.dart';

class _TestPlayerState extends PlayerState {
  final Track _track = Track(
    id: 'track-1',
    title: 'After Hours',
    artist: 'The Weeknd',
    album: 'After Hours',
    coverUrl: '',
    durationSeconds: 210,
  );

  @override
  Track? get currentTrack => _track;

  @override
  Duration get duration => const Duration(seconds: 210);

  @override
  bool get isPlaying => false;

  @override
  bool get isCurrentVideo => false;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'PlayerShell moves artwork on Lyrics open while keeping artist names & all buttons visible, then hides chrome after 3s idle',
      (tester) async {
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
                    lyricsBuilder: (_) => const SizedBox.expand(
                      child: ColoredBox(
                        key: ValueKey('mock_lyrics_body'),
                        color: Colors.transparent,
                      ),
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
    expect(find.textContaining(track.artistNames.first), findsAtLeastNWidgets(1));
    expect(find.byIcon(CupertinoIcons.quote_bubble), findsOneWidget);
    expect(find.byIcon(CupertinoIcons.slider_horizontal_3), findsOneWidget);
    expect(find.byIcon(CupertinoIcons.list_bullet), findsOneWidget);

    // Tap Lyrics button -> opens lyrics dim boundary, moves cover, keeps all buttons & artist visible
    await tester.tap(find.byIcon(CupertinoIcons.quote_bubble));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 450));

    expect(find.byKey(const ValueKey('mock_lyrics_body')), findsOneWidget);
    // Dim boundary container wraps lyrics panel with dark gradient & subtle border
    final boundaryDecorations = tester
        .widgetList<DecoratedBox>(
          find.ancestor(
            of: find.byKey(const ValueKey('mock_lyrics_body')),
            matching: find.byType(DecoratedBox),
          ),
        )
        .map((w) => w.decoration)
        .whereType<BoxDecoration>();
    expect(
      boundaryDecorations.any(
        (d) =>
            d.borderRadius == BorderRadius.circular(26) &&
            d.gradient != null &&
            d.border != null,
      ),
      isTrue,
    );
    // Artist name remains visible next to moved artwork in compact header
    expect(find.textContaining(track.artistNames.first), findsAtLeastNWidgets(1));
    // All transport & tool buttons remain visible when clicking Lyrics
    expect(find.byIcon(CupertinoIcons.shuffle), findsOneWidget);
    expect(find.byIcon(CupertinoIcons.backward_fill), findsOneWidget);
    expect(find.byIcon(CupertinoIcons.play_fill), findsAtLeastNWidgets(1));
    expect(find.byIcon(CupertinoIcons.forward_fill), findsAtLeastNWidgets(1));
    expect(find.byIcon(CupertinoIcons.repeat), findsOneWidget);
    expect(find.byIcon(CupertinoIcons.slider_horizontal_3), findsOneWidget);
    expect(find.byIcon(CupertinoIcons.quote_bubble_fill), findsOneWidget);
    expect(find.byIcon(CupertinoIcons.list_bullet), findsOneWidget);

    // Wait > 3 seconds without interaction -> bottom controls (seekbar, transport, buttons) hide cleanly
    await tester.pump(const Duration(milliseconds: 3100));
    await tester.pump(const Duration(milliseconds: 400));

    final lyricsIconRender = tester.renderObject(
      find.byIcon(CupertinoIcons.quote_bubble_fill),
    );
    expect(lyricsIconRender.paintBounds.isEmpty ||
        tester.widgetList<IgnorePointer>(
          find.ancestor(
            of: find.byIcon(CupertinoIcons.quote_bubble_fill),
            matching: find.byType(IgnorePointer),
          ),
        ).any((w) => w.ignoring), isTrue);

    // Touching screen wakes all controls back up
    await tester.tap(find.byKey(const ValueKey('mock_lyrics_body')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(
      tester.widgetList<IgnorePointer>(
        find.ancestor(
          of: find.byIcon(CupertinoIcons.quote_bubble_fill),
          matching: find.byType(IgnorePointer),
        ),
      ).any((w) => w.ignoring),
      isFalse,
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 16));
  });

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
      tester.widgetList<IgnorePointer>(
        find.ancestor(of: syncFinder, matching: find.byType(IgnorePointer)),
      ).any((w) => w.ignoring),
      isTrue,
    );

    immersive.dispose();
    pos.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 16));
  });
}

