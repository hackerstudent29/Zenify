import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AISearchService } from '../services/ai-search.service';
import { SystemSettingsService } from '../services/system-settings.service';
import axios from 'axios';

const searchSchema = z.object({
    q: z.string().min(1),
    limit: z.coerce.number().default(5),
});

const autocompleteSchema = z.object({
    q: z.string().min(2),
});

export async function searchRoutes(server: FastifyInstance) {
    /**
     * 1. MAIN SEARCH API
     * GET /api/search?q=keyword
     */
    server.get('/', {
        schema: { querystring: searchSchema }
    }, async (req: FastifyRequest<{ Querystring: z.infer<typeof searchSchema> }>, reply: FastifyReply) => {
        const { q, limit } = req.query;
        const pattern = `%${q}%`;
        const prefixPattern = `${q}%`;

        try {
            const [tracks, artists, albums, playlists] = await Promise.all([
                prisma.$queryRawUnsafe(`
                    SELECT 
                        t."id", t."title", t."genre", t."streams", t."like_count", t."duration", t."audioUrl", t."coverUrl", t."palette",
                        json_build_object('name', a."name", 'id', a."id", 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as "artist",
                        json_build_object('title', al."title", 'palette', al."palette") as "album"
                    FROM "Track" t
                    LEFT JOIN "Artist" a ON t."artistId" = a."id"
                    LEFT JOIN "Album" al ON t."albumId" = al."id"
                    WHERE (t."title" ILIKE $1 OR t."title" ILIKE $2 OR a."name" ILIKE $1 OR a."name" ILIKE $2) 
                      AND t."deletedAt" IS NULL
                      AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))
                    ORDER BY t."streams" DESC NULLS LAST
                    LIMIT $3
                `, prefixPattern, pattern, limit),
                prisma.$queryRawUnsafe(`
                    SELECT 
                        a."id", a."name", a."follower_count", a."verified", a."imageUrl",
                        (SELECT COUNT(*) FROM "Track" t WHERE t."artistId" = a."id" AND t."deletedAt" IS NULL AND (t."releaseStatus" = 'PUBLISHED' OR (t."releaseStatus" = 'SCHEDULED' AND t."scheduledAt" <= NOW()))) as track_count
                    FROM "Artist" a
                    WHERE a."name" ILIKE $1 OR a."name" ILIKE $2
                    ORDER BY 
                        CASE WHEN a."name" ILIKE $1 THEN 0 ELSE 1 END,
                        a."follower_count" DESC NULLS LAST
                    LIMIT $3
                `, prefixPattern, pattern, limit),
                prisma.$queryRawUnsafe(`
                    SELECT 
                        al."id", al."title", al."coverUrl",
                        json_build_object('name', a."name") as "artist"
                    FROM "Album" al
                    LEFT JOIN "Artist" a ON al."artistId" = a."id"
                    WHERE (al."title" ILIKE $1 OR al."title" ILIKE $2 OR a."name" ILIKE $1 OR a."name" ILIKE $2)
                      AND EXISTS (
                          SELECT 1 FROM "Track" t 
                          WHERE t."albumId" = al."id" 
                          AND t."deletedAt" IS NULL
                      )
                    ORDER BY al."title" ASC
                    LIMIT $3
                `, prefixPattern, pattern, limit),
                prisma.$queryRawUnsafe(`
                    SELECT 
                        "id", "name", "coverUrl", "follower_count"
                    FROM "Playlist"
                    WHERE ("name" ILIKE $1 OR "name" ILIKE $2) AND "isPublic" = true
                    ORDER BY "follower_count" DESC NULLS LAST
                    LIMIT $3
                `, prefixPattern, pattern, limit)
            ]);

            // Spotify Global Search Fallback / Extension (replaces YouTube)
            let rapidTracks: any[] = [];
            try {
                const rapidApiKey = process.env.RAPIDAPI_KEY;
                if (rapidApiKey && typeof q === 'string' && q.trim().length > 1) {
                    const spotifyRes = await axios.get('https://spotify81.p.rapidapi.com/search', {
                        params: { q, type: 'tracks', limit: 8 },
                        headers: {
                            'x-rapidapi-key': rapidApiKey,
                            'x-rapidapi-host': 'spotify81.p.rapidapi.com'
                        },
                        timeout: 5000
                    });

                    const tracks = spotifyRes.data?.tracks || [];
                    rapidTracks = tracks.slice(0, 8).map((item: any) => {
                        const track = item.data || item;
                        const coverArts = track.albumOfTrack?.coverArt?.sources || [];
                        const bestCover = coverArts.length > 0 
                            ? coverArts.find((s: any) => s.width === 640)?.url || coverArts[coverArts.length - 1]?.url 
                            : '';
                        const artistName = track.artists?.items?.[0]?.profile?.name || 'Unknown';
                        return {
                            id: `sp-${track.id}`,
                            title: track.name,
                            artist: {
                                name: artistName,
                                id: 'sp-artist'
                            },
                            duration: Math.floor((track.duration?.totalMilliseconds || 180000) / 1000),
                            coverUrl: bestCover,
                            audioUrl: `spotify:${track.id}`,
                            type: 'track',
                            isRapid: true,
                            isSpotify: true,
                            spotifyId: track.id,
                            streams: 0,
                            like_count: 0
                        };
                    });
                }
            } catch (err) {
                server.log.warn('Spotify Global Search failed in main search route: ' + (err as any).message);
            }

            // Deduplicate tracks by title
            const existingTitles = new Set((tracks as any[]).map(t => t.title.toLowerCase()));
            const finalTracks = (tracks as any[]).map(t => ({ ...t, type: 'track' }));
            
            for (const rt of rapidTracks) {
                if (!existingTitles.has(rt.title.toLowerCase())) {
                    finalTracks.push(rt);
                    existingTitles.add(rt.title.toLowerCase());
                }
            }

            const response = {
                tracks: finalTracks,
                artists: (artists as any[]).map(a => ({ ...a, type: 'artist' })),
                albums: (albums as any[]).map(al => ({ ...al, type: 'album' })),
                playlists: (playlists as any[]).map(p => ({ ...p, type: 'playlist' }))
            };

            return JSON.parse(JSON.stringify(response, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value
            ));
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

            // 2. Fallback / Merge with Local DB
            const tracks = await prisma.$queryRawUnsafe(`
                SELECT "id", "title", "streams"
                FROM "Track"
                WHERE "title" ILIKE $1 || '%' AND "deletedAt" IS NULL
                  AND ("releaseStatus" = 'PUBLISHED' OR ("releaseStatus" = 'SCHEDULED' AND "scheduledAt" <= NOW()))
                ORDER BY "streams" DESC
                LIMIT 5
            `, q);
            
            // Deduplicate by title
            const merged = [...rapidSuggestions, ...((tracks as any[]) || [])];
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

            // Dynamics: Add User's artist to top artists if applicable
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
