import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../domain/replay_aggregate.dart';
import '../domain/replay_period.dart';

/// Manages caching of Replay aggregates.
///
/// Rules:
/// - Closed periods (past weeks/months/years): Cached permanently on disk (immutable historical snapshots).
/// - Active open periods (current week/month): Cached in memory with a 5-minute TTL,
///   invalidated immediately when new events are logged or exclusions change.
class ReplayCacheManager {
  ReplayCacheManager._();
  static final ReplayCacheManager instance = ReplayCacheManager._();

  final Map<String, _MemoryCacheEntry> _activeMemoryCache = {};
  Directory? _cacheDir;
  int _lastExclusionVersion = 0;

  Future<void> init({Directory? cacheDir}) async {
    if (cacheDir != null) {
      _cacheDir = cacheDir;
    } else if (_cacheDir == null) {
      final docDir = await getApplicationDocumentsDirectory();
      _cacheDir = Directory('${docDir.path}/replay_cache');
    }
    if (_cacheDir != null && !await _cacheDir!.exists()) {
      await _cacheDir!.create(recursive: true);
    }
  }

  /// Retrieves a cached aggregate for [period] if valid.
  Future<ReplayAggregate?> get(ReplayPeriod period, {int exclusionVersion = 0}) async {
    final nowWall = DateTime.now().toUtc();
    final isClosed = period.isClosed(nowWall);

    // 1. Invalidate active memory cache if exclusions changed
    if (_lastExclusionVersion != exclusionVersion) {
      _lastExclusionVersion = exclusionVersion;
      _activeMemoryCache.clear();
    }

    // 2. Active open period: check memory cache with 5-minute TTL
    if (!isClosed) {
      final entry = _activeMemoryCache[period.key];
      if (entry != null && !entry.isExpired(const Duration(minutes: 5))) {
        return entry.aggregate;
      }
      return null;
    }

    // 3. Closed historical period: check disk cache first
    try {
      await init();
      if (_cacheDir == null) return null;
      final file = File('${_cacheDir!.path}/replay_cache_${period.key}.json');
      if (await file.exists()) {
        final entry = _activeMemoryCache[period.key];
        if (entry != null) return entry.aggregate;
        try {
          final content = await file.readAsString();
          final json = jsonDecode(content) as Map<String, dynamic>;
          final agg = ReplayAggregate.fromJson(json);
          _activeMemoryCache[period.key] = _MemoryCacheEntry(
            aggregate: agg,
            cachedAt: DateTime.now().toUtc(),
          );
          return agg;
        } catch (e) {
          debugPrint('[ReplayCacheManager] Corrupt disk cache for ${period.key}: $e');
        }
      }
    } catch (e) {
      debugPrint('[ReplayCacheManager] Error reading disk cache: $e');
    }

    return null;
  }

  /// Stores a computed aggregate in cache.
  Future<void> put(ReplayPeriod period, ReplayAggregate aggregate) async {
    final nowWall = DateTime.now().toUtc();
    final isClosed = period.isClosed(nowWall);

    // Always update in-memory cache
    _activeMemoryCache[period.key] = _MemoryCacheEntry(
      aggregate: aggregate,
      cachedAt: DateTime.now().toUtc(),
    );

    // If period is closed, persist permanently to disk as an immutable snapshot
    if (isClosed) {
      try {
        await init();
        if (_cacheDir == null) return;
        final file = File('${_cacheDir!.path}/replay_cache_${period.key}.json');
        final tmp = File('${file.path}.tmp');
        await tmp.writeAsString(jsonEncode(aggregate.toJson()));
        if (await file.exists()) {
          await file.delete();
        }
        await tmp.rename(file.path);
      } catch (e) {
        debugPrint('[ReplayCacheManager] Error writing disk cache: $e');
      }
    }
  }

  /// Manually invalidates the active period memory cache (called on new play event).
  void invalidateActivePeriod() {
    _activeMemoryCache.clear();
  }

  /// Clears all caches (useful for testing).
  Future<void> clearAll() async {
    _activeMemoryCache.clear();
    _lastExclusionVersion = 0;
    if (_cacheDir != null && await _cacheDir!.exists()) {
      await _cacheDir!.delete(recursive: true);
    }
  }
}

class _MemoryCacheEntry {
  _MemoryCacheEntry({required this.aggregate, required this.cachedAt});

  final ReplayAggregate aggregate;
  final DateTime cachedAt;

  bool isExpired(Duration ttl) =>
      DateTime.now().toUtc().difference(cachedAt) > ttl;
}
