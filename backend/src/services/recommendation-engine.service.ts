import { prisma } from '../utils/prisma';
import { getCacheVal, setCacheVal } from '../utils/cache';

// ============================================================================
// DATA CONTRACTS & INTERFACES
// ============================================================================

export interface RecommendationSeed {
  type: 'track' | 'artist' | 'album';
  id: string;
  title?: string;
  artistId?: string;
  artistName?: string;
  genre?: string;
  language?: string;
  countryName?: string;
  energy?: number;
  tempoBucket?: string;
  moodTags?: string[];
}

export interface RecommendationCandidate {
  id: string;
  title: string;
  artistId?: string;
  artistName: string;
  albumId?: string;
  albumTitle?: string;
  coverUrl?: string;
  audioUrl?: string;
  duration: number;
  language?: string;
  genre?: string;
  countryName?: string;
  streams: number;
  releaseDate?: Date | null;
  createdAt?: Date;
  energy?: number;
  tempoBucket?: string;
  moodTags?: string[];
  vibeScore?: number;
  isPlayable: boolean;
  source: 'track_similarity' | 'artist_relationship' | 'co_listening' | 'taste_profile' | 'session_vibe' | 'catalog';
  coListeningCount?: number;
  similarityEvidence?: {
    contentScore?: number;
    vibeScore?: number;
    matchedArtist?: string;
    matchedCollaborator?: string;
    coPlayCount?: number;
    genreMatch?: boolean;
    artistMatch?: boolean;
    tasteProfileMatch?: boolean;
  };
}

export interface ProvenanceDetails {
  source: string;
  seedId?: string;
  similarityScore: number;
  signals: {
    seedRelevance: number;
    userAffinity: number;
    sessionAffinity: number;
    contentSimilarity: number;
    coListeningScore: number;
    freshnessScore: number;
    popularityScore: number;
    penalties: number;
  };
  passedQualityGate: boolean;
}

export interface ScoredRecommendation extends RecommendationCandidate {
  relevanceScore: number;
  passedQualityGate: boolean;
  recommendationReason: string;
  provenance: ProvenanceDetails;
}

export interface LongTermTasteProfile {
  languages: Record<string, number>;
  genres: Record<string, number>;
  artists: Record<string, number>;
  dislikedTrackIds: Set<string>;
  skippedTrackCounts: Record<string, number>;
  recentTrackIds: Set<string>;
  explicitLanguages?: string[];
  explicitGenres?: string[];
  explicitArtists?: string[];
  isColdStart: boolean;
}

export interface SessionPlaybackEvent {
  trackId: string;
  artistId?: string;
  artistName?: string;
  genre?: string;
  language?: string;
  duration?: number;
  playedDuration?: number;
  completed?: boolean;
  skipped?: boolean;
  timestamp?: number;
}

export interface SessionTasteProfile {
  recentEvents: SessionPlaybackEvent[];
  decayedLanguages: Record<string, number>;
  decayedGenres: Record<string, number>;
  decayedArtists: Record<string, number>;
}

// ============================================================================
// CALIBRATED CONFIGURATION CONSTANTS
// ============================================================================

export const MIN_RELEVANCE_THRESHOLD = 0.45; // Strict quality gate
export const MAX_TRACKS_PER_ARTIST = 2;       // Diversity cap
export const MIN_CO_LISTENING_SUPPORT = 3;    // Minimum distinct users for co-listening
export const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Ranking feature weights (normalized to 1.0)
export const RANKING_WEIGHTS = {
  seedRelevance: 0.30,
  userLongTermAffinity: 0.20,
  sessionAffinity: 0.20,
  contentSimilarity: 0.10,
  coListening: 0.10,
  freshness: 0.05,
  popularity: 0.05
};

// ============================================================================
// RECOMMENDATION ENGINE SERVICE
// ============================================================================

export class RecommendationEngineService {
  // In-memory session store (backed by fallback map, with Redis optional cache)
  private static sessionCache = new Map<string, SessionPlaybackEvent[]>();

  // ==========================================================================
  // 1. TASTE PROFILE MANAGEMENT (LONG-TERM & SHORT-TERM DUAL PROFILES)
  // ==========================================================================

  /**
   * Record real-time playback telemetry into the user's short-term session profile.
   * Distinguishes full completion from meaningful listens and quick skips.
   */
  static recordSessionPlayback(userId: string, event: SessionPlaybackEvent) {
    if (!userId || !event.trackId) return;

    const now = event.timestamp || Date.now();
    let events = this.sessionCache.get(userId) || [];

    // Filter events older than TTL
    events = events.filter(e => now - (e.timestamp || now) < SESSION_TTL_MS);

    // Add new event to top of stack
    events.unshift({ ...event, timestamp: now });

    // Keep sliding window of max 20 events
    if (events.length > 20) events = events.slice(0, 20);
    this.sessionCache.set(userId, events);
  }

  /**
   * Computes the short-term session profile with exponential recency decay.
   */
  static getSessionProfile(userId?: string): SessionTasteProfile {
    if (!userId) {
      return { recentEvents: [], decayedLanguages: {}, decayedGenres: {}, decayedArtists: {} };
    }

    const events = this.sessionCache.get(userId) || [];
    const decayedLanguages: Record<string, number> = {};
    const decayedGenres: Record<string, number> = {};
    const decayedArtists: Record<string, number> = {};

    events.forEach((ev, idx) => {
      // Exponential decay: most recent weighs 1.0, decaying with exponent 0.82
      const decay = Math.pow(0.82, idx);

      // Multiplier based on completion vs skip:
      // Completion (> 80% or explicit complete) = 1.25x
      // Meaningful listen (> 30s or > 40%) = 1.0x
      // Quick skip (< 15s or explicit skip) = 0.25x (low positive context)
      let completionMultiplier = 1.0;
      if (ev.completed) {
        completionMultiplier = 1.3;
      } else if (ev.skipped) {
        completionMultiplier = 0.3;
      } else if (ev.duration && ev.playedDuration) {
        const ratio = ev.playedDuration / ev.duration;
        if (ratio >= 0.8) completionMultiplier = 1.25;
        else if (ratio < 0.25) completionMultiplier = 0.35;
      }

      const weight = decay * completionMultiplier;

      if (ev.language) {
        const langKey = ev.language.toLowerCase().trim();
        decayedLanguages[langKey] = (decayedLanguages[langKey] || 0) + weight;
      }
      if (ev.genre) {
        const gKey = ev.genre.toLowerCase().trim();
        decayedGenres[gKey] = (decayedGenres[gKey] || 0) + weight;
      }
      if (ev.artistId || ev.artistName) {
        const aKey = (ev.artistId || ev.artistName || '').toLowerCase().trim();
        decayedArtists[aKey] = (decayedArtists[aKey] || 0) + weight;
      }
    });

    // Normalize session vectors
    const normalize = (map: Record<string, number>) => {
      const total = Object.values(map).reduce((sum, v) => sum + v, 0);
      if (total <= 0) return {};
      const res: Record<string, number> = {};
      for (const [k, v] of Object.entries(map)) {
        res[k] = Math.round((v / total) * 100) / 100;
      }
      return res;
    };

    return {
      recentEvents: events,
      decayedLanguages: normalize(decayedLanguages),
      decayedGenres: normalize(decayedGenres),
      decayedArtists: normalize(decayedArtists)
    };
  }

  /**
   * Retrieves or computes the stable long-term taste profile.
   * Accurately reflects observed listening distribution without arbitrary forcing.
   */
  static async getLongTermProfile(userId?: string): Promise<LongTermTasteProfile> {
    if (!userId) {
      return {
        languages: {},
        genres: {},
        artists: {},
        dislikedTrackIds: new Set(),
        skippedTrackCounts: {},
        recentTrackIds: new Set(),
        isColdStart: true
      };
    }

    const cacheKey = `taste:longterm:${userId}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) {
      return {
        ...cached,
        dislikedTrackIds: new Set(cached.dislikedTrackIds || []),
        recentTrackIds: new Set(cached.recentTrackIds || [])
      };
    }

    // 1. Fetch user interest profile & preferences
    const [userProfile, preferences, recentActivity, recentHistory, userLikes] = await Promise.all([
      prisma.userInterestProfile.findUnique({ where: { userId } }),
      prisma.userPreferences.findUnique({ where: { userId } }),
      prisma.userActivityEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 200
      }),
      prisma.history.findMany({
        where: { userId },
        orderBy: { playedAt: 'desc' },
        take: 100,
        include: {
          track: {
            select: { id: true, language: true, genre: true, artistId: true, artist: { select: { name: true } } }
          }
        }
      }),
      prisma.like.findMany({
        where: { userId },
        select: { trackId: true },
        take: 100
      })
    ]);

    const languageScores: Record<string, number> = {};
    const genreScores: Record<string, number> = {};
    const artistScores: Record<string, number> = {};
    const dislikedTrackIds = new Set<string>();
    const skippedTrackCounts: Record<string, number> = {};
    const recentTrackIds = new Set<string>();

    // Analyze activity events for skips, dislikes, and completions
    for (const act of recentActivity) {
      const data = (act.eventData as any) || {};
      const tId = data.trackId;
      if (tId) {
        if (act.eventType === 'dislike' || act.eventType === 'not_interested') {
          dislikedTrackIds.add(tId);
        } else if (act.eventType === 'skip') {
          skippedTrackCounts[tId] = (skippedTrackCounts[tId] || 0) + 1;
        }
      }
    }

    // Recent history tracks (last 24 hours) for novelty/recency penalties
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    for (const h of recentHistory) {
      if (h.trackId) {
        if (new Date(h.playedAt).getTime() > oneDayAgo) {
          recentTrackIds.add(h.trackId);
        }
      }
      if (h.track) {
        if (h.track.language) {
          const lKey = h.track.language.toLowerCase().trim();
          languageScores[lKey] = (languageScores[lKey] || 0) + 2.0;
        }
        if (h.track.genre) {
          const gKey = h.track.genre.toLowerCase().trim();
          genreScores[gKey] = (genreScores[gKey] || 0) + 2.0;
        }
        if (h.track.artistId || h.track.artist?.name) {
          const aKey = (h.track.artistId || h.track.artist?.name || '').toLowerCase().trim();
          artistScores[aKey] = (artistScores[aKey] || 0) + 3.0;
        }
      }
    }

    // Baseline preferences from onboarding
    if (preferences?.languages) {
      preferences.languages.forEach((lang, i) => {
        const lKey = lang.toLowerCase().trim();
        languageScores[lKey] = (languageScores[lKey] || 0) + Math.max(5 - i, 1);
      });
    }
    if (preferences?.preferredGenres) {
      preferences.preferredGenres.forEach((g, i) => {
        const gKey = g.toLowerCase().trim();
        genreScores[gKey] = (genreScores[gKey] || 0) + Math.max(5 - i, 1);
      });
    }

    // Blend stored UserInterestProfile if present
    if (userProfile) {
      const storedLangs = (userProfile.languageWeights as Record<string, number>) || {};
      for (const [k, v] of Object.entries(storedLangs)) {
        const key = k.toLowerCase().trim();
        languageScores[key] = (languageScores[key] || 0) + v * 10;
      }
      const storedGenres = (userProfile.genreWeights as Record<string, number>) || {};
      for (const [k, v] of Object.entries(storedGenres)) {
        const key = k.toLowerCase().trim();
        genreScores[key] = (genreScores[key] || 0) + v * 10;
      }
      const storedArtists = (userProfile.artistWeights as Record<string, number>) || {};
      for (const [k, v] of Object.entries(storedArtists)) {
        const key = k.toLowerCase().trim();
        artistScores[key] = (artistScores[key] || 0) + v * 10;
      }
    }

    // Normalize distributions
    const normalize = (scores: Record<string, number>, topN = 10) => {
      const sorted = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN);
      const total = sorted.reduce((sum, [, v]) => sum + v, 0);
      if (total <= 0) return {};
      const res: Record<string, number> = {};
      for (const [k, v] of sorted) {
        res[k] = Math.round((v / total) * 100) / 100;
      }
      return res;
    };

    const isColdStart = recentHistory.length < 3 && (!preferences || (!preferences.languages?.length && !preferences.preferredGenres?.length));

    const result: LongTermTasteProfile = {
      languages: normalize(languageScores, 6),
      genres: normalize(genreScores, 8),
      artists: normalize(artistScores, 12),
      dislikedTrackIds,
      skippedTrackCounts,
      recentTrackIds,
      explicitLanguages: preferences?.languages || [],
      explicitGenres: preferences?.preferredGenres || [],
      explicitArtists: (preferences?.favoriteArtists as any[])?.map(a => a?.name || '').filter(Boolean) || [],
      isColdStart
    };

    // Cache profile for 30 minutes
    await setCacheVal(cacheKey, {
      ...result,
      dislikedTrackIds: Array.from(dislikedTrackIds),
      recentTrackIds: Array.from(recentTrackIds)
    }, 1800);

    return result;
  }

  // ==========================================================================
  // 2. STAGE A: MULTI-SOURCE CANDIDATE GENERATION
  // ==========================================================================

  /**
   * Source 1: Track Similarity (Content & Vibe Profile Features)
   * Uses energy, tempo bucket, mood tags, and musical genre.
   */
  static async generateTrackSimilarityCandidates(seedTrackId: string, limit = 30): Promise<RecommendationCandidate[]> {
    const seed = await prisma.track.findUnique({
      where: { id: seedTrackId },
      include: { vibeProfile: true, artist: true, album: true }
    });

    if (!seed) return [];

    const seedVibe = seed.vibeProfile;
    const seedEnergy = seedVibe?.energy ?? 0.5;
    const seedTempo = seedVibe?.tempoBucket ?? 'mid';
    const seedMoods = new Set(seedVibe?.moodTags || []);
    const seedGenre = seed.genre?.toLowerCase().trim();

    // Query candidate tracks from database
    const candidates = await prisma.track.findMany({
      where: {
        id: { not: seedTrackId },
        deletedAt: null,
        audioUrl: { not: '' },
        OR: [
          ...(seedGenre ? [{ genre: { equals: seed.genre, mode: 'insensitive' as const } }] : []),
          ...(seed.artistId ? [{ artistId: seed.artistId }] : []),
          { vibeProfile: { tempoBucket: seedTempo } }
        ]
      },
      take: limit * 2,
      orderBy: { streams: 'desc' },
      include: { vibeProfile: true, artist: true, album: true }
    });

    const parsedCandidates: RecommendationCandidate[] = [];

    for (const t of candidates) {
      const v = t.vibeProfile;
      const energyDelta = Math.abs((v?.energy ?? 0.5) - seedEnergy);
      const tempoMatch = (v?.tempoBucket ?? 'mid') === seedTempo ? 1.0 : 0.4;
      const genreMatch = (t.genre?.toLowerCase().trim() === seedGenre) ? 1.0 : 0.0;

      // Jaccard similarity on mood tags
      let moodSim = 0.3;
      if (seedMoods.size > 0 && v?.moodTags?.length) {
        let intersection = 0;
        v.moodTags.forEach(m => { if (seedMoods.has(m)) intersection++; });
        moodSim = intersection / (seedMoods.size + v.moodTags.length - intersection);
      }

      // Content similarity score
      const contentScore = Math.max(0, 1.0 - energyDelta * 0.5) * 0.35 + tempoMatch * 0.25 + genreMatch * 0.25 + moodSim * 0.15;

      parsedCandidates.push({
        id: t.id,
        title: t.title,
        artistId: t.artistId,
        artistName: t.artist?.name || 'Unknown Artist',
        albumId: t.albumId || undefined,
        albumTitle: t.album?.title,
        coverUrl: t.coverUrl || t.album?.coverUrl,
        audioUrl: t.audioUrl,
        duration: t.duration || 0,
        language: t.language || undefined,
        genre: t.genre || undefined,
        countryName: t.countryName || undefined,
        streams: t.streams || 0,
        releaseDate: t.releaseDate,
        createdAt: t.createdAt,
        energy: v?.energy,
        tempoBucket: v?.tempoBucket,
        moodTags: v?.moodTags,
        vibeScore: v?.vibeScore ?? undefined,
        isPlayable: Boolean(t.audioUrl && t.audioUrl.length > 5),
        source: 'track_similarity',
        similarityEvidence: {
          contentScore,
          vibeScore: v?.vibeScore ?? undefined,
          genreMatch: Boolean(genreMatch)
        }
      });
    }

    return parsedCandidates;
  }

  /**
   * Source 2: Verified Artist Relationships (Collaborators, Featured Artists, Bandmates)
   */
  static async generateArtistRelationshipCandidates(artistId: string, limit = 20): Promise<RecommendationCandidate[]> {
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      include: {
        tracks: {
          where: { deletedAt: null, audioUrl: { not: '' } },
          orderBy: { streams: 'desc' },
          take: 15,
          include: { album: true }
        }
      }
    });

    if (!artist) return [];

    const candidates: RecommendationCandidate[] = [];

    // Tracks by same artist
    for (const t of artist.tracks) {
      candidates.push({
        id: t.id,
        title: t.title,
        artistId: artist.id,
        artistName: artist.name,
        albumId: t.albumId || undefined,
        albumTitle: t.album?.title,
        coverUrl: t.coverUrl || t.album?.coverUrl,
        audioUrl: t.audioUrl,
        duration: t.duration || 0,
        language: t.language || undefined,
        genre: t.genre || undefined,
        countryName: t.countryName || undefined,
        streams: t.streams || 0,
        releaseDate: t.releaseDate,
        createdAt: t.createdAt,
        isPlayable: Boolean(t.audioUrl && t.audioUrl.length > 5),
        source: 'artist_relationship',
        similarityEvidence: {
          artistMatch: true,
          matchedArtist: artist.name
        }
      });
    }

    return candidates;
  }

  /**
   * Source 3: Collaborative Co-Listening Relationships (Users who played track X also played Y)
   */
  static async generateCoListeningCandidates(seedTrackId: string, limit = 15): Promise<RecommendationCandidate[]> {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Find users who played the seed track
    const seedListeners = await prisma.history.findMany({
      where: { trackId: seedTrackId, playedAt: { gte: twoWeeksAgo } },
      select: { userId: true },
      distinct: ['userId'],
      take: 60
    });

    const userIds = seedListeners.map(l => l.userId).filter(Boolean);
    if (userIds.length < MIN_CO_LISTENING_SUPPORT) {
      return []; // Reject sparse/coincidental listening
    }

    // Find tracks played by these same users
    const coPlayed = await prisma.history.groupBy({
      by: ['trackId'],
      where: {
        userId: { in: userIds },
        trackId: { not: seedTrackId },
        playedAt: { gte: twoWeeksAgo }
      },
      _count: { trackId: true },
      having: {
        trackId: { _count: { gte: MIN_CO_LISTENING_SUPPORT } }
      },
      orderBy: {
        _count: { trackId: 'desc' }
      },
      take: limit
    });

    const coTrackIds = coPlayed.map(c => c.trackId);
    if (coTrackIds.length === 0) return [];

    const tracks = await prisma.track.findMany({
      where: { id: { in: coTrackIds }, deletedAt: null, audioUrl: { not: '' } },
      include: { artist: true, album: true }
    });

    const countMap = new Map(coPlayed.map(c => [c.trackId, c._count.trackId]));

    return tracks.map(t => ({
      id: t.id,
      title: t.title,
      artistId: t.artistId,
      artistName: t.artist?.name || 'Unknown Artist',
      albumId: t.albumId || undefined,
      albumTitle: t.album?.title,
      coverUrl: t.coverUrl || t.album?.coverUrl,
      audioUrl: t.audioUrl,
      duration: t.duration || 0,
      language: t.language || undefined,
      genre: t.genre || undefined,
      countryName: t.countryName || undefined,
      streams: t.streams || 0,
      releaseDate: t.releaseDate,
      createdAt: t.createdAt,
      isPlayable: Boolean(t.audioUrl && t.audioUrl.length > 5),
      source: 'co_listening',
      coListeningCount: countMap.get(t.id) || MIN_CO_LISTENING_SUPPORT,
      similarityEvidence: {
        coPlayCount: countMap.get(t.id) || MIN_CO_LISTENING_SUPPORT
      }
    }));
  }

  /**
   * Source 4: User Taste Profile Candidates (Alings with learned preferences)
   */
  static async generateTasteProfileCandidates(profile: LongTermTasteProfile, limit = 30): Promise<RecommendationCandidate[]> {
    if (profile.isColdStart) return [];

    const topGenres = Object.keys(profile.genres).slice(0, 3);
    const topArtists = Object.keys(profile.artists).slice(0, 4);

    if (topGenres.length === 0 && topArtists.length === 0) return [];

    const tracks = await prisma.track.findMany({
      where: {
        deletedAt: null,
        audioUrl: { not: '' },
        OR: [
          ...(topGenres.length > 0 ? [{ genre: { in: topGenres, mode: 'insensitive' as const } }] : []),
          ...(topArtists.length > 0 ? [{ artist: { name: { in: topArtists, mode: 'insensitive' as const } } }] : [])
        ]
      },
      take: limit * 2,
      orderBy: { streams: 'desc' },
      include: { artist: true, album: true, vibeProfile: true }
    });

    return tracks.map(t => ({
      id: t.id,
      title: t.title,
      artistId: t.artistId,
      artistName: t.artist?.name || 'Unknown Artist',
      albumId: t.albumId || undefined,
      albumTitle: t.album?.title,
      coverUrl: t.coverUrl || t.album?.coverUrl,
      audioUrl: t.audioUrl,
      duration: t.duration || 0,
      language: t.language || undefined,
      genre: t.genre || undefined,
      countryName: t.countryName || undefined,
      streams: t.streams || 0,
      releaseDate: t.releaseDate,
      createdAt: t.createdAt,
      energy: t.vibeProfile?.energy,
      tempoBucket: t.vibeProfile?.tempoBucket,
      moodTags: t.vibeProfile?.moodTags,
      isPlayable: Boolean(t.audioUrl && t.audioUrl.length > 5),
      source: 'taste_profile',
      similarityEvidence: {
        tasteProfileMatch: true
      }
    }));
  }

  // ==========================================================================
  // 3. STAGE B: ELIGIBILITY & RELEVANCE FILTERING
  // ==========================================================================

  /**
   * Stage B filters candidates strictly before scoring:
   * - Must be valid and playable (no dummy/empty audioUrl, no deleted tracks)
   * - Must not represent albums/artists (tracks only)
   * - Must not be duplicate recordings
   * - Must not be in user dislikes or repeated skips (>= 3 skips)
   * - Must NOT match ONLY weak attributes (language alone, country alone, popularity alone)
   * - Requires at least ONE strong relationship to pass into Stage C ranking!
   */
  static filterEligibleCandidates(
    candidates: RecommendationCandidate[],
    longTermProfile: LongTermTasteProfile,
    sessionProfile: SessionTasteProfile,
    options: {
      seedTrack?: RecommendationSeed;
      countryConstraint?: string;
      languageConstraint?: string;
    } = {}
  ): { eligible: RecommendationCandidate[]; rejectedCount: number; rejectionReasons: Record<string, number> } {
    const seenIds = new Set<string>();
    const seenNormalizedTitles = new Set<string>();
    const eligible: RecommendationCandidate[] = [];
    const rejectionReasons: Record<string, number> = {
      unplayable: 0,
      disliked: 0,
      repeated_skip: 0,
      duplicate: 0,
      country_violation: 0,
      language_violation: 0,
      weak_signals_only: 0
    };

    for (const c of candidates) {
      // 1. Playable & Non-deleted check
      if (!c.isPlayable || !c.audioUrl || c.audioUrl.trim().length === 0) {
        rejectionReasons.unplayable++;
        continue;
      }

      // 2. Identity & Deduplication
      if (seenIds.has(c.id)) {
        rejectionReasons.duplicate++;
        continue;
      }
      const normKey = `${c.title.toLowerCase().trim()}|${c.artistName.toLowerCase().trim()}`;
      if (seenNormalizedTitles.has(normKey)) {
        rejectionReasons.duplicate++;
        continue;
      }

      // 3. Negative Feedback: Disliked tracks
      if (longTermProfile.dislikedTrackIds.has(c.id)) {
        rejectionReasons.disliked++;
        continue;
      }

      // 4. Repeated skip filter (>= 3 skips)
      const skipCount = longTermProfile.skippedTrackCounts[c.id] || 0;
      if (skipCount >= 3) {
        rejectionReasons.repeated_skip++;
        continue;
      }

      // 5. Hard Country / Language Constraints
      if (options.countryConstraint && c.countryName) {
        if (c.countryName.toLowerCase() !== options.countryConstraint.toLowerCase()) {
          rejectionReasons.country_violation++;
          continue;
        }
      }
      if (options.languageConstraint && c.language) {
        if (c.language.toLowerCase() !== options.languageConstraint.toLowerCase()) {
          rejectionReasons.language_violation++;
          continue;
        }
      }

      // 6. NON-NEGOTIABLE CORE GATE: Weak Signals Alone (Language/Country/Popularity) DO NOT QUALIFY!
      // Must prove at least ONE strong musical or behavioural relationship:
      const hasArtistConnection = Boolean(
        c.similarityEvidence?.artistMatch ||
        (options.seedTrack?.artistId && c.artistId === options.seedTrack.artistId) ||
        (options.seedTrack?.artistName && c.artistName.toLowerCase() === options.seedTrack.artistName.toLowerCase()) ||
        (longTermProfile.artists[c.artistName.toLowerCase()] && longTermProfile.artists[c.artistName.toLowerCase()] >= 0.15) ||
        (sessionProfile.decayedArtists[c.artistName.toLowerCase()] && sessionProfile.decayedArtists[c.artistName.toLowerCase()] >= 0.15)
      );

      const hasContentSimilarity = Boolean(
        c.similarityEvidence?.contentScore && c.similarityEvidence.contentScore >= 0.50
      );

      const hasCoListening = Boolean(
        c.coListeningCount && c.coListeningCount >= MIN_CO_LISTENING_SUPPORT
      );

      const hasTasteAlignment = Boolean(
        c.genre && (
          (longTermProfile.genres[c.genre.toLowerCase()] && longTermProfile.genres[c.genre.toLowerCase()] >= 0.20) ||
          (sessionProfile.decayedGenres[c.genre.toLowerCase()] && sessionProfile.decayedGenres[c.genre.toLowerCase()] >= 0.20)
        )
      );

      // NON-NEGOTIABLE CORE GATE: When a seed track is active, candidates must have an artist connection,
      // content similarity, co-listening support, or a verified genre/vibe match to explore other artists with the same vibe!
      if (options.seedTrack) {
        const hasGenreOrVibeMatch = Boolean(
          (options.seedTrack.genre && c.genre && options.seedTrack.genre.toLowerCase() === c.genre.toLowerCase()) ||
          (c.similarityEvidence?.vibeScore && c.similarityEvidence.vibeScore >= 0.40) ||
          hasTasteAlignment
        );
        if (!hasArtistConnection && !hasContentSimilarity && !hasCoListening && !hasGenreOrVibeMatch) {
          rejectionReasons.weak_signals_only++;
          continue;
        }
      } else {
        // Personalized shelf without a seed: must have artist connection, content similarity, co-listening, or taste alignment!
        if (!hasArtistConnection && !hasContentSimilarity && !hasCoListening && !hasTasteAlignment) {
          rejectionReasons.weak_signals_only++;
          continue;
        }
      }

      seenIds.add(c.id);
      seenNormalizedTitles.add(normKey);
      eligible.push(c);
    }

    const rejectedCount = candidates.length - eligible.length;
    return { eligible, rejectedCount, rejectionReasons };
  }

  // ==========================================================================
  // 4. STAGE C: PERSONALIZED RANKING
  // ==========================================================================

  /**
   * Computes normalized relevance score combining multi-factor signals and penalties.
   */
  static rankCandidate(
    candidate: RecommendationCandidate,
    seed: RecommendationSeed | undefined,
    longTermProfile: LongTermTasteProfile,
    sessionProfile: SessionTasteProfile
  ): ScoredRecommendation {
    // 1. Seed Relevance (0.0 to 1.0)
    let seedRelevance = 0.2;
    if (seed) {
      if (seed.type === 'track' && candidate.id === seed.id) seedRelevance = 1.0;
      else if (seed.artistId && candidate.artistId === seed.artistId) seedRelevance = 0.95;
      else if (seed.artistName && candidate.artistName.toLowerCase() === seed.artistName.toLowerCase()) seedRelevance = 0.95;
      else if (seed.genre && candidate.genre && seed.genre.toLowerCase() === candidate.genre.toLowerCase()) seedRelevance += 0.35;
      else if (candidate.similarityEvidence?.contentScore) seedRelevance = Math.max(seedRelevance, candidate.similarityEvidence.contentScore);
    }

    // 2. User Long-Term Affinity (0.0 to 1.0)
    const lArtist = longTermProfile.artists[candidate.artistName.toLowerCase()] || 0;
    const lGenre = candidate.genre ? (longTermProfile.genres[candidate.genre.toLowerCase()] || 0) : 0;
    const lLang = candidate.language ? (longTermProfile.languages[candidate.language.toLowerCase()] || 0) : 0;
    const userLongTermAffinity = Math.min(1.0, 0.45 * lArtist + 0.35 * lGenre + 0.20 * lLang);

    // 3. Short-Term Session Affinity (0.0 to 1.0)
    const sArtist = sessionProfile.decayedArtists[candidate.artistName.toLowerCase()] || 0;
    const sGenre = candidate.genre ? (sessionProfile.decayedGenres[candidate.genre.toLowerCase()] || 0) : 0;
    const sLang = candidate.language ? (sessionProfile.decayedLanguages[candidate.language.toLowerCase()] || 0) : 0;
    const sessionAffinity = Math.min(1.0, 0.40 * sArtist + 0.35 * sGenre + 0.25 * sLang);

    // 4. Content / Vibe Similarity (0.0 to 1.0)
    const contentSimilarity = candidate.similarityEvidence?.contentScore ?? 0.4;

    // 5. Co-Listening Score (0.0 to 1.0)
    const coListeningScore = candidate.coListeningCount
      ? Math.min(1.0, candidate.coListeningCount / 10.0)
      : 0.15;

    // 6. Freshness Score (0.0 to 1.0)
    let freshnessScore = 0.5;
    const refDate = candidate.releaseDate || candidate.createdAt;
    if (refDate) {
      const daysOld = (Date.now() - new Date(refDate).getTime()) / (1000 * 3600 * 24);
      if (daysOld < 30) freshnessScore = 1.0;
      else if (daysOld < 90) freshnessScore = 0.8;
      else if (daysOld < 365) freshnessScore = 0.6;
      else freshnessScore = 0.3;
    }

    // 7. Popularity Score (log-scaled, 0.0 to 1.0)
    const popularityScore = Math.min(1.0, Math.log10((candidate.streams || 0) + 10) / 7.0);

    // 8. Penalties
    let penalties = 0;
    // Recently heard within 24h
    if (longTermProfile.recentTrackIds.has(candidate.id)) {
      penalties += 0.20;
    }
    // Skip penalty (skip count 1 = 0.08, skip count 2 = 0.25)
    const skips = longTermProfile.skippedTrackCounts[candidate.id] || 0;
    if (skips === 1) penalties += 0.08;
    else if (skips >= 2) penalties += 0.25;

    // Adaptive Weight Allocation based on context:
    let weights = { ...RANKING_WEIGHTS };

    if (longTermProfile.isColdStart && seed) {
      // Cold-start strategy: Prioritize seed relevance and verified content/artist similarity
      weights = {
        seedRelevance: 0.55,
        userLongTermAffinity: 0.0,
        sessionAffinity: 0.05,
        contentSimilarity: 0.20,
        coListening: 0.10,
        freshness: 0.05,
        popularity: 0.05
      };
    } else if (!seed) {
      // Personalized Discovery shelf (no seed track):
      // Prioritize user long-term and session profiles
      weights = {
        seedRelevance: 0.0,
        userLongTermAffinity: 0.45,
        sessionAffinity: 0.25,
        contentSimilarity: 0.15,
        coListening: 0.0,
        freshness: 0.075,
        popularity: 0.075
      };
    }

    // Composite Weighted Ranking
    const rawScore =
      weights.seedRelevance * seedRelevance +
      weights.userLongTermAffinity * userLongTermAffinity +
      weights.sessionAffinity * sessionAffinity +
      weights.contentSimilarity * contentSimilarity +
      weights.coListening * coListeningScore +
      weights.freshness * freshnessScore +
      weights.popularity * popularityScore -
      penalties;

    const relevanceScore = Math.max(0, Math.min(1.0, Math.round(rawScore * 1000) / 1000));
    const passedQualityGate = relevanceScore >= MIN_RELEVANCE_THRESHOLD;

    // Generate human-verifiable recommendation justification
    let recommendationReason = 'Recommended for you';
    if (candidate.similarityEvidence?.artistMatch || (seed && candidate.artistId === seed.artistId)) {
      recommendationReason = `More from ${candidate.artistName}`;
    } else if (sArtist > 0.3 || lArtist > 0.3) {
      recommendationReason = `Because you listen to ${candidate.artistName}`;
    } else if (candidate.similarityEvidence?.coPlayCount) {
      recommendationReason = 'Listeners of similar songs also enjoy this';
    } else if (candidate.similarityEvidence?.contentScore && candidate.similarityEvidence.contentScore > 0.7) {
      recommendationReason = `Matches the vibe and energy of your session`;
    } else if (candidate.genre && (sGenre > 0.3 || lGenre > 0.3)) {
      recommendationReason = `Based on your interest in ${candidate.genre}`;
    }

    const provenance: ProvenanceDetails = {
      source: candidate.source,
      seedId: seed?.id,
      similarityScore: relevanceScore,
      signals: {
        seedRelevance,
        userAffinity: userLongTermAffinity,
        sessionAffinity,
        contentSimilarity,
        coListeningScore,
        freshnessScore,
        popularityScore,
        penalties
      },
      passedQualityGate
    };

    return {
      ...candidate,
      relevanceScore,
      passedQualityGate,
      recommendationReason,
      provenance
    };
  }

  // ==========================================================================
  // 5. STAGE D: FINAL RE-RANKING & STRICT QUALITY GATE
  // ==========================================================================

  /**
   * Applies the non-negotiable quality gate:
   * - Filters candidates below MIN_RELEVANCE_THRESHOLD
   * - Enforces artist diversity caps (max 2 tracks per artist)
   * - Deduplicates
   * - Returns truthful empty set if no candidate qualifies
   */
  static applyQualityGateAndDiversify(
    scoredCandidates: ScoredRecommendation[],
    maxPerArtist = MAX_TRACKS_PER_ARTIST
  ): ScoredRecommendation[] {
    // 1. Strict Quality Gate: MUST pass threshold!
    const qualified = scoredCandidates.filter(c => c.passedQualityGate);

    // Sort by relevance score descending
    qualified.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // 2. Diversity & Saturation Cap
    const finalTracks: ScoredRecommendation[] = [];
    const artistCounts: Record<string, number> = {};

    for (const track of qualified) {
      const aKey = (track.artistId || track.artistName || 'unknown').toLowerCase();
      const currentCount = artistCounts[aKey] || 0;
      if (currentCount >= maxPerArtist) {
        continue; // Prevent saturation from one artist
      }

      artistCounts[aKey] = currentCount + 1;
      finalTracks.push(track);
    }

    return finalTracks;
  }

  // ==========================================================================
  // 6. UNIFIED PIPELINE EXECUTION
  // ==========================================================================

  /**
   * Executes the 4-stage pipeline for a given seed or personalized user context.
   */
  static async runPipeline(
    userId: string | undefined,
    seed: RecommendationSeed | undefined,
    options: {
      limit?: number;
      countryConstraint?: string;
      languageConstraint?: string;
      maxPerArtist?: number;
    } = {}
  ): Promise<ScoredRecommendation[]> {
    const limit = options.limit || 15;

    // Load dual taste profiles
    const [longTermProfile, sessionProfile] = await Promise.all([
      this.getLongTermProfile(userId),
      this.getSessionProfile(userId)
    ]);

    // STAGE A: Candidate Generation
    let rawCandidates: RecommendationCandidate[] = [];

    if (seed?.type === 'track') {
      const [vibeMatches, coListens, artistTracks] = await Promise.all([
        this.generateTrackSimilarityCandidates(seed.id, limit * 2),
        this.generateCoListeningCandidates(seed.id, limit),
        seed.artistId ? this.generateArtistRelationshipCandidates(seed.artistId, 10) : Promise.resolve([])
      ]);
      rawCandidates = [...vibeMatches, ...coListens, ...artistTracks];
    } else if (seed?.type === 'artist') {
      const artistTracks = await this.generateArtistRelationshipCandidates(seed.id, limit * 2);
      rawCandidates = [...artistTracks];
    } else {
      // Personalized Discovery (Homepage / Made For You)
      const tasteCandidates = await this.generateTasteProfileCandidates(longTermProfile, limit * 2);
      rawCandidates = [...tasteCandidates];
    }

    // STAGE B: Eligibility & Relevance Filtering
    const { eligible } = this.filterEligibleCandidates(rawCandidates, longTermProfile, sessionProfile, {
      seedTrack: seed,
      countryConstraint: options.countryConstraint,
      languageConstraint: options.languageConstraint
    });

    if (eligible.length === 0) {
      // NON-NEGOTIABLE RULE: Return truthful empty list rather than generic fallback
      return [];
    }

    // STAGE C: Personalized Ranking
    const scored = eligible.map(c => this.rankCandidate(c, seed, longTermProfile, sessionProfile));

    // STAGE D: Quality Gate & Constrained Re-Ranking
    const finalRecommendations = this.applyQualityGateAndDiversify(scored, options.maxPerArtist || MAX_TRACKS_PER_ARTIST);

    return finalRecommendations.slice(0, limit);
  }

  /**
   * Public discovery endpoint for Homepage "Made For You".
   */
  static async getPersonalizedDiscovery(userId: string | undefined, options: { limit?: number; country?: string; language?: string } = {}) {
    return await this.runPipeline(userId, undefined, {
      limit: options.limit || 12,
      countryConstraint: options.country,
      languageConstraint: options.language
    });
  }

  /**
   * Public seed recommendation endpoint for Track, Artist, or Album details.
   */
  static async getSeedRecommendations(
    userId: string | undefined,
    seed: RecommendationSeed,
    options: { limit?: number; country?: string; language?: string } = {}
  ) {
    return await this.runPipeline(userId, seed, options);
  }

  /**
   * Public radio autoplay queue generator.
   */
  static async buildRadioQueue(
    userId: string | undefined,
    seed: RecommendationSeed,
    size = 25
  ): Promise<ScoredRecommendation[]> {
    return await this.runPipeline(userId, seed, { limit: size, maxPerArtist: 2, languageConstraint: seed.language });
  }
}
