// lib/services/innertube_transport.dart
//
// One place that owns every request to music.youtube.com made from the phone.
//
// Goals (in priority order):
//  1. Send as FEW requests as possible: TTL cache + in-flight de-duplication.
//  2. Never hammer: token-bucket pacing, exponential backoff with jitter,
//     Retry-After support, and a circuit breaker that stops all traffic for a
//     cool-down after repeated 429/403/5xx instead of retrying into a ban.
//  3. Stay usable when blocked: stale-if-error serves the last good response.
//
// Each user's phone talks from its own IP, so the load that matters is the
// load of ONE device. Keep it low and polite.

import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io' show HandshakeException, SocketException;
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class InnerTubeException implements Exception {
  InnerTubeException(this.statusCode, [this.message, this.rateLimited = false]);

  final int statusCode;
  final String? message;

  /// True for 429/403 and for "cooling down" (breaker open). Callers should
  /// NOT fail over to another YouTube-hitting path when this is true.
  final bool rateLimited;

  @override
  String toString() =>
      'InnerTubeException($statusCode): ${message ?? "Request failed"}';
}

class InnerTubeTransport {
  InnerTubeTransport._();
  static final InnerTubeTransport instance = InnerTubeTransport._();

  // ---- Client configuration: change here when upstream changes ----------
  static const String hl = 'en';
  static const String _clientName = 'WEB_REMIX';
  static const String _origin = 'https://music.youtube.com';
  static const String _userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  static const String _visitorPref = 'zenify_yt_visitor_data';

  // ---- Politeness knobs ---------------------------------------------------
  static const Duration _timeout = Duration(seconds: 12);
  static const int _maxAttempts = 3;

  final http.Client _http = http.Client();
  final _TokenBucket _bucket = _TokenBucket(capacity: 6, refillPerSecond: 2.5);
  final _Breaker _breaker = _Breaker();
  final _TtlCache _cache = _TtlCache(maxEntries: 200);
  final Map<String, Future<Map<String, dynamic>>> _inflight = {};
  final math.Random _rng = math.Random();

  String? _visitorData;
  Future<void>? _init;

  /// True while the breaker is open. UI can show a soft "try again shortly".
  bool get coolingDown => _breaker.open;
  Duration get cooldownRemaining => _breaker.remaining;

  void clearCache() {
    _cache.clear();
    _breaker.success();
  }

  Future<void> _ensureInit() => _init ??= () async {
        try {
          final prefs = await SharedPreferences.getInstance();
          _visitorData = prefs.getString(_visitorPref);
        } catch (_) {}
      }();

  static const String _clientVersion = '1.20241101.01.00';

  Map<String, dynamic> _payload(Map<String, dynamic> body, String gl) => {
        'context': {
          'client': {
            'clientName': _clientName,
            'clientVersion': _clientVersion,
            'hl': hl,
            'gl': gl,
            if (_visitorData != null) 'visitorData': _visitorData,
          },
        },
        ...body,
      };

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Origin': _origin,
        'Referer': '$_origin/',
        'User-Agent': _userAgent,
        'X-Goog-Visitor-Id': ?_visitorData,
      };

  /// POST to /youtubei/v1/[endpoint].
  ///
  /// [ttl] > 0 enables caching + dedupe of identical requests (same endpoint,
  /// body and country). Use it for everything that is not a user action.
  Future<Map<String, dynamic>> post(
    String endpoint,
    Map<String, dynamic> body, {
    required String gl,
    Duration ttl = Duration.zero,
    bool forceRefresh = false,
  }) async {
    await _ensureInit();
    final key = '$gl|$endpoint|${jsonEncode(body)}';

    if (!forceRefresh && ttl > Duration.zero) {
      final hit = _cache.get(key);
      if (hit != null) return hit;
    }

    final running = _inflight[key];
    if (running != null) return running;

    final future = _execute(endpoint, body, gl, key, ttl)
        .whenComplete(() => _inflight.remove(key));
    _inflight[key] = future;
    return future;
  }

  Future<Map<String, dynamic>> _execute(
    String endpoint,
    Map<String, dynamic> body,
    String gl,
    String key,
    Duration ttl,
  ) async {
    if (_breaker.open) {
      final stale = _cache.get(key, allowStale: true);
      if (stale != null) return stale;
      throw InnerTubeException(
          429, 'Cooling down for ${_breaker.remaining.inSeconds}s', true);
    }

    InnerTubeException? last;

    for (var attempt = 0; attempt < _maxAttempts; attempt++) {
      await _bucket.acquire();
      try {
        final res = await _http
            .post(
              Uri.parse('$_origin/youtubei/v1/$endpoint?prettyPrint=false'),
              headers: _headers,
              body: jsonEncode(_payload(body, gl)),
            )
            .timeout(_timeout);

        final code = res.statusCode;
        if (kDebugMode) {
          debugPrint('[IT] $endpoint gl=$gl status=$code attempt=$attempt');
        }

        if (code == 200) {
          final Map<String, dynamic> json;
          try {
            json = jsonDecode(utf8.decode(res.bodyBytes))
                as Map<String, dynamic>;
          } catch (_) {
            throw InnerTubeException(200, 'Unexpected response format');
          }
          _breaker.success();
          _learnVisitor(json);
          if (ttl > Duration.zero) _cache.put(key, json, ttl);
          return json;
        }

        if (code == 429 || code == 403) {
          // Being asked to slow down or being blocked: back off hard.
          _breaker.failure(hard: true);
          last = InnerTubeException(code, _snippet(res.body), true);
          if (code == 403) break; // retrying a block only makes it worse
          final wait = _retryAfter(res) ?? _backoff(attempt);
          if (attempt < _maxAttempts - 1 && wait.inSeconds <= 20) {
            await Future<void>.delayed(wait);
            continue;
          }
          break;
        }

        if (code >= 500) {
          _breaker.failure();
          last = InnerTubeException(code, _snippet(res.body));
          if (attempt < _maxAttempts - 1) {
            await Future<void>.delayed(_backoff(attempt));
            continue;
          }
          break;
        }

        // Other 4xx: our request is wrong; retrying will not help and it is
        // not a sign we are being throttled.
        throw InnerTubeException(code, _snippet(res.body));
      } on Exception catch (e) {
        if (e is InnerTubeException) rethrow;
        final transient = e is TimeoutException ||
            e is SocketException ||
            e is HandshakeException ||
            e is http.ClientException;
        if (!transient) rethrow;
        _breaker.failure();
        last = InnerTubeException(0, e.toString());
        if (attempt < _maxAttempts - 1) {
          await Future<void>.delayed(_backoff(attempt));
          continue;
        }
      }
    }

    final stale = _cache.get(key, allowStale: true);
    if (stale != null) {
      if (kDebugMode) debugPrint('[InnerTube] serving stale for $endpoint');
      return stale;
    }
    throw last ?? InnerTubeException(0, 'Request failed');
  }

  void _learnVisitor(Map<String, dynamic> json) {
    final v = (json['responseContext'] as Map?)?['visitorData'];
    if (v is String && v.isNotEmpty && v != _visitorData) {
      _visitorData = v;
      SharedPreferences.getInstance()
          .then((p) => p.setString(_visitorPref, v))
          .catchError((_) => false);
    }
  }

  Duration _backoff(int attempt) => Duration(
        milliseconds:
            (600 * math.pow(2, attempt)).round() + _rng.nextInt(400),
      );

  Duration? _retryAfter(http.Response r) {
    final secs = int.tryParse(r.headers['retry-after'] ?? '');
    return secs == null ? null : Duration(seconds: secs.clamp(1, 30).toInt());
  }

  String _snippet(String body) =>
      body.length > 200 ? '${body.substring(0, 200)}…' : body;
}

// ---------------------------------------------------------------------------
// Pacing: a small burst is allowed, then requests are spread out.
// ---------------------------------------------------------------------------

class _TokenBucket {
  _TokenBucket({required this.capacity, required this.refillPerSecond})
      : _tokens = capacity.toDouble();

  final int capacity;
  final double refillPerSecond;
  double _tokens;
  DateTime _last = DateTime.now();

  Future<void> acquire() async {
    while (true) {
      final now = DateTime.now();
      _tokens = math.min(
        capacity.toDouble(),
        _tokens + now.difference(_last).inMicroseconds / 1e6 * refillPerSecond,
      );
      _last = now;
      if (_tokens >= 1) {
        _tokens -= 1;
        return;
      }
      final waitMs = ((1 - _tokens) / refillPerSecond * 1000).ceil();
      await Future<void>.delayed(Duration(milliseconds: waitMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker: after repeated failures, stop sending for a growing
// cool-down (30s, 60s, 2m, 4m, then 5m). One failed probe re-opens it.
// ---------------------------------------------------------------------------

class _Breaker {
  int _failures = 0;
  int _trips = 0;
  DateTime? _openUntil;

  bool get open => _openUntil != null && DateTime.now().isBefore(_openUntil!);

  Duration get remaining => open
      ? _openUntil!.difference(DateTime.now())
      : Duration.zero;

  void success() {
    _failures = 0;
    _trips = 0;
    _openUntil = null;
  }

  void failure({bool hard = false}) {
    _failures += hard ? 1 : 1;
    if (_failures >= 6) {
      _trips++;
      final secs = math.min(15, 3 * (1 << math.min(_trips, 3)));
      _openUntil = DateTime.now().add(Duration(seconds: secs));
      _failures = 4;
    }
  }
}

// ---------------------------------------------------------------------------
// LRU cache with a stale window, so a failed refresh can still serve the
// last good response.
// ---------------------------------------------------------------------------

class _CacheEntry {
  _CacheEntry(this.value, this.freshUntil, this.staleUntil);
  final Map<String, dynamic> value;
  final DateTime freshUntil;
  final DateTime staleUntil;
}

class _TtlCache {
  _TtlCache({required this.maxEntries});
  final int maxEntries;
  final LinkedHashMap<String, _CacheEntry> _m = LinkedHashMap();

  Map<String, dynamic>? get(String key, {bool allowStale = false}) {
    final e = _m[key];
    if (e == null) return null;
    final now = DateTime.now();
    if (!now.isBefore(e.staleUntil)) {
      _m.remove(key);
      return null;
    }
    if (now.isBefore(e.freshUntil) || allowStale) {
      _m.remove(key); // move to most-recent
      _m[key] = e;
      return e.value;
    }
    return null;
  }

  void put(String key, Map<String, dynamic> value, Duration ttl,
      {Duration staleFor = const Duration(hours: 6)}) {
    final now = DateTime.now();
    _m.remove(key);
    _m[key] = _CacheEntry(value, now.add(ttl), now.add(ttl + staleFor));
    while (_m.length > maxEntries) {
      _m.remove(_m.keys.first);
    }
  }

  void clear() => _m.clear();
}
