import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/models/track.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/services/queue_state.dart';
import 'package:mobile/views/player/bleed_artwork.dart';
import 'package:mobile/views/player/player_shell.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'PlayerState and PlayerShell pause seekbar & buttons on external audio focus interruption and resume from exact stopped position',
    (tester) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      const eventsChannel = EventChannel('zenify/audio/events');
      const methodChannel = MethodChannel('zenify/audio');
      MockStreamHandlerEventSink? eventSink;

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockStreamHandler(
            eventsChannel,
            MockStreamHandler.inline(
              onListen: (arguments, events) {
                eventSink = events;
              },
              onCancel: (arguments) {
                eventSink = null;
              },
            ),
          );
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(methodChannel, (call) async {
            if (call.method == 'getSystemVolume') return 0.7;
            if (call.method == 'isWifiConnected') return true;
            return null;
          });
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockStreamHandler(eventsChannel, null);
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(methodChannel, null);
      });

      final player = PlayerState();
      final queue = QueueState();
      final shellKey = GlobalKey<PlayerShellState>();

      final track = Track(
        id: 'yt-focus1',
        title: 'Hangova (From "DC")',
        artist: 'Anirudh Ravichander',
        album: 'Hangova (From "DC")',
        coverUrl: '',
        durationSeconds: 210,
      );

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
                  Positioned.fill(child: PlayerShell(key: shellKey)),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      // Establish active playing state at 0:42
      eventSink!.success({'type': 'duration', 'ms': 210000});
      eventSink!.success({'type': 'state', 'value': 'playing', 'buffering': false});
      eventSink!.success({'type': 'position', 'ms': 42000});
      await tester.runAsync(() async {
        await player.setQueue([track], startIndex: 0);
      });
      // Re-assert playing position cleanly after local test queue setup
      eventSink!.success({'type': 'duration', 'ms': 210000});
      eventSink!.success({'type': 'state', 'value': 'playing', 'buffering': false});
      eventSink!.success({'type': 'position', 'ms': 42000});
      await tester.pump(const Duration(milliseconds: 100));

      shellKey.currentState!.openSheet();
      await tester.pump(const Duration(milliseconds: 500));

      expect(player.isPlaying, isTrue);
      expect(player.isInterruptedByAudioFocus, isFalse);
      expect(find.byIcon(CupertinoIcons.pause_fill), findsAtLeastNWidgets(1));
      expect(find.text('0:42'), findsAtLeastNWidgets(1));

      // Simulate another app interrupting audio focus at 42.5s
      eventSink!.success({
        'type': 'position',
        'ms': 42500,
      });
      eventSink!.success({
        'type': 'state',
        'value': 'paused',
        'buffering': false,
      });
      eventSink!.success({
        'type': 'audioFocus',
        'state': 'interrupted',
        'positionMs': 42500,
        'permanent': true,
      });
      await tester.pump(const Duration(milliseconds: 100));

      expect(player.isPlaying, isFalse);
      expect(player.isInterruptedByAudioFocus, isTrue);
      expect(
        player.positionNotifier.value,
        equals(const Duration(milliseconds: 42500)),
      );
      expect(find.byIcon(CupertinoIcons.play_fill), findsAtLeastNWidgets(1));

      // Simulate disturbing app stopping sound -> native resumes at exact stopped position
      eventSink!.success({
        'type': 'audioFocus',
        'state': 'resumed',
        'positionMs': 42500,
      });
      eventSink!.success({
        'type': 'state',
        'value': 'playing',
        'buffering': false,
      });
      await tester.pump(const Duration(milliseconds: 100));

      expect(player.isPlaying, isTrue);
      expect(player.isInterruptedByAudioFocus, isFalse);
      expect(
        player.positionNotifier.value,
        equals(const Duration(milliseconds: 42500)),
      );
      expect(find.byIcon(CupertinoIcons.pause_fill), findsAtLeastNWidgets(1));

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 16));
      player.dispose();
      queue.dispose();
    },
  );

  testWidgets(
    'BleedBackdrop stops scheduling animation frames when paused to save GPU/CPU',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: BleedBackdrop(
            art: null,
            fallback: [Color(0xFF220011), Color(0xFF110022)],
            flow: true,
            isPlaying: true,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));
      expect(tester.binding.transientCallbackCount, greaterThan(0));

      await tester.pumpWidget(
        const MaterialApp(
          home: BleedBackdrop(
            art: null,
            fallback: [Color(0xFF220011), Color(0xFF110022)],
            flow: true,
            isPlaying: false,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));
      expect(tester.binding.transientCallbackCount, equals(0));
    },
  );
}
