import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_models.dart';
import '../../../services/together_service.dart';
import 'voice_controller.dart';

Future<void> showVoiceSheet(BuildContext context) {
  return AppleSheet.show<void>(context, initial: 0.7, builder: (ctx, scroll) => _VoiceBody(scroll: scroll));
}

class _VoiceBody extends StatelessWidget {
  const _VoiceBody({required this.scroll});
  final ScrollController scroll;

  Future<void> _join(BuildContext context, TogetherService t, VoiceController v) async {
    final res = await t.fetchVoiceToken();
    if (res == null) {
      if (context.mounted) {
        appleToast(context, t.lastRoomError == 'VOICE_NOT_CONFIGURED' ? 'Voice is not set up on the server yet.' : 'Voice is not available for you in this room.', icon: CupertinoIcons.mic_slash);
      }
      return;
    }
    await v.join(url: res['url'] as String, token: res['token'] as String);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final v = context.watch<VoiceController>();
    final isHostish = t.can(RoomPermission.moderateChat) || t.isHost;
    final cfg = t.roomConfig;

    return Column(children: [
      SheetHeader(title: 'Voice', onClose: () => Navigator.of(context).pop()),
      Expanded(
        child: ListView(controller: scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
          if (v.error != null)
            Padding(padding: const EdgeInsets.fromLTRB(24, 0, 24, 12), child: Text(v.error!, style: AT.footnote.copyWith(color: AT.red))),

          // Primary control
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
            child: !v.connected
                ? PillButton(label: 'Join Voice', icon: CupertinoIcons.mic_fill, expand: true, loading: v.connecting, onTap: () => _join(context, t, v))
                : Row(children: [
                    Expanded(
                      child: PillButton(
                        label: v.micOn ? 'Mute' : (v.canPublish ? 'Unmute' : 'Mic off by host'),
                        icon: v.micOn ? CupertinoIcons.mic_fill : CupertinoIcons.mic_slash_fill,
                        style: v.micOn ? PillStyle.filled : PillStyle.glass,
                        color: AT.green,
                        onTap: v.canPublish ? () => v.setMic(!v.micOn) : null,
                      ),
                    ),
                    const SizedBox(width: 10),
                    PillButton(label: 'Leave', style: PillStyle.destructive, onTap: v.leave),
                  ]),
          ),

          if (cfg != null)
            GroupedSection(
              title: 'Who can speak',
              footer: t.isHost ? null : 'Set by the host.',
              children: [
                AppleRow(
                  leading: const IconTile(CupertinoIcons.mic_fill, size: 28, color: AT.green),
                  title: cfg.speakPolicy.label,
                  chevron: t.isHost,
                  onTap: t.isHost
                      ? () async {
                          final r = await appleActionSheet<SpeakPolicy>(context, title: 'Who can speak', options: [for (final s in SpeakPolicy.values) (s.label, s, destructive: false)]);
                          if (r != null) {
                            final ok = await t.updateRoomConfig({'speakPolicy': r.wire});
                            if (!ok && context.mounted) appleToast(context, 'Could not change voice policy.');
                          }
                        }
                      : null,
                ),
              ],
            ),

          GroupedSection(
            title: 'In this room',
            children: [
              for (final m in t.members)
                _VoiceMemberRow(
                  member: m,
                  speaking: v.speaking.contains(m.userId),
                  isMe: m.userId == t.myUserId,
                  volume: v.volumes[m.userId] ?? 1.0,
                  connected: v.connected,
                  canModerate: isHostish && m.userId != t.myUserId,
                  speakerPicker: cfg?.speakPolicy == SpeakPolicy.selected && t.isHost && RoomRole.parse(m.role).rank < RoomRole.coHost.rank,
                  isSelectedSpeaker: t.speakerUserIds.contains(m.userId),
                  onVolume: (x) => v.setParticipantVolume(m.userId, x),
                  onMute: () async {
                    final ok = await t.muteMemberMic(m.userId, muted: true);
                    if (!ok && context.mounted) appleToast(context, 'Could not mute ${m.username}.');
                  },
                  onRevoke: () async {
                    final ok = await t.revokeSpeaking(m.userId);
                    if (!ok && context.mounted) appleToast(context, 'Could not revoke access.');
                  },
                  onToggleSpeaker: (on) async {
                    final next = <String>{...t.speakerUserIds};
                    on ? next.add(m.userId) : next.remove(m.userId);
                    final ok = await t.setSpeakers(next);
                    if (!ok && context.mounted) appleToast(context, 'Could not update speakers.');
                  },
                ),
            ],
          ),
        ]),
      ),
    ]);
  }
}

class _VoiceMemberRow extends StatefulWidget {
  const _VoiceMemberRow({
    required this.member,
    required this.speaking,
    required this.isMe,
    required this.volume,
    required this.connected,
    required this.canModerate,
    required this.speakerPicker,
    required this.isSelectedSpeaker,
    required this.onVolume,
    required this.onMute,
    required this.onRevoke,
    required this.onToggleSpeaker,
  });
  final TogetherMember member;
  final bool speaking;
  final bool isMe;
  final double volume;
  final bool connected;
  final bool canModerate;
  final bool speakerPicker;
  final bool isSelectedSpeaker;
  final ValueChanged<double> onVolume;
  final VoidCallback onMute;
  final VoidCallback onRevoke;
  final ValueChanged<bool> onToggleSpeaker;

  @override
  State<_VoiceMemberRow> createState() => _VoiceMemberRowState();
}

class _VoiceMemberRowState extends State<_VoiceMemberRow> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void didUpdateWidget(covariant _VoiceMemberRow old) {
    super.didUpdateWidget(old);
    if (widget.speaking && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!widget.speaking && _pulse.isAnimating) {
      _pulse.animateTo(0, duration: const Duration(milliseconds: 200));
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.member;
    final role = RoomRole.parse(m.role);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Column(children: [
        Row(children: [
          AnimatedBuilder(
            animation: _pulse,
            builder: (_, child) => Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AT.green.withValues(alpha: widget.speaking ? 0.35 + 0.65 * _pulse.value : 0), width: 2.5)),
              child: child,
            ),
            child: Avatar(name: m.username, size: 40),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.isMe ? '${m.username} (You)' : m.username, style: AT.body.copyWith(fontSize: 16)),
              Text(widget.speaking ? 'Speaking' : role.label, style: AT.footnote.copyWith(color: widget.speaking ? AT.green : AT.label2)),
            ]),
          ),
          if (widget.speakerPicker) CupertinoSwitch(value: widget.isSelectedSpeaker, activeTrackColor: AT.green, onChanged: widget.onToggleSpeaker),
          if (widget.canModerate) ...[
            CircleIconButton(icon: CupertinoIcons.mic_slash_fill, size: 32, iconSize: 14, tooltip: 'Mute', onTap: widget.onMute),
            const SizedBox(width: 6),
            CircleIconButton(icon: CupertinoIcons.hand_raised_slash_fill, size: 32, iconSize: 14, tooltip: 'Revoke speaking', onTap: widget.onRevoke),
          ],
        ]),
        if (widget.connected && !widget.isMe)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(children: [
              const Icon(CupertinoIcons.speaker_1_fill, size: 14, color: AT.label3),
              Expanded(child: CupertinoSlider(value: widget.volume.clamp(0.0, 1.0), activeColor: AT.accent, onChanged: widget.onVolume)),
              const Icon(CupertinoIcons.speaker_3_fill, size: 14, color: AT.label3),
            ]),
          ),
      ]),
    );
  }
}
