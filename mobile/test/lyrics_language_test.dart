import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/lyrics_service.dart';

void main() {
  group('Track Language Detection & Auto-Resolution', () {
    test('detects language from raw title before cleaning strips it', () {
      final track = Track(
        id: 't-telugu-1',
        title: 'Ale Ale (Telugu)',
        artist: 'Karthik, Harini',
        album: 'Boys',
        coverUrl: '',
      );
      expect(track.language, 'telugu');
      expect(track.title, 'Ale Ale');
    });

    test('detects language from album title', () {
      final track = Track(
        id: 't-telugu-2',
        title: 'Ale Ale',
        artist: 'A. R. Rahman, Karthik, Harini',
        album: 'Boys (Telugu)',
        coverUrl: '',
      );
      expect(track.language, 'telugu');
    });

    test('detects native script in song metadata', () {
      final trackTamil = Track(
        id: 't-ta',
        title: 'ஆலே ஆலே',
        artist: 'ஹரிணி',
        album: 'பாய்ஸ்',
        coverUrl: '',
      );
      expect(trackTamil.language, 'tamil');

      final trackTelugu = Track(
        id: 't-te',
        title: 'ఆలే ఆలే',
        artist: 'హరిణి',
        album: 'బాయ్స్',
        coverUrl: '',
      );
      expect(trackTelugu.language, 'telugu');
    });

    test('detects multilingual pan-Indian movie versions', () {
      final chaleya = Track(
        id: 'chaleya',
        title: 'Chaleya (Hindi)',
        artist: 'Arijit Singh, Shilpa Rao',
        album: 'Jawan',
        coverUrl: '',
      );
      expect(chaleya.language, 'hindi');

      final hayyoda = Track(
        id: 'hayyoda',
        title: 'Hayyoda (From Jawan - Tamil)',
        artist: 'Anirudh Ravichander, Priya Mali',
        album: 'Jawan (Tamil)',
        coverUrl: '',
      );
      expect(hayyoda.language, 'tamil');
    });
  });

  group('LyricsService Language Collision Prevention', () {
    test('detectScriptLanguage identifies native scripts with precision', () {
      const tamilLrc = '[00:10.00]ஆலே ஆலே அன்பே ஆலே\n[00:15.00]எனது நெஞ்சம் எங்கே அவளிடம்';
      expect(LyricsService.detectScriptLanguage(tamilLrc), 'tamil');

      const teluguLrc = '[00:10.00]ఆలే ఆలే ప్రేమల ఆలే\n[00:15.00]నాలో నేనే లేనే తొలిసారి';
      expect(LyricsService.detectScriptLanguage(teluguLrc), 'telugu');

      const hindiLrc = '[00:10.00]तेरे हवाले कर दी ये ज़िंदगी\n[00:15.00]दिल मेरा धड़कता है तेरे लिए';
      expect(LyricsService.detectScriptLanguage(hindiLrc), 'hindi');
    });

    test('detectRomanizedLanguage identifies transliterated regional lyrics', () {
      const tamilRomanized = 'Ale ale anbe ale enadhu nenjam engae avalidam ale ale kadhal unmai uyire';
      expect(LyricsService.detectRomanizedLanguage(tamilRomanized), 'tamil');

      const teluguRomanized = 'Ale ale premala ale naalo neney lene tholisari ale ale cheliya neetho prema';
      expect(LyricsService.detectRomanizedLanguage(teluguRomanized), 'telugu');

      const hindiRomanized = 'Tere hawale kar di yeh zindagi dil mera dhadakta hai tujhe dekh kar hum tum';
      expect(LyricsService.detectRomanizedLanguage(hindiRomanized), 'hindi');
    });

    test('isLanguageCompatible rejects conflicting language to stop lyrics collision', () {
      const tamilLyrics = 'Ale ale anbe ale enadhu nenjam engae avalidam kadhal unmai';
      const teluguLyrics = 'Ale ale premala ale naalo neney lene tholisari cheliya neetho prema';

      // When listening to Telugu song:
      // Tamil lyrics MUST BE REJECTED
      expect(LyricsService.isLanguageCompatible(tamilLyrics, 'telugu'), isFalse);
      // Telugu lyrics MUST BE ACCEPTED
      expect(LyricsService.isLanguageCompatible(teluguLyrics, 'telugu'), isTrue);

      // When listening to Tamil song:
      // Tamil lyrics accepted, Telugu lyrics rejected
      expect(LyricsService.isLanguageCompatible(tamilLyrics, 'tamil'), isTrue);
      expect(LyricsService.isLanguageCompatible(teluguLyrics, 'tamil'), isFalse);
    });

    test('isLanguageCompatible rejects script mismatch strictly', () {
      const tamilScriptLrc = '[00:10.00]ஆலே ஆலே அன்பே ஆலே எனது நெஞ்சம் எங்கே';
      const teluguScriptLrc = '[00:10.00]ఆలే ఆలే ప్రేమల ఆలే నాలో నేనే లేనే';

      // Telugu audio with Tamil script lyrics -> STRICT REJECT
      expect(LyricsService.isLanguageCompatible(tamilScriptLrc, 'telugu'), isFalse);
      // Telugu audio with Telugu script lyrics -> PASS
      expect(LyricsService.isLanguageCompatible(teluguScriptLrc, 'telugu'), isTrue);
    });
  });
}

