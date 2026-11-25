import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:mobile/design_system/widgets/dynamic_island_header.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/library_store.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/services/queue_state.dart';
import 'package:mobile/views/player/player_shell.dart';

class _TestPlayerState extends PlayerState {
  final Track _track = Track(
    id: 'yt-p8_ugAjWI5I',
    title: 'São Paulo',
    artist: 'The Weeknd & Anitta',
    album: 'Hurry Up Tomorrow',
    coverUrl: '',
    durationSeconds: 302,
  );

  bool _playing = true;

  @override
  Track? get currentTrack => _track;

  @override
  Duration get duration => const Duration(seconds: 302);

  @override
  bool get isPlaying => _playing;

  @override
  bool get isCurrentVideo => false;

  @override
  bool get hasLyrics => false;

  @override
  Future<void> resume() async {
    _playing = true;
  }
}

Future<void> _drainNotifications(WidgetTester tester) async {
  while (IslandNotifier.instance.current != null ||
      IslandNotifier.instance.isClosing) {
    IslandNotifier.instance.dismiss();
    await tester.pump(const Duration(milliseconds: 600));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('IslandNotification shows song/album name for tracks/albums and artist name only for artists',
      () async {
    final recorded = <IslandNotification>[];
    void capture() {
      final cur = IslandNotifier.instance.current;
      if (cur != null && !recorded.any((e) => e.id == cur.id)) {
        recorded.add(cur);
      }
    }

    IslandNotifier.instance.addListener(capture);
    addTearDown(() => IslandNotifier.instance.removeListener(capture));

    expect(
      IslandNotification.itemTitle('São Paulo', fallback: 'The Weeknd'),
      equals('São Paulo'),
    );
    expect(
      IslandNotification.artistOrTitle(artist: 'The Weeknd', title: 'São Paulo'),
      equals('São Paulo'),
    );

    final track = Track(
      id: 'yt-p8_ugAjWI5I',
      title: 'São Paulo (Official Audio)',
      artist: 'The Weeknd & Anitta',
      album: 'Hurry Up Tomorrow',
      coverUrl: '',
      durationSeconds: 302,
    );

    LibraryStore.instance.toggleLike(track);
    final fav = recorded.last;
    expect(fav.title, equals('Favourited'));
    expect(fav.body, equals('São Paulo'));
    expect(fav.body, isNot(contains('Weeknd')));
    expect(fav.leading, isNotNull);

    // Drain current notification before triggering next
    IslandNotifier.instance.dismiss();
    await Future<void>.delayed(const Duration(milliseconds: 550));

    LibraryStore.instance.toggleAlbum(
      'Hurry Up Tomorrow',
      'The Weeknd',
      '',
    );
    final albumNotif = recorded.last;
    expect(albumNotif.title, equals('Saved'));
    expect(albumNotif.body, equals('Hurry Up Tomorrow'));

    IslandNotifier.instance.dismiss();
    await Future<void>.delayed(const Duration(milliseconds: 550));

    LibraryStore.instance.toggleFollow('The Weeknd', '');
    final artistNotif = recorded.last;
    expect(artistNotif.title, equals('Following'));
    expect(artistNotif.body, equals('The Weeknd'));

    IslandNotifier.instance.dismiss();
    await Future<void>.delayed(const Duration(milliseconds: 550));
  });

  testWidgets(
      'Bulk queue emits single artwork-free count pill and startMix does not reset active song position',
      (tester) async {
    final player = PlayerState();
    final queue = QueueState();
    player.attachQueue(queue);

    final song1 = Track(
      id: 'yt-song1',
      title: 'São Paulo',
      artist: 'The Weeknd',
      album: 'Hurry Up Tomorrow',
      coverUrl: '',
      durationSeconds: 302,
    );
    final song2 = Track(
      id: 'yt-song2',
      title: 'Timeless',
      artist: 'The Weeknd & Playboi Carti',
      album: 'Hurry Up Tomorrow',
      coverUrl: '',
      durationSeconds: 256,
    );
    final song3 = Track(
      id: 'yt-song3',
      title: 'Cry For Me',
      artist: 'The Weeknd',
      album: 'Hurry Up Tomorrow',
      coverUrl: '',
      durationSeconds: 224,
    );

    player.setQueue([song1], startIndex: 0);
    await tester.pump();
    // Simulate song1 already playing partway through
    player.positionNotifier.value = const Duration(seconds: 75);

    // playNext must show song name, not artist name
    player.playNext(song2);
    expect(IslandNotifier.instance.current?.title, equals('Playing Next'));
    expect(IslandNotifier.instance.current?.body, equals('Timeless'));
    expect(IslandNotifier.instance.current?.leading, isNotNull);
    await _drainNotifications(tester);

    // Bulk queueing 2 songs must emit a single pill without artwork
    final addedCount = player.playLastBatch([song2, song3]);
    expect(addedCount, equals(2));
    expect(
      IslandNotifier.instance.current?.title,
      equals('2 songs added to queue'),
    );
    expect(IslandNotifier.instance.current?.body, isNull);
    expect(IslandNotifier.instance.current?.leading, isNull);
    await _drainNotifications(tester);

    // startMix with current song uses trk_ fast path if unbacked by network,
    // verifying active song position is preserved rather than restarted from 0:00
    final localSeed = Track(
      id: 'trk_local_seed',
      title: 'Local Track',
      artist: 'The Weeknd',
      album: 'Album',
      coverUrl: '',
      durationSeconds: 200,
    );
    player.setQueue([localSeed], startIndex: 0);
    await tester.pump();
    player.positionNotifier.value = const Duration(seconds: 92);
    await player.startMix(localSeed);
    expect(player.positionNotifier.value, equals(const Duration(seconds: 92)));

    await tester.pump(const Duration(seconds: 16));
  });

  testWidgets('Dropdown IslandNotification renders over PlayerShell when open',
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
                Positioned.fill(child: PlayerShell(key: shellKey)),
              ],
            ),
          ),
        ),
      ),
    );

    await tester.pump();
    // Notification should NOT show over collapsed PlayerShell
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'closed_test',
        title: '2 songs added to queue',
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.textContaining('2 songs added to queue'), findsNothing);
    await _drainNotifications(tester);

    // Open PlayerShell -> dropdown notification MUST render over PlayerShell
    shellKey.currentState!.openSheet();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    IslandNotifier.instance.show(
      IslandNotification(
        id: 'open_test',
        title: '2 songs added to queue',
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(find.text('2 songs added to queue'), findsOneWidget);

    await _drainNotifications(tester);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 16));
  });
}
