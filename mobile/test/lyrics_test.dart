import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/models/room_phase2_models.dart';
import 'package:mobile/views/room_together/lyrics/lyrics.dart';

void main() {
  group('LyricsParser.parseLrc', () {
    test('parses stamps, sorts, links end times, skips metadata', () {
      final lines = LyricsParser.parseLrc('[ar:Someone]\n[00:05.50]second\n[00:01.00]first\n[01:02.003]third');
      expect(lines.map((l) => l.text), ['first', 'second', 'third']);
      expect(lines[0].startMs, 1000);
      expect(lines[0].endMs, 5500);
      expect(lines[1].startMs, 5500);
      expect(lines[2].startMs, 62003);
      expect(lines[2].endMs, isNull);
    });
    test('multiple stamps on one line repeat the text', () {
      final lines = LyricsParser.parseLrc('[00:10.00][00:30.00]chorus');
      expect(lines.length, 2);
      expect(lines[1].startMs, 30000);
    });
    test('offset tag shifts times', () {
      final lines = LyricsParser.parseLrc('[offset:+500]\n[00:01.00]a');
      expect(lines.single.startMs, 1500);
    });
    test('word level tags', () {
      final lines = LyricsParser.parseLrc('[00:01.00]<00:01.00>Hello <00:01.50>world');
      expect(lines.single.text, 'Hello world');
      expect(lines.single.words.map((w) => w.text), ['Hello', 'world']);
      expect(lines.single.words[1].startMs, 1500);
    });
    test('garbage input does not throw', () {
      expect(LyricsParser.parseLrc('no stamps here\n\n'), isEmpty);
    });
  });

  group('parseStructured + merge', () {
    test('structured lines keep translation and sort', () {
      final l = LyricsParser.parseStructured([
        {'startMs': 2000, 'text': 'b', 'translation': 'B'},
        {'startMs': 1000, 'text': 'a'},
      ]);
      expect(l.first.text, 'a');
      expect(l.last.translation, 'B');
    });
    test('mergeTranslation matches nearest within 600ms only', () {
      final base = LyricsParser.parseLrc('[00:01.00]a\n[00:05.00]b');
      final tr = LyricsParser.parseLrc('[00:01.20]A\n[00:09.00]Z');
      final m = LyricsParser.mergeTranslation(base, tr);
      expect(m[0].translation, 'A');
      expect(m[1].translation, isNull);
    });
  });

  group('LyricsSyncController.indexFor', () {
    final lines = [for (final s in [1000, 3000, 6000, 9000]) LyricLine(startMs: s, text: '$s')];
    test('before first line', () => expect(LyricsSyncController.indexFor(lines, 500), -1));
    test('exact and between', () {
      expect(LyricsSyncController.indexFor(lines, 1000), 0);
      expect(LyricsSyncController.indexFor(lines, 5999), 1);
      expect(LyricsSyncController.indexFor(lines, 6000), 2);
      expect(LyricsSyncController.indexFor(lines, 999999), 3);
    });
    test('seek backwards ignores a stale hint', () {
      expect(LyricsSyncController.indexFor(lines, 1500, hint: 3), 0);
    });
    test('empty list', () => expect(LyricsSyncController.indexFor(const [], 10), -1));
    test('controller only notifies on index change', () {
      final c = LyricsSyncController()..setLines(lines);
      var n = 0;
      c.activeIndex.addListener(() => n++);
      c.update(1100);
      c.update(1200);
      c.update(3100);
      expect(n, 2);
      c.dispose();
    });
  });

  group('LyricsCache', () {
    test('evicts least recently used and keeps negative entries', () {
      final c = LyricsCache(capacity: 2);
      c.put('a', null);
      c.put('b', const LyricsData(lines: []));
      expect(c.has('a'), true);
      c.get('a'); // refresh a
      c.put('c', null);
      expect(c.has('b'), false);
      expect(c.has('a'), true);
    });
  });

  group('LyricsRepository', () {
    test('caches success and unavailable, not transient failure', () async {
      var calls = 0;
      final repo = LyricsRepository(({required title, required artist, required durationSec}) async {
        calls++;
        if (title == 'fail') return null;
        if (title == 'none') return {'available': false};
        return {'format': 'lrc', 'lrc': '[00:01.00]hi', 'provider': 'x'};
      });
      expect((await repo.load('ok', 'a', 100))?.lines.length, 1);
      await repo.load('ok', 'a', 100);
      expect(calls, 1);
      expect(await repo.load('none', 'a', 100), isNull);
      await repo.load('none', 'a', 100);
      expect(calls, 2);
      await repo.load('fail', 'a', 100);
      await repo.load('fail', 'a', 100);
      expect(calls, 4); // failures retried
    });
  });
}
