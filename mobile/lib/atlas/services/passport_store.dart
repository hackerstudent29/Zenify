import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stamps collected by the user. Persisted locally; idempotent.
class PassportStore extends ChangeNotifier {
  PassportStore._();
  static final PassportStore instance = PassportStore._();

  static const _key = 'atlas.stamps.v1';

  final Map<String, DateTime> _stamps = {};
  bool _loaded = false;

  bool get loaded => _loaded;
  int get count => _stamps.length;

  /// City ids, newest first.
  List<String> get ids {
    final e = _stamps.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return [for (final x in e) x.key];
  }

  bool isStamped(String cityId) => _stamps.containsKey(cityId);

  Future<void> load() async {
    if (_loaded) return;
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw != null) {
        (jsonDecode(raw) as Map<String, dynamic>).forEach((k, v) {
          final d = DateTime.tryParse(v as String);
          if (d != null) _stamps[k] = d;
        });
      }
    } catch (_) {
      // Corrupt data must never crash the app; start clean.
    }
    _loaded = true;
    notifyListeners();
  }

  /// Returns true only when the stamp is new.
  Future<bool> stamp(String cityId) async {
    if (_stamps.containsKey(cityId)) return false;
    _stamps[cityId] = DateTime.now();
    notifyListeners();
    await _save();
    return true;
  }

  Future<void> clear() async {
    _stamps.clear();
    notifyListeners();
    await _save();
  }

  Future<void> _save() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _key,
        jsonEncode({
          for (final e in _stamps.entries) e.key: e.value.toIso8601String(),
        }),
      );
    } catch (_) {}
  }
}
