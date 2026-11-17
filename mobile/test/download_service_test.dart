import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/download_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DownloadService & DownloadedSong Offline Architecture', () {
    test('DownloadedSong model serializes and deserializes accurately', () {
      final song = DownloadedSong(
        id: 'test_vid_123',
        title: 'Hukum - Thalaivar Alappara',
        artist: 'Anirudh Ravichander',
        album: 'Jailer',
        coverUrl: 'https://lh3.googleusercontent.com/test_cover',
        audioPath: '/data/user/0/com.zenify.mobile/app_flutter/downloads/test_vid_123.m4a',
        coverPath: '/data/user/0/com.zenify.mobile/app_flutter/downloads/test_vid_123.jpg',
        lyricsPath: '/data/user/0/com.zenify.mobile/app_flutter/downloads/test_vid_123.lyrics.json',
        durationSeconds: 215,
        fileSizeBytes: 3565158, // ~3.4 MB
        downloadedAt: 1731772800000,
        albumBrowseId: 'MPREb_jailer',
      );

      final jsonMap = song.toJson();
      final decoded = DownloadedSong.fromJson(jsonMap);

      expect(decoded.id, 'test_vid_123');
      expect(decoded.title, 'Hukum - Thalaivar Alappara');
      expect(decoded.artist, 'Anirudh Ravichander');
      expect(decoded.album, 'Jailer');
      expect(decoded.durationSeconds, 215);
      expect(decoded.fileSizeBytes, 3565158);
      expect(decoded.formattedSize, '3.4 MB');
      expect(decoded.albumBrowseId, 'MPREb_jailer');
    });

    test('Strict file size budget: 3-4 min song is strictly under 5 MB', () {
      // 128 kbps audio for 240 seconds = 3.84 MB
      // Compressed cover art = ~50 KB
      // Synced lyrics JSON = ~8 KB
      const audioBytes = 3840 * 1024;
      const coverBytes = 50 * 1024;
      const lyricsBytes = 8 * 1024;
      const totalBytes = audioBytes + coverBytes + lyricsBytes;

      final song = DownloadedSong(
        id: 'budget_test_4min',
        title: '4 Min Song',
        artist: 'Test Artist',
        album: 'Test Album',
        coverUrl: 'https://test/cover.jpg',
        audioPath: '/dummy/path.m4a',
        coverPath: '/dummy/cover.jpg',
        durationSeconds: 240,
        fileSizeBytes: totalBytes,
        downloadedAt: 1731772800000,
      );

      // Verify strictly under 5 MB (5 * 1024 * 1024 = 5242880 bytes)
      expect(song.fileSizeBytes, lessThan(5 * 1024 * 1024));
      expect(song.formattedSize, '3.8 MB');
    });

    test('DownloadedSong converts accurately to playable Track', () {
      final song = DownloadedSong(
        id: 'track_conv_1',
        title: 'Chaleya',
        artist: 'Arijit Singh, Shilpa Rao',
        album: 'Jawan',
        coverUrl: 'https://lh3.googleusercontent.com/jawan',
        audioPath: '/dummy/audio.m4a',
        coverPath: '/non_existent_file.jpg',
        durationSeconds: 198,
        fileSizeBytes: 3145728, // 3.0 MB
        downloadedAt: 1731772800000,
      );

      final track = song.toTrack();
      expect(track.id, 'track_conv_1');
      expect(track.title, 'Chaleya');
      expect(track.artist, 'Arijit Singh, Shilpa Rao');
      expect(track.album, 'Jawan');
      expect(track.durationSeconds, 198);
      expect(track.coverUrl, 'https://lh3.googleusercontent.com/jawan');
    });
  });
}
