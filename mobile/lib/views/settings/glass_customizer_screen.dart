import 'package:flutter/cupertino.dart' show CupertinoIcons;
import 'package:flutter/material.dart';

import '../../design_system/widgets/apple_glass.dart';
import '../../services/dock_visibility.dart';

// ═════════════════════════════════════════════════════════════════════════════
//  GLASS STUDIO — the ONLY glass settings screen.
//  Live preview on real photos / text / colour / album grid, controls below.
//  Open with:  Navigator.push(context, MaterialPageRoute(builder: (_) => const LiquidGlassStudio()));
// ═════════════════════════════════════════════════════════════════════════════
class GlassCustomizerScreen extends StatelessWidget {
  const GlassCustomizerScreen({super.key});

  @override
  Widget build(BuildContext context) => const LiquidGlassStudio();
}

class LiquidGlassStudio extends StatefulWidget {
  const LiquidGlassStudio({super.key});

  @override
  State<LiquidGlassStudio> createState() => _LiquidGlassStudioState();
}

class _LiquidGlassStudioState extends State<LiquidGlassStudio>
    with HideDocksMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;

  final _ctl = LiquidGlassController.instance;
  int _bg = 0;
  int _tab = 0;

  static const _bgNames = ['Nature', 'City', 'Text', 'Albums'];
  static const _photos = [
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=70',
    'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=900&q=70',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Glass'),
        actions: [
          TextButton(
            onPressed: _ctl.reset,
            child: const Text('Reset', style: TextStyle(color: kAppleRed)),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: _ctl,
        builder: (context, _) {
          final c = _ctl.c;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
            children: [
              _preview(c),
              const SizedBox(height: 10),
              _bgChips(),
              const SizedBox(height: 18),
              _section('Material'),
              SegmentedButton<GlassMode>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: GlassMode.glass, label: Text('Glass')),
                  ButtonSegment(
                    value: GlassMode.solid,
                    label: Text('Static colour'),
                  ),
                ],
                selected: {c.mode},
                onSelectionChanged: (s) => _ctl.edit((c) => c.mode = s.first),
              ),
              const SizedBox(height: 16),
              if (c.isSolid) ..._solidControls(c) else ..._glassControls(c),
            ],
          );
        },
      ),
    );
  }

  // ── preview ───────────────────────────────────────────────────────────────
  Widget _preview(LiquidGlassConfig c) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: SizedBox(
          height: 380,
          child: Stack(
            fit: StackFit.expand,
            children: [
              _background(),
              Positioned(
                top: 16,
                left: 16,
                right: 16,
                child: AppleGlass(
                  borderRadius: BorderRadius.circular(24),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Container(
                          width: 46,
                          height: 46,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(10),
                            gradient: const LinearGradient(
                              colors: [kAppleRed, Color(0xFFBF5AF2)],
                            ),
                          ),
                          child: const Icon(
                            CupertinoIcons.music_note,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Liquid Glass',
                                style: TextStyle(
                                  color: c.foreground,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                'Background shows through',
                                style: TextStyle(
                                  color: c.foreground.withValues(alpha: .65),
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(CupertinoIcons.play_fill, color: c.foreground),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 110,
                left: 16,
                child: Row(
                  children: [
                    for (final ic in [
                      CupertinoIcons.heart_fill,
                      CupertinoIcons.share,
                      CupertinoIcons.ellipsis,
                    ])
                      Padding(
                        padding: const EdgeInsets.only(right: 10),
                        child: AppleGlass(
                          borderRadius: BorderRadius.circular(26),
                          interactive: true,
                          child: SizedBox(
                            width: 52,
                            height: 52,
                            child: Icon(ic, size: 22, color: c.foreground),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Positioned(
                left: 14,
                right: 14,
                bottom: 14,
                child: AppleDock(
                  index: _tab,
                  onSelect: (i) => setState(() => _tab = i),
                  onBack: () => setState(() => _tab = 0),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _background() {
    switch (_bg) {
      case 0:
      case 1:
        return Image.network(
          _photos[_bg],
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _gradientBg(),
          loadingBuilder: (_, child, p) => p == null ? child : _gradientBg(),
        );
      case 2:
        return _textBg();
      default:
        return _albumBg();
    }
  }

  Widget _gradientBg() => const DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF0A84FF), Color(0xFFBF5AF2), Color(0xFFFA2D48)],
      ),
    ),
  );

  Widget _textBg() {
    const lines = [
      ('Blur shows the words behind.', Color(0xFFFFD60A)),
      ('Frosted hides detail,', Color(0xFF63E6E2)),
      ('liquid keeps shapes and colour.', Color(0xFFFF9F0A)),
      ('Edges catch light.', Color(0xFFBF5AF2)),
      ('Move the sliders.', Color(0xFF30D158)),
      ('Watch this text change.', Color(0xFFFA2D48)),
    ];
    return Container(
      color: const Color(0xFF101014),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (t, col) in [...lines, ...lines])
            Text(
              t,
              maxLines: 1,
              style: TextStyle(
                color: col,
                fontSize: 30,
                height: 1.25,
                fontWeight: FontWeight.w800,
              ),
            ),
        ],
      ),
    );
  }

  Widget _albumBg() {
    const cols = [
      Color(0xFFFA2D48),
      Color(0xFF0A84FF),
      Color(0xFFFFD60A),
      Color(0xFF30D158),
      Color(0xFFBF5AF2),
      Color(0xFFFF9F0A),
      Color(0xFF63E6E2),
      Color(0xFFFF375F),
    ];
    return Container(
      color: Colors.black,
      padding: const EdgeInsets.all(8),
      child: GridView.count(
        physics: const NeverScrollableScrollPhysics(),
        crossAxisCount: 4,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        children: [
          for (int i = 0; i < 24; i++)
            DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [cols[i % 8], cols[(i * 3 + 2) % 8]],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _bgChips() {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _bgNames.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) => ChoiceChip(
          label: Text(_bgNames[i]),
          selected: _bg == i,
          showCheckmark: false,
          selectedColor: kAppleRed,
          backgroundColor: const Color(0xFF1C1C1E),
          labelStyle: const TextStyle(color: Colors.white),
          side: BorderSide.none,
          onSelected: (_) => setState(() => _bg = i),
        ),
      ),
    );
  }

  // ── controls ──────────────────────────────────────────────────────────────
  List<Widget> _solidControls(LiquidGlassConfig c) => [
    _section('Colour'),
    Row(
      children: [
        for (final e in GlassSolids.ids.entries)
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: _swatch(
              e.value.$2,
              e.value.$1,
              c.solidId == e.key,
              () => _ctl.edit((c) => c.solidId = e.key),
            ),
          ),
      ],
    ),
    const SizedBox(height: 16),
    _slider('Shadow', c.depth, 0, 1, (v) => _ctl.edit((c) => c.depth = v)),
  ];

  List<Widget> _glassControls(LiquidGlassConfig c) => [
    _section('Style'),
    Wrap(
      spacing: 8,
      children: [
        for (final p in const [
          ('liquid', 'Liquid'),
          ('clear', 'Clear'),
          ('frosted', 'Frosted'),
        ])
          ActionChip(
            label: Text(p.$2),
            backgroundColor: const Color(0xFF1C1C1E),
            labelStyle: const TextStyle(color: Colors.white),
            side: BorderSide.none,
            onPressed: () => _ctl.preset(p.$1),
          ),
      ],
    ),
    const SizedBox(height: 6),
    Row(
      children: [
        const Text('Frosted', style: _dim),
        Expanded(
          child: Slider(
            value: c.style,
            activeColor: kAppleRed,
            onChanged: _ctl.setStyle,
          ),
        ),
        const Text('Liquid', style: _dim),
      ],
    ),
    _section('Fine tune'),
    _slider('Blur', c.blur, 0, 40, (v) => _ctl.edit((c) => c.blur = v)),
    _slider(
      'Transparency',
      1 - c.opacity.clamp(0.0, 1.0),
      0,
      1,
      (v) => _ctl.edit((c) => c.opacity = 1 - v),
    ),
    _slider(
      'Saturation',
      c.saturation,
      1,
      2.4,
      (v) => _ctl.edit((c) => c.saturation = v),
    ),
    _slider(
      'Edge refraction',
      c.refraction,
      0,
      1,
      (v) => _ctl.edit((c) => c.refraction = v),
    ),
    _slider(
      'Edge light (0 = none)',
      c.rim,
      0,
      1,
      (v) => _ctl.edit((c) => c.rim = v),
    ),
    _slider('Shadow', c.depth, 0, 1, (v) => _ctl.edit((c) => c.depth = v)),
    _section('Glass tone'),
    SegmentedButton<GlassTone>(
      showSelectedIcon: false,
      segments: const [
        ButtonSegment(value: GlassTone.clear, label: Text('Clear')),
        ButtonSegment(value: GlassTone.dark, label: Text('Dark')),
        ButtonSegment(value: GlassTone.light, label: Text('Light')),
      ],
      selected: {c.tone},
      onSelectionChanged: (s) => _ctl.edit((c) => c.tone = s.first),
    ),
    _section('Tint'),
    Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        for (final e in GlassTints.ids.entries)
          _swatch(
            e.value.$2 ?? const Color(0xFF3A3A3C),
            e.value.$1,
            c.tintId == e.key,
            () => _ctl.edit((c) => c.tintId = e.key),
            none: e.value.$2 == null,
          ),
      ],
    ),
    if (c.tintId != 'none')
      _slider(
        'Tint strength',
        c.tintStrength,
        0,
        1,
        (v) => _ctl.edit((c) => c.tintStrength = v),
      ),
  ];

  static const _dim = TextStyle(color: Color(0x99FFFFFF), fontSize: 13);

  Widget _section(String t) => Padding(
    padding: const EdgeInsets.only(top: 12, bottom: 6),
    child: Text(
      t.toUpperCase(),
      style: const TextStyle(
        color: Color(0x80FFFFFF),
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: .6,
      ),
    ),
  );

  Widget _slider(
    String label,
    double v,
    double min,
    double max,
    ValueChanged<double> on,
  ) {
    return Row(
      children: [
        SizedBox(width: 130, child: Text(label, style: _dim)),
        Expanded(
          child: Slider(
            value: v.clamp(min, max),
            min: min,
            max: max,
            activeColor: kAppleRed,
            onChanged: on,
          ),
        ),
      ],
    );
  }

  Widget _swatch(
    Color col,
    String name,
    bool sel,
    VoidCallback tap, {
    bool none = false,
  }) {
    return GestureDetector(
      onTap: tap,
      child: Column(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: col,
              border: Border.all(
                color: sel ? Colors.white : const Color(0x33FFFFFF),
                width: sel ? 2.5 : 1,
              ),
            ),
            child: none
                ? const Icon(Icons.block, size: 18, color: Colors.white54)
                : null,
          ),
          const SizedBox(height: 4),
          Text(
            name,
            style: const TextStyle(color: Colors.white54, fontSize: 10),
          ),
        ],
      ),
    );
  }
}
