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
        const pattern = `%${q}%`;
        const prefixPattern = `${q}%`;

        try {
            const [tracks, artists, albums, playlists] = await Promise.all([
                prisma.$queryRawUnsafe(`
                    SELECT 
                        t."id", t."title", t."genre", t."streams", t."like_count", t."duration", t."audioUrl", t."coverUrl",
                        json_build_object('name', a."name", 'id', a."id", 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as "artist",
                        json_build_object('title', al."title") as "album"
                    FROM "Track" t
                    LEFT JOIN "Artist" a ON t."artistId" = a."id"
                    LEFT JOIN "Album" al ON t."albumId" = al."id"
                    WHERE (t."title" ILIKE $1 OR t."title" ILIKE $2 OR a."name" ILIKE $1 OR a."name" ILIKE $2) AND t."deletedAt" IS NULL
                    ORDER BY t."streams" DESC
                    LIMIT $3
                `, prefixPattern, pattern, limit),
                prisma.$queryRawUnsafe(`
                    SELECT 
                        a."id", a."name", a."follower_count", a."verified", a."imageUrl",
                        (SELECT COUNT(*) FROM "Track" t WHERE t."artistId" = a."id" AND t."deletedAt" IS NULL) as track_count
                    FROM "Artist" a
                    WHERE a."name" ILIKE $1 OR a."name" ILIKE $2
                    ORDER BY a."follower_count" DESC
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
                    ORDER BY "follower_count" DESC
                    LIMIT $3
                `, prefixPattern, pattern, limit)
            ]);

            const response = {
                tracks: (tracks as any[]).map(t => ({ ...t, type: 'track' })),
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
                    // 1. Top Day - Keep analytics as it is specific
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(COALESCE(SUM(ta.total_listen_time), 0) / 60.0 AS FLOAT) as daily_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "TrackAnalytics" ta ON t.id = ta."trackId" AND ta.date >= $1
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                        GROUP BY t.id, a.name, a."imageUrl", a."coverUrl", al.title
                        ORDER BY daily_listen_minutes DESC
                        LIMIT 1
                    `, startOfDay)),

                    // 2. Top Week - Use indexed streams for speed if analytics is slow
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(t.streams AS FLOAT) as weekly_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 3. Top Month - Same here
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               CAST(t.streams AS FLOAT) as monthly_listen_minutes,
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                        ORDER BY t.popularity_score DESC
                        LIMIT 1
                    `)),

                    // 4. New Releases
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."createdAt" >= $1 AND t."deletedAt" IS NULL
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `, thirtyDaysAgo)),

                    // 5. Remixes
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl", 'coverUrl', a."coverUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND t.track_type = 'remix'
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 6. Hollywood
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND t.language ILIKE 'english' AND (t.region ILIKE 'US' OR t.region ILIKE 'UK')
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 7. India
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL AND t.language NOT ILIKE 'tamil' AND t.region ILIKE 'India'
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 8. Global — most streamed track (region-agnostic fallback since region may be unset)
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT t.id, t.title, t."audioUrl", t."coverUrl", t.duration, t.like_count, t."createdAt", 
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               json_build_object('title', al.title) as album
                        FROM "Track" t
                        LEFT JOIN "Artist" a ON t."artistId" = a.id
                        LEFT JOIN "Album" al ON t."albumId" = al.id
                        WHERE t."deletedAt" IS NULL
                          AND (t.region IS NULL OR t.region = '' OR t.region NOT ILIKE 'India')
                        ORDER BY t.streams DESC
                        LIMIT 1
                    `)),

                    // 9. Albums — top by total streams of all its tracks
                    getSingle(prisma.$queryRawUnsafe(`
                        SELECT al.id, al.title, al."coverUrl", al."releaseDate", al."artistId",
                               json_build_object('name', a.name, 'imageUrl', a."imageUrl") as artist,
                               COALESCE(SUM(t.streams), 0) as total_streams,
                               COALESCE(SUM(t.duration), 0) as total_duration,
                               COUNT(t.id) as track_count
                        FROM "Album" al
                        LEFT JOIN "Artist" a ON al."artistId" = a.id
                        LEFT JOIN "Track" t ON t."albumId" = al.id AND t."deletedAt" IS NULL
                        GROUP BY al.id, al.title, al."coverUrl", al."releaseDate", al."artistId", a.name, a."imageUrl"
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

                const baseTamilArtists = await prisma.$queryRawUnsafe(`
                    SELECT a.id, a.name, a."imageUrl",
                           COALESCE(SUM(t.streams), 0) as total_streams,
                           COUNT(t.id) as track_count
                    FROM "Artist" a
                    LEFT JOIN "Track" t ON t."artistId" = a.id AND t."deletedAt" IS NULL
                    GROUP BY a.id, a.name, a."imageUrl"
                    HAVING COUNT(t.id) > 0
                    ORDER BY total_streams DESC
                    LIMIT 4
                `);

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

            const response = {
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

            return JSON.parse(JSON.stringify(response, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value
            ));
        } catch (error) {
            server.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch search home data', details: (error as any).message });
        }
    });
}
