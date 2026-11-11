import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';

/// Merge consecutive events with same type + actor within [window] (e.g. 8 reactions → "×8").
/// Input must be chronological. Pure, unit-tested.
List<ActivityEvent> groupActivity(List<ActivityEvent> events, {Duration window = const Duration(seconds: 30)}) {
  final out = <ActivityEvent>[];
  for (final e in events) {
    if (out.isNotEmpty) {
      final last = out.last;
      final groupable = const {'REACTION_SENT', 'PRESENCE_UPDATED', 'MEMBER_JOINED', 'MEMBER_LEFT'}.contains(e.type);
      if (groupable && last.type == e.type && last.actorId == e.actorId && e.atMs - last.atMs <= window.inMilliseconds) {
        out[out.length - 1] = ActivityEvent(id: e.id, seq: e.seq, type: e.type, actorId: e.actorId, actorName: e.actorName, atMs: e.atMs, payload: e.payload, count: last.count + 1);
        continue;
      }
    }
    out.add(e);
  }
  return out;
}

String relativeTime(int ms, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).millisecondsSinceEpoch - ms;
  if (diff < 45000) return 'now';
  final m = diff ~/ 60000;
  if (m < 1) return '1m';
  if (m < 60) return '${m}m';
  final h = m ~/ 60;
  if (h < 24) return '${h}h';
  return '${h ~/ 24}d';
}

(IconData, Color, String) describeActivity(ActivityEvent e) {
  final who = e.actorName ?? 'Someone';
  final p = e.payload;
  final n = e.count > 1 ? ' ×${e.count}' : '';
  final title = (p['trackTitle'] as String?) ?? 'a song';
  switch (e.type) {
    case 'MEMBER_JOINED':
      return (CupertinoIcons.person_add_solid, AT.green, '$who joined$n');
    case 'MEMBER_LEFT':
      return (CupertinoIcons.person_badge_minus, AT.label3, '$who left$n');
    case 'QUEUE_ITEM_ADDED':
      return (CupertinoIcons.plus_circle_fill, AT.blue, '$who added $title');
    case 'QUEUE_ITEM_REMOVED':
      return (CupertinoIcons.minus_circle_fill, AT.red, '$who removed $title');
    case 'QUEUE_REORDERED':
      return (CupertinoIcons.arrow_up_arrow_down, AT.blue, '$who reordered the queue');
    case 'PLAYBACK_STARTED':
      return (CupertinoIcons.play_fill, AT.green, '$who started playback');
    case 'PLAYBACK_PAUSED':
      return (CupertinoIcons.pause_fill, AT.amber, '$who paused');
    case 'TRACK_SKIPPED':
      return (CupertinoIcons.forward_fill, AT.amber, '$who skipped $title');
    case 'HOST_TRANSFERRED':
      return (CupertinoIcons.star_fill, AT.amber, '${p['toName'] ?? 'Someone'} is now host');
    case 'MEMBER_ROLE_UPDATED':
      return (CupertinoIcons.person_2_fill, AT.accent, '${p['targetName'] ?? 'Someone'} is now ${p['roleLabel'] ?? 'updated'}');
    case 'MEMBER_REMOVED':
      return (CupertinoIcons.nosign, AT.red, '${p['targetName'] ?? 'Someone'} was removed');
    case 'REACTION_SENT':
      return (CupertinoIcons.heart_fill, AT.accent, '$who reacted ${p['emoji'] ?? ''}$n');
    case 'SONG_REQUESTED':
      return (CupertinoIcons.music_note_list, AT.blue, '$who requested $title');
    case 'SONG_REQUEST_REVIEWED':
      return (CupertinoIcons.checkmark_seal_fill, AT.green, '${p['status'] == 'APPROVED' ? 'Approved' : 'Rejected'} $title');
    case 'ROOM_THEME_UPDATED':
      return (CupertinoIcons.paintbrush_fill, AT.accent, '$who changed the theme');
    case 'BOOKMARK_CREATED':
      return (CupertinoIcons.bookmark_fill, AT.amber, '$who bookmarked ${p['position'] ?? ''}');
    case 'DJ_HANDOVER_COMPLETED':
      return (CupertinoIcons.arrow_right_arrow_left, AT.amber, 'DJ control passed to ${p['toName'] ?? 'someone'}');
    case 'ANNOUNCEMENT':
      return (CupertinoIcons.speaker_2_fill, AT.accent, '${p['text'] ?? ''}');
    default:
      return (CupertinoIcons.info, AT.label3, e.type.replaceAll('_', ' ').toLowerCase());
  }
}

Future<void> showActivitySheet(BuildContext context) => AppleSheet.show<void>(context, initial: 0.75, builder: (ctx, sc) => _ActivityBody(scroll: sc));

class _ActivityBody extends StatefulWidget {
  const _ActivityBody({required this.scroll});
  final ScrollController scroll;
  @override
  State<_ActivityBody> createState() => _ActivityBodyState();
}

class _ActivityBodyState extends State<_ActivityBody> {
  final List<ActivityEvent> _older = [];
  bool _loading = false;
  bool _done = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    widget.scroll.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadMore());
  }

  @override
  void dispose() {
    widget.scroll.removeListener(_onScroll);
    super.dispose();
  }

  void _onScroll() {
    if (widget.scroll.hasClients && widget.scroll.position.extentAfter < 300) _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || _done) return;
    final t = context.read<TogetherService>();
    final all = [..._older, ...t.activity];
    final before = all.isEmpty ? null : all.map((e) => e.seq).reduce((a, b) => a < b ? a : b);
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final page = await t.fetchActivity(beforeSeq: before);
      if (!mounted) return;
      final known = all.map((e) => e.id).toSet();
      final fresh = page.where((e) => !known.contains(e.id)).toList();
      setState(() {
        _older.addAll(fresh);
        if (page.length < 40) _done = true;
      });
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final merged = <String, ActivityEvent>{for (final e in [..._older, ...t.activity]) e.id: e}.values.toList()..sort((a, b) => a.seq != b.seq ? a.seq.compareTo(b.seq) : a.atMs.compareTo(b.atMs));
    final grouped = groupActivity(merged).reversed.toList(); // newest first

    return Column(children: [
      SheetHeader(title: 'Activity', onClose: () => Navigator.pop(context)),
      Expanded(
        child: grouped.isEmpty && !_loading
            ? const Center(child: Text('Nothing yet', style: AT.subhead))
            : ListView.builder(
                controller: widget.scroll,
                padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24),
                itemCount: grouped.length + 1,
                itemBuilder: (ctx, i) {
                  if (i == grouped.length) {
                    return Padding(
                      padding: const EdgeInsets.all(20),
                      child: Center(
                        child: _loading
                            ? const CupertinoActivityIndicator()
                            : _failed
                                ? PillButton(label: 'Retry', compact: true, style: PillStyle.glass, onTap: _loadMore)
                                : const SizedBox.shrink(),
                      ),
                    );
                  }
                  final e = grouped[i];
                  final (icon, color, text) = describeActivity(e);
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: Row(children: [
                      Container(width: 32, height: 32, decoration: BoxDecoration(color: color.withValues(alpha: 0.18), shape: BoxShape.circle), child: Icon(icon, size: 15, color: color)),
                      const SizedBox(width: 12),
                      Expanded(child: Text(text, style: AT.callout.copyWith(fontSize: 15), maxLines: 2, overflow: TextOverflow.ellipsis)),
                      const SizedBox(width: 8),
                      Text(relativeTime(e.atMs), style: AT.caption),
                    ]),
                  );
                },
              ),
      ),
    ]);
  }
}
