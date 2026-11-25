import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';

import 'package:shared_preferences/shared_preferences.dart';

import '../../models/track.dart';
import '../../services/api_service.dart';
import '../../services/country_service.dart';
import '../../services/download_service.dart';
import '../../services/innertube_service.dart';
import '../../services/user_preferences_service.dart';
import '../../utils/media_normalizer.dart';
import 'search_models.dart';
import 'search_parser.dart';
import 'search_ranker.dart';

/// Single source of truth for Zenify search data, autocomplete, caching, and ranking.
class SearchDataService {
  SearchDataService._();
  static final SearchDataService instance = SearchDataService._();

  static const String _recentPrefKey = 'zenify_recent_search_history_v2';
  final ValueNotifier<List<String>> recentsNotifier =
      ValueNotifier<List<String>>([]);

  final SearchTrie _trie = SearchTrie();
  final SearchRawProviderCache _rawProviderCache = SearchRawProviderCache();
  final SearchLruCache _lruCache = SearchLruCache();
  final Map<String, List<String>> _queryAffinity = {};

  bool _initializedRecents = false;

  /// Initializes recent searches and populates the Trie prefix tree.
  Future<void> initRecents() async {
    if (_initializedRecents) return;
    _initializedRecents = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved =
          prefs.getStringList(_recentPrefKey) ??
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

      final affStr = prefs.getString('zenify_search_query_affinities');
      if (affStr != null) {
        final rawMap = jsonDecode(affStr) as Map<String, dynamic>;
        for (final entry in rawMap.entries) {
          if (entry.value is List) {
            _queryAffinity[entry.key] = (entry.value as List)
                .map((e) => e.toString())
                .toList();
          }
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
      current.removeRange(
        SearchRankingConfig.kMaxRecentSearches,
        current.length,
      );
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

  /// Returns clicked entity keys (IDs and titles) associated with this query.
  Set<String> getAffinityKeys(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return const {};
    final list = _queryAffinity[q];
    if (list == null || list.isEmpty) return const {};
    return list.toSet();
  }

  /// Records that when searching for [query], the user selected [item].
  /// Stores item title and ID so subsequent searches for this keyword
  /// prioritize this entity at the top of results.
  Future<void> recordQueryAffinity(String query, SearchItem item) async {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return;
    final keys = <String>{
      if (item.id.isNotEmpty) item.id.toLowerCase(),
      if (item.title.isNotEmpty) item.title.trim().toLowerCase(),
      if (item.subtitle.isNotEmpty) item.subtitle.trim().toLowerCase(),
    };
    if (keys.isEmpty) return;

    final list = _queryAffinity[q] ?? <String>[];
    for (final k in keys) {
      list.remove(k);
      list.insert(0, k);
    }
    if (list.length > 20) list.removeRange(20, list.length);
    _queryAffinity[q] = list;

    try {
      final prefs = await SharedPreferences.getInstance();
      final mapToSave = <String, List<String>>{};
      final entries = _queryAffinity.entries.take(50);
      for (final e in entries) {
        mapToSave[e.key] = e.value;
      }
      await prefs.setString(
        'zenify_search_query_affinities',
        jsonEncode(mapToSave),
      );
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

  /// Merged suggestions: instant local Trie predictions merged with online InnerTube
  /// autocomplete queries AND rich recommended entities (`contents[1]`).
  Future<({List<String> queries, List<SearchItem> recommendedItems})>
  getSuggestionBundle(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      return (
        queries: recentsNotifier.value.take(6).toList(),
        recommendedItems: const <SearchItem>[],
      );
    }

    final localMatches = getInstantLocalSuggestions(q);
    try {
      final raw = await InnerTubeService.instance
          .getSearchSuggestionsRaw(q)
          .timeout(const Duration(milliseconds: 1200), onTimeout: () => null);
      if (raw != null) {
        final bundle = SearchParser.parseSuggestionBundle(raw);
        final seen = <String>{};
        final combined = <String>[];
        // Put online predictions first for query accuracy, then local recents
        for (final item in [...bundle.queries, ...localMatches]) {
          final norm = item.toLowerCase().trim();
          if (norm.isNotEmpty && seen.add(norm)) {
            combined.add(item);
            _trie.insert(item, frequency: 10);
          }
        }
        return (
          queries: combined.take(8).toList(),
          recommendedItems: bundle.recommendedItems,
        );
      }

      final onlineMatches = await InnerTubeService.instance
          .getSearchSuggestions(q);
      final seen = <String>{};
      final combined = <String>[];
      for (final item in [...onlineMatches, ...localMatches]) {
        final norm = item.toLowerCase().trim();
        if (norm.isNotEmpty && seen.add(norm)) {
          combined.add(item);
          _trie.insert(item, frequency: 10);
        }
      }
      return (
        queries: combined.take(8).toList(),
        recommendedItems: const <SearchItem>[],
      );
    } catch (_) {
      return (queries: localMatches, recommendedItems: const <SearchItem>[]);
    }
  }

  /// Merged suggestions: instant local Trie predictions merged with online InnerTube suggestions.
  Future<List<String>> getSuggestions(String query) async {
    final bundle = await getSuggestionBundle(query);
    return bundle.queries;
  }

  /// Decides whether a short/partial/typo query should also fetch YouTube Music's
  /// top predicted query in parallel so obscure literal substring matches don't hide hits.
  String? _pickExpansionQuery(
    String rawQuery,
    List<String> sugQueries,
    List<SearchItem> recommendedItems,
  ) {
    final qNorm = QueryPreprocessor.normalize(rawQuery);
    if (qNorm.length < 2) return null;

    // Prefer exact entity title from YTM recommended entities when user typed a short prefix or typo
    if (recommendedItems.isNotEmpty && qNorm.length <= 7) {
      final firstRec = recommendedItems.first;
      final recTitleNorm = QueryPreprocessor.normalize(firstRec.title);
      if (recTitleNorm.isNotEmpty &&
          recTitleNorm != qNorm &&
          (recTitleNorm.contains(qNorm) || qNorm.length <= 4)) {
        return firstRec.title;
      }
    }

    for (final s in sugQueries) {
      final sNorm = QueryPreprocessor.normalize(s);
      if (sNorm.isEmpty || sNorm == qNorm) continue;
      // Short/partial query (e.g. "star" -> "starboy", "wee" -> "weeknd", "ari" -> "arijit singh", "kesa" -> "kesariya")
      if (qNorm.length <= 6 &&
          (sNorm.startsWith(qNorm) || !qNorm.contains(' '))) {
        return s;
      }
      // Clear completion for longer prefix without full words (e.g. "anirud" -> "anirudh ravichander")
      if (!qNorm.contains(' ') && sNorm.startsWith(qNorm)) {
        return s;
      }
    }
    return null;
  }

  /// Main search method with caching, ranking, cancellation, retries, and fallback.
  Future<SearchResult> search({
    required String query,
    SearchFilter filter = SearchFilter.all,
    SearchSource source = SearchSource.youtube,
    bool forceRefresh = false,
  }) async {
    final q = query.trim();
    final country = CountryService.instance.currentCode;
    final userLanguages =
        UserPreferencesService.instance.currentPrefs.languages;
    final favArtists =
        UserPreferencesService.instance.currentPrefs.favoriteArtists;
    final favArtistNames = favArtists
        .map((a) => a.name)
        .where((n) => n.isNotEmpty)
        .toList();
    final language = userLanguages.isNotEmpty
        ? userLanguages.first.toLowerCase()
        : 'en';
    final profileHash =
        '${userLanguages.join(',')}:${favArtistNames.join(',')}';

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

    unawaited(InnerTubeService.instance.syncNativeLocale(country));

    // 1. Check Layer B: Personalized Ranked LRU Cache
    final cacheKey = SearchLruCache.buildKey(
      query: q,
      filter: filter,
      source: SearchSource.youtube,
      country: country,
      language: language,
      profileHash: profileHash,
    );

    if (!forceRefresh) {
      final cached = _lruCache.get(cacheKey);
      if (cached != null) return cached;
    }

    List<SearchItem> candidateItems = [];
    SearchTopResult? topResult;
    String? didYouMean;
    String? continuation;
    final latencies = <String, int>{};

    // Helper: Stream retrieval with Layer A Raw Provider Cache & independent timeout
    Future<ParsedSearchPayload> fetchStream({
      required String streamName,
      Map<String, dynamic> body = const {},
      Duration timeout = const Duration(milliseconds: 3500),
    }) async {
      final queryParam = (body['query'] as String?)?.trim() ?? q;
      final rawKey = SearchRawProviderCache.buildKey(
        query: queryParam,
        stream: streamName,
        country: country,
        language: language,
      );

      if (!forceRefresh) {
        final cachedRaw = _rawProviderCache.get(rawKey);
        if (cachedRaw != null) {
          return SearchParser.parse(
            cachedRaw,
            query: queryParam,
            sourceStream: streamName,
          );
        }
      }

      final sw = Stopwatch()..start();
      try {
        final raw = await InnerTubeService.instance
            .post(
              'search',
              body,
              countryCode: country,
              ttl: SearchRankingConfig.kLruCacheTtl,
              forceRefresh: forceRefresh,
            )
            .timeout(timeout);
        sw.stop();
        latencies[streamName] = sw.elapsedMilliseconds;
        _rawProviderCache.put(rawKey, raw);
        return SearchParser.parse(
          raw,
          query: queryParam,
          sourceStream: streamName,
        );
      } catch (e) {
        sw.stop();
        latencies[streamName] = sw.elapsedMilliseconds;
        return const ParsedSearchPayload();
      }
    }

    // ── ADAPTIVE MULTI-QUERY YOUTUBE MUSIC SEARCH PIPELINE ───────────────────
    List<String> querySuggestions = [];
    List<SearchItem> suggestedEntities = [];

    try {
      // Dispatch suggestions in parallel with primary streams (zero sequential stall!)
      final sugFuture = q.length >= 2
          ? getSuggestionBundle(q).timeout(
              const Duration(milliseconds: 1200),
              onTimeout: () => (
                queries: getInstantLocalSuggestions(q),
                recommendedItems: const <SearchItem>[],
              ),
            )
          : Future.value((
              queries: const <String>[],
              recommendedItems: const <SearchItem>[],
            ));

      if (filter == SearchFilter.all) {
        final futures = <Future<ParsedSearchPayload>>[];

        // Fetch complete YouTube Music categories concurrently so Overview ALWAYS
        // has accurate Songs, Albums, Artists, Playlists, and Music Videos.
        futures.add(fetchStream(streamName: 'general', body: {'query': q}));
        futures.add(
          fetchStream(
            streamName: 'songs',
            body: {'query': q, 'params': SearchFilter.songs.params},
          ),
        );
        futures.add(
          fetchStream(
            streamName: 'albums',
            body: {'query': q, 'params': SearchFilter.albums.params},
          ),
        );
        futures.add(
          fetchStream(
            streamName: 'artists',
            body: {'query': q, 'params': SearchFilter.artists.params},
          ),
        );
        futures.add(
          fetchStream(
            streamName: 'featuredPlaylists',
            body: {'query': q, 'params': SearchFilter.featuredPlaylists.params},
          ),
        );
        futures.add(
          fetchStream(
            streamName: 'videos',
            body: {'query': q, 'params': SearchFilter.videos.params},
          ),
        );

        // As soon as suggestions resolve (~120ms), check if short/ambiguous query
        // needs parallel expansion to YTM's top predicted entity (e.g. "star" -> "starboy").
        final expandedFuture = sugFuture.then((bundle) async {
          querySuggestions = bundle.queries;
          suggestedEntities = bundle.recommendedItems;
          final expQ = _pickExpansionQuery(
            q,
            bundle.queries,
            bundle.recommendedItems,
          );
          if (expQ == null) return const <ParsedSearchPayload>[];
          return Future.wait([
            fetchStream(
              streamName: 'expanded_general',
              body: {'query': expQ},
              timeout: const Duration(milliseconds: 2800),
            ),
            fetchStream(
              streamName: 'expanded_songs',
              body: {'query': expQ, 'params': SearchFilter.songs.params},
              timeout: const Duration(milliseconds: 2800),
            ),
          ]);
        });

        final parsedResults = await Future.wait(futures);
        final expandedResults = await expandedFuture;

        for (final res in parsedResults) {
          topResult ??= res.topResult;
          didYouMean ??= res.didYouMean;
          continuation ??= res.continuation;
          candidateItems.addAll(res.items);
        }

        // Inject YouTube Music recommended entities directly (high-popularity signal)
        candidateItems.addAll(suggestedEntities);

        for (final res in expandedResults) {
          // If expanded query matched a famous hit when raw query only had obscure items,
          // keep expanded items available for scoring!
          candidateItems.addAll(res.items);
        }

        // If YouTube Music explicitly suggested "Did you mean <corrected>?", fetch corrected too
        if (didYouMean != null &&
            didYouMean.isNotEmpty &&
            QueryPreprocessor.normalize(didYouMean) !=
                QueryPreprocessor.normalize(q)) {
          final correctedPayloads = await Future.wait([
            fetchStream(
              streamName: 'expanded_general',
              body: {'query': didYouMean},
              timeout: const Duration(milliseconds: 2400),
            ),
            fetchStream(
              streamName: 'expanded_songs',
              body: {'query': didYouMean, 'params': SearchFilter.songs.params},
              timeout: const Duration(milliseconds: 2400),
            ),
          ]);
          for (final res in correctedPayloads) {
            if (res.topResult != null) topResult = res.topResult;
            candidateItems.addAll(res.items);
          }
        }
      } else {
        final futures = <Future<ParsedSearchPayload>>[];
        final body = <String, dynamic>{'query': q};
        if (filter.params != null) {
          body['params'] = filter.params;
        }
        futures.add(fetchStream(streamName: filter.name, body: body));

        // Playlists tab should include both official featured playlists and community playlists
        if (filter == SearchFilter.featuredPlaylists) {
          futures.add(
            fetchStream(
              streamName: 'communityPlaylists',
              body: {
                'query': q,
                'params': SearchFilter.communityPlaylists.params,
              },
            ),
          );
        }

        final expandedFuture = sugFuture.then((bundle) async {
          querySuggestions = bundle.queries;
          suggestedEntities = bundle.recommendedItems;
          final qNorm = QueryPreprocessor.normalize(q);
          if (qNorm.length <= 5) {
            final expQ = _pickExpansionQuery(
              q,
              bundle.queries,
              bundle.recommendedItems,
            );
            if (expQ != null) {
              return fetchStream(
                streamName: '${filter.name}_expanded',
                body: {
                  'query': expQ,
                  if (filter.params != null) 'params': filter.params,
                },
                timeout: const Duration(milliseconds: 2600),
              );
            }
          }
          return const ParsedSearchPayload();
        });

        final parsedList = await Future.wait(futures);
        final expandedParsed = await expandedFuture;

        for (final parsed in parsedList) {
          topResult ??= parsed.topResult;
          didYouMean ??= parsed.didYouMean;
          continuation ??= parsed.continuation;
          candidateItems.addAll(parsed.items);
        }
        candidateItems.addAll(expandedParsed.items);
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[SearchDataService] Direct HTTP search attempt failed: $e');
      }
    }

    // 2. SECONDARY FALLBACK: Native Metrolist search (Android) if HTTP returned empty
    if (candidateItems.isEmpty && InnerTubeService.instance.isNativeAvailable) {
      try {
        if (filter == SearchFilter.all) {
          final nativeData = await InnerTubeService.instance
              .searchSummaryNative(q)
              .timeout(const Duration(seconds: 2), onTimeout: () => null);
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
                .timeout(
                  const Duration(milliseconds: 1500),
                  onTimeout: () => <Track>[],
                );
            if (nativeSongs.isNotEmpty) {
              candidateItems = nativeSongs.map(_trackToSearchSongItem).toList();
            }
          }
        } else if (filter == SearchFilter.songs) {
          final nativeSongs = await InnerTubeService.instance
              .searchSongsNative(q)
              .timeout(
                const Duration(milliseconds: 1500),
                onTimeout: () => <Track>[],
              );
          if (nativeSongs.isNotEmpty) {
            candidateItems = nativeSongs.map(_trackToSearchSongItem).toList();
          }
        } else if (filter == SearchFilter.artists) {
          final rawArtists = await InnerTubeService.instance
              .searchArtistsNative(q)
              .timeout(
                const Duration(milliseconds: 1500),
                onTimeout: () => const [],
              );
          if (rawArtists.isNotEmpty) {
            int rank = 0;
            candidateItems = rawArtists
                .map((m) => SearchParser.parseNativeItem(m, rawRank: rank++))
                .whereType<SearchItem>()
                .toList();
          }
        } else if (filter == SearchFilter.albums) {
          final rawAlbums = await InnerTubeService.instance
              .searchAlbumsNative(q)
              .timeout(
                const Duration(milliseconds: 1500),
                onTimeout: () => const [],
              );
          if (rawAlbums.isNotEmpty) {
            int rank = 0;
            candidateItems = rawAlbums
                .map((m) => SearchParser.parseNativeItem(m, rawRank: rank++))
                .whereType<SearchItem>()
                .toList();
          }
        } else if (filter == SearchFilter.featuredPlaylists ||
            filter == SearchFilter.communityPlaylists) {
          final rawPlaylists = await InnerTubeService.instance
              .searchPlaylistsNative(q)
              .timeout(
                const Duration(milliseconds: 1500),
                onTimeout: () => const [],
              );
          if (rawPlaylists.isNotEmpty) {
            int rank = 0;
            candidateItems = rawPlaylists
                .map((m) => SearchParser.parseNativeItem(m, rawRank: rank++))
                .whereType<SearchItem>()
                .toList();
          }
        } else if (filter == SearchFilter.videos) {
          final rawVideos = await InnerTubeService.instance
              .searchVideosNative(q)
              .timeout(
                const Duration(milliseconds: 1500),
                onTimeout: () => const [],
              );
          if (rawVideos.isNotEmpty) {
            int rank = 0;
            candidateItems = rawVideos
                .map((m) => SearchParser.parseNativeItem(m, rawRank: rank++))
                .whereType<SearchItem>()
                .toList();
          }
        }
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[SearchDataService] native search fallback error: $e');
        }
      }
    }

    // Local catalog fallback only if network completely returned empty
    if (candidateItems.isEmpty) {
      candidateItems = await _fetchFallbackItems(q, filter);
    }

    if (candidateItems.isEmpty) {
      // DO NOT cache empty results into _lruCache so subsequent retries aren't blocked!
      if (kDebugMode) {
        debugPrint('[SearchDataService] returning EMPTY SearchResult for "$q"');
      }
      return SearchResult(
        originalQuery: q,
        intent: SearchIntentDetector.detectIntent(q, const []),
      );
    }

    // 5. Detect Intent from query terms, candidate entities, and live suggestions
    final intent = SearchIntentDetector.detectIntent(
      q,
      candidateItems,
      querySuggestions: querySuggestions,
    );

    // 6. Rank, Deduplicate, Fuse Streams (RRF), and Structure Shelves
    final rankedResult = SearchRanker.rank(
      items: candidateItems,
      intent: intent,
      countryCode: country,
      affinityKeys: getAffinityKeys(q),
      preferredLanguages: userLanguages,
      favoriteArtists: favArtistNames,
      initialTopResult: topResult,
      didYouMean: didYouMean,
      continuation: continuation,
      streamLatenciesMs: latencies,
      querySuggestions: querySuggestions,
    );
    if (kDebugMode) {
      debugPrint(
        '[SearchDataService] rankedResult isEmpty=${rankedResult.isEmpty}, songs=${rankedResult.songs.length}, artists=${rankedResult.artists.length}, albums=${rankedResult.albums.length}',
      );
    }

    // 7. Store in Layer B: Personalized Ranked LRU Cache
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
    final userLanguages =
        UserPreferencesService.instance.currentPrefs.languages;
    try {
      final res = await InnerTubeService.instance
          .post(
            'search',
            {'continuation': token},
            countryCode: country,
            ttl: SearchRankingConfig.kLruCacheTtl,
          )
          .timeout(const Duration(seconds: 4));

      final parsed = SearchParser.parse(
        res,
        query: currentResult.originalQuery,
      );
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
        affinityKeys: getAffinityKeys(currentResult.originalQuery),
        preferredLanguages: userLanguages,
        initialTopResult: currentResult.topResult,
        didYouMean: currentResult.correctedQuery,
        continuation: parsed.continuation,
        querySuggestions: currentResult.suggestions,
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

  Future<List<SearchItem>> _fetchFallbackItems(
    String q,
    SearchFilter filter,
  ) async {
    try {
      final qLower = q.toLowerCase();

      // 1. Offline downloaded songs matching query (always safe & user-owned)
      final offlineMatches = DownloadService.instance.downloadedTracks
          .where(
            (t) =>
                t.title.toLowerCase().contains(qLower) ||
                t.artist.toLowerCase().contains(qLower) ||
                t.album.toLowerCase().contains(qLower),
          )
          .take(15)
          .toList();
      if (offlineMatches.isNotEmpty && filter == SearchFilter.all) {
        // Only use offline as fallback if native & backend cloud also return empty
        if (InnerTubeService.instance.isNativeAvailable) {
          final tracks = await InnerTubeService.instance
              .searchSongsNative(q)
              .timeout(const Duration(seconds: 3), onTimeout: () => <Track>[]);
          if (tracks.isNotEmpty) {
            return tracks.map(_trackToSearchSongItem).toList();
          }
        }
        return offlineMatches.map(_trackToSearchSongItem).toList();
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
              .map(
                (a) => SearchArtistItem(
                  id: a.id,
                  title: a.name,
                  subtitle: 'Artist',
                  thumbnailUrl: a.image,
                  thumbnailUrlHiRes: a.image,
                  browseId: a.id,
                ),
              )
              .toList();
        }
      }

      // 2. Fast native songs attempt
      if (InnerTubeService.instance.isNativeAvailable) {
        final tracks = await InnerTubeService.instance
            .searchSongsNative(q)
            .timeout(const Duration(seconds: 3), onTimeout: () => <Track>[]);
        if (tracks.isNotEmpty) {
          return tracks.map(_trackToSearchSongItem).toList();
        }
      }

      // 3. Offline downloaded tracks (if user has no connectivity)
      if (offlineMatches.isNotEmpty) {
        return offlineMatches.map(_trackToSearchSongItem).toList();
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchDataService] fallback error: $e');
    }
    return const [];
  }

  /// Instant local fallback ONLY from offline downloaded music (never home-feed pollution).
  SearchResult getFallbackResult(String query, SearchFilter filter) {
    final q = query.trim();
    final qLower = q.toLowerCase();
    final tracks = DownloadService.instance.downloadedTracks
        .where(
          (t) =>
              t.title.toLowerCase().contains(qLower) ||
              t.artist.toLowerCase().contains(qLower) ||
              t.album.toLowerCase().contains(qLower),
        )
        .take(12)
        .map(_trackToSearchSongItem)
        .toList();

    final intent = SearchIntentDetector.detectIntent(q, tracks);
    return SearchRanker.rank(
      items: tracks,
      intent: intent,
      countryCode: CountryService.instance.currentCode,
      affinityKeys: getAffinityKeys(q),
    );
  }
}
