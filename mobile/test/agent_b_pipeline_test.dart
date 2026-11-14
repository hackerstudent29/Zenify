import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/lyrics_service.dart';
import 'package:mobile/services/library_store.dart';
import 'package:mobile/utils/media_normalizer.dart';

class _MockMemoryStorage implements LibraryStorage {
  final Map<String, String> _store = {};
  String? currentUserId;

  String get _key => (currentUserId != null && currentUserId!.isNotEmpty)
      ? 'library_user_$currentUserId'
      : 'library_v1';

  @override
  Future<String?> read() async => _store[_key];

  @override
  Future<void> write(String json) async {
    _store[_key] = json;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TASK 1: Language Routing & Cross-Language Rejection', () {
    test('Track correctly preserves language and detects Indic script', () {
      final teluguTrack = Track.fromJson({
        'id': 'yt-test-telugu',
        'title': 'Chuttamalle (From "Devara Part 1") (Telugu)',
        'artist': 'Anirudh Ravichander, Shilpa Rao',
        'album': 'Devara Part 1',
      });
      expect(teluguTrack.language, equals('telugu'));

      final tamilTrack = Track.fromJson({
        'id': 'yt-test-tamil',
        'title': 'Hukum - Thalaivar Alappara (From "Jailer") (Tamil)',
        'artist': 'Anirudh Ravichander',
        'album': 'Jailer',
      });
      expect(tamilTrack.language, equals('tamil'));
    });

    test('Strict bidirectional language collision rejection', () {
      const tamilLyrics = 'கண்ணே கலைமானே கன்னி மயிலென கண்டேன் உனை நானே\nஅன்பே அன்பே என் காதலே';
      const teluguLyrics = 'కన్నుల దాచిన కలలన్నీ నీవేనే ప్రియతమా\nప్రేమ ప్రేమ నా ప్రాణమా';
      const romanizedTamil = 'anbe anbe en kaadhal unmai ennai paathu pesu';
      const romanizedTelugu = 'neetho nenu kalisi unna prema raave cheliya';

      // Telugu song MUST reject Tamil script and Tamil romanized lyrics
      expect(LyricsService.isLanguageCompatible(tamilLyrics, 'telugu'), isFalse);
      expect(LyricsService.isLanguageCompatible(romanizedTamil, 'telugu'), isFalse);

      // Tamil song MUST reject Telugu script and Telugu romanized lyrics
      expect(LyricsService.isLanguageCompatible(teluguLyrics, 'tamil'), isFalse);
      expect(LyricsService.isLanguageCompatible(romanizedTelugu, 'tamil'), isFalse);

      // Compatible lyrics pass cleanly
      expect(LyricsService.isLanguageCompatible(teluguLyrics, 'telugu'), isTrue);
      expect(LyricsService.isLanguageCompatible(romanizedTelugu, 'telugu'), isTrue);
      expect(LyricsService.isLanguageCompatible(tamilLyrics, 'tamil'), isTrue);
      expect(LyricsService.isLanguageCompatible(romanizedTamil, 'tamil'), isTrue);
    });
  });

  group('TASK 2: Track Artwork Resolution & Preservation', () {
    test('Preserves official Google UserContent CDN resolution variants', () {
      const googleCdn = 'https://lh3.googleusercontent.com/abc123xyz=w120-h120-l90-rj';
      final upgraded = MediaNormalizer.upgradeArtworkUrl(googleCdn, targetSize: 1200);
      expect(upgraded, contains('=w1200-h1200-l90-rj'));

      final banner = MediaNormalizer.upgradeBannerUrl(googleCdn);
      expect(banner, contains('=w1920-h1080-p-l90-rj'));
    });

    test('Tracks carry exact coverUrl without fallback corruption', () {
      final track = Track(
        id: 'yt-12345',
        title: 'Track Title',
        artist: 'Artist',
        album: 'Album',
        coverUrl: 'https://lh3.googleusercontent.com/test-artwork=w544-h544-l90-rj',
      );
      expect(track.coverUrl, contains('googleusercontent.com'));
      expect(track.coverUrl, contains('test-artwork'));
    });
  });

  group('TASK 3: Album & Artist Browse ID Routing', () {
    test('Track models carry albumBrowseId and preserve it across JSON serialization', () {
      final track = Track(
        id: 'yt-song-1',
        title: 'Arabic Kuthu',
        artist: 'Anirudh Ravichander',
        album: 'Beast',
        albumBrowseId: 'MPREb_beast123',
        coverUrl: 'https://cover.jpg',
      );
      expect(track.albumBrowseId, equals('MPREb_beast123'));

      final json = track.toJson();
      expect(json['albumBrowseId'], equals('MPREb_beast123'));

      final reconstituted = Track.fromJson(json);
      expect(reconstituted.albumBrowseId, equals('MPREb_beast123'));
    });

    test('Single releases with no browseId do not trigger false fuzzy album searches', () {
      final singleTrack = Track(
        id: 'yt-single-1',
        title: 'Fear Song',
        artist: 'Anirudh Ravichander',
        album: 'Single',
        albumBrowseId: null,
        coverUrl: 'https://cover.jpg',
      );
      expect(singleTrack.album, equals('Single'));
      expect(singleTrack.albumBrowseId, isNull);
    });
  });

  group('TASK 5: Per-User Library Isolation', () {
    test('User 1 and User 2 library stores are strictly isolated', () async {
      final mock = _MockMemoryStorage();
      mock.currentUserId = 'user-alpha';
      LibraryStore.storage = mock;

      // User 1 signs in and saves an album & likes a song
      await LibraryStore.instance.switchUser('user-alpha');
      expect(LibraryStore.instance.activeUserId, equals('user-alpha'));

      final trackA = Track(id: 'song-1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', coverUrl: 'https://c1.jpg');
      LibraryStore.instance.toggleLike(trackA);
      LibraryStore.instance.toggleAlbum('Album 1', 'Artist 1', 'https://cover1.jpg');
      await Future<void>.delayed(const Duration(milliseconds: 20));

      expect(LibraryStore.instance.isLiked(trackA), isTrue);
      expect(LibraryStore.instance.isAlbumSaved('Album 1', 'Artist 1'), isTrue);

      // User 2 signs in: MUST be completely isolated with 0 items from User 1
      mock.currentUserId = 'user-beta';
      await LibraryStore.instance.switchUser('user-beta');
      expect(LibraryStore.instance.activeUserId, equals('user-beta'));
      expect(LibraryStore.instance.isLiked(trackA), isFalse);
      expect(LibraryStore.instance.isAlbumSaved('Album 1', 'Artist 1'), isFalse);
      expect(LibraryStore.instance.likedTracks, isEmpty);
      expect(LibraryStore.instance.savedAlbums, isEmpty);

      // User 2 likes their own song
      final trackB = Track(id: 'song-2', title: 'Song 2', artist: 'Artist 2', album: 'Album 2', coverUrl: 'https://c2.jpg');
      LibraryStore.instance.toggleLike(trackB);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(LibraryStore.instance.isLiked(trackB), isTrue);

      // Switching back to User 1 restores User 1 items cleanly
      mock.currentUserId = 'user-alpha';
      await LibraryStore.instance.switchUser('user-alpha');
      expect(LibraryStore.instance.isLiked(trackA), isTrue);
      expect(LibraryStore.instance.isAlbumSaved('Album 1', 'Artist 1'), isTrue);
      expect(LibraryStore.instance.isLiked(trackB), isFalse);

      // Sign out clears memory
      mock.currentUserId = null;
      LibraryStore.instance.clearForSignOut();
      expect(LibraryStore.instance.activeUserId, isNull);
      expect(LibraryStore.instance.likedTracks, isEmpty);
      expect(LibraryStore.instance.savedAlbums, isEmpty);
    });
  });
}
