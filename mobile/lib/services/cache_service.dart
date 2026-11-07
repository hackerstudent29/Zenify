import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

import '../data/datasources/catalog_datasource.dart';
import '../views/explore/explore_data_service.dart';
import '../views/search/search_data_service.dart';
import 'api_service.dart';
import 'artist_service.dart';
import 'innertube_service.dart';
import 'stream_resolver_service.dart';

class CacheService {
  CacheService._();

  /// Completely clears all in-memory, disk image, and metadata caches so
  /// songs and artist profiles can be fetched freshly from YouTube Music.
  static Future<void> clearAllMediaAndArtworkCache() async {
    // 1. Clear in-memory service caches
    ArtistService.clearCache();
    ApiService.clearCache();
    StreamResolverService.instance.clearCache();
    InnerTubeService.instance.clearCache();
    ExploreDataService.instance.clearCache();
    CatalogDataSource.clear();

    // 2. Clear disk image caches (cached_network_image / flutter_cache_manager)
    try {
      await DefaultCacheManager().emptyCache();
    } catch (_) {}

    // 3. Clear Flutter in-memory decoded image cache
    try {
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    } catch (_) {}

    // 4. Clear search recents cache
    try {
      await SearchDataService.instance.clearRecents();
    } catch (_) {}

    // 5. Re-initialize fresh catalog from YouTube Music InnerTube
    try {
      await CatalogDataSource.initialize();
    } catch (_) {}
  }
}

