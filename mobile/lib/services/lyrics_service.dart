import 'dart:async';
import 'dart:convert';
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
        // Strip timestamps to obtain pure lyric line text
        var text = line.replaceAll(_tagRegex, '').trim();

        // Extract word-level timestamps if present
        List<Map<String, dynamic>>? words;
        if (_wordTagRegex.hasMatch(text)) {
          words = _parseWordLevel(text);
          text = text.replaceAll(_wordTagRegex, '').trim();
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
        final endMs = nextStart > cur.startMs ? nextStart : (cur.startMs + 3500);

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
          int endMs = startMs + 300;
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

          words.add({
            'text': wordText,
            'timeMs': startMs,
            'startMs': startMs,
            'endMs': endMs,
          });
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
/// Ensures zero-failure lyrics by querying across 3 resilient tiers:
/// 1. Zenify Cloud Backend (Cached Word-Synced Lyrics)
/// 2. Direct LRCLIB API (Pristine open community-synced & plain lyrics)
/// 3. Direct YouTube Music InnerTube Lyrics (Official catalog metadata)
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

  /// Fetches lyrics using the complete multi-stage pipeline.
  Future<LyricsResult?> fetchLyrics(Track track) async {
    final cacheKey = track.id;
    if (_memCache.containsKey(cacheKey)) {
      return _memCache[cacheKey];
    }

    // Check SharedPreferences offline cache
    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedStr = prefs.getString('lyrics_cache_$cacheKey');
      if (cachedStr != null) {
        final json = jsonDecode(cachedStr) as Map<String, dynamic>;
        final lines = (json['lines'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        if (lines.isNotEmpty) {
          final result = LyricsResult(
            lines: lines,
            synced: json['synced'] == true,
            source: json['source'] ?? 'offline_cache',
          );
          _memCache[cacheKey] = result;
          return result;
        }
      }
    } catch (_) {}

    final cleanT = cleanTitle(track.title);
    final cleanA = cleanArtist(track.artist);

    // ──────────────────────── Stage 1: YouTube Music InnerTube (Direct on-device) ─────────────────
    try {
      final videoId = track.id.startsWith('yt-') ? track.id.substring(3) : track.id;
      final ytLyrics = await InnerTubeService.instance.getLyrics(videoId);
      if (ytLyrics != null && ytLyrics.trim().isNotEmpty) {
        final parsed = LrcParser.parse(ytLyrics);
        if (parsed.lines.isNotEmpty) {
          return _saveAndReturn(cacheKey, parsed.lines, parsed.synced, 'innertube_official');
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsService] Stage 1 (InnerTube) failed: $e');
    }

    // ──────────────────────── Stage 2: Direct LRCLIB API (Direct on-device) ───────────────────────
    try {
      final lrclibResult = await _fetchLrclib(cleanT, cleanA, track.album, track.durationSeconds);
      if (lrclibResult != null && lrclibResult.isNotEmpty) {
        return _saveAndReturn(cacheKey, lrclibResult.lines, lrclibResult.synced, 'lrclib', rawLrc: lrclibResult.rawLrc);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsService] Stage 2 (LRCLIB) failed: $e');
    }

    // ──────────────────────── Stage 3: Zenify Backend (Fallback) ───────────────────
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
            final synced = lines.any((l) => l['timeMs'] is num && (l['timeMs'] as num) > 0);
            return _saveAndReturn(cacheKey, lines, synced, 'zenify_backend');
          }
        }

        // Check if raw LRC string exists
        final rawLrc = res['rawLrc'] ?? res['syncedLyrics'] ?? res['lyrics'];
        if (rawLrc is String && rawLrc.trim().isNotEmpty) {
          final parsed = LrcParser.parse(rawLrc);
          if (parsed.lines.isNotEmpty) {
            return _saveAndReturn(cacheKey, parsed.lines, parsed.synced, 'zenify_backend_lrc', rawLrc: rawLrc);
          }
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[LyricsService] Stage 3 (Backend) failed: $e');
    }

    return null;
  }

  // ───────────────────────── Helper: LRCLIB ─────────────────────────────────

  Future<LyricsResult?> _fetchLrclib(String title, String artist, String album, int durationSeconds) async {
    // 1. Direct match with GET
    try {
      final uri = Uri.https('lrclib.net', '/api/get', {
        'track_name': title,
        'artist_name': artist,
        if (album.isNotEmpty && album != 'Single') 'album_name': album,
        if (durationSeconds > 0 && durationSeconds != 210) 'duration': durationSeconds.toString(),
      });

      final res = await _client.get(uri, headers: {
        'User-Agent': 'Zenify Mobile App v1.0 (https://github.com/zenify)',
      }).timeout(const Duration(seconds: 5));

      if (res.statusCode == 200) {
        final json = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
        final syncedLyrics = json['syncedLyrics'] as String?;
        final plainLyrics = json['plainLyrics'] as String?;

        if (syncedLyrics != null && syncedLyrics.trim().isNotEmpty) {
          final parsed = LrcParser.parse(syncedLyrics);
          if (parsed.lines.isNotEmpty) {
            return LyricsResult(lines: parsed.lines, synced: true, source: 'lrclib_synced', rawLrc: syncedLyrics);
          }
        }
        if (plainLyrics != null && plainLyrics.trim().isNotEmpty) {
          final parsed = LrcParser.parse(plainLyrics);
          if (parsed.lines.isNotEmpty) {
            return LyricsResult(lines: parsed.lines, synced: false, source: 'lrclib_plain');
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
        'User-Agent': 'Zenify Mobile App v1.0 (https://github.com/zenify)',
      }).timeout(const Duration(seconds: 5));

      if (searchRes.statusCode == 200) {
        final list = jsonDecode(utf8.decode(searchRes.bodyBytes));
        if (list is List && list.isNotEmpty) {
          // Look for synced item first
          Map<String, dynamic>? best;
          for (final item in list) {
            if (item is Map) {
              if (item['syncedLyrics'] != null && (item['syncedLyrics'] as String).trim().isNotEmpty) {
                best = Map<String, dynamic>.from(item);
                break;
              }
            }
          }
          best ??= Map<String, dynamic>.from(list.first as Map);

          final syncedLyrics = best['syncedLyrics'] as String?;
          final plainLyrics = best['plainLyrics'] as String?;

          if (syncedLyrics != null && syncedLyrics.trim().isNotEmpty) {
            final parsed = LrcParser.parse(syncedLyrics);
            if (parsed.lines.isNotEmpty) {
              return LyricsResult(lines: parsed.lines, synced: true, source: 'lrclib_search_synced', rawLrc: syncedLyrics);
            }
          }
          if (plainLyrics != null && plainLyrics.trim().isNotEmpty) {
            final parsed = LrcParser.parse(plainLyrics);
            if (parsed.lines.isNotEmpty) {
              return LyricsResult(lines: parsed.lines, synced: false, source: 'lrclib_search_plain');
            }
          }
        }
      }
    } catch (_) {}

    return null;
  }

  LyricsResult _saveAndReturn(
    String cacheKey,
    List<Map<String, dynamic>> lines,
    bool synced,
    String source, {
    String? rawLrc,
  }) {
    final result = LyricsResult(lines: lines, synced: synced, source: source, rawLrc: rawLrc);
    _memCache[cacheKey] = result;

    // Cache persistently
    SharedPreferences.getInstance().then((prefs) {
      prefs.setString(
        'lyrics_cache_$cacheKey',
        jsonEncode({
          'lines': lines,
          'synced': synced,
          'source': source,
          'rawLrc': rawLrc,
        }),
      );
    }).catchError((_) {});

    return result;
  }
}

