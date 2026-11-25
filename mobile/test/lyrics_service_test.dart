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

    test('allows bilingual Tamil song containing a Hindi rap verse (e.g. Ethir Neechal)', () {
      const bilingualLyrics =
          'Ethir neechal adi enna enaku irukku naan unnai paathu\n'
          'Mera dil tera yaar hum tum pyar zindagi dekh';
      expect(
        LyricsService.isLanguageCompatible(bilingualLyrics, 'tamil'),
        isTrue,
      );
    });
  });

  group('LyricsService Unicode & Accent Matching', () {
    test('isTitleMatch supports non-ASCII Unicode and accented Latin titles', () {
      expect(LyricsService.isTitleMatch('Señorita', 'Senorita'), isTrue);
      expect(LyricsService.isTitleMatch('ஆலே ஆலே', 'ஆலே ஆலே'), isTrue);
      expect(
        LyricsService.isTitleMatch(
          'Bum Baa Diga Diga (From "DC")',
          'Bum Baa Diga Diga',
        ),
        isTrue,
      );
    });

    test('isArtistMatch supports accented names and multi-artist lists', () {
      expect(
        LyricsService.isArtistMatch(
          'Anirudh Ravichander & Yo Yo Honey Singh',
          'Anirudh Ravichander, Yo Yo Honey Singh, Hiphop Tamizha & Vaali',
        ),
        isTrue,
      );
      expect(LyricsService.isArtistMatch('Beyoncé', 'Beyonce'), isTrue);
    });
  });

  group('LyricsService Parenthetical Collision & Duration Ranking', () {
    test('rejects live venue parentheticals and unrelated titles sharing city names', () {
      expect(
        LyricsService.isTitleMatch(
          'Dancing In The Flames (Live from São Paulo)',
          'São Paulo',
        ),
        isFalse,
      );
      expect(
        LyricsService.isTitleMatch('Live From São Paulo', 'São Paulo'),
        isFalse,
      );
      expect(
        LyricsService.isTitleMatch(
          'Dancing In The Flames (Live from São Paulo)',
          'Dancing In The Flames',
        ),
        isTrue,
      );
    });

    test('filters out false Hit 0 and truncated Single/Acapella/Mixed cuts in rankLrcRedHits', () {
      final weekndOnlyQueryHits = <Map<String, dynamic>>[
        {
          'isrc': 'USUG12406331',
          'title': 'Dancing In The Flames (Live from São Paulo)',
          'artist': 'The Weeknd',
          'album': 'Dancing In The Flames - EP',
          'duration': 312.013,
        },
        {
          'isrc': 'USUG12508580',
          'title': 'São Paulo (Single Version / Acapella)',
          'artist': 'The Weeknd, Anitta',
          'album': 'São Paulo - EP',
          'duration': 148.853,
        },
        {
          'isrc': 'US23A8495206',
          'title': 'São Paulo (Mixed)',
          'artist': 'Anitta, The Weeknd',
          'album': 'Up. Radio, Vol. 2 (DJ Mix)',
          'duration': 111.572,
        },
        {
          'isrc': 'USANG2484313',
          'title': 'São Paulo (1950s The Weeknd)',
          'artist': "The Swingin' Covers",
          'album': 'São Paulo (1950s The Weeknd) - Single',
          'duration': 179.48,
        },
      ];

      expect(
        LyricsService.rankLrcRedHits(
          weekndOnlyQueryHits,
          title: 'São Paulo',
          rawTitle: 'São Paulo',
          primaryArtist: 'The Weeknd',
          fullArtist: 'The Weeknd & Anitta',
          album: 'Hurry Up Tomorrow',
          durationSeconds: 302,
        ),
        isEmpty,
      );

      final titleFallbackHits = <Map<String, dynamic>>[
        {
          'isrc': 'USUG12506888',
          'title': 'São Paulo (Single Version)',
          'artist': 'Abel Tesfaye, Anitta',
          'album': 'São Paulo - EP',
          'duration': 148.853,
        },
        {
          'isrc': 'USUG12406333',
          'title': 'São Paulo (Live From São Paulo)',
          'artist': 'Abel Tesfaye, Anitta',
          'album': 'São Paulo - EP',
          'duration': 327.335,
        },
        {
          'isrc': 'USUG12405846',
          'title': 'São Paulo',
          'artist': 'Abel Tesfaye, Anitta',
          'album': 'Hurry Up Tomorrow',
          'duration': 301.623,
        },
      ];

      final ranked = LyricsService.rankLrcRedHits(
        titleFallbackHits,
        title: 'São Paulo',
        rawTitle: 'São Paulo',
        primaryArtist: 'The Weeknd',
        fullArtist: 'The Weeknd & Anitta',
        album: 'Hurry Up Tomorrow',
        durationSeconds: 302,
      );
      expect(ranked, isNotEmpty);
      expect(ranked.first['isrc'], equals('USUG12405846'));

      // Also works via album + exact duration match when track omits featured artist Anitta
      final rankedWithoutAnitta = LyricsService.rankLrcRedHits(
        titleFallbackHits,
        title: 'São Paulo',
        rawTitle: 'São Paulo',
        primaryArtist: 'The Weeknd',
        fullArtist: 'The Weeknd',
        album: 'Hurry Up Tomorrow',
        durationSeconds: 302,
      );
      expect(rankedWithoutAnitta, isNotEmpty);
      expect(rankedWithoutAnitta.first['isrc'], equals('USUG12405846'));
    });

    test('rejects wrong artist on self-titled Single album even when duration is close', () {
      final falseHits = <Map<String, dynamic>>[
        {
          'isrc': 'FR9W11807301',
          'title': 'Fa Fa Fa',
          'artist': 'Silience',
          'album': 'Fa Fa Fa - Single',
          'duration': 172.64,
        },
        {
          'isrc': 'USAT21501266',
          'title': 'Fa-Fa-Fa-Fa-Fa (Sad Song)',
          'artist': 'Otis Redding',
          'album': 'The Otis Redding Dictionary of Soul',
          'duration': 164.81,
        },
      ];

      expect(
        LyricsService.rankLrcRedHits(
          falseHits,
          title: 'FA FA FA',
          rawTitle: 'FA FA FA (From "O.M: Operation Mole")',
          primaryArtist: 'Sai Abhyankkar',
          fullArtist: 'Sai Abhyankkar & Thamizh Aadhavan',
          album: 'FA FA FA (From "O.M: Operation Mole")',
          durationSeconds: 177,
        ),
        isEmpty,
      );
    });

    test('splits bullet artist separators, avoids 2-char collisions, and allows bilingual Indic scripts', () {
      expect(
        LyricsService.cleanArtist('Sai Abhyankkar • Thamizh Aadhavan'),
        equals('Sai Abhyankkar'),
      );
      expect(
        LyricsService.isArtistMatch('Sai Abhyankkar et Thamizh Aadhavan', 'Sai Abhyankkar'),
        isTrue,
      );
      expect(
        LyricsService.isArtistMatch('Fa', 'Mustafa'),
        isFalse,
      );

      // Tamil + Hindi bilingual rap (like 10 000 Aura) must pass for Tamil
      const tamilHindiRap =
          '[00:02.59] தொட்டா டேய் பட்டாசா நான் வெடிக்கிற 10,000 वाला, हे\n'
          '[00:06.18] சுட்டா டேய் நான் தெறிக்கிற चल तू खोने, साला\n'
          '[00:09.94] ஹாயா ஆயே-ஓ போடுறா காலி நான் போடுற வேலில';
      expect(
        LyricsService.isLanguageCompatible(tamilHindiRap, 'tamil'),
        isTrue,
      );

      // Tamil + Arabic + Latin + occasional Hindi word (like FA FA FA) must pass for Tamil
      const tamilArabic =
          '[00:00.78] Single down, stars ignite\n'
          '[00:07.19] يا ويلي rock\'u-யா صاحبي سيد العرب\n'
          '[00:22.98] ஐக்கிய அரபு அமிரகம் தங்களை வரவேற்கிறது\n'
          '[00:26.55] கரப்படியாத வரைபடம் வரவேற்புக்கு எதிர்நோக்குறது\n'
          '[01:04.59] அராபி மாஜா சில்லாக்கி குடுங்க sweet\'u जिलेबी';
      expect(
        LyricsService.isLanguageCompatible(tamilArabic, 'tamil'),
        isTrue,
      );
    });
  });

  group('LrcParser Overlapping Timestamps Across Formats', () {
    test('preserves overlapping end times across bracket range, bare range, WBW, trailing tag, and SRT', () {
      // 1. Bracket range format [mm:ss.xx-mm:ss.yy]
      final bracketRes = LrcParser.parse(
        '[00:36.00-00:43.00]First overlap line\n'
        '[00:41.00-00:50.00]Second overlap line',
      );
      expect(bracketRes.synced, isTrue);
      expect(bracketRes.lines[0]['startMs'], equals(36000));
      expect(bracketRes.lines[0]['endMs'], equals(43000));
      expect(bracketRes.lines[1]['startMs'], equals(41000));
      expect(bracketRes.lines[1]['endMs'], equals(50000));

      // 2. Bare format with 1-second overlap: 0:36-0:42 and 0:41- 0:50
      final bareRes = LrcParser.parse(
        '0:36-0:42 First line 1s overlap\n'
        '0:41- 0:50 Second line',
      );
      expect(bareRes.synced, isTrue);
      expect(bareRes.lines[0]['startMs'], equals(36000));
      expect(bareRes.lines[0]['endMs'], equals(42000));
      expect(bareRes.lines[1]['startMs'], equals(41000));
      expect(bareRes.lines[1]['endMs'], equals(50000));

      // 3. Enhanced WBW LRC <mm:ss.xx> whose last word ends after next line starts
      final wbwRes = LrcParser.parse(
        '[00:36.00]<00:36.00>First <00:39.00>line <00:43.00>\n'
        '[00:41.00]<00:41.00>Second <00:46.00>line <00:50.00>',
      );
      expect(wbwRes.synced, isTrue);
      expect(wbwRes.lines[0]['endMs'], equals(43000));
      expect(wbwRes.lines[1]['startMs'], equals(41000));

      // 4. Trailing end tag [start]text[end]
      final trailingRes = LrcParser.parse(
        '[00:36.00]First line[00:42.00]\n'
        '[00:41.00]Second line[00:50.00]',
      );
      expect(trailingRes.lines[0]['endMs'], equals(42000));
      expect(trailingRes.lines[1]['startMs'], equals(41000));

      // 5. SRT subtitle cue overlap
      final srtRes = LrcParser.parse(
        '1\n00:00:36,000 --> 00:00:43,000\nFirst cue line\n\n'
        '2\n00:00:41,000 --> 00:00:50,000\nSecond cue line',
      );
      expect(srtRes.lines[0]['startMs'], equals(36000));
      expect(srtRes.lines[0]['endMs'], equals(43000));
      expect(srtRes.lines[1]['startMs'], equals(41000));
      expect(srtRes.lines[1]['endMs'], equals(50000));
    });
  });
}
