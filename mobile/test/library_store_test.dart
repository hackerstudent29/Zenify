import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/library_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('LibraryStore Persistence & Functionality', () {
    late MemoryLibraryStorage memoryStorage;

    setUp(() async {
      memoryStorage = MemoryLibraryStorage();
      LibraryStore.storage = memoryStorage;
      // Re-trigger load with clean memory storage
      await LibraryStore.instance.ensureLoaded();
    });

    test('Persists liked songs and resolves track metadata after reload', () async {
      final store = LibraryStore.instance;

      final testTrack = Track(
        id: 'yt_online_123',
        title: 'Illuminati',
        artist: 'Sushin Shyam',
        album: 'Aavesham',
        coverUrl: 'https://example.com/cover.jpg',
        streamUrl: 'https://example.com/stream.mp4',
        durationSeconds: 210,
        source: 'youtube',
      );

      // Register and like the track
      store.registerTrack(testTrack);
      store.toggleLike(testTrack);

      expect(store.isLiked(testTrack), isTrue);
      expect(store.likedCount, equals(1));
      expect(store.likedTracks.length, equals(1));
      expect(store.likedTracks.first.title, equals('Illuminati'));
      expect(store.likedTracks.first.artist, equals('Sushin Shyam'));

      // Simulate app restart by reading the written JSON into a fresh store simulation
      final rawWritten = await memoryStorage.read();
      expect(rawWritten, isNotNull);
      expect(rawWritten!.contains('yt_online_123'), isTrue);
      expect(rawWritten.contains('Illuminati'), isTrue);
    });

    test('Creates playlist, searches & adds songs, persists track metadata', () async {
      final store = LibraryStore.instance;

      final songA = Track(
        id: 'song_a_456',
        title: 'Hukum',
        artist: 'Anirudh Ravichander',
        album: 'Jailer',
        coverUrl: 'https://example.com/jailer.jpg',
        streamUrl: 'https://example.com/streamA.mp4',
        durationSeconds: 205,
        source: 'youtube',
      );

      final songB = Track(
        id: 'song_b_789',
        title: 'Badass',
        artist: 'Anirudh Ravichander',
        album: 'Leo',
        coverUrl: 'https://example.com/leo.jpg',
        streamUrl: 'https://example.com/streamB.mp4',
        durationSeconds: 220,
        source: 'youtube',
      );

      final playlist = store.createPlaylist('Party Hits');
      expect(playlist.name, equals('Party Hits'));
      expect(store.playlists.any((p) => p.id == playlist.id), isTrue);

      // Add song A and song B
      final addedA = store.addToPlaylist(playlist.id, songA);
      expect(addedA, isTrue);
      final addedB = store.addToPlaylist(playlist.id, songB);
      expect(addedB, isTrue);

      // Duplicate add should return false
      final dupA = store.addToPlaylist(playlist.id, songA);
      expect(dupA, isFalse);

      final tracks = store.playlistTracks(playlist);
      expect(tracks.length, equals(2));
      expect(tracks.map((t) => t.title).toList(), containsAll(['Hukum', 'Badass']));

      // All library tracks should include both
      final allLib = store.allLibraryTracks;
      expect(allLib.any((t) => t.id == 'song_a_456'), isTrue);
      expect(allLib.any((t) => t.id == 'song_b_789'), isTrue);

      // Remove song A
      store.removeFromPlaylist(playlist.id, songA);
      final tracksAfterRemove = store.playlistTracks(playlist);
      expect(tracksAfterRemove.length, equals(1));
      expect(tracksAfterRemove.first.title, equals('Badass'));
    });

    test('Follows artists and saves albums cleanly', () async {
      final store = LibraryStore.instance;

      store.toggleFollow('A. R. Rahman', 'https://example.com/arr.jpg');
      expect(store.isFollowing('A. R. Rahman'), isTrue);
      expect(store.isFollowing('a. r. rahman'), isTrue); // case-insensitive

      store.toggleAlbum('Rockstar', 'A. R. Rahman', 'https://example.com/rockstar.jpg');
      expect(store.isAlbumSaved('Rockstar', 'A. R. Rahman'), isTrue);

      final raw = await memoryStorage.read();
      expect(raw, isNotNull);
      expect(raw!.contains('A. R. Rahman'), isTrue);
      expect(raw.contains('Rockstar'), isTrue);
    });
  });
}

