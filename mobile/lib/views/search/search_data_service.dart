import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';

import '../../data/datasources/catalog_datasource.dart';import 'package:shared_preferences/shared_preferences.dart';

import '../../models/track.dart';
import '../../services/api_service.dart';
import '../../services/country_service.dart';
import '../../services/innertube_service.dart';
import '../../utils/media_normalizer.dart';
import 'search_models.dart';
import 'search_parser.dart';
import 'search_ranker.dart';

/// Single source of truth for Zenify search data, autocomplete, caching, and ranking.
class SearchDataService {
  SearchDataService._();
  static final SearchDataService instance = SearchDataService._();

  static const String _recentPrefKey = 'zenify_recent_search_history_v2';
  final ValueNotifier<List<String>> recentsNotifier = ValueNotifier<List<String>>([]);

  final SearchTrie _trie = SearchTrie();
  final SearchLruCache _lruCache = SearchLruCache();

  bool _initializedRecents = false;
  int _activeRequestId = 0;
  String _activeSearchQuery = '';

  /// Initializes recent searches and populates the Trie prefix tree.
  Future<void> initRecents() async {
    if (_initializedRecents) return;
    _initializedRecents = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getStringList(_recentPrefKey) ??
          prefs.getStringList('zenify_recent_search_history');
      if (saved != null && saved.isNotEmpty) {
        recentsNotifier.value = saved;
        // Seed Trie with recents with descending popularity
        for (int i = 0; i < saved.length; i++) {
          final query = saved[i];
          final weight = math.max(1, 100 - (i * 4));
          _trie.insert(query, frequency: weight);
          ApiService.addRecentSearch(query);
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchDataService] initRecents error: $e');
    }
  }

  /// Adds a query to recent searches, persists to SharedPreferences, and updates Trie.
  Future<void> addRecent(String query) async {
    final q = query.trim();
    if (q.isEmpty) return;

    final current = List<String>.from(recentsNotifier.value);
    current.removeWhere((item) => item.toLowerCase() == q.toLowerCase());
    current.insert(0, q);
    if (current.length > SearchRankingConfig.kMaxRecentSearches) {
      current.removeRange(SearchRankingConfig.kMaxRecentSearches, current.length);
    }
    recentsNotifier.value = current;
    ApiService.addRecentSearch(q);

    _trie.insert(q, frequency: 100);

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_recentPrefKey, current);
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchDataService] addRecent error: $e');
    }
  }

  /// Removes a single query from recents.
  Future<void> removeRecent(String query) async {
    final current = List<String>.from(recentsNotifier.value);
    current.removeWhere((item) => item.toLowerCase() == query.toLowerCase());
    recentsNotifier.value = current;
    ApiService.removeRecentSearch(query);

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_recentPrefKey, current);
    } catch (_) {}
  }

  /// Clears all recent searches.
  Future<void> clearRecents() async {
    recentsNotifier.value = [];
    ApiService.clearRecentSearches();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_recentPrefKey);
    } catch (_) {}
  }

  /// Instant local Trie autocomplete suggestions (synchronous, 0ms).
  List<String> getInstantLocalSuggestions(String query) {
    final q = query.trim();
    if (q.isEmpty) {
      return recentsNotifier.value.take(6).toList();
    }
    return _trie.searchPrefix(q, limit: 6);
  }

  /// Merged suggestions: instant local Trie predictions merged with online InnerTube suggestions.
  Future<List<String>> getSuggestions(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      return recentsNotifier.value.take(6).toList();
    }

    final localMatches = getInstantLocalSuggestions(q);
    try {
      final onlineMatches = await InnerTubeService.instance.getSearchSuggestions(q);
      final seen = <String>{};
      final combined = <String>[];

      // Insert local matches first for speed, then enrich with online
      for (final item in [...localMatches, ...onlineMatches]) {
        final norm = item.toLowerCase().trim();
        if (norm.isNotEmpty && seen.add(norm)) {
          combined.add(item);
          _trie.insert(item, frequency: 10);
        }
      }
      return combined.take(8).toList();
    } catch (_) {
      return localMatches;
    }
  }

  /// Main search method with caching, ranking, cancellation, retries, and fallback.
  Future<SearchResult> search({
    required String query,
    SearchFilter filter = SearchFilter.all,
    bool forceRefresh = false,
  }) async {
    final q = query.trim();
    final country = CountryService.instance.currentCode;
    const language = 'en';

    if (q.isEmpty) {
      return SearchResult(
        originalQuery: '',
        intent: const SearchIntent(
          originalQuery: '',
          normalizedQuery: '',
          entityText: '',
        ),
      );
    }

    // 1. Check LRU Cache
    final cacheKey = SearchLruCache.buildKey(
      query: q,
      filter: filter,
      country: country,
      language: language,
    );

    if (!forceRefresh) {
      final cached = _lruCache.get(cacheKey);
      if (cached != null) return cached;
    }

    _activeSearchQuery = q;
    final requestId = ++_activeRequestId;

    List<SearchItem> candidateItems = [];
    SearchTopResult? topResult;
    String? didYouMean;
    String? continuation;

    // 2. PRIMARY STRATEGY:
    // If native InnerTube is available (Android), try it first with high priority!
    if (InnerTubeService.instance.isNativeAvailable) {
      try {
        if (filter == SearchFilter.all) {
          final nativeData = await InnerTubeService.instance
              .searchSummaryNative(q)
              .timeout(const Duration(seconds: 5), onTimeout: () => null);
          if (nativeData != null && nativeData['summaries'] is List) {
            final parsed = SearchParser.parseNativeSummaries(
              nativeData['summaries'] as List,
              query: q,
            );
            if (parsed.items.isNotEmpty) {
              candidateItems = parsed.items;
              topResult = parsed.topResult;
              didYouMean = parsed.didYouMean;
              continuation = parsed.continuation;
            }
          }
          if (candidateItems.isEmpty) {
            final nativeSongs = await InnerTubeService.instance
                .searchSongsNative(q)
                .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[]);
            if (nativeSongs.isNotEmpty) {
              candidateItems = nativeSongs.map(_trackToSearchSongItem).toList();
            }
          }
        } else if (filter == SearchFilter.songs) {
          final nativeSongs = await InnerTubeService.instance
              .searchSongsNative(q)
              .timeout(const Duration(seconds: 5), onTimeout: () => <Track>[]);
          if (nativeSongs.isNotEmpty) {
            candidateItems = nativeSongs.map(_trackToSearchSongItem).toList();
          }
        } else if (filter == SearchFilter.albums) {
          final nativeAlbums = await InnerTubeService.instance
              .searchAlbumsNative(q)
              .timeout(const Duration(seconds: 5), onTimeout: () => const []);
          if (nativeAlbums.isNotEmpty) {
            candidateItems = nativeAlbums
                .map((m) => SearchParser.parseNativeItem(m, rawRank: 0))
                .whereType<SearchItem>()
                .toList();
          }
        } else if (filter == SearchFilter.artists) {
          final nativeArtists = await InnerTubeService.instance
              .searchArtistsNative(q)
              .timeout(const Duration(seconds: 5), onTimeout: () => const []);
          if (nativeArtists.isNotEmpty) {
            candidateItems = nativeArtists
                .map((m) => SearchParser.parseNativeItem(m, rawRank: 0))
                .whereType<SearchItem>()
                .toList();
          }
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[SearchDataService] Native search attempt error: $e');
      }
    }

    // 3. SECONDARY STRATEGY (Web / Desktop / HTTP fallback):
    if (candidateItems.isEmpty) {
      Map<String, dynamic>? rawJson;
      try {
        final body = <String, dynamic>{'query': q};
        if (filter.params != null) {
          body['params'] = filter.params;
        }

        rawJson = await InnerTubeService.instance
            .post(
              'search',
              body,
              countryCode: country,
              ttl: SearchRankingConfig.kLruCacheTtl,
              forceRefresh: forceRefresh,
            )
            .timeout(const Duration(seconds: 6));
      } catch (e) {
        if (kDebugMode) debugPrint('[SearchDataService] InnerTube HTTP search attempt failed: $e');
      }

      if (rawJson != null) {
        final parsed = SearchParser.parse(rawJson, query: q);
        if (parsed.items.isNotEmpty) {
          candidateItems = parsed.items;
          topResult = parsed.topResult;
          didYouMean = parsed.didYouMean;
          continuation = parsed.continuation;
        }
      }
    }

    // Guard against out-of-order responses from cancelled/delayed searches
    // Never drop if user is still on the same query
    if (requestId != _activeRequestId && _activeSearchQuery != q) {
      return _lruCache.get(cacheKey) ??
          SearchResult(
            originalQuery: q,
            intent: const SearchIntent(originalQuery: '', normalizedQuery: '', entityText: ''),
          );
    }

    // 4. TERTIARY STRATEGY (Local Catalog / Featured Tracks / Cloud Fallback):
    if (candidateItems.isEmpty) {
      candidateItems = await _fetchFallbackItems(q, filter);
    }

    if (candidateItems.isEmpty) {
      final emptyResult = SearchResult(
        originalQuery: q,
        intent: SearchIntentDetector.detectIntent(q, const []),
      );
      _lruCache.put(cacheKey, emptyResult);
      return emptyResult;
    }

    // 5. Detect Intent from query terms and candidate entities
    final intent = SearchIntentDetector.detectIntent(q, candidateItems);

    // 6. Rank, Deduplicate, and Structure Shelves
    final rankedResult = SearchRanker.rank(
      items: candidateItems,
      intent: intent,
      countryCode: country,
      initialTopResult: topResult,
      didYouMean: didYouMean,
      continuation: continuation,
    );

    // 7. Store in LRU Cache
    _lruCache.put(cacheKey, rankedResult);

    // 8. Prefetch top 5 song thumbnails in background for instant image loading
    _prefetchThumbnails(rankedResult.songs.take(5));

    return rankedResult;
  }

  /// Appends next page results using the continuation token.
  Future<SearchResult> loadMore({
    required SearchResult currentResult,
    required SearchFilter filter,
  }) async {
    final token = currentResult.continuation;
    if (token == null || token.isEmpty) return currentResult;

    final country = CountryService.instance.currentCode;
    try {
      final res = await InnerTubeService.instance
          .post(
            'search',
            {'continuation': token},
            countryCode: country,
            ttl: SearchRankingConfig.kLruCacheTtl,
          )
          .timeout(const Duration(seconds: 8));

      final parsed = SearchParser.parse(res, query: currentResult.originalQuery);
      if (parsed.items.isEmpty) return currentResult;

      // Merge existing items with new continuation items
      final existingAll = <SearchItem>[
        if (currentResult.topResult != null) currentResult.topResult!.item,
        ...currentResult.sections.values.expand((list) => list),
      ];

      final combinedItems = [...existingAll, ...parsed.items];

      final ranked = SearchRanker.rank(
        items: combinedItems,
        intent: currentResult.intent,
        countryCode: country,
        initialTopResult: currentResult.topResult,
        didYouMean: currentResult.correctedQuery,
        continuation: parsed.continuation,
      );

      return ranked;
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchDataService] loadMore error: $e');
      return currentResult;
    }
  }

  void _prefetchThumbnails(Iterable<SearchSongItem> songs) {
    for (final s in songs) {
      final url = s.thumbnailUrl;
      if (url.isNotEmpty && url.startsWith('http')) {
        MediaNormalizer.upgradeArtworkUrl(url);
      }
    }
  }

  SearchSongItem _trackToSearchSongItem(Track t) {
    return SearchSongItem(
      id: t.id,
      title: t.title,
      subtitle: t.artist,
      thumbnailUrl: t.coverUrl,
      thumbnailUrlHiRes: t.coverUrl,
      videoId: t.id.replaceAll('yt-', ''),
      artists: t.artists,
      albumName: t.album,
      durationSeconds: t.durationSeconds,
      durationText: t.formattedDuration,
    );
  }

  SearchVideoItem _trackToSearchVideoItem(Track t) {
    return SearchVideoItem(
      id: t.id,
      title: t.title,
      subtitle: t.artist,
      thumbnailUrl: t.coverUrl,
      thumbnailUrlHiRes: t.coverUrl,
      videoId: t.id.replaceAll('yt-', ''),
      channel: t.artist,
      durationText: t.formattedDuration,
    );
  }

  Future<List<SearchItem>> _fetchFallbackItems(String q, SearchFilter filter) async {
    try {
      final qLower = q.toLowerCase();

      // 1. Check in-memory CatalogDataSource
      final catalogMatches = CatalogDataSource.allTracks.where((t) =>
        t.title.toLowerCase().contains(qLower) ||
        t.artist.toLowerCase().contains(qLower) ||
        t.album.toLowerCase().contains(qLower)
      ).toList();

      if (catalogMatches.isNotEmpty) {
        final items = <SearchItem>[];
        final first = catalogMatches.first;
        if (first.artist.toLowerCase().contains(qLower) || qLower.contains(first.artist.toLowerCase())) {
          items.add(SearchArtistItem(
            id: 'artist-${first.artist}',
            title: first.artist,
            subtitle: 'Artist',
            thumbnailUrl: first.coverUrl,
            thumbnailUrlHiRes: first.coverUrl,
            browseId: '',
          ));
        }
        items.addAll(catalogMatches.map(_trackToSearchSongItem));
        return items;
      }

      // 2. Check ApiService.featuredTracks
      final featuredMatches = ApiService.featuredTracks.where((t) =>
        t.title.toLowerCase().contains(qLower) ||
        t.artist.toLowerCase().contains(qLower) ||
        t.album.toLowerCase().contains(qLower)
      ).toList();

      if (featuredMatches.isNotEmpty) {
        final items = <SearchItem>[];
        final first = featuredMatches.first;
        if (first.artist.toLowerCase().contains(qLower) || qLower.contains(first.artist.toLowerCase())) {
          items.add(SearchArtistItem(
            id: 'artist-${first.artist}',
            title: first.artist,
            subtitle: 'Artist',
            thumbnailUrl: first.coverUrl,
            thumbnailUrlHiRes: first.coverUrl,
            browseId: '',
          ));
        }
        items.addAll(featuredMatches.map(_trackToSearchSongItem));
        return items;
      }

      if (filter == SearchFilter.videos) {
        final videos = await InnerTubeService.instance
            .searchVideos(q)
            .timeout(const Duration(seconds: 3), onTimeout: () => <Track>[]);
        if (videos.isNotEmpty) {
          return videos.map(_trackToSearchVideoItem).toList();
        }
      } else if (filter == SearchFilter.artists) {
        final artists = await InnerTubeService.instance
            .searchArtists(q)
            .timeout(const Duration(seconds: 3), onTimeout: () => const []);
        if (artists.isNotEmpty) {
          return artists
              .map((a) => SearchArtistItem(
                    id: a.id,
                    title: a.name,
                    subtitle: 'Artist',
                    thumbnailUrl: a.image,
                    thumbnailUrlHiRes: a.image,
                    browseId: a.id,
                  ))
              .toList();
        }
      }

      // Fast native songs attempt
      if (InnerTubeService.instance.isNativeAvailable) {
        final tracks = await InnerTubeService.instance
            .searchSongsNative(q)
            .timeout(const Duration(seconds: 3), onTimeout: () => <Track>[]);
        if (tracks.isNotEmpty) {
          final items = <SearchItem>[];
          final first = tracks.first;
          if (first.artist.toLowerCase().contains(qLower) || qLower.contains(first.artist.toLowerCase())) {
            items.add(SearchArtistItem(
              id: 'artist-${first.artist}',
              title: first.artist,
              subtitle: 'Artist',
              thumbnailUrl: first.coverUrl,
              thumbnailUrlHiRes: first.coverUrl,
              browseId: '',
            ));
          }
          items.addAll(tracks.map(_trackToSearchSongItem));
          return items;
        }
      }

      // Resilient cloud fallback via ApiService
      final tracks = await ApiService.search(q)
          .timeout(const Duration(seconds: 3), onTimeout: () => <Track>[]);

      if (tracks.isNotEmpty) {
        final items = <SearchItem>[];
        final first = tracks.first;
        if (first.artist.toLowerCase().contains(qLower) || qLower.contains(first.artist.toLowerCase())) {
          items.add(SearchArtistItem(
            id: 'artist-${first.artist}',
            title: first.artist,
            subtitle: 'Artist',
            thumbnailUrl: first.coverUrl,
            thumbnailUrlHiRes: first.coverUrl,
            browseId: '',
          ));
        }
        items.addAll(tracks.map(_trackToSearchSongItem));
        return items;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchDataService] fallback error: $e');
    }
    return const [];
  }

  /// Instant local fallback result for timeouts or network failures.
  SearchResult getFallbackResult(String query, SearchFilter filter) {
    final q = query.trim();
    final qLower = q.toLowerCase();
    final tracks = CatalogDataSource.allTracks
        .where((t) =>
            t.title.toLowerCase().contains(qLower) ||
            t.artist.toLowerCase().contains(qLower) ||
            t.album.toLowerCase().contains(qLower))
        .take(12)
        .map(_trackToSearchSongItem)
        .toList();

    if (tracks.isEmpty) {
      tracks.addAll(
        ApiService.featuredTracks
            .where((t) =>
                t.title.toLowerCase().contains(qLower) ||
                t.artist.toLowerCase().contains(qLower))
            .take(8)
            .map(_trackToSearchSongItem),
      );
    }

    final intent = SearchIntentDetector.detectIntent(q, tracks);
    return SearchRanker.rank(
      items: tracks,
      intent: intent,
      countryCode: CountryService.instance.currentCode,
    );
  }
}
