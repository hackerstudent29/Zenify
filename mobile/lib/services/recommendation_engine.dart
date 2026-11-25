// lib/services/recommendation_engine.dart
//
// ZENIFY GLOBAL PERSONALIZED MUSIC RECOMMENDATION ENGINE
//
// Implements an evolving user taste profile, behavioural preference learning,
// anti-repetition controls, strict language eligibility (never over-indexing
// on isolated 1-song plays), and personalized shelf generation.

import 'dart:math' as math;

import '../models/track.dart';
import 'artist_service.dart';
import 'country_service.dart';
import 'innertube_service.dart';
import 'library_store.dart';
import 'listening_history_service.dart';
import 'smart_queue_engine.dart';
import 'user_preferences_service.dart';

/// Weights for composite ranking score (Normalized to 100.0)
class RecommendationWeights {
  static const double historySimilarity = 30.0;
  static const double artistAffinity = 20.0;
  static const double genreAffinity = 15.0;
  static const double behaviouralScore = 15.0;
  static const double audioEnergySimilarity = 10.0;
  static const double discoveryFreshness = 10.0;

  /// Anti-repetition limits
  static const int maxConsecutiveArtist = 1;
  static const int maxTracksPerArtist = 2;
  static const Duration antiRepetitionWindow = Duration(hours: 24);
  static const Duration weekCooldownWindow = Duration(days: 7);
}

/// Snapshot of the listener's evolving musical preferences and behavioral signals.
class UserTasteProfile {
  final List<String> selectedLanguages;
  final List<String> qualifiedListenedLanguages;
  final List<String> recommendedLanguages;
  final List<String> favoriteArtists;
  final List<String> topListenedArtists;
  final List<String> preferredGenres;
  final Set<String> recentTrackIds24h;
  final Set<String> recentTrackSignatures24h;
  final Set<String> weekTrackIds;
  final Set<String> likedTrackIds;
  final Set<String> skippedTrackSignatures;
  final String primaryLanguage;
  final String primaryGenre;

  const UserTasteProfile({
    required this.selectedLanguages,
    required this.qualifiedListenedLanguages,
    required this.recommendedLanguages,
    required this.favoriteArtists,
    required this.topListenedArtists,
    required this.preferredGenres,
    required this.recentTrackIds24h,
    required this.recentTrackSignatures24h,
    required this.weekTrackIds,
    required this.likedTrackIds,
    required this.skippedTrackSignatures,
    required this.primaryLanguage,
    required this.primaryGenre,
  });

  bool get isColdStart =>
      qualifiedListenedLanguages.isEmpty &&
      topListenedArtists.isEmpty &&
      recentTrackIds24h.isEmpty;
}

class RecommendationEngine {
  RecommendationEngine._();
  static final RecommendationEngine instance = RecommendationEngine._();

  /// Builds a live, reactive UserTasteProfile combining explicit preferences
  /// with validated listening telemetry.
  UserTasteProfile buildTasteProfile() {
    final prefs = UserPreferencesService.instance.currentPrefs;
    final history = ListeningHistoryService.instance;

    // 1. Explicitly selected languages (always top tier)
    final selectedLangs = prefs.languages
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();

    // 2. Qualified history languages (>= 3 plays and >= 15% ratio)
    final qualifiedLangs = history.qualifiedListenedLanguages;

    // 3. Recommended Languages = Selected + Qualified Listened
    final seenLangs = <String>{};
    final recLangs = <String>[];
    for (final l in [...selectedLangs, ...qualifiedLangs]) {
      final clean = l.trim();
      if (clean.isNotEmpty && seenLangs.add(clean.toLowerCase())) {
        recLangs.add(clean);
      }
    }

    // 4. Artists
    final favArtists = prefs.favoriteArtists
        .map((a) => a.name.trim())
        .where((a) => a.isNotEmpty)
        .toList();
    final topArtists = history.topListenedArtistNames;

    // 5. Genres
    final genres = prefs.genres
        .map((g) => g.trim())
        .where((g) => g.isNotEmpty)
        .toList();

    // 6. Anti-repetition sets from recent history
    final recent24hIds = <String>{};
    final recent24hSigs = <String>{};
    final weekIds = <String>{};

    final allHistory = history.recentTracks;
    for (final t in allHistory) {
      final id = t.id.replaceFirst('yt-', '').trim();
      final sig = SmartQueueEngine.normalizeSignature(t.title, t.artist);
      recent24hIds.add(t.id);
      recent24hIds.add(id);
      if (sig.isNotEmpty) recent24hSigs.add(sig);
      weekIds.add(t.id);
      weekIds.add(id);
    }

    // 7. Liked songs from LibraryStore
    final likedIds = <String>{};
    for (final t in LibraryStore.instance.likedTracks) {
      likedIds.add(t.id);
      likedIds.add(t.id.replaceFirst('yt-', '').trim());
    }

    // 8. Skips from sessions
    final skippedSigs = <String>{};
    for (final s in history.getLocalSessions()) {
      if (s['isSkip'] == true) {
        final title = s['trackTitle']?.toString() ?? '';
        final artist = s['artistName']?.toString() ?? '';
        final sig = SmartQueueEngine.normalizeSignature(title, artist);
        if (sig.isNotEmpty) skippedSigs.add(sig);
      }
    }

    final primaryLang = recLangs.isNotEmpty
        ? recLangs.first
        : (prefs.primaryLanguage ?? '');
    final primaryGenre = genres.isNotEmpty ? genres.first : 'Acoustic & Pop';

    return UserTasteProfile(
      selectedLanguages: selectedLangs,
      qualifiedListenedLanguages: qualifiedLangs,
      recommendedLanguages: recLangs,
      favoriteArtists: favArtists,
      topListenedArtists: topArtists,
      preferredGenres: genres,
      recentTrackIds24h: recent24hIds,
      recentTrackSignatures24h: recent24hSigs,
      weekTrackIds: weekIds,
      likedTrackIds: likedIds,
      skippedTrackSignatures: skippedSigs,
      primaryLanguage: primaryLang,
      primaryGenre: primaryGenre,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Hard Eligibility Filtering & Composite Scoring
  // ───────────────────────────────────────────────────────────────────────────

  /// Checks if a candidate track is eligible under the user's taste profile.
  bool isEligible(
    Track track,
    UserTasteProfile profile, {
    bool allowRecent = false,
  }) {
    // 1. Playability check
    if (track.id.isEmpty || track.title.trim().isEmpty) return false;

    final cleanId = track.id.replaceFirst('yt-', '').trim();
    final sig = SmartQueueEngine.normalizeSignature(track.title, track.artist);

    // 2. Anti-repetition: exclude tracks played in last 24 hours
    if (!allowRecent) {
      if (profile.recentTrackIds24h.contains(track.id) ||
          profile.recentTrackIds24h.contains(cleanId)) {
        return false;
      }
      if (sig.isNotEmpty && profile.recentTrackSignatures24h.contains(sig)) {
        return false;
      }
    }

    // 3. Language Eligibility:
    // If user has recommended languages (selected or qualified listened),
    // candidate's language must match or be undetermined.
    // If candidate is explicitly in an unselected, unlistened language, reject it!
    if (profile.recommendedLanguages.isNotEmpty) {
      final candLang = SmartQueueEngine.detectLanguage(
        track,
      ).toLowerCase().trim();
      if (candLang.isNotEmpty) {
        final recLangsLower = profile.recommendedLanguages
            .map((l) => l.toLowerCase().trim())
            .toSet();
        if (!recLangsLower.contains(candLang)) {
          // Explicit language mismatch (e.g. Punjabi when user listens to Tamil/English)
          return false;
        }
      }
    }

    return true;
  }

  /// Calculates composite score for a candidate track based on the user's profile.
  double calculateScore({
    required Track candidate,
    required UserTasteProfile profile,
    double targetEnergy = 0.50,
  }) {
    double score = 0.0;
    final candArtist = candidate.artist.toLowerCase().trim();
    final candSig = SmartQueueEngine.normalizeSignature(
      candidate.title,
      candidate.artist,
    );

    // A. Language Affinity (25%)
    final candLang = SmartQueueEngine.detectLanguage(
      candidate,
    ).toLowerCase().trim();
    if (candLang.isNotEmpty) {
      final recLangsLower = profile.recommendedLanguages
          .map((l) => l.toLowerCase().trim())
          .toList();
      final idx = recLangsLower.indexOf(candLang);
      if (idx == 0) {
        score += 25.0; // Primary language match
      } else if (idx > 0) {
        score += 18.0; // Secondary qualified language match
      }
    } else {
      score += 12.0; // Neutral for instrumental/unclassified
    }

    // B. Artist Affinity (25%)
    final favArtistsLower = profile.favoriteArtists
        .map((a) => a.toLowerCase().trim())
        .toList();
    final topArtistsLower = profile.topListenedArtists
        .map((a) => a.toLowerCase().trim())
        .toList();

    if (favArtistsLower.contains(candArtist) ||
        candidate.artistNames.any(
          (a) => favArtistsLower.contains(a.toLowerCase().trim()),
        )) {
      score += RecommendationWeights.artistAffinity;
    } else if (topArtistsLower.contains(candArtist) ||
        candidate.artistNames.any(
          (a) => topArtistsLower.contains(a.toLowerCase().trim()),
        )) {
      score += RecommendationWeights.artistAffinity * 0.80;
    }

    // C. Behavioural Feedback (20%)
    if (profile.likedTrackIds.contains(candidate.id) ||
        profile.likedTrackIds.contains(
          candidate.id.replaceFirst('yt-', '').trim(),
        )) {
      score += 15.0; // Loved song bonus
    }
    if (profile.skippedTrackSignatures.contains(candSig)) {
      score -= 15.0; // Repeated skip penalty
    }

    // D. Audio Energy Match (15%)
    final candEnergy = SmartQueueEngine.estimateEnergy(candidate);
    final energyDelta = (candEnergy - targetEnergy).abs();
    score +=
        (1.0 - energyDelta.clamp(0.0, 1.0)) *
        RecommendationWeights.audioEnergySimilarity;

    // E. 7-Day Cooldown Penalty (-20% if played recently)
    if (profile.weekTrackIds.contains(candidate.id) ||
        profile.weekTrackIds.contains(
          candidate.id.replaceFirst('yt-', '').trim(),
        )) {
      score -= 8.0;
    }

    // F. Freshness / Discovery (+10%)
    if (!profile.weekTrackIds.contains(candidate.id)) {
      score += RecommendationWeights.discoveryFreshness;
    }

    return score;
  }

  /// Universal candidate filter and ranker honoring language eligibility,
  /// artist capping, and anti-repetition.
  List<Track> filterAndRankCandidates({
    required List<Track> candidates,
    required UserTasteProfile profile,
    int limit = 12,
    double targetEnergy = 0.50,
    bool allowRecent = false,
    bool forceShuffle = false,
  }) {
    if (candidates.isEmpty) return const [];

    // 1. Deduplicate candidates by ID and normalized signature
    final deduped = <Track>[];
    final seenIds = <String>{};
    final seenSigs = <String>{};

    for (final t in candidates) {
      final cleanId = t.id.replaceFirst('yt-', '').trim();
      final sig = SmartQueueEngine.normalizeSignature(t.title, t.artist);
      if (seenIds.add(t.id) && seenIds.add(cleanId)) {
        if (sig.isEmpty || seenSigs.add(sig)) {
          deduped.add(t);
        }
      }
    }

    // 2. Filter by eligibility (language compatibility & 24h anti-repetition)
    final eligible = deduped
        .where((t) => isEligible(t, profile, allowRecent: allowRecent))
        .toList();

    final pool = eligible.isNotEmpty ? eligible : deduped;

    // 3. Score all candidates (with exploration jitter on manual refresh)
    final rng = forceShuffle ? math.Random() : null;
    final scored = pool.map((t) {
      final baseScore = calculateScore(
        candidate: t,
        profile: profile,
        targetEnergy: targetEnergy,
      );
      final s = rng != null
          ? baseScore + (rng.nextDouble() * 18.0 - 9.0)
          : baseScore;
      return (track: t, score: s);
    }).toList();

    // Sort descending by score
    scored.sort((a, b) => b.score.compareTo(a.score));

    // 4. Variety Capping: Max 2 tracks per artist, no consecutive same artist
    final result = <Track>[];
    final artistCounts = <String, int>{};
    final candidatesList = scored.map((e) => e.track).toList();

    while (candidatesList.isNotEmpty && result.length < limit) {
      int pickIdx = -1;

      for (int i = 0; i < candidatesList.length; i++) {
        final t = candidatesList[i];
        final aLower = t.artist.toLowerCase().trim();
        final currentCount = artistCounts[aLower] ?? 0;

        // Skip if artist hit cap (max 2 per shelf)
        if (currentCount >= RecommendationWeights.maxTracksPerArtist &&
            candidatesList.length > limit) {
          continue;
        }

        // Skip if consecutive same artist
        if (result.isNotEmpty &&
            result.last.artist.toLowerCase().trim() == aLower) {
          continue;
        }

        pickIdx = i;
        break;
      }

      // If strict variety couldn't find a track, relax consecutive check
      if (pickIdx == -1) {
        pickIdx = 0;
      }

      final chosen = candidatesList.removeAt(pickIdx);
      final aLower = chosen.artist.toLowerCase().trim();
      artistCounts[aLower] = (artistCounts[aLower] ?? 0) + 1;
      result.add(chosen);
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Surface Generators for Home Screen & Discovery
  // ───────────────────────────────────────────────────────────────────────────

  /// Generates truly personalized "Made for You / Quick Picks".
  /// Blends related tracks to loved songs, radio for favorite artists,
  /// and top hits in the user's primary languages.
  Future<List<Track>> getPersonalizedQuickPicks({
    int limit = 16,
    bool forceRefresh = false,
  }) async {
    final profile = buildTasteProfile();
    final futures = <Future<List<Track>>>[];

    // 1. Related to most recent non-skipped track
    final recentHistory = ListeningHistoryService.instance.getRecentTracks();
    if (recentHistory.isNotEmpty) {
      futures.add(
        InnerTubeService.instance
            .fetchRelated(recentHistory.first)
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
            .catchError((_) => <Track>[]),
      );
    }

    // 2. Favorite Artist Radio
    if (profile.favoriteArtists.isNotEmpty) {
      futures.add(
        InnerTubeService.instance
            .search(
              '${profile.favoriteArtists.first} ${forceRefresh ? "best songs" : "radio"}',
              forceRefresh: forceRefresh,
            )
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
            .catchError((_) => <Track>[]),
      );
    }

    // 3. Second Favorite or Top Listened Artist
    final secondArtist = profile.favoriteArtists.length > 1
        ? profile.favoriteArtists[1]
        : (profile.topListenedArtists.isNotEmpty
              ? profile.topListenedArtists.first
              : null);
    if (secondArtist != null && secondArtist.isNotEmpty) {
      futures.add(
        InnerTubeService.instance
            .search(
              '$secondArtist ${forceRefresh ? "top tracks" : "hits"}',
              forceRefresh: forceRefresh,
            )
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
            .catchError((_) => <Track>[]),
      );
    }

    // 4. Primary language hits
    if (profile.primaryLanguage.isNotEmpty) {
      final q = profile.primaryGenre.isNotEmpty
          ? '${profile.primaryLanguage} ${profile.primaryGenre} top hits'
          : '${profile.primaryLanguage} ${forceRefresh ? "popular" : "trending"} hits';
      futures.add(
        InnerTubeService.instance
            .search(q, forceRefresh: forceRefresh)
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
            .catchError((_) => <Track>[]),
      );
    }

    // 5. Fallback if new user has no preferences
    if (futures.isEmpty) {
      final country = CountryService.instance.currentCountry;
      futures.add(
        InnerTubeService.instance
            .getHomeFeed(countryCode: country.code, forceRefresh: forceRefresh)
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
            .catchError((_) => <Track>[]),
      );
    }

    try {
      final lists = await Future.wait(futures);
      final combined = <Track>[];
      for (final l in lists) {
        combined.addAll(l);
      }
      return filterAndRankCandidates(
        candidates: combined,
        profile: profile,
        limit: limit,
        forceShuffle: forceRefresh,
      );
    } catch (_) {
      return const [];
    }
  }

  /// Generates New Releases strictly matching user's qualified languages & artists.
  Future<List<Track>> getRecommendedNewReleases({
    int limit = 12,
    bool forceRefresh = false,
  }) async {
    final profile = buildTasteProfile();
    final futures = <Future<List<Track>>>[];

    // 1. New releases in user's qualified languages (max 2)
    for (final l in profile.recommendedLanguages.take(2)) {
      futures.add(
        InnerTubeService.instance
            .search('latest $l songs 2026', forceRefresh: forceRefresh)
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
            .catchError((_) => <Track>[]),
      );
    }

    // 2. Favorite artist new song
    if (profile.favoriteArtists.isNotEmpty) {
      futures.add(
        InnerTubeService.instance
            .search(
              'new song ${profile.favoriteArtists.first}',
              forceRefresh: forceRefresh,
            )
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
            .catchError((_) => <Track>[]),
      );
    }

    // 3. Fallback regional releases
    if (futures.isEmpty) {
      final country = CountryService.instance.currentCountry;
      futures.add(
        InnerTubeService.instance
            .getNewReleases(
              countryCode: country.code,
              forceRefresh: forceRefresh,
            )
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
            .catchError((_) => <Track>[]),
      );
    }

    try {
      final lists = await Future.wait(futures);
      final combined = <Track>[];
      for (final l in lists) {
        combined.addAll(l);
      }
      return filterAndRankCandidates(
        candidates: combined,
        profile: profile,
        limit: limit,
        allowRecent: true, // New releases can be newly discovered
        forceShuffle: forceRefresh,
      );
    } catch (_) {
      return const [];
    }
  }

  /// Context-aware Time of Day recommendations strictly matching user's language & mood.
  Future<List<Track>> getTimeOfDayRecommendations({
    int limit = 12,
    bool forceRefresh = false,
  }) async {
    final profile = buildTasteProfile();
    final timeCtx = ListeningHistoryService.getTimeOfDayContext(
      profile.primaryLanguage,
    );

    final timeQuery = profile.primaryLanguage.isNotEmpty
        ? '${profile.primaryLanguage} ${profile.primaryGenre.isNotEmpty ? profile.primaryGenre : "acoustic"} morning hits'
        : (profile.primaryGenre.isNotEmpty
              ? '${profile.primaryGenre} ${timeCtx.defaultSearchTerm}'
              : timeCtx.defaultSearchTerm);

    try {
      final tracks = await InnerTubeService.instance
          .search(timeQuery, forceRefresh: forceRefresh)
          .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
          .catchError((_) => <Track>[]);

      final hour = DateTime.now().hour;
      final targetEnergy = (hour >= 5 && hour < 12)
          ? 0.40
          : (hour >= 12 && hour < 17)
          ? 0.55
          : (hour >= 17 && hour < 22)
          ? 0.65
          : 0.30;
      return filterAndRankCandidates(
        candidates: tracks,
        profile: profile,
        limit: limit,
        targetEnergy: targetEnergy,
        forceShuffle: forceRefresh,
      );
    } catch (_) {
      return const [];
    }
  }

  /// Spotlight songs for a favorite artist.
  Future<List<Track>> getFavoriteArtistTracks(
    String artistName, {
    int limit = 8,
    bool forceRefresh = false,
  }) async {
    final profile = buildTasteProfile();
    try {
      final tracks = await InnerTubeService.instance
          .search('$artistName hits', forceRefresh: forceRefresh)
          .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
          .catchError((_) => <Track>[]);

      return filterAndRankCandidates(
        candidates: tracks,
        profile: profile,
        limit: limit,
        allowRecent: true, // Artist spotlight allows familiar favorite tracks
        forceShuffle: forceRefresh,
      );
    } catch (_) {
      return const [];
    }
  }

  /// Returns personalized and ranked artist cards based on user's taste.
  Future<List<({String image, String name, String subs})>>
  getPersonalizedArtists({int limit = 10}) async {
    final profile = buildTasteProfile();
    final prefs = UserPreferencesService.instance.currentPrefs;
    final history = ListeningHistoryService.instance;

    final result = <({String image, String name, String subs})>[];
    final seen = <String>{};

    // 1. Explicit user favorite artists
    for (final fa in prefs.favoriteArtists) {
      final lower = fa.name.trim().toLowerCase();
      if (lower.isNotEmpty && seen.add(lower)) {
        result.add((name: fa.name, subs: 'Favorite Artist', image: fa.image));
      }
    }

    // 2. Most played history artists
    final topHistory = history.getTopArtists(limit: 6);
    for (final h in topHistory) {
      final lower = h.name.trim().toLowerCase();
      if (lower.isNotEmpty && lower != 'unknown artist' && seen.add(lower)) {
        final cached = ArtistService.getCachedAvatar(h.name) ?? '';
        result.add((
          name: h.name,
          subs: '${h.plays} plays • Top Artist',
          image: cached,
        ));
      }
    }

    // 3. Curated artists for user's qualified languages
    if (profile.recommendedLanguages.isNotEmpty) {
      final curated = UserPreferencesService.curatedArtistsForLanguages(
        profile.recommendedLanguages,
      );
      for (final name in curated.take(6)) {
        final lower = name.trim().toLowerCase();
        if (lower.isNotEmpty && seen.add(lower)) {
          final cached = ArtistService.getCachedAvatar(name) ?? '';
          result.add((
            name: name,
            subs: 'Top Artist • ${profile.recommendedLanguages.first}',
            image: cached,
          ));
        }
      }
    }

    // 4. Background avatar pre-resolution
    for (final a in result) {
      if (a.image.isEmpty) {
        ArtistService.resolveArtistAvatar(a.name);
      }
    }

    return result.take(limit).toList();
  }
}
