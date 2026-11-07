// lib/services/remote_config_service.dart
//
// Data-only remote config. Never blocks startup, clamps every value, ignores
// unknown keys, and refuses version rollbacks. Starter implementation: the
// agent must wire InnerTubeTransport / ApiService / native ResolverPolicy to it.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

int _i(Map? m, String k, int def, int min, int max) {
  final v = m?[k];
  final n = v is num ? v.toInt() : def;
  return n.clamp(min, max).toInt();
}

double _d(Map? m, String k, double def, double min, double max) {
  final v = m?[k];
  final n = v is num ? v.toDouble() : def;
  return n.clamp(min, max).toDouble();
}

class RemoteConfig {
  const RemoteConfig({
    required this.version,
    required this.streamMode,
    required this.minAppVersion,
    required this.latestAppVersion,
    required this.updateUrl,
    required this.message,
    required this.preResolveCount,
    required this.maxConcurrentResolves,
    required this.urlSafetyMarginSec,
    required this.clientVersionOverride,
    required this.bucketCapacity,
    required this.refillPerSecond,
    required this.maxAttempts,
    required this.breakerThreshold,
    required this.breakerBaseCooldownSec,
    required this.breakerMaxCooldownSec,
    required this.ttlSec,
    required this.kill,
  });

  final int version;
  final String streamMode; // 'device' | 'cloud'
  final String? minAppVersion;
  final String? latestAppVersion;
  final String? updateUrl;
  final String? message;
  final int preResolveCount;
  final int maxConcurrentResolves;
  final int urlSafetyMarginSec;
  final String? clientVersionOverride;
  final int bucketCapacity;
  final double refillPerSecond;
  final int maxAttempts;
  final int breakerThreshold;
  final int breakerBaseCooldownSec;
  final int breakerMaxCooldownSec;
  final Map<String, int> ttlSec;
  final Map<String, bool> kill;

  Duration ttl(String key, Duration fallback) {
    final s = ttlSec[key];
    return s == null ? fallback : Duration(seconds: s);
  }

  bool killed(String key) => kill[key] ?? false;

  static const _ttlDefaults = {
    'search': 600, 'suggest': 300, 'home': 600, 'charts': 1800,
    'releases': 1800, 'artistCard': 86400, 'artistPage': 1800, 'next': 300,
  };
  static const _killKeys = [
    'cloudFallback', 'remoteSuggestions', 'charts', 'newReleases',
    'preResolve', 'homeFeed',
  ];

  factory RemoteConfig.defaults() => RemoteConfig.fromJson(const {});

  factory RemoteConfig.fromJson(Map<String, dynamic> j) {
    final res = j['resolver'] as Map?;
    final it = j['innertube'] as Map?;
    final ttl = j['cacheTtlSec'] as Map?;
    final ks = j['killSwitches'] as Map?;
    final mode = j['streamMode'] == 'cloud' ? 'cloud' : 'device';
    final cv = it?['clientVersion'];

    return RemoteConfig(
      version: _i(j, 'version', 0, 0, 1 << 30),
      streamMode: mode,
      minAppVersion: j['minAppVersion'] as String?,
      latestAppVersion: j['latestAppVersion'] as String?,
      updateUrl: (j['updateUrl'] is String &&
              (j['updateUrl'] as String).startsWith('https://'))
          ? j['updateUrl'] as String
          : null,
      message: j['message'] as String?,
      preResolveCount: _i(res, 'preResolveCount', 2, 0, 3),
      maxConcurrentResolves: _i(res, 'maxConcurrentResolves', 2, 1, 3),
      urlSafetyMarginSec: _i(res, 'urlSafetyMarginSec', 120, 30, 900),
      clientVersionOverride:
          (cv is String && RegExp(r'^[0-9.]{3,20}$').hasMatch(cv)) ? cv : null,
      bucketCapacity: _i(it, 'bucketCapacity', 6, 1, 10),
      refillPerSecond: _d(it, 'refillPerSecond', 2.5, 0.2, 4),
      maxAttempts: _i(it, 'maxAttempts', 3, 1, 4),
      breakerThreshold: _i(it, 'breakerThreshold', 4, 2, 10),
      breakerBaseCooldownSec: _i(it, 'breakerBaseCooldownSec', 15, 10, 120),
      breakerMaxCooldownSec: _i(it, 'breakerMaxCooldownSec', 300, 60, 1800),
      ttlSec: {
        for (final e in _ttlDefaults.entries)
          e.key: _i(ttl, e.key, e.value, 30, 7 * 86400),
      },
      kill: {for (final k in _killKeys) k: ks?[k] == true},
    );
  }
}

/// Semantic version compare: returns <0, 0, >0.
int compareVersions(String a, String b) {
  List<int> parse(String v) =>
      v.split('+').first.split('.').map((p) => int.tryParse(p) ?? 0).toList();
  final x = parse(a), y = parse(b);
  for (var i = 0; i < 3; i++) {
    final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
    if (d != 0) return d;
  }
  return 0;
}

class RemoteConfigService {
  RemoteConfigService._();
  static final RemoteConfigService instance = RemoteConfigService._();

  static const _url = String.fromEnvironment('ZENIFY_CONFIG_URL');
  static const _prefBody = 'zenify_remote_config_body';
  static const _prefEtag = 'zenify_remote_config_etag';
  static const _prefAt = 'zenify_remote_config_at';
  static const _minRefresh = Duration(hours: 6);

  final ValueNotifier<RemoteConfig> notifier =
      ValueNotifier(RemoteConfig.defaults());

  RemoteConfig get current => notifier.value;
  bool killed(String key) => current.killed(key);

  /// Loads the cached copy synchronously-fast, then refreshes in background.
  Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final body = prefs.getString(_prefBody);
      if (body != null) {
        notifier.value =
            RemoteConfig.fromJson(jsonDecode(body) as Map<String, dynamic>);
      }
    } catch (_) {}
    unawaited(refresh());
  }

  /// Call on app resume; throttled to once per 6 hours unless [force].
  Future<void> refresh({bool force = false}) async {
    if (_url.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final last = prefs.getInt(_prefAt) ?? 0;
      final age = DateTime.now().millisecondsSinceEpoch - last;
      if (!force && age < _minRefresh.inMilliseconds) return;

      final etag = prefs.getString(_prefEtag);
      final res = await http.get(Uri.parse(_url), headers: {
        'Accept': 'application/json',
        if (etag != null) 'If-None-Match': etag,
      }).timeout(const Duration(seconds: 5));

      await prefs.setInt(_prefAt, DateTime.now().millisecondsSinceEpoch);
      if (res.statusCode == 304) return;
      if (res.statusCode != 200) return;

      final json = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      final next = RemoteConfig.fromJson(json);
      if (next.version < current.version) return; // no rollback

      notifier.value = next;
      await prefs.setString(_prefBody, jsonEncode(json));
      final newEtag = res.headers['etag'];
      if (newEtag != null) await prefs.setString(_prefEtag, newEtag);
    } catch (e) {
      if (kDebugMode) debugPrint('[RemoteConfig] refresh failed: $e');
    }
  }

  /// null = up to date, 'soft' = new version available, 'hard' = below minimum.
  String? updateState(String appVersion) {
    final c = current;
    if (c.minAppVersion != null && compareVersions(appVersion, c.minAppVersion!) < 0) {
      return 'hard';
    }
    if (c.latestAppVersion != null && compareVersions(appVersion, c.latestAppVersion!) < 0) {
      return 'soft';
    }
    return null;
  }
}
