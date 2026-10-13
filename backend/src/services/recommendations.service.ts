import { prisma } from '../utils/prisma';
import { getCacheVal, setCacheVal } from '../utils/cache';
import { PreferencesService } from './preferences.service';

export interface RecommendationSeed {
  type: 'track' | 'artist' | 'album';
  id: string;
}

export interface ScoredCandidate {
  id: string;
  type: 'track' | 'album' | 'artist';
  title?: string;
  name?: string;
  artistId?: string;
  artistName?: string;
  coverUrl?: string;
  imageUrl?: string;
  audioUrl?: string;
  duration?: number;
  language?: string;
  genre?: string;
  releaseDate?: Date | null;
  streams?: number;
  score: number;
  seedRelevance: number;
  userAffinity: number;
  sessionAffinity: number;
  popularityScore: number;
  freshnessScore: number;
  coListeningScore: number;
}

export class RecommendationsService {
  // Session Taste cache: userId -> Array<{ genre?: string; language?: string; artistId?: string; timestamp: number }>
  private static sessionTasteCache = new Map<string, Array<{ genre?: string; language?: string; artistId?: string; timestamp: number }>>();

  /**
   * Record a play into session taste (TTL 6 hours)
   */
  static recordSessionPlay(userId: string, track: { genre?: string; language?: string; artistId?: string }) {
    if (!userId) return;
    const now = Date.now();
    let history = this.sessionTasteCache.get(userId) || [];
    // Filter out items older than 6 hours
    history = history.filter(h => now - h.timestamp < 6 * 3600 * 1000);
    history.unshift({ ...track, timestamp: now });
    // Keep max 10
    if (history.length > 10) history = history.slice(0, 10);
    this.sessionTasteCache.set(userId, history);
  }

  /**
   * Get decayed session taste vector
   */
  static getSessionTaste(userId?: string) {
    if (!userId) return { languages: {}, genres: {}, artists: {} };
    const history = this.sessionTasteCache.get(userId) || [];
    const languages: Record<string, number> = {};
    const genres: Record<string, number> = {};
    const artists: Record<string, number> = {};

    history.forEach((h, idx) => {
      // Exponential decay: most recent weighs 1.0, older decayed down to 0.1
      const decay = Math.pow(0.8, idx);
      if (h.language) {
        const lang = h.language.toLowerCase();
        languages[lang] = (languages[lang] || 0) + decay;
      }
      if (h.genre) {
        genres[h.genre] = (genres[h.genre] || 0) + decay;
      }
      if (h.artistId) {
        artists[h.artistId] = (artists[h.artistId] || 0) + decay;
      }
    });

    return { languages, genres, artists };
  }

  /**
   * 1. Candidate Generators
   */

  // getArtistCatalog(artistId)
  static async getArtistCatalog(artistId: string) {
    const cacheKey = `artistcatalog:${artistId}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached;

    // Fetch artist details
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      include: {
        tracks: {
          where: { deletedAt: null, audioUrl: { not: '' } },
          orderBy: { streams: 'desc' },
          take: 30,
          include: { artist: true, album: true }
        },
        albums: {
          orderBy: { releaseDate: 'desc' },
          take: 20,
          include: { tracks: { take: 5 } }
        }
      }
    });

    if (!artist) return { artist: null, topTracks: [], albums: [], singles: [] };

    // Categorize albums vs singles (singles usually <= 3 tracks)
    const albums = artist.albums.filter(a => (a.tracks?.length || 0) > 3);
    const singles = artist.albums.filter(a => (a.tracks?.length || 0) <= 3);

    const result = {
      artist: {
        id: artist.id,
        name: artist.name,
        bio: artist.bio,
        imageUrl: artist.imageUrl || artist.coverUrl,
        follower_count: artist.follower_count,
        monthlyListeners: artist.monthlyListeners
      },
      topTracks: artist.tracks,
      albums,
      singles
    };

    await setCacheVal(cacheKey, result, 3600); // 1h TTL
    return result;
  }

  // getRelatedArtists(artistId)
  static async getRelatedArtists(artistId: string) {
    const cacheKey = `rel:artist:${artistId}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached;

    const sourceArtist = await prisma.artist.findUnique({
      where: { id: artistId },
      include: { tracks: { take: 10, select: { genre: true, language: true } } }
    });

    if (!sourceArtist) return [];

    const genres = Array.from(new Set(sourceArtist.tracks.map(t => t.genre).filter(Boolean)));
    const languages = Array.from(new Set(sourceArtist.tracks.map(t => t.language).filter(Boolean)));

    // Find other artists sharing the same genres and languages
    const related = await prisma.artist.findMany({
      where: {
        id: { not: artistId },
        tracks: {
          some: {
            OR: [
              { genre: { in: genres as string[] } },
              { language: { in: languages as string[] } }
            ]
          }
        }
      },
      take: 12,
      orderBy: { monthlyListeners: 'desc' },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        coverUrl: true,
        monthlyListeners: true
      }
    });

    const formatted = related.map(a => ({
      id: a.id,
      name: a.name,
      imageUrl: a.imageUrl || a.coverUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=18181b&color=e11d48&size=300`,
      type: 'artist' as const
    }));

    await setCacheVal(cacheKey, formatted, 24 * 3600);
    return formatted;
  }

  // getCollaborators(seed)
  static async getCollaborators(artistId: string) {
    // Find tracks where this artist is featured or shares album
    const tracksWithOthers = await prisma.track.findMany({
      where: {
        artistId,
        featuredArtists: { not: null }
      },
      select: { featuredArtists: true },
      take: 20
    });

    const collaboratorNames = new Set<string>();
    tracksWithOthers.forEach(t => {
      if (t.featuredArtists) {
        t.featuredArtists.split(',').forEach(name => {
          const clean = name.trim();
          if (clean) collaboratorNames.add(clean);
        });
      }
    });

    if (collaboratorNames.size === 0) return [];

    const artists = await prisma.artist.findMany({
      where: { name: { in: Array.from(collaboratorNames) } },
      select: { id: true, name: true, imageUrl: true }
    });

    return artists;
  }

  // getSameVibeTracks(trackId, limit, meta)
  static async getSameVibeTracks(
    trackId: string, 
    limit = 20, 
    meta?: { title?: string; artist?: string; language?: string; genre?: string; country?: string }
  ) {
    const cacheKey = `sim:track:${trackId}:${meta?.language || ''}:${meta?.genre || ''}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached;

    let baseTrack = await prisma.track.findUnique({
      where: { id: trackId },
      include: { vibeProfile: true, artist: true }
    });

    const lang = baseTrack?.language || meta?.language;
    const gen = baseTrack?.genre || meta?.genre;
    const artId = baseTrack?.artistId;
    const artName = baseTrack?.artist?.name || meta?.artist;
    const ctry = baseTrack?.countryName || meta?.country;

    // 1. Query local database tracks matching artist, genre, or vibe profile (NEVER country or language alone!)
    let similar = await prisma.track.findMany({
      where: {
        id: { not: trackId },
        deletedAt: null,
        audioUrl: { not: '' },
        OR: [
          ...(artId ? [{ artistId: artId }] : []),
          ...(artName ? [{ artist: { name: { contains: artName, mode: 'insensitive' as const } } }] : []),
          ...(gen ? [{ genre: { equals: gen, mode: 'insensitive' as const } }] : [])
        ]
      },
      take: limit,
      orderBy: { streams: 'desc' },
      include: {
        artist: { select: { id: true, name: true, imageUrl: true } },
        album: { select: { id: true, title: true, coverUrl: true } },
        vibeProfile: true
      }
    });

    // 2. Verified External Retrieval: Only search for specific artist songs or verified track related songs
    if (similar.length < 5 && (artName || meta?.title)) {
      try {
        const { ExternalMetadataService } = await import('./external-metadata.service.js');
        const queriesToTry: string[] = [];
        if (artName && meta?.title) queriesToTry.push(`${meta.title} ${artName}`);
        else if (artName) queriesToTry.push(`${artName} songs`);

        for (const q of queriesToTry.slice(0, 1)) {
          if (similar.length >= limit) break;
          const ytmResults = await ExternalMetadataService.searchYoutubeMusic(q).catch(() => []);
          for (const item of ytmResults) {
            if (similar.length >= limit) break;
            const parsed = ExternalMetadataService.parseYoutubeVideoToTrack(item);
            if (!similar.some(s => s.id === parsed.id || s.title.toLowerCase() === parsed.title.toLowerCase())) {
              similar.push(parsed as any);
            }
          }
        }
      } catch (extErr: any) {
        console.warn('[Recommendations] External vibe search error:', extErr.message);
      }
    }

    if (similar.length > 0) {
      await setCacheVal(cacheKey, similar, 24 * 3600);
    }
    return similar;
  }

  // getCoListening(seedId, seedType)
  static async getCoListening(seedId: string, seedType: 'track' | 'artist' = 'track') {
    // Item-item co-occurrence: users who played the seed within 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let userIds: string[] = [];
    if (seedType === 'track') {
      const plays = await prisma.history.findMany({
        where: { trackId: seedId, playedAt: { gte: sevenDaysAgo } },
        select: { userId: true },
        distinct: ['userId'],
        take: 50
      });
      userIds = plays.map(p => p.userId);
    }

    if (userIds.length < 3) {
      // Minimum support of 3 users required; return empty if insufficient support
      return [];
    }

    // Tracks played by these users
    const coPlayed = await prisma.history.groupBy({
      by: ['trackId'],
      where: {
        userId: { in: userIds },
        trackId: { not: seedId },
        playedAt: { gte: sevenDaysAgo }
      },
      _count: { trackId: true },
      having: {
        trackId: {
          _count: { gte: 3 } // Minimum support of 3
        }
      },
      orderBy: {
        _count: { trackId: 'desc' }
      },
      take: 15
    });

    const trackIds = coPlayed.map(c => c.trackId);
    if (trackIds.length === 0) return [];

    return await prisma.track.findMany({
      where: { id: { in: trackIds }, deletedAt: null },
      include: { artist: true, album: true }
    });
  }

  // getRelatedAlbums(albumId)
  static async getRelatedAlbums(albumId: string) {
    const cacheKey = `albumrel:${albumId}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached;

    const baseAlbum = await prisma.album.findUnique({
      where: { id: albumId },
      include: {
        artist: true,
        tracks: { take: 1, select: { language: true, genre: true } }
      }
    });

    if (!baseAlbum) return [];

    // 1. More albums by the same artist
    const sameArtistAlbums = await prisma.album.findMany({
      where: { artistId: baseAlbum.artistId, id: { not: albumId } },
      orderBy: { releaseDate: 'desc' },
      take: 8,
      include: { artist: { select: { id: true, name: true } } }
    });

    // 2. Albums by related artists in same language
    const lang = baseAlbum.tracks[0]?.language;
    const relatedAlbums = await prisma.album.findMany({
      where: {
        artistId: { not: baseAlbum.artistId },
        id: { not: albumId },
        tracks: { some: { language: lang || undefined } }
      },
      orderBy: { releaseDate: 'desc' },
      take: 8,
      include: { artist: { select: { id: true, name: true } } }
    });

    const result = {
      moreByArtist: sameArtistAlbums,
      relatedAlbums
    };

    await setCacheVal(cacheKey, result, 24 * 3600);
    return result;
  }

  /**
   * 2 & 3. Scoring & Re-ranking Formula
   * score = 0.30*seedRelevance + 0.20*userAffinity + 0.15*sessionAffinity + 0.15*popularity(log-scaled) + 0.10*freshness + 0.10*coListening - penalties
   */
  static scoreCandidate(
    candidate: any,
    seed: RecommendationSeed,
    userProfile: any,
    sessionTaste: any,
    recentHistoryTrackIds: Set<string> = new Set()
  ): ScoredCandidate {
    // 1. Seed Relevance (0.0 - 1.0)
    let seedRelevance = 0.3;
    if (seed.type === 'artist' && candidate.artistId === seed.id) seedRelevance = 1.0;
    else if (seed.type === 'album' && candidate.albumId === seed.id) seedRelevance = 1.0;
    else if (seed.type === 'track' && candidate.id === seed.id) seedRelevance = 1.0;
    else if (candidate.genre && seed.type === 'track' && candidate.genre === (seed as any).genre) seedRelevance += 0.3;

    // 2. User Affinity = 0.5*langWeight + 0.3*genreWeight + 0.2*artistWeight
    const langWeights = (userProfile?.languageWeights as Record<string, number>) || {};
    const genreWeights = (userProfile?.genreWeights as Record<string, number>) || {};
    const artistWeights = (userProfile?.artistWeights as Record<string, number>) || {};

    const langKey = (candidate.language || '').toLowerCase();
    const lWeight = langWeights[langKey] || 0.1;
    const gWeight = genreWeights[candidate.genre || ''] || 0.1;
    const aWeight = artistWeights[candidate.artist?.name || ''] || 0.1;

    const userAffinity = 0.5 * lWeight + 0.3 * gWeight + 0.2 * aWeight;

    // 3. Session Affinity
    const sLang = (sessionTaste.languages || {})[langKey] || 0;
    const sGenre = (sessionTaste.genres || {})[candidate.genre || ''] || 0;
    const sArtist = (sessionTaste.artists || {})[candidate.artistId || ''] || 0;
    const sessionAffinity = Math.min(1.0, 0.4 * sLang + 0.3 * sGenre + 0.3 * sArtist);

    // 4. Popularity (log-scaled)
    const streams = candidate.streams || 0;
    const popularityScore = Math.min(1.0, Math.log10(streams + 10) / 7.0);

    // 5. Freshness
    let freshnessScore = 0.5;
    if (candidate.createdAt || candidate.releaseDate) {
      const daysOld = (Date.now() - new Date(candidate.createdAt || candidate.releaseDate).getTime()) / (1000 * 3600 * 24);
      if (daysOld < 30) freshnessScore = 1.0;
      else if (daysOld < 180) freshnessScore = 0.8;
      else if (daysOld < 365) freshnessScore = 0.6;
      else freshnessScore = 0.4;
    }

    // 6. Co-listening score
    const coListeningScore = candidate.coCount ? Math.min(1.0, candidate.coCount / 10) : 0.2;

    // Penalties: recently played in last 24h
    let penalty = 0;
    if (recentHistoryTrackIds.has(candidate.id)) {
      penalty += 0.25;
    }

    const totalScore =
      0.30 * seedRelevance +
      0.20 * userAffinity +
      0.15 * sessionAffinity +
      0.15 * popularityScore +
      0.10 * freshnessScore +
      0.10 * coListeningScore -
      penalty;

    return {
      id: candidate.id,
      type: candidate.type || 'track',
      title: candidate.title,
      name: candidate.name,
      artistId: candidate.artistId || candidate.artist?.id,
      artistName: candidate.artist?.name,
      coverUrl: candidate.coverUrl || candidate.imageUrl,
      imageUrl: candidate.imageUrl,
      audioUrl: candidate.audioUrl,
      duration: candidate.duration,
      language: candidate.language,
      genre: candidate.genre,
      releaseDate: candidate.releaseDate,
      streams: candidate.streams,
      score: Math.max(0, totalScore),
      seedRelevance,
      userAffinity,
      sessionAffinity,
      popularityScore,
      freshnessScore,
      coListeningScore
    };
  }

  /**
   * 4 & 5. Filter & Diversify
   * - Max 2 tracks per artist per shelf
   * - Deduplicate by title + artist
   * - User's top languages first by score, then other languages by score (NEVER alphabetical)
   */
  static diversifyTracks(tracks: ScoredCandidate[], userProfile: any, maxPerArtist = 2): ScoredCandidate[] {
    const seenTrackIds = new Set<string>();
    const seenNormalizedTitles = new Set<string>();
    const artistCounts: Record<string, number> = {};

    const validTracks: ScoredCandidate[] = [];

    for (const t of tracks) {
      if (seenTrackIds.has(t.id)) continue;
      const key = `${(t.title || '').toLowerCase().trim()}|${(t.artistName || '').toLowerCase().trim()}`;
      if (seenNormalizedTitles.has(key)) continue;

      const aId = t.artistId || 'unknown';
      if ((artistCounts[aId] || 0) >= maxPerArtist) continue;

      seenTrackIds.add(t.id);
      seenNormalizedTitles.add(key);
      artistCounts[aId] = (artistCounts[aId] || 0) + 1;
      validTracks.push(t);
    }

    // Rank: User's top languages first (by score), then other languages (by score)
    const userLangWeights = (userProfile?.languageWeights as Record<string, number>) || {};
    const topLangs = new Set(Object.keys(userLangWeights).map(l => l.toLowerCase()));

    const primaryLangTracks = validTracks.filter(t => topLangs.has((t.language || '').toLowerCase()));
    const discoveryTracks = validTracks.filter(t => !topLangs.has((t.language || '').toLowerCase()));

    primaryLangTracks.sort((a, b) => b.score - a.score);
    discoveryTracks.sort((a, b) => b.score - a.score);

    return [...primaryLangTracks, ...discoveryTracks];
  }

  /**
   * Build complete context recommendation response for Artist, Album, or Track
   */
  static async getContextRecommendations(userId: string | undefined, seed: RecommendationSeed) {
    // 1. Fetch user interest profile (offline precomputed only!)
    const userProfile = userId
      ? await prisma.userInterestProfile.findUnique({ where: { userId } })
      : null;

    const sessionTaste = this.getSessionTaste(userId);

    // 2. Seed-specific recommendations
    if (seed.type === 'artist') {
      const [catalog, relatedArtists, sameVibeTracks] = await Promise.all([
        this.getArtistCatalog(seed.id),
        this.getRelatedArtists(seed.id),
        this.getSameVibeTracks(seed.id, 25)
      ]);

      const scoredTracks = sameVibeTracks.map(t =>
        this.scoreCandidate(t, seed, userProfile, sessionTaste)
      );
      const diversifiedSimilar = this.diversifyTracks(scoredTracks, userProfile);

      return {
        artist: catalog.artist,
        popularTracks: catalog.topTracks.slice(0, 10),
        albums: catalog.albums,
        singles: catalog.singles,
        fansAlsoLike: relatedArtists,
        similarVibe: diversifiedSimilar.slice(0, 15)
      };
    } else if (seed.type === 'album') {
      const album = await prisma.album.findUnique({
        where: { id: seed.id },
        include: {
          artist: true,
          tracks: {
            where: { deletedAt: null },
            orderBy: { trackNumber: 'asc' },
            include: { artist: true }
          }
        }
      });

      const [relatedAlbums, sameVibeTracks] = await Promise.all([
        this.getRelatedAlbums(seed.id),
        this.getSameVibeTracks(seed.id, 20)
      ]);

      const scoredVibe = sameVibeTracks.map(t =>
        this.scoreCandidate(t, seed, userProfile, sessionTaste)
      );

      return {
        album,
        tracklist: album?.tracks || [],
        moreByArtist: relatedAlbums.moreByArtist,
        relatedAlbums: relatedAlbums.relatedAlbums,
        sameVibeSongs: this.diversifyTracks(scoredVibe, userProfile).slice(0, 12)
      };
    } else {
      // seed.type === 'track'
      const baseTrack = await prisma.track.findUnique({
        where: { id: seed.id },
        include: { artist: true, album: true }
      });

      const [similarTracks, coListening] = await Promise.all([
        this.getSameVibeTracks(seed.id, 30),
        this.getCoListening(seed.id, 'track')
      ]);

      const allCandidates = [...similarTracks, ...coListening];
      const scored = allCandidates.map(t =>
        this.scoreCandidate(t, seed, userProfile, sessionTaste)
      );
      const diversified = this.diversifyTracks(scored, userProfile);

      return {
        track: baseTrack,
        similarTracks: diversified.slice(0, 20),
        moreFromArtist: baseTrack?.artistId ? (await this.getArtistCatalog(baseTrack.artistId)).topTracks.slice(0, 10) : []
      };
    }
  }

  /**
   * Build Radio Autoplay Queue (size = 30)
   * Refilled automatically on frontend when <= 5 tracks remain
   */
  static async buildRadioQueue(
    userId: string | undefined, 
    seed: RecommendationSeed, 
    size = 30,
    meta?: { title?: string; artist?: string; language?: string; genre?: string; country?: string }
  ) {
    try {
      const { RecommendationEngineService } = await import('./recommendation-engine.service.js');
      const radioTracks = await RecommendationEngineService.buildRadioQueue(userId, {
        type: seed.type,
        id: seed.id,
        title: meta?.title,
        artistName: meta?.artist,
        genre: meta?.genre,
        language: meta?.language
      }, size);

      if (radioTracks.length > 0) {
        return radioTracks;
      }
    } catch (e: any) {
      console.warn('[Recommendations] RecommendationEngineService radio queue error:', e.message);
    }

    const userProfile = userId
      ? await prisma.userInterestProfile.findUnique({ where: { userId } })
      : null;

    const sessionTaste = this.getSessionTaste(userId);

    let candidates: any[] = [];
    if (seed.type === 'track') {
      candidates = await this.getSameVibeTracks(seed.id, size * 2, meta);
    } else if (seed.type === 'artist') {
      const catalog = await this.getArtistCatalog(seed.id);
      const similar = await this.getSameVibeTracks(catalog.topTracks[0]?.id || seed.id, size * 2, meta);
      candidates = [...catalog.topTracks, ...similar];
    } else {
      candidates = await this.getSameVibeTracks(seed.id, size * 2, meta);
    }

    const scored = candidates.map(t =>
      this.scoreCandidate(t, seed, userProfile, sessionTaste)
    );

    const diversified = this.diversifyTracks(scored, userProfile, 2);
    return diversified.slice(0, size);
  }
}
