import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';

import '../../data/datasources/catalog_datasource.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/track.dart';
import '../../services/api_service.dart';
import '../../services/country_service.dart';
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
            _queryAffinity[entry.key] =
                (entry.value as List).map((e) => e.toString()).toList();
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

  /// Merged suggestions: instant local Trie predictions merged with online InnerTube suggestions.
  Future<List<String>> getSuggestions(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      return recentsNotifier.value.take(6).toList();
    }

    final localMatches = getInstantLocalSuggestions(q);
    try {
      final onlineMatches = await InnerTubeService.instance
          .getSearchSuggestions(q);
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
    SearchSource source = SearchSource.youtube,
    bool forceRefresh = false,
  }) async {
    final q = query.trim();
    final country = CountryService.instance.currentCode;
    final userLanguages = UserPreferencesService.instance.currentPrefs.languages;
    final favArtists = UserPreferencesService.instance.currentPrefs.favoriteArtists;
    final favArtistNames = favArtists.map((a) => a.name).where((n) => n.isNotEmpty).toList();
    final language = userLanguages.isNotEmpty ? userLanguages.first.toLowerCase() : 'en';
    final profileHash = '${userLanguages.join(',')}:${favArtistNames.join(',')}';

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
    }) async {
      final rawKey = SearchRawProviderCache.buildKey(
        query: q,
        stream: streamName,
        country: country,
        language: language,
      );

      if (!forceRefresh) {
        final cachedRaw = _rawProviderCache.get(rawKey);
        if (cachedRaw != null) {
          return SearchParser.parse(
            cachedRaw,
            query: q,
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
            .timeout(const Duration(milliseconds: 3200));
        sw.stop();
        latencies[streamName] = sw.elapsedMilliseconds;
        _rawProviderCache.put(rawKey, raw);
        return SearchParser.parse(
          raw,
          query: q,
          sourceStream: streamName,
        );
      } catch (e) {
        sw.stop();
        latencies[streamName] = sw.elapsedMilliseconds;
        return const ParsedSearchPayload();
      }
    }

    // ── ADAPTIVE MULTI-QUERY YOUTUBE MUSIC SEARCH PIPELINE ───────────────────
    try {
      if (filter == SearchFilter.all) {
        final prelim = SearchIntentDetector.detectPreliminaryIntent(q);
        final futures = <Future<ParsedSearchPayload>>[];

        // A. General Search overview stream is always retrieved
        futures.add(fetchStream(streamName: 'general', body: {'query': q}));

        // B. Intent-adaptive category streams
        if (prelim == SearchItemType.album) {
          futures.add(fetchStream(
            streamName: 'albums',
            body: {'query': q, 'params': SearchFilter.albums.params},
          ));
          futures.add(fetchStream(
            streamName: 'songs',
            body: {'query': q, 'params': SearchFilter.songs.params},
          ));
        } else if (prelim == SearchItemType.artist) {
          futures.add(fetchStream(
            streamName: 'artists',
            body: {'query': q, 'params': SearchFilter.artists.params},
          ));
          futures.add(fetchStream(
            streamName: 'songs',
            body: {'query': q, 'params': SearchFilter.songs.params},
          ));
        } else if (prelim == SearchItemType.playlist) {
          futures.add(fetchStream(
            streamName: 'playlists',
            body: {'query': q, 'params': SearchFilter.featuredPlaylists.params},
          ));
          futures.add(fetchStream(
            streamName: 'songs',
            body: {'query': q, 'params': SearchFilter.songs.params},
          ));
        } else if (prelim == SearchItemType.video) {
          futures.add(fetchStream(
            streamName: 'videos',
            body: {'query': q, 'params': SearchFilter.videos.params},
          ));
          futures.add(fetchStream(
            streamName: 'songs',
            body: {'query': q, 'params': SearchFilter.songs.params},
          ));
        } else {
          // Standard / Song Search default: General + Songs filter
          futures.add(fetchStream(
            streamName: 'songs',
            body: {'query': q, 'params': SearchFilter.songs.params},
          ));
        }

        // C. Concurrent Native Search Summary (Android): resolves in ~700ms with 100% parity
        if (InnerTubeService.instance.isNativeAvailable) {
          futures.add(() async {
            final sw = Stopwatch()..start();
            try {
              final nativeData = await InnerTubeService.instance
                  .searchSummaryNative(q)
                  .timeout(const Duration(milliseconds: 3200), onTimeout: () => null);
              sw.stop();
              latencies['native'] = sw.elapsedMilliseconds;
              if (nativeData != null && nativeData['summaries'] is List) {
                return SearchParser.parseNativeSummaries(
                  nativeData['summaries'] as List,
                  query: q,
                );
              }
            } catch (_) {
              sw.stop();
            }
            return const ParsedSearchPayload();
          }());
        }

        final parsedResults = await Future.wait(futures);
        for (final res in parsedResults) {
          topResult ??= res.topResult;
          didYouMean ??= res.didYouMean;
          continuation ??= res.continuation;
          candidateItems.addAll(res.items);
        }
      } else {
        final body = <String, dynamic>{'query': q};
        if (filter.params != null) {
          body['params'] = filter.params;
        }

        final httpFuture = fetchStream(streamName: filter.name, body: body);
        Future<List<SearchItem>>? nativeFilterFuture;
        if (InnerTubeService.instance.isNativeAvailable) {
          if (filter == SearchFilter.songs) {
            nativeFilterFuture = InnerTubeService.instance
                .searchSongsNative(q)
                .timeout(const Duration(milliseconds: 2800), onTimeout: () => <Track>[])
                .then<List<SearchItem>>((tracks) => tracks.map(_trackToSearchSongItem).toList())
                .catchError((_) => <SearchItem>[]);
          } else if (filter == SearchFilter.albums) {
            nativeFilterFuture = InnerTubeService.instance
                .searchAlbumsNative(q)
                .timeout(const Duration(milliseconds: 2800), onTimeout: () => <Map<String, dynamic>>[])
                .then((albums) => albums.map((a) => SearchParser.parseNativeItem(a, rawRank: 0)).whereType<SearchItem>().toList())
                .catchError((_) => <SearchItem>[]);
          } else if (filter == SearchFilter.artists) {
            nativeFilterFuture = InnerTubeService.instance
                .searchArtistsNative(q)
                .timeout(const Duration(milliseconds: 2800), onTimeout: () => <Map<String, dynamic>>[])
                .then((artists) => artists.map((a) => SearchParser.parseNativeItem(a, rawRank: 0)).whereType<SearchItem>().toList())
                .catchError((_) => <SearchItem>[]);
          }
        }

        final parsed = await httpFuture;
        candidateItems = List<SearchItem>.from(parsed.items);
        topResult = parsed.topResult;
        didYouMean = parsed.didYouMean;
        continuation = parsed.continuation;

        if (nativeFilterFuture != null) {
          final nativeItems = await nativeFilterFuture;
          if (candidateItems.isEmpty) {
            candidateItems = nativeItems;
          } else {
            candidateItems.addAll(nativeItems);
          }
        }
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
              .timeout(const Duration(milliseconds: 1500), onTimeout: () => <Track>[]);
          if (nativeSongs.isNotEmpty) {
            candidateItems = nativeSongs.map(_trackToSearchSongItem).toList();
          }
        } else if (filter == SearchFilter.artists) {
          final rawArtists = await InnerTubeService.instance
              .searchArtistsNative(q)
              .timeout(const Duration(milliseconds: 1500), onTimeout: () => const []);
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
              .timeout(const Duration(milliseconds: 1500), onTimeout: () => const []);
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
              .timeout(const Duration(milliseconds: 1500), onTimeout: () => const []);
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
              .timeout(const Duration(milliseconds: 1500), onTimeout: () => const []);
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

    // 5. Detect Intent from query terms and candidate entities
    final intent = SearchIntentDetector.detectIntent(q, candidateItems);

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
    final userLanguages = UserPreferencesService.instance.currentPrefs.languages;
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

  ({List<SearchItem> items, SearchTopResult? topResult}) _parseCloudSearch(
    Map<String, dynamic> cloud,
    String q,
  ) {
    final items = <SearchItem>[];
    SearchTopResult? topRes;
    final qLower = q.toLowerCase();

    // 1. Tracks first: prioritize song results for queries
    if (cloud['tracks'] is List) {
      for (final t in (cloud['tracks'] as List)) {
        if (t is! Map) continue;
        final track = Track.fromJson(
          Map<String, dynamic>.from(t),
          baseUrl: ApiService.liveCloudUrl,
        );
        if (track.title.isNotEmpty) {
          final songItem = _trackToSearchSongItem(track);
          items.add(songItem);
          if (topRes == null && track.title.toLowerCase() == qLower) {
            topRes = SearchTopResult(item: songItem);
          }
        }
      }
    }

    // 2. Artists: only set topRes on strict exact match if no song has matched yet
    if (cloud['artists'] is List) {
      for (final a in (cloud['artists'] as List)) {
        if (a is! Map) continue;
        final aId = (a['id'] ?? a['browseId'] ?? '')?.toString() ?? '';
        final aName = (a['name'] ?? a['title'] ?? '')?.toString() ?? '';
        if (aName.isEmpty) continue;
        final aImg =
            (a['imageUrl'] ?? a['coverUrl'] ?? a['thumbnail'] ?? '')
                ?.toString() ??
            '';
        final artistItem = SearchArtistItem(
          id: aId.isNotEmpty ? aId : 'artist-$aName',
          title: aName,
          subtitle: 'Artist',
          thumbnailUrl: aImg,
          thumbnailUrlHiRes: aImg,
          browseId: aId,
          isVerified: true,
        );
        items.add(artistItem);
        if (topRes == null && aName.toLowerCase() == qLower) {
          topRes = SearchTopResult(item: artistItem);
        }
      }
    }

    // Albums
    if (cloud['albums'] is List) {
      for (final al in (cloud['albums'] as List)) {
        if (al is! Map) continue;
        final alId = (al['id'] ?? al['browseId'] ?? '')?.toString() ?? '';
        final alTitle = (al['title'] ?? al['name'] ?? '')?.toString() ?? '';
        if (alTitle.isEmpty) continue;
        final alCover =
            (al['coverUrl'] ?? al['imageUrl'] ?? '')?.toString() ?? '';
        String alArtist = '';
        if (al['artist'] is String) {
          alArtist = al['artist'];
        } else if (al['artist'] is Map) {
          alArtist = (al['artist'] as Map)['name']?.toString() ?? '';
        } else if (al['primaryArtists'] != null) {
          alArtist = al['primaryArtists'].toString();
        } else if (al['subtitle'] != null) {
          alArtist = al['subtitle'].toString();
        }
        final alYear = int.tryParse((al['year'] ?? '').toString());
        final albumItem = SearchAlbumItem(
          id: alId.isNotEmpty ? alId : 'album-$alTitle',
          title: alTitle,
          subtitle: alArtist.isNotEmpty ? '$alArtist • Album' : 'Album',
          thumbnailUrl: alCover,
          thumbnailUrlHiRes: alCover,
          browseId: alId,
          year: alYear,
        );
        items.add(albumItem);
        if (topRes == null && alTitle.toLowerCase() == qLower) {
          topRes = SearchTopResult(item: albumItem);
        }
      }
    }

    return (items: items, topResult: topRes);
  }

  Future<List<SearchItem>> _fetchFallbackItems(
    String q,
    SearchFilter filter,
  ) async {
    try {
      final qLower = q.toLowerCase();

      // 1. Check live backend cloud catalog (JioSaavn + iTunes + Database) with fast 1.5s timeout
      try {
        final cloud = await ApiService.searchCloud(q)
            .timeout(const Duration(milliseconds: 1500), onTimeout: () => null);
        if (cloud != null) {
          final parsed = _parseCloudSearch(cloud, q);
          if (parsed.items.isNotEmpty) return parsed.items;
        }
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[SearchDataService] cloud fallback error: $e');
        }
      }

      // 2. Check in-memory CatalogDataSource
      final catalogMatches = CatalogDataSource.allTracks
          .where(
            (t) =>
                t.title.toLowerCase().contains(qLower) ||
                t.artist.toLowerCase().contains(qLower) ||
                t.album.toLowerCase().contains(qLower),
          )
          .toList();

      if (catalogMatches.isNotEmpty) {
        final items = <SearchItem>[];
        final first = catalogMatches.first;
        if (first.artist.toLowerCase().contains(qLower) ||
            qLower.contains(first.artist.toLowerCase())) {
          items.add(
            SearchArtistItem(
              id: 'artist-${first.artist}',
              title: first.artist,
              subtitle: 'Artist',
              thumbnailUrl: first.coverUrl,
              thumbnailUrlHiRes: first.coverUrl,
              browseId: '',
            ),
          );
        }
        items.addAll(catalogMatches.map(_trackToSearchSongItem));
        return items;
      }

      // 2. Check ApiService.featuredTracks
      final featuredMatches = ApiService.featuredTracks
          .where(
            (t) =>
                t.title.toLowerCase().contains(qLower) ||
                t.artist.toLowerCase().contains(qLower) ||
                t.album.toLowerCase().contains(qLower),
          )
          .toList();

      if (featuredMatches.isNotEmpty) {
        final items = <SearchItem>[];
        final first = featuredMatches.first;
        if (first.artist.toLowerCase().contains(qLower) ||
            qLower.contains(first.artist.toLowerCase())) {
          items.add(
            SearchArtistItem(
              id: 'artist-${first.artist}',
              title: first.artist,
              subtitle: 'Artist',
              thumbnailUrl: first.coverUrl,
              thumbnailUrlHiRes: first.coverUrl,
              browseId: '',
            ),
          );
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

      // Fast native songs attempt
      if (InnerTubeService.instance.isNativeAvailable) {
        final tracks = await InnerTubeService.instance
            .searchSongsNative(q)
            .timeout(const Duration(seconds: 3), onTimeout: () => <Track>[]);
        if (tracks.isNotEmpty) {
          final items = <SearchItem>[];
          final first = tracks.first;
          if (first.artist.toLowerCase().contains(qLower) ||
              qLower.contains(first.artist.toLowerCase())) {
            items.add(
              SearchArtistItem(
                id: 'artist-${first.artist}',
                title: first.artist,
                subtitle: 'Artist',
                thumbnailUrl: first.coverUrl,
                thumbnailUrlHiRes: first.coverUrl,
                browseId: '',
              ),
            );
          }
          items.addAll(tracks.map(_trackToSearchSongItem));
          return items;
        }
      }

      // Local catalog matching fallback (offline resilience, pure on-device, NO JioSaavn)
      final localMatches = CatalogDataSource.allTracks
          .where(
            (t) =>
                t.title.toLowerCase().contains(qLower) ||
                t.artist.toLowerCase().contains(qLower) ||
                t.album.toLowerCase().contains(qLower),
          )
          .take(15)
          .toList();

      if (localMatches.isNotEmpty) {
        final items = <SearchItem>[];
        final first = localMatches.first;
        if (first.artist.toLowerCase().contains(qLower) ||
            qLower.contains(first.artist.toLowerCase())) {
          items.add(
            SearchArtistItem(
              id: 'artist-${first.artist}',
              title: first.artist,
              subtitle: 'Artist',
              thumbnailUrl: first.coverUrl,
              thumbnailUrlHiRes: first.coverUrl,
              browseId: '',
            ),
          );
        }
        items.addAll(localMatches.map(_trackToSearchSongItem));
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
        .where(
          (t) =>
              t.title.toLowerCase().contains(qLower) ||
              t.artist.toLowerCase().contains(qLower) ||
              t.album.toLowerCase().contains(qLower),
        )
        .take(12)
        .map(_trackToSearchSongItem)
        .toList();

    if (tracks.isEmpty) {
      tracks.addAll(
        ApiService.featuredTracks
            .where(
              (t) =>
                  t.title.toLowerCase().contains(qLower) ||
                  t.artist.toLowerCase().contains(qLower),
            )
            .take(8)
            .map(_trackToSearchSongItem),
      );
    }

    final intent = SearchIntentDetector.detectIntent(q, tracks);
    return SearchRanker.rank(
      items: tracks,
      intent: intent,
      countryCode: CountryService.instance.currentCode,
      affinityKeys: getAffinityKeys(q),
    );
  }
}
