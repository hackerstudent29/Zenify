import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';
import '../activity/activity_feed.dart';

Future<void> showRequestsSheet(BuildContext context) => AppleSheet.show<void>(context, initial: 0.75, builder: (ctx, sc) => _Body(scroll: sc));

class _Body extends StatefulWidget {
  const _Body({required this.scroll});
  final ScrollController scroll;
  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  int _tab = 0; // 0 pending · 1 approved · 2 rejected
  bool _loaded = false;
  bool _failed = false;
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    final ok = await context.read<TogetherService>().loadRequests();
    if (mounted) {
      setState(() {
        _loaded = true;
        _failed = !ok;
      });
    }
  }

  Future<void> _act(SongRequest r, Future<bool> Function() f, String fail) async {
    if (!_busy.add(r.id)) return;
    setState(() {});
    final ok = await f();
    _busy.remove(r.id);
    if (!mounted) return;
    setState(() {});
    if (ok) {
      HapticFeedback.mediumImpact();
    } else {
      HapticFeedback.heavyImpact();
      appleToast(context, fail);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final want = switch (_tab) {
      0 => {RequestStatus.pending},
      1 => {RequestStatus.approved},
      _ => {RequestStatus.rejected, RequestStatus.cancelled, RequestStatus.expired},
    };
    final list = t.requests.where((r) => want.contains(r.status)).toList();
    final canReview = t.canReviewRequests;

    return Column(children: [
      SheetHeader(title: 'Song Requests', onClose: () => Navigator.pop(context)),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: PillTabs(labels: const ['Pending', 'Approved', 'Declined'], index: _tab, badges: [t.pendingRequestCount, null, null], onChanged: (i) => setState(() => _tab = i)),
      ),
      Expanded(
        child: _failed
            ? Center(child: PillButton(label: 'Retry', compact: true, style: PillStyle.glass, onTap: _load))
            : !_loaded
                ? const Center(child: CupertinoActivityIndicator())
                : list.isEmpty
                    ? Center(child: Text(_tab == 0 ? 'No pending requests.' : 'Nothing here.', style: AT.subhead))
                    : ListView.builder(
                        controller: widget.scroll,
                        padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24),
                        itemCount: list.length,
                        itemBuilder: (ctx, i) {
                          final r = list[i];
                          final mine = r.userId == t.myUserId;
                          final busy = _busy.contains(r.id);
                          return Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                            child: Row(children: [
                              Container(
                                width: 52,
                                height: 52,
                                clipBehavior: Clip.antiAlias,
                                decoration: BoxDecoration(color: AT.surfaceHi, borderRadius: BorderRadius.circular(AT.rSm)),
                                child: r.coverUrl == null ? const Icon(CupertinoIcons.music_note, color: AT.label3) : Image.network(r.coverUrl!, fit: BoxFit.cover, cacheWidth: 156, errorBuilder: (_, _, _) => const SizedBox()),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(r.title, style: AT.body.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                                  Text('${r.artist} · ${mine ? 'you' : r.userName} · ${relativeTime(r.requestedMs)}', style: AT.footnote, maxLines: 1, overflow: TextOverflow.ellipsis),
                                ]),
                              ),
                              if (r.status == RequestStatus.pending && canReview) ...[
                                CircleIconButton(icon: CupertinoIcons.xmark, size: 34, iconSize: 15, color: AT.red, onTap: busy ? null : () => _act(r, () => t.reviewRequest(r.id, approve: false), 'Could not reject.')),
                                const SizedBox(width: 8),
                                CircleIconButton(icon: CupertinoIcons.checkmark_alt, size: 34, iconSize: 17, filled: true, color: AT.green, onTap: busy ? null : () => _act(r, () => t.reviewRequest(r.id, approve: true), 'Could not approve.')),
                              ] else if (r.status == RequestStatus.pending && mine)
                                PillButton(label: 'Cancel', compact: true, style: PillStyle.glass, onTap: busy ? null : () => _act(r, () => t.cancelRequest(r.id), 'Could not cancel.'))
                              else
                                _StatusPill(r.status),
                            ]),
                          );
                        },
                      ),
      ),
    ]);
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.s);
  final RequestStatus s;
  @override
  Widget build(BuildContext context) {
    final (label, c) = switch (s) {
      RequestStatus.approved => ('Approved', AT.green),
      RequestStatus.rejected => ('Declined', AT.red),
      RequestStatus.cancelled => ('Cancelled', AT.label3),
      RequestStatus.expired => ('Expired', AT.label3),
      RequestStatus.pending => ('Pending', AT.amber),
    };
    return Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: ShapeDecoration(color: c.withValues(alpha: 0.18), shape: const StadiumBorder()), child: Text(label, style: AT.micro.copyWith(color: c)));
  }
}
