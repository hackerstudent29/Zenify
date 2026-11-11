import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/glass_kit.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/zen.dart' hide SpringCurve;
import '../../services/studio_fx_state.dart';
import 'glass_sheet.dart';
import 'player_kit.dart' show showSpringSheet;

Future<void> showStudioFxSheet(BuildContext context) =>
    showSpringSheet<void>(context, builder: (_) => const StudioFxSheet());

/// Studio FX: real-time audio engine sheet (Presets, EQ, Space, Voice, Tempo, Chain).
class StudioFxSheet extends StatefulWidget {
  const StudioFxSheet({super.key});

  @override
  State<StudioFxSheet> createState() => _StudioFxSheetState();
}

class _StudioFxSheetState extends State<StudioFxSheet> {
  static const Map<int, String> _tabs = {0: 'Presets', 1: 'EQ', 2: 'Space', 3: 'Voice', 4: 'Tempo', 5: 'Chain'};
  int _tab = 0;
  int _dir = 1;

  void _select(int i) {
    if (i == _tab) return;
    setState(() {
      _dir = i > _tab ? 1 : -1;
      _tab = i;
    });
  }

  Widget _content(StudioFxState fx) => switch (_tab) {
        0 => _PresetsTab(key: const ValueKey(0), fx: fx),
        1 => _EqTab(key: const ValueKey(1), fx: fx),
        2 => _SpaceTab(key: const ValueKey(2), fx: fx),
        3 => _VoiceTab(key: const ValueKey(3), fx: fx),
        4 => _TempoTab(key: const ValueKey(4), fx: fx),
        _ => _ChainTab(key: const ValueKey(5), fx: fx),
      };

  @override
  Widget build(BuildContext context) {
    final fx = context.watch<StudioFxState>();
    final bypass = fx.settings.bypass;
    const curve = SpringCurve();

    return GlassSheet(
      header: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Studio FX', style: AppTypography.title2),
                    const SizedBox(height: 2),
                    Text(
                      fx.engine?.isAvailable == true ? 'Real-time audio engine' : 'Engine unavailable on this device',
                      style: AppTypography.caption.copyWith(color: Zen.textMuted),
                    ),
                  ],
                ),
              ),
              GlassSwitch(value: !bypass, onChanged: (on) => fx.setBypass(!on)),
              const SizedBox(width: 10),
              GlassIconButton(icon: Icons.close_rounded, onTap: () => Navigator.of(context).maybePop()),
            ],
          ),
          const SizedBox(height: 14),
          GlassSegmented<int>(value: _tab, options: _tabs, onChanged: _select, fontSize: 11.5),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Spectrum(engine: fx.engine, dim: bypass),
          const SizedBox(height: 14),
          AnimatedOpacity(
            duration: const Duration(milliseconds: 300),
            opacity: bypass ? 0.5 : 1,
            child: AnimatedSize(
              duration: curve.duration,
              curve: curve,
              alignment: Alignment.topCenter,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 320),
                switchInCurve: Curves.easeOutCubic,
                layoutBuilder: (current, previous) => Stack(
                  alignment: Alignment.topCenter,
                  children: [...previous, ?current],
                ),
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SlideTransition(
                    position: Tween<Offset>(begin: Offset(0.08 * _dir, 0), end: Offset.zero).animate(anim),
                    child: child,
                  ),
                ),
                child: _content(fx),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Center(
            child: GlassButton(
              label: 'Reset all',
              style: GlassButtonStyle.destructive,
              compact: true,
              onTap: fx.resetAll,
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Formatters (same wording as the web version)
// -----------------------------------------------------------------------------
String _pct(double v) => v <= 0.005 ? 'Off' : '${(v * 100).round()}%';
String _hz(double h) => h >= 1000 ? '${(h / 1000).toStringAsFixed(h >= 10000 ? 0 : 1)} kHz' : '${h.round()} Hz';
String _filter(double v) {
  if (v.abs() < 0.03) return 'Off';
  return v < 0
      ? 'Low-pass ${_hz(20000 * math.pow(0.0125, -v).toDouble())}'
      : 'High-pass ${_hz(20 * math.pow(300, v).toDouble())}';
}

String _width(double v) => v < 0.05 ? 'Mono' : (v - 1).abs() < 0.03 ? 'Original' : '${(v * 100).round()}%';

// -----------------------------------------------------------------------------
// Presets
// -----------------------------------------------------------------------------
class _PresetsTab extends StatefulWidget {
  const _PresetsTab({super.key, required this.fx});
  final StudioFxState fx;

  @override
  State<_PresetsTab> createState() => _PresetsTabState();
}

class _PresetsTabState extends State<_PresetsTab> {
  bool _naming = false;
  final _ctl = TextEditingController();

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  void _save() {
    if (widget.fx.saveCustomPreset(_ctl.text.isEmpty ? 'My Preset ${widget.fx.customPresetNames.length + 1}' : _ctl.text)) {
      HapticFeedback.lightImpact();
      setState(() {
        _naming = false;
        _ctl.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final fx = widget.fx;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final p in StudioFxState.builtIn)
              GlassChip(
                label: p.name,
                selected: fx.isPresetActive(p.name),
                onTap: () {
                  HapticFeedback.selectionClick();
                  fx.applyPreset(p.name);
                },
              ),
          ],
        ),
        const SizedBox(height: 20),
        GlassHeader(
          'Mine',
          action: PressableScale(
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _naming = !_naming);
            },
            child: Container(
              height: 38,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: const Color(0xFF18181B),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _naming ? Icons.close_rounded : Icons.bookmark_add_rounded,
                    size: 15,
                    color: Zen.rose,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _naming ? 'CANCEL' : 'SAVE CURRENT',
                    style: TextStyle(
                      color: Zen.rose,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        GlassCollapse(
          open: _naming,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: GlassSurface(
                    radius: 12,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    child: SizedBox(
                      height: 40,
                      child: TextField(
                        controller: _ctl,
                        maxLength: 24,
                        style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500),
                        cursorColor: Zen.rose,
                        decoration: InputDecoration(
                          counterText: '',
                          border: InputBorder.none,
                          hintText: 'Preset name',
                          hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.35)),
                          contentPadding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                        onSubmitted: (_) => _save(),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                PressableScale(
                  onTap: _save,
                  child: Container(
                    height: 40,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    decoration: BoxDecoration(
                      color: const Color(0xFF18181B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_rounded, size: 16, color: Zen.rose),
                        const SizedBox(width: 6),
                        Text(
                          'SAVE',
                          style: TextStyle(
                            color: Zen.rose,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (fx.customPresetNames.isEmpty && !_naming)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              'Shape your sound, then tap Save current.',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 12),
            ),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final n in fx.customPresetNames)
                GlassChip(
                  label: n,
                  selected: fx.isPresetActive(n),
                  onTap: () => fx.applyPreset(n),
                  onDelete: () => fx.deleteCustomPreset(n),
                ),
            ],
          ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// EQ, filter, warmth, night mode
// -----------------------------------------------------------------------------
class _EqTab extends StatelessWidget {
  const _EqTab({super.key, required this.fx});
  final StudioFxState fx;

  void _band(int i, double v, bool end) {
    final eq = fx.settings.eq..[i] = v;
    (end ? fx.commit : fx.live)({'eq': eq});
  }

  @override
  Widget build(BuildContext context) {
    final s = fx.settings;
    final flat = s.eq.every((v) => v == 0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassSection(
          title: 'Equalizer',
          action: GlassTextButton(label: 'Reset', enabled: !flat, onTap: fx.resetEq),
          children: [
            SizedBox(
              height: 178,
              child: Row(
                children: [
                  for (var i = 0; i < StudioFxState.bandCount; i++)
                    Expanded(
                      child: GlassSlider(
                        axis: Axis.vertical,
                        title: StudioFxState.eqLabels[i],
                        hint: StudioFxState.eqSubLabels[i],
                        value: s.eq[i],
                        min: -12,
                        max: 12,
                        step: 1,
                        center: 0,
                        snap: 0.5,
                        bipolar: true,
                        format: (v) => '${v > 0 ? '+' : ''}${v.round()} dB',
                        onChanged: (v) => _band(i, v, false),
                        onChangeEnd: (v) => _band(i, v, true),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        GlassSection(
          children: [
            GlassSlider(
              title: 'Filter',
              value: s.filter,
              min: -1,
              max: 1,
              center: 0,
              snap: 0.05,
              bipolar: true,
              format: _filter,
              onChanged: (v) => fx.live({'filter': v}),
              onChangeEnd: (v) => fx.commit({'filter': v}),
            ),
            GlassSlider(
              title: 'Warmth',
              value: s.drive,
              format: _pct,
              onChanged: (v) => fx.live({'drive': v}),
              onChangeEnd: (v) => fx.commit({'drive': v}),
            ),
            _ToggleRow(
              title: 'Night mode',
              sub: 'Evens out loud and quiet parts',
              value: s.night,
              onChanged: (v) => fx.commit({'night': v}),
            ),
          ],
        ),
      ],
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({required this.title, this.sub, required this.value, required this.onChanged});
  final String title;
  final String? sub;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13)),
              if (sub != null) Text(sub!, style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 11)),
            ],
          ),
        ),
        GlassSwitch(value: value, onChanged: onChanged),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Space: reverb, echo, chorus, width, 8D
// -----------------------------------------------------------------------------
class _SpaceTab extends StatelessWidget {
  const _SpaceTab({super.key, required this.fx});
  final StudioFxState fx;

  @override
  Widget build(BuildContext context) {
    final s = fx.settings;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassSection(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text('Reverb', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13)),
                ),
                GlassSegmented<String>(
                  value: s.reverb,
                  options: const {'none': 'None', 'warehouse': 'Small Hall', 'cathedral': 'Church'},
                  onChanged: (v) => fx.commit({'reverb': v}),
                ),
                GlassCollapse(
                  open: s.reverb != 'none',
                  child: Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: GlassSlider(
                      title: 'Amount',
                      value: s.reverbAmount,
                      format: (v) => '${(v * 100).round()}%',
                      onChanged: (v) => fx.live({'reverbAmount': v}),
                      onChangeEnd: (v) => fx.commit({'reverbAmount': v}),
                    ),
                  ),
                ),
              ],
            ),
            Column(
              children: [
                GlassSlider(
                  title: 'Echo',
                  value: s.echo,
                  format: _pct,
                  onChanged: (v) => fx.live({'echo': v}),
                  onChangeEnd: (v) => fx.commit({'echo': v}),
                ),
                GlassCollapse(
                  open: s.echo > 0.005,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: GlassSlider(
                      title: 'Delay',
                      value: s.echoTime,
                      min: 0.08,
                      max: 0.8,
                      format: (v) => '${(v * 1000).round()} ms',
                      onChanged: (v) => fx.live({'echoTime': v}),
                      onChangeEnd: (v) => fx.commit({'echoTime': v}),
                    ),
                  ),
                ),
              ],
            ),
            GlassSlider(
              title: 'Chorus',
              value: s.chorus,
              format: _pct,
              onChanged: (v) => fx.live({'chorus': v}),
              onChangeEnd: (v) => fx.commit({'chorus': v}),
            ),
            GlassSlider(
              title: 'Stereo width',
              value: s.width,
              min: 0,
              max: 2,
              center: 1,
              snap: 0.05,
              format: _width,
              onChanged: (v) => fx.live({'width': v}),
              onChangeEnd: (v) => fx.commit({'width': v}),
            ),
          ],
        ),
        const SizedBox(height: 16),
        GlassSection(
          children: [
            _ToggleRow(
              title: '8D Audio',
              sub: 'Sound orbits around your head',
              value: s.is8D,
              onChanged: (v) => fx.commit({'is8D': v}),
            ),
            GlassCollapse(
              open: s.is8D,
              child: Column(
                children: [
                  GlassSegmented<String>(
                    value: s.direction8D,
                    options: const {'clockwise': 'Clockwise', 'counter-clockwise': 'Counter'},
                    onChanged: (v) => fx.commit({'direction8D': v}),
                  ),
                  const SizedBox(height: 12),
                  GlassSlider(
                    title: 'Orbit speed',
                    value: s.speed8D,
                    min: 0.05,
                    max: 0.5,
                    format: (v) => '${(1 / v).toStringAsFixed(1)} s per turn',
                    onChanged: (v) => fx.live({'speed8D': v}),
                    onChangeEnd: (v) => fx.commit({'speed8D': v}),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Voice
// -----------------------------------------------------------------------------
class _VoiceTab extends StatelessWidget {
  const _VoiceTab({super.key, required this.fx});
  final StudioFxState fx;

  @override
  Widget build(BuildContext context) {
    final s = fx.settings;
    final off = s.vocalMode == 'off';
    final ready = fx.engine?.isAvailable == true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassSection(
          children: [
            GlassSegmented<String>(
              value: s.vocalMode,
              options: const {'off': 'Off', 'vocals': 'Vocals only', 'karaoke': 'Karaoke'},
              onChanged: (v) => fx.commit({'vocalMode': v, 'bypass': false}),
            ),
            GlassCollapse(
              open: !off,
              child: Column(
                children: [
                  GlassSlider(
                    title: 'Strength',
                    value: s.vocalAmount,
                    format: (v) => '${(v * 100).round()}%',
                    onChanged: (v) => fx.live({'vocalAmount': v}),
                    onChangeEnd: (v) => fx.commit({'vocalAmount': v}),
                  ),
                  const SizedBox(height: 8),
                  GlassSlider(
                    title: 'Focus',
                    value: s.vocalFocus,
                    format: (v) => v < 0.34 ? 'Wide' : v < 0.67 ? 'Balanced' : 'Tight',
                    onChanged: (v) => fx.live({'vocalFocus': v}),
                    onChangeEnd: (v) => fx.commit({'vocalFocus': v}),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!off)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: ready ? Zen.rose : Colors.white24),
                      ),
                      const SizedBox(width: 6),
                      Text(ready ? 'Active' : 'Needs the Android audio engine',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 11)),
                    ],
                  ),
                ),
              Text(
                off
                    ? 'Pick a mode to separate vocals from the music.'
                    : s.vocalMode == 'karaoke'
                        ? 'Removes the centred voice and keeps the band. Raise Focus if the band sounds thin.'
                        : 'Keeps the centred voice and fades the band. Works best on studio tracks.',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 11, height: 1.35),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Tempo
// -----------------------------------------------------------------------------
class _TempoTab extends StatelessWidget {
  const _TempoTab({super.key, required this.fx});
  final StudioFxState fx;

  bool _near(double a, double b) => (a - b).abs() < 0.005;

  @override
  Widget build(BuildContext context) {
    final s = fx.settings;
    final isDay = _near(s.speed, 0.75) && s.tape;
    final isNight = _near(s.speed, 1.5) && s.tape;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassSection(
          children: [
            Column(
              children: [
                const SizedBox(height: 4),
                Text.rich(
                  TextSpan(
                    text: s.speed.toStringAsFixed(2),
                    style: const TextStyle(
                      fontFamily: 'SF Pro Display',
                      color: Colors.white,
                      fontSize: 40,
                      fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                    children: [
                      TextSpan(
                        text: ' ×',
                        style: TextStyle(
                          fontFamily: 'SF Pro Display',
                          color: Colors.white.withValues(alpha: 0.45),
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                GlassSlider(
                  value: s.speed,
                  min: 0.5,
                  max: 2,
                  center: 1,
                  snap: 0.03,
                  format: (v) => '${v.toStringAsFixed(2)}×',
                  onChanged: (v) => fx.live({'speed': v}),
                  onChangeEnd: (v) => fx.commit({'speed': v}),
                ),
                const SizedBox(height: 6),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final sp in StudioFxState.speedPresets)
                      GlassChip(
                        label: '$sp×',
                        selected: _near(s.speed, sp) && !isDay && !isNight,
                        onTap: () => fx.commit({'speed': sp}),
                      ),
                  ],
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 16),
        GlassSection(
          children: [
            _ToggleRow(
              title: 'Keep original pitch',
              sub: 'Off gives the classic tape speed-up',
              value: !s.tape,
              onChanged: (keep) => fx.commit({'tape': !keep}),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            GlassChip(
              label: 'Daycore',
              selected: isDay,
              onTap: () => fx.commit(isDay ? {'speed': 1.0, 'tape': false} : {'speed': 0.75, 'tape': true}),
            ),
            GlassChip(
              label: 'Nightcore',
              selected: isNight,
              onTap: () => fx.commit(isNight ? {'speed': 1.0, 'tape': false} : {'speed': 1.5, 'tape': true}),
            ),
          ],
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Chain: drag to reorder effects
// -----------------------------------------------------------------------------
class _ChainTab extends StatelessWidget {
  const _ChainTab({super.key, required this.fx});
  final StudioFxState fx;

  static const _names = {
    'eq': 'Equalizer', 'filter': 'Filter', 'drive': 'Warmth',
    'chorus': 'Chorus', 'echo': 'Echo', 'reverb': 'Reverb',
  };

  bool _active(String id, FxSettings s) => switch (id) {
        'eq' => s.eq.any((v) => v != 0),
        'filter' => s.filter.abs() >= 0.03,
        'drive' => s.drive > 0.005,
        'chorus' => s.chorus > 0.005,
        'echo' => s.echo > 0.005,
        'reverb' => s.reverb != 'none',
        _ => false,
      };

  @override
  Widget build(BuildContext context) {
    final s = fx.settings;
    final order = s.chain;
    final isDefault = order.join(',') == kFxChain.join(',');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassHeader(
          'Signal flow',
          action: GlassTextButton(label: 'Reset order', enabled: !isDefault, onTap: () => fx.commit({'chain': kFxChain})),
        ),
        GlassSurface(
          radius: 16,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white.withValues(alpha: 0.10), Colors.white.withValues(alpha: 0.05)],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: ReorderableListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              buildDefaultDragHandles: false,
              itemCount: order.length,
              // ignore: deprecated_member_use
              onReorder: (o, n) {
                if (n > o) n--;
                final l = List<String>.of(order);
                l.insert(n, l.removeAt(o));
                HapticFeedback.selectionClick();
                fx.commit({'chain': l});
              },
              proxyDecorator: (child, i, anim) => AnimatedBuilder(
                animation: anim,
                child: child,
                builder: (_, c) => Transform.scale(
                  scale: 1 + 0.03 * Curves.easeOut.transform(anim.value),
                  child: Material(color: const Color(0xCC3A3A42), borderRadius: BorderRadius.circular(14), child: c),
                ),
              ),
              itemBuilder: (_, i) {
                final id = order[i];
                return Container(
                  key: ValueKey(id),
                  height: 50,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    border: i == 0 ? null : Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.08), width: 0.5)),
                  ),
                  child: Row(
                    children: [
                      ReorderableDragStartListener(
                        index: i,
                        child: Padding(
                          padding: const EdgeInsets.all(6),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              for (var k = 0; k < 3; k++)
                                Container(
                                  margin: const EdgeInsets.symmetric(vertical: 1.5),
                                  width: 16,
                                  height: 2,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.35),
                                    borderRadius: BorderRadius.circular(1),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(_names[id] ?? id,
                            style: const TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w600)),
                      ),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _active(id, s) ? Zen.rose : Colors.white24,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'Sound flows from top to bottom. Hold the handle and drag to reorder.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 11),
          ),
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Live spectrum (36 log bands from the native engine)
// -----------------------------------------------------------------------------
class _Spectrum extends StatefulWidget {
  const _Spectrum({required this.engine, required this.dim});
  final FxEngine? engine;
  final bool dim;

  @override
  State<_Spectrum> createState() => _SpectrumState();
}

class _SpectrumState extends State<_Spectrum> with SingleTickerProviderStateMixin {
  static const n = 36;
  final _levels = List<double>.filled(n, 0);
  List<double> _target = List<double>.filled(n, 0);
  DateTime _last = DateTime.fromMillisecondsSinceEpoch(0);
  StreamSubscription<List<double>>? _sub;
  late final Ticker _ticker;
  final _repaint = ValueNotifier<int>(0);

  @override
  void initState() {
    super.initState();
    _bind();
    _ticker = createTicker((_) {
      final stale = DateTime.now().difference(_last).inMilliseconds > 400;
      for (var i = 0; i < n; i++) {
        final t = stale ? 0.0 : _target[i];
        _levels[i] += (t - _levels[i]) * (t > _levels[i] ? 0.45 : 0.1);
      }
      _repaint.value++;
    })..start();
  }

  void _bind() {
    _sub?.cancel();
    _sub = widget.engine?.spectrum.listen((b) {
      if (b.length == n) {
        _target = b;
        _last = DateTime.now();
      }
    }, onError: (_) {});
  }

  @override
  void didUpdateWidget(_Spectrum old) {
    super.didUpdateWidget(old);
    if (old.engine != widget.engine) _bind();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _ticker.dispose();
    _repaint.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 300),
      opacity: widget.dim ? 0.35 : 1,
      child: GlassSurface(
        radius: 14,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: SizedBox(
          height: 34,
          child: ShaderMask(
            blendMode: BlendMode.dstIn,
            shaderCallback: (r) => const LinearGradient(
              colors: [Colors.transparent, Colors.black, Colors.black, Colors.transparent],
              stops: [0, 0.1, 0.9, 1],
            ).createShader(r),
            child: CustomPaint(size: Size.infinite, painter: _BarsPainter(_levels, _repaint, Zen.rose)),
          ),
        ),
      ),
    );
  }
}

class _BarsPainter extends CustomPainter {
  _BarsPainter(this.levels, Listenable repaint, this.color) : super(repaint: repaint);
  final List<double> levels;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const gap = 3.0;
    final n = levels.length;
    final bw = math.max(1.0, (size.width - gap * (n - 1)) / n);
    for (var i = 0; i < n; i++) {
      final l = levels[i].clamp(0.0, 1.0);
      final h = math.max(2.0, l * size.height);
      final x = i * (bw + gap);
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(x, size.height - h, bw, h), Radius.circular(math.min(bw / 2, 3))),
        Paint()..color = color.withValues(alpha: 0.45 + 0.55 * l),
      );
    }
  }

  @override
  bool shouldRepaint(_BarsPainter old) => false;
}
