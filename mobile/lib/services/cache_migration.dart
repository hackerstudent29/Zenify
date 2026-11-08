// mobile/lib/services/cache_migration.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter/services.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'innertube_transport.dart';
import 'lyrics_service.dart';

const kCacheSchema = 2;

/// One-time cache wipe that runs at app start before any network call.
/// Idempotent: stores `cache_schema` in SharedPreferences.
Future<void> runCacheMigration() async {
  try {
    final p = await SharedPreferences.getInstance();
    final currentSchema = p.getInt('cache_schema') ?? 0;
    if (currentSchema >= kCacheSchema) return;

    if (kDebugMode) debugPrint('[CacheMigration] Running one-time migration (schema $kCacheSchema)...');

    // 1) Dart in-memory + visitor data
    InnerTubeTransport.instance.clearCache();
    await p.remove('zenify_yt_visitor_data');
    await p.remove('innertube_visitor_data');

    // Remove any keys written by deleted stream resolvers / legacy backend client
    final matchRegex = RegExp(r'stream|resolved|saavn|backend|cdn', caseSensitive: false);
    for (final k in p.getKeys().where((k) => matchRegex.hasMatch(k)).toList()) {
      await p.remove(k);
    }

    // 2) Image caches
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    try {
      await DefaultCacheManager().emptyCache();
    } catch (_) {}

    // 3) Native ExoPlayer cache, stream URL cache & player config prefs
    try {
      await const MethodChannel('zenify/audio').invokeMethod('clearAllCaches');
    } catch (_) {}

    // 4) Purge stale plain (unsynced) lyrics so they can resolve to WBW/synced
    try {
      await LyricsService.instance.purgeUnsyncedCache();
    } catch (_) {}

    await p.setInt('cache_schema', kCacheSchema);
    if (kDebugMode) debugPrint('[CacheMigration] Cache migration completed successfully (schema $kCacheSchema).');
  } catch (e) {
    if (kDebugMode) debugPrint('[CacheMigration] Migration error: $e');
  }
}

