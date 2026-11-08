import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/track.dart';
import 'api_service.dart';
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
  static final RegExp _tagRegex = RegExp(r'\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]');
  static final RegExp _wordTagRegex = RegExp(r'<(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?>');

  /// Parses an LRC string or plain text into a normalized list of timed line maps.
  static ({List<Map<String, dynamic>> lines, bool synced}) parse(String content) {
    final rawLines = content.split('\n');
    final timedList = <({int startMs, String text, List<Map<String, dynamic>>? words})>[];
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
          text = text.replaceAll(_wordTagRegex, '').replaceAll(RegExp(r'\s+'), ' ').trim();
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
        final nextStart = (i + 1 < timedList.length) ? timedList[i + 1].startMs : (cur.startMs + 3500);
        int endMs = nextStart > cur.startMs ? nextStart : (cur.startMs + 3500);

        // If word-level timing is present, align line end with the last word
        if (cur.words != null && cur.words!.isNotEmpty) {
          final lastWordEnd = cur.words!.last['endMs'];
          if (lastWordEnd is int && lastWordEnd > cur.startMs) {
            endMs = math.min(nextStart, math.max(lastWordEnd, cur.startMs + 500));
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
    final lines = plainList.map((text) => <String, dynamic>{
          'text': text,
          'timeMs': null,
          'startMs': null,
          'endMs': null,
        }).toList();

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
        final wordEnd = (i + 1 < matches.length) ? matches[i + 1].start : line.length;
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

          final subTokens = wordText.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
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
            final totalChars = subTokens.fold<int>(0, (sum, w) => sum + w.length);
            final dur = endMs - startMs;
            var curStart = startMs;
            for (final sub in subTokens) {
              final subDur = math.max(60, ((sub.length / math.max(1, totalChars)) * dur).round());
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

/// Robust Multi-Stage Lyrics Retrieval Engine.
///
/// Multi-tier pipeline strictly ordered:
/// 1. TIER 1 (PRIORITY #1): Word-by-Word (WBW) Synced Lyrics (lrc.red & Zenify Backend)
/// 2. TIER 2 (PRIORITY #2): Line-by-Line Synced Lyrics (lrc.red line, LRCLIB syncedLyrics, Backend line)
/// 3. TIER 3 (FALLBACK ONLY): Plain Lyrics (LRCLIB plain, YouTube Music InnerTube, Backend plain)
class LyricsService {
  LyricsService._();
  static final LyricsService instance = LyricsService._();

  final http.Client _client = http.Client();
  final Map<String, LyricsResult> _memCache = {};

  static String cleanTitle(String title) {
    return title
        .replaceAll(RegExp(r'\s*[\(\[\{].*?(official|video|audio|lyrics?|visualizer|remaster|hd|4k|feat|ft\.).*?[\)\]\}]', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*[\(\[\{]from\s+[^)\]}]+[\)\]\}]', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*\|\s*.*$'), '')
        .replaceAll(RegExp(r'\s*-\s*(official|video|audio|lyrics?).*$', caseSensitive: false), '')
        .trim();
  }

  static String cleanArtist(String artist) {
    return artist.split(RegExp(r'[,&/|]|\bfeat\.?\b|\bft\.?\b', caseSensitive: false)).first.trim();
  }

  /// Purges old unsynced (plain) lyrics from SharedPreferences disk cache.
  Future<void> purgeUnsyncedCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final keys = prefs.getKeys().where((k) => k.startsWith('lyrics_cache_')).toList();
      for (final k in keys) {
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
    } catch (_) {}
  }

  /// Fetches lyrics using the strict multi-tier hierarchy:
  /// Tier 1 (WBW) -> Tier 2 (Line-by-Line) -> Tier 3 (Plain Fallback).
  Future<LyricsResult?> fetchLyrics(Track track) async {
    final cacheKey = track.id;
    if (_memCache.containsKey(cacheKey)) {
      final mem = _memCache[cacheKey]!;
      // Return synced immediately from memory
      if (mem.synced) return mem;
    }

    // Check SharedPreferences offline cache (ONLY accept if synced)
    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedStr = prefs.getString('lyrics_cache_$cacheKey');
      if (cachedStr != null) {
        final json = jsonDecode(cachedStr) as Map<String, dynamic>;
        final lines = (json['lines'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        final isSynced = json['synced'] == true;
        if (lines.isNotEmpty && isSynced) {
          final result = LyricsResult(
            lines: lines,
            synced: true,
            source: json['source'] ?? 'offline_cache',
            rawLrc: json['rawLrc'] as String?,
          );
          _memCache[cacheKey] = result;
          return result;
        }
      }
    } catch (_) {}

    final cleanT = cleanTitle(track.title);
    final cleanA = cleanArtist(track.artist);

    // =========================================================================
    // TIER 1 (PRIORITY #1): WORD-BY-WORD (WBW) SYNCED LYRICS
    // =========================================================================

    // 1a. Query lrc.red for Word-by-Word Enhanced LRC
    LyricsResult? lrcRedLineCandidate;
    try {
      final lrcRed = await _fetchLrcRed(cleanT, cleanA);
      if (lrcRed.wbw != null && lrcRed.wbw!.isNotEmpty) {
        return _saveAndReturn(cacheKey, lrcRed.wbw!.lines, true, 'lrc_red_wbw', rawLrc: lrcRed.wbw!.rawLrc);
      }
      lrcRedLineCandidate = lrcRed.line;
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsService] Tier 1 (lrc.red) error: $e');
    }

    // 1b. Query Zenify Backend for Word-by-Word Synced Lyrics
    LyricsResult? backendCandidate;
    try {
      backendCandidate = await _fetchBackendLyrics(track, cleanT, cleanA);
      if (backendCandidate != null &&
          backendCandidate.synced &&
          backendCandidate.lines.any((l) => l['words'] != null && (l['words'] as List).isNotEmpty)) {
        return _saveAndReturn(cacheKey, backendCandidate.lines, true, backendCandidate.source, rawLrc: backendCandidate.rawLrc);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsService] Tier 1 (Backend) error: $e');
    }

    // =========================================================================
    // TIER 2 (PRIORITY #2): LINE-BY-LINE SYNCED LYRICS
    // =========================================================================

    // 2a. Use lrc.red line-synced result if found during Tier 1
    if (lrcRedLineCandidate != null && lrcRedLineCandidate.isNotEmpty && lrcRedLineCandidate.synced) {
      return _saveAndReturn(cacheKey, lrcRedLineCandidate.lines, true, 'lrc_red_line', rawLrc: lrcRedLineCandidate.rawLrc);
    }

    // 2b. Query LRCLIB STRICTLY for syncedLyrics (reject plain lyrics in this tier)
    try {
      final lrclibSynced = await _fetchLrclibSynced(cleanT, cleanA, track.album, track.durationSeconds);
      if (lrclibSynced != null && lrclibSynced.isNotEmpty && lrclibSynced.synced) {
        return _saveAndReturn(cacheKey, lrclibSynced.lines, true, 'lrclib_synced', rawLrc: lrclibSynced.rawLrc);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsService] Tier 2 (LRCLIB synced) error: $e');
    }

    // 2c. Use Zenify Backend line-synced lyrics if available
    if (backendCandidate != null && backendCandidate.isNotEmpty && backendCandidate.synced) {
      return _saveAndReturn(cacheKey, backendCandidate.lines, true, backendCandidate.source, rawLrc: backendCandidate.rawLrc);
    }

    // =========================================================================
    // TIER 3 (FALLBACK / LAST RESORT ONLY): PLAIN UNSYNCED LYRICS
    // =========================================================================

    // 3a. LRCLIB plainLyrics
    try {
      final lrclibPlain = await _fetchLrclibPlain(cleanT, cleanA, track.album, track.durationSeconds);
      if (lrclibPlain != null && lrclibPlain.isNotEmpty) {
        return _returnPlainMemoryOnly(cacheKey, lrclibPlain.lines, 'lrclib_plain');
      }
    } catch (_) {}

    // 3b. YouTube Music InnerTube Official Plain Lyrics
    try {
      final videoId = track.id.startsWith('yt-') ? track.id.substring(3) : track.id;
      final ytLyrics = await InnerTubeService.instance.getLyrics(videoId);
      if (ytLyrics != null && ytLyrics.trim().isNotEmpty) {
        final parsed = LrcParser.parse(ytLyrics);
        if (parsed.lines.isNotEmpty) {
          if (parsed.synced) {
            return _saveAndReturn(cacheKey, parsed.lines, true, 'innertube_official_synced');
          } else {
            return _returnPlainMemoryOnly(cacheKey, parsed.lines, 'innertube_official_plain');
          }
        }
      }
    } catch (_) {}

    // 3c. Zenify Backend plain lyrics
    if (backendCandidate != null && backendCandidate.isNotEmpty) {
      return _returnPlainMemoryOnly(cacheKey, backendCandidate.lines, backendCandidate.source);
    }

    return null;
  }

  // ───────────────────────── Tier 1: lrc.red Provider ───────────────────────

  Future<({LyricsResult? wbw, LyricsResult? line})> _fetchLrcRed(String title, String artist) async {
    try {
      final q = Uri.encodeComponent('$title $artist'.trim());
      final searchUri = Uri.parse('https://lrc.red/search.json?q=$q');
      final searchRes = await _client.get(searchUri, headers: {
        'User-Agent': 'ZenifyApp/1.0 (https://zenify.app)',
      }).timeout(const Duration(seconds: 4));

      if (searchRes.statusCode != 200) return (wbw: null, line: null);

      final searchJson = jsonDecode(utf8.decode(searchRes.bodyBytes)) as Map<String, dynamic>;
      final hits = (searchJson['hits'] as List?)?.cast<Map<String, dynamic>>() ?? [];
      if (hits.isEmpty) return (wbw: null, line: null);

      // Check top 3 hits for matching ISRC
      for (final hit in hits.take(3)) {
        final isrc = (hit['isrc'] ?? '').toString().trim();
        if (isrc.isEmpty) continue;

        final metaUri = Uri.parse('https://lrc.red/s/$isrc.json');
        final metaRes = await _client.get(metaUri, headers: {
          'User-Agent': 'ZenifyApp/1.0 (https://zenify.app)',
        }).timeout(const Duration(seconds: 3));

        if (metaRes.statusCode != 200) continue;
        final metaJson = jsonDecode(utf8.decode(metaRes.bodyBytes)) as Map<String, dynamic>;
        final syncType = (metaJson['sync'] ?? '').toString().toLowerCase();
        final lrcUrl = metaJson['files']?['lrc']?.toString();

        if (lrcUrl != null && lrcUrl.isNotEmpty) {
          final lrcRes = await _client.get(Uri.parse(lrcUrl), headers: {
            'User-Agent': 'ZenifyApp/1.0 (https://zenify.app)',
          }).timeout(const Duration(seconds: 4));

          if (lrcRes.statusCode == 200) {
            final lrcContent = utf8.decode(lrcRes.bodyBytes);
            final parsed = LrcParser.parse(lrcContent);
            if (parsed.lines.isNotEmpty && parsed.synced) {
              final hasWordTimings = parsed.lines.any((l) => l['words'] != null && (l['words'] as List).isNotEmpty);
              if (syncType == 'word' || hasWordTimings) {
                return (
                  wbw: LyricsResult(
                    lines: parsed.lines,
                    synced: true,
                    source: 'lrc_red_wbw',
                    rawLrc: lrcContent,
                  ),
                  line: null,
                );
              } else {
                return (
                  wbw: null,
                  line: LyricsResult(
                    lines: parsed.lines,
                    synced: true,
                    source: 'lrc_red_line',
                    rawLrc: lrcContent,
                  ),
                );
              }
            }
          }
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsService] lrc.red error: $e');
    }
    return (wbw: null, line: null);
  }

  // ───────────────────────── Backend Provider ───────────────────────────────

  Future<LyricsResult?> _fetchBackendLyrics(Track track, String cleanT, String cleanA) async {
    try {
      final queryParams = <String, String>{
        'title': cleanT,
        'artist': cleanA,
      };
      if (track.album.isNotEmpty && track.album != 'Single') {
        queryParams['album'] = track.album;
      }
      if (track.language.isNotEmpty) {
        queryParams['language'] = track.language;
      }
      if (track.durationSeconds > 0 && track.durationSeconds != 210) {
        queryParams['duration'] = track.durationSeconds.toString();
      }

      final res = await ApiService.fetchBackendLyrics(track.id, queryParams).timeout(const Duration(seconds: 4));
      if (res != null) {
        final raw = res['doc']?['lines'] ?? res['lines'];
        if (raw is List && raw.isNotEmpty) {
          final lines = <Map<String, dynamic>>[];
          for (final item in raw) {
            if (item is Map) {
              final m = Map<String, dynamic>.from(item);
              final text = (m['text'] ?? '').toString();
              if (text.trim().isEmpty) continue;

              final dynamic rawStart = m['startMs'] ?? m['timeMs'] ?? m['time'];
              final int? start = rawStart is num
                  ? (rawStart < 1000 && m['startMs'] == null && m['timeMs'] == null
                      ? (rawStart * 1000).round()
                      : rawStart.round())
                  : null;

              final dynamic rawEnd = m['endMs'] ?? m['endTime'];
              final int? end = rawEnd is num
                  ? (rawEnd < 1000 && m['endMs'] == null ? (rawEnd * 1000).round() : rawEnd.round())
                  : null;

              lines.add({
                'text': text,
                'timeMs': start,
                'startMs': start,
                'endMs': end,
                'words': m['words'],
              });
            }
          }
          if (lines.isNotEmpty) {
            final synced = lines.any((l) => (l['timeMs'] ?? l['startMs']) is num);
            final hasWbw = lines.any((l) => l['words'] != null && (l['words'] as List).isNotEmpty);
            return LyricsResult(
              lines: lines,
              synced: synced,
              source: hasWbw ? 'zenify_backend_wbw' : 'zenify_backend',
            );
          }
        }

        // Check if raw LRC string exists
        final rawLrc = res['rawLrc'] ?? res['syncedLyrics'] ?? res['lyrics'];
        if (rawLrc is String && rawLrc.trim().isNotEmpty) {
          final parsed = LrcParser.parse(rawLrc);
          if (parsed.lines.isNotEmpty) {
            final hasWbw = parsed.lines.any((l) => l['words'] != null && (l['words'] as List).isNotEmpty);
            return LyricsResult(
              lines: parsed.lines,
              synced: parsed.synced,
              source: hasWbw ? 'zenify_backend_wbw_lrc' : 'zenify_backend_lrc',
              rawLrc: rawLrc,
            );
          }
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsService] Backend error: $e');
    }
    return null;
  }

  // ───────────────────────── Tier 2: LRCLIB Synced Provider ─────────────────

  Future<LyricsResult?> _fetchLrclibSynced(String title, String artist, String album, int durationSeconds) async {
    // 1. Direct match with GET /api/get
    try {
      final uri = Uri.https('lrclib.net', '/api/get', {
        'track_name': title,
        'artist_name': artist,
        if (album.isNotEmpty && album != 'Single') 'album_name': album,
        if (durationSeconds > 0 && durationSeconds != 210) 'duration': durationSeconds.toString(),
      });

      final res = await _client.get(uri, headers: {
        'User-Agent': 'Zenify Mobile App v1.0 (https://zenify.app)',
      }).timeout(const Duration(seconds: 4));

      if (res.statusCode == 200) {
        final json = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
        final syncedLyrics = json['syncedLyrics'] as String?;

        if (syncedLyrics != null && syncedLyrics.trim().isNotEmpty) {
          final parsed = LrcParser.parse(syncedLyrics);
          if (parsed.lines.isNotEmpty && parsed.synced) {
            return LyricsResult(lines: parsed.lines, synced: true, source: 'lrclib_synced', rawLrc: syncedLyrics);
          }
        }
      }
    } catch (_) {}

    // 2. Search fallback
    try {
      final searchUri = Uri.https('lrclib.net', '/api/search', {
        'q': '$title $artist'.trim(),
      });

      final searchRes = await _client.get(searchUri, headers: {
        'User-Agent': 'Zenify Mobile App v1.0 (https://zenify.app)',
      }).timeout(const Duration(seconds: 4));

      if (searchRes.statusCode == 200) {
        final list = jsonDecode(utf8.decode(searchRes.bodyBytes));
        if (list is List && list.isNotEmpty) {
          for (final item in list) {
            if (item is Map) {
              final syncedLyrics = item['syncedLyrics'] as String?;
              if (syncedLyrics != null && syncedLyrics.trim().isNotEmpty) {
                final parsed = LrcParser.parse(syncedLyrics);
                if (parsed.lines.isNotEmpty && parsed.synced) {
                  return LyricsResult(lines: parsed.lines, synced: true, source: 'lrclib_search_synced', rawLrc: syncedLyrics);
                }
              }
            }
          }
        }
      }
    } catch (_) {}

    return null;
  }

  // ───────────────────────── Tier 3: LRCLIB Plain Provider ──────────────────

  Future<LyricsResult?> _fetchLrclibPlain(String title, String artist, String album, int durationSeconds) async {
    try {
      final uri = Uri.https('lrclib.net', '/api/get', {
        'track_name': title,
        'artist_name': artist,
        if (album.isNotEmpty && album != 'Single') 'album_name': album,
        if (durationSeconds > 0 && durationSeconds != 210) 'duration': durationSeconds.toString(),
      });

      final res = await _client.get(uri, headers: {
        'User-Agent': 'Zenify Mobile App v1.0 (https://zenify.app)',
      }).timeout(const Duration(seconds: 4));

      if (res.statusCode == 200) {
        final json = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
        final plainLyrics = json['plainLyrics'] as String?;
        if (plainLyrics != null && plainLyrics.trim().isNotEmpty) {
          final parsed = LrcParser.parse(plainLyrics);
          if (parsed.lines.isNotEmpty) {
            return LyricsResult(lines: parsed.lines, synced: false, source: 'lrclib_plain');
          }
        }
      }
    } catch (_) {}

    try {
      final searchUri = Uri.https('lrclib.net', '/api/search', {
        'q': '$title $artist'.trim(),
      });

      final searchRes = await _client.get(searchUri, headers: {
        'User-Agent': 'Zenify Mobile App v1.0 (https://zenify.app)',
      }).timeout(const Duration(seconds: 4));

      if (searchRes.statusCode == 200) {
        final list = jsonDecode(utf8.decode(searchRes.bodyBytes));
        if (list is List && list.isNotEmpty) {
          for (final item in list) {
            if (item is Map) {
              final plainLyrics = item['plainLyrics'] as String?;
              if (plainLyrics != null && plainLyrics.trim().isNotEmpty) {
                final parsed = LrcParser.parse(plainLyrics);
                if (parsed.lines.isNotEmpty) {
                  return LyricsResult(lines: parsed.lines, synced: false, source: 'lrclib_search_plain');
                }
              }
            }
          }
        }
      }
    } catch (_) {}

    return null;
  }

  // ───────────────────────── Storage Helpers ────────────────────────────────

  LyricsResult _saveAndReturn(
    String cacheKey,
    List<Map<String, dynamic>> lines,
    bool synced,
    String source, {
    String? rawLrc,
  }) {
    final result = LyricsResult(lines: lines, synced: synced, source: source, rawLrc: rawLrc);
    _memCache[cacheKey] = result;

    // Cache persistently on disk only when synced
    if (synced) {
      SharedPreferences.getInstance().then((prefs) {
        prefs.setString(
          'lyrics_cache_$cacheKey',
          jsonEncode({
            'lines': lines,
            'synced': true,
            'source': source,
            'rawLrc': rawLrc,
          }),
        );
      }).catchError((_) {});
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
