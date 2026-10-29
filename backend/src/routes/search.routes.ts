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

function getBaseTitle(title: string): string {
  return (title || '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .split(/[-–—]/)[0]
    .trim();
}

function scoreItem(
  targetName: string,
  query: string,
  type: 'artist' | 'album' | 'track' | 'playlist',
  popularity: number = 0,
  isLocal: boolean = false,
  albumTitle?: string,
  year?: number
): number {
  const t = targetName.toLowerCase().trim();
  const norm = (s = '') =>
    s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
     .replace(/\(.*?\)|\[.*?\]/g, ' ')
     .replace(/[^a-z0-9\u0900-\u0D7F\s]/g, ' ')
     .replace(/\s+/g, ' ').trim();

  const baseT = getBaseTitle(t).toLowerCase().trim();
  const q = query.toLowerCase().trim();
  const qNorm = norm(query);
  const tNorm = norm(targetName);
  let score = 0;

  const tWords = t.split(/[\s\-&,/]+/).filter(Boolean);
  const qWords = q.split(/[\s\-&,/]+/).filter(Boolean);

  const allTInQ = tWords.length > 0 && tWords.every(tw => q.includes(tw));
  const allQInT = qWords.length > 0 && qWords.every(qw => t.includes(qw));

  if (tNorm === qNorm || t === q || (type === 'track' && baseT === q)) {
    score += 350; // Exact match (Tier 0)
  } else if (tNorm.startsWith(qNorm + ' ') || t.startsWith(q) || (type === 'track' && baseT.startsWith(q))) {
    score += 240; // Starts with query (Tier 1)
  } else if (allQInT) {
    score += 160; // All query words match target (e.g. "anirudh ravi" in "Anirudh Ravichander")
  } else if (allTInQ) {
    score += 140; // Target is fully contained in query (e.g. "Anirudh Ravichander" in "Anirudh Ravichander songs")
  } else if (t.split(/[\s\-&,/]+/).some(word => word.startsWith(q))) {
    score += 120; // Word start match
  } else if (tNorm.includes(qNorm) || t.includes(q)) {
    score += 110;  // Substring match (Tier 2)
  } else if (q.includes(t)) {
    score += 70;  // Query contains target
  } else if (qWords.some(qw => qw.length > 2 && tWords.some(tw => tw.startsWith(qw) || qw.startsWith(tw)))) {
    score += 45;  // Partial token overlap
  } else {
    // Check fuzzy similarity across tokens & full string
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
      score += Math.round(180 * maxFuzzy);
    } else if (maxFuzzy >= 0.55) {
      score += Math.round(100 * maxFuzzy);
    } else {
      // Reject random noise entities that have no relation to the query,
      // UNLESS this is a track whose album name directly matches the search query (e.g. movie OST)
      if (type === 'track' && albumTitle && (albumTitle.toLowerCase().includes(q) || q.includes(albumTitle.toLowerCase()))) {
        score += 80;
      } else {
        return 0;
      }
    }
  }

  // Sequel & Part Number Strict Verification (e.g. Jailer 1 vs Jailer 2)
  const queryTag = extractSequelTag(q);
  const targetTag = extractSequelTag(`${t} ${albumTitle || ''}`);
  if (queryTag && targetTag) {
    if (queryTag === targetTag) {
      score += 150;
    } else {
      score -= 300;
    }
  } else if (!queryTag && targetTag) {
    score -= 80;
  }

  // Filter compilations/jukeboxes from top tracks
  if (type === 'track' && isCompilationOrPlaylist(t, 0)) {
    score -= 160;
  }

  // Local verified items play immediately
  if (isLocal) score += 40;

  // Type Intent Boosts:
  if (type === 'artist') {
    if (t === q || t.startsWith(q) || q.startsWith(t)) {
      score += 70; // Direct artist intent bonus
    }
    // High-impact artist popularity weighting
    if (popularity >= 50000) {
      score += 150; // Major verified artist (Anirudh, AR Rahman, Arijit Singh, Ed Sheeran)
    } else if (popularity >= 5000) {
      score += 100;
    } else if (popularity >= 500) {
      score += 50;
    } else if (popularity <= 20 && !isLocal) {
      // Severe demotion for 0-follower random entity submissions (e.g. artist registered as 'Shape of You' or 'Hukum')
      const matchesQuery = t === q || t.startsWith(q) || q.startsWith(t) || stringSimilarity(t, q) >= 0.75;
      if (!matchesQuery) {
        score -= 250;
      }
    }
  } else if (type === 'album') {
    score += 35;
    if (year) {
      if (year >= 2025) score += 35;
      else if (year >= 2024) score += 25;
      else if (year >= 2022) score += 10;
    }
  } else if (type === 'track') {
    // Album / Movie Name match bonus (only when track title itself is not already an exact match)
    if (albumTitle && tNorm !== qNorm && t !== q) {
      const albLower = albumTitle.toLowerCase().trim();
      if (albLower === q || albLower === `${q} (original motion picture soundtrack)`) {
        score += 250;
      } else if (albLower.startsWith(q) || q.startsWith(albLower)) {
        score += 260;
      } else if (albLower.includes(q)) {
        score += 170;
      }
    }

    // Popularity weighting for tracks (Logarithmic Spotify/JioSaavn scale)
    if (popularity > 0) {
      score += Math.min(Math.round(Math.log10(popularity) * 45), 340);
    } else if (!isLocal) {
      score -= 150; // Heavily demote 0-stream obscure noise
    }

    if (year && popularity >= 5000) {
      if (year >= 2025) score += 30;
      else if (year >= 2024) score += 20;
      else if (year >= 2022) score += 10;
    }

    // Penalize cover / remix / karaoke versions unless query explicitly includes those words
    const isThemeOrBgm = /\b(theme|bgm|score|soundtrack|ost)\b/i.test(t);
    const isDerivative = /\b(remix|cover|karaoke|acoustic|slowed|reverb|instrumental|lofi|ringtone|carnatic mix|tribute|piano cover|guitar cover|sped up|chipmunk|8d audio|mashup|nightcore|piano version)\b/i.test(`${t} ${albumTitle || ''}`);
    const wantsDerivative = /\b(remix|cover|karaoke|acoustic|slowed|reverb|instrumental|lofi|ringtone|theme|bgm|score|soundtrack|ost|tribute)\b/i.test(q);
    if (isDerivative && !wantsDerivative && !isThemeOrBgm) {
      score -= 420;
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

      // External catalog search (capped at 9000ms so cold external queries never drop valid catalog tracks)
      const catalogPromise = Promise.race([
        CompositeCatalogService.search(cleanQ, storefront, limit),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('catalog_timeout')), 9000))
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
          const pop = ca.follower_count || 0;
          const score = scoreItem(singleName, cleanQ, 'artist', pop, false);
          if (score <= 0) continue; // STRICT REJECTION: Must actually match the search query!

          if (!artistsMap.has(norm) || (artistsMap.get(norm).score < score)) {
            artistsMap.set(norm, {
              id: ca.id && !ca.id.startsWith('itunes-artist-') && !/^\d+$/.test(ca.id) ? ca.id : `artist-${encodeURIComponent(norm.replace(/[^a-z0-9]/g, '-'))}`,
              name: singleName,
              imageUrl: ca.imageUrl,
              coverUrl: ca.imageUrl,
              follower_count: pop,
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
          year: alb.releaseDate ? String(alb.releaseDate).slice(0, 4) : undefined,
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
          const albYear = calb.year ? parseInt(String(calb.year), 10) : (calb.releaseDate ? parseInt(calb.releaseDate.slice(0, 4), 10) : 0);
          const titleScore = scoreItem(calb.title, cleanQ, 'album', calb.trackCount || 0, false, undefined, albYear);
          let artistScore = 0;
          if (cleanArtist) {
            const cLow = cleanArtist.toLowerCase();
            const qLow = cleanQ.toLowerCase();
            if (cLow === qLow || cLow.startsWith(qLow) || qLow.startsWith(cLow) || stringSimilarity(cLow, qLow) >= 0.75) {
              artistScore = 200 + (calb.trackCount || 0) * 2;
            } else if (cLow.includes(qLow) || qLow.includes(cLow)) {
              artistScore = 150;
            }
          }
          const score = Math.max(titleScore, artistScore);
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
            year: calb.year || (calb.releaseDate ? String(calb.releaseDate).slice(0, 4) : undefined),
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
        const titleScore = scoreItem(t.title, cleanQ, 'track', t.streams || 0, true, t.album?.title);
        let artistScore = 0;
        if (cleanArtist) {
          const cLow = cleanArtist.toLowerCase();
          const qLow = cleanQ.toLowerCase();
          if (cLow === qLow || cLow.startsWith(qLow) || qLow.startsWith(cLow) || stringSimilarity(cLow, qLow) >= 0.75) {
            artistScore = 260 + Math.min(Math.round(Math.log10(Math.max(t.streams || 0, 1000)) * 40), 320);
          } else if (cLow.includes(qLow) || qLow.includes(cLow)) {
            artistScore = 220 + Math.min(Math.round(Math.log10(Math.max(t.streams || 0, 1000)) * 30), 250);
          }
        }
        const score = Math.max(titleScore, artistScore);
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
          const trackStreams = ct.playCount || ct.streams || 0;
          const trackYear = ct.year || 0;
          const titleScore = scoreItem(ct.title, cleanQ, 'track', trackStreams, false, ct.album?.title, trackYear);
          let artistScore = 0;
          if (cleanArtist) {
            const cLow = cleanArtist.toLowerCase();
            const qLow = cleanQ.toLowerCase();
            if (cLow === qLow || cLow.startsWith(qLow) || qLow.startsWith(cLow) || stringSimilarity(cLow, qLow) >= 0.75) {
              artistScore = 260 + Math.min(Math.round(Math.log10(Math.max(trackStreams, 1000)) * 40), 320);
            } else if (cLow.includes(qLow) || qLow.includes(cLow)) {
              artistScore = 220 + Math.min(Math.round(Math.log10(Math.max(trackStreams, 1000)) * 30), 250);
            }
          }
          let albumScore = 0;
          const albumTitle = ct.album?.title || '';
          if (albumTitle) {
            const aLow = albumTitle.toLowerCase();
            const qLow = cleanQ.toLowerCase();
            if (aLow === qLow || aLow.startsWith(qLow) || qLow.startsWith(aLow)) {
              albumScore = 240 + Math.min(Math.round(Math.log10(Math.max(trackStreams, 1000)) * 30), 200);
            } else if (aLow.includes(qLow) || qLow.includes(aLow)) {
              albumScore = 180;
            }
          }
          const score = Math.max(titleScore, artistScore, albumScore);
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
            streams: trackStreams,
            like_count: Math.round(trackStreams * 0.05),
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
            year: ct.year,
            score
          });
        }
      }

      // C. If user query matches a prominent artist, inject their authentic iconic greatest hits!
      if (rankedArtists.length > 0) {
        const topArt = rankedArtists[0];
        const isQueryArtist = topArt && (
          topArt.name.toLowerCase() === cleanQ.toLowerCase() ||
          topArt.name.toLowerCase().startsWith(cleanQ.toLowerCase()) ||
          cleanQ.toLowerCase().startsWith(topArt.name.toLowerCase()) ||
          stringSimilarity(topArt.name.toLowerCase(), cleanQ.toLowerCase()) >= 0.75
        );

        if (isQueryArtist) {
          try {
            const artistHits = await CompositeCatalogService.getArtistTopSongs(topArt.name, storefront, 8);
            for (const hit of artistHits) {
              const candidate = hit.artist?.name || topArt.name;
              const cleanArtist = cleanArtistNames(candidate);
              const finalArtist = (cleanArtist && cleanArtist !== 'Unknown Artist' && cleanArtist !== 'Various Artists') ? cleanArtist : topArt.name;
              const norm = `${hit.title.toLowerCase().trim()}::${finalArtist.toLowerCase().trim()}`;
              const playCount = hit.streams || hit.playCount || 50000000;
              if (!tracksMap.has(norm)) {
                tracksMap.set(norm, {
                  id: hit.id,
                  catalogId: hit.id,
                  source: hit.source,
                  sourceId: hit.sourceId,
                  title: hit.title,
                  coverUrl: hit.coverUrl,
                  audioUrl: hit.audioUrl,
                  duration: hit.duration,
                  genre: hit.genre || 'Soundtrack',
                  language: hit.language,
                  streams: playCount,
                  like_count: Math.round(playCount * 0.05),
                  inLibrary: false,
                  isVirtual: true,
                  artistId: topArt.id,
                  artist: {
                    id: topArt.id,
                    name: finalArtist,
                    imageUrl: hit.coverUrl || topArt.imageUrl
                  },
                  album: hit.album,
                  type: 'track',
                  isLocal: false,
                  year: hit.year,
                  score: 720 // High score to guarantee famous artist tracks appear on top!
                });
              } else {
                const existing = tracksMap.get(norm);
                existing.score = Math.max(existing.score, 720);
                if (!existing.artist?.name || existing.artist.name === 'Unknown Artist') {
                  existing.artist = { id: topArt.id, name: finalArtist, imageUrl: hit.coverUrl || topArt.imageUrl };
                }
              }
            }
          } catch {}
        }
      }

      const allTracks = Array.from(tracksMap.values());
      const originals: any[] = [];
      const otherVersions: any[] = [];

      for (const item of allTracks) {
        const titleLower = item.title.toLowerCase();
        const isThemeOrBgm = /\b(theme|bgm|score|soundtrack|ost)\b/i.test(titleLower);
        const isDerivative = /\b(remix|cover|karaoke|acoustic|slowed|reverb|instrumental|lofi|ringtone|carnatic mix|tribute|piano cover|guitar cover|sped up|chipmunk|8d audio|mashup)\b|\s+x\s+/i.test(`${titleLower} ${item.album?.title || ''}`);
        const wantsDerivative = /\b(remix|cover|karaoke|acoustic|slowed|reverb|instrumental|lofi|ringtone|theme|bgm|score|soundtrack|ost|tribute)\b/i.test(cleanQ);

        if (isDerivative && !wantsDerivative && !isThemeOrBgm) {
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

      const cleanQLower = cleanQ.toLowerCase();
      const isArtistIntent = topArtist && (
        topArtist.name.toLowerCase() === cleanQLower ||
        topArtist.name.toLowerCase().startsWith(cleanQLower) ||
        cleanQLower.startsWith(topArtist.name.toLowerCase()) ||
        stringSimilarity(topArtist.name.toLowerCase(), cleanQLower) >= 0.75
      );

      const isAlbumIntent = topAlbum && (
        topAlbum.title.toLowerCase() === cleanQLower ||
        topAlbum.title.toLowerCase().startsWith(cleanQLower) ||
        topAlbum.title.toLowerCase().includes(`(from "${cleanQLower}")`) ||
        cleanQLower.startsWith(topAlbum.title.toLowerCase())
      );

      // Top Result Decision:
      if (isArtistIntent) {
        topResult = { item: topArtist, type: 'artist' };
      } else if (isAlbumIntent && (!topTrack || albumScore >= (trackScore - 30))) {
        topResult = { item: topAlbum, type: 'album' };
      } else if (topTrack) {
        topResult = { item: topTrack, type: 'track' };
      } else if (topArtist && ((topArtist.follower_count && topArtist.follower_count > 200) || topArtist.isLocal)) {
        topResult = { item: topArtist, type: 'artist' };
      } else if (topAlbum) {
        topResult = { item: topAlbum, type: 'album' };
      }

      const requestedLimit = Math.max(Number(limit) || 24, 24);
      const response = {
        topResult,
        tracks: rankedTracks.slice(0, Math.max(requestedLimit, 40)),
        artists: rankedArtists.slice(0, 10),
        albums: rankedAlbums.slice(0, 10),
        playlists: rankedPlaylists.slice(0, 8),
        otherVersions: otherVersions.slice(0, 15),
        durationMs: Date.now() - startTime
      };

      if (rankedTracks.length > 0 || rankedArtists.length > 0 || rankedAlbums.length > 0) {
        searchCache.set(cacheKey, { data: response, expires: Date.now() + SEARCH_CACHE_TTL });
      }

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
   * Returns rich categorized autocomplete: Artists (with avatar), Tracks (with play trigger), Albums & Hints.
   */
  server.get('/autocomplete', {
    schema: { querystring: autocompleteSchema }
  }, async (req: FastifyRequest<{ Querystring: z.infer<typeof autocompleteSchema> }>, reply: FastifyReply) => {
    const { q } = req.query;
    const cleanQ = q.trim();
    try {
      const [hints, catalogResult] = await Promise.all([
        CompositeCatalogService.getSearchHints(cleanQ),
        CompositeCatalogService.search(cleanQ, 'in', 6).catch(() => ({ tracks: [], artists: [], albums: [] }))
      ]);

      const topArtists = (catalogResult.artists || [])
        .filter(a => !isFakeOrNumericArtistName(a.name) && ((a.follower_count || 0) > 100 || a.name.toLowerCase().includes(cleanQ.toLowerCase()) || cleanQ.toLowerCase().includes(a.name.toLowerCase())))
        .slice(0, 2)
        .map(a => ({
          id: a.id,
          name: a.name,
          imageUrl: a.imageUrl,
          follower_count: a.follower_count,
          type: 'artist'
        }));

      const topTracks = (catalogResult.tracks || [])
        .filter(t => !/\b(karaoke|instrumental|cover|remix|slowed)\b/i.test(t.title))
        .slice(0, 4)
        .map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist?.name || t.artists?.[0]?.name || 'Artist',
          coverUrl: t.coverUrl,
          duration: t.duration,
          audioUrl: t.audioUrl,
          type: 'track'
        }));

      const topAlbums = (catalogResult.albums || [])
        .slice(0, 2)
        .map(a => ({
          id: a.id,
          title: a.title,
          artist: a.artist?.name || 'Artist',
          coverUrl: a.coverUrl,
          year: a.year,
          type: 'album'
        }));

      const formattedHints = hints.slice(0, 6).map(h => ({
        id: `hint-${encodeURIComponent(h)}`,
        title: h,
        isHint: true
      }));

      return reply.send({
        hints: formattedHints,
        artists: topArtists,
        tracks: topTracks,
        albums: topAlbums,
        legacy: formattedHints
      });
    } catch {
      return reply.send({ hints: [], artists: [], tracks: [], albums: [] });
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
