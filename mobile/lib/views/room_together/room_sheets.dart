import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart';
import '../../design_system/apple/apple_tokens.dart';
import '../../models/room_models.dart';
import '../../services/together_service.dart';
import 'achievements/achievements_screen.dart';
import 'activity/activity_feed.dart';
import 'bookmarks/moments_sheet.dart';
import 'dj/dj_settings_sheet.dart';
import 'insights/room_insights_screen.dart';
import 'invite/invitation_sheet.dart';
import 'recommendations/recommendations_sheet.dart';
import 'requests/requests_sheet.dart';
import 'stats/room_stats_sheet.dart';
import 'theme/room_theme_ui.dart';
import 'room_config_sheet.dart';

Color roleColor(RoomRole r) => switch (r) {
      RoomRole.host => AT.amber,
      RoomRole.coHost => AT.accent,
      RoomRole.dj => AT.blue,
      _ => AT.label3,
    };

class RolePill extends StatelessWidget {
  const RolePill(this.role, {super.key});
  final RoomRole role;
  @override
  Widget build(BuildContext context) {
    final c = roleColor(role);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: ShapeDecoration(color: c.withValues(alpha: 0.18), shape: const StadiumBorder()),
      child: Text(role.label, style: AT.micro.copyWith(color: role == RoomRole.listener || role == RoomRole.member ? AT.label2 : c)),
    );
  }
}

// ═══════════════════════════ Member sheet ═══════════════════════════

Future<void> showMemberSheet(BuildContext context, TogetherMember m) {
  return AppleSheet.show<void>(context, initial: 0.55, builder: (ctx, scroll) => _MemberBody(member: m, scroll: scroll));
}

class _MemberBody extends StatelessWidget {
  const _MemberBody({required this.member, required this.scroll});
  final TogetherMember member;
  final ScrollController scroll;

  /// Roles caller may assign (cosmetic filter; server re-validates everything).
  List<RoomRole> _assignable(TogetherService t) {
    final cfg = t.roomConfig;
    final mine = t.myRole;
    return RoomRole.values.where((r) {
      if (r == RoomRole.host) return false;
      if (cfg != null && !cfg.enabledRoles.contains(r)) return false;
      return t.isHost || r.rank < mine.rank;
    }).toList()
      ..sort((a, b) => b.rank.compareTo(a.rank));
  }

  Future<bool> _confirm(BuildContext context, String title, String msg, String action) async {
    final r = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(title),
        content: Text(msg),
        actions: [
          CupertinoDialogAction(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          CupertinoDialogAction(isDestructiveAction: true, onPressed: () => Navigator.pop(ctx, true), child: Text(action)),
        ],
      ),
    );
    return r ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    // Re-read live member so role changes update in real time.
    final m = t.members.firstWhere((x) => x.userId == member.userId, orElse: () => member);
    final role = RoomRole.parse(m.role);
    final isMe = m.userId == t.myUserId;
    final canRoles = !isMe && role != RoomRole.host && t.can(RoomPermission.manageRoles);
    final canKick = !isMe && role != RoomRole.host && (t.isHost || (t.can(RoomPermission.moderateChat) && role.rank < t.myRole.rank));

    Future<void> run(Future<bool> Function() f, String fail) async {
      final ok = await f();
      if (!context.mounted) return;
      if (ok) {
        HapticFeedback.mediumImpact();
      } else {
        HapticFeedback.heavyImpact();
        appleToast(context, fail);
      }
    }

    return ListView(controller: scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
      const SizedBox(height: 16),
      Center(child: Avatar(name: m.username, size: 84, dot: m.lastPing > 0 ? AT.green : AT.label3)),
      const SizedBox(height: 12),
      Center(child: Text(isMe ? '${m.username} (You)' : m.username, style: AT.title2)),
      const SizedBox(height: 6),
      Center(child: RolePill(role)),
      const SizedBox(height: 20),
      GroupedSection(children: [
        AppleRow(title: 'Connection', trailing: Text(m.lastPing > 0 ? 'Online · ${m.lastPing} ms' : 'Offline', style: AT.subhead)),
        AppleRow(title: 'Role', trailing: Text(role.label, style: AT.subhead)),
      ]),
      if (canRoles || canKick)
        GroupedSection(title: 'Manage', children: [
          if (canRoles)
            AppleRow(
              leading: const IconTile(CupertinoIcons.arrow_up_arrow_down, size: 28),
              title: 'Change role',
              chevron: true,
              onTap: () async {
                final opts = _assignable(t);
                if (opts.isEmpty) {
                  appleToast(context, 'No other roles are enabled in this room.');
                  return;
                }
                final r = await appleActionSheet<RoomRole>(context, title: 'Role for ${m.username}', options: [for (final o in opts) (o == role ? '${o.label}  ✓' : o.label, o, destructive: false)]);
                if (r != null && r != role) await run(() => t.setMemberRole(m.userId, r), 'Could not change role.');
              },
            ),
          if (t.isHost && !isMe)
            AppleRow(
              leading: const IconTile(CupertinoIcons.star_fill, size: 28, color: AT.amber),
              title: 'Make host',
              subtitle: 'You become a co-host',
              chevron: true,
              onTap: () async {
                if (await _confirm(context, 'Transfer ownership?', '${m.username} becomes the host. You keep a co-host role.', 'Transfer')) {
                  await run(() => t.transferOwnership(m.userId), 'Could not transfer ownership.');
                  if (context.mounted) Navigator.pop(context);
                }
              },
            ),
          if (canKick)
            AppleRow(
              leading: const IconTile(CupertinoIcons.person_badge_minus, size: 28, color: AT.red),
              title: 'Remove from room',
              destructive: true,
              onTap: () async {
                if (await _confirm(context, 'Remove ${m.username}?', 'They can rejoin with the code unless you block them.', 'Remove')) {
                  await run(() => t.removeMember(m.userId), 'Could not remove member.');
                  if (context.mounted) Navigator.pop(context);
                }
              },
            ),
          if (canKick)
            AppleRow(
              leading: const IconTile(CupertinoIcons.nosign, size: 28, color: AT.red),
              title: 'Block',
              destructive: true,
              onTap: () async {
                if (await _confirm(context, 'Block ${m.username}?', 'They cannot rejoin this room.', 'Block')) {
                  await run(() => t.blockMember(m.userId), 'Could not block member.');
                  if (context.mounted) Navigator.pop(context);
                }
              },
            ),
        ]),
    ]);
  }
}

// ═══════════════════════════ Room menu ═══════════════════════════

Future<void> showRoomMenu(BuildContext context) {
  return AppleSheet.show<void>(context, initial: 0.78, builder: (ctx, scroll) => _MenuBody(scroll: scroll));
}

class _MenuBody extends StatelessWidget {
  const _MenuBody({required this.scroll});
  final ScrollController scroll;

  Future<void> _leave(BuildContext context, TogetherService t) async {
    final host = t.isHost;
    final ok = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Leave room?'),
        content: Text(host ? 'The room keeps playing for everyone else. Host will pass to the next eligible person.' : 'You will stop listening. The room continues without you.'),
        actions: [
          CupertinoDialogAction(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          CupertinoDialogAction(isDestructiveAction: true, onPressed: () => Navigator.pop(ctx, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok == true) {
      if (context.mounted) Navigator.pop(context);
      await t.leaveRoom();
    }
  }

  Future<void> _close(BuildContext context, TogetherService t) async {
    final ok = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Close room for everyone?'),
        content: const Text('The session ends now for all ${''}participants. This cannot be undone.'),
        actions: [
          CupertinoDialogAction(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          CupertinoDialogAction(isDestructiveAction: true, onPressed: () => Navigator.pop(ctx, true), child: const Text('Close Room')),
        ],
      ),
    );
    if (ok != true) return;
    final done = await t.closeRoom();
    if (!context.mounted) return;
    if (done) {
      HapticFeedback.heavyImpact();
      Navigator.pop(context);
    } else {
      appleToast(context, 'Could not close the room. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final cfg = t.roomConfig;
    final ends = t.roomEndsAt;

    return Column(children: [
      SheetHeader(title: cfg?.name.isNotEmpty == true ? cfg!.name : 'Room', onClose: () => Navigator.pop(context)),
      Expanded(
        child: ListView(controller: scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
          // Invite
          GroupedSection(title: 'Invite', children: [
            AppleRow(
              title: t.roomCode,
              subtitle: 'Room code',
              leading: const IconTile(CupertinoIcons.number, size: 30),
              trailing: const Icon(CupertinoIcons.doc_on_doc, size: 18, color: AT.label2),
              onTap: t.can(RoomPermission.invite)
                  ? () {
                      Clipboard.setData(ClipboardData(text: t.roomCode));
                      appleToast(context, 'Code copied', icon: CupertinoIcons.checkmark_circle_fill);
                    }
                  : null,
            ),
            AppleRow(
              leading: const IconTile(CupertinoIcons.qrcode, size: 30, color: AT.blue),
              title: 'QR, links & waiting room',
              trailing: t.joinRequests.isEmpty ? null : _Badge(t.joinRequests.length),
              chevron: true,
              onTap: () => showInvitationSheet(context),
            ),
            if (ends != null) AppleRow(leading: const IconTile(CupertinoIcons.timer, size: 30, color: AT.blue), title: 'Ends', trailing: Text(_endsLabel(ends), style: AT.subhead)),
          ]),

          GroupedSection(title: 'Listen', children: [
            AppleRow(leading: const IconTile(CupertinoIcons.bookmark_fill, size: 30, color: AT.amber), title: 'Moments', chevron: true, onTap: () => showBookmarksSheet(context, momentActionsFor(context))),
            AppleRow(leading: const IconTile(CupertinoIcons.heart_fill, size: 30), title: 'Reaction timeline', chevron: true, onTap: () => showReactionTimelineSheet(context, momentActionsFor(context))),
            AppleRow(leading: const IconTile(CupertinoIcons.music_note_list, size: 30, color: AT.blue), title: 'Song requests', trailing: t.pendingRequestCount == 0 ? null : _Badge(t.pendingRequestCount), chevron: true, onTap: () => showRequestsSheet(context)),
            AppleRow(leading: const IconTile(CupertinoIcons.sparkles, size: 30, color: AT.accent), title: 'Discover', chevron: true, onTap: () => showRecommendationsSheet(context)),
          ]),

          GroupedSection(title: 'Room', children: [
            AppleRow(leading: const IconTile(CupertinoIcons.list_bullet_indent, size: 30, color: AT.surfaceHi), title: 'Activity', chevron: true, onTap: () => showActivitySheet(context)),
            AppleRow(leading: const IconTile(CupertinoIcons.chart_pie_fill, size: 30, color: AT.blue), title: 'Room stats', chevron: true, onTap: () => showRoomStatsSheet(context)),
            AppleRow(leading: const IconTile(CupertinoIcons.paintbrush_fill, size: 30, color: AT.accent), title: 'Theme', chevron: true, onTap: () => showThemeSheet(context)),
            AppleRow(leading: const IconTile(CupertinoIcons.slider_horizontal_3, size: 30, color: AT.amber), title: 'DJ controls', chevron: true, onTap: () => showDjSettingsSheet(context)),
            if (cfg != null)
              AppleRow(
                leading: const IconTile(CupertinoIcons.lock_shield_fill, size: 30, color: AT.amber),
                title: t.isHost ? 'Permissions' : 'Roles & permissions',
                chevron: true,
                onTap: () => AppleSheet.show<void>(context, initial: 0.8, builder: (ctx, sc) => _PermissionsBody(scroll: sc)),
              ),
          ]),

          GroupedSection(title: 'You', children: [
            AppleRow(leading: const IconTile(CupertinoIcons.chart_bar_fill, size: 30, color: AT.blue), title: 'Room Together Insights', chevron: true, onTap: () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => const RoomInsightsScreen()))),
            AppleRow(leading: const IconTile(CupertinoIcons.rosette, size: 30, color: AT.amber), title: 'Achievements', chevron: true, onTap: () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => const AchievementsScreen()))),
            const _ActivityPrivacyRow(),
          ]),

          // Diagnostics (existing capability preserved)
          GroupedSection(title: 'Diagnostics', children: [
            AppleRow(title: 'Sync', trailing: Text(t.syncHealth.name, style: AT.subhead)),
            AppleRow(title: 'Latency', trailing: Text(t.pingMs > 0 ? '${t.pingMs} ms' : '—', style: AT.subhead)),
            AppleRow(title: 'Playback', trailing: Text(t.leaveSync ? 'Detached' : 'In sync', style: AT.subhead)),
            AppleRow(title: 'Your role', trailing: Text(t.myRole.label, style: AT.subhead)),
          ]),

          GroupedSection(title: 'Session', footer: t.isHost ? 'Leave keeps the room alive. Close ends it for everyone.' : null, children: [
            AppleRow(leading: const IconTile(CupertinoIcons.square_arrow_left, size: 30, color: AT.surfaceHi), title: 'Leave Room', onTap: () => _leave(context, t)),
            if (t.isHost) AppleRow(leading: const IconTile(CupertinoIcons.xmark_octagon_fill, size: 30, color: AT.red), title: 'Close Room', destructive: true, onTap: () => _close(context, t)),
          ]),
        ]),
      ),
    ]);
  }

  String _endsLabel(DateTime d) {
    final left = d.difference(DateTime.now());
    if (left.isNegative) return 'Ending…';
    if (left.inMinutes < 60) return 'in ${left.inMinutes} min';
    return 'in ${left.inHours} h ${left.inMinutes % 60} min';
  }
}

class _PermissionsBody extends StatefulWidget {
  const _PermissionsBody({required this.scroll});
  final ScrollController scroll;
  @override
  State<_PermissionsBody> createState() => _PermissionsBodyState();
}

class _PermissionsBodyState extends State<_PermissionsBody> {
  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final cfg = t.roomConfig;
    if (cfg == null) return const SizedBox.shrink();
    final editable = t.isHost;

    return Column(children: [
      SheetHeader(title: 'Permissions', onClose: () => Navigator.pop(context)),
      Expanded(
        child: ListView(controller: widget.scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
          GroupedSection(title: 'Roles in this room', children: [
            AppleRow(title: RoomRole.values.reversed.where(cfg.enabledRoles.contains).map((r) => r.label).join(' · ')),
          ]),
          PermissionEditor(
            config: cfg,
            readOnly: !editable,
            onChanged: () async {
              // Optimistic edit already applied to local copy; send patch, server echo is authoritative.
              final ok = await t.updateRoomConfig(cfg.toJson()..remove('password')..remove('name'));
              if (!ok && context.mounted) appleToast(context, 'Could not save permissions.');
            },
          ),
        ]),
      ),
    ]);
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.n);
  final int n;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: const ShapeDecoration(color: AT.accent, shape: StadiumBorder()), child: Text('$n', style: AT.micro.copyWith(color: Colors.white)));
}

/// Lets a member hide what they are listening to from others in the room (server enforces).
class _ActivityPrivacyRow extends StatefulWidget {
  const _ActivityPrivacyRow();
  @override
  State<_ActivityPrivacyRow> createState() => _ActivityPrivacyRowState();
}

class _ActivityPrivacyRowState extends State<_ActivityPrivacyRow> {
  bool _share = true;
  @override
  Widget build(BuildContext context) => AppleSwitchRow(
        leading: const IconTile(CupertinoIcons.eye_fill, size: 30, color: AT.green),
        title: 'Share my listening activity',
        subtitle: 'Others see your status and position',
        value: _share,
        onChanged: (v) async {
          setState(() => _share = v);
          final ok = await context.read<TogetherService>().setActivityVisibility(v);
          if (!ok && mounted) {
            setState(() => _share = !v);
            if (context.mounted) {
              appleToast(context, 'Could not update privacy.');
            }
          }
        },
      );
}
