import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

typedef FxMap = Map<String, dynamic>;

/// Anything that can render the FX chain (the native Android engine, or a no-op).
abstract class FxEngine {
  bool get isAvailable;
  void applyFx(FxMap fx);
  Stream<List<double>> get spectrum;
}

class NullFxEngine implements FxEngine {
  @override
  bool get isAvailable => false;
  @override
  void applyFx(FxMap fx) {}
  @override
  Stream<List<double>> get spectrum => const Stream.empty();
}

const List<String> kFxChain = ['eq', 'filter', 'drive', 'chorus', 'echo', 'reverb'];

/// Same model as the web AudioFxSettings. `pitch` is derived: tape ? speed : 1.
const FxMap kFxDefaults = {
  'eq': [0.0, 0.0, 0.0],
  'reverb': 'none', // none | warehouse (small hall) | cathedral (church)
  'reverbAmount': 0.4,
  'echo': 0.0,
  'echoTime': 0.32,
  'chorus': 0.0,
  'filter': 0.0, // -1 low-pass .. 0 off .. +1 high-pass
  'drive': 0.0,
  'width': 1.0,
  'night': false,
  'vocalMode': 'off', // off | vocals | karaoke
  'vocalAmount': 0.85,
  'vocalFocus': 0.5,
  'chain': kFxChain,
  'is8D': false,
  'direction8D': 'clockwise',
  'speed8D': 0.15,
  'speed': 1.0,
  'tape': false,
  'bypass': false,
};

const List<String> kSoundKeys = [
  'eq', 'reverb', 'reverbAmount', 'echo', 'echoTime', 'chorus',
  'filter', 'drive', 'width', 'is8D', 'direction8D', 'speed8D',
];

FxMap _clone(FxMap m) => m.map((k, v) => MapEntry(k, v is List ? List<dynamic>.of(v) : v));

List<String> sanitizeChain(Object? input) {
  final out = <String>[];
  if (input is List) {
    for (final x in input) {
      if (x is String && kFxChain.contains(x) && !out.contains(x)) out.add(x);
    }
  }
  for (final x in kFxChain) {
    if (!out.contains(x)) out.add(x);
  }
  return out;
}

@immutable
class FxSettings {
  const FxSettings(this.m);
  factory FxSettings.defaults() => FxSettings(_clone(kFxDefaults));

  final FxMap m;

  FxSettings patch(FxMap p) {
    final n = _clone(m);
    p.forEach((k, v) {
      if (kFxDefaults.containsKey(k)) n[k] = v is List ? List<dynamic>.of(v) : v;
    });
    n['chain'] = sanitizeChain(n['chain']);
    return FxSettings(n);
  }

  double _d(String k) => (m[k] as num).toDouble();
  List<double> get eq => (m['eq'] as List).map((e) => (e as num).toDouble()).toList();
  String get reverb => m['reverb'] as String;
  double get reverbAmount => _d('reverbAmount');
  double get echo => _d('echo');
  double get echoTime => _d('echoTime');
  double get chorus => _d('chorus');
  double get filter => _d('filter');
  double get drive => _d('drive');
  double get width => _d('width');
  bool get night => m['night'] as bool;
  String get vocalMode => m['vocalMode'] as String;
  double get vocalAmount => _d('vocalAmount');
  double get vocalFocus => _d('vocalFocus');
  List<String> get chain => sanitizeChain(m['chain']);
  bool get is8D => m['is8D'] as bool;
  String get direction8D => m['direction8D'] as String;
  double get speed8D => _d('speed8D');
  double get speed => _d('speed');
  bool get tape => m['tape'] as bool;
  bool get bypass => m['bypass'] as bool;

  FxMap get sound => {for (final k in kSoundKeys) k: m[k] is List ? List<dynamic>.of(m[k] as List) : m[k]};

  /// Map sent to the native engine.
  FxMap toEngine() {
    final n = _clone(m);
    n['pitch'] = tape ? speed : 1.0;
    return n;
  }

  /// Canonical form of the "sound" so unused knobs never break preset matching.
  String canon() {
    double r(double v) => double.parse(v.toStringAsFixed(2));
    return jsonEncode({
      'eq': eq.map((v) => v.round()).toList(),
      'reverb': reverb,
      'reverbAmount': reverb == 'none' ? 0 : r(reverbAmount),
      'echo': r(echo),
      'echoTime': echo <= 0.001 ? 0 : r(echoTime),
      'chorus': r(chorus),
      'filter': r(filter),
      'drive': r(drive),
      'width': r(width),
      'is8D': is8D,
      'direction8D': is8D ? direction8D : 'clockwise',
      'speed8D': is8D ? r(speed8D) : 0,
    });
  }
}

class FxPreset {
  const FxPreset(this.name, this.blurb, this.sound);
  final String name;
  final String blurb;
  final FxMap sound;
}

class _Custom {
  _Custom(this.name, this.sound);
  final String name;
  final FxMap sound;
  FxMap toJson() => {'name': name, 'sound': sound};
}

class StudioFxState extends ChangeNotifier {
  static const int bandCount = 3;
  static const List<String> eqLabels = ['Bass', 'Mid', 'Treble'];
  static const List<String> eqSubLabels = ['110 Hz', '1.5 kHz', '8 kHz'];
  static const List<double> speedPresets = [0.75, 1.0, 1.25, 1.5];

  static const List<FxPreset> builtIn = [
    FxPreset('Original', 'No processing', {}),
    FxPreset('After Hours', 'Warm and soft', {
      'eq': [3.0, -1.0, -2.0], 'reverb': 'warehouse', 'reverbAmount': 0.25, 'chorus': 0.2, 'filter': -0.12, 'drive': 0.15,
    }),
    FxPreset('Immersive', '8D orbit, wide', {
      'eq': [2.0, 0.0, 2.0], 'reverb': 'warehouse', 'reverbAmount': 0.3, 'chorus': 0.25, 'width': 1.3, 'is8D': true, 'speed8D': 0.1,
    }),
    FxPreset('Studio Clarity', 'Balanced, crisp', {'eq': [-1.0, 2.0, 3.0]}),
    FxPreset('Headphones', 'Wide, intimate', {'eq': [2.0, 1.0, 1.0], 'chorus': 0.3, 'width': 1.35}),
    FxPreset('Bass Boost', 'Deep low end', {'eq': [7.0, 1.0, 2.0], 'drive': 0.2}),
    FxPreset('Vocal Boost', 'Voices up front', {'eq': [-2.0, 5.0, 2.0]}),
    FxPreset('Concert Hall', 'Live room feel', {'eq': [1.0, 0.0, 1.0], 'reverb': 'cathedral', 'reverbAmount': 0.4}),
    FxPreset('Lo-Fi', 'Dusty, mellow', {
      'eq': [3.0, 0.0, -3.0], 'filter': -0.3, 'chorus': 0.15, 'drive': 0.3, 'reverb': 'warehouse', 'reverbAmount': 0.2,
    }),
    FxPreset('Dream Echo', 'Floaty repeats', {
      'echo': 0.35, 'echoTime': 0.38, 'reverb': 'cathedral', 'reverbAmount': 0.25, 'chorus': 0.2,
    }),
  ];

  FxSettings _s = FxSettings.defaults();
  FxEngine? _engine;
  final List<_Custom> _custom = [];
  Timer? _saveTimer;

  FxSettings get settings => _s;
  FxEngine? get engine => _engine;

  // ---- lifecycle -----------------------------------------------------------
  Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final cur = p.getString('zenify_fx_current');
      if (cur != null) _s = FxSettings.defaults().patch(jsonDecode(cur) as FxMap);
      final list = p.getString('zenify_fx_presets');
      if (list != null) {
        _custom
          ..clear()
          ..addAll((jsonDecode(list) as List).map((e) => _Custom(e['name'] as String, Map<String, dynamic>.from(e['sound'] as Map))));
      }
    } catch (_) {}
    _push();
    notifyListeners();
  }

  void attachEngine(FxEngine engine) {
    _engine = engine;
    _push();
    notifyListeners();
  }

  void _push() => _engine?.applyFx(_s.toEngine());

  void _schedulePersist() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 400), () async {
      try {
        final p = await SharedPreferences.getInstance();
        await p.setString('zenify_fx_current', jsonEncode(_s.m));
        await p.setString('zenify_fx_presets', jsonEncode(_custom.map((c) => c.toJson()).toList()));
      } catch (_) {}
    });
  }

  // ---- live / commit -------------------------------------------------------
  /// While dragging: goes straight to the engine, no rebuilds, no disk writes.
  void live(FxMap patch) => _engine?.applyFx(_s.patch(patch).toEngine());

  /// On release or tap: engine + state + persistence.
  void commit(FxMap patch) {
    _s = _s.patch(patch);
    _push();
    notifyListeners();
    _schedulePersist();
  }

  // ---- presets -------------------------------------------------------------
  List<String> get presetNames => builtIn.map((p) => p.name).toList();
  List<String> get customPresetNames => _custom.map((c) => c.name).toList();

  FxMap _soundOf(String name) {
    for (final p in builtIn) {
      if (p.name == name) return FxSettings.defaults().patch(p.sound).sound;
    }
    for (final c in _custom) {
      if (c.name == name) return FxSettings.defaults().patch(c.sound).sound;
    }
    return const {};
  }

  bool isPresetActive(String name) {
    if (_s.bypass) return false;
    final target = _soundOf(name);
    if (target.isEmpty) return false;
    return FxSettings.defaults().patch(target).canon() == _s.canon();
  }

  String get activePreset {
    for (final n in [...presetNames, ...customPresetNames]) {
      if (isPresetActive(n)) return n;
    }
    return 'Custom';
  }

  void applyPreset(String name) {
    final s = _soundOf(name);
    if (s.isEmpty) return;
    commit({...s, 'bypass': false});
  }

  bool saveCustomPreset(String name) {
    final n = name.trim();
    if (n.isEmpty) return false;
    final i = _custom.indexWhere((c) => c.name == n);
    final entry = _Custom(n.length > 24 ? n.substring(0, 24) : n, _s.sound);
    if (i >= 0) {
      _custom[i] = entry;
    } else {
      _custom.add(entry);
    }
    notifyListeners();
    _schedulePersist();
    return true;
  }

  void deleteCustomPreset(String name) {
    _custom.removeWhere((c) => c.name == name);
    notifyListeners();
    _schedulePersist();
  }

  // ---- convenience (old API kept) -----------------------------------------
  bool get isBypassed => _s.bypass;
  List<double> get eqGains => _s.eq;
  void toggleBypass() => commit({'bypass': !_s.bypass});
  void setBypass(bool v) => commit({'bypass': v});
  void resetEq() => commit({'eq': [0.0, 0.0, 0.0]});
  void resetAll() => commit({...kFxDefaults});

  @override
  void dispose() {
    _saveTimer?.cancel();
    super.dispose();
  }
}
