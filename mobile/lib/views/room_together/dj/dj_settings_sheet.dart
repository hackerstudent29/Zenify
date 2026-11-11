import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_models.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';

Future<void> showDjSettingsSheet(BuildContext context) => AppleSheet.show<void>(context, initial: 0.85, builder: (ctx, sc) => _Body(scroll: sc));

class _Body extends StatefulWidget {
  const _Body({required this.scroll});
  final ScrollController scroll;
  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  late final DjSettings _s = DjSettings.fromJson(context.read<TogetherService>().djSettings.toJson());
  final _announce = TextEditingController();
  bool _saving = false;
  bool _announcing = false;

  @override
  void dispose() {
    _announce.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final ok = await context.read<TogetherService>().updateDjSettings(_s);
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      Navigator.pop(context);
    } else {
      appleToast(context, 'Could not save settings.');
    }
  }

  Future<void> _sendAnnouncement() async {
    final text = _announce.text.trim();
    if (text.isEmpty || _announcing) return;
    setState(() => _announcing = true);
    final ok = await context.read<TogetherService>().announce(text);
    if (!mounted) return;
    setState(() => _announcing = false);
    if (ok) {
      _announce.clear();
      appleToast(context, 'Announcement sent', icon: CupertinoIcons.speaker_2_fill);
    } else {
      appleToast(context, 'Could not send announcement.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final canEdit = t.isHost;
    final xfade = t.crossfadeSupported;
    return Column(children: [
      SheetHeader(title: 'DJ Controls', onClose: () => Navigator.pop(context)),
      Expanded(
        child: ListView(controller: widget.scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
          GroupedSection(
            title: 'Song requests',
            footer: switch (_s.requestMode) {
              RequestMode.anyone => 'Anyone allowed to add songs adds them straight to the queue.',
              RequestMode.approval => 'Songs wait in Requests until an authorised member approves.',
              RequestMode.auto => 'Requests are added automatically and logged.',
              RequestMode.limited => 'Each member can have ${_s.requestLimit} songs queued at a time.',
            },
            children: [
              AppleRow(
                title: 'Mode',
                trailing: Text(_s.requestMode.label, style: AT.subhead),
                chevron: canEdit,
                onTap: !canEdit
                    ? null
                    : () async {
                        final r = await appleActionSheet<RequestMode>(context, title: 'Song requests', options: [for (final m in RequestMode.values) (m.label, m, destructive: false)]);
                        if (r != null) setState(() => _s.requestMode = r);
                      },
              ),
              if (_s.requestMode == RequestMode.limited)
                AppleRow(
                  title: 'Per member',
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    CircleIconButton(icon: CupertinoIcons.minus, size: 30, iconSize: 13, onTap: canEdit && _s.requestLimit > 1 ? () => setState(() => _s.requestLimit--) : null),
                    SizedBox(width: 32, child: Center(child: Text('${_s.requestLimit}', style: AT.headline))),
                    CircleIconButton(icon: CupertinoIcons.plus, size: 30, iconSize: 13, onTap: canEdit && _s.requestLimit < 20 ? () => setState(() => _s.requestLimit++) : null),
                  ]),
                ),
              AppleSwitchRow(title: 'Lock queue', subtitle: 'Only staff can change it', value: _s.queueLocked, onChanged: canEdit ? (v) => setState(() => _s.queueLocked = v) : null),
            ],
          ),
          GroupedSection(
            title: 'Transitions',
            footer: xfade ? null : 'Crossfade needs overlapping audio sources. Your player build does not report support, so it is off. Gapless and preloading still apply.',
            children: [
              AppleSwitchRow(title: 'Gapless playback', value: _s.gapless, onChanged: canEdit ? (v) => setState(() => _s.gapless = v) : null),
              AppleSwitchRow(title: 'Preload next song', value: _s.preloadNext, onChanged: canEdit ? (v) => setState(() => _s.preloadNext = v) : null),
              AppleSwitchRow(title: 'Crossfade', value: _s.crossfade && xfade, onChanged: canEdit && xfade ? (v) => setState(() => _s.crossfade = v) : null),
              if (_s.crossfade && xfade)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                  child: Row(children: [
                    Text('${_s.transitionSeconds}s', style: AT.headline),
                    Expanded(child: CupertinoSlider(value: _s.transitionSeconds.toDouble(), min: 1, max: 12, divisions: 11, activeColor: AT.accent, onChanged: canEdit ? (v) => setState(() => _s.transitionSeconds = v.round()) : null)),
                  ]),
                ),
            ],
          ),
          if (canEdit)
            GroupedSection(title: 'Announcement', children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  Expanded(child: CupertinoTextField(controller: _announce, placeholder: 'Message to everyone', maxLength: 160, style: AT.callout, placeholderStyle: AT.callout.copyWith(color: AT.label3), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rPill)))),
                  const SizedBox(width: 8),
                  CircleIconButton(icon: CupertinoIcons.speaker_2_fill, filled: true, size: 38, onTap: _announcing ? null : _sendAnnouncement),
                ]),
              ),
            ]),
          if (canEdit)
            GroupedSection(title: 'Hand over DJ control', footer: 'They become host. You become co-host. Playback continues without a gap.', children: [
              for (final m in t.members.where((m) => m.userId != t.myUserId))
                AppleRow(
                  leading: Avatar(name: m.username, size: 34),
                  title: m.username,
                  subtitle: RoomRole.parse(m.role).label,
                  chevron: true,
                  onTap: () async {
                    final yes = await showCupertinoDialog<bool>(
                      context: context,
                      builder: (ctx) => CupertinoAlertDialog(
                        title: Text('Hand over to ${m.username}?'),
                        actions: [
                          CupertinoDialogAction(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                          CupertinoDialogAction(isDefaultAction: true, onPressed: () => Navigator.pop(ctx, true), child: const Text('Hand over')),
                        ],
                      ),
                    );
                    if (yes != true || !context.mounted) return;
                    final ok = await t.transferOwnership(m.userId);
                    if (!context.mounted) return;
                    if (ok) {
                      Navigator.pop(context);
                    } else {
                      appleToast(context, 'Could not hand over.');
                    }
                  },
                ),
            ]),
          if (canEdit) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 0), child: PillButton(label: 'Save', expand: true, loading: _saving, onTap: _save)),
          if (!canEdit) const Padding(padding: EdgeInsets.symmetric(horizontal: 32), child: Text('Only the host can change DJ controls.', style: AT.caption)),
        ]),
      ),
    ]);
  }
}
