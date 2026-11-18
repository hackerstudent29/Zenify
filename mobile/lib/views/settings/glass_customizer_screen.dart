import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../design_system/apple/apple_kit.dart' show appleToast;
import '../../design_system/apple/apple_music_kit.dart';
import '../../design_system/widgets/glass_surface.dart';
import '../../services/glass_engine.dart';
import '../../services/settings_service.dart';

class GlassCustomizerScreen extends StatefulWidget {
  const GlassCustomizerScreen({super.key});

  @override
  State<GlassCustomizerScreen> createState() => _GlassCustomizerScreenState();
}

class _GlassCustomizerScreenState extends State<GlassCustomizerScreen>
    with SingleTickerProviderStateMixin {
  final _engine = GlassEngine.instance;
  final _settings = SettingsState.instance;
  late final AnimationController _drift =
      AnimationController(vsync: this, duration: const Duration(seconds: 8))..repeat();

  int _backdrop = 0; // 0 artwork, 1 dark, 2 light
  int _tab = 0;
  bool _liked = true;
  bool _playing = true;

  @override
  void initState() {
    super.initState();
    _engine.ensureLoaded();
  }

  @override
  void dispose() {
    _drift.dispose();
    super.dispose();
  }

  void _edit(GlassConfig Function(GlassConfig c) f) => _engine.update(f);

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([_engine, _settings]),
      builder: (context, _) {
        final c = _engine.config;
        final custom = c.preset == 'custom';
        return AMPage(
          title: 'Glass Style',
          children: [
            _preview(c),
            Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: AMSegmented<int>(
                options: const [(0, 'Artwork'), (1, 'Dark'), (2, 'Light')],
                value: _backdrop,
                onChanged: (v) => setState(() => _backdrop = v),
              ),
            ),
            AMSection(
              footer: 'Turn off for solid surfaces. Helps older devices stay smooth.',
              children: [
                AMSwitchRow(
                  title: 'Glass Effects',
                  value: _settings.glassEffects,
                  onChanged: _settings.setGlassEffects,
                ),
              ],
            ),
            AMSection(
              header: 'Material',
              footer: custom
                  ? 'Custom. Based on your adjustments below.'
                  : GlassPresets.byId(c.preset)?.blurb,
              bare: true,
              children: [
                LayoutBuilder(
                  builder: (context, box) {
                    final w = (box.maxWidth - 12) / 2;
                    return Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        for (final p in GlassPresets.all)
                          SizedBox(
                            width: w,
                            child: _PresetTile(
                              preset: p,
                              selected: c.preset == p.id,
                              onTap: () {
                                AM.tick();
                                _engine.apply(p.id);
                              },
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ],
            ),
            AMSection(
              header: 'Transparency',
              footer: 'Fluidity sets how clear the surface is. Blur diffuses what sits behind it.',
              children: [
                AMSliderRow(
                  title: 'Fluidity',
                  valueLabel: '${(c.fluidity * 100).round()}%',
                  value: c.fluidity,
                  onChanged: (v) => _edit((x) => x.copyWith(fluidity: v)),
                ),
                AMSliderRow(
                  title: 'Blur',
                  valueLabel: '${c.blur.round()} px',
                  value: c.blur,
                  max: 40,
                  onChanged: (v) => _edit((x) => x.copyWith(blur: v)),
                ),
                AMSliderRow(
                  title: 'Frost',
                  valueLabel: '${(c.frost * 100).round()}%',
                  value: c.frost,
                  onChanged: (v) => _edit((x) => x.copyWith(frost: v)),
                ),
                AMSliderRow(
                  title: 'Depth',
                  valueLabel: '${(c.depth * 100).round()}%',
                  value: c.depth,
                  onChanged: (v) => _edit((x) => x.copyWith(depth: v)),
                ),
              ],
            ),
            AMSection(
              header: 'Color',
              children: [
                _Swatches(
                  title: 'Base',
                  selected: c.base,
                  items: [
                    for (final e in GlassPalette.bases.entries)
                      _Swatch(e.key, e.value.label, color: e.value.color),
                  ],
                  onSelect: (id) => _edit((x) => x.copyWith(base: id)),
                ),
                _Swatches(
                  title: 'Tint',
                  selected: c.tint,
                  items: [
                    for (final e in GlassPalette.tints.entries)
                      _Swatch(
                        e.key,
                        e.value.label,
                        color: e.value.color,
                        gradient: e.key == 'aurora',
                        none: e.key == 'none',
                      ),
                  ],
                  onSelect: (id) => _edit((x) => x.copyWith(tint: id)),
                ),
                AMCollapse(
                  show: c.tint != 'none',
                  child: AMSliderRow(
                    title: 'Tint Strength',
                    valueLabel: '${(c.tintStrength * 100).round()}%',
                    value: c.tintStrength,
                    onChanged: (v) => _edit((x) => x.copyWith(tintStrength: v)),
                  ),
                ),
              ],
            ),
            AMSection(
              header: 'Light & Edges',
              footer: 'Prism splits light into a rainbow along the edge. Light direction moves the highlight.',
              children: [
                AMSwitchRow(
                  title: 'Specular Edge',
                  subtitle: 'Bright rim where light catches the glass',
                  value: c.rim,
                  onChanged: (v) => _edit((x) => x.copyWith(rim: v)),
                ),
                AMCollapse(
                  show: c.rim,
                  child: AMSliderRow(
                    title: 'Edge Intensity',
                    valueLabel: '${(c.rimStrength * 100).round()}%',
                    value: c.rimStrength,
                    onChanged: (v) => _edit((x) => x.copyWith(rimStrength: v)),
                  ),
                ),
                AMSliderRow(
                  title: 'Light Direction',
                  valueLabel: '${c.lightAngle.round()}°',
                  value: c.lightAngle,
                  max: 360,
                  onChanged: (v) => _edit((x) => x.copyWith(lightAngle: v)),
                ),
                AMSliderRow(
                  title: 'Prism Dispersion',
                  valueLabel: '${(c.prism * 100).round()}%',
                  value: c.prism,
                  onChanged: (v) => _edit((x) => x.copyWith(prism: v)),
                ),
              ],
            ),
            AMSection(
              header: 'Motion',
              footer: 'Shimmer sweeps light across the surface. Flow drifts colour behind it. '
                  'Motion pauses when Reduce Motion is on.',
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: AMSegmented<GlassMotion>(
                    trackColor: AM.cardHi,
                    options: const [
                      (GlassMotion.still, 'Still'),
                      (GlassMotion.shimmer, 'Shimmer'),
                      (GlassMotion.flow, 'Flow'),
                    ],
                    value: c.motion,
                    onChanged: (v) => _edit((x) => x.copyWith(motion: v)),
                  ),
                ),
                AMCollapse(
                  show: c.motion != GlassMotion.still,
                  child: AMSliderRow(
                    title: 'Speed',
                    valueLabel: '${c.speed.toStringAsFixed(1)}×',
                    value: c.speed,
                    min: 0.25,
                    max: 2.5,
                    onChanged: (v) => _edit((x) => x.copyWith(speed: v)),
                  ),
                ),
              ],
            ),
            AMSection(
              children: [
                AMRow(
                  title: 'Reset Glass Style',
                  titleColor: AM.rose,
                  onTap: () {
                    _engine.reset();
                    appleToast(context, 'Reset to Liquid Glass', icon: CupertinoIcons.arrow_counterclockwise);
                  },
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  // ───────────────────────── live preview ─────────────────────────
  Widget _preview(GlassConfig c) {
    final ink = GlassPalette.isLight(c.base) ? Colors.black : Colors.white;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          children: [
            Positioned.fill(child: _backdropLayer()),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  _island(ink),
                  const SizedBox(height: 14),
                  _miniPlayer(ink),
                  const SizedBox(height: 14),
                  _dock(ink),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _backdropLayer() {
    final light = _backdrop == 2;
    return AnimatedContainer(
      duration: AM.dur(400),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: switch (_backdrop) {
            0 => const [Color(0xFF500724), Color(0xFF831843), Color(0xFF312E81), Color(0xFF1E1B4B)],
            1 => const [Color(0xFF141418), Color(0xFF0C0C0E)],
            _ => const [Color(0xFFF2F2F7), Color(0xFFFFD6DC)],
          },
        ),
      ),
      child: AnimatedBuilder(
        animation: _drift,
        builder: (context, _) {
          final t = _drift.value * 2 * math.pi;
          return Stack(
            children: [
              if (_backdrop == 1)
                Positioned.fill(child: CustomPaint(painter: _StripesPainter()))
              else ...[
                Positioned(
                  left: 20 + 50 * math.sin(t),
                  top: 24 + 30 * math.cos(t),
                  child: _orb(150, GlassPalette.rose.withValues(alpha: light ? 0.5 : 0.5)),
                ),
                Positioned(
                  right: 10 + 40 * math.cos(t),
                  bottom: 10 + 26 * math.sin(t),
                  child: _orb(130, const Color(0xFF38BDF8).withValues(alpha: light ? 0.45 : 0.38)),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _orb(double d, Color c) =>
      Container(width: d, height: d, decoration: BoxDecoration(shape: BoxShape.circle, color: c));

  Widget _circleButton(IconData icon, Color ink, {VoidCallback? onTap, Color? color}) {
    return AMTap(
      onTap: onTap,
      child: GlassSurface(
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(width: 36, height: 36, child: Icon(icon, size: 18, color: color ?? ink)),
      ),
    );
  }

  Widget _island(Color ink) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _circleButton(CupertinoIcons.chevron_back, ink),
        GlassSurface(
          borderRadius: BorderRadius.circular(20),
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimatedBuilder(
                  animation: _drift,
                  builder: (context, _) => Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (var i = 0; i < 3; i++)
                        Container(
                          width: 2.4,
                          height: 5 + 9 * (math.sin(_drift.value * 2 * math.pi * 6 + i * 1.5) + 1) / 2,
                          margin: const EdgeInsets.symmetric(horizontal: 1),
                          decoration: BoxDecoration(
                            color: AM.rose,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text('Hukum · Anirudh',
                    style: TextStyle(color: ink, fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(
                    color: ink.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text('LOSSLESS',
                      style: TextStyle(color: ink.withValues(alpha: 0.7), fontSize: 8, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
        ),
        _circleButton(CupertinoIcons.ellipsis, ink),
      ],
    );
  }

  Widget _miniPlayer(Color ink) {
    return GlassSurface(
      borderRadius: BorderRadius.circular(18),
      child: Container(
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                gradient: const LinearGradient(colors: [Color(0xFF9E2339), AM.rose]),
              ),
              child: const Icon(CupertinoIcons.music_note, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Hukum',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: ink, fontSize: 14, fontWeight: FontWeight.w600)),
                  Text('Jailer',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: ink.withValues(alpha: 0.6), fontSize: 12)),
                ],
              ),
            ),
            AMTap(
              onTap: () => setState(() => _liked = !_liked),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Icon(
                  _liked ? CupertinoIcons.star_fill : CupertinoIcons.star,
                  size: 19,
                  color: _liked ? AM.rose : ink,
                ),
              ),
            ),
            AMTap(
              onTap: () => setState(() => _playing = !_playing),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Icon(
                  _playing ? CupertinoIcons.pause_fill : CupertinoIcons.play_fill,
                  size: 21,
                  color: ink,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dock(Color ink) {
    const tabs = [
      (CupertinoIcons.house_fill, 'Home'),
      (CupertinoIcons.square_grid_2x2_fill, 'Explore'),
      (CupertinoIcons.music_albums_fill, 'Library'),
    ];
    return Row(
      children: [
        Expanded(
          child: GlassSurface(
            borderRadius: BorderRadius.circular(26),
            child: SizedBox(
              height: 52,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  for (var i = 0; i < tabs.length; i++)
                    AMTap(
                      onTap: () => setState(() => _tab = i),
                      child: TweenAnimationBuilder<Color?>(
                        tween: ColorTween(end: _tab == i ? AM.rose : ink.withValues(alpha: 0.55)),
                        duration: AM.dur(240),
                        builder: (context, color, _) => Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(tabs[i].$1, size: 20, color: color),
                            const SizedBox(height: 2),
                            Text(tabs[i].$2, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        GlassSurface(
          borderRadius: BorderRadius.circular(26),
          child: SizedBox(width: 52, height: 52, child: Icon(CupertinoIcons.search, size: 20, color: ink)),
        ),
      ],
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
class _StripesPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.white.withValues(alpha: 0.07)
      ..strokeWidth = 2;
    for (double x = -size.height; x < size.width; x += 18) {
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

/// Live preview of one material: the real glass renderer over a small scene.
class _PresetTile extends StatelessWidget {
  const _PresetTile({required this.preset, required this.selected, required this.onTap});
  final GlassPreset preset;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ink = GlassPalette.isLight(preset.config.base) ? Colors.black : Colors.white;
    return AMTap(
      onTap: onTap,
      scale: 0.96,
      child: AnimatedContainer(
        duration: AM.dur(240),
        curve: Curves.easeOutCubic,
        decoration: BoxDecoration(
          color: AM.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: selected ? AM.rose : Colors.transparent, width: 2),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 76,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF831843), Color(0xFF312E81), Color(0xFF0E7490)],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: -10,
                    top: -14,
                    child: Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: GlassPalette.rose.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                  GlassSurface(
                    config: preset.config,
                    borderRadius: BorderRadius.circular(14),
                    child: SizedBox(
                      width: 88,
                      height: 36,
                      child: Icon(CupertinoIcons.music_note_2, size: 16, color: ink),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      preset.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AM.label, fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                  ),
                  AnimatedOpacity(
                    opacity: selected ? 1 : 0,
                    duration: AM.dur(200),
                    child: const Icon(CupertinoIcons.checkmark_circle_fill, size: 17, color: AM.rose),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Swatch {
  const _Swatch(this.id, this.label, {this.color, this.gradient = false, this.none = false});
  final String id;
  final String label;
  final Color? color;
  final bool gradient;
  final bool none;
}

class _Swatches extends StatelessWidget {
  const _Swatches({
    required this.title,
    required this.items,
    required this.selected,
    required this.onSelect,
  });

  final String title;
  final List<_Swatch> items;
  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 13, 0, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(title, style: AM.rowTitle),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                for (final s in items)
                  Padding(
                    padding: const EdgeInsets.only(right: 14),
                    child: AMTap(
                      onTap: () {
                        AM.tick();
                        onSelect(s.id);
                      },
                      child: Column(
                        children: [
                          AnimatedContainer(
                            duration: AM.dur(220),
                            curve: Curves.easeOutCubic,
                            width: 40,
                            height: 40,
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: selected == s.id ? AM.rose : AM.sep,
                                width: selected == s.id ? 2 : 1,
                              ),
                            ),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: s.gradient ? null : (s.color ?? AM.cardHi),
                                gradient: s.gradient
                                    ? const SweepGradient(colors: [
                                        Color(0xFFFA2D48),
                                        Color(0xFFBF5AF2),
                                        Color(0xFF38BDF8),
                                        Color(0xFFFA2D48),
                                      ])
                                    : null,
                              ),
                              child: s.none
                                  ? const Icon(CupertinoIcons.nosign, size: 16, color: AM.label2)
                                  : null,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            s.label,
                            style: TextStyle(
                              fontSize: 11,
                              color: selected == s.id ? AM.label : AM.label2,
                              fontWeight: selected == s.id ? FontWeight.w600 : FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
