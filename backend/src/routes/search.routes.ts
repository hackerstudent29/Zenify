import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

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

        const formattedQuery = q.trim()
            .split(/\s+/)
            .filter(term => term.length > 0)
            .map(term => term.replace(/[()&|!:]/g, ''))
            .filter(term => term.length > 0)
            .map(term => `${term}:*`)
            .join(' & ');

        const finalTsQuery = formattedQuery || q;

        try {
            const [tracks, artists, albums, playlists] = await Promise.all([
                prisma.$queryRaw`
                    SELECT 
                        t."id", t."title", t."genre", t."streams", t."like_count", t."duration", t."audioUrl", t."coverUrl",
                        json_build_object('name', a."name") as "artist",
                        json_build_object('title', al."title") as "album",
                        ts_rank(t."search_vector", to_tsquery('simple', ${finalTsQuery})) AS text_rank,
                        (ts_rank(t."search_vector", to_tsquery('simple', ${finalTsQuery})) * 0.6 + 
                         log(t."streams" + 1) * 0.25 + 
                         t."like_count" * 0.15) AS final_score
                    FROM "Track" t
                    LEFT JOIN "Artist" a ON t."artistId" = a."id"
                    LEFT JOIN "Album" al ON t."albumId" = al."id"
                    WHERE t."search_vector" @@ to_tsquery('simple', ${finalTsQuery}) AND t."deletedAt" IS NULL
                    ORDER BY final_score DESC
                    LIMIT ${limit}
                `,
                prisma.$queryRaw`
                    SELECT 
                        a."id", a."name", a."follower_count", a."verified", a."imageUrl",
                        (SELECT COUNT(*) FROM "Track" t WHERE t."artistId" = a."id" AND t."deletedAt" IS NULL) as track_count,
                        ts_rank(a."search_vector", to_tsquery('simple', ${finalTsQuery})) AS final_score
                    FROM "Artist" a
                    WHERE a."search_vector" @@ to_tsquery('simple', ${finalTsQuery})
                    ORDER BY final_score DESC
                    LIMIT ${limit}
                `,
                prisma.$queryRaw`
                    SELECT 
                        al."id", al."title", al."coverUrl",
                        json_build_object('name', a."name") as "artist",
                        ts_rank(al."search_vector", to_tsquery('simple', ${finalTsQuery})) AS final_score
                    FROM "Album" al
                    LEFT JOIN "Artist" a ON al."artistId" = a."id"
                    WHERE al."search_vector" @@ to_tsquery('simple', ${finalTsQuery})
                      AND EXISTS (
                          SELECT 1 FROM "Track" t 
                          WHERE t."albumId" = al."id" 
                          AND t."deletedAt" IS NULL
                      )
                    ORDER BY final_score DESC
                    LIMIT ${limit}
                `,
                prisma.$queryRaw`
                    SELECT 
                        "id", "name", "coverUrl", "follower_count",
                        ts_rank("search_vector", to_tsquery('simple', ${finalTsQuery})) AS final_score
                    FROM "Playlist"
                    WHERE "search_vector" @@ to_tsquery('simple', ${finalTsQuery}) AND "isPublic" = true
                    ORDER BY final_score DESC
                    LIMIT ${limit}
                `
            ]);

            return {
                tracks: (tracks as any[]).map(t => ({ ...t, type: 'track' })),
                artists: (artists as any[]).map(a => ({ ...a, type: 'artist' })),
                albums: (albums as any[]).map(al => ({ ...al, type: 'album' })),
                playlists: (playlists as any[]).map(p => ({ ...p, type: 'playlist' }))
            };
        } catch (error) {
            server.log.error(error);
            return reply.status(500).send({ error: 'Search failed' });
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
            const tracks = await prisma.$queryRawUnsafe(`
                SELECT "id", "title", "streams"
                FROM "Track"
                WHERE "title" ILIKE $1 || '%' AND "deletedAt" IS NULL
                ORDER BY "streams" DESC
                LIMIT 8
            `, q);
            return { query: q, suggestions: tracks };
        } catch (error) {
            server.log.error(error);
            return reply.status(500).send({ error: 'Autocomplete failed' });
        }
    });

    let searchHomeCache: any = null;
    let lastSearchHomeCacheUpdate: number = 0;

    server.get('/home', async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const now = new Date();
            let baseData: any;

            if (now.getTime() - lastSearchHomeCacheUpdate < 5 * 60 * 1000 && searchHomeCache) {
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
                    // 1. Top Day
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) / 60.0 AS FLOAT) as daily_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                        GROUP BY t.id, a.name, a."imageUrl", al.title
                        ORDER BY daily_listen_minutes DESC
                        LIMIT 1
                    `, startOfDay)),

                    // 2. Top Week
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) / 60.0 AS FLOAT) as weekly_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                        GROUP BY t.id, a.name, a."imageUrl", al.title
                        ORDER BY weekly_listen_minutes DESC
                        LIMIT 1
                    `, startOfWeek)),

                    // 3. Top Month
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) / 60.0 AS FLOAT) as monthly_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                        GROUP BY t.id, a.name, a."imageUrl", al.title
                        ORDER BY monthly_listen_minutes DESC
                        LIMIT 1
                    `, startOfMonth)),

                    // 3. New Releases
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(((COALESCE(SUM(ta.total_listen_time), 0) * 0.6) + (t.like_count * 0.4)) AS FLOAT) as score,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date <= (t."createdAt" + interval '7 days')
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."createdAt" >= $1 AND t."deletedAt" IS NULL
                        GROUP BY t.id, a.name, a."imageUrl", al.title
                        ORDER BY score DESC
                        LIMIT 1
                    `, thirtyDaysAgo)),

                    // 4. Remixes
                    getSingle(prisma.$queryRaw`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) AS FLOAT) as total_time,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId"
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND t.track_type = 'remix'
                        GROUP BY t.id, a.name, a."imageUrl", al.title
                        ORDER BY total_time DESC
                        LIMIT 1
                    `),

                    // 6. Hollywood
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) AS FLOAT) as total_time,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND t.language ILIKE 'english' AND (t.region ILIKE 'US' OR t.region ILIKE 'UK')
                        GROUP BY t.id, a.name, a."imageUrl", al.title
                        ORDER BY total_time DESC
                        LIMIT 1
                    `, startOfMonth)),

                    // 7. India
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) AS FLOAT) as total_time,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND t.language NOT ILIKE 'tamil' AND t.region ILIKE 'India'
                        GROUP BY t.id, a.name, a."imageUrl", al.title
                        ORDER BY total_time DESC
                        LIMIT 1
                    `, startOfMonth)),

                    // 8. Global
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) AS FLOAT) as total_time,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND t.region NOT ILIKE 'India'
                        GROUP BY t.id, a.name, a."imageUrl", al.title
                        ORDER BY total_time DESC
                        LIMIT 1
                    `, startOfMonth)),

                    // 9. Albums
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT al.id, al.title, al."coverUrl", al."releaseDate", al."artistId", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) AS FLOAT) as total_time,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist
                        FROM "Album" al
                        JOIN "Track" t ON al.id = t."albumId" AND t."deletedAt" IS NULL
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON al."artistId" = a.id
                        GROUP BY al.id, a.name, a."imageUrl"
                        ORDER BY total_time DESC
                        LIMIT 1
                    `, startOfMonth)),

                    // 10. Playlists
                    prisma.playlist.findFirst({
                        where: { isPublic: true },
                        orderBy: { popularity_score: 'desc' },
                        include: { user: { select: { name: true } } }
                    })
                ]);

                const tamilArtistsNames = [
                    "anirudh ravichander", "hip hop thamizha", "a.r. rahman", "yuvan shankar raja",
                    "g.v. prakash kumar", "harris jayaraj", "sai abhyankar", "ilayaraja",
                    "deva", "santhosh narayanan", "sam cs", "sean roldan", "leon james", "samcs"
                ];

                const baseTamilArtists = await prisma.artist.findMany({
                    where: {
                        name: { in: tamilArtistsNames, mode: 'insensitive' },
                        imageUrl: { not: null }
                    },
                    include: {
                        _count: {
                            select: { tracks: { where: { deletedAt: null } } }
                        }
                    },
                    orderBy: { follower_count: 'desc' }
                });

                baseData = {
                    topDay, topWeek, topMonth, newRelease, remix, hollywood, india, global: globalTrack, album, playlist: playlist || {},
                    baseTamilArtists
                };
                searchHomeCache = baseData;
                lastSearchHomeCacheUpdate = now.getTime();
            }

            // Dynamics: Add User's artist to tamilArtists
            let finalTamilArtists = [...baseData.baseTamilArtists];

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
                const userArtist = await prisma.artist.findFirst({
                    where: { tracks: { some: { userId } }, imageUrl: { not: null } },
                    include: {
                        _count: {
                            select: { tracks: { where: { deletedAt: null } } }
                        }
                    }
                });
                if (userArtist && !finalTamilArtists.some(a => a.id === userArtist.id)) {
                    finalTamilArtists = [userArtist, ...finalTamilArtists];
                }
            }

            return {
                topDay: baseData.topDay,
                topWeek: baseData.topWeek,
                topMonth: baseData.topMonth,
                newRelease: baseData.newRelease,
                remix: baseData.remix,
                tamilArtists: finalTamilArtists,
                hollywood: baseData.hollywood,
                india: baseData.india,
                global: baseData.global,
                album: baseData.album,
                playlist: baseData.playlist
            };
        } catch (error) {
            server.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch search home data', details: (error as any).message });
        }
    });
}
