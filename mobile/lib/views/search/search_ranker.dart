import 'dart:collection';
import 'dart:math' as math;

import 'search_models.dart';

/// Configuration of all weights, thresholds, and limits for search ranking.
class SearchRankingConfig {
  const SearchRankingConfig._();

  // Scoring Weights (sum to 1.00)
  static const double kTextMatchWeight = 0.45;
  static const double kEntityTypeWeight = 0.20;
  static const double kPopularityWeight = 0.15;
  static const double kServerRankWeight = 0.10;
  static const double kCountryWeight = 0.06; // Light weight, never overrides strong text match
  static const double kQualityWeight = 0.04;

  // Thresholds & Windows
  static const double kArtistIntentThreshold = 0.85;
  static const double kCountryTiebreakWindow = 0.15; // Only applied if textMatch is within 0.15 of best
  static const double kMinMatchThreshold = 0.20; // Below this drops below the fold

  // Cache & Trie Limits
  static const int kLruCacheCapacity = 50;
  static const Duration kLruCacheTtl = Duration(minutes: 10);
  static const int kMaxRecentSearches = 20;

  // Shelf Section Capacities in Overview View
  static const int kMaxSongsInOverview = 6;
  static const int kMaxArtistsInOverview = 10;
  static const int kMaxAlbumsInOverview = 10;
  static const int kMaxPlaylistsInOverview = 10;
  static const int kMaxVideosInOverview = 8;
  static const int kMaxPodcastsInOverview = 8;
}

/// Normalization, transliteration, and phonetic utilities for Indian and international queries.
class QueryPreprocessor {
  QueryPreprocessor._();

  static final RegExp _diacriticsRegex = RegExp(r'[\u0300-\u036f]');
  static final RegExp _punctuationRegex = RegExp(r'[^\p{L}\p{N}\s]', unicode: true);
  static final RegExp _whitespaceRegex = RegExp(r'\s+');

  /// Normalizes a query or entity string: lowercase, strips diacritics, cleans punctuation.
  static String normalize(String input) {
    if (input.isEmpty) return '';
    var s = input.toLowerCase().trim();

    // Remove diacritics (e.g. é -> e, à -> a, ö -> o)
    s = s.replaceAllMapped(_diacriticsRegex, (_) => '');

    // Replace hyphens, slashes, underscores with spaces
    s = s.replaceAll(RegExp(r'[-_/|•]'), ' ');

    // Strip remaining non-alphanumeric punctuation
    s = s.replaceAll(_punctuationRegex, '');

    // Collapse multiple spaces
    s = s.replaceAll(_whitespaceRegex, ' ').trim();
    return s;
  }

  /// Transliteration-friendly phonetic key:
  /// Collapses double vowels and consonants, maps regional transliteration variants:
  /// aa->a, ee->i, oo->u, th->t, dh->d, sh->s, zh->l, ph->f, v->w.
  static String phoneticKey(String input) {
    var s = normalize(input);
    if (s.isEmpty) return '';

    // Vowel collapse
    s = s.replaceAll('aa', 'a');
    s = s.replaceAll('ee', 'i');
    s = s.replaceAll('oo', 'u');
    s = s.replaceAll('ou', 'u');
    s = s.replaceAll('ai', 'ay');

    // Consonant variants in Indian transliterations
    s = s.replaceAll('th', 't');
    s = s.replaceAll('dh', 'd');
    s = s.replaceAll('zh', 'l');
    s = s.replaceAll('sh', 's');
    s = s.replaceAll('ch', 'c');
    s = s.replaceAll('ph', 'f');
    s = s.replaceAll('bh', 'b');
    s = s.replaceAll('gh', 'g');
    s = s.replaceAll('kh', 'k');
    s = s.replaceAll('v', 'w');

    // Collapse doubled characters (e.g. "anirudh" vs "anirudhh", "singh" vs "sinng")
    final buffer = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i == 0 || s[i] != s[i - 1]) {
        buffer.write(s[i]);
      }
    }
    return buffer.toString().trim();
  }

  /// Tokenizes normalized text into non-empty words.
  static List<String> tokenize(String input) {
    final norm = normalize(input);
    if (norm.isEmpty) return const [];
    return norm.split(' ').where((w) => w.isNotEmpty).toList();
  }
}

/// Similarity functions (Jaro-Winkler, Jaccard token overlap).
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

    final double jaro = ((matches / l1) + (matches / l2) + ((matches - transpositions / 2) / matches)) / 3.0;

    // Winkler prefix adjustment
    int prefix = 0;
    for (int i = 0; i < math.min(4, math.min(l1, l2)); i++) {
      if (s1[i] == s2[i]) {
        prefix++;
      } else {
        break;
      }
    }

    return jaro + prefix * 0.1 * (1.0 - jaro);
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

  /// Analyzes query terms and raw search candidates to detect intent and layout mode.
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

    // Check if effectiveEntity matches any artist in rawItems
    bool artistIntent = false;
    String? matchedArtistBrowseId;
    String? matchedArtistName;

    final artistCandidates = rawItems.whereType<SearchArtistItem>().toList();
    for (final artist in artistCandidates) {
      final artistNorm = QueryPreprocessor.normalize(artist.name);
      final score = _computeTextScore(effectiveEntity, artistNorm);
      if (score >= SearchRankingConfig.kArtistIntentThreshold) {
        artistIntent = true;
        matchedArtistBrowseId = artist.browseId;
        matchedArtistName = artist.name;
        break;
      }
    }

    // Determine layout mode
    SearchLayoutMode mode;
    if (artistIntent && intentType == null && modifiers.isEmpty) {
      // 1. Exact artist query (e.g. "anirudh")
      mode = SearchLayoutMode.exactArtist;
    } else if (artistIntent && intentType != null) {
      // 2. Artist + type query (e.g. "anirudh songs", "anirudh albums")
      mode = SearchLayoutMode.artistType;
    } else if (intentType == SearchItemType.album || intentType == SearchItemType.playlist) {
      // 4. Album or playlist explicit query
      mode = SearchLayoutMode.albumOrPlaylist;
    } else if (rawItems.any((it) => it is SearchSongItem && _computeTextScore(normalized, QueryPreprocessor.normalize(it.title)) >= 0.85)) {
      // 3. Song title query (e.g. "kaavaalaa")
      mode = SearchLayoutMode.songTitle;
    } else if (rawItems.any((it) => it is SearchAlbumItem && _computeTextScore(normalized, QueryPreprocessor.normalize(it.title)) >= 0.85)) {
      mode = SearchLayoutMode.albumOrPlaylist;
    } else {
      // 5. Generic or mood query
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
    if (target.startsWith(q)) return 0.9;
    if (target.contains(q)) return 0.8;
    return TextSimilarity.jaroWinkler(q, target);
  }
}

/// Production pure-Dart ranking engine for Zenify search results.
class SearchRanker {
  SearchRanker._();

  /// Regional languages mapped to country codes for country boost
  static final Map<String, List<String>> _countryLanguages = {
    'IN': ['tamil', 'telugu', 'hindi', 'malayalam', 'punjabi', 'kannada', 'bengali', 'marathi'],
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

  /// Main ranking function: deduplicates, scores, stably sorts, and structures sections.
  static SearchResult rank({
    required List<SearchItem> items,
    required SearchIntent intent,
    required String countryCode,
    SearchTopResult? initialTopResult,
    String? didYouMean,
    String? continuation,
  }) {
    // 1. Deduplicate Items
    final dedupedItems = _deduplicate(items);

    if (dedupedItems.isEmpty && initialTopResult == null) {
      return SearchResult(
        originalQuery: intent.originalQuery,
        intent: intent,
        correctedQuery: didYouMean,
        continuation: continuation,
      );
    }

    // 2. Compute Max Popularity in Batch per item type (for log-scale normalization)
    final maxPopularityByType = <SearchItemType, int>{};
    for (final it in dedupedItems) {
      int pop = 0;
      if (it is SearchArtistItem) pop = it.subscriberCount ?? 0;
      if (it is SearchVideoItem) pop = it.views;
      if (pop > (maxPopularityByType[it.type] ?? 0)) {
        maxPopularityByType[it.type] = pop;
      }
    }

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
    for (final it in dedupedItems) {
      final textScore = textScores[it.id] ?? 0.0;
      final finalScore = _calculateFinalScore(
        item: it,
        intent: intent,
        countryCode: countryCode,
        textScore: textScore,
        maxTextMatch: maxTextMatch,
        maxBatchPopularity: maxPopularityByType[it.type] ?? 0,
      );
      scoredItems.add(it.copyWithScore(finalScore));
    }

    // 5. Stable Sort: finalScore desc, popularity desc, rawRank asc, id asc
    scoredItems.sort((a, b) {
      final cmpScore = b.finalScore.compareTo(a.finalScore);
      if (cmpScore != 0) return cmpScore;

      final popA = _getItemPopularity(a);
      final popB = _getItemPopularity(b);
      final cmpPop = popB.compareTo(popA);
      if (cmpPop != 0) return cmpPop;

      final cmpRank = a.rawRank.compareTo(b.rawRank);
      if (cmpRank != 0) return cmpRank;

      return a.id.compareTo(b.id);
    });

    // 6. Resolve Top Result (Hero Card)
    SearchTopResult? topResult = initialTopResult;
    if (topResult == null && scoredItems.isNotEmpty) {
      final best = scoredItems.first;
      // High-confidence threshold
      if (best.finalScore >= 0.65) {
        topResult = _createTopResultFromItem(best);
      }
    } else if (topResult != null && scoredItems.isNotEmpty) {
      // If we have an exact artist intent, make sure Top Result reflects the artist profile
      if (intent.artistIntent && topResult.type != SearchItemType.artist) {
        final artistItem = scoredItems.whereType<SearchArtistItem>().firstOrNull;
        if (artistItem != null) {
          topResult = _createTopResultFromItem(artistItem);
        }
      }
    }

    // 7. Group items into shelves according to Layout Mode
    final sections = _buildSections(
      sortedItems: scoredItems,
      intent: intent,
      topResultItem: topResult?.item,
    );

    return SearchResult(
      topResult: topResult,
      sections: sections,
      correctedQuery: didYouMean,
      originalQuery: intent.originalQuery,
      continuation: continuation,
      intent: intent,
    );
  }

  // ─────────────────────────── Scoring Formula ───────────────────────────────

  static double _calculateFinalScore({
    required SearchItem item,
    required SearchIntent intent,
    required String countryCode,
    required double textScore,
    required double maxTextMatch,
    required int maxBatchPopularity,
  }) {
    // A. Text Match (0..1)
    final textComponent = textScore * SearchRankingConfig.kTextMatchWeight;

    // B. Entity Type Fit (0..1)
    double entityFit = 0.5;
    if (intent.artistIntent) {
      if (item is SearchArtistItem && item.name.toLowerCase() == intent.matchedArtistName?.toLowerCase()) {
        entityFit = 1.0;
      } else if (item is SearchSongItem) {
        final isOwnSong = item.artists.any((a) => a.name.toLowerCase() == intent.matchedArtistName?.toLowerCase());
        final isPrimary = item.artists.isNotEmpty && item.artists.first.name.toLowerCase() == intent.matchedArtistName?.toLowerCase();
        entityFit = isPrimary ? 1.0 : (isOwnSong ? 0.85 : 0.40);
      } else if (item is SearchAlbumItem) {
        final isOwnAlbum = item.artists.any((a) => a.name.toLowerCase() == intent.matchedArtistName?.toLowerCase());
        entityFit = isOwnAlbum ? 0.90 : 0.45;
      }
    } else if (intent.intentType != null) {
      if (item.type == intent.intentType) {
        entityFit = 1.0;
      }
    }
    final entityComponent = entityFit * SearchRankingConfig.kEntityTypeWeight;

    // C. Popularity (log-scaled)
    final pop = _getItemPopularity(item);
    double popNorm = 0.3; // Default neutral for missing data
    if (pop > 0 && maxBatchPopularity > 0) {
      popNorm = math.log(1.0 + pop) / math.log(1.0 + maxBatchPopularity);
    }
    final popComponent = popNorm * SearchRankingConfig.kPopularityWeight;

    // D. Server Rank Prior: 1 / (1 + rawRank) normalized
    final serverPrior = 1.0 / (1.0 + item.rawRank);
    final serverComponent = serverPrior * SearchRankingConfig.kServerRankWeight;

    // E. Country Boost (light weight: 0.06)
    // Rule: Apply ONLY when textMatch is within 0.15 of the best candidate
    double countryBoost = 0.0;
    if (maxTextMatch - textScore <= SearchRankingConfig.kCountryTiebreakWindow) {
      final signal = _evaluateCountrySignal(item, countryCode);
      if (signal == 2) {
        countryBoost = 1.0;
      } else if (signal == 1) {
        countryBoost = 0.5;
      }
    }
    final countryComponent = countryBoost * SearchRankingConfig.kCountryWeight;

    // F. Quality Boost & Penalties
    double qualityBoost = 0.0;
    double penalties = 0.0;

    if (item is SearchSongItem) {
      if (item.isOfficialAudio) qualityBoost += 0.04;
      final tLower = item.title.toLowerCase();
      final qLower = intent.normalizedQuery;

      // Penalties for cover / live / karaoke if NOT requested
      if (tLower.contains('cover') && !qLower.contains('cover')) penalties += 0.15;
      if (tLower.contains('karaoke') && !qLower.contains('karaoke')) penalties += 0.20;
      if (tLower.contains('reaction') && !qLower.contains('reaction')) penalties += 0.30;
      if (tLower.contains('live') && !qLower.contains('live')) penalties += 0.08;
    } else if (item is SearchArtistItem) {
      if (item.isVerified) qualityBoost += 0.04;
    }

    final qualityComponent = qualityBoost * SearchRankingConfig.kQualityWeight;

    // Penalties for very low text match (< 0.2)
    if (textScore < SearchRankingConfig.kMinMatchThreshold) {
      penalties += 0.25;
    }

    final rawScore = textComponent +
        entityComponent +
        popComponent +
        serverComponent +
        countryComponent +
        qualityComponent -
        penalties;

    return rawScore.clamp(0.0, 1.0);
  }

  // ─────────────────────────── Text Match Calculation ────────────────────────

  static double _calculateTextMatch(SearchItem item, SearchIntent intent) {
    final q = intent.entityText.isNotEmpty ? intent.entityText : intent.normalizedQuery;
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
      final artistScore = _scoreString(q, qTokens, qPhonetic, artistText);
      if (intent.artistIntent) {
        return math.max(titleScore, artistScore);
      }
      // Weight title 0.7, artist 0.3
      return math.max(titleScore, (0.7 * titleScore) + (0.3 * artistScore));
    }

    return titleScore;
  }

  static double _scoreString(String q, List<String> qTokens, String qPhonetic, String target) {
    if (q == target) return 1.0;
    if (target.startsWith(q)) return 0.90;

    // Whole-word match check
    final targetTokens = QueryPreprocessor.tokenize(target);
    if (targetTokens.contains(q)) return 0.80;

    // Token overlap Jaccard
    final jaccard = TextSimilarity.jaccard(qTokens, targetTokens);
    if (jaccard >= 0.75) return 0.78;

    // Phonetic key equality
    final targetPhonetic = QueryPreprocessor.phoneticKey(target);
    if (qPhonetic == targetPhonetic || targetPhonetic.contains(qPhonetic)) {
      return 0.70;
    }

    // Fuzzy matching using Jaro-Winkler for length >= 3
    if (q.length >= 3 && target.length >= 3) {
      final jw = TextSimilarity.jaroWinkler(q, target);
      if (jw >= 0.85) return jw * 0.85; // Discounted fuzzy score
    }

    return jaccard * 0.6;
  }

  // ─────────────────────────── Country & Region Signals ──────────────────────

  /// Evaluates regional / language signals: returns 2 for strong, 1 for weak, 0 for none.
  static int _evaluateCountrySignal(SearchItem item, String countryCode) {
    final languages = _countryLanguages[countryCode.toUpperCase()];
    if (languages == null || languages.isEmpty) return 0;

    final titleLower = item.title.toLowerCase();
    final subLower = item.subtitle.toLowerCase();

    // Check script presence (e.g. Tamil \u0B80-\u0BFF, Devanagari \u0900-\u097F)
    if (countryCode.toUpperCase() == 'IN') {
      final hasIndianScript = RegExp(r'[\u0900-\u0D7F]').hasMatch(item.title) ||
          RegExp(r'[\u0900-\u0D7F]').hasMatch(item.subtitle);
      if (hasIndianScript) return 2;
    }

    // Check language keywords in title or subtitle
    for (final lang in languages) {
      if (titleLower.contains(lang) || subLower.contains(lang)) {
        return 2;
      }
    }

    return 0;
  }

  static int _getItemPopularity(SearchItem item) {
    if (item is SearchArtistItem) return item.subscriberCount ?? 0;
    if (item is SearchVideoItem) return item.views;
    return 0;
  }

  // ─────────────────────────── Deduplication ─────────────────────────────────

  /// Collapses duplicate entries (e.g. ATV vs OMV audio versions, identical titles).
  static List<SearchItem> _deduplicate(List<SearchItem> items) {
    final seenSongIds = <String>{};
    final seenSongSignatures = <String, SearchSongItem>{};
    final seenAlbumBrowseIds = <String>{};
    final seenArtistBrowseIds = <String>{};
    final seenPlaylistIds = <String>{};
    final deduped = <SearchItem>[];

    for (final it in items) {
      if (it is SearchSongItem) {
        if (!seenSongIds.add(it.id)) continue;

        // Secondary signature: normalizedTitle|primaryArtist|durationBucket
        final normTitle = QueryPreprocessor.normalize(it.title);
        final primaryArtist = it.artists.isNotEmpty
            ? QueryPreprocessor.normalize(it.artists.first.name)
            : QueryPreprocessor.normalize(it.subtitle);
        final durationBucket = it.durationSeconds ~/ 15; // 15-second bucket
        final sig = '$normTitle|$primaryArtist|$durationBucket';

        if (seenSongSignatures.containsKey(sig)) {
          final existing = seenSongSignatures[sig]!;
          // If current is official ATV audio and existing is not, replace it
          if (it.isOfficialAudio && !existing.isOfficialAudio) {
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

    // Group items by type, omitting the Top Result item so it doesn't duplicate immediately
    for (final it in sortedItems) {
      if (topResultItem != null && it.id == topResultItem.id) continue;
      sections.putIfAbsent(it.type, () => []).add(it);
    }

    // Special layout ordering for exact artist queries (e.g. "anirudh") and artist-type queries
    if ((intent.layoutMode == SearchLayoutMode.exactArtist || intent.layoutMode == SearchLayoutMode.artistType) &&
        intent.matchedArtistName != null) {
      final artistNameLower = intent.matchedArtistName!.toLowerCase();

      // Separate artist's own songs from songs that merely mention or feature the artist
      final songs = sections[SearchItemType.song];
      if (songs != null && songs.isNotEmpty) {
        final ownSongs = <SearchItem>[];
        final otherSongs = <SearchItem>[];

        for (final s in songs) {
          if (s is SearchSongItem) {
            final isOwn = s.artists.any((a) => a.name.toLowerCase() == artistNameLower) ||
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

        // Own songs come first
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

  /// Inserts a phrase with a designated popularity/frequency weight.
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

  /// Returns top-K suggestions matching the prefix, ordered by frequency desc.
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

    // Collect all descendant candidates
    final candidates = <_TrieMatch>[];
    _collect(current, candidates);

    // Min-heap or sorting by frequency desc
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
// LRU Cache for Search Results with TTL
// ─────────────────────────────────────────────────────────────────────────────

class _LruCacheEntry {
  const _LruCacheEntry(this.result, this.timestamp);
  final SearchResult result;
  final DateTime timestamp;

  bool isExpired(Duration ttl) =>
      DateTime.now().difference(timestamp) > ttl;
}

/// LinkedHashMap-backed LRU Cache for query responses with TTL.
class SearchLruCache {
  SearchLruCache({
    this.capacity = SearchRankingConfig.kLruCacheCapacity,
    this.ttl = SearchRankingConfig.kLruCacheTtl,
  });

  final int capacity;
  final Duration ttl;
  final LinkedHashMap<String, _LruCacheEntry> _cache = LinkedHashMap();

  static String buildKey({
    required String query,
    required SearchFilter filter,
    required String country,
    required String language,
  }) {
    final norm = QueryPreprocessor.normalize(query);
    return '$norm|${filter.name}|$country|$language';
  }

  SearchResult? get(String key) {
    final entry = _cache.remove(key);
    if (entry == null) return null;

    if (entry.isExpired(ttl)) {
      return null;
    }

    // Re-insert to refresh recency
    _cache[key] = entry;
    return entry.result;
  }

  void put(String key, SearchResult result) {
    _cache.remove(key);
    if (_cache.length >= capacity) {
      _cache.remove(_cache.keys.first);
    }
    _cache[key] = _LruCacheEntry(result, DateTime.now());
  }

  void clear() {
    _cache.clear();
  }
}
