// mobile/lib/services/cache_migration.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter/services.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';
import 'artist_service.dart';
import 'innertube_service.dart';
import 'innertube_transport.dart';
import 'lyrics_service.dart';
import '../data/datasources/catalog_datasource.dart';
import '../views/explore/explore_data_service.dart';

const kCacheSchema = 3;

/// One-time cache wipe that runs at app start before any network call.
/// Idempotent: stores `cache_schema` in SharedPreferences.
Future<void> runCacheMigration() async {
  try {
    final p = await SharedPreferences.getInstance();
    final currentSchema = p.getInt('cache_schema') ?? 0;
    if (currentSchema >= kCacheSchema) return;

    if (kDebugMode) debugPrint('[CacheMigration] Running one-time migration (schema $kCacheSchema)...');

    // 1) Dart in-memory catalog, artist, explore & InnerTube caches + visitor data
    InnerTubeTransport.instance.clearCache();
    InnerTubeService.instance.clearCache();
    ArtistService.clearCache();
    ApiService.clearCache();
    ExploreDataService.instance.clearCache();
    CatalogDataSource.clear();
    await p.remove('zenify_yt_visitor_data');
    await p.remove('innertube_visitor_data');

    // Clear old cached songs/artists/recommendations/history/search caches (preserving user auth, prefs, FX & device ID)
    const exactCacheKeys = [
      'zenify_listening_history_v1',
      'zenify_artist_play_counts_v1',
      'zenify_recent_search_history_v2',
      'zenify_recent_search_history',
      'zenify_home_cache',
      'zenify_explore_cache',
      'zenify_recommendations_cache',
    ];
    for (final k in exactCacheKeys) {
      await p.remove(k);
    }

    // Remove any keys written by deleted stream resolvers, search caches, or legacy catalog caches
    final matchRegex = RegExp(
      r'stream|resolved|saavn|backend|cdn|zenify_search_|recommend|home_feed|explore_cache',
      caseSensitive: false,
    );
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

