import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'download_service.dart';
import 'innertube_service.dart';

/// Structured lyrics line format matching Zenify's Apple Music visual engine.
class LyricsResult {
  const LyricsResult({
    required this.lines,
    required this.synced,
    required this.source,
    this.rawLrc,
  });

  final List<Map<String, dynamic>> lines;
  final bool synced;
  final String source;
  final String? rawLrc;

  bool get isEmpty => lines.isEmpty;
  bool get isNotEmpty => lines.isNotEmpty;
}

/// Universal LRC and plain lyrics parser.
class LrcParser {
  static final RegExp _tagRegex = RegExp(
    r'\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]',
  );
  static final RegExp _wordTagRegex = RegExp(
    r'<(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?>',
  );

  /// Parses an LRC string or plain text into a normalized list of timed line maps.
  static ({List<Map<String, dynamic>> lines, bool synced}) parse(
    String content,
  ) {
    final rawLines = content.split('\n');
    final timedList =
        <({int startMs, String text, List<Map<String, dynamic>>? words})>[];
    final plainList = <String>[];

    for (final raw in rawLines) {
      final line = raw.trim();
      if (line.isEmpty) continue;

      // Check for metadata tags like [ar: Artist], [ti: Title], [offset: 0]
      if (line.startsWith('[') && !line.startsWith(RegExp(r'\[\d'))) {
        continue;
      }

      final matches = _tagRegex.allMatches(line);
      if (matches.isNotEmpty) {
        // Strip line timestamps to obtain pure line text + word tags
        var text = line.replaceAll(_tagRegex, '').trim();

        // Extract word-level timestamps if present (<mm:ss.xx>)
        List<Map<String, dynamic>>? words;
        if (_wordTagRegex.hasMatch(text)) {
          words = _parseWordLevel(text);
          text = text
              .replaceAll(_wordTagRegex, '')
              .replaceAll(RegExp(r'\s+'), ' ')
              .trim();
        }

        if (text.isEmpty && matches.length == 1) {
          // Empty timed break line (interlude marker)
          text = '• • •';
        }

        for (final m in matches) {
          final min = int.tryParse(m.group(1) ?? '0') ?? 0;
          final sec = int.tryParse(m.group(2) ?? '0') ?? 0;
          final msStr = m.group(3) ?? '0';
          int ms = int.tryParse(msStr) ?? 0;
          if (msStr.length == 2) ms *= 10;

          final totalMs = min * 60000 + sec * 1000 + ms;
          timedList.add((startMs: totalMs, text: text, words: words));
        }
      } else {
        plainList.add(line);
      }
    }

    if (timedList.isNotEmpty) {
      timedList.sort((a, b) => a.startMs.compareTo(b.startMs));

      final lines = <Map<String, dynamic>>[];
      for (var i = 0; i < timedList.length; i++) {
        final cur = timedList[i];
        final nextStart = (i + 1 < timedList.length)
            ? timedList[i + 1].startMs
            : (cur.startMs + 3500);
        int endMs = nextStart > cur.startMs ? nextStart : (cur.startMs + 3500);

        // If word-level timing is present, align line end with the last word
        if (cur.words != null && cur.words!.isNotEmpty) {
          final lastWordEnd = cur.words!.last['endMs'];
          if (lastWordEnd is int && lastWordEnd > cur.startMs) {
            endMs = math.min(
              nextStart,
              math.max(lastWordEnd, cur.startMs + 500),
            );
          }
        }

        lines.add({
          'text': cur.text,
          'timeMs': cur.startMs,
          'startMs': cur.startMs,
          'endMs': endMs,
          'words': cur.words,
        });
      }
      return (lines: lines, synced: true);
    }

    // Unsynced plain text
    final lines = plainList
        .map(
          (text) => <String, dynamic>{
            'text': text,
            'timeMs': null,
            'startMs': null,
            'endMs': null,
          },
        )
        .toList();

    return (lines: lines, synced: false);
  }

  static List<Map<String, dynamic>>? _parseWordLevel(String line) {
    try {
      final matches = _wordTagRegex.allMatches(line).toList();
      if (matches.isEmpty) return null;

      final words = <Map<String, dynamic>>[];
      for (var i = 0; i < matches.length; i++) {
        final m = matches[i];
        final min = int.tryParse(m.group(1) ?? '0') ?? 0;
        final sec = int.tryParse(m.group(2) ?? '0') ?? 0;
        final msStr = m.group(3) ?? '0';
        int ms = int.tryParse(msStr) ?? 0;
        if (msStr.length == 2) ms *= 10;
        final startMs = min * 60000 + sec * 1000 + ms;

        // Extract text between this tag and next tag or end of string
        final wordStart = m.end;
        final wordEnd = (i + 1 < matches.length)
            ? matches[i + 1].start
            : line.length;
        final wordText = line.substring(wordStart, wordEnd).trim();

        if (wordText.isNotEmpty) {
          int endMs = startMs + 320;
          if (i + 1 < matches.length) {
            final nextM = matches[i + 1];
            final nMin = int.tryParse(nextM.group(1) ?? '0') ?? 0;
            final nSec = int.tryParse(nextM.group(2) ?? '0') ?? 0;
            final nMsStr = nextM.group(3) ?? '0';
            var nMs = int.tryParse(nMsStr) ?? 0;
            if (nMsStr.length == 2) nMs *= 10;
            final nextTotal = nMin * 60000 + nSec * 1000 + nMs;
            if (nextTotal > startMs) endMs = nextTotal;
          }

          final subTokens = wordText
              .split(RegExp(r'\s+'))
              .where((s) => s.isNotEmpty)
              .toList();
          if (subTokens.length <= 1) {
            words.add({
              'text': wordText,
              'word': wordText,
              'timeMs': startMs,
              'startMs': startMs,
              'endMs': endMs,
            });
          } else {
            // Distribute duration proportionally across whitespace-separated sub-words
            final totalChars = subTokens.fold<int>(
              0,
              (sum, w) => sum + w.length,
            );
            final dur = endMs - startMs;
            var curStart = startMs;
            for (final sub in subTokens) {
              final subDur = math.max(
                60,
                ((sub.length / math.max(1, totalChars)) * dur).round(),
              );
              final subEnd = curStart + subDur;
              words.add({
                'text': sub,
                'word': sub,
                'timeMs': curStart,
                'startMs': curStart,
                'endMs': subEnd,
              });
              curStart = subEnd;
            }
          }
        }
      }
      return words.isNotEmpty ? words : null;
    } catch (_) {
      return null;
    }
  }
}

Future<T?> firstNonNull<T>(List<Future<T?>> fs) {
  if (fs.isEmpty) return Future.value(null);
  final c = Completer<T?>();
  var left = fs.length;
  for (final f in fs) {
    f.then((v) {
      if (v != null && !c.isCompleted) c.complete(v);
    }).catchError((_) {}).whenComplete(() {
      if (--left == 0 && !c.isCompleted) c.complete(null);
    });
  }
  return c.future;
}

/// Robust Multi-Stage Lyrics Retrieval Engine.
///
/// Multi-tier pipeline strictly ordered:
/// 1. TIER 1 (PRIORITY #1): Word-by-Word (WBW) Synced Lyrics (lrc.red & Zenify Backend)
/// 2. TIER 2 (PRIORITY #2): Line-by-Line Synced Lyrics (lrc.red line, LRCLIB syncedLyrics, Backend line)
/// 3. TIER 3 (FALLBACK ONLY): Plain Lyrics (LRCLIB plain, YouTube Music InnerTube, Backend plain)
class LyricsService {
  LyricsService._() {
    purgeUnsyncedCache();
  }
  static final LyricsService instance = LyricsService._();

  final http.Client _client = http.Client();
  final Map<String, LyricsResult> _memCache = {};
  final Map<String, Future<LyricsResult?>> _lyricsInflight = {};
  final Map<String, int> _rejectedTimestamps = {};

  static String cleanTitle(String title) {
    if (title.trim().isEmpty) return '';
    var s = MediaNormalizer.cleanCompactTitle(title);
    s = s.replaceAll(
      RegExp(
        r'\s*[\-–—|]\s*(video|audio|lyric|song|tamil|telugu|hindi|malayalam|kannada|remaster|hd|4k|official).*$',
        caseSensitive: false,
      ),
      '',
    ).trim();
    return s.isNotEmpty ? s : title.trim();
  }

  static String cleanArtist(String artist) {
    if (artist.trim().isEmpty) return '';
    var s = MediaNormalizer.cleanArtistName(artist);
    if (s.isEmpty) s = artist;
    if (MediaNormalizer.isDistributorOrLabel(s)) {
      return '';
    }
    return s
        .split(RegExp(r'[,&/|]|\bfeat\.?\b|\bft\.?\b', caseSensitive: false))
        .first
        .trim();
  }

  /// Validates that a lyrics candidate's title actually matches the playing song's title.
  /// Prevents false rejections when subtitles or extra movie tags differ.
  static bool isTitleMatch(String? candidate, String target) {
    if (candidate == null || candidate.trim().isEmpty) return false;
    final cRaw = cleanTitle(candidate).toLowerCase();
    final tRaw = cleanTitle(target).toLowerCase();
    final c = cRaw.replaceAll(RegExp(r'[^a-z0-9]'), '');
    final t = tRaw.replaceAll(RegExp(r'[^a-z0-9]'), '');
    if (c.isEmpty || t.isEmpty) return false;
    if (c == t) return true;

    // Substring containment in either direction
    if (c.contains(t) || t.contains(c)) return true;

    // Segment before hyphen or colon matches
    final cSegment = cRaw.split(RegExp(r'[\-–—:]')).first.replaceAll(RegExp(r'[^a-z0-9]'), '').trim();
    final tSegment = tRaw.split(RegExp(r'[\-–—:]')).first.replaceAll(RegExp(r'[^a-z0-9]'), '').trim();
    if (cSegment.isNotEmpty && tSegment.isNotEmpty && cSegment == tSegment) {
      return true;
    }

    final cWords = cRaw.split(RegExp(r'[^a-z0-9]+')).where((w) => w.length >= 2).toSet();
    final tWords = tRaw.split(RegExp(r'[^a-z0-9]+')).where((w) => w.length >= 2).toSet();
    if (cWords.isEmpty || tWords.isEmpty) return false;
    final overlap = cWords.intersection(tWords);

    if (overlap.isNotEmpty) {
      final minCount = math.min(cWords.length, tWords.length);
      // At least 50% of shorter title's words match
      if (overlap.length >= (minCount * 0.5).ceil()) return true;
    }

    return false;
  }

  /// Validates that a lyrics candidate's artist matches the playing song's artist.
  /// Prevents cross-artist collisions while tolerating multiple featured vocalists.
  static bool isArtistMatch(String? candidate, String target) {
    if (candidate == null || candidate.trim().isEmpty) return false;
    if (target.trim().isEmpty) return true;

    if (MediaNormalizer.isDistributorOrLabel(candidate) ||
        MediaNormalizer.isDistributorOrLabel(target)) {
      return true;
    }

    final c = candidate.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    final t = target.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    if (c.isEmpty || t.isEmpty) return true;
    if (c == t || c.contains(t) || t.contains(c)) return true;

    final cArtists = candidate
        .toLowerCase()
        .split(RegExp(r'[,&/|]|\bfeat\.?\b|\bft\.?\b'))
        .map((s) => s.trim().replaceAll(RegExp(r'[^a-z0-9]'), ''))
        .where((s) => s.length >= 2)
        .toSet();
    final tArtists = target
        .toLowerCase()
        .split(RegExp(r'[,&/|]|\bfeat\.?\b|\bft\.?\b'))
        .map((s) => s.trim().replaceAll(RegExp(r'[^a-z0-9]'), ''))
        .where((s) => s.length >= 2)
        .toSet();

    if (cArtists.isEmpty || tArtists.isEmpty) return true;

    for (final ca in cArtists) {
      for (final ta in tArtists) {
        if (ca == ta || ca.contains(ta) || ta.contains(ca)) return true;
      }
    }
    return false;
  }

  // ───────────────────────── Language & Script Detection ─────────────────────

  /// Detects the native script used in the lyrics text.
  /// Authoritative check for Indic, Asian, and Semitic languages.
  static String? detectScriptLanguage(String text) {
    var tamil = 0;
    var telugu = 0;
    var hindi = 0;
    var malayalam = 0;
    var kannada = 0;
    var bengali = 0;
    var punjabi = 0;
    var korean = 0;
    var japanese = 0;
    var arabic = 0;

    for (final rune in text.runes) {
      if (rune >= 0x0B80 && rune <= 0x0BFF) {
        tamil++;
      } else if (rune >= 0x0C00 && rune <= 0x0C7F) {
        telugu++;
      } else if (rune >= 0x0900 && rune <= 0x097F) {
        hindi++;
      } else if (rune >= 0x0D00 && rune <= 0x0D7F) {
        malayalam++;
      } else if (rune >= 0x0C80 && rune <= 0x0CF2) {
        kannada++;
      } else if (rune >= 0x0980 && rune <= 0x09FF) {
        bengali++;
      } else if (rune >= 0x0A00 && rune <= 0x0A7F) {
        punjabi++;
      } else if ((rune >= 0xAC00 && rune <= 0xD7AF) ||
          (rune >= 0x1100 && rune <= 0x11FF)) {
        korean++;
      } else if (rune >= 0x3040 && rune <= 0x30FF) {
        japanese++;
      } else if (rune >= 0x0600 && rune <= 0x06FF) {
        arabic++;
      }
    }

    final counts = {
      'tamil': tamil,
      'telugu': telugu,
      'hindi': hindi,
      'malayalam': malayalam,
      'kannada': kannada,
      'bengali': bengali,
      'punjabi': punjabi,
      'korean': korean,
      'japanese': japanese,
      'arabic': arabic,
    };

    final maxEntry = counts.entries.reduce((a, b) => a.value > b.value ? a : b);
    if (maxEntry.value >= 5) {
      return maxEntry.key;
    }
    return null;
  }

  static const _tamilMarkers = {
    'anbe',
    'enadhu',
    'kanmani',
    'kadhal',
    'kaadhal',
    'unmai',
    'paathu',
    'irukku',
    'enna',
    'illai',
    'vaadi',
    'podaa',
    'unodu',
    'unakku',
    'enaku',
    'nenjam',
    'thangamey',
    'azhage',
    'uyire',
    'pesu',
    'paadum',
    'naane',
    'neeye',
    'ippo',
    'apdi',
    'valiyil',
    'kangal',
    'serndhu',
    'unnai',
    'ennai',
    'kannukkul',
  };

  static const _teluguMarkers = {
    'premala',
    'prema',
    'cheliya',
    'neetho',
    'nenu',
    'naalo',
    'unnadi',
    'raave',
    'choodu',
    'evaru',
    'ledu',
    'undhi',
    'chesave',
    'manasa',
    'kalise',
    'gundello',
    'teliyani',
    'chusthe',
    'ippudu',
    'cheppave',
    'ninnu',
    'natho',
    'kalisi',
    'nammalenu',
    'veedani',
    'kallallo',
    'velugula',
    'chusa',
    'naatho',
  };

  static const _hindiMarkers = {
    'tere',
    'meri',
    'mera',
    'tum',
    'hum',
    'dil',
    'pyar',
    'pyaar',
    'zindagi',
    'kyun',
    'nahi',
    'kabhi',
    'saath',
    'hona',
    'gaya',
    'raha',
    'dekh',
    'aankhon',
    'tujhe',
    'mujhe',
    'karna',
    'yeh',
    'woh',
    'tera',
    'ishq',
    'deewana',
    'jaana',
    'raaton',
  };

  static const _malayalamMarkers = {
    'njan',
    'ente',
    'ninne',
    'kannukal',
    'sneham',
    'omaney',
    'poove',
    'chiri',
    'ormakal',
    'mazha',
    'kando',
    'vannu',
    'oru',
    'kaanum',
  };

  static const _kannadaMarkers = {
    'nanu',
    'nanna',
    'preethi',
    'hudugi',
    'ninna',
    'kanasu',
    'nodo',
    'ellaru',
    'beku',
    'hege',
    'idu',
    'illi',
  };

  /// Detects romanized / transliterated lyrics language (Tanglish, Tenglish, Hinglish).
  static String? detectRomanizedLanguage(String text) {
    final words = text
        .toLowerCase()
        .split(RegExp(r'[^a-z]+'))
        .where((w) => w.length >= 3)
        .toSet();
    if (words.isEmpty) return null;

    final tamilCount = words.intersection(_tamilMarkers).length;
    final teluguCount = words.intersection(_teluguMarkers).length;
    final hindiCount = words.intersection(_hindiMarkers).length;
    final malCount = words.intersection(_malayalamMarkers).length;
    final kanCount = words.intersection(_kannadaMarkers).length;

    final scores = {
      'tamil': tamilCount,
      'telugu': teluguCount,
      'hindi': hindiCount,
      'malayalam': malCount,
      'kannada': kanCount,
    };

    final maxEntry = scores.entries.reduce((a, b) => a.value > b.value ? a : b);
    if (maxEntry.value >= 3) {
      return maxEntry.key;
    }
    return null;
  }

  static const String _kCachePrefix = 'lyrics_cache_v12_';

  /// Removes accented characters and diacritics for resilient international matching
  /// (e.g. "São Paulo" -> "Sao Paulo", "Señorita" -> "Senorita").
  static String normalizeDiacritics(String text) {
    return text
        .replaceAll(RegExp(r'[àáâãäåā]'), 'a')
        .replaceAll(RegExp(r'[ÀÁÂÃÄÅĀ]'), 'A')
        .replaceAll(RegExp(r'[èéêëē]'), 'e')
        .replaceAll(RegExp(r'[ÈÉÊËĒ]'), 'E')
        .replaceAll(RegExp(r'[ìíîïī]'), 'i')
        .replaceAll(RegExp(r'[ÌÍÎÏĪ]'), 'I')
        .replaceAll(RegExp(r'[òóôõöøō]'), 'o')
        .replaceAll(RegExp(r'[ÒÓÔÕÖØŌ]'), 'O')
        .replaceAll(RegExp(r'[ùúûüū]'), 'u')
        .replaceAll(RegExp(r'[ÙÚÛÜŪ]'), 'U')
        .replaceAll(RegExp(r'[ñ]'), 'n')
        .replaceAll(RegExp(r'[Ñ]'), 'N')
        .replaceAll(RegExp(r'[ç]'), 'c')
        .replaceAll(RegExp(r'[Ç]'), 'C')
        .replaceAll(RegExp(r'[ýÿ]'), 'y')
        .replaceAll(RegExp(r'[ÝŸ]'), 'Y')
        .trim();
  }

  /// Verifies if candidate lyrics match the expected track language.
  /// Prevents cross-language collisions (e.g. Tamil lyrics on Telugu song).
  static bool isLanguageCompatible(String lyricsText, String expectedLanguage) {
    if (expectedLanguage.isEmpty) return true;
    final exp = expectedLanguage.toLowerCase().trim();

    // 0. Native Indic rune check: if lyrics text has significant foreign runes (> 8), reject cross-script collision
    var foreignRunes = 0;
    for (final rune in lyricsText.runes) {
      if (exp == 'tamil') {
        if ((rune >= 0x0C00 && rune <= 0x0C7F) || (rune >= 0x0900 && rune <= 0x097F)) {
          if (++foreignRunes > 8) {
            if (kDebugMode) debugPrint('[LyricsFlow] REJECTED: Foreign script runes found in Tamil song lyrics');
            return false;
          }
        }
      } else if (exp == 'telugu') {
        if ((rune >= 0x0B80 && rune <= 0x0BFF) || (rune >= 0x0900 && rune <= 0x097F)) {
          if (++foreignRunes > 8) {
            if (kDebugMode) debugPrint('[LyricsFlow] REJECTED: Foreign script runes found in Telugu song lyrics');
            return false;
          }
        }
      } else if (exp == 'hindi') {
        if ((rune >= 0x0B80 && rune <= 0x0BFF) || (rune >= 0x0C00 && rune <= 0x0C7F)) {
          if (++foreignRunes > 8) {
            if (kDebugMode) debugPrint('[LyricsFlow] REJECTED: South Indian runes found in Hindi song lyrics');
            return false;
          }
        }
      }
    }

    // 1. Script check
    final scriptLang = detectScriptLanguage(lyricsText);
    if (scriptLang != null) {
      final compat = scriptLang == exp;
      if (!compat && kDebugMode) {
        debugPrint(
          '[LyricsFlow] Rejected lyrics: detected script=$scriptLang vs expected=$exp',
        );
      }
      return compat;
    }

    // 2. Transliterated / Romanized check
    final romLang = detectRomanizedLanguage(lyricsText);
    if (romLang != null && romLang != exp) {
      if (kDebugMode) {
        debugPrint(
          '[LyricsFlow] Rejected lyrics: detected romanized=$romLang vs expected=$exp',
        );
      }
      return false;
    }

    return true;
  }

  /// Completely clears all in-memory and on-disk cached lyrics so tracks re-resolve
  /// fresh word-level / syllable synced lyrics from Better Lyrics & Unison.
  Future<void> clearAllLyricsCache() async {
    _memCache.clear();
    try {
      final prefs = await SharedPreferences.getInstance();
      final allKeys = prefs.getKeys().toList();
      for (final k in allKeys) {
        if (k.startsWith('lyrics_cache_')) {
          await prefs.remove(k);
        }
      }
    } catch (_) {}
  }

  /// Purges old unsynced and poisoned (v1/v2) lyrics from SharedPreferences disk cache.
  Future<void> purgeUnsyncedCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final allKeys = prefs.getKeys().toList();
      for (final k in allKeys) {
        if (k.startsWith('lyrics_cache_') && !k.startsWith(_kCachePrefix)) {
          // Eradicate poisoned v1 and v2 caches
          await prefs.remove(k);
        } else if (k.startsWith(_kCachePrefix)) {
          final raw = prefs.getString(k);
          if (raw != null) {
            try {
              final json = jsonDecode(raw);
              if (json is Map && json['synced'] != true) {
                await prefs.remove(k);
              }
            } catch (_) {
              await prefs.remove(k);
            }
          }
        }
      }
    } catch (_) {}
  }

  /// Fetches lyrics using the strict multi-tier hierarchy:
  /// Tier 1 (WBW) -> Tier 2 (Line-by-Line) -> Tier 3 (Plain Fallback).
  Future<LyricsResult?> fetchLyrics(Track track) {
    // Fast path: Offline / Downloaded songs must NEVER hit network!
    // Check if offline lyrics exist on disk, otherwise return null immediately.
    if (DownloadService.instance.isDownloaded(track.id) ||
        DownloadService.instance.getLocalAudioPath(track.id) != null ||
        track.coverUrl.startsWith('file://')) {
      final localLyrics = DownloadService.instance.getLocalLyrics(track.id);
      if (kDebugMode) {
        debugPrint('[LyricsFlow] Offline track (${track.id}): local lyrics=${localLyrics != null}');
      }
      return Future.value(localLyrics);
    }

    // Fast path: Never fetch lyrics for video songs (waste of network and CPU)
    if (track.isVideo ||
        track.id.startsWith('vid-') ||
        track.id.startsWith('video-') ||
        Track.detectIsVideo(track.title, track.album, coverUrl: track.coverUrl)) {
      if (kDebugMode) {
        debugPrint('[LyricsFlow] Skip lyrics: track is a video song (${track.id})');
      }
      return Future.value(null);
    }

    final cacheKey = track.id;
    final rejTime = _rejectedTimestamps[cacheKey];
    if (rejTime != null &&
        (DateTime.now().millisecondsSinceEpoch - rejTime) < 30000) {
      return Future.value(null);
    }
    final inFlight = _lyricsInflight[cacheKey];
    if (inFlight != null) return inFlight;

    final future = _doFetchLyrics(track, cacheKey);
    _lyricsInflight[cacheKey] = future;
    future.whenComplete(() => _lyricsInflight.remove(cacheKey));
    return future;
  }

  void clearRejected(String trackId) {
    _rejectedTimestamps.remove(trackId);
  }

  Future<LyricsResult?> _doFetchLyrics(Track track, String cacheKey) async {
    final lang = track.language.isNotEmpty
        ? track.language.toLowerCase().trim()
        : (Track.detectLanguage(track.title, track.artist, track.album) ?? '');

    if (kDebugMode) {
      debugPrint(
        '[LyricsFlow] START ultra-fast fetchLyrics trackId=${track.id} title="${track.title}" artist="${track.artist}" lang="$lang"',
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 0: In-Memory & Offline Disk Cache (Instant, 0ms)
    // ─────────────────────────────────────────────────────────────────────────
    if (_memCache.containsKey(cacheKey)) {
      final mem = _memCache[cacheKey]!;
      if (mem.synced &&
          (lang.isEmpty ||
              mem.rawLrc == null ||
              isLanguageCompatible(mem.rawLrc!, lang))) {
        if (kDebugMode) {
          debugPrint('[LyricsFlow] MEM_CACHE_HIT key=$cacheKey source=${mem.source}');
        }
        return mem;
      }
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedStr = prefs.getString('$_kCachePrefix$cacheKey');
      if (cachedStr != null) {
        final json = jsonDecode(cachedStr) as Map<String, dynamic>;
        final cachedArtist = json['artist'] as String?;
        if (cachedArtist != null && !isArtistMatch(cachedArtist, track.artist)) {
          await prefs.remove('$_kCachePrefix$cacheKey');
        } else {
          final lines = (json['lines'] as List?)?.cast<Map<String, dynamic>>() ?? [];
          final isSynced = json['synced'] == true;
          final rawLrc = json['rawLrc'] as String?;
          if (lines.isNotEmpty && isSynced) {
            final isCompat = lang.isEmpty || rawLrc == null || isLanguageCompatible(rawLrc, lang);
            if (isCompat) {
              final result = LyricsResult(
                lines: lines,
                synced: true,
                source: json['source'] ?? 'offline_cache',
                rawLrc: rawLrc,
              );
              _memCache[cacheKey] = result;
              if (kDebugMode) {
                debugPrint('[LyricsFlow] DISK_CACHE_HIT key=$cacheKey source=${result.source}');
              }
              return result;
            }
          }
        }
      }
    } catch (_) {}

    final cleanT = cleanTitle(track.title);
    final cleanA = cleanArtist(track.artist);
    final fullA = MediaNormalizer.cleanArtistName(track.artist);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: lrc.red First (Strict: If success, DO NOT proceed to Step 2!)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      final lrcRedResult = await _fetchLrcRedFast(cleanT, cleanA, fullA, lang);
      if (lrcRedResult != null && lrcRedResult.isNotEmpty && lrcRedResult.synced) {
        if (kDebugMode) {
          debugPrint(
            '[LyricsFlow] STEP 1 SUCCESS (lrc.red): Terminating early, returning synced lyrics.',
          );
        }
        return _saveAndReturn(
          cacheKey,
          lrcRedResult.lines,
          true,
          lrcRedResult.source,
          rawLrc: lrcRedResult.rawLrc,
          artist: cleanA,
          title: cleanT,
        );
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsFlow] Step 1 (lrc.red) error: $e');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: lrclib Next (https://github.com/tranxuanthang/lrclib.git)
    // (Strict: If synced found, DO NOT proceed to Step 3!)
    // ─────────────────────────────────────────────────────────────────────────
    String? stashedPlainLyrics;
    try {
      final lrclibResult = await _fetchLrclibFast(
        cleanT,
        cleanA,
        fullA,
        lang,
        track.album,
      );
      if (lrclibResult.synced != null &&
          lrclibResult.synced!.isNotEmpty &&
          lrclibResult.synced!.synced) {
        if (kDebugMode) {
          debugPrint(
            '[LyricsFlow] STEP 2 SUCCESS (lrclib synced): Terminating early, returning synced lyrics.',
          );
        }
        return _saveAndReturn(
          cacheKey,
          lrclibResult.synced!.lines,
          true,
          lrclibResult.synced!.source,
          rawLrc: lrclibResult.synced!.rawLrc,
          artist: cleanA,
          title: cleanT,
        );
      }
      stashedPlainLyrics = lrclibResult.plain;
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsFlow] Step 2 (lrclib) error: $e');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Plain text if available (LRCLIB plain or InnerTube official)
    // (Strict: If plain found, DO NOT proceed to Step 4!)
    // ─────────────────────────────────────────────────────────────────────────
    // 3a. Use plain lyrics stashed during LRCLIB query
    if (stashedPlainLyrics != null && stashedPlainLyrics.trim().isNotEmpty) {
      if (lang.isEmpty || isLanguageCompatible(stashedPlainLyrics, lang)) {
        final parsed = LrcParser.parse(stashedPlainLyrics);
        if (parsed.lines.isNotEmpty) {
          if (kDebugMode) {
            debugPrint(
              '[LyricsFlow] STEP 3 SUCCESS (lrclib plain): Returning plain text lyrics.',
            );
          }
          return _returnPlainMemoryOnly(
            cacheKey,
            parsed.lines,
            'lrclib_plain',
          );
        }
      }
    }

    // 3b. InnerTube official plain lyrics
    final videoId =
        track.id.startsWith('yt-') ? track.id.substring(3) : track.id;
    if (videoId.isNotEmpty) {
      try {
        final raw = await InnerTubeService.instance
            .getLyrics(videoId)
            .timeout(const Duration(milliseconds: 1500));
        if (raw != null && raw.trim().isNotEmpty) {
          if (lang.isEmpty || isLanguageCompatible(raw, lang)) {
            final parsed = LrcParser.parse(raw);
            if (parsed.lines.isNotEmpty) {
              if (parsed.synced) {
                return _saveAndReturn(
                  cacheKey,
                  parsed.lines,
                  true,
                  'innertube_official_synced',
                  rawLrc: raw,
                  artist: cleanA,
                  title: cleanT,
                );
              }
              if (kDebugMode) {
                debugPrint(
                  '[LyricsFlow] STEP 3 SUCCESS (innertube plain): Returning plain text lyrics.',
                );
              }
              return _returnPlainMemoryOnly(
                cacheKey,
                parsed.lines,
                'innertube_official_plain',
              );
            }
          }
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Lyrics Not Available (UI shows empty state / not available)
    // ─────────────────────────────────────────────────────────────────────────
    if (kDebugMode) {
      debugPrint(
        '[LyricsFlow] STEP 4: Lyrics Not Available for "${track.title}" by "${track.artist}".',
      );
    }
    _rejectedTimestamps[cacheKey] = DateTime.now().millisecondsSinceEpoch;
    return null;
  }

  // ───────────────────────── Step 1: lrc.red Provider ───────────────────────

  Future<LyricsResult?> _fetchLrcRedFast(
    String title,
    String primaryArtist,
    String fullArtist,
    String lang,
  ) async {
    final query = primaryArtist.isNotEmpty
        ? '$title $primaryArtist'.trim()
        : title.trim();

    try {
      final searchUri = Uri.parse(
        'https://lrc.red/search.json?q=${Uri.encodeComponent(query)}',
      );
      final searchRes = await _client
          .get(
            searchUri,
            headers: {'User-Agent': 'ZenifyApp/1.0 (https://zenify.app)'},
          )
          .timeout(const Duration(milliseconds: 1200));

      if (searchRes.statusCode != 200) return null;

      final searchJson =
          jsonDecode(utf8.decode(searchRes.bodyBytes)) as Map<String, dynamic>;
      final hits =
          (searchJson['hits'] as List?)?.cast<Map<String, dynamic>>() ?? [];
      if (hits.isEmpty) return null;

      for (final hit in hits.take(3)) {
        final hitTitle =
            (hit['title'] ?? hit['track'] ?? hit['name'] ?? '').toString();
        if (hitTitle.isNotEmpty && !isTitleMatch(hitTitle, title)) continue;

        final hitArtist =
            (hit['artist'] ?? hit['artistName'] ?? hit['author'] ?? '').toString();
        if (hitArtist.isNotEmpty &&
            primaryArtist.isNotEmpty &&
            !isArtistMatch(hitArtist, primaryArtist) &&
            !isArtistMatch(hitArtist, fullArtist)) {
          continue;
        }

        final isrc = (hit['isrc'] ?? '').toString().trim();
        if (isrc.isEmpty) continue;

        // Fetch .lrc directly in ONE single request (instant and ultra fast)
        final lrcUri = Uri.parse('https://lrc.red/s/$isrc.lrc');
        final lrcRes = await _client
            .get(
              lrcUri,
              headers: {'User-Agent': 'ZenifyApp/1.0 (https://zenify.app)'},
            )
            .timeout(const Duration(milliseconds: 1200));

        if (lrcRes.statusCode == 200) {
          final lrcContent = utf8.decode(lrcRes.bodyBytes);
          if (lang.isNotEmpty && !isLanguageCompatible(lrcContent, lang)) {
            continue;
          }

          final parsed = LrcParser.parse(lrcContent);
          if (parsed.lines.isNotEmpty && parsed.synced) {
            final hasWordTimings = parsed.lines.any(
              (l) => l['words'] != null && (l['words'] as List).isNotEmpty,
            );
            return LyricsResult(
              lines: parsed.lines,
              synced: true,
              source: hasWordTimings ? 'lrc_red_wbw' : 'lrc_red',
              rawLrc: lrcContent,
            );
          }
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsFlow] _fetchLrcRedFast error: $e');
    }
    return null;
  }

  // ───────────────────────── Step 2: LRCLIB Provider ────────────────────────

  Future<({LyricsResult? synced, String? plain})> _fetchLrclibFast(
    String title,
    String primaryArtist,
    String fullArtist,
    String lang,
    String album,
  ) async {
    String? stashedPlain;

    // Concurrently fire direct GET /api/get and search GET /api/search in parallel (ultra-fast)
    final directFuture = () async {
      try {
        final uri = Uri.https('lrclib.net', '/api/get', {
          'track_name': title,
          if (primaryArtist.isNotEmpty) 'artist_name': primaryArtist,
          if (album.isNotEmpty &&
              album.toLowerCase() != 'single' &&
              album.toLowerCase() != 'music video')
            'album_name': album,
        });
        final res = await _client
            .get(
              uri,
              headers: {
                'User-Agent': 'Zenify Mobile App v1.0 (https://zenify.app)',
              },
            )
            .timeout(const Duration(milliseconds: 1400));
        if (res.statusCode == 200) {
          return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
        }
      } catch (_) {}
      return null;
    }();

    final searchFuture = () async {
      try {
        final query = primaryArtist.isNotEmpty
            ? '$title $primaryArtist'.trim()
            : title.trim();
        final searchUri = Uri.https('lrclib.net', '/api/search', {
          'q': query,
        });
        final res = await _client
            .get(
              searchUri,
              headers: {
                'User-Agent': 'Zenify Mobile App v1.0 (https://zenify.app)',
              },
            )
            .timeout(const Duration(milliseconds: 1400));
        if (res.statusCode == 200) {
          final list = jsonDecode(utf8.decode(res.bodyBytes));
          if (list is List && list.isNotEmpty) {
            return list.cast<Map<dynamic, dynamic>>();
          }
        }
      } catch (_) {}
      return null;
    }();

    final results = await Future.wait([directFuture, searchFuture]);
    final directJson = results[0] as Map<String, dynamic>?;
    final searchList = results[1] as List<Map<dynamic, dynamic>>?;

    // 1. Check direct GET result first
    if (directJson != null) {
      final plainLyrics = directJson['plainLyrics'] as String?;
      final syncedLyrics = directJson['syncedLyrics'] as String?;

      if (plainLyrics != null && plainLyrics.trim().isNotEmpty) {
        stashedPlain = plainLyrics;
      }

      if (syncedLyrics != null && syncedLyrics.trim().isNotEmpty) {
        if (lang.isEmpty || isLanguageCompatible(syncedLyrics, lang)) {
          final parsed = LrcParser.parse(syncedLyrics);
          if (parsed.lines.isNotEmpty && parsed.synced) {
            return (
              synced: LyricsResult(
                lines: parsed.lines,
                synced: true,
                source: 'lrclib_synced',
                rawLrc: syncedLyrics,
              ),
              plain: null,
            );
          }
        }
      }
    }

    // 2. Check search GET hits
    if (searchList != null && searchList.isNotEmpty) {
      for (final item in searchList.take(3)) {
        final map = Map<String, dynamic>.from(item);
        final candTrack = (map['trackName'] ?? map['name'] ?? '').toString();
        if (candTrack.isNotEmpty && !isTitleMatch(candTrack, title)) {
          continue;
        }

        final candArtist = (map['artistName'] ?? '').toString();
        if (candArtist.isNotEmpty &&
            primaryArtist.isNotEmpty &&
            !isArtistMatch(candArtist, primaryArtist) &&
            !isArtistMatch(candArtist, fullArtist)) {
          continue;
        }

        final plainLyrics = map['plainLyrics'] as String?;
        final syncedLyrics = map['syncedLyrics'] as String?;

        if (plainLyrics != null &&
            plainLyrics.trim().isNotEmpty &&
            stashedPlain == null) {
          stashedPlain = plainLyrics;
        }

        if (syncedLyrics != null && syncedLyrics.trim().isNotEmpty) {
          if (lang.isEmpty || isLanguageCompatible(syncedLyrics, lang)) {
            final parsed = LrcParser.parse(syncedLyrics);
            if (parsed.lines.isNotEmpty && parsed.synced) {
              return (
                synced: LyricsResult(
                  lines: parsed.lines,
                  synced: true,
                  source: 'lrclib_search_synced',
                  rawLrc: syncedLyrics,
                ),
                plain: null,
              );
            }
          }
        }
      }
    }

    return (synced: null, plain: stashedPlain);
  }

  // ───────────────────────── Storage Helpers ────────────────────────────────

  static List<Map<String, dynamic>> _alignOfficialLyrics(
    List<Map<String, dynamic>> timedLines,
    String? officialYtLyrics,
  ) {
    if (officialYtLyrics == null ||
        officialYtLyrics.trim().isEmpty ||
        timedLines.isEmpty) {
      return timedLines;
    }

    final rawOfficial = officialYtLyrics
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty && !l.startsWith('[') && !l.startsWith('<'))
        .toList();

    if (rawOfficial.isEmpty) return timedLines;

    // If line counts match identically, swap in official lyrics lines with zero drift
    if (rawOfficial.length == timedLines.length) {
      final merged = <Map<String, dynamic>>[];
      for (var i = 0; i < timedLines.length; i++) {
        final timed = Map<String, dynamic>.from(timedLines[i]);
        timed['text'] = rawOfficial[i];
        merged.add(timed);
      }
      return merged;
    }

    // Windowed fuzzy match for slightly varying line counts (interludes, repeated lines)
    final merged = <Map<String, dynamic>>[];
    var lastOfficialIdx = 0;

    for (final timed in timedLines) {
      final tCopy = Map<String, dynamic>.from(timed);
      final timedText = (tCopy['text'] as String? ?? '').trim().toLowerCase();
      if (timedText.isEmpty || timedText == '• • •') {
        merged.add(tCopy);
        continue;
      }

      int bestMatchIdx = -1;
      double bestScore = 0.0;
      final searchEnd = math.min(rawOfficial.length, lastOfficialIdx + 5);

      for (var j = lastOfficialIdx; j < searchEnd; j++) {
        final offText = rawOfficial[j].toLowerCase();
        if (offText == timedText) {
          bestMatchIdx = j;
          bestScore = 1.0;
          break;
        }
        final timedWords = timedText.split(RegExp(r'\s+')).toSet();
        final offWords = offText.split(RegExp(r'\s+')).toSet();
        if (timedWords.isNotEmpty && offWords.isNotEmpty) {
          final inter = timedWords.intersection(offWords).length;
          final score = inter / math.max(timedWords.length, offWords.length);
          if (score > 0.6 && score > bestScore) {
            bestScore = score;
            bestMatchIdx = j;
          }
        }
      }

      if (bestMatchIdx != -1) {
        tCopy['text'] = rawOfficial[bestMatchIdx];
        lastOfficialIdx = bestMatchIdx + 1;
      }

      merged.add(tCopy);
    }

    return merged;
  }

  LyricsResult _saveAndReturn(
    String cacheKey,
    List<Map<String, dynamic>> lines,
    bool synced,
    String source, {
    String? rawLrc,
    String? artist,
    String? title,
    String? officialYtLyrics,
  }) {
    final hasWbw = lines.any((l) => l['words'] != null && (l['words'] as List).isNotEmpty);
    // Never overwrite word-by-word synced lines with plain YouTube lyrics
    final finalLines = (hasWbw || officialYtLyrics == null || officialYtLyrics.trim().isEmpty)
        ? lines
        : _alignOfficialLyrics(lines, officialYtLyrics);
    final result = LyricsResult(
      lines: finalLines,
      synced: synced,
      source: source,
      rawLrc: rawLrc,
    );
    _memCache[cacheKey] = result;

    // Cache persistently on disk only when synced
    if (synced) {
      SharedPreferences.getInstance()
          .then((prefs) {
            prefs.setString(
              '$_kCachePrefix$cacheKey',
              jsonEncode({
                'lines': finalLines,
                'synced': true,
                'source': source,
                'rawLrc': rawLrc,
                'artist': artist,
                'title': title,
              }),
            );
          })
          .catchError((_) {});
    }

    return result;
  }

  LyricsResult _returnPlainMemoryOnly(
    String cacheKey,
    List<Map<String, dynamic>> lines,
    String source,
  ) {
    final result = LyricsResult(lines: lines, synced: false, source: source);
    // In-memory cache only; do NOT lock disk into plain lyrics permanently!
    _memCache[cacheKey] = result;
    return result;
  }
}
