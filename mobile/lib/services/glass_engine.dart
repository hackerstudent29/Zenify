import 'dart:async';
import 'dart:convert';
import 'dart:ui' show Color;

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'settings_service.dart';

enum GlassMotion { still, shimmer, flow }

/// Colour tables shared by the painter and the customizer UI.
abstract final class GlassPalette {
  static const rose = Color(0xFFFA2D48);

  static const bases = <String, ({String label, Color color})>{
    'default': (label: 'Default', color: Color(0xFF121216)),
    'black': (label: 'Black', color: Color(0xFF000000)),
    'grey': (label: 'Grey', color: Color(0xFF2C2C30)),
    'white': (label: 'White', color: Color(0xFFF2F2F7)),
    'crimson': (label: 'Wine', color: Color(0xFF2A0A14)),
    'midnight': (label: 'Midnight', color: Color(0xFF0B1226)),
  };

  static const tints = <String, ({String label, Color? color})>{
    'none': (label: 'None', color: null),
    'rose': (label: 'Rose', color: rose),
    'ocean': (label: 'Ocean', color: Color(0xFF38BDF8)),
    'violet': (label: 'Violet', color: Color(0xFFBF5AF2)),
    'emerald': (label: 'Emerald', color: Color(0xFF30D158)),
    'amber': (label: 'Amber', color: Color(0xFFFF9F0A)),
    'aurora': (label: 'Aurora', color: null),
  };

  static const aurora = [rose, Color(0xFFBF5AF2), Color(0xFF38BDF8)];
  static const spectrum = [
    rose,
    Color(0xFFFF9F0A),
    Color(0xFF30D158),
    Color(0xFF38BDF8),
    Color(0xFFBF5AF2),
    rose,
  ];

  static Color baseColor(String id) => (bases[id] ?? bases['default']!).color;
  static bool isLight(String id) => baseColor(id).computeLuminance() > 0.5;
}

@immutable
class GlassConfig {
  const GlassConfig({
    this.preset = 'liquid',
    this.fluidity = 1,
    this.blur = 18,
    this.frost = 0,
    this.depth = 0.6,
    this.base = 'default',
    this.tint = 'none',
    this.tintStrength = 0.5,
    this.rim = true,
    this.rimStrength = 0.8,
    this.lightAngle = 225,
    this.prism = 0.12,
    this.motion = GlassMotion.still,
    this.speed = 1,
  });

  final String preset;
  final double fluidity; // 0 solid … 1 clear
  final double blur; // px, 0…40
  final double frost; // white veil 0…1
  final double depth; // bevel / inner shading 0…1
  final String base;
  final String tint;
  final double tintStrength;
  final bool rim;
  final double rimStrength;
  final double lightAngle; // degrees, 225 = top-left
  final double prism; // rainbow dispersion on the edge 0…1
  final GlassMotion motion;
  final double speed;

  GlassConfig copyWith({
    String? preset,
    double? fluidity,
    double? blur,
    double? frost,
    double? depth,
    String? base,
    String? tint,
    double? tintStrength,
    bool? rim,
    double? rimStrength,
    double? lightAngle,
    double? prism,
    GlassMotion? motion,
    double? speed,
  }) =>
      GlassConfig(
        preset: preset ?? this.preset,
        fluidity: fluidity ?? this.fluidity,
        blur: blur ?? this.blur,
        frost: frost ?? this.frost,
        depth: depth ?? this.depth,
        base: base ?? this.base,
        tint: tint ?? this.tint,
        tintStrength: tintStrength ?? this.tintStrength,
        rim: rim ?? this.rim,
        rimStrength: rimStrength ?? this.rimStrength,
        lightAngle: lightAngle ?? this.lightAngle,
        prism: prism ?? this.prism,
        motion: motion ?? this.motion,
        speed: speed ?? this.speed,
      );

  Map<String, dynamic> toJson() => {
        'preset': preset,
        'fluidity': fluidity,
        'blur': blur,
        'frost': frost,
        'depth': depth,
        'base': base,
        'tint': tint,
        'tintStrength': tintStrength,
        'rim': rim,
        'rimStrength': rimStrength,
        'lightAngle': lightAngle,
        'prism': prism,
        'motion': motion.name,
        'speed': speed,
      };

  factory GlassConfig.fromJson(Map<String, dynamic> j) {
    const def = GlassConfig();
    double d(String k, double f, double lo, double hi) =>
        ((j[k] as num?)?.toDouble() ?? f).clamp(lo, hi).toDouble();
    return GlassConfig(
      preset: j['preset'] as String? ?? def.preset,
      fluidity: d('fluidity', def.fluidity, 0, 1),
      blur: d('blur', def.blur, 0, 40),
      frost: d('frost', def.frost, 0, 1),
      depth: d('depth', def.depth, 0, 1),
      base: GlassPalette.bases.containsKey(j['base']) ? j['base'] as String : def.base,
      tint: GlassPalette.tints.containsKey(j['tint']) ? j['tint'] as String : def.tint,
      tintStrength: d('tintStrength', def.tintStrength, 0, 1),
      rim: j['rim'] as bool? ?? def.rim,
      rimStrength: d('rimStrength', def.rimStrength, 0, 1),
      lightAngle: d('lightAngle', def.lightAngle, 0, 360),
      prism: d('prism', def.prism, 0, 1),
      motion: GlassMotion.values.asNameMap()[j['motion']] ?? def.motion,
      speed: d('speed', def.speed, 0.25, 2.5),
    );
  }
}

class GlassPreset {
  const GlassPreset(this.id, this.name, this.blurb, this.config);
  final String id;
  final String name;
  final String blurb;
  final GlassConfig config;
}

abstract final class GlassPresets {
  static const all = <GlassPreset>[
    GlassPreset(
      'liquid',
      'Liquid Glass',
      'Clear, bright edge, soft depth.',
      GlassConfig(preset: 'liquid'),
    ),
    GlassPreset(
      'prism',
      'Prism',
      'Rainbow dispersion on the edge with a travelling shimmer.',
      GlassConfig(
        preset: 'prism',
        fluidity: 0.9,
        blur: 14,
        depth: 0.5,
        prism: 1,
        rimStrength: 0.7,
        motion: GlassMotion.shimmer,
        speed: 1,
      ),
    ),
    GlassPreset(
      'aurora',
      'Aurora',
      'Slow drifting colour behind the glass.',
      GlassConfig(
        preset: 'aurora',
        fluidity: 0.85,
        blur: 24,
        tint: 'aurora',
        tintStrength: 0.6,
        prism: 0.35,
        motion: GlassMotion.flow,
        speed: 0.8,
      ),
    ),
    GlassPreset(
      'crystal',
      'Crystal',
      'Almost no blur, sharp specular edge.',
      GlassConfig(
        preset: 'crystal',
        fluidity: 0.97,
        blur: 6,
        frost: 0.05,
        depth: 0.8,
        rimStrength: 1,
        prism: 0.3,
      ),
    ),
    GlassPreset(
      'frosted',
      'Frosted',
      'Heavy diffusion with a soft white veil.',
      GlassConfig(
        preset: 'frosted',
        fluidity: 0.5,
        blur: 28,
        frost: 0.12,
        depth: 0.3,
        rimStrength: 0.4,
        prism: 0,
      ),
    ),
    GlassPreset(
      'midnight',
      'Midnight',
      'Deep blue smoked glass.',
      GlassConfig(
        preset: 'midnight',
        fluidity: 0.6,
        blur: 30,
        base: 'midnight',
        tint: 'ocean',
        tintStrength: 0.25,
        depth: 0.5,
        prism: 0.1,
      ),
    ),
    GlassPreset(
      'rose',
      'Rosé',
      'Warm wine tint with a rose glow.',
      GlassConfig(
        preset: 'rose',
        fluidity: 0.7,
        blur: 22,
        base: 'crimson',
        tint: 'rose',
        tintStrength: 0.55,
        prism: 0.2,
      ),
    ),
    GlassPreset(
      'porcelain',
      'Porcelain',
      'Light frosted glass.',
      GlassConfig(
        preset: 'porcelain',
        fluidity: 0.55,
        blur: 26,
        base: 'white',
        depth: 0.3,
        rimStrength: 0.5,
        prism: 0,
      ),
    ),
    GlassPreset(
      'grey',
      'Graphite',
      'Solid matte charcoal. No blur.',
      GlassConfig(
        preset: 'grey',
        fluidity: 0,
        blur: 0,
        base: 'grey',
        depth: 0.2,
        rimStrength: 0.3,
        prism: 0,
      ),
    ),
    GlassPreset(
      'black',
      'Obsidian',
      'Pure OLED black. No blur.',
      GlassConfig(
        preset: 'black',
        fluidity: 0,
        blur: 0,
        base: 'black',
        depth: 0,
        rimStrength: 0.2,
        prism: 0,
      ),
    ),
  ];

  static GlassPreset? byId(String id) {
    for (final p in all) {
      if (p.id == id) return p;
    }
    return null;
  }
}

/// Single source of truth for the glass look. Persists itself, drives one
/// shared animation clock (only while a moving surface is on screen) and
/// mirrors the basic values to the legacy [SettingsState] glass fields.
class GlassEngine extends ChangeNotifier {
  GlassEngine._() {
    SettingsState.instance.addListener(_syncTicker);
  }

  static final GlassEngine instance = GlassEngine._();
  static const _prefsKey = 'glass_engine_v2';

  GlassConfig _config = GlassPresets.all.first.config;
  GlassConfig get config => _config;
  String get presetName {
    final p = GlassPresets.byId(_config.preset);
    if (p != null) return p.name;
    switch (_config.preset) {
      case 'graphite':
        return 'Graphite';
      case 'obsidian':
        return 'Obsidian';
      case 'pearl':
        return 'Pearl';
      case 'water':
        return 'Water';
      case 'custom':
        return 'Custom';
      default:
        return _config.preset.isNotEmpty
            ? '${_config.preset[0].toUpperCase()}${_config.preset.substring(1)}'
            : 'Custom';
    }
  }

  /// Seconds since the clock started; painters repaint from this directly.
  final ValueNotifier<double> phase = ValueNotifier<double>(0);

  Future<void>? _loading;
  Ticker? _ticker;
  double _phaseBase = 0;
  int _motionUsers = 0;
  Timer? _flushTimer;

  Future<void> ensureLoaded() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefsKey);
      if (raw == null) return;
      _config = GlassConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      notifyListeners();
    } catch (_) {}
  }

  void apply(String presetId) {
    final p = GlassPresets.byId(presetId);
    if (p != null) _set(p.config);
  }

  /// Any manual tweak flips the preset to "custom".
  void update(GlassConfig Function(GlassConfig c) edit) =>
      _set(edit(_config).copyWith(preset: 'custom'));

  /// Set full config directly (e.g. from LiquidGlass customizer).
  void setConfig(GlassConfig c) => _set(c);

  void reset() => _set(GlassPresets.all.first.config);

  void _set(GlassConfig c) {
    _config = c;
    _mirrorLegacy();
    notifyListeners();
    _flushTimer?.cancel();
    _flushTimer = Timer(const Duration(milliseconds: 280), _flush);
  }

  Future<void> _flush() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode(_config.toJson()));
    } catch (_) {}
    _mirrorLegacy();
  }

  void _mirrorLegacy() {
    try {
      final s = SettingsState.instance;
      s.setGlassStyle(_config.preset);
      s.setGlassFluidity(_config.fluidity);
      s.setGlassBlur(_config.blur.clamp(0, 25).toDouble());
      s.setGlassSpecularRim(_config.rim);
      s.setGlassBaseColor(_config.base);
    } catch (_) {}
  }

  // ── motion clock ──────────────────────────────────────────────────────────
  void retainMotion() {
    _motionUsers++;
    _syncTicker();
  }

  void releaseMotion() {
    if (_motionUsers > 0) _motionUsers--;
    _syncTicker();
  }

  void _syncTicker() {
    final want = _motionUsers > 0 && !SettingsState.instance.reduceMotion;
    final t = _ticker ??= Ticker((elapsed) {
      phase.value = _phaseBase + elapsed.inMicroseconds / 1000000.0;
    });
    if (want && !t.isActive) {
      _phaseBase = phase.value;
      t.start();
    } else if (!want && t.isActive) {
      t.stop();
    }
  }
}
