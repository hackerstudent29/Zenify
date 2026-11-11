import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';

Future<void> showRecommendationsSheet(BuildContext context) => AppleSheet.show<void>(context, initial: 0.85, builder: (ctx, sc) => _Body(scroll: sc));

class _Body extends StatefulWidget {
  const _Body({required this.scroll});
  final ScrollController scroll;
  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  RoomRecommendations? _data;
  bool _failed = false;
  final Set<String> _added = {};
  final Set<String> _hidden = {}; // disliked / skipped, removed locally right away

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    final r = await context.read<TogetherService>().fetchRecommendations(); // async on server, never blocks playback
    if (!mounted) return;
    setState(() {
      _data = r;
      _failed = r == null;
    });
  }

  Future<void> _add(RecItem it) async {
    if (!_added.add(it.id)) return;
    setState(() {});
    HapticFeedback.lightImpact();
    final ok = await context.read<TogetherService>().addRecommendation(it.id);
    if (!ok && mounted) {
      setState(() => _added.remove(it.id));
      appleToast(context, 'Could not add that song.');
    } else if (mounted) {
      context.read<TogetherService>().recommendationFeedback(it.id, 'LIKE');
    }
  }

  void _dismiss(RecItem it, String kind) {
    setState(() => _hidden.add(it.id));
    context.read<TogetherService>().recommendationFeedback(it.id, kind);
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Column(children: [
      SheetHeader(title: 'Discover', onClose: () => Navigator.pop(context)),
      Expanded(
        child: _failed
            ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('Could not load recommendations', style: AT.subhead),
                const SizedBox(height: 12),
                PillButton(label: 'Retry', compact: true, style: PillStyle.glass, onTap: _load),
              ]))
            : d == null
                ? const Center(child: CupertinoActivityIndicator())
                : ListView(controller: widget.scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
                    if (d.taste.isNotEmpty) _Taste(d.taste),
                    if (d.sections.every((s) => s.items.isEmpty)) const Padding(padding: EdgeInsets.all(40), child: Center(child: Text('Not enough listening data yet.', style: AT.subhead))),
                    for (final s in d.sections)
                      if (s.items.any((i) => !_hidden.contains(i.id)))
                        GroupedSection(title: s.title, children: [
                          for (final it in s.items.where((i) => !_hidden.contains(i.id)))
                            Dismissible(
                              key: ValueKey('rec-${it.id}'),
                              background: Container(color: AT.red.withValues(alpha: 0.8), alignment: Alignment.centerLeft, padding: const EdgeInsets.only(left: 20), child: const Icon(CupertinoIcons.hand_thumbsdown_fill, color: Colors.white)),
                              secondaryBackground: Container(color: AT.surfaceHi, alignment: Alignment.centerRight, padding: const EdgeInsets.only(right: 20), child: const Icon(CupertinoIcons.forward_end_fill, color: Colors.white)),
                              onDismissed: (dir) => _dismiss(it, dir == DismissDirection.startToEnd ? 'DISLIKE' : 'SKIP'),
                              child: AppleRow(
                                leading: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: SizedBox(width: 44, height: 44, child: it.coverUrl == null ? const ColoredBox(color: AT.surfaceHi) : Image.network(it.coverUrl!, fit: BoxFit.cover, cacheWidth: 132, errorBuilder: (_, _, _) => const ColoredBox(color: AT.surfaceHi))),
                                ),
                                title: it.title,
                                subtitle: it.reason == null ? it.artist : '${it.artist} · ${it.reason}',
                                trailing: _added.contains(it.id) ? const Icon(CupertinoIcons.checkmark_circle_fill, color: AT.green, size: 26) : CircleIconButton(icon: CupertinoIcons.plus, size: 32, iconSize: 15, onTap: () => _add(it)),
                              ),
                            ),
                        ]),
                  ]),
      ),
    ]);
  }
}

class _Taste extends StatelessWidget {
  const _Taste(this.taste);
  final List<(String, double)> taste;
  @override
  Widget build(BuildContext context) {
    const palette = [AT.accent, AT.blue, AT.green, AT.amber, AT.label3];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rLg)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('ROOM TASTE', style: AT.micro),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(AT.rPill),
            child: SizedBox(
              height: 12,
              child: Row(children: [for (var i = 0; i < taste.length; i++) Expanded(flex: (taste[i].$2 * 10).round().clamp(1, 1000), child: Container(margin: const EdgeInsets.only(right: 2), color: palette[i % palette.length]))]),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(spacing: 14, runSpacing: 6, children: [
            for (var i = 0; i < taste.length; i++)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 8, height: 8, decoration: BoxDecoration(color: palette[i % palette.length], shape: BoxShape.circle)),
                const SizedBox(width: 6),
                Text('${taste[i].$1} ${taste[i].$2.round()}%', style: AT.footnote),
              ]),
          ]),
          const SizedBox(height: 8),
          const Text('Based on members who share listening data.', style: AT.caption),
        ]),
      ),
    );
  }
}
