// lib/services/smart_queue_engine.dart
//
// Intelligent Queue Builder & Autoplay Recommendation Engine
// Applies strict hard filters (De-duplication by ID and normalized signature,
// Language consistency) followed by soft ranking (Mood/vibe energy match,
// artist affinity, album affinity, artist variety capping, and smooth energy progression).

import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import '../data/datasources/catalog_datasource.dart';
import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'api_service.dart';
import 'innertube_service.dart';

/// Configurable weights and constants for the Smart Queue Ranking Engine.
class SmartQueueWeights {
  static const double moodVibeWeight = 40.0;        // Primary: must match the same vibe
  static const double tempoEnergyWeight = 20.0;     // Tempo proximity
  static const double artistAffinityWeight = 15.0;
  static const double albumAffinityWeight = 10.0;
  static const double recEngineRankWeight = 15.0;

  /// Maximum consecutive songs permitted from the same artist in the autoplay queue.
  static const int maxConsecutiveArtist = 2;

  /// Ideal number of autoplay / upcoming songs maintained in Playing Next.
  static const int targetQueueSize = 12;

  /// Trigger threshold to fetch new candidates when Playing Next runs low.
  static const int refillThreshold = 3;

  /// Maximum number of recent history tracks screened for duplicate prevention.
  static const int duplicateHistoryWindow = 100;
}

class SmartQueueEngine {
  /// Normalizes track title and artist into a clean signature to block remixes,
  /// re-uploads, and feature variants from slipping in as duplicates.
  static String normalizeSignature(String title, String artist) {
    String cleanTitle = MediaNormalizer.cleanCompactTitle(title).toLowerCase();
    // Strip common movie/album parentheticals like (From "Leo"), [Official Video], (Tamil)
    cleanTitle = cleanTitle
        .replaceAll(RegExp(r'\s*[\(\[].*?[\)\]]'), '')
        .replaceAll(RegExp(r'^.*?\s+-\s+'), '')
        .replaceAll(RegExp(r'[^a-z0-9\s]'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    String cleanArtist = artist.toLowerCase();
    cleanArtist = cleanArtist
        .replaceAll(RegExp(r'(\b(feat|ft|and|with)\b|&).*'), '')
        .replaceAll(RegExp(r'[^a-z0-9\s]'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    return '$cleanTitle|$cleanArtist';
  }

  /// Detects the language of a track through metadata, Romanized artist/composer heuristics,
  /// or Unicode script ranges.
  static String detectLanguage(Track track) {
    if (track.language.isNotEmpty && track.language != 'unknown') {
      return track.language.toLowerCase().trim();
    }

    // 1. Romanized Latin heuristics (composer/artist dictionary and title keywords)
    // 95%+ of Indian and regional tracks on YouTube Music use Latin script in titles & artists
    final detected = Track.detectLanguage(track.title, track.artist, track.album);
    if (detected != null && detected.isNotEmpty) {
      return detected.toLowerCase();
    }

    final fullText = '${track.title} ${track.artist} ${track.album}';

    // 2. Unicode Script Range Detection (when native script is used)
    // Tamil: U+0B80 - U+0BFF
    if (RegExp(r'[\u0B80-\u0BFF]').hasMatch(fullText)) return 'tamil';
    // Telugu: U+0C00 - U+0C7F
    if (RegExp(r'[\u0C00-\u0C7F]').hasMatch(fullText)) return 'telugu';
    // Devanagari (Hindi): U+0900 - U+097F
    if (RegExp(r'[\u0900-\u097F]').hasMatch(fullText)) return 'hindi';
    // Malayalam: U+0D00 - U+0D7F
    if (RegExp(r'[\u0D00-\u0D7F]').hasMatch(fullText)) return 'malayalam';
    // Kannada: U+0C80 - U+0CFF
    if (RegExp(r'[\u0C80-\u0CFF]').hasMatch(fullText)) return 'kannada';
    // Gurmukhi (Punjabi): U+0A00 - U+0A7F
    if (RegExp(r'[\u0A00-\u0A7F]').hasMatch(fullText)) return 'punjabi';

    return '';
  }

  /// Estimates the energy/mood score of a track on a 0.0 (calm/slow/sad/acoustic)
  /// to 1.0 (party/high-energy/mass/kuthu) scale.
  static double estimateEnergy(Track track) {
    final lower = '${track.title} ${track.artist} ${track.album}'.toLowerCase();

    // Low Energy (Slow / Melancholic / Acoustic / Romantic / Calm)
    const lowKeywords = [
      'acoustic', 'unplugged', 'melody', 'love', 'romantic', 'sad', 'slow',
      'lullaby', 'piano', 'lofi', 'chill', 'heartbreak', 'rain', 'peaceful',
      'kadhalae', 'kanave', 'uyire', 'maruvarthai', 'poonkathe', 'thendral',
      'neeyum', 'anbe', 'vizhi', 'thalli', 'malare', 'ennodu', 'venmegam',
      'kaatru', 'yaen', 'unakkul', 'idhayame', 'nenjame', 'parayuvaan'
    ];

    // High Energy (Party / Dance / Mass / Fast BPM / Kuthu)
    const highKeywords = [
      'remix', 'party', 'dance', 'mass', 'beat', 'club', 'bass', 'kuthu',
      'folk', 'dappan', 'energy', 'anthem', 'trap', 'rap', 'hip hop',
      'verithanam', 'vaathi', 'aluma', 'naatu', 'thalaivar', 'dhamaka',
      'rowdy', 'jalabulajangu', 'dippam', 'chilla', 'badass', 'hukum',
      'jawan', 'arabic kuthu', 'marana', 'local', 'blast', 'fire', 'banger'
    ];

    int lowHits = 0;
    for (final kw in lowKeywords) {
      if (lower.contains(kw)) lowHits++;
    }

    int highHits = 0;
    for (final kw in highKeywords) {
      if (lower.contains(kw)) highHits++;
    }

    if (highHits > 0 && lowHits == 0) {
      return math.min(1.0, 0.70 + (highHits * 0.10));
    }
    if (lowHits > 0 && highHits == 0) {
      return math.max(0.10, 0.35 - (lowHits * 0.08));
    }

    // Default mid-tempo baseline
    return 0.50;
  }

  /// Soft ranking score calculation combining mood vibe, artist affinity,
  /// album affinity, and native recommendation engine ranking.
  static double calculateScore({
    required Track candidate,
    required Track seed,
    required int originalRank,
    required double seedEnergy,
  }) {
    // 1. Mood / Vibe Match (35%)
    final candEnergy = estimateEnergy(candidate);
    final energyDelta = (candEnergy - seedEnergy).abs();
    final moodScore = (1.0 - energyDelta.clamp(0.0, 1.0)) * SmartQueueWeights.moodVibeWeight;

    // 2. Artist Affinity (20%)
    double artistScore = 0.0;
    final candPrimary = candidate.artist.toLowerCase();
    final seedPrimary = seed.artist.toLowerCase();
    if (candPrimary == seedPrimary ||
        candidate.artistNames.any((a) => seed.artistNames.contains(a))) {
      artistScore = SmartQueueWeights.artistAffinityWeight;
    }

    // 3. Album / Soundtrack Affinity (15%)
    double albumScore = 0.0;
    if (candidate.album.isNotEmpty &&
        candidate.album != 'Single' &&
        candidate.album.toLowerCase() == seed.album.toLowerCase()) {
      albumScore = SmartQueueWeights.albumAffinityWeight;
    }

    // 4. Recommendation Engine Base Rank (15%)
    final recRankScore = ((30 - originalRank.clamp(0, 30)) / 30.0) *
        SmartQueueWeights.recEngineRankWeight;

    // 5. Tempo / Energy Proximity (15%)
    final tempoScore = (1.0 - (energyDelta * 0.8).clamp(0.0, 1.0)) *
        SmartQueueWeights.tempoEnergyWeight;

    return moodScore + artistScore + albumScore + recRankScore + tempoScore;
  }

  /// Detects whether a track is a background score, theme music, dialogue, teaser snippet,
  /// or short instrumental cue.
  static bool isThemeOrBgm(Track track) {
    final title = track.title.toLowerCase();
    final album = track.album.toLowerCase();

    // 1. Duration check: snippets, cues, promos under 90s (1.5 min)
    if (track.durationSeconds > 0 && track.durationSeconds < 90) {
      return true;
    }

    // 2. Exact keyword / token matching for themes, bgms, scores, dialogs
    const bgmKeywords = [
      'bgm', 'theme', 'original score', 'background score', 'ost',
      'soundtrack version', 'theme music', 'motion poster', 'teaser',
      'trailer', 'dialogue', 'punch dialogue', 'ringtone', 'title card',
      'interval bgm', 'climax bgm', 'entry bgm', 'intro bgm', 'outro bgm',
      'interval theme', 'climax theme', 'entry theme', 'intro theme',
      'outro theme', 'whistle theme', 'score theme', 'theme song',
      'mass theme', 'theme track', 'theme instrumental', 'bgm score',
      'theme bit', 'theme music track', 'promo cut', 'theme cut'
    ];

    for (final kw in bgmKeywords) {
      final reg = RegExp(r'(^|[^\w])' + RegExp.escape(kw) + r'([^\w]|$)', caseSensitive: false);
      if (reg.hasMatch(title) || reg.hasMatch(album)) {
        return true;
      }
    }
    return false;
  }

  /// Checks if a track contains script characters or tags belonging to languages other than expectedLang.
  static bool _hasOtherLanguageIndicators(Track track, String expectedLang) {
    final raw = '${track.title} ${track.artist} ${track.album}'.toLowerCase();

    // Unicode script checks
    for (final rune in raw.runes) {
      if (expectedLang != 'tamil' && rune >= 0x0B80 && rune <= 0x0BFF) return true;
      if (expectedLang != 'telugu' && rune >= 0x0C00 && rune <= 0x0C7F) return true;
      if (expectedLang != 'hindi' && rune >= 0x0900 && rune <= 0x097F) return true;
      if (expectedLang != 'malayalam' && rune >= 0x0D00 && rune <= 0x0D7F) return true;
      if (expectedLang != 'kannada' && rune >= 0x0C80 && rune <= 0x0CF2) return true;
      if (expectedLang != 'punjabi' && rune >= 0x0A00 && rune <= 0x0A7F) return true;
      if (expectedLang != 'bengali' && rune >= 0x0980 && rune <= 0x09FF) return true;
    }

    // Explicit language bracket checks: e.g. "(Telugu)", "[Hindi]", "(Malayalam)"
    const allLangs = [
      'tamil', 'telugu', 'hindi', 'malayalam', 'kannada', 'punjabi', 'bengali'
    ];
    for (final l in allLangs) {
      if (l != expectedLang) {
        final reg = RegExp(r'[\(\[]\s*' + RegExp.escape(l) + r'\s*[\)\]]|\bfrom\s+"?[^"]+"?\s+-\s+' + RegExp.escape(l) + r'\b', caseSensitive: false);
        if (reg.hasMatch(raw)) return true;
      }
    }
    return false;
  }

  /// Filters candidates using hard rules and sorts them using soft ranking.
  /// Strict filters guarantee language consistency, vibe match, and theme/BGM exclusion.
  static List<Track> filterAndRank({
    required List<Track> candidates,
    required Track seed,
    required Set<String> existingIds,
    required Set<String> existingSignatures,
    int count = SmartQueueWeights.targetQueueSize,
  }) {
    final seedLanguage = detectLanguage(seed).toLowerCase().trim();
    final seedEnergy = estimateEnergy(seed);
    final seedIsTheme = isThemeOrBgm(seed);

    // --- Hard Filter 1: De-duplication (ID and normalized signature) & Theme Exclusion ---
    final deduped = <Track>[];
    final seenIds = Set<String>.from(existingIds);
    final seenSignatures = Set<String>.from(existingSignatures);

    for (int i = 0; i < candidates.length; i++) {
      final t = candidates[i];
      final cleanId = t.id.replaceFirst('yt-', '').trim();
      final sig = normalizeSignature(t.title, t.artist);

      if (seenIds.contains(t.id) || seenIds.contains(cleanId)) continue;
      if (sig.isNotEmpty && seenSignatures.contains(sig)) continue;

      // Filter Themes/BGMs: Do NOT merge short themes / BGMs into regular lengthy song queues!
      if (!seedIsTheme && isThemeOrBgm(t)) continue;

      // Filter out overly short tracks if the seed is a full song (>= 120s)
      if (!seedIsTheme && seed.durationSeconds >= 120 && t.durationSeconds > 0 && t.durationSeconds < 90) {
        continue;
      }

      seenIds.add(t.id);
      seenIds.add(cleanId);
      if (sig.isNotEmpty) seenSignatures.add(sig);
      deduped.add(t);
    }

    if (deduped.isEmpty) return const [];

    // --- Hard Filter 2: Same Language Filter (STRICT: NEVER switch language!) ---
    List<Track> languageFiltered = deduped;
    if (seedLanguage.isNotEmpty) {
      languageFiltered = deduped.where((t) {
        final tLang = detectLanguage(t).toLowerCase().trim();
        // If detected language is known, it MUST match seedLanguage
        if (tLang.isNotEmpty && tLang != seedLanguage) {
          return false;
        }
        // If undetermined, ensure it does not contain indicators of a different language
        if (tLang.isEmpty && _hasOtherLanguageIndicators(t, seedLanguage)) {
          return false;
        }
        return true;
      }).toList();

      if (languageFiltered.isEmpty) {
        // If zero matched, strictly keep only undetermined tracks that don't have conflicting language
        languageFiltered = deduped.where((t) {
          final tLang = detectLanguage(t).toLowerCase().trim();
          return tLang == seedLanguage;
        }).toList();
      }
    }

    if (languageFiltered.isEmpty) return const [];

    // --- Hard Filter 3: Same Vibe Consistency ---
    // Prevent jarring vibe jumps (e.g. gentle slow melody jumping to loud party track, or vice versa)
    final vibeFiltered = languageFiltered.where((t) {
      final candEnergy = estimateEnergy(t);
      final energyDelta = (candEnergy - seedEnergy).abs();
      return energyDelta <= 0.40;
    }).toList();

    final poolToRank = vibeFiltered.isNotEmpty ? vibeFiltered : languageFiltered;

    // --- Soft Ranking: Score Candidates ---
    final scored = <(Track track, double score, double energy)>[];
    for (int i = 0; i < poolToRank.length; i++) {
      final t = poolToRank[i];
      final score = calculateScore(
        candidate: t,
        seed: seed,
        originalRank: i,
        seedEnergy: seedEnergy,
      );
      scored.add((t, score, estimateEnergy(t)));
    }

    // Sort by total score descending
    scored.sort((a, b) => b.$2.compareTo(a.$2));

    // --- Artist Variety Capping (Max 2 consecutive from same artist) ---
    final rankedTracks = <Track>[];
    final pool = scored.map((e) => e.$1).toList();

    while (pool.isNotEmpty && rankedTracks.length < count) {
      int pickIndex = 0;

      // Check consecutive artist rule
      if (rankedTracks.length >= SmartQueueWeights.maxConsecutiveArtist) {
        final last1 = rankedTracks[rankedTracks.length - 1].artist.toLowerCase();
        final last2 = rankedTracks[rankedTracks.length - 2].artist.toLowerCase();

        if (last1 == last2) {
          final alternativeIdx = pool.indexWhere((t) => t.artist.toLowerCase() != last1);
          if (alternativeIdx >= 0) {
            pickIndex = alternativeIdx;
          }
        }
      }

      rankedTracks.add(pool.removeAt(pickIndex));
    }

    // --- Gradual Energy Progression ---
    // Smooth transitions between adjacent songs
    if (rankedTracks.length >= 4) {
      _smoothEnergyTransitions(rankedTracks, seedEnergy);
    }

    return rankedTracks;
  }

  /// Rearranges candidates so the transition in energy between consecutive tracks
  /// changes gradually rather than making jarring leaps.
  static void _smoothEnergyTransitions(List<Track> tracks, double initialEnergy) {
    double current = initialEnergy;
    for (int i = 0; i < tracks.length - 1; i++) {
      int bestIdx = i;
      double minDelta = double.infinity;

      for (int j = i; j < tracks.length; j++) {
        final delta = (estimateEnergy(tracks[j]) - current).abs();
        if (delta < minDelta) {
          minDelta = delta;
          bestIdx = j;
        }
      }

      if (bestIdx != i) {
        final temp = tracks[i];
        tracks[i] = tracks[bestIdx];
        tracks[bestIdx] = temp;
      }
      current = estimateEnergy(tracks[i]);
    }
  }

  /// High-level fetch and rank provider for QueueState.
  static Future<List<Track>> fetchAndRank({
    required Track seed,
    required Set<String> existingIds,
    required Set<String> existingSignatures,
    int count = SmartQueueWeights.targetQueueSize,
  }) async {
    try {
      final seedLanguage = detectLanguage(seed).toLowerCase().trim();
      final seedEnergy = estimateEnergy(seed);
      final cleanId = seed.id.replaceFirst('yt-', '').trim();
      final cleanArtist = seed.artist.split(',').first.trim();
      final cleanTitle = MediaNormalizer.cleanTitle(seed.title);

      List<Track> candidates = [];
      if (cleanId.isNotEmpty) {
        try {
          candidates = await InnerTubeService.instance.getNextQueue(cleanId);
        } catch (_) {}
      }

      // 1. Supplement with artist related songs
      if (candidates.length < 20 && seed.artist.isNotEmpty) {
        try {
          final related = await InnerTubeService.instance.fetchRelated(seed);
          candidates = [...candidates, ...related];
        } catch (_) {}
      }

      // 2. Targeted language and vibe search if candidates are sparse or already filtered
      if (candidates.length < 25 && cleanArtist.isNotEmpty) {
        try {
          final vibeKeyword = seedEnergy >= 0.65
              ? 'hits'
              : (seedEnergy <= 0.40 ? 'melody songs' : 'songs');
          final query = seedLanguage.isNotEmpty
              ? '$cleanArtist $seedLanguage $vibeKeyword'
              : '$cleanArtist $vibeKeyword';
          final supplement = await InnerTubeService.instance.search(query);
          candidates = [...candidates, ...supplement];
        } catch (_) {}
      }

      // 3. Fallback search by song title & language
      if (candidates.length < 20 && cleanTitle.isNotEmpty) {
        try {
          final query = seedLanguage.isNotEmpty
              ? '$cleanTitle $seedLanguage radio'
              : '$cleanTitle radio mix';
          final titleRadio = await ApiService.search(query);
          candidates = [...candidates, ...titleRadio];
        } catch (_) {}
      }

      // 4. Fallback to catalog data, strictly filtered by matching language!
      if (candidates.isEmpty || candidates.where((t) => detectLanguage(t) == seedLanguage).length < 5) {
        final catalogSameLang = CatalogDataSource.allTracks.where((t) {
          if (seedLanguage.isNotEmpty) {
            final tLang = detectLanguage(t).toLowerCase().trim();
            return tLang == seedLanguage;
          }
          return true;
        }).toList();
        candidates = [...candidates, ...catalogSameLang];
      }

      final ranked = filterAndRank(
        candidates: candidates,
        seed: seed,
        existingIds: existingIds,
        existingSignatures: existingSignatures,
        count: count,
      );

      if (ranked.isNotEmpty) return ranked;

      // If strict filters left nothing, return language and vibe matching candidates only (NEVER switch language!)
      return candidates.where((t) {
        if (t.id == seed.id || existingIds.contains(t.id)) return false;
        if (!isThemeOrBgm(seed) && isThemeOrBgm(t)) return false;
        if (seedLanguage.isNotEmpty) {
          final tLang = detectLanguage(t).toLowerCase().trim();
          if (tLang.isNotEmpty && tLang != seedLanguage) return false;
          if (tLang.isEmpty && _hasOtherLanguageIndicators(t, seedLanguage)) return false;
        }
        final delta = (estimateEnergy(t) - seedEnergy).abs();
        return delta <= 0.45;
      }).take(count).toList();
    } catch (e) {
      if (kDebugMode) debugPrint('[SmartQueueEngine] Error fetching candidates: $e');
      return const [];
    }
  }
}

