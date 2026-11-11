import 'package:flutter/foundation.dart';

import '../../../models/room_phase2_models.dart';

// ═════════════════ Parser ═════════════════

/// Parses LRC (`[mm:ss.xx]text`, multiple stamps per line, optional `<mm:ss.xx>word` enhanced tags,
/// `[offset:±ms]`) and structured JSON lines. Pure functions, unit-tested.
abstract final class LyricsParser {
  static final _stamp = RegExp(r'\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]');
  static final _word = RegExp(r'<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>');
  static final _offset = RegExp(r'^\[offset:\s*([+-]?\d+)\]', caseSensitive: false);

  static int _ms(String m, String s, String? frac) {
    var f = 0;
    if (frac != null) {
      f = int.parse(frac.padRight(3, '0').substring(0, 3));
    }
    return int.parse(m) * 60000 + int.parse(s) * 1000 + f;
  }

  static List<LyricLine> parseLrc(String lrc) {
    final raw = <(int, String, List<LyricWord>)>[];
    var offset = 0;
    for (final line in lrc.split(RegExp(r'\r?\n'))) {
      final t = line.trim();
      if (t.isEmpty) continue;
      final off = _offset.firstMatch(t);
      if (off != null) {
        offset = int.parse(off.group(1)!);
        continue;
      }
      final stamps = _stamp.allMatches(t).toList();
      if (stamps.isEmpty) continue; // metadata tags like [ar:], [ti:]
      var text = t.substring(stamps.last.end).trim();
      final words = <LyricWord>[];
      final wm = _word.allMatches(text).toList();
      if (wm.isNotEmpty) {
        for (var i = 0; i < wm.length; i++) {
          final end = i + 1 < wm.length ? wm[i + 1].start : text.length;
          final w = text.substring(wm[i].end, end).trim();
          if (w.isNotEmpty) words.add(LyricWord(_ms(wm[i].group(1)!, wm[i].group(2)!, wm[i].group(3)), w));
        }
        text = text.replaceAll(_word, '').replaceAll(RegExp(r'\s+'), ' ').trim();
      }
      for (final s in stamps) {
        raw.add((_ms(s.group(1)!, s.group(2)!, s.group(3)) + offset, text, words));
      }
    }
    raw.sort((a, b) => a.$1.compareTo(b.$1));
    final out = <LyricLine>[];
    for (var i = 0; i < raw.length; i++) {
      final end = i + 1 < raw.length ? raw[i + 1].$1 : null;
      out.add(LyricLine(startMs: raw[i].$1.clamp(0, 1 << 30), endMs: end, text: raw[i].$2, words: raw[i].$3));
    }
    return out;
  }

  static List<LyricLine> parseStructured(List<dynamic> lines) {
    final out = <LyricLine>[];
    for (final l in lines) {
      final m = Map<String, dynamic>.from(l as Map);
      out.add(LyricLine(
        startMs: (m['startMs'] as num).toInt(),
        endMs: (m['endMs'] as num?)?.toInt(),
        text: (m['text'] as String?) ?? '',
        translation: m['translation'] as String?,
        romanization: m['romanization'] as String?,
        words: ((m['words'] as List?) ?? const []).map((w) => LyricWord((w['startMs'] as num).toInt(), w['text'] as String)).toList(),
      ));
    }
    out.sort((a, b) => a.startMs.compareTo(b.startMs));
    return out;
  }

  /// Merge translation lines (LRC) onto base lines by nearest timestamp (<= 600 ms).
  static List<LyricLine> mergeTranslation(List<LyricLine> base, List<LyricLine> tr) {
    if (tr.isEmpty) return base;
    return base.map((b) {
      LyricLine? best;
      var bd = 1 << 30;
      for (final t in tr) {
        final d = (t.startMs - b.startMs).abs();
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      return LyricLine(startMs: b.startMs, endMs: b.endMs, text: b.text, words: b.words, romanization: b.romanization, translation: best != null && bd <= 600 ? best.text : b.translation);
    }).toList();
  }
}

// ═════════════════ Cache (LRU, memory) ═════════════════

class LyricsCache {
  LyricsCache({this.capacity = 24});
  final int capacity;
  final _map = <String, LyricsData?>{}; // null value = known-unavailable
  bool has(String k) => _map.containsKey(k);
  LyricsData? get(String k) {
    if (!_map.containsKey(k)) return null;
    final v = _map.remove(k);
    _map[k] = v; // refresh LRU
    return v;
  }

  void put(String k, LyricsData? v) {
    _map.remove(k);
    _map[k] = v;
    while (_map.length > capacity) {
      _map.remove(_map.keys.first);
    }
  }
}

// ═════════════════ Repository ═════════════════

typedef LyricsFetcher = Future<Map<String, dynamic>?> Function({required String title, required String artist, required int durationSec});

/// Talks to the backend LyricsMetadataService (licensed provider). Never scrapes.
class LyricsRepository {
  LyricsRepository(this._fetch, {LyricsCache? cache}) : cache = cache ?? LyricsCache();
  final LyricsFetcher _fetch;
  final LyricsCache cache;
  final Map<String, Future<LyricsData?>> _inflight = {};

  static String key(String title, String artist) => '${title.toLowerCase()}|${artist.toLowerCase()}';

  Future<LyricsData?> load(String title, String artist, int durationSec) async {
    final k = key(title, artist);
    if (cache.has(k)) return cache.get(k);
    final inflight = _inflight[k];
    if (inflight != null) return inflight;
    final future = _doLoad(k, title, artist, durationSec);
    _inflight[k] = future;
    try {
      return await future;
    } finally {
      _inflight.remove(k);
    }
  }

  /// Fire and forget for next track.
  void preload(String title, String artist, int durationSec) {
    if (title.isEmpty) return;
    load(title, artist, durationSec);
  }

  Future<LyricsData?> _doLoad(String k, String title, String artist, int dur) async {
    final r = await _fetch(title: title, artist: artist, durationSec: dur);
    if (r == null) return null; // transient failure: do not cache
    LyricsData? data;
    try {
      if (r['available'] == false) {
        data = null;
      } else {
        var lines = r['format'] == 'structured' ? LyricsParser.parseStructured(r['lines'] as List) : LyricsParser.parseLrc((r['lrc'] as String?) ?? '');
        if (r['translationLrc'] is String) lines = LyricsParser.mergeTranslation(lines, LyricsParser.parseLrc(r['translationLrc'] as String));
        if (lines.isNotEmpty) {
          data = LyricsData(lines: lines, provider: r['provider'] as String?, hasTranslation: lines.any((l) => l.translation != null), hasRomanization: lines.any((l) => l.romanization != null));
        }
      }
    } catch (_) {
      data = null;
    }
    cache.put(k, data); // cache "unavailable" too (negative cache)
    return data;
  }
}

// ═════════════════ Sync controller ═════════════════

/// Active line comes from the authoritative playback position, never from its own timer.
/// Call [update] with the position each frame/tick; listeners only fire when the index changes.
class LyricsSyncController {
  LyricsSyncController();
  List<LyricLine> _lines = const [];
  final ValueNotifier<int> activeIndex = ValueNotifier(-1);
  final ValueNotifier<int> positionMs = ValueNotifier(0); // only word-level karaoke listens
  int _hint = 0;

  void setLines(List<LyricLine> lines) {
    _lines = lines;
    _hint = 0;
    activeIndex.value = -1;
  }

  /// Binary search with forward hint (cheap for steady playback, correct after seeks).
  static int indexFor(List<LyricLine> lines, int posMs, {int hint = 0}) {
    if (lines.isEmpty || posMs < lines.first.startMs) return -1;
    if (hint >= 0 && hint < lines.length) {
      final startsOk = lines[hint].startMs <= posMs;
      final nextOk = hint + 1 >= lines.length || lines[hint + 1].startMs > posMs;
      if (startsOk && nextOk) return hint;
    }
    var lo = 0, hi = lines.length - 1;
    while (lo < hi) {
      final mid = (lo + hi + 1) >> 1;
      if (lines[mid].startMs <= posMs) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  void update(int posMs) {
    positionMs.value = posMs;
    final i = indexFor(_lines, posMs, hint: _hint);
    _hint = i < 0 ? 0 : i;
    if (i != activeIndex.value) activeIndex.value = i;
  }

  List<LyricLine> get lines => _lines;
  void dispose() {
    activeIndex.dispose();
    positionMs.dispose();
  }
}
