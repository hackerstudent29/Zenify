import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../domain/track_meta.dart';

/// Persistent store and in-memory cache for track metadata.
///
/// Features:
/// - O(1) in-memory fast lookups.
/// - Atomic file persistence (`track_meta_store.json`).
/// - Preloads curated seed metadata asset on first run without blocking.
/// - Extensible with background batch enrichment from backend.
class TrackMetaStore extends ChangeNotifier {
  TrackMetaStore._();
  static final TrackMetaStore instance = TrackMetaStore._();

  final Map<String, TrackMeta> _cache = {};
  File? _file;
  bool _initialized = false;
  bool _seedLoaded = false;
  int _version = 0;

  /// Monotonically increasing version counter to invalidate widgets when new metadata arrives.
  int get version => _version;

  /// Number of cached tracks in the store.
  int get count => _cache.length;

  /// True if the store is initialized.
  bool get isInitialized => _initialized;

  Future<void> init({String? storagePath, bool autoPreload = true}) async {
    if (_initialized) return;
    _initialized = true;

    try {
      if (storagePath != null) {
        _file = File(storagePath);
      } else {
        try {
          final docDir = await getApplicationDocumentsDirectory()
              .timeout(const Duration(milliseconds: 300));
          _file = File('${docDir.path}/track_meta_store.json');
        } catch (_) {
          _file = File('track_meta_store.json');
        }
      }

      if (await _file!.exists()) {
        final content = await _file!.readAsString();
        if (content.trim().isNotEmpty) {
          final decoded = jsonDecode(content);
          if (decoded is List) {
            for (final item in decoded) {
              if (item is Map<String, dynamic>) {
                final meta = TrackMeta.fromJson(item);
                _cache[meta.trackId] = meta;
              } else if (item is Map) {
                final meta = TrackMeta.fromJson(Map<String, dynamic>.from(item));
                _cache[meta.trackId] = meta;
              }
            }
          } else if (decoded is Map) {
            decoded.forEach((key, val) {
              if (val is Map) {
                final meta = TrackMeta.fromJson(Map<String, dynamic>.from(val));
                _cache[meta.trackId] = meta;
              }
            });
          }
        }
      }
    } catch (e) {
      debugPrint('[TrackMetaStore] Error initializing from file: $e');
    }

    // Auto-preload seed if store has fewer than 20 entries
    if (autoPreload && _cache.length < 20 && !_seedLoaded) {
      await preloadSeed();
    }
  }

  /// Preloads curated seed dataset from bundled asset or raw JSON string.
  Future<int> preloadSeed({
    String assetPath = 'assets/replay_track_meta_seed.json',
    String? rawJson,
    bool force = false,
  }) async {
    try {
      String jsonStr;
      if (rawJson != null) {
        jsonStr = rawJson;
      } else {
        try {
          jsonStr = await rootBundle.loadString(assetPath);
        } catch (_) {
          // If running in unit test or headless environment without rootBundle
          final file = File(assetPath);
          if (await file.exists()) {
            jsonStr = await file.readAsString();
          } else {
            return 0;
          }
        }
      }

      final decoded = jsonDecode(jsonStr);
      var added = 0;
      if (decoded is List) {
        for (final item in decoded) {
          if (item is Map) {
            final meta = TrackMeta.fromJson(Map<String, dynamic>.from(item));
            if (force || !_cache.containsKey(meta.trackId)) {
              _cache[meta.trackId] = meta;
              added++;
            }
          }
        }
      }

      _seedLoaded = true;
      if (added > 0) {
        _bump();
        await _persist();
      }
      return added;
    } catch (e) {
      debugPrint('[TrackMetaStore] Preload seed error: $e');
      return 0;
    }
  }

  /// Retrieves metadata for a single track ID.
  TrackMeta? get(String trackId) => _cache[trackId];

  /// Retrieves metadata for multiple track IDs.
  Map<String, TrackMeta> getBatch(List<String> trackIds) {
    final result = <String, TrackMeta>{};
    for (final id in trackIds) {
      final meta = _cache[id];
      if (meta != null) {
        result[id] = meta;
      }
    }
    return result;
  }

  /// Adds or updates a single track metadata record.
  Future<void> put(TrackMeta meta) async {
    _cache[meta.trackId] = meta;
    _bump();
    await _persist();
  }

  /// Adds or updates multiple track metadata records in one operation.
  Future<void> putBatch(List<TrackMeta> metas) async {
    if (metas.isEmpty) return;
    for (final m in metas) {
      _cache[m.trackId] = m;
    }
    _bump();
    await _persist();
  }

  /// Resets in-memory cache and initialization state without deleting the disk file.
  void resetMemoryForReload() {
    _cache.clear();
    _initialized = false;
    _seedLoaded = false;
  }

  /// Clears in-memory cache and deletes persistent file (useful for resetting between tests).
  Future<void> clearForTest() async {
    _cache.clear();
    _seedLoaded = false;
    _initialized = false;
    if (_file != null && await _file!.exists()) {
      await _file!.delete();
    }
    _file = null;
    _bump();
  }

  void _bump() {
    _version++;
    notifyListeners();
  }

  Future<void> _persist() async {
    if (_file == null) return;
    try {
      final parent = _file!.parent;
      if (!await parent.exists()) {
        await parent.create(recursive: true);
      }
      final tmp = File('${_file!.path}.tmp');
      final list = _cache.values.map((m) => m.toJson()).toList();
      await tmp.writeAsString(jsonEncode(list));
      if (await _file!.exists()) {
        await _file!.delete();
      }
      await tmp.rename(_file!.path);
    } catch (e) {
      debugPrint('[TrackMetaStore] Error persisting: $e');
    }
  }
}
