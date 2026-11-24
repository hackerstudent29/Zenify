import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/lyrics_service.dart';

void main() {
  group('LyricsService Title & Artist Normalization', () {
    test('cleanTitle strips video fluff, pipes, from-movie, and audio tags', () {
      expect(
        LyricsService.cleanTitle('Hukum - Video Song | Jailer | Rajinikanth | Anirudh'),
        'Hukum',
      );
      expect(
        LyricsService.cleanTitle('Arabic Kuthu - Halamithi Habibo (From "Beast")'),
        'Arabic Kuthu - Halamithi Habibo',
      );
      expect(
        LyricsService.cleanTitle('Chaleya (From "Jawan") [Official Video]'),
        'Chaleya',
      );
      expect(
        LyricsService.cleanTitle('Naa Ready (From "Leo") - Lyrical Video'),
        'Naa Ready',
      );
      expect(
        LyricsService.cleanTitle('Badass - Lyric Video | Leo | Thalapathy Vijay | Anirudh'),
        'Badass',
      );
    });

    test('cleanArtist extracts primary artist and strips distributors', () {
      expect(
        LyricsService.cleanArtist('Anirudh Ravichander, Jonita Gandhi, Sivakarthikeyan'),
        'Anirudh Ravichander',
      );
      expect(
        LyricsService.cleanArtist('A. R. Rahman & Shreya Ghoshal'),
        'A. R. Rahman',
      );
      expect(
        LyricsService.cleanArtist('Sony Music South'),
        '',
      );
      expect(
        LyricsService.cleanArtist('T-Series'),
        '',
      );
    });
  });

  group('LyricsService isTitleMatch', () {
    test('matches exact titles', () {
      expect(LyricsService.isTitleMatch('Hukum', 'Hukum'), isTrue);
      expect(LyricsService.isTitleMatch('Arabic Kuthu', 'Arabic Kuthu'), isTrue);
    });

    test('matches subtitle and movie variations without false rejections', () {
      // Shorter title in LRCLIB matches full title in track
      expect(
        LyricsService.isTitleMatch('Hukum', 'Hukum - Thalaivar Alappara'),
        isTrue,
      );
      expect(
        LyricsService.isTitleMatch('Arabic Kuthu', 'Arabic Kuthu - Halamithi Habibo'),
        isTrue,
      );
      expect(
        LyricsService.isTitleMatch('Chaleya', 'Chaleya (From "Jawan")'),
        isTrue,
      );
      expect(
        LyricsService.isTitleMatch('Badass', 'Badass - Leo'),
        isTrue,
      );
      expect(
        LyricsService.isTitleMatch('Naa Ready', 'Naa Ready (From "Leo")'),
        isTrue,
      );
    });

    test('rejects completely different songs', () {
      expect(LyricsService.isTitleMatch('Hukum', 'Vathi Coming'), isFalse);
      expect(LyricsService.isTitleMatch('Shape of You', 'Castle on the Hill'), isFalse);
      expect(LyricsService.isTitleMatch('Arabic Kuthu', 'Jolly O Gymkhana'), isFalse);
    });
  });

  group('LyricsService isArtistMatch', () {
    test('matches identical and partial artist strings', () {
      expect(LyricsService.isArtistMatch('Anirudh Ravichander', 'Anirudh Ravichander'), isTrue);
      expect(
        LyricsService.isArtistMatch('Anirudh Ravichander/Vijay/Asal Kolaar', 'Anirudh Ravichander'),
        isTrue,
      );
      expect(
        LyricsService.isArtistMatch('Anirudh Ravichander', 'Anirudh Ravichander, Jonita Gandhi'),
        isTrue,
      );
    });

    test('handles distributor channels gracefully', () {
      expect(LyricsService.isArtistMatch('Sony Music South', 'Anirudh Ravichander'), isTrue);
      expect(LyricsService.isArtistMatch('T-Series', 'Arijit Singh'), isTrue);
    });
  });

  group('LyricsService Language Compatibility', () {
    test('rejects cross-script native runes', () {
      // Native Tamil script for Telugu song
      expect(
        LyricsService.isLanguageCompatible('ஆலே ஆலே அன்பே ஆலே எனது நெஞ்சம் எங்கே அவளிடம் ஆலே ஆலே', 'telugu'),
        isFalse,
      );
      // Native Telugu script for Tamil song
      expect(
        LyricsService.isLanguageCompatible('ఆలే ఆలే ప్రేమల ఆలే నాలో నేనే లేనే తొలిసారి ఆలే ఆలే', 'tamil'),
        isFalse,
      );
      // Native Devanagari script for Tamil song
      expect(
        LyricsService.isLanguageCompatible('तेरे हवाले कर दी ये ज़िंदगी दिल मेरा धड़कता है तेरे लिए', 'tamil'),
        isFalse,
      );
    });

    test('allows Romanized lyrics without false collision on loan words', () {
      // Multilingual / Tanglish lyrics with loan words like "dil" or "deewana"
      const tanglishWithHindiWords = 'Halamithi habibo en anbe unnai paathu naan deewana aanaen en dil thudikuthu';
      expect(
        LyricsService.isLanguageCompatible(tanglishWithHindiWords, 'tamil'),
        isTrue,
      );
    });
  });
}
