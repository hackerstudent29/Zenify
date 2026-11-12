import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../design_system/widgets/zen_dropdown.dart';
import '../../../models/room_phase2_models.dart';
import '../../../models/room_models.dart';
import '../../../services/player_state.dart';
import '../../../services/together_service.dart';
import '../activity/activity_feed.dart';

String fmtPos(int ms) {
  final s = ms ~/ 1000;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Callbacks keep this widget independent from the player implementation.
/// [onRoomSeek]: moves EVERYONE (server checks PLAYBACK permission).
/// [onLocalReplay]: replays locally, detached from sync; user taps Rejoin Live afterwards.
class MomentActions {
  const MomentActions({required this.currentTitle, required this.currentPositionMs, required this.canSeekRoom, required this.onRoomSeek, required this.onLocalReplay});
  final String? currentTitle;
  final int Function() currentPositionMs;
  final bool canSeekRoom;
  final Future<bool> Function(int ms) onRoomSeek;
  final void Function(int ms) onLocalReplay;
}

/// Builds actions from live app state. Requires `PlayerState.seek(Duration)` (see FRONTEND_INTEGRATION.md).
MomentActions momentActionsFor(BuildContext context) {
  final t = context.read<TogetherService>();
  final p = context.read<PlayerState>();
  return MomentActions(
    currentTitle: t.currentTrack?.title ?? p.currentTrack?.title,
    currentPositionMs: () => p.livePosition.inMilliseconds,
    canSeekRoom: t.can(RoomPermission.playback),
    onRoomSeek: t.seekRoom,
    onLocalReplay: (ms) {
      if (!t.leaveSync) t.toggleLeaveSync(); // detach so others are unaffected
      p.seek(Duration(milliseconds: ms));
    },
  );
}

Future<void> showBookmarksSheet(BuildContext context, MomentActions actions) => AppleSheet.show<void>(context, initial: 0.75, builder: (ctx, sc) => _BookmarksBody(scroll: sc, actions: actions));

class _BookmarksBody extends StatefulWidget {
  const _BookmarksBody({required this.scroll, required this.actions});
  final ScrollController scroll;
  final MomentActions actions;
  @override
  State<_BookmarksBody> createState() => _BookmarksBodyState();
}

class _BookmarksBodyState extends State<_BookmarksBody> {
  List<RoomBookmark>? _items;
  bool _failed = false;
  bool _saving = false;
  final _comment = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final r = await context.read<TogetherService>().fetchBookmarks();
      if (mounted) setState(() => _items = r);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    final pos = widget.actions.currentPositionMs();
    final b = await context.read<TogetherService>().createBookmark(positionMs: pos, comment: _comment.text.trim().isEmpty ? null : _comment.text.trim());
    if (!mounted) return;
    setState(() => _saving = false);
    if (b == null) {
      HapticFeedback.heavyImpact();
      appleToast(context, 'Could not save bookmark.');
      return;
    }
    HapticFeedback.mediumImpact();
    _comment.clear();
    setState(() => _items = [b, ...?_items?.where((x) => x.id != b.id)]);
  }

  Future<void> _jump(RoomBookmark b) async {
    final a = widget.actions;
    if (a.currentTitle != b.trackTitle) {
      appleToast(context, 'That moment is from a different song.', icon: CupertinoIcons.music_note);
      return;
    }
    String? choice;
    await ZenDropdown.show<void>(
      context: context,
      title: b.trackTitle,
      subtitle: fmtPos(b.positionMs),
      items: [
        if (a.canSeekRoom)
          ZenDropdownItem(
            title: 'Jump for everyone',
            icon: CupertinoIcons.person_2,
            onTap: () => choice = 'room',
          ),
        ZenDropdownItem(
          title: 'Replay just for me',
          icon: CupertinoIcons.play_circle,
          onTap: () => choice = 'local',
        ),
      ],
    );
    if (choice == 'room') {
      final ok = await a.onRoomSeek(b.positionMs);
      if (!ok && mounted) appleToast(context, 'You cannot seek in this room.');
    } else if (choice == 'local') {
      a.onLocalReplay(b.positionMs);
      if (mounted) appleToast(context, 'Playing locally. Tap Rejoin Live to return.', icon: CupertinoIcons.arrow_2_circlepath);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return Column(children: [
      SheetHeader(title: 'Moments', onClose: () => Navigator.pop(context)),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: Row(children: [
          Expanded(
            child: CupertinoTextField(
              controller: _comment,
              placeholder: 'Add a note (optional)',
              placeholderStyle: AT.callout.copyWith(color: AT.label3),
              style: AT.callout,
              maxLength: 140,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
              decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rPill)),
            ),
          ),
          const SizedBox(width: 10),
          PillButton(label: 'Bookmark', icon: CupertinoIcons.bookmark_fill, compact: true, loading: _saving, onTap: widget.actions.currentTitle == null ? null : _save),
        ]),
      ),
      Expanded(
        child: _failed
            ? Center(child: PillButton(label: 'Retry', compact: true, style: PillStyle.glass, onTap: _load))
            : items == null
                ? const Center(child: CupertinoActivityIndicator())
                : items.isEmpty
                    ? const Center(child: Text('Bookmark a moment to revisit it together.', style: AT.subhead))
                    : ListView(controller: widget.scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
                        GroupedSection(children: [
                          for (final b in items)
                            AppleRow(
                              leading: const IconTile(CupertinoIcons.bookmark_fill, color: AT.amber, size: 30),
                              title: '${b.trackTitle} · ${fmtPos(b.positionMs)}',
                              subtitle: '${b.userName}${b.comment == null ? '' : ' · “${b.comment}”'}',
                              trailing: Text(relativeTime(b.createdMs), style: AT.caption),
                              onTap: () => _jump(b),
                            ),
                        ]),
                      ]),
      ),
    ]);
  }
}

// ═════════════════ Reaction timeline ═════════════════

Future<void> showReactionTimelineSheet(BuildContext context, MomentActions actions) => AppleSheet.show<void>(context, initial: 0.7, builder: (ctx, sc) => _TimelineBody(scroll: sc, actions: actions));

class _TimelineBody extends StatefulWidget {
  const _TimelineBody({required this.scroll, required this.actions});
  final ScrollController scroll;
  final MomentActions actions;
  @override
  State<_TimelineBody> createState() => _TimelineBodyState();
}

class _TimelineBodyState extends State<_TimelineBody> {
  List<TrackReactionStats>? _tracks;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final r = await context.read<TogetherService>().fetchReactionTimeline();
      if (mounted) setState(() => _tracks = r);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tracks = _tracks;
    TrackReactionStats? top;
    if (tracks != null && tracks.isNotEmpty) top = tracks.reduce((a, b) => a.total >= b.total ? a : b);
    return Column(children: [
      SheetHeader(title: 'Reactions', onClose: () => Navigator.pop(context)),
      Expanded(
        child: _failed
            ? Center(child: PillButton(label: 'Retry', compact: true, style: PillStyle.glass, onTap: _load))
            : tracks == null
                ? const Center(child: CupertinoActivityIndicator())
                : tracks.isEmpty
                    ? const Center(child: Text('No reactions yet.', style: AT.subhead))
                    : ListView(controller: widget.scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
                        if (top != null) GroupedSection(title: 'Most reacted', children: [AppleRow(leading: const IconTile(CupertinoIcons.flame_fill, color: AT.accent, size: 30), title: top.trackTitle, trailing: Text('${top.total}', style: AT.headline))]),
                        for (final t in tracks)
                          GroupedSection(title: t.trackTitle, children: [
                            for (final m in t.moments)
                              AppleRow(
                                title: m.emojis.take(8).join(' '),
                                subtitle: fmtPos(m.positionMs),
                                trailing: widget.actions.currentTitle == t.trackTitle ? const Icon(CupertinoIcons.play_circle, size: 20, color: AT.label2) : null,
                                onTap: widget.actions.currentTitle == t.trackTitle
                                    ? () async {
                                        String? choice;
                                        await ZenDropdown.show<void>(
                                          context: context,
                                          title: t.trackTitle,
                                          subtitle: fmtPos(m.positionMs),
                                          items: [
                                            if (widget.actions.canSeekRoom)
                                              ZenDropdownItem(
                                                title: 'Jump for everyone',
                                                icon: CupertinoIcons.person_2,
                                                onTap: () => choice = 'room',
                                              ),
                                            ZenDropdownItem(
                                              title: 'Replay just for me',
                                              icon: CupertinoIcons.play_circle,
                                              onTap: () => choice = 'local',
                                            ),
                                          ],
                                        );
                                        if (choice == 'room') await widget.actions.onRoomSeek(m.positionMs);
                                        if (choice == 'local') widget.actions.onLocalReplay(m.positionMs);
                                      }
                                    : null,
                              ),
                          ]),
                      ]),
      ),
    ]);
  }
}
