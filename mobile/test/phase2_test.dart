import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/models/room_phase2_models.dart';
import 'package:mobile/services/room_deep_links.dart';
import 'package:mobile/views/room_together/activity/activity_feed.dart';
import 'package:mobile/views/room_together/theme/room_theme_ui.dart';

ActivityEvent ev(String id, String type, String actor, int at, {int seq = 0}) => ActivityEvent(id: id, seq: seq, type: type, actorId: actor, actorName: actor, atMs: at);

void main() {
  group('groupActivity', () {
    test('collapses repeated reactions by same actor inside window', () {
      final g = groupActivity([ev('1', 'REACTION_SENT', 'a', 0), ev('2', 'REACTION_SENT', 'a', 5000), ev('3', 'REACTION_SENT', 'a', 9000)]);
      expect(g.length, 1);
      expect(g.single.count, 3);
    });
    test('does not merge different actors, types or far apart events', () {
      expect(groupActivity([ev('1', 'REACTION_SENT', 'a', 0), ev('2', 'REACTION_SENT', 'b', 1000)]).length, 2);
      expect(groupActivity([ev('1', 'REACTION_SENT', 'a', 0), ev('2', 'QUEUE_ITEM_ADDED', 'a', 1000)]).length, 2);
      expect(groupActivity([ev('1', 'REACTION_SENT', 'a', 0), ev('2', 'REACTION_SENT', 'a', 120000)]).length, 2);
    });
    test('never merges non-groupable types', () {
      expect(groupActivity([ev('1', 'QUEUE_ITEM_ADDED', 'a', 0), ev('2', 'QUEUE_ITEM_ADDED', 'a', 100)]).length, 2);
    });
  });

  test('relativeTime', () {
    final now = DateTime.fromMillisecondsSinceEpoch(10 * 3600 * 1000);
    expect(relativeTime(now.millisecondsSinceEpoch - 1000, now: now), 'now');
    expect(relativeTime(now.millisecondsSinceEpoch - 5 * 60000, now: now), '5m');
    expect(relativeTime(now.millisecondsSinceEpoch - 3 * 3600000, now: now), '3h');
  });

  group('parseRoomLink', () {
    test('custom scheme', () {
      final l = parseRoomLink(Uri.parse('zenify://room/7k9abc'))!;
      expect(l.code, '7K9ABC');
      expect(l.token, isNull);
    });
    test('https app link with token', () {
      final l = parseRoomLink(Uri.parse('https://zenify.app/room/7K9ABC?t=abc123'))!;
      expect(l.code, '7K9ABC');
      expect(l.token, 'abc123');
    });
    test('rejects bad host, scheme, characters (I L O U), length', () {
      expect(parseRoomLink(Uri.parse('https://evil.com/room/7K9ABC')), isNull);
      expect(parseRoomLink(Uri.parse('http://zenify.app/room/7K9ABC')), isNull);
      expect(parseRoomLink(Uri.parse('zenify://room/7K9ABI')), isNull);
      expect(parseRoomLink(Uri.parse('zenify://room/7K9AB')), isNull);
      expect(parseRoomLink(Uri.parse('zenify://other/7K9ABC')), isNull);
    });
    test('oversized token dropped', () {
      expect(parseRoomLink(Uri.parse('zenify://room/7K9ABC?t=${'a' * 200}'))!.token, isNull);
    });
  });

  group('RoomTheme', () {
    test('accent parse falls back to preset on invalid hex', () {
      expect(const RoomTheme(accentHex: '#FF0000').accent, const Color(0xFFFF0000));
      expect(const RoomTheme(accentHex: 'red').accent, RoomThemePreset.midnight.accent);
    });
    test('json round trip', () {
      final t = const RoomTheme(presetId: 'ocean', useArtwork: false, accentHex: '#112233', animateBackground: false);
      final b = RoomTheme.fromJson(t.toJson());
      expect(b.presetId, 'ocean');
      expect(b.useArtwork, false);
      expect(b.accentHex, '#112233');
    });
    test('ensureContrast lightens dark accents on black', () {
      final c = ensureContrast(const Color(0xFF101030));
      expect(c.computeLuminance() > const Color(0xFF101030).computeLuminance(), true);
    });
  });

  group('DjSettings / models', () {
    test('defaults and json', () {
      final s = DjSettings.fromJson(null);
      expect(s.requestMode, RequestMode.anyone);
      expect(s.crossfade, false);
      expect(DjSettings.fromJson(s.toJson()).transitionSeconds, 4);
    });
    test('AchievementItem fraction clamps', () {
      final a = AchievementItem(id: 'x', title: 't', description: 'd', progress: 9, target: 5);
      expect(a.fraction, 1.0);
      expect(a.unlocked, false);
    });
    test('RequestStatus.parse default', () => expect(RequestStatus.parse('nope'), RequestStatus.pending));
  });
}
