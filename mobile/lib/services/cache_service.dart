import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/datasources/catalog_datasource.dart';
import '../views/explore/explore_data_service.dart';
import '../views/search/search_data_service.dart';
import 'api_service.dart';
import 'artist_service.dart';
import 'innertube_service.dart';
import 'listening_history_service.dart';
import 'lyrics_service.dart';
import 'stream_resolver_service.dart';

class CacheService {
  CacheService._();

  /// Completely clears all in-memory, disk image, lyrics, recommendation, and metadata
  /// caches while strictly preserving user accounts, tokens, and saved libraries.
  static Future<void> clearAllMediaAndArtworkCache() async {
    // 1. Clear in-memory service caches
    ArtistService.clearCache();
    ApiService.clearCache();
    InnerTubeService.instance.clearCache();
    ExploreDataService.instance.clearCache();
    CatalogDataSource.clear();
    StreamResolverService.instance.clearCache();

    // 2. Clear all cached lyrics (both in-memory and SharedPreferences)
    try {
      await LyricsService.instance.clearAllLyricsCache();
    } catch (_) {}

    // 3. Clear disk image caches (cached_network_image / flutter_cache_manager)
    try {
      await DefaultCacheManager().emptyCache();
    } catch (_) {}

    // 4. Clear Flutter in-memory decoded image cache
    try {
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    } catch (_) {}

    // 5. Clear search recents & listening/recommendation/stream history caches
    try {
      await SearchDataService.instance.clearRecents();
      await ListeningHistoryService.instance.clearHistory();
      final prefs = await SharedPreferences.getInstance();
      final staleKeys = prefs.getKeys().where((k) =>
          k.startsWith('zenify_search_') ||
          k.startsWith('lyrics_cache_') ||
          k.startsWith('stream_cache_') ||
          k.contains('recommend') ||
          k.contains('explore_cache') ||
          k.contains('home_feed') ||
          k.contains('resolved_stream'));
      for (final k in staleKeys.toList()) {
        await prefs.remove(k);
      }
    } catch (_) {}

    // 6. Re-initialize fresh HD catalog from YouTube Music InnerTube
    try {
      await CatalogDataSource.initialize();
    } catch (_) {}
  }
}

