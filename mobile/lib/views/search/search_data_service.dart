import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

    // 2. Fetch raw search payload from InnerTube with exponential backoff
    Map<String, dynamic>? rawJson;
    int retries = 0;
    while (retries < 2 && rawJson == null) {
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
            .timeout(const Duration(seconds: 8));
      } catch (e) {
        retries++;
        if (retries >= 2) {
          if (kDebugMode) debugPrint('[SearchDataService] InnerTube search attempt failed ($retries): $e');
        } else {
          await Future.delayed(Duration(milliseconds: (200 * math.pow(2, retries)).toInt()));
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

    // 3. Parse Raw JSON or fallback if InnerTube completely failed or blocked
    final parsed = rawJson != null
        ? SearchParser.parse(rawJson, query: q)
        : const ParsedSearchPayload(items: []);

    List<SearchItem> candidateItems = parsed.items;
    if (candidateItems.isEmpty) {
      candidateItems = await _fetchFallbackItems(q, filter);
    }

    if (candidateItems.isEmpty) {
      return SearchResult(
        originalQuery: q,
        intent: SearchIntentDetector.detectIntent(q, const []),
      );
    }

    // 4. Detect Intent from query terms and candidate entities
    final intent = SearchIntentDetector.detectIntent(q, candidateItems);

    // 5. Rank, Deduplicate, and Structure Shelves
    final rankedResult = SearchRanker.rank(
      items: candidateItems,
      intent: intent,
      countryCode: country,
      initialTopResult: parsed.topResult,
      didYouMean: parsed.didYouMean,
      continuation: parsed.continuation,
    );

    // 6. Store in LRU Cache
    _lruCache.put(cacheKey, rankedResult);

    // 7. Prefetch top 5 song thumbnails in background for instant image loading
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
      if (filter == SearchFilter.videos) {
        final videos = await InnerTubeService.instance.searchVideos(q);
        if (videos.isNotEmpty) {
          return videos.map(_trackToSearchVideoItem).toList();
        }
      } else if (filter == SearchFilter.artists) {
        final artists = await InnerTubeService.instance.searchArtists(q);
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
      List<Track> tracks = await InnerTubeService.instance.search(q);
      if (tracks.isEmpty) {
        tracks = await ApiService.search(q);
      }
      if (tracks.isNotEmpty) {
        return tracks.map(_trackToSearchSongItem).toList();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchDataService] fallback error: $e');
    }
    return const [];
  }
}
