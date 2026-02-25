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

        // Convert raw query into a prefix-aware tsquery
        // e.g. "love sto" -> "love:* & sto:*"
        const formattedQuery = q.trim()
            .split(/\s+/)
            .filter(term => term.length > 0)
            .map(term => term.replace(/[()&|!:]/g, '')) // Sanitize special characters
            .filter(term => term.length > 0)
            .map(term => `${term}:*`)
            .join(' & ');

        const finalTsQuery = formattedQuery || q; // Fallback to raw if empty split

        try {
            // Execute parallel searches using Promise.all
            const [tracks, artists, albums, playlists] = await Promise.all([
                // Tracks Search: Weighted Rank with Joins
                prisma.$queryRaw`
                    SELECT 
                        t."id", t."title", t."genre", t."plays", t."like_count", t."audioUrl", t."coverUrl",
                        json_build_object('name', a."name") as "artist",
                        json_build_object('title', al."title") as "album",
                        ts_rank(t."search_vector", to_tsquery('simple', ${finalTsQuery})) AS text_rank,
                        (ts_rank(t."search_vector", to_tsquery('simple', ${finalTsQuery})) * 0.6 + 
                         log(t."plays" + 1) * 0.25 + 
                         t."like_count" * 0.15) AS final_score
                    FROM "Track" t
                    LEFT JOIN "Artist" a ON t."artistId" = a."id"
                    LEFT JOIN "Album" al ON t."albumId" = al."id"
                    WHERE t."search_vector" @@ to_tsquery('simple', ${finalTsQuery}) AND t."deletedAt" IS NULL
                    ORDER BY final_score DESC
                    LIMIT ${limit}
                `,

                // Artists Search
                prisma.$queryRaw`
                    SELECT 
                        "id", "name", "follower_count", "verified", "imageUrl",
                        ts_rank("search_vector", to_tsquery('simple', ${finalTsQuery})) AS final_score
                    FROM "Artist"
                    WHERE "search_vector" @@ to_tsquery('simple', ${finalTsQuery})
                    ORDER BY final_score DESC
                    LIMIT ${limit}
                `,

                // Albums Search
                prisma.$queryRaw`
                    SELECT 
                        al."id", al."title", al."coverUrl",
                        json_build_object('name', a."name") as "artist",
                        ts_rank(al."search_vector", to_tsquery('simple', ${finalTsQuery})) AS final_score
                    FROM "Album" al
                    LEFT JOIN "Artist" a ON al."artistId" = a."id"
                    WHERE al."search_vector" @@ to_tsquery('simple', ${finalTsQuery})
                    ORDER BY final_score DESC
                    LIMIT ${limit}
                `,

                // Playlists Search
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
     * 2. AUTOCOMPLETE API (Prefix Search)
     * GET /api/search/autocomplete?q=prefix
     */
    server.get('/autocomplete', {
        schema: { querystring: autocompleteSchema }
    }, async (req: FastifyRequest<{ Querystring: z.infer<typeof autocompleteSchema> }>, reply: FastifyReply) => {
        const { q } = req.query;

        try {
            // High-speed prefix search using text_pattern_ops index
            const tracks = await prisma.$queryRawUnsafe(`
                SELECT "id", "title", "plays"
                FROM "Track"
                WHERE "title" ILIKE $1 || '%' AND "deletedAt" IS NULL
                ORDER BY "plays" DESC
                LIMIT 8
            `, q);

            return {
                query: q,
                suggestions: tracks
            };
        } catch (error) {
            server.log.error(error);
            return reply.status(500).send({ error: 'Autocomplete failed' });
        }
    });
}
