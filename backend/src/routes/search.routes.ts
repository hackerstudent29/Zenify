import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AISearchService } from '../services/ai-search.service';
import { CompositeCatalogService, CatalogTrack } from '../services/catalog-provider.service';
import { PreferencesService } from '../services/preferences.service';

const searchSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().default(16),
});

const autocompleteSchema = z.object({
  q: z.string().min(2),
});

const searchCache = new Map<string, { data: any; expires: number }>();
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 min

const COUNTRY_MAP: Record<string, string> = {
  india: 'in', in: 'in',
  'united states': 'us', us: 'us', usa: 'us',
  'united kingdom': 'gb', uk: 'gb', gb: 'gb'
};

export async function searchRoutes(server: FastifyInstance) {
  /**
   * 1. CATALOG-FIRST SEARCH API (Section 15)
   * Queries external catalog first, then ONE batched indexed lookup by sourceId/isrc to mark inLibrary
   */
  server.get('/', {
    schema: { querystring: searchSchema }
  }, async (req: FastifyRequest<{ Querystring: z.infer<typeof searchSchema> }>, reply: FastifyReply) => {
    const { q, limit } = req.query;
    const cleanQ = q.trim();

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
      // Step 1: Query External Catalog First (Apple Music / iTunes / RapidAPI)
      const catalogResult = await CompositeCatalogService.search(cleanQ, storefront, limit);
      const catalogTracks = catalogResult.tracks;
      const catalogArtists = catalogResult.artists;
      const catalogAlbums = catalogResult.albums;

      // Step 2: ONE Batched Indexed Lookup by sourceId & isrc (NO text search on DB Track)
      const sourceIds = catalogTracks.map(t => t.sourceId).filter(Boolean);
      const isrcs = catalogTracks.map(t => t.isrc).filter(Boolean) as string[];

      const dbMatches = await prisma.track.findMany({
        where: {
          deletedAt: null,
          OR: [
            ...(sourceIds.length > 0 ? [{ youtubeId: { in: sourceIds } }] : []),
            ...(isrcs.length > 0 ? [{ isrc: { in: isrcs } }] : [])
          ]
        },
        select: { id: true, youtubeId: true, isrc: true, audioUrl: true, duration: true }
      });

      const dbBySourceId = new Map(dbMatches.map(m => [m.youtubeId, m]));
      const dbByIsrc = new Map(dbMatches.map(m => [m.isrc, m]));

      // Step 3: Annotate inLibrary & link real DB ID if already imported
      const qLower = cleanQ.toLowerCase();
      const originals: any[] = [];
      const otherVersions: any[] = [];

      for (const t of catalogTracks) {
        const match = (t.sourceId && dbBySourceId.get(t.sourceId)) || (t.isrc && dbByIsrc.get(t.isrc));
        const inLibrary = Boolean(match);

        const item = {
          id: match?.id || t.id,
          catalogId: t.id,
          source: t.source,
          sourceId: t.sourceId,
          isrc: t.isrc,
          title: t.title,
          coverUrl: t.coverUrl,
          audioUrl: match?.audioUrl || t.audioUrl,
          duration: match?.duration || t.duration,
          genre: t.genre || 'Pop',
          language: t.language,
          streams: inLibrary ? 1500000 : 2500000,
          like_count: inLibrary ? 90000 : 120000,
          isVirtual: !inLibrary,
          inLibrary,
          artistId: t.artists?.[0]?.id || `artist-${encodeURIComponent(t.artists?.[0]?.name || '')}`,
          artist: {
            id: t.artists?.[0]?.id || '',
            name: t.artists?.[0]?.name || 'Unknown Artist',
            imageUrl: t.artists?.[0]?.imageUrl || t.coverUrl
          },
          album: t.album ? {
            id: t.album.id,
            title: t.album.title,
            coverUrl: t.album.coverUrl || t.coverUrl
          } : undefined
        };

        // Classify covers / remixes vs original
        const titleLower = item.title.toLowerCase();
        const isCoverOrRemix = titleLower.includes('cover') || titleLower.includes('remix') || titleLower.includes('acoustic') || titleLower.includes('karaoke');

        if (isCoverOrRemix) {
          otherVersions.push(item);
        } else {
          originals.push(item);
        }
      }

      // Step 4: Rank: User's Interested Languages First, then by Relevance (NEVER alphabetical)
      const rankTrack = (t: any) => {
        const titleLower = t.title.toLowerCase();
        let score = 0;
        if (titleLower === qLower) score += 100;
        else if (titleLower.startsWith(qLower)) score += 60;
        else if (titleLower.includes(qLower)) score += 30;

        const lang = (t.language || '').toLowerCase();
        const langWeight = userLangWeights[lang] || 0;
        score += langWeight * 50;
        return score;
      };

      originals.sort((a, b) => rankTrack(b) - rankTrack(a));
      otherVersions.sort((a, b) => rankTrack(b) - rankTrack(a));

      const rankedTracks = [...originals, ...otherVersions];

      // Top Result Hero Card computation
      let topResult: any = null;
      if (catalogArtists.length > 0 && catalogArtists[0].name.toLowerCase().startsWith(qLower)) {
        topResult = { item: catalogArtists[0], type: 'artist' };
      } else if (rankedTracks.length > 0) {
        topResult = { item: rankedTracks[0], type: 'track' };
      } else if (catalogArtists.length > 0) {
        topResult = { item: catalogArtists[0], type: 'artist' };
      } else if (catalogAlbums.length > 0) {
        topResult = { item: catalogAlbums[0], type: 'album' };
      }

      const response = {
        topResult,
        tracks: rankedTracks.slice(0, 24),
        artists: catalogArtists.slice(0, 10).map(a => ({ ...a, type: 'artist' })),
        albums: catalogAlbums.slice(0, 10).map(al => ({ ...al, type: 'album' })),
        otherVersions: otherVersions.slice(0, 10),
        playlists: []
      };

      searchCache.set(cacheKey, { data: response, expires: Date.now() + SEARCH_CACHE_TTL });

      // Log search event asynchronously for taste profile
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
   * 3. EMPTY STATE DISCOVER HOME (Catalog-first, Personalized by Language & Country)
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
