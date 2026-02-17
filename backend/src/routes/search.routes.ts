import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const searchSchema = z.object({
    q: z.string().min(1),
    type: z.enum(['track', 'artist', 'playlist', 'all']).default('all'),
    limit: z.coerce.number().default(10),
});

export async function searchRoutes(server: FastifyInstance) {
    server.get('/', {
        schema: { querystring: searchSchema }
    }, async (req: FastifyRequest<{ Querystring: z.infer<typeof searchSchema> }>, reply: FastifyReply) => {
        const { q, type, limit } = req.query;

        // Optimized search using ILIKE for flexibility (or Full Text Search if configured)
        const results: any = {};

        if (type === 'track' || type === 'all') {
            results.tracks = await prisma.track.findMany({
                where: {
                    OR: [
                        { title: { contains: q, mode: 'insensitive' } },
                        { artist: { contains: q, mode: 'insensitive' } },
                        { tags: { has: q } } // Array search
                    ],
                    deletedAt: null
                },
                take: limit,
            });
        }

        if (type === 'playlist' || type === 'all') {
            results.playlists = await prisma.playlist.findMany({
                where: {
                    name: { contains: q, mode: 'insensitive' },
                    isPublic: true
                },
                take: limit,
            });
        }

        return results;
    });
}
