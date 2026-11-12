import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../design_system/apple/apple_kit.dart';
import '../../design_system/apple/apple_tokens.dart';
import '../../models/room_models.dart';

/// Shows the creation sheet. Returns a validated config or null if dismissed.
Future<RoomConfig?> showRoomConfigSheet(BuildContext context, {required String mode, required String hostName}) {
  return AppleSheet.show<RoomConfig>(
    context,
    initial: 0.9,
    max: 0.96,
    builder: (ctx, scroll) => _ConfigBody(scroll: scroll, mode: mode, hostName: hostName),
  );
}

class _ConfigBody extends StatefulWidget {
  const _ConfigBody({required this.scroll, required this.mode, required this.hostName});
  final ScrollController scroll;
  final String mode;
  final String hostName;
  @override
  State<_ConfigBody> createState() => _ConfigBodyState();
}

class _ConfigBodyState extends State<_ConfigBody> {
  late final RoomConfig _c = RoomConfig(mode: widget.mode, name: "${widget.hostName}'s room");
  late final TextEditingController _name = TextEditingController(text: _c.name);
  final TextEditingController _pw = TextEditingController();
  bool _review = false;
  bool _usePassword = false;
  int _durIdx = 1; // 1 hour default
  double _customHours = 4;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _pw.dispose();
    super.dispose();
  }

  Future<void> _pickCover() async {
    try {
      final f = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1200, imageQuality: 85);
      if (f != null && mounted) setState(() => _c.coverPath = f.path);
    } catch (_) {
      if (mounted) appleToast(context, 'Could not open photos.');
    }
  }

  void _toggleRole(RoomRole r, bool on) {
    setState(() {
      on ? _c.enabledRoles.add(r) : _c.enabledRoles.remove(r);
      _c.normalize();
    });
  }

  void _goReview() {
    _c.name = _name.text;
    _c.password = _usePassword ? _pw.text : null;
    final preset = DurationPreset.all[_durIdx];
    _c.durationMinutes = preset.custom ? (_customHours * 60).round() : preset.minutes;
    _c.normalize();
    final err = _c.validate();
    if (err != null) {
      HapticFeedback.heavyImpact();
      setState(() => _error = err);
      return;
    }
    setState(() {
      _error = null;
      _review = true;
    });
    if (widget.scroll.hasClients) widget.scroll.jumpTo(0);
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      SheetHeader(
        title: _review ? 'Review' : 'New Room',
        leading: _review ? CircleIconButton(icon: CupertinoIcons.chevron_left, size: 32, iconSize: 15, onTap: () => setState(() => _review = false)) : null,
        onClose: () => Navigator.of(context).pop(),
      ),
      Expanded(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 280),
          switchInCurve: Curves.easeOutCubic,
          transitionBuilder: (child, a) => FadeTransition(opacity: a, child: SlideTransition(position: Tween(begin: const Offset(0.04, 0), end: Offset.zero).animate(a), child: child)),
          child: _review ? _buildReview() : _buildForm(),
        ),
      ),
    ]);
  }

  // ───────────────────────── Form ─────────────────────────

  Widget _buildForm() {
    return ListView(
      key: const ValueKey('form'),
      controller: widget.scroll,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24),
      children: [
        // Cover + name
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Row(children: [
            SpringPressable(
              onTap: _pickCover,
              child: Container(
                width: 84,
                height: 84,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rLg)),
                child: _c.coverPath == null
                    ? const Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(CupertinoIcons.photo_on_rectangle, color: AT.label2, size: 24),
                        SizedBox(height: 4),
                        Text('Cover', style: TextStyle(color: AT.label2, fontSize: 11)),
                      ])
                    : Image.file(File(_c.coverPath!), fit: BoxFit.cover),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: CupertinoTextField(
                controller: _name,
                maxLength: 40,
                placeholder: 'Room name',
                placeholderStyle: AT.body.copyWith(color: AT.label3),
                style: AT.body,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rPill)),
              ),
            ),
          ]),
        ),

        if (_error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(32, 0, 32, 12),
            child: Text(_error!, style: AT.footnote.copyWith(color: AT.red)),
          ),

        GroupedSection(title: 'Session', children: [
          AppleRow(
            title: 'Participants',
            subtitle: 'Up to ${_c.maxParticipants} people',
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              CircleIconButton(icon: CupertinoIcons.minus, size: 32, iconSize: 14, onTap: _c.maxParticipants > 2 ? () => setState(() => _c.maxParticipants--) : null),
              SizedBox(width: 36, child: Center(child: Text('${_c.maxParticipants}', style: AT.headline))),
              CircleIconButton(icon: CupertinoIcons.plus, size: 32, iconSize: 14, onTap: _c.maxParticipants < 50 ? () => setState(() => _c.maxParticipants++) : null),
            ]),
          ),
          AppleSwitchRow(
            title: 'Public room',
            subtitle: _c.isPublic ? 'Listed so anyone can find it' : 'Only people with the code or a link',
            value: _c.isPublic,
            onChanged: (v) => setState(() => _c.isPublic = v),
          ),
          AppleSwitchRow(title: 'Password', subtitle: 'Ask for a password to join', value: _usePassword, onChanged: (v) => setState(() => _usePassword = v)),
          AnimatedSize(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: _usePassword
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
                    child: CupertinoTextField(
                      controller: _pw,
                      obscureText: true,
                      placeholder: 'At least 4 characters',
                      placeholderStyle: AT.callout.copyWith(color: AT.label3),
                      style: AT.callout,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rPill)),
                    ),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ]),

        GroupedSection(
          title: 'Joining',
          footer: switch (_c.inviteMode) {
            InviteMode.open => 'Anyone with the code can join straight away.',
            InviteMode.approval => 'People wait in a lobby until an authorised member lets them in.',
            InviteMode.inviteOnly => 'Only people with an invitation link you create can join.',
          },
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: PillTabs(
                labels: InviteMode.values.map((e) => e.label).toList(),
                index: InviteMode.values.indexOf(_c.inviteMode),
                onChanged: (i) => setState(() => _c.inviteMode = InviteMode.values[i]),
              ),
            ),
          ],
        ),

        GroupedSection(title: 'Duration', footer: 'The server ends the room on time, even if your phone is off.', children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              for (var i = 0; i < DurationPreset.all.length; i++)
                _Chip(
                  label: DurationPreset.all[i].custom && _durIdx == i ? '${_customHours.round()} h max' : DurationPreset.all[i].label,
                  selected: _durIdx == i,
                  onTap: () => setState(() => _durIdx = i),
                ),
            ]),
          ),
          if (DurationPreset.all[_durIdx].custom)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: CupertinoSlider(
                value: _customHours,
                min: 4,
                max: 12,
                divisions: 8,
                activeColor: AT.accent,
                onChanged: (v) {
                  if (v.round() != _customHours.round()) HapticFeedback.selectionClick();
                  setState(() => _customHours = v);
                },
              ),
            ),
        ]),

        GroupedSection(
          title: 'Roles',
          footer: 'Only enabled roles can be given to people in this room. This cannot change later.',
          children: [
            const AppleRow(title: 'Host', subtitle: 'Always on', trailing: Icon(CupertinoIcons.lock_fill, size: 16, color: AT.label3)),
            for (final r in [RoomRole.coHost, RoomRole.dj, RoomRole.member, RoomRole.listener])
              AppleSwitchRow(title: r.label, value: _c.enabledRoles.contains(r), onChanged: (v) => _toggleRole(r, v)),
          ],
        ),

        PermissionEditor(config: _c, onChanged: () => setState(() {})),

        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
          child: PillButton(label: 'Review', expand: true, onTap: _goReview),
        ),
      ],
    );
  }

  // ───────────────────────── Review ─────────────────────────

  Widget _buildReview() {
    final dur = DurationPreset.all[_durIdx].custom ? 'Up to ${_customHours.round()} hours' : DurationPreset.all[_durIdx].label;
    return ListView(
      key: const ValueKey('review'),
      controller: widget.scroll,
      padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24),
      children: [
        GroupedSection(title: 'Room', children: [
          AppleRow(title: 'Name', trailing: Text(_c.name.trim(), style: AT.subhead)),
          AppleRow(title: 'Mode', trailing: Text(_c.mode == 'collab' ? 'Jam session' : 'DJ session', style: AT.subhead)),
          AppleRow(title: 'Visibility', trailing: Text(_c.isPublic ? 'Public' : 'Private', style: AT.subhead)),
          AppleRow(title: 'Capacity', trailing: Text('${_c.maxParticipants}', style: AT.subhead)),
          AppleRow(title: 'Joining', trailing: Text(_c.inviteMode.label + ((_c.password ?? '').isNotEmpty ? ' + password' : ''), style: AT.subhead)),
          AppleRow(title: 'Duration', trailing: Text(dur, style: AT.subhead)),
        ]),
        GroupedSection(title: 'Roles enabled', children: [
          AppleRow(title: RoomRole.values.reversed.where((r) => _c.enabledRoles.contains(r)).map((r) => r.label).join(' · ')),
        ]),
        GroupedSection(title: 'Who can…', children: [
          for (final p in RoomPermission.values) AppleRow(leading: IconTile(p.icon, size: 28), title: p.label, trailing: Text(_thresholdLabel(_c.permissions[p]!), style: AT.subhead)),
        ]),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
          child: PillButton(label: 'Create Room', icon: CupertinoIcons.sparkles, expand: true, onTap: () => Navigator.of(context).pop(_c)),
        ),
      ],
    );
  }
}

String _thresholdLabel(RoomRole r) => switch (r) {
      RoomRole.host => 'Host only',
      RoomRole.listener => 'Everyone',
      _ => '${r.label} & up',
    };

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SpringPressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          decoration: ShapeDecoration(color: selected ? AT.accent : AT.fillStrong, shape: const StadiumBorder()),
          child: Text(label, style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
        ),
      );
}

/// Permission thresholds. Used by creation sheet and by host's live "Room settings".
/// When [readOnly], rows show current values without pickers.
class PermissionEditor extends StatelessWidget {
  const PermissionEditor({super.key, required this.config, required this.onChanged, this.readOnly = false});
  final RoomConfig config;
  final VoidCallback onChanged;
  final bool readOnly;

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      GroupedSection(
        title: 'Permissions',
        footer: 'Each permission is granted to the chosen role and everyone above it.',
        children: [
          for (final p in RoomPermission.values)
            AppleRow(
              leading: IconTile(p.icon, size: 28),
              title: p.label,
              subtitle: p.subtitle,
              trailing: Text(_thresholdLabel(config.permissions[p]!), style: AT.subhead),
              chevron: !readOnly,
              onTap: readOnly
                  ? null
                  : () async {
                      final r = await appleActionSheet<RoomRole>(
                        context,
                        title: p.label,
                        options: [for (final o in config.thresholdOptions(p)) (_thresholdLabel(o), o, destructive: false)],
                      );
                      if (r != null) {
                        config.permissions[p] = r;
                        onChanged();
                      }
                    },
            ),
        ],
      ),
    ]);
  }
}
