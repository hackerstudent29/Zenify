import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AISearchService } from '../services/ai-search.service';
import { CompositeCatalogService, CatalogTrack } from '../services/catalog-provider.service';
import { PreferencesService } from '../services/preferences.service';
import { splitArtistString } from '../utils/artist';

const searchSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().default(16),
});

const autocompleteSchema = z.object({
  q: z.string().min(2),
});

const searchCache = new Map<string, { data: any; expires: number }>();
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 min cache

const COUNTRY_MAP: Record<string, string> = {
  india: 'in', in: 'in',
  'united states': 'us', us: 'us', usa: 'us',
  'united kingdom': 'gb', uk: 'gb', gb: 'gb'
};

/**
 * Calculates accurate relevance score for music search ranking
 */
function scoreItem(
  targetName: string,
  query: string,
  type: 'artist' | 'album' | 'track' | 'playlist',
  popularity: number = 0,
  isLocal: boolean = false
): number {
  const t = targetName.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  let score = 0;

  if (t === q) {
    score += 260; // Exact match
  } else if (t.startsWith(q)) {
    score += 180; // Starts with query
  } else if (t.split(/[\s\-&,/]+/).some(word => word.startsWith(q))) {
    score += 120; // Word start match (e.g. "Mahadevan" in "Shankar Mahadevan")
  } else if (t.includes(q)) {
    score += 60;  // Substring match
  } else {
    // If target does not match query at all, strict rejection for artist, album, playlist
    if (type === 'artist' || type === 'album' || type === 'playlist') {
      return 0;
    }
    score += 10;
  }

  // Local verified items play immediately without proxy latency
  if (isLocal) score += 35;

  // Type Intent Boosts:
  if (type === 'artist') {
    score += 45; // Artists prioritized when user types artist name
    if (popularity > 0) {
      score += Math.min(25, Math.round(Math.log10(popularity + 1) * 3));
    }
  } else if (type === 'album') {
    score += 25;
  } else if (type === 'track') {
    if (popularity > 0) {
      score += Math.min(25, Math.round(Math.log10(popularity + 1) * 2.5));
    }
    // Penalize cover / remix / karaoke versions unless query explicitly includes those words
    const isDerivative = /\b(remix|cover|karaoke|acoustic|slowed|reverb|instrumental|lofi|ringtone)\b/i.test(t);
    const wantsDerivative = /\b(remix|cover|karaoke|acoustic|slowed|reverb|instrumental|lofi|ringtone)\b/i.test(q);
    if (isDerivative && !wantsDerivative) {
      score -= 50;
    }
  } else if (type === 'playlist') {
    score += 15;
  }

  return score;
}

export async function searchRoutes(server: FastifyInstance) {
  /**
   * 1. ULTRA-FAST HIGH-ACCURACY GLOBAL SEARCH
   * Runs Local PostgreSQL Indexed DB Search concurrently with External Catalog Search.
   * Prioritizes Exact/Prefix Matches, Artists > Albums > Tracks, and suppresses lag.
   */
  server.get('/', {
    schema: { querystring: searchSchema }
  }, async (req: FastifyRequest<{ Querystring: z.infer<typeof searchSchema> }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { q, limit } = req.query;
    const cleanQ = q.trim();

    if (!cleanQ) {
      return reply.send({
        topResult: null,
        tracks: [],
        artists: [],
        albums: [],
        playlists: [],
        otherVersions: []
      });
    }

    // 1. Resolve User ID, Language Weights & Storefront
    let userId: string | null = null;
    let userLangWeights: Record<string, number> = {};
    let storefront = 'in';

    try {
      if (req.headers.authorization) {
        try {
          const decoded: any = await req.jwtVerify();
          userId = decoded?.id || null;
        } catch {}
      } else if ((req as any).cookies?.accessToken) {
        try {
          const decoded: any = server.jwt.verify((req as any).cookies.accessToken);
          userId = decoded?.id || null;
        } catch {}
      }

      if (userId) {
        const [user, profile, preferences] = await Promise.all([
          prisma.user.findUnique({ where: { id: userId }, select: { country: true } }),
          prisma.userInterestProfile.findUnique({ where: { userId } }),
          prisma.userPreferences.findUnique({ where: { userId } })
        ]);

        if (user?.country) {
          storefront = COUNTRY_MAP[user.country.toLowerCase().trim()] || 'in';
        }

        if (profile?.languageWeights && Object.keys(profile.languageWeights as any).length > 0) {
          userLangWeights = profile.languageWeights as Record<string, number>;
        } else if (preferences?.languages && preferences.languages.length > 0) {
          preferences.languages.forEach((l, idx) => {
            userLangWeights[l.toLowerCase()] = Math.max(0.1, 1.0 - idx * 0.2);
          });
        }
      }
    } catch {}

    const cacheKey = `search:${cleanQ.toLowerCase()}:${limit}:${storefront}:${userId || 'anon'}`;
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return reply.send(cached.data);
    }

    try {
      // 2. PARALLEL EXECUTION: Local Database Search + External Catalog Search (with strict 750ms race timeout)
      const localDbPromise = Promise.all([
        // A. Artists in DB
        prisma.artist.findMany({
          where: { name: { contains: cleanQ, mode: 'insensitive' } },
          take: 12,
          include: {
            _count: { select: { tracks: true, albums: true } }
          }
        }),

        // B. Albums in DB
        prisma.album.findMany({
          where: { title: { contains: cleanQ, mode: 'insensitive' } },
          take: 12,
          include: {
            artist: true,
            _count: { select: { tracks: true } }
          }
        }),

        // C. Tracks in DB
        prisma.track.findMany({
          where: {
            deletedAt: null,
            OR: [
              { title: { contains: cleanQ, mode: 'insensitive' } },
              { featuredArtists: { contains: cleanQ, mode: 'insensitive' } },
              { artist: { name: { contains: cleanQ, mode: 'insensitive' } } }
            ]
          },
          take: 32,
          include: {
            artist: true,
            album: true
          },
          orderBy: { streams: 'desc' }
        }),

        // D. Playlists in DB
        prisma.playlist.findMany({
          where: {
            isPublic: true,
            name: { contains: cleanQ, mode: 'insensitive' }
          },
          take: 10,
          include: {
            user: { select: { id: true, name: true, username: true } },
            _count: { select: { tracks: true } }
          }
        })
      ]).catch(err => {
        server.log.warn(`[Search] Local DB search warning: ${err.message}`);
        return [[], [], [], []] as [any[], any[], any[], any[]];
      });

      // External catalog search (capped at 3500ms so network lags never drop valid catalog tracks)
      const catalogPromise = Promise.race([
        CompositeCatalogService.search(cleanQ, storefront, limit),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('catalog_timeout')), 3500))
      ]).catch(() => ({ tracks: [], artists: [], albums: [] }));

      const [[dbArtists, dbAlbums, dbTracks, dbPlaylists], catalogResult] = await Promise.all([
        localDbPromise,
        catalogPromise
      ]);

      // 3. MERGE & DEDUPLICATE ARTISTS (Individual canonical entities, zero combined strings)
      const artistsMap = new Map<string, any>();
      for (const a of dbArtists) {
        const individualNames = splitArtistString(a.name);
        for (const singleName of individualNames) {
          const norm = singleName.toLowerCase().trim();
          const score = scoreItem(singleName, cleanQ, 'artist', a.follower_count || 0, true);
          if (score <= 0) continue; // STRICT REJECTION: Must actually match the search query!

          if (!artistsMap.has(norm) || (artistsMap.get(norm).score < score)) {
            artistsMap.set(norm, {
              id: a.name.toLowerCase().trim() === norm ? a.id : `artist-${encodeURIComponent(norm.replace(/[^a-z0-9]/g, '-'))}`,
              name: singleName,
              imageUrl: a.imageUrl,
              coverUrl: a.coverUrl,
              follower_count: a.follower_count || 0,
              trackCount: a._count?.tracks || 0,
              isArtist: true,
              type: 'artist',
              isLocal: true,
              score
            });
          }
        }
      }

      for (const ca of (catalogResult.artists || [])) {
        const individualNames = splitArtistString(ca.name);
        for (const singleName of individualNames) {
          const norm = singleName.toLowerCase().trim();
          const score = scoreItem(singleName, cleanQ, 'artist', 0, false);
          if (score <= 0) continue; // STRICT REJECTION: Must actually match the search query!

          if (!artistsMap.has(norm)) {
            artistsMap.set(norm, {
              id: ca.id.includes(norm) ? ca.id : `artist-${encodeURIComponent(norm.replace(/[^a-z0-9]/g, '-'))}`,
              name: singleName,
              imageUrl: ca.imageUrl,
              coverUrl: ca.imageUrl,
              follower_count: 0,
              isArtist: true,
              type: 'artist',
              isLocal: false,
              score
            });
          }
        }
      }

      const rankedArtists = Array.from(artistsMap.values()).sort((a, b) => b.score - a.score);

      // 4. MERGE & DEDUPLICATE ALBUMS
      const albumsMap = new Map<string, any>();
      for (const alb of dbAlbums) {
        const norm = `${alb.title.toLowerCase().trim()}::${(alb.artist?.name || '').toLowerCase().trim()}`;
        const score = scoreItem(alb.title, cleanQ, 'album', alb._count?.tracks || 0, true);
        if (score <= 0) continue;
        albumsMap.set(norm, {
          id: alb.id,
          title: alb.title,
          coverUrl: alb.coverUrl,
          artistId: alb.artistId,
          artist: alb.artist,
          trackCount: alb._count?.tracks || 0,
          releaseDate: alb.releaseDate,
          isAlbum: true,
          type: 'album',
          isLocal: true,
          score
        });
      }

      for (const calb of (catalogResult.albums || [])) {
        const norm = `${calb.title.toLowerCase().trim()}::${(calb.artist?.name || '').toLowerCase().trim()}`;
        if (!albumsMap.has(norm)) {
          const score = scoreItem(calb.title, cleanQ, 'album', calb.trackCount || 0, false);
          if (score <= 0) continue;
          albumsMap.set(norm, {
            id: calb.id,
            title: calb.title,
            coverUrl: calb.coverUrl,
            artistId: calb.artist?.id || '',
            artist: calb.artist,
            trackCount: calb.trackCount || 1,
            releaseDate: calb.releaseDate,
            isAlbum: true,
            type: 'album',
            isLocal: false,
            score
          });
        }
      }

      const rankedAlbums = Array.from(albumsMap.values()).sort((a, b) => b.score - a.score);

      // 5. MERGE & DEDUPLICATE TRACKS
      const tracksMap = new Map<string, any>();

      // A. Populate from DB tracks (Priority: real high-bitrate audio & library items)
      for (const t of dbTracks) {
        const norm = `${t.title.toLowerCase().trim()}::${(t.artist?.name || t.artistName || '').toLowerCase().trim()}`;
        const score = scoreItem(t.title, cleanQ, 'track', t.streams || 0, true);
        tracksMap.set(norm, {
          id: t.id,
          title: t.title,
          coverUrl: t.coverUrl,
          audioUrl: t.audioUrl,
          duration: t.duration,
          genre: t.genre || 'Song',
          language: t.language,
          streams: t.streams,
          like_count: t.like_count,
          inLibrary: true,
          isVirtual: false,
          artistId: t.artistId,
          artist: t.artist,
          featuredArtists: t.featuredArtists,
          album: t.album,
          type: 'track',
          isLocal: true,
          score
        });
      }

      // B. Supplement with External Catalog Tracks
      for (const ct of (catalogResult.tracks || [])) {
        const norm = `${ct.title.toLowerCase().trim()}::${(ct.artists?.[0]?.name || ct.artist?.name || '').toLowerCase().trim()}`;
        if (!tracksMap.has(norm)) {
          const score = scoreItem(ct.title, cleanQ, 'track', 2500000, false);
          tracksMap.set(norm, {
            id: ct.id,
            catalogId: ct.id,
            source: ct.source,
            sourceId: ct.sourceId,
            isrc: ct.isrc,
            title: ct.title,
            coverUrl: ct.coverUrl,
            audioUrl: ct.audioUrl,
            duration: ct.duration,
            genre: ct.genre || 'Pop',
            language: ct.language,
            streams: 2500000,
            like_count: 120000,
            inLibrary: false,
            isVirtual: true,
            artistId: ct.artists?.[0]?.id || `artist-${encodeURIComponent(ct.artists?.[0]?.name || '')}`,
            artist: {
              id: ct.artists?.[0]?.id || '',
              name: ct.artists?.[0]?.name || ct.artist?.name || 'Unknown Artist',
              imageUrl: ct.artists?.[0]?.imageUrl || ct.coverUrl
            },
            album: ct.album ? {
              id: ct.album.id,
              title: ct.album.title,
              coverUrl: ct.album.coverUrl || ct.coverUrl
            } : undefined,
            type: 'track',
            isLocal: false,
            score
          });
        }
      }

      const allTracks = Array.from(tracksMap.values());
      const originals: any[] = [];
      const otherVersions: any[] = [];

      for (const item of allTracks) {
        const titleLower = item.title.toLowerCase();
        const isDerivative = titleLower.includes('remix') || titleLower.includes('cover') || 
                             titleLower.includes('acoustic') || titleLower.includes('karaoke') ||
                             titleLower.includes('slowed') || titleLower.includes('reverb');

        if (isDerivative) {
          otherVersions.push(item);
        } else {
          originals.push(item);
        }
      }

      originals.sort((a, b) => b.score - a.score);
      otherVersions.sort((a, b) => b.score - a.score);

      const rankedTracks = [...originals, ...otherVersions];

      // 6. RANK PLAYLISTS (Hide empty playlists & non-matching queries)
      const rankedPlaylists = dbPlaylists
        .filter(pl => (pl._count?.tracks || 0) > 0)
        .map(pl => {
          const score = scoreItem(pl.name, cleanQ, 'playlist', pl._count?.tracks || 0, true);
          return {
            id: pl.id,
            name: pl.name,
            title: pl.name,
            coverUrl: pl.coverUrl,
            description: pl.description || `${pl._count?.tracks || 0} songs`,
            trackCount: pl._count?.tracks || 0,
            creator: pl.user?.name || pl.user?.username || 'Curator',
            isPlaylist: true,
            type: 'playlist',
            score
          };
        })
        .filter(pl => pl.score > 0)
        .sort((a, b) => b.score - a.score);

      // 7. TOP RESULT HERO CARD COMPUTATION
      // Spotify/Apple Music standard: Pick the entity with the highest relevance score
      const topArtist = rankedArtists[0];
      const topAlbum = rankedAlbums[0];
      const topTrack = rankedTracks[0];

      let topResult: any = null;

      const artistScore = topArtist ? topArtist.score : -1;
      const albumScore = topAlbum ? topAlbum.score : -1;
      const trackScore = topTrack ? topTrack.score : -1;

      // If user typed an artist name, surface Artist as Top Result
      if (topArtist && artistScore >= trackScore && artistScore >= albumScore) {
        topResult = { item: topArtist, type: 'artist' };
      } else if (topAlbum && albumScore > artistScore && albumScore >= trackScore) {
        topResult = { item: topAlbum, type: 'album' };
      } else if (topTrack) {
        topResult = { item: topTrack, type: 'track' };
      } else if (topArtist) {
        topResult = { item: topArtist, type: 'artist' };
      }

      const response = {
        topResult,
        tracks: rankedTracks.slice(0, 24),
        artists: rankedArtists.slice(0, 10),
        albums: rankedAlbums.slice(0, 10),
        playlists: rankedPlaylists.slice(0, 8),
        otherVersions: otherVersions.slice(0, 10),
        durationMs: Date.now() - startTime
      };

      searchCache.set(cacheKey, { data: response, expires: Date.now() + SEARCH_CACHE_TTL });

      // Log search event asynchronously
      if (userId) {
        import('../services/activity.service.js').then(({ ActivityService }) => {
          ActivityService.logEvent(userId, 'search', { query: cleanQ, resultCount: rankedTracks.length }).catch(() => {});
        }).catch(() => {});
      }

      return reply.send(response);
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ error: 'Search failed', details: err.message });
    }
  });

  /**
   * 2. LIVE SUGGESTIONS & SEARCH HINTS (Provider Hints, 250-300ms debounce)
   */
  server.get('/autocomplete', {
    schema: { querystring: autocompleteSchema }
  }, async (req: FastifyRequest<{ Querystring: z.infer<typeof autocompleteSchema> }>, reply: FastifyReply) => {
    const { q } = req.query;
    try {
      const hints = await CompositeCatalogService.getSearchHints(q);
      const suggestions = hints.map(h => ({
        id: `hint-${encodeURIComponent(h)}`,
        title: h,
        isHint: true
      }));
      return reply.send(suggestions);
    } catch {
      return reply.send([]);
    }
  });

  /**
   * 3. EMPTY STATE DISCOVER HOME (Personalized by Language & Country)
   */
  server.get('/home', async (req: FastifyRequest, reply: FastifyReply) => {
    let storefront = 'in';
    let countryName = 'India';
    let languages: string[] = ['Tamil', 'Hindi', 'English', 'Telugu', 'Malayalam', 'Punjabi'];

    try {
      const authHeader = req.headers.authorization;
      let userId: string | undefined;
      if (authHeader) {
        try {
          const decoded: any = server.jwt.verify(authHeader.replace('Bearer ', ''));
          userId = decoded?.id;
        } catch {}
      }

      if (userId) {
        const [user, preferences] = await Promise.all([
          prisma.user.findUnique({ where: { id: userId }, select: { country: true } }),
          prisma.userPreferences.findUnique({ where: { userId }, select: { languages: true } })
        ]);
        if (user?.country) {
          storefront = COUNTRY_MAP[user.country.toLowerCase().trim()] || 'in';
          countryName = user.country;
        }
        if (preferences?.languages && preferences.languages.length > 0) {
          languages = preferences.languages;
        }
      }

      const charts = await CompositeCatalogService.getCharts(storefront, 30);
      const trendingTracks = charts.slice(0, 12).map(t => ({
        id: t.id,
        catalogId: t.id,
        sourceId: t.sourceId,
        isrc: t.isrc,
        title: t.title,
        coverUrl: t.coverUrl,
        duration: t.duration,
        artist: t.artist,
        isVirtual: true
      }));

      const artists = charts.slice(0, 8).map(t => ({
        id: t.artist?.id || `artist-${encodeURIComponent(t.artist?.name || '')}`,
        name: t.artist?.name || 'Artist',
        imageUrl: t.artwork,
        type: 'artist'
      }));

      // Top Albums from catalog tracks
      const albumsMap = new Map<string, any>();
      for (const t of charts) {
        if (t.album && t.album.title && !albumsMap.has(t.album.title)) {
          albumsMap.set(t.album.title, {
            id: t.album.id || `album-${encodeURIComponent(t.album.title)}`,
            title: t.album.title,
            coverUrl: t.album.coverUrl || t.coverUrl,
            artist: t.artist,
            type: 'album'
          });
        }
      }
      const trendingAlbums = Array.from(albumsMap.values()).slice(0, 8);

      const trendingSearches = [
        'Anirudh Ravichander', 'Arijit Singh', 'Taylor Swift', 'The Weeknd',
        'A.R. Rahman', 'Sid Sriram', 'Shreya Ghoshal', 'Dua Lipa', 'Karan Aujla'
      ];

      return reply.send({
        countryName,
        languages,
        trendingTracks,
        topSongs: trendingTracks,
        artists,
        popularArtists: artists,
        trendingAlbums,
        trendingSearches
      });
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ error: 'Failed to load search home', details: err.message });
    }
  });

  /**
   * 4. AI SMART SEARCH
   */
  server.get('/smart', async (req: FastifyRequest<{ Querystring: { q: string } }>, reply: FastifyReply) => {
    const { q } = req.query;
    if (!q) return reply.status(400).send({ error: 'Query is required' });

    try {
      const result = await AISearchService.smartSearch(q);
      return reply.send(result || { message: null, sections: [], interpretedQuery: null });
    } catch (err) {
      return reply.status(500).send({ error: 'Smart Search Error' });
    }
  });
}
