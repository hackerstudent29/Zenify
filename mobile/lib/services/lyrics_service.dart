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
  static final RegExp _rangeTagRegex = RegExp(
    r'^\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\s*(?:[\-–—]|->|,)\s*(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]',
  );
  static final RegExp _bareRangeRegex = RegExp(
    r'^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*(?:[\-–—]|-->|->)\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?(?:\s+(.*))?$',
  );
  static final RegExp _wordTagRegex = RegExp(
    r'<(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?>',
  );

  static int _stampToMs(
    String? minStr,
    String? secStr,
    String? msStr, {
    String? hourStr,
  }) {
    final hr = int.tryParse(hourStr ?? '0') ?? 0;
    final min = int.tryParse(minStr ?? '0') ?? 0;
    final sec = int.tryParse(secStr ?? '0') ?? 0;
    final rawMs = msStr ?? '0';
    var ms = int.tryParse(rawMs) ?? 0;
    if (rawMs.length == 1) ms *= 100;
    if (rawMs.length == 2) ms *= 10;
    return hr * 3600000 + min * 60000 + sec * 1000 + ms;
  }

  /// Parses an LRC string (line-synced, range `[mm:ss.xx-mm:ss.xx]`,
  /// trailing end-stamp, SRT/VTT/bare `0:36-0:43 text`, or word-level `<mm:ss.xx>`)
  /// or plain text into timed line maps.
  static ({List<Map<String, dynamic>> lines, bool synced}) parse(
    String content,
  ) {
    final rawLines = content.split('\n');
    final timedList =
        <({
          int startMs,
          int? explicitEndMs,
          String text,
          List<Map<String, dynamic>>? words,
        })>[];
    final plainList = <String>[];

    for (var lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
      final line = rawLines[lineIdx].trim();
      if (line.isEmpty) continue;
      if (line == 'WEBVTT' || RegExp(r'^\d+$').hasMatch(line) && lineIdx + 1 < rawLines.length && _bareRangeRegex.hasMatch(rawLines[lineIdx + 1].trim())) {
        continue;
      }

      // Check for metadata tags like [ar: Artist], [ti: Title], [offset: 0]
      if (line.startsWith('[') && !line.startsWith(RegExp(r'\[\d'))) {
        continue;
      }

      // Check bracket range timestamp format: [00:36.00-00:43.00]xxxxxx
      final rangeMatch = _rangeTagRegex.firstMatch(line);
      if (rangeMatch != null) {
        final startMs = _stampToMs(
          rangeMatch.group(1),
          rangeMatch.group(2),
          rangeMatch.group(3),
        );
        final endMs = _stampToMs(
          rangeMatch.group(4),
          rangeMatch.group(5),
          rangeMatch.group(6),
        );
        var text = line.substring(rangeMatch.end).replaceAll(_tagRegex, '').trim();
        List<Map<String, dynamic>>? words;
        if (_wordTagRegex.hasMatch(text)) {
          words = _parseWordLevel(text);
          text = text
              .replaceAll(_wordTagRegex, '')
              .replaceAll(RegExp(r'\s+'), ' ')
              .trim();
        }
        if (text.isEmpty) text = '• • •';
        timedList.add((
          startMs: startMs,
          explicitEndMs: endMs > startMs ? endMs : null,
          text: text,
          words: words,
        ));
        continue;
      }

      // Check SRT/VTT/bare time range: "0:36-0:43 xxxxxx" or "00:00:36,000 --> 00:00:43,000"
      final bareMatch = _bareRangeRegex.firstMatch(line);
      if (bareMatch != null) {
        final startMs = _stampToMs(
          bareMatch.group(2),
          bareMatch.group(3),
          bareMatch.group(4),
          hourStr: bareMatch.group(1),
        );
        final endMs = _stampToMs(
          bareMatch.group(6),
          bareMatch.group(7),
          bareMatch.group(8),
          hourStr: bareMatch.group(5),
        );
        var text = (bareMatch.group(9) ?? '').trim();
        if (text.isEmpty) {
          final cueBuf = <String>[];
          while (lineIdx + 1 < rawLines.length) {
            final nxt = rawLines[lineIdx + 1].trim();
            if (nxt.isEmpty || _bareRangeRegex.hasMatch(nxt)) break;
            cueBuf.add(nxt);
            lineIdx++;
          }
          text = cueBuf.join(' ').trim();
        }
        List<Map<String, dynamic>>? words;
        if (_wordTagRegex.hasMatch(text)) {
          words = _parseWordLevel(text);
          text = text
              .replaceAll(_wordTagRegex, '')
              .replaceAll(RegExp(r'\s+'), ' ')
              .trim();
        }
        if (text.isEmpty) text = '• • •';
        timedList.add((
          startMs: startMs,
          explicitEndMs: endMs > startMs ? endMs : null,
          text: text,
          words: words,
        ));
        continue;
      }

      final matches = _tagRegex.allMatches(line).toList();
      if (matches.isNotEmpty) {
        // Detect trailing end timestamp format: [00:36.00]xxxxxx[00:43.00]
        // (distinct from multi-start chorus tags like [00:10.00][00:30.00]chorus).
        int? explicitEndMs;
        var startMatches = matches;
        if (matches.length >= 2) {
          final lastM = matches.last;
          final afterLast = line.substring(lastM.end).trim();
          final betweenFirstAndLast = line
              .substring(matches[matches.length - 2].end, lastM.start)
              .replaceAll(_wordTagRegex, '')
              .trim();
          if (afterLast.isEmpty && betweenFirstAndLast.isNotEmpty) {
            explicitEndMs = _stampToMs(
              lastM.group(1),
              lastM.group(2),
              lastM.group(3),
            );
            startMatches = matches.sublist(0, matches.length - 1);
          }
        }

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

        if (text.isEmpty && startMatches.length == 1) {
          // Empty timed break line (interlude marker)
          text = '• • •';
        }

        for (final m in startMatches) {
          final totalMs = _stampToMs(m.group(1), m.group(2), m.group(3));
          timedList.add((
            startMs: totalMs,
            explicitEndMs: explicitEndMs != null && explicitEndMs > totalMs
                ? explicitEndMs
                : null,
            text: text,
            words: words,
          ));
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

        // Preserve explicit end times and word-level endings even when they
        // intentionally overlap into the following line.
        if (cur.explicitEndMs != null && cur.explicitEndMs! > cur.startMs) {
          endMs = cur.explicitEndMs!;
        } else if (cur.words != null && cur.words!.isNotEmpty) {
          final lastWordEnd = cur.words!.last['endMs'];
          if (lastWordEnd is int && lastWordEnd > cur.startMs) {
            endMs = math.max(lastWordEnd, cur.startMs + 500);
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
        r'\s*(?:\([^)]*(?:feat\.?|ft\.?|with)[^)]*\)|\[[^\]]*\])\s*$',
        caseSensitive: false,
      ),
      '',
    ).trim();
    s = s.replaceAll(
      RegExp(
        r'\s*[\-–—|]\s*(video|audio|lyric|song|tamil|telugu|hindi|malayalam|kannada|remaster|hd|4k|official).*$',
        caseSensitive: false,
      ),
      '',
    ).trim();
    return s.isNotEmpty ? s : title.trim();
  }

  static final RegExp _artistSplitPattern = RegExp(
    r'\s*(?:[,&/|•]|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|(?<=\S{2})\s+(?:x|with|et)\s+(?=\S{2}))\s*',
    caseSensitive: false,
  );

  /// Splits an artist credit string into normalized individual artist names.
  static List<String> splitArtists(String artist) {
    if (artist.trim().isEmpty) return const [];
    var s = MediaNormalizer.cleanArtistName(artist);
    if (s.isEmpty) s = artist;
    return s
        .split(_artistSplitPattern)
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty && !MediaNormalizer.isDistributorOrLabel(e))
        .toList();
  }

  static String cleanArtist(String artist) {
    if (artist.trim().isEmpty) return '';
    var s = MediaNormalizer.cleanArtistName(artist);
    if (s.isEmpty) s = artist;
    if (MediaNormalizer.isDistributorOrLabel(s)) {
      return '';
    }
    return s.split(_artistSplitPattern).first.trim();
  }

  static final RegExp _nonWordUnicode = RegExp(
    r'[^\p{L}\p{N}]',
    unicode: true,
  );
  static final RegExp _wordSplitUnicode = RegExp(
    r'[^\p{L}\p{N}]+',
    unicode: true,
  );

  static String _stripParentheticals(String text) {
    final stripped = text
        .replaceAll(RegExp(r'\s*\([^)]*\)\s*'), ' ')
        .replaceAll(RegExp(r'\s*\[[^\]]*\]\s*'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return stripped.isNotEmpty ? stripped : text.trim();
  }

  /// Validates that a lyrics candidate's title actually matches the playing song's title.
  /// Handles Unicode scripts (Tamil, Hindi, Telugu, CJK, accented Latin) cleanly
  /// while rejecting false parenthetical matches like "(Live from São Paulo)".
  static bool isTitleMatch(String? candidate, String target) {
    if (candidate == null || candidate.trim().isEmpty) return false;
    final cCore = _stripParentheticals(cleanTitle(candidate));
    final tCore = _stripParentheticals(cleanTitle(target));
    final cRaw = normalizeDiacritics(cCore).toLowerCase();
    final tRaw = normalizeDiacritics(tCore).toLowerCase();
    final c = cRaw.replaceAll(_nonWordUnicode, '');
    final t = tRaw.replaceAll(_nonWordUnicode, '');
    if (c.isEmpty || t.isEmpty) return false;
    if (c == t) return true;

    // Segment before hyphen or colon matches (e.g. "Hukum" == "Hukum - Thalaivar Alappara")
    final cSegments = cRaw
        .split(RegExp(r'[\-–—:]'))
        .map((s) => s.replaceAll(_nonWordUnicode, '').trim())
        .where((s) => s.isNotEmpty)
        .toList();
    final tSegments = tRaw
        .split(RegExp(r'[\-–—:]'))
        .map((s) => s.replaceAll(_nonWordUnicode, '').trim())
        .where((s) => s.isNotEmpty)
        .toList();
    if (cSegments.isNotEmpty && tSegments.isNotEmpty) {
      if (cSegments.first == tSegments.first) return true;
      for (final cs in cSegments) {
        for (final ts in tSegments) {
          if (cs.length >= 3 && cs == ts) return true;
        }
      }
    }

    // Prefix containment with ratio guard so unrelated titles with a shared phrase don't collide
    if (c.length >= 3 && t.length >= 3 && (c.startsWith(t) || t.startsWith(c))) {
      final shorter = math.min(c.length, t.length);
      final longer = math.max(c.length, t.length);
      if (shorter / longer >= 0.45) return true;
    }

    final cWords = cRaw.split(_wordSplitUnicode).where((w) => w.length >= 2).toSet();
    final tWords = tRaw.split(_wordSplitUnicode).where((w) => w.length >= 2).toSet();
    if (cWords.isEmpty || tWords.isEmpty) return false;
    final overlap = cWords.intersection(tWords);
    final maxCount = math.max(cWords.length, tWords.length);

    return overlap.length / maxCount >= 0.65;
  }

  /// Validates that a lyrics candidate's artist matches the playing song's artist.
  /// Prevents cross-artist collisions while tolerating multiple featured vocalists and Unicode names.
  static bool isArtistMatch(String? candidate, String target) {
    if (candidate == null || candidate.trim().isEmpty) return false;
    if (target.trim().isEmpty) return true;

    if (MediaNormalizer.isDistributorOrLabel(candidate) ||
        MediaNormalizer.isDistributorOrLabel(target)) {
      return true;
    }

    final cNorm = normalizeDiacritics(candidate).toLowerCase();
    final tNorm = normalizeDiacritics(target).toLowerCase();
    final c = cNorm.replaceAll(_nonWordUnicode, '');
    final t = tNorm.replaceAll(_nonWordUnicode, '');
    if (c.isEmpty) return false;
    if (t.isEmpty) return true;
    if (c == t) return true;
    if (math.min(c.length, t.length) >= 4 && (c.contains(t) || t.contains(c))) {
      return true;
    }

    final cArtists = cNorm
        .split(_artistSplitPattern)
        .map((s) => s.trim().replaceAll(_nonWordUnicode, ''))
        .where((s) => s.length >= 2)
        .toSet();
    final tArtists = tNorm
        .split(_artistSplitPattern)
        .map((s) => s.trim().replaceAll(_nonWordUnicode, ''))
        .where((s) => s.length >= 2)
        .toSet();

    if (cArtists.isEmpty || tArtists.isEmpty) return false;

    for (final ca in cArtists) {
      for (final ta in tArtists) {
        if (ca == ta) return true;
        if (math.min(ca.length, ta.length) >= 4 &&
            (ca.contains(ta) || ta.contains(ca))) {
          return true;
        }
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

  static const String _kCachePrefix = 'lyrics_cache_v14_';

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
  /// Prevents cross-language collisions (e.g. Tamil lyrics on Telugu song)
  /// while allowing bilingual songs that mix Tamil/Hindi/Arabic/English verses.
  static bool isLanguageCompatible(String lyricsText, String expectedLanguage) {
    if (expectedLanguage.isEmpty) return true;
    final exp = expectedLanguage.toLowerCase().trim();

    // 0. Build full script rune histogram so bilingual tracks (e.g. Tamil + Hindi/Arabic)
    // aren't rejected just for containing >8 runes of a featured language.
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
    var latin = 0;

    for (final rune in lyricsText.runes) {
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
      } else if ((rune >= 65 && rune <= 90) || (rune >= 97 && rune <= 122)) {
        latin++;
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

    const indicCrossScripts = {
      'tamil',
      'telugu',
      'hindi',
      'malayalam',
      'kannada',
      'bengali',
      'punjabi',
    };

    final expNative = counts[exp] ?? 0;

    // 1. Native script validation:
    // If substantial expected native script is present (>= 12 runes), allow bilingual side-verses
    // unless a conflicting Indic/Asian script vastly dominates (> 2x expected and >= 30 runes).
    if (expNative >= 12) {
      for (final entry in counts.entries) {
        if (entry.key == exp) continue;
        if (entry.value >= 30 && entry.value > expNative * 2) {
          if (kDebugMode) {
            debugPrint(
              '[LyricsFlow] REJECTED: Dominant script=${entry.key}(${entry.value}) over $exp($expNative)',
            );
          }
          return false;
        }
      }
      return true;
    }

    // When expected native runes are absent (< 12), reject strong conflicting Indic/Asian script
    // (e.g., Telugu/Devanagari script on a Tamil track, or Tamil script on a Telugu track).
    if (indicCrossScripts.contains(exp)) {
      var foreignIndic = 0;
      for (final k in indicCrossScripts) {
        if (k != exp) foreignIndic += counts[k] ?? 0;
      }
      if (foreignIndic > 8) {
        if (kDebugMode) {
          debugPrint(
            '[LyricsFlow] REJECTED: Foreign script runes found in ${_cap(exp)} song lyrics',
          );
        }
        return false;
      }
      if ((korean > 12 || japanese > 12) || (arabic > 18 && latin < 20)) {
        if (kDebugMode) {
          debugPrint(
            '[LyricsFlow] REJECTED: Foreign non-Indic script in ${_cap(exp)} song lyrics',
          );
        }
        return false;
      }
    } else {
      final scriptLang = detectScriptLanguage(lyricsText);
      if (scriptLang != null && scriptLang != exp) {
        // Tolerate bilingual Arabic/Tanglish sections when lyrics are predominantly Latin.
        if (!(scriptLang == 'arabic' && latin > (arabic * 1.5))) {
          if (kDebugMode) {
            debugPrint(
              '[LyricsFlow] Rejected lyrics: detected script=$scriptLang vs expected=$exp',
            );
          }
          return false;
        }
      }
    }

    // 2. Transliterated / Romanized check: tolerate bilingual tracks (e.g. Tamil + Hindi rap).
    // Reject ONLY when foreign Indic markers dominate (>= 3) with zero expected-language signal.
    final words = lyricsText
        .toLowerCase()
        .split(RegExp(r'[^a-z]+'))
        .where((w) => w.length >= 3)
        .toSet();
    if (words.isNotEmpty) {
      final scores = {
        'tamil': words.intersection(_tamilMarkers).length,
        'telugu': words.intersection(_teluguMarkers).length,
        'hindi': words.intersection(_hindiMarkers).length,
        'malayalam': words.intersection(_malayalamMarkers).length,
        'kannada': words.intersection(_kannadaMarkers).length,
      };
      final expCount = scores[exp] ?? 0;
      if (expCount == 0 && scores.containsKey(exp)) {
        final maxEntry = scores.entries.reduce(
          (a, b) => a.value > b.value ? a : b,
        );
        if (maxEntry.key != exp && maxEntry.value >= 3) {
          if (kDebugMode) {
            debugPrint(
              '[LyricsFlow] Rejected lyrics: dominant romanized=${maxEntry.key}(${maxEntry.value}) vs expected=$exp(0)',
            );
          }
          return false;
        }
      }
    }

    return true;
  }

  static String _cap(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

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

  /// Fetches lyrics using parallel multi-provider racing with strict priority:
  /// Tier 1 (WBW / lrc.red) -> Tier 2 (LRCLIB synced) -> Tier 3 (LRCLIB / InnerTube plain).
  Future<LyricsResult?> fetchLyrics(Track track, {bool force = false}) {
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
    if (force) {
      _rejectedTimestamps.remove(cacheKey);
    } else {
      final rejTime = _rejectedTimestamps[cacheKey];
      if (rejTime != null &&
          (DateTime.now().millisecondsSinceEpoch - rejTime) < 5000) {
        return Future.value(null);
      }
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

  /// Synchronously returns in-memory cached lyrics if already loaded for [trackId].
  LyricsResult? getCachedSync(String trackId) => _memCache[trackId];

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
    final videoId =
        track.id.startsWith('yt-') ? track.id.substring(3) : track.id;

    // ─────────────────────────────────────────────────────────────────────────
    // PARALLEL TIERED RESOLUTION (Launch lrc.red + LRCLIB + InnerTube together)
    // ─────────────────────────────────────────────────────────────────────────
    final lrcRedFuture = _fetchLrcRedFast(
      cleanT,
      track.title,
      cleanA,
      fullA,
      lang,
      track.album,
      track.durationSeconds,
    );
    final lrclibFuture = _fetchLrclibFast(
      cleanT,
      track.title,
      cleanA,
      fullA,
      lang,
      track.album,
      track.durationSeconds,
    );
    final ytFuture = videoId.isNotEmpty
        ? InnerTubeService.instance
              .getLyrics(videoId)
              .timeout(const Duration(milliseconds: 4500))
              .catchError((_) => null)
        : Future<String?>.value(null);

    LyricsResult? lrcRedRes;
    bool lrcRedDone = false;
    unawaited(
      lrcRedFuture.then((v) {
        lrcRedRes = v;
        lrcRedDone = true;
      }).catchError((_) {
        lrcRedDone = true;
      }),
    );

    ({LyricsResult? synced, String? plain}) lrclibRes = (synced: null, plain: null);
    bool lrclibDone = false;
    unawaited(
      lrclibFuture.then((v) {
        lrclibRes = v;
        lrclibDone = true;
      }).catchError((_) {
        lrclibDone = true;
      }),
    );

    // Wait for first high-priority synced winner (without stalling on slow providers)
    final raceCompleter = Completer<LyricsResult?>();

    void tryResolveRace() {
      if (raceCompleter.isCompleted) return;
      if (lrcRedDone && lrcRedRes != null && lrcRedRes!.isNotEmpty && lrcRedRes!.synced) {
        raceCompleter.complete(lrcRedRes);
        return;
      }
      if (lrclibDone && lrclibRes.synced != null && lrclibRes.synced!.isNotEmpty) {
        final hasWbw = lrclibRes.synced!.lines.any(
          (l) => l['words'] != null && (l['words'] as List).isNotEmpty,
        );
        if (hasWbw || lrcRedDone) {
          raceCompleter.complete(lrclibRes.synced);
          return;
        }
        // Give lrc.red up to 450ms head start to deliver WBW before settling on LRCLIB line-synced
        Timer(const Duration(milliseconds: 450), () {
          if (!raceCompleter.isCompleted) {
            raceCompleter.complete(
              (lrcRedRes != null && lrcRedRes!.isNotEmpty && lrcRedRes!.synced)
                  ? lrcRedRes
                  : lrclibRes.synced,
            );
          }
        });
        return;
      }
      if (lrcRedDone && lrclibDone) {
        raceCompleter.complete(null);
      }
    }

    unawaited(lrcRedFuture.whenComplete(tryResolveRace));
    unawaited(lrclibFuture.whenComplete(tryResolveRace));

    final syncedWinner = await raceCompleter.future.timeout(
      const Duration(milliseconds: 7500),
      onTimeout: () => lrcRedRes ?? lrclibRes.synced,
    );

    if (syncedWinner != null && syncedWinner.isNotEmpty && syncedWinner.synced) {
      if (kDebugMode) {
        debugPrint(
          '[LyricsFlow] SYNCED SUCCESS (${syncedWinner.source}) for "$cleanT"',
        );
      }
      return _saveAndReturn(
        cacheKey,
        syncedWinner.lines,
        true,
        syncedWinner.source,
        rawLrc: syncedWinner.rawLrc,
        artist: cleanA,
        title: cleanT,
      );
    }

    // Plain Fallback: check stashed LRCLIB plain first, then already in-flight InnerTube
    final stashedPlain = lrclibRes.plain;
    if (stashedPlain != null && stashedPlain.trim().isNotEmpty) {
      if (lang.isEmpty || isLanguageCompatible(stashedPlain, lang)) {
        final parsed = LrcParser.parse(stashedPlain);
        if (parsed.lines.isNotEmpty) {
          if (kDebugMode) {
            debugPrint('[LyricsFlow] PLAIN SUCCESS (lrclib_plain) for "$cleanT"');
          }
          return _returnPlainMemoryOnly(cacheKey, parsed.lines, 'lrclib_plain');
        }
      }
    }

    try {
      final raw = await ytFuture;
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
                '[LyricsFlow] PLAIN SUCCESS (innertube_official_plain) for "$cleanT"',
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

    if (kDebugMode) {
      debugPrint(
        '[LyricsFlow] NOT AVAILABLE for "${track.title}" by "${track.artist}".',
      );
    }
    _rejectedTimestamps[cacheKey] = DateTime.now().millisecondsSinceEpoch;
    return null;
  }

  static final RegExp _hardVariantRejectPattern = RegExp(
    r'\b(?:acapella|a\s*capella|instrumental|karaoke|dj\s*mix|mixed|1950s|nightcore|8d|slowed|sped\s*up|speed\s*up|lo[\-\s]?fi)\b',
    caseSensitive: false,
  );

  static final RegExp _softVariantPenaltyPattern = RegExp(
    r'\b(?:single\s*version|live\s*(?:from|at)|remix|acoustic|radio\s*edit|clean\s*version)\b',
    caseSensitive: false,
  );

  /// Returns true when candidate metadata introduces a mismatched cut (e.g. acapella,
  /// DJ mix, karaoke) not present in the target track's title.
  @visibleForTesting
  static bool hasDisallowedVariant(String candidateTitle, String targetRawTitle) {
    final normCand = normalizeDiacritics(candidateTitle).toLowerCase();
    final normTarget = normalizeDiacritics(targetRawTitle).toLowerCase();
    for (final m in _hardVariantRejectPattern.allMatches(normCand)) {
      final tag = m.group(0)!.trim();
      if (!normTarget.contains(tag)) return true;
    }
    return false;
  }

  /// Checks whether candidate duration fits within tolerance of [targetSeconds].
  @visibleForTesting
  static bool isDurationCompatible(num? candidateSeconds, int targetSeconds) {
    if (targetSeconds <= 0 || candidateSeconds == null || candidateSeconds <= 0) {
      return true;
    }
    final diff = (candidateSeconds.round() - targetSeconds).abs();
    final maxAllowed = math.max(22, (targetSeconds * 0.14).round());
    return diff <= maxAllowed;
  }

  static bool _isSelfTitledOrGenericAlbum(String albumName, String songTitle) {
    final cleaned = normalizeDiacritics(albumName)
        .replaceAll(
          RegExp(
            r'\s*(?:[\-–—]\s*(?:single|ep)|\(\s*(?:single|ep)\s*\)|\[\s*(?:single|ep)\s*\])\s*$',
            caseSensitive: false,
          ),
          '',
        )
        .trim();
    if (cleaned.isEmpty) return true;
    final lower = cleaned.toLowerCase();
    if (lower == 'single' ||
        lower == 'ep' ||
        lower == 'music video' ||
        lower == 'youtube music') {
      return true;
    }
    return isTitleMatch(cleaned, songTitle);
  }

  /// Scores a candidate track against song name, artist, album, and duration.
  /// Returns `null` if the candidate should be rejected.
  static int? _scoreMetadataCandidate({
    required String candTitle,
    required String candArtist,
    required String candAlbum,
    required num? candDuration,
    required String targetTitle,
    required String targetRawTitle,
    required String primaryArtist,
    required String fullArtist,
    required String targetAlbum,
    required int targetDurationSeconds,
    bool hasWbw = false,
  }) {
    final cleanCandTitle = candTitle.trim();
    if (cleanCandTitle.isEmpty || !isTitleMatch(cleanCandTitle, targetTitle)) {
      return null;
    }
    if (hasDisallowedVariant(cleanCandTitle, targetRawTitle)) return null;

    final targetArtists = splitArtists(fullArtist);
    final artistOk =
        primaryArtist.isEmpty ||
        isArtistMatch(candArtist, primaryArtist) ||
        isArtistMatch(candArtist, fullArtist) ||
        targetArtists.any((a) => isArtistMatch(candArtist, a));

    final candDurSec = candDuration?.round() ?? 0;
    final durDiff = (targetDurationSeconds > 0 && candDurSec > 0)
        ? (candDurSec - targetDurationSeconds).abs()
        : 0;
    final isPlaceholderDur =
        targetDurationSeconds <= 0 ||
        targetDurationSeconds == 210 ||
        targetDurationSeconds == 240;

    final validAlbumRescue =
        !artistOk &&
        targetDurationSeconds > 0 &&
        candDurSec > 0 &&
        durDiff <= 4 &&
        targetAlbum.trim().isNotEmpty &&
        candAlbum.trim().isNotEmpty &&
        !_isSelfTitledOrGenericAlbum(targetAlbum, targetTitle) &&
        !_isSelfTitledOrGenericAlbum(candAlbum, targetTitle) &&
        isTitleMatch(candAlbum, targetAlbum);

    if (candArtist.trim().isNotEmpty && !artistOk && !validAlbumRescue) {
      return null;
    }

    // Reject tiny snippets/previews when targeting a full track unless duration is unknown.
    if (targetDurationSeconds >= 90 &&
        candDurSec > 0 &&
        candDurSec < 40 &&
        !isPlaceholderDur) {
      return null;
    }

    // Reject wildly mismatched durations when no album rescue applies and target is real.
    if (!artistOk && !isDurationCompatible(candDuration, targetDurationSeconds)) {
      return null;
    }

    var score = 10;
    if (artistOk) {
      score += 80;
    } else if (validAlbumRescue) {
      score += 25;
    }

    final targetCore =
        normalizeDiacritics(_stripParentheticals(targetTitle)).toLowerCase();
    final normCandTitle = normalizeDiacritics(cleanCandTitle).toLowerCase();
    final candCore =
        normalizeDiacritics(_stripParentheticals(cleanCandTitle)).toLowerCase();
    if (candCore == targetCore) score += 25;
    if (normCandTitle == normalizeDiacritics(targetTitle).toLowerCase()) {
      score += 20;
    }

    final normRawTarget = normalizeDiacritics(targetRawTitle).toLowerCase();
    if (_softVariantPenaltyPattern.hasMatch(normCandTitle) &&
        !normRawTarget.contains('live') &&
        !normRawTarget.contains('single') &&
        !normRawTarget.contains('remix')) {
      score -= 30;
    }

    if (targetDurationSeconds > 0 && candDurSec > 0) {
      if (durDiff <= 4) {
        score += 55;
      } else if (durDiff <= 10) {
        score += 38;
      } else if (durDiff <= 18) {
        score += 22;
      } else if (isDurationCompatible(candDuration, targetDurationSeconds)) {
        score += 10;
      } else if (!isPlaceholderDur) {
        score -= (durDiff > 60) ? 45 : 20;
      }
    }

    if (targetAlbum.trim().isNotEmpty &&
        candAlbum.trim().isNotEmpty &&
        !_isSelfTitledOrGenericAlbum(targetAlbum, targetTitle) &&
        isTitleMatch(candAlbum, targetAlbum)) {
      score += 20;
    }

    if (hasWbw) score += 20;

    return score;
  }

  /// Filters and ranks `lrc.red` search hits by title fidelity, artist/album match,
  /// version match, and duration proximity.
  @visibleForTesting
  static List<Map<String, dynamic>> rankLrcRedHits(
    List<Map<String, dynamic>> hits, {
    required String title,
    required String rawTitle,
    required String primaryArtist,
    required String fullArtist,
    required String album,
    required int durationSeconds,
  }) {
    final scored = <({int score, Map<String, dynamic> hit})>[];

    for (final hit in hits.take(20)) {
      final isrc = (hit['isrc'] ?? '').toString().trim();
      if (isrc.isEmpty) continue;

      final hitTitle =
          (hit['title'] ?? hit['track'] ?? hit['name'] ?? '').toString().trim();
      final hitArtist =
          (hit['artist'] ?? hit['artistName'] ?? hit['author'] ?? '')
              .toString()
              .trim();
      final hitAlbum = (hit['album'] ?? '').toString().trim();
      final hitDurNum = hit['duration'] as num?;

      final score = _scoreMetadataCandidate(
        candTitle: hitTitle,
        candArtist: hitArtist,
        candAlbum: hitAlbum,
        candDuration: hitDurNum,
        targetTitle: title,
        targetRawTitle: rawTitle,
        primaryArtist: primaryArtist,
        fullArtist: fullArtist,
        targetAlbum: album,
        targetDurationSeconds: durationSeconds,
      );
      if (score != null) {
        scored.add((score: score, hit: hit));
      }
    }

    scored.sort((a, b) => b.score.compareTo(a.score));
    return scored.map((e) => e.hit).toList();
  }

  // ───────────────────────── Step 1: lrc.red Provider ───────────────────────

  Future<LyricsResult?> _fetchLrcRedFast(
    String title,
    String rawTitle,
    String primaryArtist,
    String fullArtist,
    String lang,
    String album,
    int durationSeconds,
  ) async {
    Future<List<Map<String, dynamic>>> queryLrcRed(String q, Duration timeout) async {
      final uri = Uri.parse(
        'https://lrc.red/search.json?q=${Uri.encodeComponent(q)}',
      );
      final res = await _client
          .get(uri, headers: {'User-Agent': 'ZenifyApp/1.0 (https://zenify.app)'})
          .timeout(timeout);
      if (res.statusCode != 200) return const [];
      return ((jsonDecode(utf8.decode(res.bodyBytes))
                  as Map<String, dynamic>)['hits']
              as List?)
          ?.cast<Map<String, dynamic>>() ??
          const [];
    }

    try {
      final query = primaryArtist.isNotEmpty
          ? '$title $primaryArtist'.trim()
          : title.trim();

      var rawHits = await queryLrcRed(query, const Duration(milliseconds: 3500));
      var ranked = rankLrcRedHits(
        rawHits,
        title: title,
        rawTitle: rawTitle,
        primaryArtist: primaryArtist,
        fullArtist: fullArtist,
        album: album,
        durationSeconds: durationSeconds,
      );

      // Fallback title-only or secondary-artist query when primary query yields no valid hits
      if (ranked.isEmpty && primaryArtist.isNotEmpty) {
        final altArtists = splitArtists(fullArtist)
            .where((a) => a.toLowerCase() != primaryArtist.toLowerCase())
            .toList();
        final altQuery = altArtists.isNotEmpty
            ? '$title ${altArtists.first}'.trim()
            : title;
        rawHits = await queryLrcRed(altQuery, const Duration(milliseconds: 3000));
        ranked = rankLrcRedHits(
          rawHits,
          title: title,
          rawTitle: rawTitle,
          primaryArtist: primaryArtist,
          fullArtist: fullArtist,
          album: album,
          durationSeconds: durationSeconds,
        );
        if (ranked.isEmpty && altArtists.isNotEmpty) {
          rawHits = await queryLrcRed(title, const Duration(milliseconds: 3000));
          ranked = rankLrcRedHits(
            rawHits,
            title: title,
            rawTitle: rawTitle,
            primaryArtist: primaryArtist,
            fullArtist: fullArtist,
            album: album,
            durationSeconds: durationSeconds,
          );
        }
      }

      if (ranked.isEmpty) return null;

      for (final hit in ranked.take(4)) {
        final isrc = (hit['isrc'] ?? '').toString().trim();
        final lrcUri = Uri.parse('https://lrc.red/s/$isrc.lrc');
        final lrcRes = await _client
            .get(
              lrcUri,
              headers: {'User-Agent': 'ZenifyApp/1.0 (https://zenify.app)'},
            )
            .timeout(const Duration(milliseconds: 3000));

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
    String rawTitle,
    String primaryArtist,
    String fullArtist,
    String lang,
    String album,
    int durationSeconds,
  ) async {
    String? stashedPlain;
    const headers = {'User-Agent': 'Zenify Mobile App v1.0 (https://zenify.app)'};

    Future<Map<String, dynamic>?> fetchDirect(String t, String a) async {
      if (a.isEmpty) return null;
      try {
        final uri = Uri.https('lrclib.net', '/api/get', {
          'track_name': t,
          'artist_name': a,
        });
        final res = await _client
            .get(uri, headers: headers)
            .timeout(const Duration(milliseconds: 3800));
        if (res.statusCode == 200) {
          return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
        }
      } catch (_) {}
      return null;
    }

    Future<List<Map<dynamic, dynamic>>?> fetchSearch(
      Map<String, String> params,
    ) async {
      try {
        final searchUri = Uri.https('lrclib.net', '/api/search', params);
        final res = await _client
            .get(searchUri, headers: headers)
            .timeout(const Duration(milliseconds: 4200));
        if (res.statusCode == 200) {
          final list = jsonDecode(utf8.decode(res.bodyBytes));
          if (list is List && list.isNotEmpty) {
            return list.cast<Map<dynamic, dynamic>>();
          }
        }
      } catch (_) {}
      return null;
    }

    // 1. Direct GET /api/get + targeted /api/search in parallel
    final directFuture = fetchDirect(title, primaryArtist);
    final searchFuture = fetchSearch(
      primaryArtist.isNotEmpty
          ? {'track_name': title, 'artist_name': primaryArtist}
          : {'q': title},
    );

    final results = await Future.wait([directFuture, searchFuture]);
    final directJson = results[0] as Map<String, dynamic>?;
    final searchList = results[1] as List<Map<dynamic, dynamic>>?;

    ({LyricsResult? synced, String? plain}) pickBestFromCandidates(
      List<Map<dynamic, dynamic>> list,
    ) {
      LyricsResult? bestSynced;
      int bestScore = -1;

      for (final item in list.take(30)) {
        final map = Map<String, dynamic>.from(item);
        final candTrack = (map['trackName'] ?? map['name'] ?? '').toString();
        final candArtist = (map['artistName'] ?? '').toString();
        final candAlbum = (map['albumName'] ?? '').toString();
        final candDur = map['duration'] as num?;

        final baseScore = _scoreMetadataCandidate(
          candTitle: candTrack,
          candArtist: candArtist,
          candAlbum: candAlbum,
          candDuration: candDur,
          targetTitle: title,
          targetRawTitle: rawTitle,
          primaryArtist: primaryArtist,
          fullArtist: fullArtist,
          targetAlbum: album,
          targetDurationSeconds: durationSeconds,
        );
        if (baseScore == null) continue;

        final plainLyrics = map['plainLyrics'] as String?;
        final syncedLyrics = map['syncedLyrics'] as String?;

        if (plainLyrics != null &&
            plainLyrics.trim().isNotEmpty &&
            stashedPlain == null &&
            (lang.isEmpty || isLanguageCompatible(plainLyrics, lang))) {
          stashedPlain = plainLyrics;
        }

        if (syncedLyrics != null && syncedLyrics.trim().isNotEmpty) {
          if (lang.isEmpty || isLanguageCompatible(syncedLyrics, lang)) {
            final parsed = LrcParser.parse(syncedLyrics);
            if (parsed.lines.isNotEmpty && parsed.synced) {
              var score = baseScore;
              if (parsed.lines.any(
                (l) => l['words'] != null && (l['words'] as List).isNotEmpty,
              )) {
                score += 20;
              }
              if (score > bestScore) {
                bestScore = score;
                bestSynced = LyricsResult(
                  lines: parsed.lines,
                  synced: true,
                  source: 'lrclib_search_synced',
                  rawLrc: syncedLyrics,
                );
              }
            }
          }
        }
      }
      return (synced: bestSynced, plain: stashedPlain);
    }

    // Score directJson + searchList together so exact duration beats arbitrary /api/get
    final combinedWave1 = <Map<dynamic, dynamic>>[
      ?directJson,
      ...?searchList,
    ];
    if (combinedWave1.isNotEmpty) {
      final res = pickBestFromCandidates(combinedWave1);
      if (res.synced != null) {
        final chosenSource = (directJson != null &&
                res.synced!.rawLrc == directJson['syncedLyrics'])
            ? 'lrclib_synced'
            : res.synced!.source;
        return (
          synced: LyricsResult(
            lines: res.synced!.lines,
            synced: true,
            source: chosenSource,
            rawLrc: res.synced!.rawLrc,
          ),
          plain: null,
        );
      }
    }

    // 2. Fallback parallel fan-out for:
    //    - secondary artists (when Track puts featured artist first)
    //    - core title segment before hyphen/colon (e.g. "10 000 Aura" from "10 000 Aura – Rap")
    //    - free-text search `q` (matches short/alternate artist spellings on LRCLIB)
    final altArtists = splitArtists(fullArtist)
        .where((a) => a.toLowerCase() != primaryArtist.toLowerCase())
        .toList();
    final coreSegment = title
        .split(RegExp(r'\s*[\-–—:]\s*'))
        .first
        .trim();
    final hasShorterCore = coreSegment.length >= 3 && coreSegment != title;

    final fallbackQueries = <Future<List<Map<dynamic, dynamic>>?>>[];
    if (primaryArtist.isNotEmpty) {
      fallbackQueries.add(fetchSearch({'q': '$title $primaryArtist'.trim()}));
    }
    if (altArtists.isNotEmpty) {
      fallbackQueries.add(
        fetchSearch({'track_name': title, 'artist_name': altArtists.first}),
      );
    }
    if (hasShorterCore && primaryArtist.isNotEmpty) {
      fallbackQueries.add(
        fetchSearch({'track_name': coreSegment, 'artist_name': primaryArtist}),
      );
    }
    if (title.trim().length >= 3) {
      fallbackQueries.add(fetchSearch({'track_name': title}));
    }

    if (fallbackQueries.isNotEmpty) {
      final wave2Lists = await Future.wait(fallbackQueries);
      final combinedWave2 = <Map<dynamic, dynamic>>[];
      for (final l in wave2Lists) {
        if (l != null) combinedWave2.addAll(l);
      }
      if (combinedWave2.isNotEmpty) {
        final picked = pickBestFromCandidates(combinedWave2);
        if (picked.synced != null) {
          return (synced: picked.synced, plain: null);
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
