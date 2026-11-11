import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';

/// Live/after-session room stats. Everything is server-aggregated and server-formatted.
Future<void> showRoomStatsSheet(BuildContext context) => AppleSheet.show<void>(context, initial: 0.75, builder: (ctx, sc) => _Body(scroll: sc));

class _Body extends StatefulWidget {
  const _Body({required this.scroll});
  final ScrollController scroll;
  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  RoomStats? _s;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    final r = await context.read<TogetherService>().fetchRoomStats();
    if (mounted) {
      setState(() {
        _s = r;
        _failed = r == null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    return Column(children: [
      SheetHeader(title: 'Room Stats', trailing: CircleIconButton(icon: CupertinoIcons.refresh, size: 32, iconSize: 14, onTap: _load), onClose: () => Navigator.pop(context)),
      Expanded(
        child: _failed
            ? Center(child: PillButton(label: 'Retry', compact: true, style: PillStyle.glass, onTap: _load))
            : s == null
                ? const Center(child: CupertinoActivityIndicator())
                : ListView(controller: widget.scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
                    GroupedSection(title: 'This room', children: [for (final e in s.values.entries) AppleRow(title: e.key, trailing: Text(e.value, style: AT.subhead))]),
                    if (s.awards.isNotEmpty)
                      GroupedSection(title: 'Standouts', children: [for (final a in s.awards) AppleRow(leading: const IconTile(CupertinoIcons.rosette, color: AT.amber, size: 28), title: a.$1, trailing: Text(a.$2, style: AT.subhead))]),
                  ]),
      ),
    ]);
  }
}
