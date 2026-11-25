import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/album_resolver.dart';

Track _audioTrack({
  String id = 'yt-song1',
  String title = 'Pathala Pathala (From "Vikram")',
  String artist = 'Anirudh Ravichander, Kamal Haasan',
  String album = 'Vikram',
  String? albumBrowseId = 'MPREb_vikram123',
  bool isVideo = false,
}) =>
    Track(
      id: id,
      title: title,
      artist: artist,
      album: album,
      coverUrl: 'https://lh3.googleusercontent.com/cover=w544-h544',
      albumBrowseId: albumBrowseId,
      isVideo: isVideo,
    );

void main() {
  group('AlbumResolver video classification', () {
    test('detects explicit video flag and Music Video album/title markers', () {
      expect(AlbumResolver.isVideoTrack(_audioTrack(isVideo: true)), isTrue);
      expect(
        AlbumResolver.isVideoTrack(_audioTrack(album: 'Music Video')),
        isTrue,
      );
      expect(
        AlbumResolver.isVideoTrack(
          _audioTrack(title: 'Katchi Sera [Official Video]', album: 'Single'),
        ),
        isTrue,
      );
      expect(
        AlbumResolver.isVideoTrack(
          _audioTrack(title: 'Katchi Sera', album: 'Katchi Sera - Single'),
        ),
        isFalse,
      );
    });

    test('resolveValidatedParentAlbumForTrack returns null for video songs', () async {
      final video = _audioTrack(
        title: 'Arabic Kuthu (Official Music Video)',
        album: 'Beast',
        isVideo: true,
      );
      final resolved = await AlbumResolver.resolveValidatedParentAlbumForTrack(video);
      expect(resolved, isNull);
    });
  });

  group('AlbumResolver browseId and release title classification', () {
    test('accepts only MPREb_, OLAK5uy_, or library album browse IDs', () {
      expect(AlbumResolver.isValidAlbumBrowseId('MPREb_abc123'), isTrue);
      expect(AlbumResolver.isValidAlbumBrowseId('OLAK5uy_xyz987'), isTrue);
      expect(AlbumResolver.sanitizeAlbumBrowseId('PL123456'), isNull);
      expect(AlbumResolver.sanitizeAlbumBrowseId('RDAMVM123'), isNull);
      expect(AlbumResolver.sanitizeAlbumBrowseId('UC_channel_id'), isNull);
      expect(AlbumResolver.sanitizeAlbumBrowseId(''), isNull);
    });

    test('distinguishes Single titles from Album titles and noise', () {
      expect(AlbumResolver.isSingleReleaseTitle('Katchi Sera - Single'), isTrue);
      expect(AlbumResolver.isSingleReleaseTitle('Aasa Kooda (Single)'), isTrue);
      expect(AlbumResolver.isSingleReleaseTitle('Single'), isTrue);
      expect(AlbumResolver.isSingleReleaseTitle('Vikram'), isFalse);

      expect(AlbumResolver.isValidAlbumTitle('Single'), isFalse);
      expect(AlbumResolver.isValidAlbumTitle('Music Video'), isFalse);
      expect(AlbumResolver.isValidAlbumTitle('Unknown Album'), isFalse);
      expect(AlbumResolver.isValidAlbumTitle('UCxyz'), isFalse);
      expect(AlbumResolver.isValidAlbumTitle('Vikram'), isTrue);
    });

    test('extracts soundtrack attribution from (From "Movie") titles', () {
      expect(
        AlbumResolver.extractSoundtrackName('Pathala Pathala (From "Vikram")'),
        'Vikram',
      );
      expect(
        AlbumResolver.extractSoundtrackName("Naatu Naatu [From 'RRR']"),
        'RRR',
      );
      expect(
        AlbumResolver.extractSoundtrackName('Theme (From "Spider-Man\'s Story")'),
        "Spider-Man's Story",
      );
      expect(AlbumResolver.extractSoundtrackName('Katchi Sera'), isNull);
    });
  });

  group('AlbumResolver variant conflict detection', () {
    test('rejects Unplugged, Lofi, Slowed, Remix, Cover, Live for standard tracks', () {
      const source = 'Katchi Sera';
      expect(AlbumResolver.isVariantConflict(source, 'Katchi Sera (Unplugged)'), isTrue);
      expect(AlbumResolver.isVariantConflict(source, 'Katchi Sera - Lofi'), isTrue);
      expect(AlbumResolver.isVariantConflict(source, 'Katchi Sera (Slowed + Reverb)'), isTrue);
      expect(AlbumResolver.isVariantConflict(source, 'Katchi Sera Acoustic Version'), isTrue);
      expect(AlbumResolver.isVariantConflict(source, 'Katchi Sera (Cover)'), isTrue);
      expect(AlbumResolver.isVariantConflict(source, 'Katchi Sera (Live)'), isTrue);
      expect(AlbumResolver.isVariantConflict(source, 'Katchi Sera Instrumental'), isTrue);
    });

    test('permits matching variant when source track already has the variant marker', () {
      expect(
        AlbumResolver.isVariantConflict(
          'Katchi Sera (Unplugged)',
          'Katchi Sera (Unplugged Edition)',
        ),
        isFalse,
      );
      expect(
        AlbumResolver.isVariantConflict(
          'Pathala Pathala (From "Vikram")',
          'Vikram (Original Motion Picture Soundtrack)',
        ),
        isFalse,
      );
    });
  });

  group('AlbumResolver strict album validation', () {
    test('rejects Unplugged album, wrong artist, playlist ID, and non-matching tracklists', () {
      final song = _audioTrack(
        title: 'Katchi Sera',
        artist: 'Sai Abhyankkar',
        album: 'Katchi Sera - Single',
      );

      // Unplugged variant rejected
      expect(
        AlbumResolver.isValidAlbumForTrack(
          song: song,
          candidateAlbumTitle: 'Katchi Sera (Unplugged)',
          candidateArtist: 'Sai Abhyankkar',
          candidateBrowseId: 'MPREb_unplugged1',
          albumTracks: [
            _audioTrack(
              title: 'Katchi Sera (Unplugged)',
              artist: 'Sai Abhyankkar',
              album: 'Katchi Sera (Unplugged)',
            ),
          ],
        ),
        isFalse,
      );

      // Playlist browse ID rejected
      expect(
        AlbumResolver.isValidAlbumForTrack(
          song: song,
          candidateAlbumTitle: 'Best Tamil Hits',
          candidateArtist: 'Sai Abhyankkar',
          candidateBrowseId: 'PL_playlist_999',
          albumTracks: [song],
        ),
        isFalse,
      );

      // Wrong artist rejected
      expect(
        AlbumResolver.isValidAlbumForTrack(
          song: song,
          candidateAlbumTitle: 'Some Other Album',
          candidateArtist: 'Completely Different Artist',
          candidateBrowseId: 'MPREb_other1',
          albumTracks: [
            _audioTrack(
              title: 'Katchi Sera',
              artist: 'Completely Different Artist',
              album: 'Some Other Album',
            ),
          ],
        ),
        isFalse,
      );

      // Album that does not contain the song title rejected
      expect(
        AlbumResolver.isValidAlbumForTrack(
          song: song,
          candidateAlbumTitle: 'Aasa Kooda - EP',
          candidateArtist: 'Sai Abhyankkar',
          candidateBrowseId: 'MPREb_wrong_album',
          albumTracks: [
            _audioTrack(
              title: 'Aasa Kooda',
              artist: 'Sai Abhyankkar',
              album: 'Aasa Kooda - EP',
            ),
          ],
        ),
        isFalse,
      );

      // Video tracks are always blocked from album validation
      expect(
        AlbumResolver.isValidAlbumForTrack(
          song: _audioTrack(
            title: 'Katchi Sera',
            artist: 'Sai Abhyankkar',
            album: 'Music Video',
            isVideo: true,
          ),
          candidateAlbumTitle: 'Katchi Sera - Single',
          candidateArtist: 'Sai Abhyankkar',
          candidateBrowseId: 'MPREb_valid1',
        ),
        isFalse,
      );
    });

    test('accepts authentic soundtrack album containing the track with overlapping artist', () {
      final song = _audioTrack();
      final otherAlbumTrack = _audioTrack(
        id: 'yt-song2',
        title: 'Vikram Title Track',
        artist: 'Anirudh Ravichander',
        album: 'Vikram (Original Motion Picture Soundtrack)',
      );

      expect(
        AlbumResolver.isValidAlbumForTrack(
          song: song,
          candidateAlbumTitle: 'Vikram (Original Motion Picture Soundtrack)',
          candidateArtist: 'Anirudh Ravichander',
          candidateBrowseId: 'MPREb_vikram123',
          albumTracks: [otherAlbumTrack, song],
        ),
        isTrue,
      );
    });
  });
}
