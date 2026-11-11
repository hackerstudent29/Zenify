import 'package:flutter/cupertino.dart';

/// Wire values MUST match backend enum names (see BACKEND_AGENT_SPEC.md §4).
enum RoomRole {
  listener('LISTENER', 'Listener', 0),
  member('MEMBER', 'Member', 1),
  dj('DJ', 'DJ', 2),
  coHost('CO_HOST', 'Co-host', 3),
  host('OWNER', 'Host', 4);

  const RoomRole(this.wire, this.label, this.rank);
  final String wire;
  final String label;
  final int rank;

  static RoomRole parse(String? s) {
    switch ((s ?? '').toUpperCase().replaceAll('-', '_')) {
      case 'OWNER':
      case 'HOST':
        return RoomRole.host;
      case 'CO_HOST':
      case 'COHOST':
        return RoomRole.coHost;
      case 'DJ':
        return RoomRole.dj;
      case 'LISTENER':
        return RoomRole.listener;
      default:
        return RoomRole.member;
    }
  }
}

enum RoomPermission {
  playback('PLAYBACK', 'Control playback', 'Play, pause, seek, skip', CupertinoIcons.play_fill),
  queueEdit('QUEUE_EDIT', 'Add & remove songs', 'Add own songs, remove own songs', CupertinoIcons.plus_circle_fill),
  queueManage('QUEUE_MANAGE', 'Manage queue', 'Reorder, remove anyone\'s songs', CupertinoIcons.list_bullet),
  invite('INVITE', 'Invite people', 'Share code, create links', CupertinoIcons.person_add_solid),
  moderateChat('MODERATE_CHAT', 'Moderate chat', 'Delete messages, mute people', CupertinoIcons.chat_bubble_2_fill),
  manageRoles('MANAGE_ROLES', 'Promote & demote', 'Change roles of others', CupertinoIcons.person_2_fill);

  const RoomPermission(this.wire, this.label, this.subtitle, this.icon);
  final String wire;
  final String label;
  final String subtitle;
  final IconData icon;
}

enum SpeakPolicy {
  hostOnly('HOST_ONLY', 'Host only'),
  hostAndCoHosts('HOST_AND_CO_HOSTS', 'Host and co-hosts'),
  selected('SELECTED', 'Selected members'),
  everyone('EVERYONE', 'Everyone');

  const SpeakPolicy(this.wire, this.label);
  final String wire;
  final String label;
  static SpeakPolicy parse(String? s) => SpeakPolicy.values.firstWhere((e) => e.wire == s, orElse: () => SpeakPolicy.hostAndCoHosts);
}

enum InviteMode {
  open('OPEN', 'Code'),
  approval('APPROVAL', 'Approval'),
  inviteOnly('INVITE_ONLY', 'Invite only');

  const InviteMode(this.wire, this.label);
  final String wire;
  final String label;
  static InviteMode parse(String? s) => InviteMode.values.firstWhere((e) => e.wire == s, orElse: () => InviteMode.open);
}

/// Duration presets. `null` minutes = unlimited. `custom` = slider up to 12 h.
class DurationPreset {
  const DurationPreset(this.label, this.minutes, {this.custom = false});
  final String label;
  final int? minutes;
  final bool custom;
  static const all = <DurationPreset>[
    DurationPreset('30 min', 30),
    DurationPreset('1 hour', 60),
    DurationPreset('2 hours', 120),
    DurationPreset('3 hours', 180),
    DurationPreset('Up to 12 h', 720, custom: true),
    DurationPreset('Unlimited', null),
  ];
}

class RoomConfig {
  RoomConfig({
    this.name = '',
    this.coverPath,
    this.coverUrl,
    this.maxParticipants = 12,
    this.isPublic = false,
    this.password,
    this.inviteMode = InviteMode.open,
    this.durationMinutes = 120,
    Set<RoomRole>? enabledRoles,
    Map<RoomPermission, RoomRole>? permissions,
    this.speakPolicy = SpeakPolicy.hostAndCoHosts,
    this.mode = 'dj',
  })  : enabledRoles = enabledRoles ?? {RoomRole.host, RoomRole.coHost, RoomRole.dj, RoomRole.member, RoomRole.listener},
        permissions = permissions ?? defaultPermissions(mode);

  String name;
  String? coverPath; // local file, uploaded after creation
  String? coverUrl; // from server
  int maxParticipants;
  bool isPublic;
  String? password;
  InviteMode inviteMode;
  int? durationMinutes;
  Set<RoomRole> enabledRoles;

  /// Minimum role (by rank) allowed to use each permission.
  Map<RoomPermission, RoomRole> permissions;
  SpeakPolicy speakPolicy;
  String mode; // 'dj' | 'collab'

  static Map<RoomPermission, RoomRole> defaultPermissions(String mode) => {
        RoomPermission.playback: mode == 'collab' ? RoomRole.member : RoomRole.dj,
        RoomPermission.queueEdit: RoomRole.member,
        RoomPermission.queueManage: RoomRole.coHost,
        RoomPermission.invite: RoomRole.member,
        RoomPermission.moderateChat: RoomRole.coHost,
        RoomPermission.manageRoles: RoomRole.host,
      };

  /// Roles selectable as a permission threshold (enabled roles only).
  List<RoomRole> thresholdOptions(RoomPermission p) {
    final base = p == RoomPermission.manageRoles ? [RoomRole.host, RoomRole.coHost] : RoomRole.values.reversed.toList();
    return base.where((r) => r == RoomRole.host || enabledRoles.contains(r)).toList();
  }

  /// Client-side hint only. Backend is the only authority.
  bool allows(RoomRole role, RoomPermission p) {
    if (!enabledRoles.contains(role) && role != RoomRole.host) return false;
    if (role == RoomRole.listener && p != RoomPermission.invite) return false;
    final min = permissions[p] ?? RoomRole.host;
    return role.rank >= min.rank;
  }

  bool canSpeak(RoomRole role, {bool selected = false}) {
    switch (speakPolicy) {
      case SpeakPolicy.hostOnly:
        return role == RoomRole.host;
      case SpeakPolicy.hostAndCoHosts:
        return role.rank >= RoomRole.coHost.rank;
      case SpeakPolicy.selected:
        return role.rank >= RoomRole.coHost.rank || selected;
      case SpeakPolicy.everyone:
        return true;
    }
  }

  /// Snap thresholds pointing at disabled roles up to the next enabled role.
  void normalize() {
    enabledRoles.add(RoomRole.host);
    for (final p in RoomPermission.values) {
      var r = permissions[p] ?? RoomRole.host;
      while (!enabledRoles.contains(r) && r != RoomRole.host) {
        r = RoomRole.values.firstWhere((x) => x.rank == r.rank + 1);
      }
      permissions[p] = r;
    }
  }

  String? validate() {
    if (name.trim().isEmpty) return 'Give the room a name.';
    if (name.trim().length > 40) return 'Name is limited to 40 characters.';
    if (maxParticipants < 2 || maxParticipants > 50) return 'Participants must be 2–50.';
    if (password != null && password!.isNotEmpty && password!.length < 4) return 'Password needs 4+ characters.';
    if (!enabledRoles.contains(RoomRole.member) && !enabledRoles.contains(RoomRole.listener)) return 'Enable Member or Listener so people can join.';
    if (durationMinutes != null && (durationMinutes! < 30 || durationMinutes! > 720)) return 'Duration must be 30 min – 12 h, or unlimited.';
    return null;
  }

  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'mode': mode,
        'maxParticipants': maxParticipants,
        'visibility': isPublic ? 'PUBLIC' : 'PRIVATE',
        if (password != null && password!.isNotEmpty) 'password': password,
        'inviteMode': inviteMode.wire,
        'durationMinutes': durationMinutes, // null = unlimited
        'enabledRoles': enabledRoles.map((e) => e.wire).toList(),
        'permissions': {for (final e in permissions.entries) e.key.wire: e.value.wire},
        'speakPolicy': speakPolicy.wire,
      };

  factory RoomConfig.fromJson(Map<String, dynamic> j) {
    final perms = <RoomPermission, RoomRole>{};
    final raw = (j['permissions'] as Map?) ?? const {};
    for (final p in RoomPermission.values) {
      perms[p] = RoomRole.parse(raw[p.wire] as String?);
    }
    return RoomConfig(
      name: (j['name'] as String?) ?? '',
      coverUrl: j['coverUrl'] as String?,
      maxParticipants: (j['maxParticipants'] as num?)?.toInt() ?? 12,
      isPublic: j['visibility'] == 'PUBLIC',
      inviteMode: InviteMode.parse(j['inviteMode'] as String?),
      durationMinutes: (j['durationMinutes'] as num?)?.toInt(),
      enabledRoles: ((j['enabledRoles'] as List?) ?? const ['OWNER', 'CO_HOST', 'DJ', 'MEMBER', 'LISTENER']).map((e) => RoomRole.parse(e as String)).toSet(),
      permissions: perms,
      speakPolicy: SpeakPolicy.parse(j['speakPolicy'] as String?),
      mode: (j['mode'] as String?) ?? 'dj',
    );
  }
}
