// NOTE: relative imports used because the app package name is unknown. Switch to package:<yourapp>/... if preferred.
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/models/room_models.dart';

void main() {
  group('RoomRole.parse', () {
    test('accepts legacy and wire values', () {
      expect(RoomRole.parse('host'), RoomRole.host);
      expect(RoomRole.parse('OWNER'), RoomRole.host);
      expect(RoomRole.parse('co-host'), RoomRole.coHost);
      expect(RoomRole.parse('CO_HOST'), RoomRole.coHost);
      expect(RoomRole.parse('dj'), RoomRole.dj);
      expect(RoomRole.parse('listener'), RoomRole.listener);
      expect(RoomRole.parse(null), RoomRole.member);
      expect(RoomRole.parse('weird'), RoomRole.member);
    });
    test('rank order', () {
      expect(RoomRole.host.rank > RoomRole.coHost.rank, true);
      expect(RoomRole.coHost.rank > RoomRole.dj.rank, true);
      expect(RoomRole.dj.rank > RoomRole.member.rank, true);
      expect(RoomRole.member.rank > RoomRole.listener.rank, true);
    });
  });

  group('RoomConfig', () {
    test('validate rejects empty name, bad size, short password, no joinable role', () {
      expect(RoomConfig(name: '').validate(), isNotNull);
      expect(RoomConfig(name: 'x' * 41).validate(), isNotNull);
      expect(RoomConfig(name: 'ok', maxParticipants: 1).validate(), isNotNull);
      expect(RoomConfig(name: 'ok', maxParticipants: 51).validate(), isNotNull);
      expect(RoomConfig(name: 'ok', password: 'abc').validate(), isNotNull);
      expect(RoomConfig(name: 'ok', enabledRoles: {RoomRole.host, RoomRole.dj}).validate(), isNotNull);
      expect(RoomConfig(name: 'ok', durationMinutes: 10).validate(), isNotNull);
      expect(RoomConfig(name: 'ok', durationMinutes: 721).validate(), isNotNull);
      expect(RoomConfig(name: 'ok', durationMinutes: null).validate(), isNull); // unlimited
      expect(RoomConfig(name: 'ok').validate(), isNull);
    });

    test('normalize snaps thresholds off disabled roles', () {
      final c = RoomConfig(name: 'r', enabledRoles: {RoomRole.host, RoomRole.member, RoomRole.listener});
      c.permissions[RoomPermission.playback] = RoomRole.dj; // DJ disabled
      c.normalize();
      expect(c.permissions[RoomPermission.playback], RoomRole.host); // coHost also disabled -> host
    });

    test('allows: listener cannot mutate, disabled roles denied, rank threshold honoured', () {
      final c = RoomConfig(name: 'r');
      expect(c.allows(RoomRole.listener, RoomPermission.queueEdit), false);
      expect(c.allows(RoomRole.member, RoomPermission.queueEdit), true);
      expect(c.allows(RoomRole.member, RoomPermission.queueManage), false);
      expect(c.allows(RoomRole.coHost, RoomPermission.queueManage), true);
      expect(c.allows(RoomRole.dj, RoomPermission.playback), true);
      expect(c.allows(RoomRole.member, RoomPermission.playback), false);
      final jam = RoomConfig(name: 'j', mode: 'collab');
      expect(jam.allows(RoomRole.member, RoomPermission.playback), true);
      c.enabledRoles.remove(RoomRole.dj);
      expect(c.allows(RoomRole.dj, RoomPermission.playback), false);
    });

    test('manageRoles thresholds limited to host / co-host', () {
      final c = RoomConfig(name: 'r');
      expect(c.thresholdOptions(RoomPermission.manageRoles), [RoomRole.host, RoomRole.coHost]);
    });

    test('json round trip keeps permissions and roles', () {
      final c = RoomConfig(name: 'Party', durationMinutes: 180, inviteMode: InviteMode.approval);
      c.permissions[RoomPermission.invite] = RoomRole.coHost;
      final j = c.toJson();
      expect(j.containsKey('password'), false);
      final back = RoomConfig.fromJson(j);
      expect(back.name, 'Party');
      expect(back.durationMinutes, 180);
      expect(back.inviteMode, InviteMode.approval);
      expect(back.permissions[RoomPermission.invite], RoomRole.coHost);
      expect(back.enabledRoles.length, 5);
    });
  });
}
