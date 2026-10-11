import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AISearchService } from '../services/ai-search.service';
import { SystemSettingsService } from '../services/system-settings.service';
import axios from 'axios';

const searchSchema = z.object({
    q: z.string().min(1),
    limit: z.coerce.number().default(10),
});

const autocompleteSchema = z.object({
    q: z.string().min(2),
});

// 10-Minute in-memory LRU-like cache for search responses
interface SearchCacheItem {
    data: any;
    expires: number;
}
const searchCache = new Map<string, SearchCacheItem>();
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function searchRoutes(server: FastifyInstance) {
    /**
     * 1. MAIN SEARCH API
     * GET /api/search?q=keyword
     */
    server.get('/', {
        schema: { querystring: searchSchema }
    }, async (req: FastifyRequest<{ Querystring: z.infer<typeof searchSchema> }>, reply: FastifyReply) => {
        const { q, limit } = req.query;
        const cleanQ = q.trim();

        // 1. Resolve User ID & Language Preferences early for personalization & caching
        let userId: string | null = null;
        let userLangWeights: Record<string, number> = {};
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
                const [profile, preferences] = await Promise.all([
                    prisma.userInterestProfile.findUnique({ where: { userId } }),
                    prisma.userPreferences.findUnique({ where: { userId } })
                ]);

                if (profile?.languageWeights && Object.keys(profile.languageWeights as any).length > 0) {
                    userLangWeights = profile.languageWeights as Record<string, number>;
                } else if (preferences?.languages && preferences.languages.length > 0) {
                    preferences.languages.forEach((l, idx) => {
                        userLangWeights[l.toLowerCase()] = Math.max(0.1, 1.0 - idx * 0.2);
                    });
                }
            }
        } catch {}

        // Cache Check (10-minute cache)
        const cacheKey = `${cleanQ.toLowerCase()}::${limit}::${userId || 'anon'}`;
        const cached = searchCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            return reply.send(cached.data);
        }

        const pattern = `%${cleanQ}%`;
        const prefixPattern = `${cleanQ}%`;
        const cleanWords = cleanQ.split(/\s+/).filter(w => w.length > 2);
        const fuzzyPattern = cleanWords.length > 1 ? `%${cleanWords.join('%')}%` : '';

        try {
            // Parallel Database Queries for Local Content
            const [tracks, artists, albums, playlists] = await Promise.all([
                prisma.$queryRawUnsafe(`
                    SELECT 
                        t."id", t."title", t."genre", t."streams", t."like_count", t."duration", t."audioUrl", t."coverUrl", t."palette", t."language",
                        json_build_object('name', a."name", 'id', a."id", 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as "artist",
                        json_build_object('title', al."title", 'palette', al."palette") as "album"
                    FROM "Track" t
                    LEFT JOIN "Artist" a ON t."artistId" = a."id"
                    LEFT JOIN "Album" al ON t."albumId" = al."id"
                    WHERE (
                        unaccent(t."title") ILIKE unaccent($1) 
                        OR unaccent(t."title") ILIKE unaccent($2) 
                        OR unaccent(a."name") ILIKE unaccent($1) 
                        OR unaccent(a."name") ILIKE unaccent($2)
                        OR unaccent(al."title") ILIKE unaccent($1) 
                        OR unaccent(al."title") ILIKE unaccent($2)
                        OR ($4 <> '' AND (unaccent(t."title") ILIKE unaccent($4) OR unaccent(al."title") ILIKE unaccent($4)))
                    ) 
                      AND t."deletedAt" IS NULL
                      AND t."audioUrl" IS NOT NULL
                      AND t."audioUrl" <> ''
                      AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                    ORDER BY 
                        CASE 
                            WHEN unaccent(t."title") ILIKE unaccent($1) THEN 0 
                            WHEN unaccent(t."title") ILIKE unaccent($2) THEN 1 
                            ELSE 2 
                        END,
                        t."streams" DESC NULLS LAST
                    LIMIT $3
                `, prefixPattern, pattern, limit, fuzzyPattern),
                prisma.$queryRawUnsafe(`
                    SELECT 
                        a."id", a."name", a."follower_count", a."verified", a."imageUrl",
                        (SELECT COUNT(*) FROM "Track" t WHERE t."artistId" = a."id" AND t."deletedAt" IS NULL AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))) as track_count
                    FROM "Artist" a
                    WHERE unaccent(a."name") ILIKE unaccent($1) OR unaccent(a."name") ILIKE unaccent($2)
                    ORDER BY 
                        CASE WHEN unaccent(a."name") ILIKE unaccent($1) THEN 0 ELSE 1 END,
                        a."follower_count" DESC NULLS LAST
                    LIMIT $3
                `, prefixPattern, pattern, limit),
                prisma.$queryRawUnsafe(`
                    SELECT 
                        al."id", al."title", al."coverUrl", al."releaseDate",
                        EXTRACT(YEAR FROM COALESCE(al."releaseDate", al."createdAt"))::int as year,
                        json_build_object('name', a."name", 'id', a."id") as "artist"
                    FROM "Album" al
                    LEFT JOIN "Artist" a ON al."artistId" = a."id"
                    WHERE (unaccent(al."title") ILIKE unaccent($1) OR unaccent(al."title") ILIKE unaccent($2) OR unaccent(a."name") ILIKE unaccent($1) OR unaccent(a."name") ILIKE unaccent($2))
                      AND EXISTS (
                          SELECT 1 FROM "Track" t 
                          WHERE t."albumId" = al."id" 
                          AND t."deletedAt" IS NULL
                          AND t."audioUrl" IS NOT NULL
                          AND t."audioUrl" <> ''
                      )
                    ORDER BY al."title" ASC
                    LIMIT $3
                `, prefixPattern, pattern, limit),
                prisma.$queryRawUnsafe(`
                    SELECT 
                        "id", "name", "coverUrl", "follower_count"
                    FROM "Playlist"
                    WHERE (unaccent("name") ILIKE unaccent($1) OR unaccent("name") ILIKE unaccent($2)) AND "isPublic" = true
                    ORDER BY "follower_count" DESC NULLS LAST
                    LIMIT $3
                `, prefixPattern, pattern, limit)
            ]);

            // External Catalogs: Parallel requests for songs, artists, and albums
            let externalTracks: any[] = [];
            let externalArtists: any[] = [];
            let externalAlbums: any[] = [];

            // 1. Parallel iTunes requests: entity=song, entity=musicArtist, entity=album
            const [itunesSongsRes, itunesArtistsRes, itunesAlbumsRes] = await Promise.all([
                axios.get('https://itunes.apple.com/search', {
                    params: { term: cleanQ, media: 'music', entity: 'song', limit: 12 },
                    timeout: 4000
                }).catch(() => null),
                axios.get('https://itunes.apple.com/search', {
                    params: { term: cleanQ, media: 'music', entity: 'musicArtist', limit: 6 },
                    timeout: 4000
                }).catch(() => null),
                axios.get('https://itunes.apple.com/search', {
                    params: { term: cleanQ, media: 'music', entity: 'album', limit: 8 },
                    timeout: 4000
                }).catch(() => null),
            ]);

            if (itunesSongsRes?.data?.results) {
                for (const t of itunesSongsRes.data.results) {
                    externalTracks.push({
                        id: `itunes-${t.trackId}`,
                        title: t.trackName,
                        artist: {
                            id: `itunes-artist-${t.artistId || ''}`,
                            name: t.artistName,
                            imageUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : ''
                        },
                        album: {
                            id: `itunes-album-${t.collectionId || ''}`,
                            title: t.collectionName || 'Single',
                            coverUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : ''
                        },
                        duration: Math.floor((t.trackTimeMillis || 180000) / 1000),
                        coverUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : '',
                        previewUrl: t.previewUrl || undefined,
                        audioUrl: `itunes:${t.trackId}`,
                        type: 'track',
                        isVirtual: true,
                        isRapid: true,
                        streams: 0,
                        like_count: 0
                    });
                }
            }

            if (itunesArtistsRes?.data?.results) {
                for (const a of itunesArtistsRes.data.results) {
                    externalArtists.push({
                        id: `itunes-artist-${a.artistId}`,
                        name: a.artistName,
                        imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(a.artistName)}&background=random&color=fff&size=512`,
                        follower_count: 0,
                        verified: true,
                        type: 'artist'
                    });
                }
            }

            if (itunesAlbumsRes?.data?.results) {
                for (const alb of itunesAlbumsRes.data.results) {
                    externalAlbums.push({
                        id: `itunes-album-${alb.collectionId}`,
                        title: alb.collectionName,
                        coverUrl: alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : '',
                        year: alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined,
                        releaseDate: alb.releaseDate,
                        artist: {
                            name: alb.artistName
                        },
                        type: 'album'
                    });
                }
            }

            // 2. YouTube Music Catalog Search (Backend integration)
            try {
                const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                const ytResults = await ExternalMetadataService.searchYoutubeMusic(cleanQ).catch(() => []);
                if (ytResults && ytResults.length > 0) {
                    for (const v of ytResults.slice(0, 10)) {
                        const parsed = ExternalMetadataService.parseYoutubeVideoToTrack(v);
                        if (parsed && parsed.title) {
                            externalTracks.push({
                                ...parsed,
                                isVirtual: true,
                                type: 'track'
                            });
                        }
                    }
                }
            } catch (ytErr: any) {
                server.log.warn(`YouTube Music catalog search failed: ${ytErr.message}`);
            }

            // 3. Optional Spotify RapidAPI Search (if configured)
            try {
                const rapidApiKey = await SystemSettingsService.getSpotifyApiKey();
                if (rapidApiKey) {
                    const s23Res = await axios.get('https://spotify23.p.rapidapi.com/search/', {
                        params: { q: cleanQ, type: 'tracks,artists,albums', limit: 8 },
                        headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'spotify23.p.rapidapi.com' },
                        timeout: 4000
                    }).catch(() => null);

                    const data = s23Res?.data;
                    if (data?.tracks?.items) {
                        for (const item of data.tracks.items) {
                            const track = item.data || item;
                            const coverArts = track.albumOfTrack?.coverArt?.sources || track.album?.coverArt?.sources || [];
                            const bestCover = coverArts.length > 0
                                ? (coverArts.find((s: any) => s.width === 640)?.url || coverArts[0]?.url)
                                : (track.album?.images?.[0]?.url || '');
                            const artistName = track.artists?.items?.[0]?.profile?.name || track.artists?.[0]?.name || 'Unknown Artist';

                            externalTracks.push({
                                id: `sp-${track.id}`,
                                title: track.name,
                                artist: { name: artistName, id: 'sp-artist' },
                                album: { title: track.albumOfTrack?.name || track.album?.name || 'Single', coverUrl: bestCover },
                                duration: Math.floor((track.duration?.totalMilliseconds || 180000) / 1000),
                                coverUrl: bestCover,
                                audioUrl: `spotify:${track.id}`,
                                type: 'track',
                                isVirtual: true,
                                isRapid: true,
                                streams: 0,
                                like_count: 0
                            });
                        }
                    }

                    if (data?.artists?.items) {
                        for (const item of data.artists.items) {
                            const art = item.data || item;
                            const avatar = art.visuals?.avatarImage?.sources?.[0]?.url || art.images?.[0]?.url;
                            if (art.profile?.name || art.name) {
                                externalArtists.push({
                                    id: `sp-artist-${art.id}`,
                                    name: art.profile?.name || art.name,
                                    imageUrl: avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(art.profile?.name || art.name)}&background=random&color=fff&size=512`,
                                    follower_count: 0,
                                    verified: true,
                                    type: 'artist'
                                });
                            }
                        }
                    }

                    if (data?.albums?.items) {
                        for (const item of data.albums.items) {
                            const alb = item.data || item;
                            const cover = alb.coverArt?.sources?.[0]?.url || alb.images?.[0]?.url;
                            const albYear = alb.date?.year || (alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : undefined);
                            if (alb.name) {
                                externalAlbums.push({
                                    id: `sp-album-${alb.id}`,
                                    title: alb.name,
                                    coverUrl: cover || '',
                                    year: albYear,
                                    artist: { name: alb.artists?.items?.[0]?.profile?.name || alb.artists?.[0]?.name || 'Unknown' },
                                    type: 'album'
                                });
                            }
                        }
                    }
                }
            } catch {}

            // Deduplication and Normalization Helper
            function normalizeSearchStr(str: string): string {
                return (str || '').toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/\([^)]*\)/g, '')
                    .replace(/\[[^\]]*\]/g, '')
                    .replace(/-[^-]*$/g, '')
                    .replace(/[^a-z0-9]/g, '')
                    .trim();
            }

            // 1. Merge & Deduplicate Tracks
            const existingTitles = new Set((tracks as any[]).map(t => t.title.toLowerCase()));
            const existingNormalized = new Set((tracks as any[]).map(t => normalizeSearchStr(t.title)));
            const mergedTracks = (tracks as any[]).map(t => ({ ...t, type: 'track' }));

            for (const et of externalTracks) {
                const norm = normalizeSearchStr(et.title);
                const lower = et.title.toLowerCase();
                if (!existingTitles.has(lower) && (!norm || !existingNormalized.has(norm))) {
                    mergedTracks.push(et);
                    existingTitles.add(lower);
                    if (norm) existingNormalized.add(norm);
                }
            }

            // 2. Merge & Deduplicate Artists
            const existingArtistNames = new Set((artists as any[]).map(a => a.name.toLowerCase()));
            const mergedArtists = (artists as any[]).map(a => ({
                ...a,
                imageUrl: a.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=random&color=fff&size=512`,
                type: 'artist'
            }));

            for (const ea of externalArtists) {
                const lower = ea.name.toLowerCase();
                if (!existingArtistNames.has(lower)) {
                    mergedArtists.push(ea);
                    existingArtistNames.add(lower);
                }
            }

            // 3. Merge & Deduplicate Albums
            const existingAlbumTitles = new Set((albums as any[]).map(a => a.title.toLowerCase()));
            const mergedAlbums = (albums as any[]).map(al => ({
                ...al,
                year: al.year || (al.releaseDate ? new Date(al.releaseDate).getFullYear() : undefined),
                type: 'album'
            }));

            for (const ealb of externalAlbums) {
                const lower = ealb.title.toLowerCase();
                if (!existingAlbumTitles.has(lower)) {
                    mergedAlbums.push(ealb);
                    existingAlbumTitles.add(lower);
                }
            }

            // Relevance & Language Weight Calculation
            const qLower = cleanQ.toLowerCase();
            const calculateTrackRelevance = (t: any) => {
                let score = 0;
                const titleLower = (t.title || '').toLowerCase();
                const artistLower = (t.artist?.name || '').toLowerCase();
                
                if (titleLower === qLower) score += 100;
                else if (titleLower.startsWith(qLower)) score += 70;
                else if (titleLower.includes(qLower)) score += 40;

                if (artistLower === qLower) score += 60;
                else if (artistLower.includes(qLower)) score += 30;

                score += Math.min(25, Math.log10((t.streams || 0) + 10) * 3);
                return score;
            };

            const calculateArtistRelevance = (a: any) => {
                const nameLower = (a.name || '').toLowerCase();
                if (nameLower === qLower) return 100;
                if (nameLower.startsWith(qLower)) return 70;
                if (nameLower.includes(qLower)) return 40;
                return 10;
            };

            const calculateAlbumRelevance = (al: any) => {
                const titleLower = (al.title || '').toLowerCase();
                if (titleLower === qLower) return 100;
                if (titleLower.startsWith(qLower)) return 70;
                if (titleLower.includes(qLower)) return 40;
                return 10;
            };

            // Order tracks: Interested Languages FIRST, then by Relevance (NEVER alphabetical)
            const hasUserPreferences = Object.keys(userLangWeights).length > 0;
            let sortedTracks: any[] = [];

            if (hasUserPreferences) {
                const userLangKeys = Object.keys(userLangWeights).map(k => k.toLowerCase());
                const interestedTracks: any[] = [];
                const otherTracks: any[] = [];

                for (const t of mergedTracks) {
                    const trackLang = (t.language || '').toLowerCase();
                    const weight = userLangWeights[trackLang] || 0;
                    const relevance = calculateTrackRelevance(t);
                    if (weight > 0 || userLangKeys.includes(trackLang)) {
                        interestedTracks.push({ ...t, _score: weight * 100 + relevance });
                    } else {
                        otherTracks.push({ ...t, _score: relevance });
                    }
                }

                interestedTracks.sort((a, b) => b._score - a._score);
                otherTracks.sort((a, b) => b._score - a._score);
                sortedTracks = [...interestedTracks, ...otherTracks].map(({ _score, ...rest }) => rest);
            } else {
                sortedTracks = mergedTracks.map(t => ({ ...t, _score: calculateTrackRelevance(t) }))
                    .sort((a, b) => b._score - a._score)
                    .map(({ _score, ...rest }) => rest);
            }

            // Sort artists & albums by relevance
            mergedArtists.sort((a, b) => calculateArtistRelevance(b) - calculateArtistRelevance(a));
            mergedAlbums.sort((a, b) => calculateAlbumRelevance(b) - calculateAlbumRelevance(a));

            // Top Result Computation:
            // 1. If artist name matches query closely, Top Result is that artist
            // 2. Otherwise if album matches query closely, Top Result is that album
            // 3. Otherwise the highest-scoring track
            let topResult: any = null;
            if (mergedArtists.length > 0 && calculateArtistRelevance(mergedArtists[0]) >= 70) {
                topResult = { item: mergedArtists[0], type: 'artist' };
            } else if (mergedAlbums.length > 0 && calculateAlbumRelevance(mergedAlbums[0]) >= 70) {
                topResult = { item: mergedAlbums[0], type: 'album' };
            } else if (sortedTracks.length > 0) {
                topResult = { item: sortedTracks[0], type: 'track' };
            } else if (mergedArtists.length > 0) {
                topResult = { item: mergedArtists[0], type: 'artist' };
            }

            const response = {
                topResult,
                tracks: sortedTracks.slice(0, 24),
                artists: mergedArtists.slice(0, 12),
                albums: mergedAlbums.slice(0, 12),
                playlists: (playlists as any[]).map(p => ({ ...p, type: 'playlist' })).slice(0, 8)
            };

            const serializedResponse = JSON.parse(JSON.stringify(response, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value
            ));

            // Store in 10-minute in-memory cache
            searchCache.set(cacheKey, { data: serializedResponse, expires: Date.now() + SEARCH_CACHE_TTL });
            if (searchCache.size > 500) {
                // Prune older cache entries
                const now = Date.now();
                for (const [k, v] of searchCache.entries()) {
                    if (v.expires < now) searchCache.delete(k);
                }
            }

            return serializedResponse;
        } catch (error) {
            server.log.error(error);
            return reply.status(500).send({ error: 'Search failed' });
        }
    });

    /**
     * 1.1 SMART SEARCH (AI)
     * GET /api/search/smart?q=natural query
     */
    server.get('/smart', async (req: FastifyRequest<{ Querystring: { q: string } }>, reply: FastifyReply) => {
        const { q } = req.query;
        if (!q) return reply.status(400).send({ error: 'Query is required' });

        try {
            const result = await AISearchService.smartSearch(q);
            if (result) {
                return reply.send(result);
            } else {
                return reply.send({ message: null, sections: [], interpretedQuery: null });
            }
        } catch (err) {
            return reply.status(500).send({ error: 'Smart Search Error' });
        }
    });

    /**
     * 2. AUTOCOMPLETE API
     * GET /api/search/autocomplete?q=prefix
     */
    server.get('/autocomplete', {
        schema: { querystring: autocompleteSchema }
    }, async (req: FastifyRequest<{ Querystring: z.infer<typeof autocompleteSchema> }>, reply: FastifyReply) => {
        const { q } = req.query;
        try {
            // 1. Fetch from Spotify API as primary suggestion source
            let rapidSuggestions: any[] = [];
            try {
                const rapidApiKey = process.env.RAPIDAPI_KEY;
                if (rapidApiKey) {
                    const res = await axios.get('https://spotify81.p.rapidapi.com/search', {
                        params: { q, type: 'tracks', limit: 5 },
                        headers: {
                            'x-rapidapi-key': rapidApiKey,
                            'x-rapidapi-host': 'spotify81.p.rapidapi.com'
                        },
                        timeout: 3000
                    });
                    
                    const tracks = res.data?.tracks || [];
                    if (Array.isArray(tracks)) {
                        rapidSuggestions = tracks.slice(0, 5).map((item: any) => {
                            const track = item.data || item;
                            const artistName = track.artists?.items?.[0]?.profile?.name || '';
                            const title = artistName ? `${track.name} - ${artistName}` : track.name;
                            return {
                                id: `sp-${track.id}`,
                                title: title,
                                streams: 0,
                                isRapid: true
                            };
                        });
                    }
                }
            } catch (err) {
                server.log.warn('[Autocomplete] Spotify API failed, falling back to local DB: ' + (err as any).message);
            }

            // iTunes Autocomplete Fallback if RapidAPI is missing or returned no results
            if (rapidSuggestions.length === 0 && typeof q === 'string' && q.trim().length > 1) {
                try {
                    const itunesRes = await axios.get(`https://itunes.apple.com/search`, {
                        params: { term: q, media: 'music', entity: 'song', limit: 5 },
                        timeout: 2500
                    });
                    const results = itunesRes.data?.results || [];
                    rapidSuggestions = results.map((track: any) => {
                        return {
                            id: `itunes-${track.trackId}`,
                            title: `${track.trackName} - ${track.artistName}`,
                            streams: 0,
                            isRapid: true
                        };
                    });
                } catch (itunesErr: any) {
                    server.log.warn('[Autocomplete] iTunes fallback search failed: ' + itunesErr.message);
                }
            }

            // 2. Local DB Suggestions (Always prioritized first!)
            const tracks = await prisma.$queryRawUnsafe(`
                SELECT "id", "title", "streams"
                FROM "Track"
                WHERE (unaccent("title") ILIKE unaccent($1) || '%' OR unaccent("title") ILIKE '%' || unaccent($1) || '%')
                  AND "deletedAt" IS NULL
                  AND "audioUrl" IS NOT NULL AND "audioUrl" <> ''
                  AND ("releaseStatus" = 'PUBLISHED' OR ("releaseStatus" = 'SCHEDULED' AND "scheduledAt" <= NOW()))
                ORDER BY 
                    CASE WHEN unaccent("title") ILIKE unaccent($1) || '%' THEN 0 ELSE 1 END,
                    "streams" DESC NULLS LAST
                LIMIT 5
            `, q);
            
            // Deduplicate by title - Local DB first
            const merged = [...((tracks as any[]) || []), ...rapidSuggestions];
            const unique = [];
            const seen = new Set();
            for (const item of merged) {
                const normalizedTitle = item.title.toLowerCase();
                if (!seen.has(normalizedTitle)) {
                    seen.add(normalizedTitle);
                    unique.push(item);
                }
            }

            return { query: q, suggestions: unique.slice(0, 8) };
        } catch (error) {
            server.log.error(error);
            return reply.status(500).send({ error: 'Autocomplete failed' });
        }
    });

    let searchHomeCache: any = null;
    let lastSearchHomeCacheUpdate: number = 0; // Force refresh on deploy v2

    server.get('/home', async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const now = new Date();
            let baseData: any;

            if (now.getTime() - lastSearchHomeCacheUpdate < 15 * 60 * 1000 && searchHomeCache) {
                baseData = searchHomeCache;
            } else {
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

                const getSingle = async (query: any) => {
                    const res: any[] = await query;
                    return res[0] || {};
                };

                const [
                    topDay,
                    topWeek,
                    topMonth,
                    newRelease,
                    remix,
                    hollywood,
                    india,
                    globalTrack,
                    album,
                    playlist
                ] = await Promise.all([
                    // 1. Top Day - Most streamed in the last 24 hours
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette,
                               CAST(COALESCE(SUM(ta.stream_count), 0) AS FLOAT) as period_streams,
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) / 60.0 AS FLOAT) as daily_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title, 'palette', al.palette) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                          AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        GROUP BY t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette, a.name, a."imageUrl", a."coverUrl", al.title, al.palette
                        ORDER BY period_streams DESC, t.streams DESC
                        LIMIT 1
                    `, startOfDay)),

                    // 2. Top Week - Most streamed in the last 7 days
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette,
                               CAST(COALESCE(SUM(ta.stream_count), 0) AS FLOAT) as period_streams,
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) / 60.0 AS FLOAT) as weekly_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title, 'palette', al.palette) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                          AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        GROUP BY t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette, a.name, a."imageUrl", a."coverUrl", al.title, al.palette
                        ORDER BY period_streams DESC, t.streams DESC
                        LIMIT 1
                    `, startOfWeek)),

                    // 3. Top Month - Most streamed in the last 30 days
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette,
                               CAST(COALESCE(SUM(ta.stream_count), 0) AS FLOAT) as period_streams,
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) / 60.0 AS FLOAT) as monthly_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title, 'palette', al.palette) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                          AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        GROUP BY t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette, a.name, a."imageUrl", a."coverUrl", al.title, al.palette
                        ORDER BY period_streams DESC, t.streams DESC
                        LIMIT 1
                    `, thirtyDaysAgo)),

                    // 4. New Releases
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title, 'palette', al.palette) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."createdAt" >= $1 AND t."deletedAt" IS NULL
                          AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `, thirtyDaysAgo)),

                    // 5. Remixes
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title, 'palette', al.palette) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND t.track_type = 'remix'
                          AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 6. Hollywood / Western Pop
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title, 'palette', al.palette) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND (t.language ILIKE '%english%' OR t.region ILIKE '%US%' OR t.region ILIKE '%UK%')
                          AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 7. India / Bollywood / Desi
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title, 'palette', al.palette) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND (t.language ILIKE '%hindi%' OR t.language ILIKE '%tamil%' OR t.region ILIKE '%India%')
                          AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 8. Global — most streamed track globally (fallback)
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", t.palette,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title, 'palette', al.palette) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                          AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 9. Albums — top by total streams of all its tracks
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT al.id, al.title, al."coverUrl", al."releaseDate", al."artistId", al.palette,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               COALESCE(SUM(t.streams), 0) as total_streams,
                               COALESCE(SUM(t.duration), 0) as total_duration,
                               COUNT(t.id) as track_count
                        FROM "Album" al
                        LEFT JOIN "Artist" a ON al."artistId" = a.id
                        LEFT JOIN "Track" t ON t."albumId" = al.id AND t."deletedAt" IS NULL AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                        GROUP BY al.id, al.title, al."coverUrl", al."releaseDate", al."artistId", al.palette, a.name, a."imageUrl"
                        HAVING COUNT(t.id) > 0
                        ORDER BY total_streams DESC
                        LIMIT 1
                    `)),

                    // 10. Playlists
                    prisma.playlist.findFirst({
                        where: { isPublic: true },
                        orderBy: { popularity_score: 'desc' },
                        include: { user: { select: { name: true } } }
                    })
                ]);

                const topGlobalArtists = await prisma.$queryRawUnsafe(`
                    SELECT a.id, a.name, a."imageUrl",
                           COALESCE(SUM(t.streams), 0) as total_streams,
                           COUNT(t.id) as track_count
                    FROM "Artist" a
                    LEFT JOIN "Track" t ON t."artistId" = a.id AND t."deletedAt" IS NULL AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                    GROUP BY a.id, a.name, a."imageUrl"
                    HAVING COUNT(t.id) > 0
                    ORDER BY total_streams DESC
                    LIMIT 4
                `);

                baseData = {
                    topDay, topWeek, topMonth, newRelease, remix, hollywood, india, global: globalTrack, album, playlist: playlist || {},
                    topGlobalArtists
                };
                searchHomeCache = baseData;
                lastSearchHomeCacheUpdate = now.getTime();
            }

            let finalArtists = [...baseData.topGlobalArtists];

            let userId: string | undefined;
            const authHeader = req.headers.authorization;
            if (authHeader) {
                try {
                    const decoded = server.jwt.verify(authHeader.replace('Bearer ', '')) as any;
                    userId = decoded.id;
                } catch (e) { }
            } else if ((req as any).cookies?.token) {
                try {
                    const decoded = server.jwt.verify((req as any).cookies.token) as any;
                    userId = decoded.id;
                } catch (e) { }
            }

            if (userId) {
                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { name: true, username: true }
                });
                if (user) {
                    const nameToSearch = user.name || user.username;
                    if (nameToSearch) {
                        const userArtist = await prisma.artist.findFirst({
                            where: { name: { equals: nameToSearch, mode: 'insensitive' } }
                        });
                        if (userArtist) {
                            finalArtists = [
                                {
                                    id: userArtist.id,
                                    name: userArtist.name,
                                    imageUrl: userArtist.imageUrl,
                                    total_streams: 0,
                                    track_count: 0
                                },
                                ...finalArtists.slice(0, 3)
                            ];
                        }
                    }
                }
            }

            const response = {
                topDay: baseData.topDay,
                topWeek: baseData.topWeek,
                topMonth: baseData.topMonth,
                newRelease: baseData.newRelease,
                remix: baseData.remix,
                artists: finalArtists,
                hollywood: baseData.hollywood,
                india: baseData.india,
                global: baseData.global,
                album: baseData.album,
                playlist: baseData.playlist
            };

            return JSON.parse(JSON.stringify(response, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value
            ));
        } catch (error) {
            server.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch search home data', details: (error as any).message });
        }
    });
}
