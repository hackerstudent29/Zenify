import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/innertube_service.dart';
import 'package:mobile/utils/media_normalizer.dart';

void main() {
  group('MediaNormalizer.cleanVideoTitle', () {
    test('extracts exact song name from messy cinema pipe and banner titles', () {
      expect(
        MediaNormalizer.cleanVideoTitle(
          'Monica - Video Song | COOLIE | Superstar Rajinikanth | Sun Pictures | Lokesh | Anirudh | Pooja Hegde',
          knownArtists: 'Anirudh Ravichander',
          knownMovieOrAlbum: 'Coolie',
        ),
        'Monica',
      );

      expect(
        MediaNormalizer.cleanVideoTitle(
          'LEO - Naa Ready Lyric Video | Thalapathy Vijay | Lokesh Kanagaraj | Anirudh Ravichander',
          knownArtists: 'Anirudh Ravichander',
        ),
        'Naa Ready',
      );

      expect(
        MediaNormalizer.cleanVideoTitle(
          '4K Video | Katchi Sera (Official Video) | Sai Abhyankkar | Think Music India',
          knownArtists: 'Sai Abhyankkar',
        ),
        'Katchi Sera',
      );

      expect(
        MediaNormalizer.cleanVideoTitle(
          'Chikitu Vibe Video Song 4K #Coolie #Anirudh',
          knownArtists: 'Anirudh Ravichander',
        ),
        'Chikitu Vibe',
      );
    });

    test('strips known artist prefix on "Artist - Song" without breaking hyphenated song titles', () {
      expect(
        MediaNormalizer.cleanVideoTitle(
          'The Weeknd - Blinding Lights (Official Video)',
          knownArtists: 'The Weeknd',
        ),
        'Blinding Lights',
      );

      expect(
        MediaNormalizer.cleanVideoTitle(
          'Hukum - Thalaivar Alappara | Jailer | Superstar Rajinikanth | Sun Pictures | Anirudh Ravichander',
          knownArtists: 'Anirudh Ravichander',
        ),
        'Hukum - Thalaivar Alappara',
      );

      expect(
        MediaNormalizer.cleanVideoTitle(
          'Anti-Hero (Official Music Video)',
          knownArtists: 'Taylor Swift',
        ),
        'Anti-Hero',
      );
    });

    test('prefers clean descriptionTitle when raw YouTube video title is cluttered', () {
      expect(
        MediaNormalizer.cleanVideoTitle(
          '#Coolie Exclusive Video Promo | Some Director | Sun Pictures',
          knownMovieOrAlbum: 'Coolie',
          descriptionTitle: 'Disco Disco',
        ),
        'Disco Disco',
      );
    });
  });

  group('Distributor, production banner, actor & director exclusion', () {
    test('detects movie banners and music labels as distributors', () {
      expect(MediaNormalizer.isDistributorOrLabel('Sun Pictures'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Red Giant Movies'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Hombale Films'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Mythri Movie Makers'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('DVV Entertainment'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Lyca Productions'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Think Music India'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Sony Music South'), isTrue);

      expect(MediaNormalizer.isDistributorOrLabel('Anirudh Ravichander'), isFalse);
      expect(MediaNormalizer.isDistributorOrLabel('A.R. Rahman'), isFalse);
      expect(MediaNormalizer.isDistributorOrLabel('Shreya Ghoshal'), isFalse);
    });

    test('extractArtistsFromDescription extracts vocalists and composer while ignoring cast/producers/directors', () {
      const desc = '''
Song: Monica
Movie: Coolie
Starring: Superstar Rajinikanth, Pooja Hegde, Nagarjuna
Directed by: Lokesh Kanagaraj
Produced by: Kalanithi Maran
Banner: Sun Pictures
Singers: Anirudh Ravichander, Sublahshini
Music: Anirudh Ravichander
Lyrics: Vishnu Edavan
Music Label: Sony Music South
Released on: 2025-07-11
''';
      expect(MediaNormalizer.extractTitleFromDescription(desc), 'Monica');
      expect(MediaNormalizer.extractMovieOrAlbumFromDescription(desc), 'Coolie');
      expect(
        MediaNormalizer.extractArtistsFromDescription(desc),
        'Anirudh Ravichander & Sublahshini',
      );
      expect(MediaNormalizer.extractYearFromDescription(desc), '2025');
    });

    test('extractArtistsFromDescription merges distinct singer and composer credits', () {
      const desc = '''
Vocals: Shreya Ghoshal
Music Composed by: A.R. Rahman
Cinematography: Ravi Varman
Executive Producer: Madras Talkies
''';
      expect(
        MediaNormalizer.extractArtistsFromDescription(desc),
        'Shreya Ghoshal & A.R. Rahman',
      );
    });

    test('extractArtistsFromVideoTitle rejects Starring, Directed by, Produced by and labels', () {
      const messyTitle =
          'Monica - Video Song | Movie: COOLIE | Starring: Rajinikanth | Directed by: Lokesh Kanagaraj | Produced by: Sun Pictures | Music: Anirudh Ravichander';
      expect(
        MediaNormalizer.extractArtistsFromVideoTitle(messyTitle),
        'Anirudh Ravichander',
      );
    });
  });

  group('InnerTubeService.needsVideoEnrichment', () {
    test('flags noisy titles, distributor artists, and missing years accurately', () {
      final dirty = Track(
        id: 'yt-vid1',
        title: 'LEO - Naa Ready - Video Song | Thalapathy Vijay | Sun Pictures',
        artist: 'Sun Pictures',
        album: 'Music Video',
        coverUrl: '',
        isVideo: true,
      );
      expect(dirty.title, 'Naa Ready');
      expect(dirty.artist, isEmpty);
      expect(
        InnerTubeService.needsVideoEnrichment(dirty, requireYear: true),
        isTrue,
      );

      final artistOnlyDirtyYear = Track(
        id: 'yt-vid3',
        title: 'Monica',
        artist: 'Anirudh Ravichander',
        album: 'Music Video',
        coverUrl: '',
        isVideo: true,
      );
      expect(
        InnerTubeService.needsVideoEnrichment(artistOnlyDirtyYear, requireYear: true),
        isTrue,
      );
      expect(
        InnerTubeService.needsVideoEnrichment(artistOnlyDirtyYear, requireYear: false),
        isFalse,
      );

      final clean = Track(
        id: 'yt-vid2',
        title: 'Monica',
        artist: 'Anirudh Ravichander',
        album: 'Music Video',
        coverUrl: '',
        isVideo: true,
        year: '2025',
      );
      expect(
        InnerTubeService.needsVideoEnrichment(clean, requireYear: true),
        isFalse,
      );
    });
  });
}
