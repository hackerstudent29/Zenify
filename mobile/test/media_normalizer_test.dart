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
        MediaNormalizer.upgradeArtworkUrl('https://lh3.googleusercontent.com/abc=s120'),
        contains('=w1200-h1200-l90-rj'),
      );
      expect(
        MediaNormalizer.upgradeArtworkUrl(
          'https://lh3.googleusercontent.com/abc=s120',
          isArtistAvatar: true,
        ),
        contains('=w1200-h1200-p-l90-rj'),
      );
      expect(
        MediaNormalizer.upgradeBannerUrl('https://lh3.googleusercontent.com/abc=w2880-h1200-p-l90-rj'),
        'https://lh3.googleusercontent.com/abc=w2880-h1200-p-l90-rj',
      );
      expect(
        MediaNormalizer.upgradeBannerUrl('https://lh3.googleusercontent.com/abc=w544-h226-l90-rj'),
        'https://lh3.googleusercontent.com/abc=w1920-h1080-p-l90-rj',
      );
      expect(
        MediaNormalizer.upgradeArtworkUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg?sqp=123'),
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      );
      // Broken dummy url fallback
      expect(
        MediaNormalizer.upgradeArtworkUrl('https://lh3.googleusercontent.com/s/v4/g', videoId: 'dQw4w9WgXcQ'),
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
      expect(item.imageUrl, 'https://i.ytimg.com/vi/xyz/maxresdefault.jpg');
    });
  });
}
