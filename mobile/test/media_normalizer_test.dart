import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/utils/media_normalizer.dart';

void main() {
  group('MediaNormalizer', () {
    test('decodes HTML entities correctly', () {
      expect(MediaNormalizer.decodeHtml('Rock &amp; Roll'), 'Rock & Roll');
      expect(MediaNormalizer.decodeHtml('&quot;Hello&quot;'), '"Hello"');
      expect(MediaNormalizer.decodeHtml('Don&#39;t Stop'), "Don't Stop");
      expect(MediaNormalizer.decodeHtml('Artist &lt;New&gt;'), 'Artist <New>');
    });

    test('cleans stray quotes, unbalanced brackets, and language tags', () {
      const raw = '"OM Chapter 1: Udhiram - The Blood Wood") [Tamil]';
      expect(MediaNormalizer.cleanTitle(raw), 'OM Chapter 1: Udhiram - The Blood Wood');
      expect(MediaNormalizer.cleanCompactTitle(raw), 'OM Chapter 1: Udhiram - The Blood Wood');
    });

    test('strips (From "...") only in compactTitle but preserves in cleanTitle', () {
      const titleWithMovie = 'Katchi Sera (From "Think Indie")';
      expect(MediaNormalizer.cleanTitle(titleWithMovie), 'Katchi Sera (From "Think Indie")');
      expect(MediaNormalizer.cleanCompactTitle(titleWithMovie), 'Katchi Sera');
    });

    test('filters out play counts and separators from metadata runs', () {
      expect(MediaNormalizer.isMetadataNoise('736M plays'), isTrue);
      expect(MediaNormalizer.isMetadataNoise('12K views'), isTrue);
      expect(MediaNormalizer.isMetadataNoise('•'), isTrue);
      expect(MediaNormalizer.isMetadataNoise('&'), isTrue);
      expect(MediaNormalizer.isMetadataNoise(','), isTrue);
      expect(MediaNormalizer.isMetadataNoise('3:45'), isTrue);
      expect(MediaNormalizer.isMetadataNoise('Anirudh Ravichander'), isFalse);
    });

    test('formats and de-duplicates artist names', () {
      final formatted = MediaNormalizer.formatArtists(['Atif Aslam', 'Atif Aslam', 'Shiraz Uppal']);
      expect(formatted, 'Atif Aslam & Shiraz Uppal');

      final stringSplit = MediaNormalizer.formatArtists('A.R. Rahman & Sid Sriram, Shreya Ghoshal');
      expect(stringSplit, 'A.R. Rahman, Sid Sriram & Shreya Ghoshal');
    });

    test('handles empty title with fallback', () {
      expect(MediaNormalizer.cleanTitle(''), 'Unknown Title');
      expect(MediaNormalizer.cleanTitle(null), 'Unknown Title');
    });

    test('upgrades low-res image URLs to HD 1200x1200, maxresdefault, avatars, and banners', () {
      expect(
        MediaNormalizer.upgradeArtworkUrl('https://lh3.googleusercontent.com/abc=s120', qualityOverride: 'high'),
        contains('=w800-h800-l75-rj'),
      );
      expect(
        MediaNormalizer.upgradeArtworkUrl(
          'https://lh3.googleusercontent.com/abc=s120',
          isArtistAvatar: true,
          qualityOverride: 'high',
        ),
        contains('=w800-h800-p-l75-rj'),
      );
      expect(
        MediaNormalizer.upgradeBannerUrl('https://lh3.googleusercontent.com/abc=w2880-h1200-p-l90-rj'),
        'https://lh3.googleusercontent.com/abc=w2880-h1200-p-l90-rj',
      );
      expect(
        MediaNormalizer.upgradeBannerUrl('https://lh3.googleusercontent.com/abc=w544-h226-l90-rj', qualityOverride: 'high'),
        'https://lh3.googleusercontent.com/abc=w1920-h1080-p-l85-rj',
      );
      expect(
        MediaNormalizer.upgradeArtworkUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg?sqp=123', qualityOverride: 'high'),
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      );
      // Broken dummy url fallback
      expect(
        MediaNormalizer.upgradeArtworkUrl('https://lh3.googleusercontent.com/s/v4/g', videoId: 'dQw4w9WgXcQ', qualityOverride: 'high'),
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      );
    });

    test('normalizes complex InnerTube runs with play counts and separators without corruption', () {
      final item = MediaNormalizer.normalize(
        id: 'test-1',
        titleRuns: [
          {'text': 'Banjaare'},
        ],
        subtitleRuns: [
          {'text': 'Atif Aslam'},
          {'text': ' & '},
          {'text': 'Shiraz Uppal'},
          {'text': ' • '},
          {'text': '736M plays'},
          {'text': ' • '},
          {'text': '2024'},
        ],
        rawImageUrl: 'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
        videoId: 'xyz',
      );

      expect(item.title, 'Banjaare');
      expect(item.subtitle, 'Atif Aslam & Shiraz Uppal');
      expect(item.year, '2024');
      expect(item.imageUrl, 'https://i.ytimg.com/vi/xyz/hqdefault.jpg');
    });

    test('isDistributorOrLabel identifies music distributors and keeps real artists', () {
      expect(MediaNormalizer.isDistributorOrLabel('Sony Music South'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Sun TV'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Sun Pictures'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('T-Series'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('T-Series Tamil'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Think Music India'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Zee Music South'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Saregama Tamil'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Divo Music'), isTrue);
      expect(MediaNormalizer.isDistributorOrLabel('Muzik247'), isTrue);

      expect(MediaNormalizer.isDistributorOrLabel('Anirudh Ravichander'), isFalse);
      expect(MediaNormalizer.isDistributorOrLabel('A.R. Rahman'), isFalse);
      expect(MediaNormalizer.isDistributorOrLabel('Sid Sriram'), isFalse);
      expect(MediaNormalizer.isDistributorOrLabel('Shreya Ghoshal'), isFalse);
      expect(MediaNormalizer.isDistributorOrLabel('Dhanush'), isFalse);
    });

    test('extractArtistsFromDescription parses singers and composers', () {
      const desc1 = '''
Song: Arabic Kuthu
Movie: Beast
Singers: Anirudh Ravichander, Jonita Gandhi
Lyrics: Sivakarthikeyan
Music: Anirudh Ravichander
''';
      expect(MediaNormalizer.extractArtistsFromDescription(desc1), 'Anirudh Ravichander & Jonita Gandhi');

      const desc2 = '''
Provided to YouTube by Sony Music Entertainment India Pvt. Ltd.
Vathi Coming · Anirudh Ravichander · Gana Balachandar
Master (Original Motion Picture Soundtrack)
℗ 2020 Sony Music Entertainment India Pvt. Ltd.
''';
      expect(MediaNormalizer.extractArtistsFromDescription(desc2), 'Anirudh Ravichander & Gana Balachandar');
    });

    test('extractYearFromDescription parses release dates', () {
      expect(MediaNormalizer.extractYearFromDescription('Released on: 2021-08-20\nProducer: ...'), '2021');
      expect(MediaNormalizer.extractYearFromDescription('℗ 2019 Sony Music India'), '2019');
      expect(MediaNormalizer.extractYearFromDescription('Release Date: 14 Oct 2022'), '2022');
    });

    test('extractArtistsFromVideoTitle recovers genuine artist from title segments', () {
      const t1 = 'Arabic Kuthu - Video Song | Beast | Thalapathy Vijay | Sun Pictures | Anirudh Ravichander | Nelson';
      expect(MediaNormalizer.extractArtistsFromVideoTitle(t1, defaultArtist: 'Anirudh Ravichander'), 'Anirudh Ravichander');

      const t2 = 'Naa Ready | Leo | Thalapathy Vijay | Anirudh Ravichander | Sony Music South';
      expect(MediaNormalizer.extractArtistsFromVideoTitle(t2, defaultArtist: 'Anirudh Ravichander'), 'Anirudh Ravichander');

      const t3 = 'Hukum - Thalaivar Alappara | Jailer | Superstar Rajinikanth | Sun Pictures | Anirudh Ravichander';
      expect(MediaNormalizer.extractArtistsFromVideoTitle(t3, defaultArtist: 'Anirudh Ravichander'), 'Anirudh Ravichander');
    });

    test('normalize discards distributor from subtitleRuns and recovers artist from title', () {
      final item = MediaNormalizer.normalize(
        id: 'vid-123',
        titleRuns: [
          {'text': 'Arabic Kuthu | Beast | Anirudh Ravichander | Sun Pictures'},
        ],
        subtitleRuns: [
          {'text': 'Sun Pictures'},
          {'text': ' • '},
          {'text': '500M views'},
          {'text': ' • '},
          {'text': '2022'},
        ],
        rawImageUrl: 'https://i.ytimg.com/vi/vid-123/hqdefault.jpg',
        videoId: 'vid-123',
        defaultArtist: 'Anirudh Ravichander',
      );

      expect(item.subtitle, 'Anirudh Ravichander');
      expect(item.year, '2022');
    });
  });
}
