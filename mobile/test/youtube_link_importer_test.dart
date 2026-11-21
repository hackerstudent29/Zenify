import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/youtube_link_importer.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('YouTubeLinkImporter Parameter Extraction Tests', () {
    test('extracts playlistId from standard YouTube playlist URL', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://www.youtube.com/playlist?list=PL4fGSI1pDJn6jXS_PEO374384YxpuIOvO',
      );
      expect(p.playlistId, 'PL4fGSI1pDJn6jXS_PEO374384YxpuIOvO');
      expect(p.videoId, isNull);
    });

    test('extracts playlistId from YouTube Music playlist URL', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://music.youtube.com/playlist?list=RDCLAK5uy_kmPRjFh2',
      );
      expect(p.playlistId, 'RDCLAK5uy_kmPRjFh2');
    });

    test('extracts playlistId from URL with VL prefix', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://music.youtube.com/playlist?list=VLPLxyz123',
      );
      expect(p.playlistId, 'VLPLxyz123');
    });

    test('extracts albumId from YouTube Music browse URL', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://music.youtube.com/browse/MPREb_V756f7v8k',
      );
      expect(p.albumId, 'MPREb_V756f7v8k');
    });

    test('extracts albumId from OLAK playlist URL', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://music.youtube.com/playlist?list=OLAK5uy_k123456',
      );
      expect(p.playlistId, 'OLAK5uy_k123456');
    });

    test('extracts videoId from youtu.be short URL', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://youtu.be/dQw4w9WgXcQ',
      );
      expect(p.videoId, 'dQw4w9WgXcQ');
    });

    test('extracts videoId and playlistId from watch URL with list param', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345',
      );
      expect(p.videoId, 'dQw4w9WgXcQ');
      expect(p.playlistId, 'PL12345');
    });

    test('extracts clean URL when text is surrounded by chat message', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'Listen to this playlist bro: https://music.youtube.com/playlist?list=PLsuper123 check it out',
      );
      expect(p.playlistId, 'PLsuper123');
    });

    test('extracts bare playlist ID starting with PL or OLAK', () {
      final p = YouTubeLinkImporter.extractParametersForTesting('PLabc123456789');
      expect(p.playlistId, 'PLabc123456789');
    });

    test('extracts bare video ID of length 11', () {
      final p = YouTubeLinkImporter.extractParametersForTesting('dQw4w9WgXcQ');
      expect(p.videoId, 'dQw4w9WgXcQ');
    });

    test('extracts YouTube Music playlist with tracking si parameter', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://music.youtube.com/playlist?list=PL16Or56vcoYEYVAPNUiSp0cKVYZyu_9wF&si=abc123xyz',
      );
      expect(p.playlistId, 'PL16Or56vcoYEYVAPNUiSp0cKVYZyu_9wF');
    });

    test('extracts YouTube Music playlist with trailing slash before query', () {
      final p = YouTubeLinkImporter.extractParametersForTesting(
        'https://music.youtube.com/playlist/?list=PL16Or56vcoYEYVAPNUiSp0cKVYZyu_9wF',
      );
      expect(p.playlistId, 'PL16Or56vcoYEYVAPNUiSp0cKVYZyu_9wF');
    });
  });
}
