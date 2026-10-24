import axios from 'axios';
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
    limit = 25, 
    meta?: { 
      title?: string; 
      artist?: string; 
      language?: string; 
      genre?: string; 
      country?: string;
      album?: string;
      movie?: string;
      mood?: string;
      aura_vibe?: string;
      excludeIds?: Set<string>;
    }
  ) {
    const cacheKey = `sim:track:${trackId}:${meta?.language || ''}:${meta?.genre || ''}:${meta?.mood || ''}`;
    const cached = await getCacheVal(cacheKey);
    if (cached && Array.isArray(cached) && cached.length >= 8) return cached;

    let baseTrack: any = null;
    try {
      baseTrack = await prisma.track.findUnique({
        where: { id: trackId },
        include: { vibeProfile: true, artist: true, album: true }
      });
    } catch {}

    const lang = (baseTrack?.language || meta?.language || '').trim();
    const gen = (baseTrack?.genre || meta?.genre || '').trim();
    const artName = (baseTrack?.artist?.name || meta?.artist || '').trim();
    const movieName = (baseTrack?.album?.title || meta?.movie || meta?.album || '').trim();
    const seedTitle = (baseTrack?.title || meta?.title || '').trim();
    const moodStr = (meta?.mood || meta?.aura_vibe || baseTrack?.vibeProfile?.aura_vibe || (baseTrack?.vibeProfile as any)?.moodTags?.[0] || gen || '').toLowerCase().trim();

    // 1. Detect Vibe signature
    let vibeKeywords = 'hit songs';
    if (/mass|energy|energetic|party|dance|beat|kuthu|fast|club|edm|celebration/i.test(moodStr) || /arabic|halamithi|jimmiki|badass|naa ready|kaavaalaa|dance|party/i.test(seedTitle)) {
      vibeKeywords = 'energetic dance party hit songs';
    } else if (/romantic|melody|love|soul|acoustic|sweet|heart/i.test(moodStr) || /melody|romantic|love|kadhal|kannazhaga|enna sona|kesariya/i.test(seedTitle)) {
      vibeKeywords = 'romantic melody soulful songs';
    } else if (/chill|lofi|relax|calm|ambient|peaceful|night/i.test(moodStr)) {
      vibeKeywords = 'chill lofi relaxing songs';
    } else if (/sad|emotional|heartbreak|breakup|pain/i.test(moodStr)) {
      vibeKeywords = 'emotional sad songs';
    } else if (lang) {
      vibeKeywords = 'super hit songs';
    }

    const similar: any[] = [];
    const seenTitles = new Set<string>();
    const artistTrackCount: Record<string, number> = {};

    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const cleanSeedTitle = norm(seedTitle);
    if (cleanSeedTitle) seenTitles.add(cleanSeedTitle);

    const addCandidate = (cand: any) => {
      if (!cand || !cand.id) return false;
      if (meta?.excludeIds && meta.excludeIds.has(cand.id)) return false;
      const cTitle = norm(cand.title || '');
      if (!cTitle || seenTitles.has(cTitle)) return false;

      // STRICT USER RULE: Language MUST be identical to the song being played
      if (lang) {
        const cLang = (cand.language || '').toLowerCase().trim();
        const targetLang = lang.toLowerCase().trim();
        if (cLang && cLang !== targetLang && !cLang.includes(targetLang) && !targetLang.includes(cLang)) {
          return false; // Skip foreign language songs
        }
        if (!cand.language) {
          cand.language = lang;
        }
      }

      const aName = (cand.artist?.name || cand.artistName || 'Unknown').toLowerCase().trim();
      // USER RULE: Strict diversity cap: Max 2 tracks per artist so we explore songs across different artists
      if ((artistTrackCount[aName] || 0) >= 2) return false;

      artistTrackCount[aName] = (artistTrackCount[aName] || 0) + 1;
      seenTitles.add(cTitle);
      similar.push(cand);
      return true;
    };

    // 2. Query local database tracks matching language, genre, or mood tags
    try {
      const dbCandidates = await prisma.track.findMany({
        where: {
          id: { not: trackId },
          deletedAt: null,
          audioUrl: { not: '' },
          ...(lang ? { language: { equals: lang, mode: 'insensitive' as const } } : {}),
          OR: [
            ...(gen ? [{ genre: { contains: gen, mode: 'insensitive' as const } }] : []),
            ...(moodStr ? [{ aura_vibe: { contains: moodStr, mode: 'insensitive' as const } }] : []),
            { streams: { gte: 0 } }
          ]
        },
        take: limit * 2,
        orderBy: { streams: 'desc' },
        include: {
          artist: { select: { id: true, name: true, imageUrl: true } },
          album: { select: { id: true, title: true, coverUrl: true } },
          vibeProfile: true
        }
      });

      for (const t of dbCandidates) {
        if (similar.length >= limit) break;
        addCandidate(t);
      }
    } catch (dbErr: any) {
      console.warn('[Recommendations] Local vibe candidates query error:', dbErr.message);
    }

    // 3. Multi-Source Search #1: JioSaavn (Fast, high-fidelity licensed streams with native language support)
    if (similar.length < limit) {
      try {
        const saavnQueries: string[] = [];
        if (lang) {
          saavnQueries.push(`${lang} ${vibeKeywords}`);
          if (seedTitle) saavnQueries.push(`${lang} ${seedTitle}`);
          if (artName) saavnQueries.push(`${lang} ${artName} hit songs`);
        } else {
          saavnQueries.push(vibeKeywords);
          if (seedTitle) saavnQueries.push(seedTitle);
        }

        for (const q of saavnQueries) {
          if (similar.length >= limit) break;
          const saavnRes = await axios.get('https://www.jiosaavn.com/api.php', {
            params: {
              __call: 'search.getResults',
              _format: 'json',
              _marker: '0',
              api_version: '4',
              ctx: 'web6dot0',
              n: 25,
              q
            },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000
          }).catch(() => null);

          const results = saavnRes?.data?.results || [];
          const { CleanCdnAudioService } = await import('./clean-cdn-audio.service.js');
          for (const s of results) {
            if (similar.length >= limit) break;
            const sLang = (s.language || '').toLowerCase().trim();
            if (lang && sLang && sLang !== lang.toLowerCase() && !sLang.includes(lang.toLowerCase())) continue;

            const cover = s.image ? s.image.replace('150x150', '500x500') : null;
            const encUrl = s.encrypted_media_url || s.more_info?.encrypted_media_url;
            let audioUrl = '';
            if (encUrl) {
              audioUrl = CleanCdnAudioService.decryptSaavnMediaUrl(encUrl) || '';
            }
            if (!audioUrl && s.media_preview_url) {
              audioUrl = s.media_preview_url;
            }

            const parsed = {
              id: `saavn-${s.id}`,
              title: s.song || s.title,
              artist: {
                id: `saavn-artist-${s.primary_artists_id || s.id}`,
                name: s.primary_artists || s.singers || 'Various Artists',
                imageUrl: null
              },
              artistName: s.primary_artists || s.singers || 'Various Artists',
              album: {
                id: `saavn-album-${s.albumid || s.id}`,
                title: s.album || 'Single',
                coverUrl: cover
              },
              coverUrl: cover,
              duration: Number(s.duration) || 180,
              audioUrl: audioUrl,
              language: s.language || lang,
              type: 'track'
            };
            addCandidate(parsed);
          }
        }
      } catch (saavnErr: any) {
        console.warn('[Recommendations] Saavn vibe search error:', saavnErr.message);
      }
    }

    // 4. Multi-Source Search #2: iTunes Music API (Licensed high-quality audio & 600x600 covers)
    if (similar.length < limit) {
      try {
        const itunesQueries: string[] = [];
        if (lang) {
          if (seedTitle) itunesQueries.push(`${lang} ${seedTitle}`);
          itunesQueries.push(`${lang} ${vibeKeywords}`);
          if (artName) itunesQueries.push(`${lang} ${artName}`);
        } else {
          if (seedTitle) itunesQueries.push(artName ? `${seedTitle} ${artName}` : seedTitle);
          itunesQueries.push(vibeKeywords);
        }

        for (const q of itunesQueries) {
          if (similar.length >= limit) break;
          const itunesRes = await axios.get(`https://itunes.apple.com/search`, {
            params: {
              term: q,
              entity: 'song',
              limit: 25
            },
            timeout: 4000
          }).catch(() => null);

          const itunesItems = itunesRes?.data?.results || [];
          for (const item of itunesItems) {
            if (similar.length >= limit) break;
            const cover = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : null;
            const parsed = {
              id: `itunes-${item.trackId}`,
              title: item.trackName,
              artist: {
                id: `itunes-artist-${item.artistId || item.trackId}`,
                name: item.artistName || 'Various Artists',
                imageUrl: null
              },
              artistName: item.artistName || 'Various Artists',
              album: {
                id: `itunes-album-${item.collectionId || item.trackId}`,
                title: item.collectionName || 'Single',
                coverUrl: cover
              },
              coverUrl: cover,
              duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 180,
              audioUrl: item.previewUrl || '',
              language: lang || 'English',
              type: 'track'
            };
            addCandidate(parsed);
          }
        }
      } catch (itunesErr: any) {
        console.warn('[Recommendations] iTunes vibe search error:', itunesErr.message);
      }
    }

    if (similar.length > 0) {
      await setCacheVal(cacheKey, similar, 6 * 3600); // 6h TTL
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
    meta?: { 
      title?: string; 
      artist?: string; 
      language?: string; 
      genre?: string; 
      country?: string;
      album?: string;
      movie?: string;
      mood?: string;
      aura_vibe?: string;
      excludeIds?: Set<string>;
    }
  ) {
    // Invoke our smart multi-source vibe discovery directly
    const vibeTracks = await this.getSameVibeTracks(seed.id, size, meta);

    const artistCounts: Record<string, number> = {};
    const seenTitles = new Set<string>();
    const finalQueue: any[] = [];

    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const seedTitleNorm = meta?.title ? norm(meta.title) : '';

    for (const t of vibeTracks) {
      if (!t || !t.id) continue;
      if (meta?.excludeIds && meta.excludeIds.has(t.id)) continue;
      const tNorm = norm(t.title || '');
      if (seedTitleNorm && tNorm === seedTitleNorm) continue;
      if (seenTitles.has(tNorm)) continue;

      const aName = (t.artist?.name || t.artistName || 'Unknown').toLowerCase().trim();
      // Strict diversity cap: Max 2 tracks per artist so queue explores wide musical horizons
      if ((artistCounts[aName] || 0) >= 2) continue;

      artistCounts[aName] = (artistCounts[aName] || 0) + 1;
      seenTitles.add(tNorm);
      finalQueue.push(t);
      if (finalQueue.length >= size) break;
    }

    return finalQueue;
  }
}
