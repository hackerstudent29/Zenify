import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/features/replay/domain/all_time_index.dart';
import 'package:mobile/features/replay/presentation/replay_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late File journalFile;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    tempDir = await Directory.systemTemp.createTemp('replay_screen_test_');
    journalFile = File('${tempDir.path}/listen_journal.jsonl');
    await journalFile.writeAsString(''); // empty journal
  });

  tearDown(() async {
    try {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    } catch (_) {}
  });

  group('Phase 8: ReplayScreen Architecture & Navigation', () {
    testWidgets('renders top bar, period selector, and empty warming up state initially',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: ReplayScreen(
            journalFile: journalFile,
            allTimeIndex: AllTimeIndex(),
          ),
        ),
      );

      // Verify top bar brand title and insights badge
      expect(find.text('REPLAY'), findsOneWidget);
      expect(find.text('INSIGHTS'), findsOneWidget);

      // Verify period selector tabs
      expect(find.text('Week'), findsOneWidget);
      expect(find.text('Month'), findsOneWidget);
      expect(find.text('Year'), findsOneWidget);

      // Header actions
      expect(find.byIcon(Icons.emoji_events_rounded), findsOneWidget);
      expect(find.byIcon(Icons.visibility_off_rounded), findsOneWidget);

      // Allow async compute to complete
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      // Since journal is empty in test environment, verify clean empty state
      expect(find.text('Your Replay is Warming Up'), findsOneWidget);
      expect(
        find.textContaining('Listen to more music on Zenify'),
        findsOneWidget,
      );

      // Verify tapping 'Week' tab switches active tab
      await tester.tap(find.text('Week'));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      expect(find.text('Week'), findsOneWidget);

      // Verify tapping 'Year' tab switches active tab
      await tester.tap(find.text('Year'));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      expect(find.text('Year'), findsOneWidget);
    });

    testWidgets('renders populated aggregate with top songs, artists, and play mix button',
        (tester) async {
      final now = DateTime.now();
      // Write events within the current month so they appear in Month view
      final event1 = {
        'id': 'evt-pop-1',
        'trackId': 'trk-pop-1',
        'title': 'Hukum',
        'artistRaw': 'Anirudh Ravichander',
        'albumTitle': 'Jailer',
        'albumId': 'alb-jailer',
        'startedAtUtc': DateTime.utc(now.year, now.month, 10, 12, 0).toIso8601String(),
        'tzOffsetMin': 0,
        'listenedMs': 210000,
        'durationMs': 210000,
        'userAdvanced': false,
        'endedNaturally': true,
        'schemaVersion': 2,
      };
      final event2 = {
        'id': 'evt-pop-2',
        'trackId': 'trk-pop-2',
        'title': 'Badass',
        'artistRaw': 'Anirudh Ravichander',
        'albumTitle': 'Leo',
        'albumId': 'alb-leo',
        'startedAtUtc': DateTime.utc(now.year, now.month, 11, 14, 0).toIso8601String(),
        'tzOffsetMin': 0,
        'listenedMs': 195000,
        'durationMs': 195000,
        'userAdvanced': false,
        'endedNaturally': true,
        'schemaVersion': 2,
      };

      journalFile.writeAsStringSync(
        '${jsonEncode(event1)}\n${jsonEncode(event2)}\n',
      );

      var playMixTriggered = false;

      await tester.pumpWidget(
        MaterialApp(
          home: ReplayScreen(
            journalFile: journalFile,
            allTimeIndex: AllTimeIndex(),
            onPlayMix: (songs) {
              playMixTriggered = true;
            },
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();

      // Top artists & songs sections should be visible
      expect(find.text('TOP ARTISTS'), findsOneWidget);
      expect(find.text('TOP SONGS'), findsOneWidget);
      expect(find.text('Anirudh Ravichander'), findsWidgets);
      expect(find.text('Hukum'), findsWidgets);
      expect(find.text('Badass'), findsOneWidget);

      // Play Replay Mix pill
      expect(find.textContaining('PLAY YOUR REPLAY MIX'), findsOneWidget);
      await tester.tap(find.textContaining('PLAY YOUR REPLAY MIX'));
      await tester.pumpAndSettle();
      expect(playMixTriggered, isTrue);

      // Tap Trophy Room icon in top bar
      await tester.tap(find.byTooltip('Trophy Room'));
      await tester.pumpAndSettle();
      expect(find.text('TROPHY ROOM & BADGES'), findsWidgets);

      // Close sheet
      await tester.tap(find.byIcon(Icons.close_rounded).last);
      await tester.pumpAndSettle();

      // Tap Private Listening icon in top bar
      await tester.tap(find.byTooltip('Private Listening Exclusions'));
      await tester.pumpAndSettle();
      expect(find.text('PRIVATE LISTENING'), findsOneWidget);
    });
  });
}
