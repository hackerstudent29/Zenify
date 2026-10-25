import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AISearchService } from '../services/ai-search.service';
import { CompositeCatalogService, CatalogTrack } from '../services/catalog-provider.service';
import { PreferencesService } from '../services/preferences.service';
import { splitArtistString, isFakeOrNumericArtistName, cleanArtistNames } from '../utils/artist';
import { extractSequelTag, isCompilationOrPlaylist } from '../services/universal-search.service';

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
/**
 * Calculates Levenshtein string similarity ratio between 0.0 and 1.0
 */
function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;
  const l1 = s1.length;
  const l2 = s2.length;
  const maxLen = Math.max(l1, l2);
  if (maxLen === 0) return 1.0;
  if (Math.abs(l1 - l2) / maxLen > 0.5) return 0;

  const row: number[] = [];
  for (let j = 0; j <= l2; j++) row[j] = j;

  for (let i = 1; i <= l1; i++) {
    let prev = i;
    for (let j = 1; j <= l2; j++) {
      let val: number;
      if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[l2] = prev;
  }
  return (maxLen - row[l2]) / maxLen;
}

function scoreItem(
  targetName: string,
  query: string,
  type: 'artist' | 'album' | 'track' | 'playlist',
  popularity: number = 0,
  isLocal: boolean = false,
  albumTitle?: string
): number {
  const t = targetName.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  let score = 0;

  const tWords = t.split(/[\s\-&,/]+/).filter(Boolean);
  const qWords = q.split(/[\s\-&,/]+/).filter(Boolean);

  const allTInQ = tWords.length > 0 && tWords.every(tw => q.includes(tw));
  const allQInT = qWords.length > 0 && qWords.every(qw => t.includes(qw));

  if (t === q) {
    score += 260; // Exact match
  } else if (t.startsWith(q)) {
    score += 180; // Starts with query
  } else if (allQInT) {
    score += 150; // All query words match target (e.g. "anirudh ravi" in "Anirudh Ravichander")
  } else if (allTInQ) {
    score += 140; // Target is fully contained in query (e.g. "Anirudh Ravichander" in "Anirudh Ravichander songs")
  } else if (t.split(/[\s\-&,/]+/).some(word => word.startsWith(q))) {
    score += 120; // Word start match (e.g. "Mahadevan" in "Shankar Mahadevan")
  } else if (t.includes(q)) {
    score += 70;  // Substring match
  } else if (q.includes(t)) {
    score += 65;  // Query contains target
  } else if (qWords.some(qw => qw.length > 2 && tWords.some(tw => tw.startsWith(qw) || qw.startsWith(tw)))) {
    score += 40;  // Partial token overlap
  } else {
    // Check fuzzy similarity across tokens & full string (catches transliteration/typos like tiruchitrambalam vs thiruchitrambalam)
    let maxFuzzy = 0;
    for (const qw of qWords) {
      for (const tw of tWords) {
        if (qw.length >= 3 && tw.length >= 3) {
          const sim = stringSimilarity(qw, tw);
          if (sim > maxFuzzy) maxFuzzy = sim;
        }
      }
    }
    const overallSim = stringSimilarity(t, q);
    if (overallSim > maxFuzzy) maxFuzzy = overallSim;

    if (maxFuzzy >= 0.75) {
      score += Math.round(150 * maxFuzzy); // Highly confident fuzzy match
    } else if (maxFuzzy >= 0.6) {
      score += Math.round(90 * maxFuzzy);
    } else if (!isLocal) {
      // Catalog provider returned this item specifically for this query (e.g. Apple Music / JioSaavn search engine match)
      score += 45;
    } else {
      // If target does not match query at all in local DB, strict rejection for artist, album, playlist
      if (type === 'artist' || type === 'album' || type === 'playlist') {
        return 0;
      }
      score += 10;
    }
  }

  // Sequel & Part Number Strict Verification (e.g. Jailer 1 vs Jailer 2)
  const queryTag = extractSequelTag(q);
  const targetTag = extractSequelTag(t);
  if (queryTag && targetTag) {
    if (queryTag === targetTag) {
      score += 150; // Sequel match bonus
    } else {
      score -= 300; // Sequel mismatch penalty
    }
  } else if (queryTag && !targetTag) {
    score -= 220; // User explicitly asked for sequel ("Jailer 2"), but this is the original
  } else if (!queryTag && targetTag) {
    score -= 100; // User asked for original ("Jailer"), penalize sequel ("Jailer 2") unless requested
  }

  // Filter compilations/jukeboxes from top tracks
  if (type === 'track' && isCompilationOrPlaylist(t, 0)) {
    score -= 160;
  }

  // Local verified items play immediately without proxy latency
  if (isLocal) score += 35;

  // Type Intent Boosts:
  if (type === 'artist') {
    score += 50; // Artists prioritized when user types artist name
    if (popularity > 0) {
      score += Math.min(25, Math.round(Math.log10(popularity + 1) * 3));
    }
  } else if (type === 'album') {
    score += 35;
  } else if (type === 'track') {
    // Album / Movie Name match bonus (essential for finding OST and soundtrack tracks by movie name)
    if (albumTitle) {
      const albLower = albumTitle.toLowerCase().trim();
      if (albLower === q || albLower === `${q} (original motion picture soundtrack)`) {
        score += 280;
      } else if (albLower.startsWith(q) || q.startsWith(albLower)) {
        score += 220;
      } else if (albLower.includes(q)) {
        score += 140;
      }
    }

    if (popularity > 0) {
      score += Math.min(25, Math.round(Math.log10(popularity + 1) * 2.5));
    }
    // Penalize cover / remix / karaoke versions unless query explicitly includes those words, while preserving official themes and OST
    const isThemeOrBgm = /\b(theme|bgm|score|soundtrack|ost)\b/i.test(t);
    const isDerivative = /\b(remix|cover|karaoke|acoustic|slowed|reverb|instrumental|lofi|ringtone)\b/i.test(t);
    const wantsDerivative = /\b(remix|cover|karaoke|acoustic|slowed|reverb|instrumental|lofi|ringtone|theme|bgm|score|soundtrack|ost)\b/i.test(q);
    if (isDerivative && !wantsDerivative && !isThemeOrBgm) {
      score -= 50;
    }
  } else if (type === 'playlist') {
    score += 15;
  }

  return Math.max(0, score);
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
              { artist: { name: { contains: cleanQ, mode: 'insensitive' } } },
              { album: { title: { contains: cleanQ, mode: 'insensitive' } } }
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
        if (isFakeOrNumericArtistName(a.name)) continue;
        const individualNames = splitArtistString(a.name);
        for (const singleName of individualNames) {
          if (isFakeOrNumericArtistName(singleName)) continue;
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
        if (isFakeOrNumericArtistName(ca.name)) continue;
        const individualNames = splitArtistString(ca.name);
        for (const singleName of individualNames) {
          if (isFakeOrNumericArtistName(singleName)) continue;
          const norm = singleName.toLowerCase().trim();
          const score = scoreItem(singleName, cleanQ, 'artist', 0, false);
          if (score <= 0) continue; // STRICT REJECTION: Must actually match the search query!

          if (!artistsMap.has(norm)) {
            artistsMap.set(norm, {
              id: ca.id && !ca.id.startsWith('itunes-artist-') && !/^\d+$/.test(ca.id) ? ca.id : `artist-${encodeURIComponent(norm.replace(/[^a-z0-9]/g, '-'))}`,
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

      // 4. MERGE & DEDUPLICATE ALBUMS (Preserve distinct multi-language editions)
      const albumsMap = new Map<string, any>();
      for (const alb of dbAlbums) {
        const norm = `${alb.id}::${alb.title.toLowerCase().trim()}::${(alb.artist?.name || '').toLowerCase().trim()}`;
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
        const cleanArtist = cleanArtistNames(calb.artist?.name || '');
        if (isFakeOrNumericArtistName(cleanArtist)) continue;
        const norm = `${calb.id}::${calb.title.toLowerCase().trim()}::${cleanArtist.toLowerCase().trim()}`;
        if (!albumsMap.has(norm)) {
          const score = scoreItem(calb.title, cleanQ, 'album', calb.trackCount || 0, false);
          if (score <= 0) continue;
          albumsMap.set(norm, {
            id: calb.id,
            title: calb.title,
            coverUrl: calb.coverUrl,
            artistId: calb.artist?.id || (cleanArtist ? `artist-${cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : ''),
            artist: {
              id: calb.artist?.id || (cleanArtist ? `artist-${cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : ''),
              name: cleanArtist
            },
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
        const cleanArtist = cleanArtistNames(t.artist?.name || t.artistName || '');
        const norm = `${t.title.toLowerCase().trim()}::${cleanArtist.toLowerCase().trim()}`;
        const score = scoreItem(t.title, cleanQ, 'track', t.streams || 0, true, t.album?.title);
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
          artist: {
            id: t.artist?.id || '',
            name: cleanArtist,
            imageUrl: t.artist?.imageUrl || t.coverUrl
          },
          featuredArtists: t.featuredArtists,
          album: t.album,
          type: 'track',
          isLocal: true,
          score
        });
      }

      // B. Supplement with External Catalog Tracks (Filter out compilations/jukeboxes)
      for (const ct of (catalogResult.tracks || [])) {
        if (isCompilationOrPlaylist(ct.title, ct.duration)) continue;
        const cleanArtist = cleanArtistNames(ct.artists?.[0]?.name || ct.artist?.name || '');
        const norm = `${ct.title.toLowerCase().trim()}::${cleanArtist.toLowerCase().trim()}`;
        if (!tracksMap.has(norm)) {
          const score = scoreItem(ct.title, cleanQ, 'track', 2500000, false, ct.album?.title);
          if (score <= 0) continue;
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
            artistId: ct.artists?.[0]?.id || (cleanArtist ? `artist-${cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : ''),
            artist: {
              id: ct.artists?.[0]?.id || (cleanArtist ? `artist-${cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : ''),
              name: cleanArtist,
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

      // 6. RANK PLAYLISTS (Merge local DB playlists + external curated playlists)
      const playlistsMap = new Map<string, any>();

      for (const pl of dbPlaylists) {
        if ((pl._count?.tracks || 0) <= 0) continue;
        const score = scoreItem(pl.name, cleanQ, 'playlist', pl._count?.tracks || 0, true);
        if (score <= 0) continue;
        playlistsMap.set(pl.name.toLowerCase().trim(), {
          id: pl.id,
          name: pl.name,
          title: pl.name,
          coverUrl: pl.coverUrl,
          description: pl.description || `${pl._count?.tracks || 0} songs`,
          trackCount: pl._count?.tracks || 0,
          creator: pl.user?.name || pl.user?.username || 'Curator',
          isPlaylist: true,
          type: 'playlist',
          isLocal: true,
          score
        });
      }

      for (const cpl of (catalogResult.playlists || [])) {
        const norm = (cpl.name || cpl.title || '').toLowerCase().trim();
        if (!norm) continue;
        const score = scoreItem(cpl.name || cpl.title, cleanQ, 'playlist', cpl.trackCount || 0, false);
        if (score <= 0) continue;
        if (!playlistsMap.has(norm) || playlistsMap.get(norm).score < score) {
          playlistsMap.set(norm, {
            ...cpl,
            score
          });
        }
      }

      const rankedPlaylists = Array.from(playlistsMap.values()).sort((a, b) => b.score - a.score);

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
