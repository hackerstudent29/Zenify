import 'dart:collection';
import 'dart:math' as math;

import '../../models/track.dart';
import 'search_models.dart';

/// Configuration of all weights, thresholds, and limits for search ranking.
class SearchRankingConfig {
  const SearchRankingConfig._();

  // Thresholds & Windows
  static const double kArtistIntentThreshold = 0.85;
  static const double kCountryTiebreakWindow = 0.15;
  static const double kMinMatchThreshold = 0.20;

  // Cache & Trie Limits
  static const int kLruCacheCapacity = 100;
  static const Duration kLruCacheTtl = Duration(minutes: 10);
  static const int kMaxRecentSearches = 20;

  // Shelf Section Capacities in Overview View
  static const int kMaxSongsInOverview = 25;
  static const int kMaxArtistsInOverview = 20;
  static const int kMaxAlbumsInOverview = 25;
  static const int kMaxPlaylistsInOverview = 25;
  static const int kMaxVideosInOverview = 20;
  static const int kMaxPodcastsInOverview = 12;
}

/// Intent-adaptive ranking profile weights (sum strictly to 1.00).
class RankingWeights {
  const RankingWeights({
    required this.textMatch,
    required this.artistMatch,
    required this.entityFit,
    required this.providerRank,
    required this.popularity,
    required this.personalization,
    this.quality = 0.0,
  });

  final double textMatch;
  final double artistMatch;
  final double entityFit;
  final double providerRank;
  final double popularity;
  final double personalization;
  final double quality;

  /// Exact song search: Textual title match is dominant (55%), artist helps disambiguate (17%).
  /// Personalization is a gentle tie-breaker (3%) that can never overpower query intent.
  static const exactSong = RankingWeights(
    textMatch: 0.55,
    artistMatch: 0.17,
    entityFit: 0.10,
    providerRank: 0.08,
    popularity: 0.07,
    personalization: 0.03,
  );

  /// Broad music search: Blends text, entity fit, popularity, provider ranking, and discovery context.
  static const broad = RankingWeights(
    textMatch: 0.40,
    artistMatch: 0.00,
    entityFit: 0.15,
    popularity: 0.17,
    providerRank: 0.12,
    personalization: 0.12, // 7% regional + 5% personal
    quality: 0.04,
  );

  /// Artist-focused search: Prioritizes exact artist identity and popularity.
  static const exactArtist = RankingWeights(
    textMatch: 0.50,
    artistMatch: 0.20,
    entityFit: 0.12,
    providerRank: 0.08,
    popularity: 0.07,
    personalization: 0.03,
  );

  /// Album-focused search: Prioritizes album title, correct artist attribution, and release popularity.
  static const exactAlbum = RankingWeights(
    textMatch: 0.50,
    artistMatch: 0.18,
    entityFit: 0.12,
    providerRank: 0.08,
    popularity: 0.09,
    personalization: 0.03,
  );
}

/// Normalization, transliteration, and phonetic utilities for multilingual & international search.
class QueryPreprocessor {
  QueryPreprocessor._();

  static final RegExp _diacriticsRegex = RegExp(r'[\u0300-\u036f]');
  static final RegExp _punctuationRegex = RegExp(
    r'[^\p{L}\p{N}\s]',
    unicode: true,
  );
  static final RegExp _whitespaceRegex = RegExp(r'\s+');

  /// Normalizes a query or entity string: lowercase, strips combining diacritics, cleans punctuation.
  static String normalize(String input) {
    if (input.isEmpty) return '';
    var s = input.toLowerCase().trim();

    // Remove combining diacritics (e.g. é -> e, à -> a, ö -> o)
    s = s.replaceAllMapped(_diacriticsRegex, (_) => '');

    // Replace hyphens, slashes, underscores with spaces
    s = s.replaceAll(RegExp(r'[-_/|•]'), ' ');

    // Strip non-alphanumeric punctuation while preserving multilingual scripts
    s = s.replaceAll(_punctuationRegex, '');

    // Collapse multiple spaces
    s = s.replaceAll(_whitespaceRegex, ' ').trim();
    return s;
  }

  /// Global phonetic key:
  /// Collapses vowel elongations (aa->a, ee->i, oo->u, ou->u) and soft aspirate variations
  /// (gh->g, bh->b, kh->k, ph->f) and consecutive doubled consonants.
  /// CRITICAL: Does NOT apply destructive replacements like zh->l, v->w, sh->s, dh->d
  /// which destroy international artist names (The Weeknd, Zhavia, David Guetta, Vance Joy, Shakira).
  static String phoneticKey(String input) {
    var s = normalize(input);
    if (s.isEmpty) return '';

    // Vowel elongation collapse
    s = s.replaceAll('aa', 'a');
    s = s.replaceAll('ee', 'i');
    s = s.replaceAll('oo', 'u');
    s = s.replaceAll('ou', 'u');
    s = s.replaceAll('ai', 'ay');

    // Soft consonant aspirate normalization (safe globally)
    s = s.replaceAll('gh', 'g');
    s = s.replaceAll('bh', 'b');
    s = s.replaceAll('kh', 'k');
    s = s.replaceAll('ph', 'f');

    // Collapse doubled characters (e.g. "sinng" -> "sing", "anirudhh" -> "anirudh")
    final buffer = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i == 0 || s[i] != s[i - 1]) {
        buffer.write(s[i]);
      }
    }
    return buffer.toString().trim();
  }

  /// Secondary Indic transliteration key:
  /// Used ONLY as a secondary fuzzy matching signal for Indic regional queries,
  /// preventing pollution of standard Latin and international searches.
  static String indicTranslitKey(String input) {
    var s = phoneticKey(input);
    if (s.isEmpty) return '';
    s = s.replaceAll('zh', 'l');
    s = s.replaceAll('th', 't');
    s = s.replaceAll('dh', 'd');
    s = s.replaceAll('v', 'w');
    s = s.replaceAll('sh', 's');
    return s;
  }

  /// Tokenizes normalized text into non-empty words.
  static List<String> tokenize(String input) {
    final norm = normalize(input);
    if (norm.isEmpty) return const [];
    return norm.split(' ').where((w) => w.isNotEmpty).toList();
  }

  /// Parses human-readable view/subscriber counts (e.g. "14.2M", "500K", "1.2B").
  static int parseCountString(String? text) {
    if (text == null || text.trim().isEmpty) return 0;
    final match = RegExp(r'([\d.]+)\s*([KMBkmb])?').firstMatch(text.trim());
    if (match == null) return 0;
    final numVal = double.tryParse(match.group(1) ?? '') ?? 0.0;
    final unit = match.group(2)?.toUpperCase();
    if (unit == 'B') return (numVal * 1000000000).toInt();
    if (unit == 'M') return (numVal * 1000000).toInt();
    if (unit == 'K') return (numVal * 1000).toInt();
    return numVal.toInt();
  }
}

/// Similarity functions (Jaro-Winkler, Jaccard token overlap, Damerau-Levenshtein).
class TextSimilarity {
  TextSimilarity._();

  /// Computes Jaro-Winkler similarity between s1 and s2 in [0, 1].
  static double jaroWinkler(String s1, String s2) {
    if (s1 == s2) return 1.0;
    if (s1.isEmpty || s2.isEmpty) return 0.0;

    final l1 = s1.length;
    final l2 = s2.length;
    final matchDistance = math.max(l1, l2) ~/ 2 - 1;

    final s1Matches = List<bool>.filled(l1, false);
    final s2Matches = List<bool>.filled(l2, false);

    int matches = 0;
    int transpositions = 0;

    for (int i = 0; i < l1; i++) {
      final start = math.max(0, i - matchDistance);
      final end = math.min(i + matchDistance + 1, l2);

      for (int j = start; j < end; j++) {
        if (s2Matches[j]) continue;
        if (s1[i] != s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches == 0) return 0.0;

    int k = 0;
    for (int i = 0; i < l1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) {
        k++;
      }
      if (s1[i] != s2[k]) transpositions++;
      k++;
    }

    final double jaro =
        ((matches / l1) +
            (matches / l2) +
            ((matches - transpositions / 2) / matches)) /
        3.0;

    // Winkler prefix adjustment
    int prefix = 0;
    for (int i = 0; i < math.min(4, math.min(l1, l2)); i++) {
      if (s1[i] == s2[i]) {
        prefix++;
      } else {
        break;
      }
    }

    return (jaro + prefix * 0.1 * (1.0 - jaro)).clamp(0.0, 1.0);
  }

  /// Computes Damerau-Levenshtein normalized similarity in [0, 1].
  static double damerauLevenshtein(String s1, String s2) {
    if (s1 == s2) return 1.0;
    if (s1.isEmpty || s2.isEmpty) return 0.0;
    final l1 = s1.length;
    final l2 = s2.length;
    final maxLen = math.max(l1, l2);

    final d = List.generate(l1 + 1, (_) => List<int>.filled(l2 + 1, 0));
    for (int i = 0; i <= l1; i++) {
      d[i][0] = i;
    }
    for (int j = 0; j <= l2; j++) {
      d[0][j] = j;
    }

    for (int i = 1; i <= l1; i++) {
      for (int j = 1; j <= l2; j++) {
        final cost = s1[i - 1] == s2[j - 1] ? 0 : 1;
        d[i][j] = math.min(
          d[i - 1][j] + 1,
          math.min(d[i][j - 1] + 1, d[i - 1][j - 1] + cost),
        );
        if (i > 1 &&
            j > 1 &&
            s1[i - 1] == s2[j - 2] &&
            s1[i - 2] == s2[j - 1]) {
          d[i][j] = math.min(d[i][j], d[i - 2][j - 2] + cost);
        }
      }
    }
    final distance = d[l1][l2];
    return (1.0 - (distance / maxLen)).clamp(0.0, 1.0);
  }

  /// Computes Jaccard similarity between two token sets in [0, 1].
  static double jaccard(List<String> t1, List<String> t2) {
    if (t1.isEmpty && t2.isEmpty) return 1.0;
    if (t1.isEmpty || t2.isEmpty) return 0.0;

    final set1 = t1.toSet();
    final set2 = t2.toSet();
    final intersection = set1.intersection(set2).length;
    final union = set1.union(set2).length;
    return union == 0 ? 0.0 : intersection / union;
  }
}

/// Detects query intent, target entity, explicit type requests, and modifiers.
class SearchIntentDetector {
  SearchIntentDetector._();

  static final Map<String, SearchItemType> _typeKeywords = {
    'songs': SearchItemType.song,
    'song': SearchItemType.song,
    'tracks': SearchItemType.song,
    'track': SearchItemType.song,
    'audio': SearchItemType.song,
    'albums': SearchItemType.album,
    'album': SearchItemType.album,
    'single': SearchItemType.album,
    'singles': SearchItemType.album,
    'ep': SearchItemType.album,
    'eps': SearchItemType.album,
    'playlists': SearchItemType.playlist,
    'playlist': SearchItemType.playlist,
    'mix': SearchItemType.playlist,
    'mixes': SearchItemType.playlist,
    'videos': SearchItemType.video,
    'video': SearchItemType.video,
    'mv': SearchItemType.video,
    'podcasts': SearchItemType.podcast,
    'podcast': SearchItemType.podcast,
    'episodes': SearchItemType.podcast,
    'episode': SearchItemType.podcast,
    'artist': SearchItemType.artist,
    'artists': SearchItemType.artist,
    'singer': SearchItemType.artist,
    'singers': SearchItemType.artist,
    'band': SearchItemType.artist,
  };

  static final Set<String> _modifierKeywords = {
    'lyrics',
    'lyric',
    'live',
    'remix',
    'cover',
    'instrumental',
    'karaoke',
    'acoustic',
    'slowed',
    'reverb',
    'sped',
    'bgm',
    'theme',
  };

  static final Set<String> _playlistVibeKeywords = {
    'playlist',
    'playlists',
    'hits',
    'best of',
    'top 50',
    'top 100',
    'mix',
    'mixes',
    'beats',
    'chill',
    'workout',
    'gym',
    'party',
    'lofi',
    'radio',
    'devotional',
    'bhajan',
    'meditation',
    'sleep',
    'road trip',
    'driving',
    'summer',
    'winter',
    'acoustic',
    'unplugged',
    '90s',
    '2000s',
    '2010s',
    '2020s',
    'party songs',
    'dance hits',
  };

  /// Fast preliminary intent detection from raw query tokens before dispatching network streams.
  static SearchItemType? detectPreliminaryIntent(String rawQuery) {
    final tokens = QueryPreprocessor.tokenize(rawQuery);
    for (final token in tokens) {
      if (_typeKeywords.containsKey(token)) {
        return _typeKeywords[token];
      }
    }
    return null;
  }

  /// Analyzes query terms and candidate items to detect intent and layout mode.
  static SearchIntent detectIntent(String rawQuery, List<SearchItem> rawItems) {
    final normalized = QueryPreprocessor.normalize(rawQuery);
    final tokens = QueryPreprocessor.tokenize(normalized);

    SearchItemType? intentType;
    final modifiers = <String>[];
    final remainingTokens = <String>[];

    for (final token in tokens) {
      if (_typeKeywords.containsKey(token)) {
        intentType = _typeKeywords[token];
      } else if (_modifierKeywords.contains(token)) {
        modifiers.add(token);
      } else {
        remainingTokens.add(token);
      }
    }

    final entityText = remainingTokens.join(' ').trim();
    final effectiveEntity = entityText.isNotEmpty ? entityText : normalized;

    // 1. Direct song title match check
    double bestSongScore = 0.0;
    for (final it in rawItems.whereType<SearchSongItem>()) {
      final sNorm = QueryPreprocessor.normalize(it.title);
      final isExact = sNorm == effectiveEntity;
      final isPrefix =
          sNorm.startsWith(effectiveEntity) && effectiveEntity.length >= 3;
      final score = isExact
          ? 1.0
          : (isPrefix ? 0.90 : _computeTextScore(effectiveEntity, sNorm));
      if (score > bestSongScore) {
        bestSongScore = score;
      }
    }
    final hasStrongSongMatch = bestSongScore >= 0.82;

    // 2. Direct artist name match check
    bool artistIntent = false;
    String? matchedArtistBrowseId;
    String? matchedArtistName;
    double bestArtistScore = 0.0;

    final artistCandidates = rawItems.whereType<SearchArtistItem>().toList();
    for (final artist in artistCandidates) {
      final artistNorm = QueryPreprocessor.normalize(artist.name);
      final isExact = effectiveEntity == artistNorm;
      final isPrefix =
          (artistNorm.startsWith(effectiveEntity) ||
              effectiveEntity.startsWith(artistNorm)) &&
          effectiveEntity.length >= 3;
      final score = isExact
          ? 1.0
          : (isPrefix ? 0.92 : _computeTextScore(effectiveEntity, artistNorm));
      if (score > bestArtistScore) {
        bestArtistScore = score;
      }
      final isExplicitArtist = intentType == SearchItemType.artist;
      if (isExplicitArtist ||
          isExact ||
          (isPrefix && !hasStrongSongMatch) ||
          (score >= 0.88 && !hasStrongSongMatch)) {
        artistIntent = true;
        matchedArtistBrowseId = artist.browseId;
        matchedArtistName = artist.name;
        break;
      }
    }

    // 3. Direct album / movie title match check
    bool albumIntent = false;
    double bestAlbumScore = 0.0;
    for (final album in rawItems.whereType<SearchAlbumItem>()) {
      final albNorm = QueryPreprocessor.normalize(album.title);
      final isExact = effectiveEntity == albNorm;
      final isPrefix =
          (albNorm.startsWith(effectiveEntity) ||
              effectiveEntity.startsWith(albNorm)) &&
          effectiveEntity.length >= 3;
      final score = isExact
          ? 1.0
          : (isPrefix ? 0.90 : _computeTextScore(effectiveEntity, albNorm));
      if (score > bestAlbumScore) {
        bestAlbumScore = score;
      }
      final isExplicitAlbum = intentType == SearchItemType.album;
      if (isExplicitAlbum ||
          (isExact && !artistIntent) ||
          (isPrefix && !artistIntent && !hasStrongSongMatch)) {
        albumIntent = true;
        break;
      }
    }

    // 4. Playlist / Vibe match check
    final isPlaylistKeyword = _playlistVibeKeywords.any(
      (kw) => normalized.contains(kw),
    );
    final isLanguagePlaylist = SearchRanker._countryLanguages.values.any(
      (langs) =>
          langs.any((l) => normalized.contains(l)) &&
          (normalized.contains('song') ||
              normalized.contains('hit') ||
              normalized.contains('playlist')),
    );
    final hasPlaylistIntent =
        intentType == SearchItemType.playlist ||
        isPlaylistKeyword ||
        isLanguagePlaylist;

    // Determine layout mode
    SearchLayoutMode mode;
    if (artistIntent && intentType != null) {
      // 1. Artist + type query (e.g. "anirudh songs", "anirudh albums")
      mode = SearchLayoutMode.artistType;
    } else if (artistIntent && intentType == null && modifiers.isEmpty) {
      // 2. Exact artist query (e.g. "anirudh", "anirudh ravichander", "arijit singh")
      mode = SearchLayoutMode.exactArtist;
    } else if (albumIntent ||
        hasPlaylistIntent ||
        intentType == SearchItemType.album ||
        intentType == SearchItemType.playlist) {
      // 3. Explicit album, movie, or playlist query (e.g. "jailer", "leo", "tamil hits", "workout")
      mode = SearchLayoutMode.albumOrPlaylist;
    } else if (hasStrongSongMatch) {
      // 4. Song title query (e.g. "arabic kuthu", "hukum", "chaleya")
      mode = SearchLayoutMode.songTitle;
    } else {
      // 5. Generic or mixed query
      mode = SearchLayoutMode.generic;
    }

    return SearchIntent(
      originalQuery: rawQuery,
      normalizedQuery: normalized,
      entityText: effectiveEntity,
      intentType: intentType,
      modifiers: modifiers,
      artistIntent: artistIntent,
      matchedArtistBrowseId: matchedArtistBrowseId,
      matchedArtistName: matchedArtistName,
      layoutMode: mode,
    );
  }

  static double _computeTextScore(String q, String target) {
    if (q == target) return 1.0;
    if (target.startsWith(q)) return 0.90;
    if (target.contains(q)) return 0.80;
    return TextSimilarity.jaroWinkler(q, target);
  }
}

/// Production multi-stage ranking engine for Zenify search results.
class SearchRanker {
  SearchRanker._();

  static final Map<String, List<String>> _countryLanguages = {
    'IN': [
      'tamil',
      'telugu',
      'hindi',
      'malayalam',
      'punjabi',
      'kannada',
      'bengali',
      'marathi',
    ],
    'US': ['english', 'spanish'],
    'GB': ['english'],
    'CA': ['english', 'french'],
    'AU': ['english'],
    'DE': ['german'],
    'FR': ['french'],
    'BR': ['portuguese'],
    'JP': ['japanese'],
    'KR': ['korean'],
  };

  /// Main ranking function: fuses candidate streams using Reciprocal Rank Fusion (RRF),
  /// deduplicates, applies intent-adaptive multi-stage scoring, stably sorts, and structures sections.
  static SearchResult rank({
    required List<SearchItem> items,
    required SearchIntent intent,
    required String countryCode,
    Set<String> affinityKeys = const {},
    List<String> preferredLanguages = const [],
    List<String> favoriteArtists = const [],
    SearchTopResult? initialTopResult,
    String? didYouMean,
    String? continuation,
    Map<String, int> streamLatenciesMs = const {},
    List<String> querySuggestions = const [],
  }) {
    // 1. Stage A: Multi-Stream Reciprocal Rank Fusion (RRF) & Deduplication
    final rrfScores = _computeReciprocalRankFusion(items);
    final dedupedItems = _deduplicate(items);

    if (dedupedItems.isEmpty && initialTopResult == null) {
      return SearchResult(
        originalQuery: intent.originalQuery,
        intent: intent,
        correctedQuery: didYouMean,
        continuation: continuation,
        suggestions: querySuggestions,
        diagnostics: SearchDiagnostics(
          query: intent.originalQuery,
          normalizedQuery: intent.normalizedQuery,
          detectedIntent: intent,
          country: countryCode,
          requestLanguage: 'en',
          streamsQueried: const ['general'],
          streamLatenciesMs: streamLatenciesMs,
          totalCandidates: items.length,
          dedupedCandidates: 0,
        ),
      );
    }

    // 2. Select Intent-Adaptive Ranking Profile
    final weights = _resolveRankingWeights(intent);

    // 3. First-pass textMatch calculation to locate highest textMatch score
    double maxTextMatch = 0.0;
    final textScores = <String, double>{};
    for (final it in dedupedItems) {
      final s = _calculateTextMatch(it, intent);
      textScores[it.id] = s;
      if (s > maxTextMatch) maxTextMatch = s;
    }

    // 4. Score Each Item
    final scoredItems = <SearchItem>[];
    final candidateBreakdowns = <CandidateDiagnostics>[];

    for (final it in dedupedItems) {
      final textScore = textScores[it.id] ?? 0.0;
      final rrfScore = rrfScores[it.id] ?? 0.0;

      final breakdown = _calculateScoringBreakdown(
        item: it,
        intent: intent,
        countryCode: countryCode,
        preferredLanguages: preferredLanguages,
        favoriteArtists: favoriteArtists,
        textScore: textScore,
        maxTextMatch: maxTextMatch,
        rrfScore: rrfScore,
        weights: weights,
        affinityKeys: affinityKeys,
      );

      candidateBreakdowns.add(breakdown);
      scoredItems.add(it.copyWithScore(breakdown.finalScore));
    }

    // 5. Stable Sort: finalScore desc, providerRank asc, id asc
    scoredItems.sort((a, b) {
      final cmpScore = b.finalScore.compareTo(a.finalScore);
      if (cmpScore != 0) return cmpScore;

      final cmpRank = a.providerRank.compareTo(b.providerRank);
      if (cmpRank != 0) return cmpRank;

      return a.id.compareTo(b.id);
    });

    // 6. Resolve Top Result (Hero Card) strictly matching detected intent & popularity
    SearchTopResult? topResult;
    if (intent.layoutMode == SearchLayoutMode.exactArtist) {
      final artistItem = scoredItems.whereType<SearchArtistItem>().firstOrNull;
      if (artistItem != null) {
        topResult = _createTopResultFromItem(artistItem);
      }
    } else if (intent.layoutMode == SearchLayoutMode.albumOrPlaylist) {
      final playlistItem = scoredItems
          .whereType<SearchPlaylistItem>()
          .firstOrNull;
      final albumItem = scoredItems.whereType<SearchAlbumItem>().firstOrNull;
      if (intent.intentType == SearchItemType.playlist ||
          (playlistItem != null && albumItem == null)) {
        if (playlistItem != null) {
          topResult = _createTopResultFromItem(playlistItem);
        }
      } else if (albumItem != null) {
        topResult = _createTopResultFromItem(albumItem);
      }
    } else if (intent.layoutMode == SearchLayoutMode.songTitle) {
      final songItem = scoredItems.whereType<SearchSongItem>().firstOrNull;
      if (songItem != null) {
        topResult = _createTopResultFromItem(songItem);
      }
    }

    if (topResult == null && initialTopResult != null) {
      topResult = initialTopResult;
    } else if (topResult == null && scoredItems.isNotEmpty) {
      final best = scoredItems.first;
      if (best.finalScore >= 0.40) {
        topResult = _createTopResultFromItem(best);
      }
    }

    // 7. Group items into shelves according to Layout Mode
    final sections = _buildSections(
      sortedItems: scoredItems,
      intent: intent,
      topResultItem: topResult?.item,
    );

    final diagnostics = SearchDiagnostics(
      query: intent.originalQuery,
      normalizedQuery: intent.normalizedQuery,
      detectedIntent: intent,
      country: countryCode,
      requestLanguage: 'en',
      streamsQueried: streamLatenciesMs.keys.toList(),
      streamLatenciesMs: streamLatenciesMs,
      totalCandidates: items.length,
      dedupedCandidates: dedupedItems.length,
      candidateBreakdowns: candidateBreakdowns,
    );

    return SearchResult(
      topResult: topResult,
      sections: sections,
      correctedQuery: didYouMean,
      originalQuery: intent.originalQuery,
      continuation: continuation,
      intent: intent,
      diagnostics: diagnostics,
      suggestions: querySuggestions,
    );
  }

  // ─────────────────────────── Multi-Stage Scoring ───────────────────────────

  static RankingWeights _resolveRankingWeights(SearchIntent intent) {
    switch (intent.layoutMode) {
      case SearchLayoutMode.exactArtist:
        return RankingWeights.exactArtist;
      case SearchLayoutMode.artistType:
        return intent.intentType == SearchItemType.album
            ? RankingWeights.exactAlbum
            : RankingWeights.exactSong;
      case SearchLayoutMode.songTitle:
        return RankingWeights.exactSong;
      case SearchLayoutMode.albumOrPlaylist:
        return RankingWeights.exactAlbum;
      case SearchLayoutMode.generic:
        return RankingWeights.broad;
    }
  }

  /// Calculates itemized scoring components strictly adhering to the normalized weights budget.
  static CandidateDiagnostics _calculateScoringBreakdown({
    required SearchItem item,
    required SearchIntent intent,
    required String countryCode,
    required List<String> preferredLanguages,
    required List<String> favoriteArtists,
    required double textScore,
    required double maxTextMatch,
    required double rrfScore,
    required RankingWeights weights,
    Set<String> affinityKeys = const {},
  }) {
    // 1. Text Component
    final textComponent = textScore * weights.textMatch;

    // 2. Artist Component (Disambiguation)
    double artistMatch = 0.5;
    if (intent.artistIntent && intent.matchedArtistName != null) {
      final aNorm = intent.matchedArtistName!.toLowerCase();
      if (item is SearchArtistItem) {
        artistMatch = (item.name.toLowerCase() == aNorm) ? 1.0 : 0.5;
      } else if (item is SearchSongItem) {
        final isPrimary =
            item.artists.isNotEmpty &&
            item.artists.first.name.toLowerCase() == aNorm;
        final isCollab = item.artists.any((a) => a.name.toLowerCase() == aNorm);
        artistMatch = isPrimary ? 1.0 : (isCollab ? 0.85 : 0.35);
      } else if (item is SearchAlbumItem) {
        final isPrimary =
            item.artists.isNotEmpty &&
            item.artists.first.name.toLowerCase() == aNorm;
        artistMatch = isPrimary ? 1.0 : 0.40;
      }
    } else {
      artistMatch = textScore >= 0.80 ? 0.85 : 0.50;
    }
    final artistComponent = artistMatch * weights.artistMatch;

    // 3. Entity Type Fit
    double entityFit = 0.5;
    if (intent.artistIntent) {
      if (item is SearchArtistItem) {
        entityFit = 1.0;
      } else if (item is SearchSongItem) {
        entityFit = (intent.intentType == SearchItemType.song) ? 1.0 : 0.70;
      } else if (item is SearchAlbumItem) {
        entityFit = (intent.intentType == SearchItemType.album) ? 1.0 : 0.65;
      }
    } else if (intent.intentType != null) {
      entityFit = (item.type == intent.intentType) ? 1.0 : 0.40;
    } else if (item is SearchSongItem) {
      entityFit = 0.90;
    }
    final entityComponent = entityFit * weights.entityFit;

    // 4. Provider Rank / RRF Component
    final providerComponent = rrfScore * weights.providerRank;

    // 5. Popularity Component (Standard Reference-Scale Normalization)
    final popNorm = _normalizePopularity(item);
    final popComponent = popNorm * weights.popularity;

    // 6. Context & Personalization (Strict Non-Overpowering Budget)
    double contextScore = 0.0;
    final itemLang = _detectItemLanguage(item);

    if (itemLang != null && itemLang.isNotEmpty) {
      final userLangsLower = preferredLanguages
          .map((l) => l.toLowerCase().trim())
          .toList();
      if (userLangsLower.contains(itemLang.toLowerCase().trim())) {
        contextScore += 0.50; // Moderate user language affinity
      }
    }

    if (item is SearchSongItem) {
      final isFav = favoriteArtists.any(
        (fa) =>
            item.artists.any((a) => a.name.toLowerCase() == fa.toLowerCase()),
      );
      if (isFav) contextScore += 0.40;
    } else if (item is SearchArtistItem) {
      final isFav = favoriteArtists.any(
        (fa) => item.name.toLowerCase() == fa.toLowerCase(),
      );
      if (isFav) contextScore += 0.50;
    }

    final countrySignal = _evaluateCountrySignal(item, countryCode);
    if (countrySignal == 2) {
      contextScore += 0.30;
    } else if (countrySignal == 1) {
      contextScore += 0.15;
    }

    // Context is only active if text match is viable (never rescues completely unrelated queries)
    double personalComponent = 0.0;
    if (textScore >= 0.30 || (maxTextMatch - textScore <= 0.15)) {
      personalComponent =
          contextScore.clamp(0.0, 1.0) * weights.personalization;
    }

    // 7. Quality & Penalties
    double qualityBoost = 0.0;
    double penalties = 0.0;

    if (item is SearchSongItem) {
      if (item.isOfficialAudio) qualityBoost += 0.08;
      final tLower = item.title.toLowerCase();
      final qLower = intent.normalizedQuery;

      if (tLower.contains('cover') && !qLower.contains('cover')) {
        penalties += 0.25;
      }
      if (tLower.contains('karaoke') && !qLower.contains('karaoke')) {
        penalties += 0.30;
      }
      if (tLower.contains('reaction') && !qLower.contains('reaction')) {
        penalties += 0.40;
      }
      if (tLower.contains('live') && !qLower.contains('live')) {
        penalties += 0.10;
      }
      if ((tLower.contains('8d') ||
              tLower.contains('slowed') ||
              tLower.contains('reverb')) &&
          !qLower.contains('8d') &&
          !qLower.contains('slowed')) {
        penalties += 0.20;
      }
    } else if (item is SearchArtistItem) {
      if (item.isVerified) qualityBoost += 0.08;
    }

    final qualityComponent = qualityBoost * weights.quality;

    if (textScore < SearchRankingConfig.kMinMatchThreshold) {
      penalties += 0.25;
    }

    // Affinity Signal: User previously tapped this item for this exact search query.
    // Boost priority so it surfaces at the top / below top result.
    double affinityBoost = 0.0;
    if (affinityKeys.isNotEmpty) {
      final itemId = item.id.toLowerCase();
      final itemTitle = item.title.trim().toLowerCase();
      final itemSub = item.subtitle.trim().toLowerCase();
      if (affinityKeys.contains(itemId) ||
          affinityKeys.contains(itemTitle) ||
          (itemSub.isNotEmpty && affinityKeys.contains(itemSub))) {
        affinityBoost = 0.50;
      }
    }

    final rawScore =
        textComponent +
        artistComponent +
        entityComponent +
        providerComponent +
        popComponent +
        personalComponent +
        qualityComponent +
        affinityBoost -
        penalties;

    final finalScore = rawScore.clamp(0.0, 1.0);

    return CandidateDiagnostics(
      id: item.id,
      title: item.title,
      type: item.type,
      sourceStream: item.sourceStream,
      providerRank: item.providerRank,
      textScore: textScore,
      entityScore: entityFit,
      popularityScore: popNorm,
      rrfScore: rrfScore,
      contextScore: contextScore.clamp(0.0, 1.0),
      qualityScore: qualityBoost,
      penalties: penalties,
      finalScore: finalScore,
    );
  }

  /// Reference-scale popularity normalization (log10 benchmark).
  static double _normalizePopularity(SearchItem item) {
    if (item is SearchArtistItem) {
      final count =
          item.subscriberCount ??
          QueryPreprocessor.parseCountString(item.subscriberText);
      if (count > 0) {
        // 20M subscribers = 1.0, 1M = 0.82, 100K = 0.68
        return (math.log(1.0 + count) / math.ln10 / 7.3).clamp(0.0, 1.0);
      }
      return 0.35;
    }
    if (item is SearchVideoItem) {
      final views = item.views > 0
          ? item.views
          : QueryPreprocessor.parseCountString(item.viewCountText);
      if (views > 0) {
        // 100M views = 1.0, 10M = 0.875, 1M = 0.75
        return (math.log(1.0 + views) / math.ln10 / 8.0).clamp(0.0, 1.0);
      }
      return 0.35;
    }
    if (item is SearchSongItem) {
      if (item.isOfficialAudio) return 0.70;
      return 0.45;
    }
    return 0.35;
  }

  /// Reciprocal Rank Fusion (RRF) across streams: RRF(d) = sum(w_s / (60 + rank_s(d)))
  static Map<String, double> _computeReciprocalRankFusion(
    List<SearchItem> items,
  ) {
    const k = 60.0;
    final rrfMap = <String, double>{};

    for (final it in items) {
      final rank = it.providerRank;
      final weight = it.sourceStream == 'general' ? 1.0 : 1.1;
      final score = weight / (k + rank);
      rrfMap[it.id] = (rrfMap[it.id] ?? 0.0) + score;
    }

    // Normalize RRF scores to [0, 1]
    final normalized = <String, double>{};
    for (final entry in rrfMap.entries) {
      normalized[entry.key] = (entry.value * 30.0).clamp(0.0, 1.0);
    }
    return normalized;
  }

  // ─────────────────────────── Text Match Calculation ────────────────────────

  static double _calculateTextMatch(SearchItem item, SearchIntent intent) {
    final q = intent.entityText.isNotEmpty
        ? intent.entityText
        : intent.normalizedQuery;
    final qTokens = QueryPreprocessor.tokenize(q);
    final qPhonetic = QueryPreprocessor.phoneticKey(q);

    String targetText;
    String? artistText;
    if (item is SearchSongItem) {
      targetText = QueryPreprocessor.normalize(item.title);
      artistText = QueryPreprocessor.normalize(item.subtitle);
    } else {
      targetText = QueryPreprocessor.normalize(item.title);
    }

    final titleScore = _scoreString(q, qTokens, qPhonetic, targetText);

    if (item is SearchSongItem && artistText != null && artistText.isNotEmpty) {
      // Also check if user typed combined "Song Artist" (e.g. "Kesariya Arijit Singh")
      final combined = '$targetText $artistText'.trim();
      final combinedScore = _scoreString(q, qTokens, qPhonetic, combined);
      if (combinedScore > 0.85) {
        return math.max(titleScore, combinedScore);
      }

      final artistScore = _scoreString(q, qTokens, qPhonetic, artistText);
      if (intent.artistIntent) {
        return math.max(titleScore, artistScore);
      }
      return math.max(titleScore, (0.70 * titleScore) + (0.30 * artistScore));
    }

    return titleScore;
  }

  static double _scoreString(
    String q,
    List<String> qTokens,
    String qPhonetic,
    String target,
  ) {
    if (q == target) return 1.0;
    if (target.startsWith(q)) return 0.90;

    final targetTokens = QueryPreprocessor.tokenize(target);
    if (targetTokens.contains(q)) return 0.85;

    // Token overlap Jaccard
    final jaccard = TextSimilarity.jaccard(qTokens, targetTokens);
    if (jaccard >= 0.75) return 0.80;

    // Global phonetic key equality
    final targetPhonetic = QueryPreprocessor.phoneticKey(target);
    if (qPhonetic == targetPhonetic ||
        (qPhonetic.length >= 4 && targetPhonetic.contains(qPhonetic))) {
      return 0.75;
    }

    // Indic transliteration check (secondary auxiliary signal)
    final qIndic = QueryPreprocessor.indicTranslitKey(q);
    final targetIndic = QueryPreprocessor.indicTranslitKey(target);
    if (qIndic == targetIndic && qIndic.length >= 4) {
      return 0.72;
    }

    // Damerau-Levenshtein edit distance for typo tolerance (length >= 3)
    if (q.length >= 3 && target.length >= 3) {
      final dl = TextSimilarity.damerauLevenshtein(q, target);
      if (dl >= 0.80) return dl * 0.80;

      final jw = TextSimilarity.jaroWinkler(q, target);
      if (jw >= 0.85) return jw * 0.75;
    }

    return jaccard * 0.50;
  }

  static String? _detectItemLanguage(SearchItem item) {
    if (item is SearchSongItem) {
      return Track.detectLanguage(
        item.title,
        item.subtitle,
        item.albumName ?? '',
      );
    } else if (item is SearchAlbumItem) {
      return Track.detectLanguage(item.title, item.subtitle);
    } else if (item is SearchPlaylistItem) {
      return Track.detectLanguage(item.title, item.subtitle);
    } else if (item is SearchVideoItem) {
      return Track.detectLanguage(item.title, item.subtitle);
    }
    return Track.detectLanguage(item.title, item.subtitle);
  }

  static int _evaluateCountrySignal(SearchItem item, String countryCode) {
    final languages = _countryLanguages[countryCode.toUpperCase()];
    if (languages == null || languages.isEmpty) return 0;

    if (countryCode.toUpperCase() == 'IN') {
      final hasIndianScript =
          RegExp(r'[\u0900-\u0D7F]').hasMatch(item.title) ||
          RegExp(r'[\u0900-\u0D7F]').hasMatch(item.subtitle);
      if (hasIndianScript) return 2;
    }

    final titleLower = item.title.toLowerCase();
    final subLower = item.subtitle.toLowerCase();
    for (final lang in languages) {
      if (titleLower.contains(lang) || subLower.contains(lang)) {
        return 2;
      }
    }

    return 0;
  }

  // ─────────────────────────── Deduplication ─────────────────────────────────

  static List<SearchItem> _deduplicate(List<SearchItem> items) {
    final seenSongIds = <String>{};
    final seenSongSignatures = <String, SearchSongItem>{};
    final seenAlbumBrowseIds = <String>{};
    final seenArtistBrowseIds = <String>{};
    final seenPlaylistIds = <String>{};
    final deduped = <SearchItem>[];

    for (final it in items) {
      if (it is SearchVideoItem) {
        if (!MusicVideoFilter.isLegitMusicVideo(
          title: it.title,
          subtitle: it.subtitle,
          channel: it.channel,
          durationText: it.durationText,
        )) {
          continue; // Discard non-music videos, tech reviews, tutorials, and shorts
        }
      }
      if (it is SearchSongItem &&
          it.durationSeconds < 60 &&
          it.durationSeconds > 0) {
        continue; // Discard shorts
      }

      if (it is SearchSongItem) {
        if (!seenSongIds.add(it.id)) continue;

        final normTitle = QueryPreprocessor.normalize(it.title);
        final primaryArtist = it.artists.isNotEmpty
            ? QueryPreprocessor.normalize(it.artists.first.name)
            : QueryPreprocessor.normalize(it.subtitle);
        final durationBucket = it.durationSeconds ~/ 15;
        final sig = '$normTitle|$primaryArtist|$durationBucket';

        if (seenSongSignatures.containsKey(sig)) {
          final existing = seenSongSignatures[sig]!;
          // If current is official ATV audio and existing is not, replace it
          if (it.isOfficialAudio && !existing.isOfficialAudio) {
            deduped.remove(existing);
            deduped.add(it);
            seenSongSignatures[sig] = it;
          } else if (it.isOfficialAudio == existing.isOfficialAudio &&
              it.providerRank < existing.providerRank) {
            // Prefer candidate with better provider rank
            deduped.remove(existing);
            deduped.add(it);
            seenSongSignatures[sig] = it;
          }
          continue;
        }

        seenSongSignatures[sig] = it;
        deduped.add(it);
      } else if (it is SearchArtistItem) {
        final key = (it.browseId != null && it.browseId!.isNotEmpty)
            ? it.browseId!
            : QueryPreprocessor.normalize(it.name);
        if (!seenArtistBrowseIds.add(key)) continue;
        deduped.add(it);
      } else if (it is SearchAlbumItem) {
        final key = (it.browseId != null && it.browseId!.isNotEmpty)
            ? it.browseId!
            : QueryPreprocessor.normalize(it.title);
        if (!seenAlbumBrowseIds.add(key)) continue;
        deduped.add(it);
      } else if (it is SearchPlaylistItem) {
        final key = (it.playlistId != null && it.playlistId!.isNotEmpty)
            ? it.playlistId!
            : QueryPreprocessor.normalize(it.title);
        if (!seenPlaylistIds.add(key)) continue;
        deduped.add(it);
      } else {
        deduped.add(it);
      }
    }

    return deduped;
  }

  // ─────────────────────────── Section Structuring ───────────────────────────

  static Map<SearchItemType, List<SearchItem>> _buildSections({
    required List<SearchItem> sortedItems,
    required SearchIntent intent,
    SearchItem? topResultItem,
  }) {
    final sections = <SearchItemType, List<SearchItem>>{};

    for (final it in sortedItems) {
      sections.putIfAbsent(it.type, () => []).add(it);
    }

    // Ensure Top Result item is mirrored into its respective category shelf at index 0
    if (topResultItem != null) {
      final list = sections.putIfAbsent(topResultItem.type, () => []);
      final existingIdx = list.indexWhere((e) => e.id == topResultItem.id);
      if (existingIdx > 0) {
        final item = list.removeAt(existingIdx);
        list.insert(0, item);
      } else if (existingIdx == -1) {
        list.insert(0, topResultItem);
      }
    }

    // Layout ordering for exact artist queries
    if ((intent.layoutMode == SearchLayoutMode.exactArtist ||
            intent.layoutMode == SearchLayoutMode.artistType) &&
        intent.matchedArtistName != null) {
      final artistNameLower = intent.matchedArtistName!.toLowerCase();
      final songs = sections[SearchItemType.song];
      if (songs != null && songs.isNotEmpty) {
        final ownSongs = <SearchItem>[];
        final otherSongs = <SearchItem>[];

        for (final s in songs) {
          if (s is SearchSongItem) {
            final isOwn =
                s.artists.any((a) => a.name.toLowerCase() == artistNameLower) ||
                s.subtitle.toLowerCase().contains(artistNameLower);
            if (isOwn) {
              ownSongs.add(s);
            } else {
              otherSongs.add(s);
            }
          } else {
            otherSongs.add(s);
          }
        }

        sections[SearchItemType.song] = [...ownSongs, ...otherSongs];
      }
    }

    return sections;
  }

  static SearchTopResult _createTopResultFromItem(SearchItem item) {
    String? playVideoId;
    String? radioPlaylistId;
    String? shufflePlaylistId;

    if (item is SearchSongItem) {
      playVideoId = item.videoId ?? item.id;
      radioPlaylistId = item.radioPlaylistId ?? 'RDAMVM$playVideoId';
    } else if (item is SearchArtistItem) {
      radioPlaylistId = item.radioPlaylistId;
      shufflePlaylistId = item.browseId;
    } else if (item is SearchAlbumItem) {
      shufflePlaylistId = item.playlistId ?? item.browseId;
    } else if (item is SearchPlaylistItem) {
      shufflePlaylistId = item.playlistId ?? item.id;
    }

    return SearchTopResult(
      item: item,
      playVideoId: playVideoId,
      radioPlaylistId: radioPlaylistId,
      shufflePlaylistId: shufflePlaylistId,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trie Data Structure for Instant Prefix Autocomplete
// ─────────────────────────────────────────────────────────────────────────────

class _TrieNode {
  final Map<String, _TrieNode> children = {};
  int frequency = 0;
  bool isEndOfWord = false;
  String? fullPhrase;
}

/// Instant local prefix search over search history and cached query suggestions.
class SearchTrie {
  final _TrieNode _root = _TrieNode();

  void insert(String phrase, {int frequency = 1}) {
    final clean = phrase.trim();
    if (clean.isEmpty) return;
    final norm = QueryPreprocessor.normalize(clean);
    if (norm.isEmpty) return;

    var current = _root;
    for (int i = 0; i < norm.length; i++) {
      final char = norm[i];
      current = current.children.putIfAbsent(char, () => _TrieNode());
    }
    current.isEndOfWord = true;
    current.frequency = math.max(current.frequency, frequency);
    current.fullPhrase = clean;
  }

  List<String> searchPrefix(String prefix, {int limit = 6}) {
    final clean = prefix.trim();
    if (clean.isEmpty) return const [];
    final norm = QueryPreprocessor.normalize(clean);
    if (norm.isEmpty) return const [];

    var current = _root;
    for (int i = 0; i < norm.length; i++) {
      final char = norm[i];
      if (!current.children.containsKey(char)) {
        return const [];
      }
      current = current.children[char]!;
    }

    final candidates = <_TrieMatch>[];
    _collect(current, candidates);
    candidates.sort((a, b) => b.frequency.compareTo(a.frequency));
    return candidates.take(limit).map((c) => c.phrase).toList();
  }

  void _collect(_TrieNode node, List<_TrieMatch> out) {
    if (node.isEndOfWord && node.fullPhrase != null) {
      out.add(_TrieMatch(node.fullPhrase!, node.frequency));
    }
    for (final child in node.children.values) {
      _collect(child, out);
    }
  }
}

class _TrieMatch {
  const _TrieMatch(this.phrase, this.frequency);
  final String phrase;
  final int frequency;
}

// ─────────────────────────────────────────────────────────────────────────────
// Two-Layer LRU Cache for Search Results
// Layer A: Unpersonalized raw provider responses
// Layer B: Personalized ranked search results
// ─────────────────────────────────────────────────────────────────────────────

class _LruCacheEntry<T> {
  const _LruCacheEntry(this.data, this.timestamp);
  final T data;
  final DateTime timestamp;

  bool isExpired(Duration ttl) => DateTime.now().difference(timestamp) > ttl;
}

/// Layer A: Unpersonalized raw InnerTube provider response cache.
class SearchRawProviderCache {
  SearchRawProviderCache({
    this.capacity = 100,
    this.ttl = const Duration(minutes: 10),
  });

  final int capacity;
  final Duration ttl;
  final LinkedHashMap<String, _LruCacheEntry<Map<String, dynamic>>> _cache =
      LinkedHashMap();

  static String buildKey({
    required String query,
    required String stream,
    required String country,
    required String language,
  }) {
    final norm = QueryPreprocessor.normalize(query);
    return '$norm|$stream|$country|$language';
  }

  Map<String, dynamic>? get(String key) {
    final entry = _cache.remove(key);
    if (entry == null) return null;
    if (entry.isExpired(ttl)) return null;
    _cache[key] = entry;
    return entry.data;
  }

  void put(String key, Map<String, dynamic> data) {
    _cache.remove(key);
    if (_cache.length >= capacity) {
      _cache.remove(_cache.keys.first);
    }
    _cache[key] = _LruCacheEntry(data, DateTime.now());
  }

  void clear() => _cache.clear();
}

/// Layer B: Personalized ranked result cache (keyed by query, filter, country, language, and user profile hash).
class SearchLruCache {
  SearchLruCache({
    this.capacity = SearchRankingConfig.kLruCacheCapacity,
    this.ttl = SearchRankingConfig.kLruCacheTtl,
  });

  final int capacity;
  final Duration ttl;
  final LinkedHashMap<String, _LruCacheEntry<SearchResult>> _cache =
      LinkedHashMap();

  static String buildKey({
    required String query,
    SearchFilter filter = SearchFilter.all,
    required String country,
    required String language,
    String profileHash = '',
    SearchSource source = SearchSource.all,
  }) {
    final norm = QueryPreprocessor.normalize(query);
    final pHash = profileHash.isNotEmpty ? '|$profileHash' : '';
    return '$norm|${filter.name}|${source.name}|$country|$language$pHash';
  }

  SearchResult? get(String key) {
    final entry = _cache.remove(key);
    if (entry == null) return null;
    if (entry.isExpired(ttl)) return null;
    _cache[key] = entry;
    return entry.data;
  }

  void put(String key, SearchResult result) {
    _cache.remove(key);
    if (_cache.length >= capacity) {
      _cache.remove(_cache.keys.first);
    }
    _cache[key] = _LruCacheEntry(result, DateTime.now());
  }

  void clear() => _cache.clear();
}
