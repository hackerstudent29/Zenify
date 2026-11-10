// lib/services/smart_queue_engine.dart
//
// Intelligent Queue Builder & Autoplay Recommendation Engine
// Applies strict hard filters (De-duplication by ID and normalized signature,
// Language consistency) followed by soft ranking (Mood/vibe energy match,
// artist affinity, album affinity, artist variety capping, and smooth energy progression).

import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'innertube_service.dart';

/// Configurable weights and constants for the Smart Queue Ranking Engine.
class SmartQueueWeights {
  static const double recEngineRankWeight = 40.0;
  static const double moodVibeWeight = 25.0;
  static const double artistAffinityWeight = 15.0;
  static const double albumAffinityWeight = 10.0;
  static const double tempoEnergyWeight = 10.0;

  /// Maximum consecutive songs permitted from the same artist in the autoplay queue.
  static const int maxConsecutiveArtist = 2;

  /// Ideal number of autoplay / upcoming songs maintained in Playing Next.
  static const int targetQueueSize = 12;

  /// Trigger threshold to fetch new candidates when Playing Next runs low.
  static const int refillThreshold = 3;

  /// Maximum number of recent history tracks screened for duplicate prevention.
  static const int duplicateHistoryWindow = 50;
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

  /// Filters candidates using hard rules and sorts them using soft ranking.
  /// If strict filters leave too few candidates, it relaxes rules in the specified order:
  /// 1. Mood/energy tolerance
  /// 2. Artist variety cap
  /// 3. Language (last resort)
  static List<Track> filterAndRank({
    required List<Track> candidates,
    required Track seed,
    required Set<String> existingIds,
    required Set<String> existingSignatures,
    int count = SmartQueueWeights.targetQueueSize,
  }) {
    final seedLanguage = detectLanguage(seed);
    final seedEnergy = estimateEnergy(seed);

    // --- Hard Filter 1: De-duplication (ID and normalized signature) ---
    final deduped = <Track>[];
    final seenIds = Set<String>.from(existingIds);
    final seenSignatures = Set<String>.from(existingSignatures);

    for (int i = 0; i < candidates.length; i++) {
      final t = candidates[i];
      final cleanId = t.id.replaceFirst('yt-', '').trim();
      final sig = normalizeSignature(t.title, t.artist);

      if (seenIds.contains(t.id) || seenIds.contains(cleanId)) continue;
      if (sig.isNotEmpty && seenSignatures.contains(sig)) continue;

      seenIds.add(t.id);
      seenIds.add(cleanId);
      if (sig.isNotEmpty) seenSignatures.add(sig);
      deduped.add(t);
    }

    if (deduped.isEmpty) return const [];

    // --- Hard Filter 2: Same Language Filter ---
    List<Track> languageFiltered = deduped;
    if (seedLanguage.isNotEmpty) {
      final sameLang = deduped.where((t) {
        final tLang = detectLanguage(t);
        // Strict match or allow undetermined if scarce
        return tLang == seedLanguage;
      }).toList();

      if (sameLang.length >= 3) {
        languageFiltered = sameLang;
      } else {
        // Relax: include tracks where language detection was ambiguous before breaking language rule
        languageFiltered = deduped.where((t) {
          final tLang = detectLanguage(t);
          return tLang == seedLanguage || tLang.isEmpty;
        }).toList();
        if (languageFiltered.isEmpty) {
          // Relax language last only if zero matches
          languageFiltered = deduped;
        }
      }
    }

    // --- Soft Ranking: Score Candidates ---
    final scored = <(Track track, double score, double energy)>[];
    for (int i = 0; i < languageFiltered.length; i++) {
      final t = languageFiltered[i];
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
          // Find next track with a different artist
          final alternativeIdx = pool.indexWhere((t) => t.artist.toLowerCase() != last1);
          if (alternativeIdx >= 0) {
            pickIndex = alternativeIdx;
          }
          // If no alternative found, relax artist variety cap
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
      final cleanId = seed.id.replaceFirst('yt-', '').trim();
      List<Track> candidates = await InnerTubeService.instance.getNextQueue(cleanId);

      // If the primary next queue was sparse, supplement with seed artist radio mix
      if (candidates.length < 15 && seed.artist.isNotEmpty) {
        final supplement = await InnerTubeService.instance.search('${seed.artist} radio mix');
        candidates = [...candidates, ...supplement];
      }

      return filterAndRank(
        candidates: candidates,
        seed: seed,
        existingIds: existingIds,
        existingSignatures: existingSignatures,
        count: count,
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[SmartQueueEngine] Error fetching candidates: $e');
      return const [];
    }
  }
}

