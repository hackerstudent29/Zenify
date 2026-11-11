import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_models.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';

/// Keep accent readable on black: lighten until contrast ratio >= 4.5.
Color ensureContrast(Color c, {Color on = Colors.black, double min = 4.5}) {
  double ratio(Color a, Color b) {
    final la = a.computeLuminance(), lb = b.computeLuminance();
    final hi = la > lb ? la : lb, lo = la > lb ? lb : la;
    return (hi + 0.05) / (lo + 0.05);
  }

  var h = HSLColor.fromColor(c);
  var out = c;
  var guard = 0;
  while (ratio(out, on) < min && guard++ < 20) {
    h = h.withLightness((h.lightness + 0.04).clamp(0.0, 1.0));
    out = h.toColor();
  }
  return out;
}

class RoomThemeScope extends InheritedWidget {
  const RoomThemeScope({super.key, required this.theme, required super.child});
  final RoomTheme theme;
  static RoomTheme of(BuildContext c) => c.dependOnInheritedWidgetOfExactType<RoomThemeScope>()?.theme ?? const RoomTheme();
  static Color accentOf(BuildContext c) => ensureContrast(of(c).accent);
  @override
  bool updateShouldNotify(RoomThemeScope old) => old.theme.presetId != theme.presetId || old.theme.accentHex != theme.accentHex || old.theme.useArtwork != theme.useArtwork;
}

/// Background for the room. Artwork palette (default) or a preset gradient with slow drift.
class RoomAmbient extends StatefulWidget {
  const RoomAmbient({super.key, required this.theme, required this.artworkUrl});
  final RoomTheme theme;
  final String artworkUrl;
  @override
  State<RoomAmbient> createState() => _RoomAmbientState();
}

class _RoomAmbientState extends State<RoomAmbient> with SingleTickerProviderStateMixin {
  late final AnimationController _drift = AnimationController(vsync: this, duration: const Duration(seconds: 18));

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(RoomAmbient old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _sync() {
    final reduce = WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    final want = !widget.theme.useArtwork && widget.theme.animateBackground && !reduce;
    if (want && !_drift.isAnimating) {
      _drift.repeat(reverse: true);
    } else if (!want && _drift.isAnimating) {
      _drift.stop();
    }
  }

  @override
  void dispose() {
    _drift.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.theme.useArtwork) return ArtworkAmbient(url: widget.artworkUrl);
    final c = widget.theme.preset.colors;
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _drift,
        builder: (_, _) => Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment(-0.3 + 0.6 * _drift.value, -1),
              end: Alignment(0.3 - 0.6 * _drift.value, 1),
              colors: [c[0], c[1], AT.bg],
              stops: const [0, 0.55, 1],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> showThemeSheet(BuildContext context) => AppleSheet.show<void>(context, initial: 0.72, builder: (ctx, sc) => _ThemeBody(scroll: sc));

class _ThemeBody extends StatefulWidget {
  const _ThemeBody({required this.scroll});
  final ScrollController scroll;
  @override
  State<_ThemeBody> createState() => _ThemeBodyState();
}

class _ThemeBodyState extends State<_ThemeBody> {
  static const _accents = ['#FA586A', '#64D2FF', '#BF5AF2', '#FF9F0A', '#30D158', '#FFFFFF'];
  late RoomTheme _t = context.read<TogetherService>().roomTheme;
  bool _saving = false;

  Future<void> _push(RoomTheme next) async {
    final prev = _t;
    setState(() {
      _t = next;
      _saving = true;
    });
    final ok = await context.read<TogetherService>().updateTheme(next); // server broadcasts to everyone
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) {
      setState(() => _t = prev);
      appleToast(context, 'Only people allowed to change room settings can do that.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final canEdit = t.isHost || t.myRole.rank >= RoomRole.coHost.rank;
    return Column(children: [
      SheetHeader(title: 'Theme', trailing: _saving ? const CupertinoActivityIndicator() : null, onClose: () => Navigator.pop(context)),
      Expanded(
        child: ListView(controller: widget.scroll, padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + 24), children: [
          SizedBox(
            height: 124,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: RoomThemePreset.all.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (_, i) {
                final p = RoomThemePreset.all[i];
                final sel = !_t.useArtwork && _t.presetId == p.id;
                return SpringPressable(
                  onTap: canEdit ? () => _push(_t.copyWith(presetId: p.id, useArtwork: false)) : null,
                  child: Column(children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 240),
                      width: 84,
                      height: 84,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AT.rLg),
                        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: p.colors),
                        border: Border.all(color: sel ? AT.label : Colors.transparent, width: 2.5),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(p.name, style: AT.footnote.copyWith(color: sel ? AT.label : AT.label2)),
                  ]),
                );
              },
            ),
          ),
          const SizedBox(height: 20),
          GroupedSection(
            title: 'Background',
            footer: 'Artwork colours blend smoothly when the song changes.',
            children: [
              AppleSwitchRow(title: 'Follow artwork', value: _t.useArtwork, onChanged: canEdit ? (v) => _push(_t.copyWith(useArtwork: v)) : null),
              AppleSwitchRow(title: 'Animate background', subtitle: 'Respects system reduce-motion', value: _t.animateBackground, onChanged: canEdit && !_t.useArtwork ? (v) => _push(_t.copyWith(animateBackground: v)) : null),
            ],
          ),
          GroupedSection(title: 'Accent', footer: 'Low-contrast colours are lightened automatically.', children: [
            Padding(
              padding: const EdgeInsets.all(14),
              child: Wrap(spacing: 14, runSpacing: 12, children: [
                for (final hex in _accents)
                  SpringPressable(
                    onTap: canEdit ? () => _push(_t.copyWith(accentHex: hex)) : null,
                    child: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(color: Color(int.parse('FF${hex.substring(1)}', radix: 16)), shape: BoxShape.circle, border: Border.all(color: _t.accentHex == hex ? AT.label : Colors.transparent, width: 3)),
                    ),
                  ),
                SpringPressable(onTap: canEdit ? () => _push(_t.copyWith(clearAccent: true)) : null, child: const Padding(padding: EdgeInsets.all(8), child: Text('Reset', style: AT.footnote))),
              ]),
            ),
          ]),
          if (!canEdit) const Padding(padding: EdgeInsets.symmetric(horizontal: 32), child: Text('Only the host and co-hosts can change the theme.', style: AT.caption)),
        ]),
      ),
    ]);
  }
}
