import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_models.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';

Future<void> showInvitationSheet(BuildContext context) => AppleSheet.show<void>(context, initial: 0.85, builder: (ctx, sc) => _Body(scroll: sc));

class _Body extends StatefulWidget {
  const _Body({required this.scroll});
  final ScrollController scroll;
  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  List<RoomInvite>? _invites;
  RoomInvite? _selected;
  bool _creating = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await context.read<TogetherService>().fetchInvites();
      if (mounted) {
        setState(() {
          _invites = list;
          _selected ??= list.isEmpty ? null : list.first;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _invites = const []);
    }
  }

  Future<void> _create() async {
    final d = await appleActionSheet<Duration>(context, title: 'Link expires after', options: [
      ('1 hour', const Duration(hours: 1), destructive: false),
      ('24 hours', const Duration(hours: 24), destructive: false),
      ('7 days', const Duration(days: 7), destructive: false),
    ]);
    if (d == null || !mounted) return;
    setState(() => _creating = true);
    final inv = await context.read<TogetherService>().createInvite(expiresIn: d);
    if (!mounted) return;
    setState(() => _creating = false);
    if (inv == null) {
      appleToast(context, 'You cannot create invitations in this room.');
      return;
    }
    setState(() {
      _invites = [inv, ...?_invites];
      _selected = inv;
    });
  }

  String _message(TogetherService t, String url) => 'Join my room on Zenify. Code ${t.roomCode}\n$url';

  Future<void> _whatsapp(TogetherService t, String url) async {
    final uri = Uri.parse('whatsapp://send?text=${Uri.encodeComponent(_message(t, url))}');
    try {
      if (await canLaunchUrl(uri) && await launchUrl(uri)) return;
    } catch (_) {}
    await SharePlus.instance.share(ShareParams(text: _message(t, url))); // WhatsApp not installed: system share sheet
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final canInvite = t.can(RoomPermission.invite);
    final inv = _selected;
    final reqs = t.joinRequests;
    final canReview = t.can(RoomPermission.moderateChat) || t.isHost;

    return Column(children: [
      SheetHeader(title: 'Invite', onClose: () => Navigator.pop(context)),
      Expanded(
        child: ListView(controller: widget.scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
          if (reqs.isNotEmpty && canReview)
            GroupedSection(title: 'Waiting to join', children: [
              for (final r in reqs)
                AppleRow(
                  leading: Avatar(name: r.name, size: 34),
                  title: r.name,
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    CircleIconButton(icon: CupertinoIcons.xmark, size: 32, iconSize: 14, color: AT.red, onTap: () => t.resolveJoinRequest(r.id, approve: false)),
                    const SizedBox(width: 8),
                    CircleIconButton(icon: CupertinoIcons.checkmark_alt, size: 32, iconSize: 16, filled: true, color: AT.green, onTap: () => t.resolveJoinRequest(r.id, approve: true)),
                  ]),
                ),
            ]),

          // Code
          GroupedSection(title: 'Room code', children: [
            AppleRow(
              title: t.roomCode,
              trailing: const Icon(CupertinoIcons.doc_on_doc, size: 18, color: AT.label2),
              onTap: canInvite
                  ? () {
                      Clipboard.setData(ClipboardData(text: t.roomCode));
                      appleToast(context, 'Code copied', icon: CupertinoIcons.checkmark_circle_fill);
                    }
                  : null,
            ),
          ]),

          if (!canInvite)
            const Padding(padding: EdgeInsets.symmetric(horizontal: 32), child: Text('You do not have permission to create invitation links.', style: AT.footnote))
          else ...[
            if (inv != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rLg)),
                  child: Column(children: [
                    Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(AT.rMd)), child: QrImageView(data: inv.url, size: 176, backgroundColor: Colors.white)),
                    const SizedBox(height: 12),
                    Text(inv.expiresMs == null ? 'No expiry' : 'Expires ${_exp(inv.expiresMs!)}', style: AT.footnote),
                    const SizedBox(height: 14),
                    Row(children: [
                      Expanded(child: PillButton(label: 'Share', icon: CupertinoIcons.share, compact: true, style: PillStyle.glass, onTap: () => SharePlus.instance.share(ShareParams(text: _message(t, inv.url))))),
                      const SizedBox(width: 8),
                      Expanded(child: PillButton(label: 'WhatsApp', icon: CupertinoIcons.chat_bubble_fill, compact: true, color: AT.green, style: PillStyle.tinted, onTap: () => _whatsapp(t, inv.url))),
                      const SizedBox(width: 8),
                      CircleIconButton(icon: CupertinoIcons.link, size: 36, onTap: () {
                        Clipboard.setData(ClipboardData(text: inv.url));
                        appleToast(context, 'Link copied', icon: CupertinoIcons.checkmark_circle_fill);
                      }),
                    ]),
                  ]),
                ),
              ),
            Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 20), child: PillButton(label: 'New invitation link', icon: CupertinoIcons.plus, expand: true, style: PillStyle.tinted, loading: _creating, onTap: _create)),
            if ((_invites ?? const []).isNotEmpty)
              GroupedSection(title: 'Active links', children: [
                for (final i in _invites!)
                  AppleRow(
                    title: '…${i.url.substring(i.url.length > 10 ? i.url.length - 10 : 0)}',
                    subtitle: '${i.uses} joined · ${i.expiresMs == null ? 'no expiry' : 'expires ${_exp(i.expiresMs!)}'}',
                    trailing: PillButton(
                      label: 'Revoke',
                      compact: true,
                      style: PillStyle.destructive,
                      onTap: () async {
                        final ok = await t.revokeInvite(i.id);
                        if (!mounted) return;
                        if (ok) {
                          setState(() {
                            _invites = _invites!.where((x) => x.id != i.id).toList();
                            if (_selected?.id == i.id) _selected = _invites!.isEmpty ? null : _invites!.first;
                          });
                        } else if (context.mounted) {
                          appleToast(context, 'Could not revoke.');
                        }
                      },
                    ),
                    onTap: () => setState(() => _selected = i),
                  ),
              ]),
          ],
        ]),
      ),
    ]);
  }

  String _exp(int ms) {
    final left = DateTime.fromMillisecondsSinceEpoch(ms).difference(DateTime.now());
    if (left.isNegative) return 'expired';
    if (left.inHours < 1) return 'in ${left.inMinutes} min';
    if (left.inHours < 48) return 'in ${left.inHours} h';
    return 'in ${left.inDays} d';
  }
}
