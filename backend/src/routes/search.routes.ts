import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const searchSchema = z.object({
    q: z.string().min(1),
    type: z.enum(['track', 'artist', 'album', 'playlist', 'all']).default('all'),
    limit: z.coerce.number().default(10),
});

export async function searchRoutes(server: FastifyInstance) {
    server.get('/', {
        schema: { querystring: searchSchema }
    }, async (req: FastifyRequest<{ Querystring: z.infer<typeof searchSchema> }>, reply: FastifyReply) => {
        const { q, type, limit } = req.query;

        // Optimized search to prioritize "Starts With" matches
        const results: any = {};

        const fetchResults = async (model: any, primaryField: string, typeFilter: string, include: any = {}) => {
            if (type !== typeFilter && type !== 'all') return [];

            // 1. High Priority: Primary field starts with q
            const priorityMatches = await model.findMany({
                where: {
                    [primaryField]: { startsWith: q, mode: 'insensitive' },
                    ...(typeFilter === 'track' ? { deletedAt: null } : {}),
                    ...(typeFilter === 'playlist' ? { isPublic: true } : {})
                },
                include,
                take: limit,
            });

            // 2. Medium Priority: Artist/Other fields start with q OR primary field contains q
            const otherWhere: any[] = [
                { [primaryField]: { contains: q, mode: 'insensitive' } }
            ];

            if (typeFilter === 'track') {
                otherWhere.push({ artist: { name: { startsWith: q, mode: 'insensitive' } } });
                otherWhere.push({ genre: { startsWith: q, mode: 'insensitive' } });
            }

            const remainingLimit = limit - priorityMatches.length;
            let secondaryMatches: any[] = [];

            if (remainingLimit > 0) {
                secondaryMatches = await model.findMany({
                    where: {
                        AND: [
                            { id: { notIn: priorityMatches.map((m: any) => m.id) } },
                            {
                                OR: otherWhere,
                            },
                        ],
                        ...(typeFilter === 'track' ? { deletedAt: null } : {}),
                        ...(typeFilter === 'playlist' ? { isPublic: true } : {})
                    },
                    include,
                    take: remainingLimit,
                });
            }

            return [...priorityMatches, ...secondaryMatches];
        };

        if (type === 'track' || type === 'all') {
            results.tracks = await fetchResults(prisma.track, 'title', 'track', { artist: true, album: true });
        }

        if (type === 'artist' || type === 'all') {
            results.artists = await fetchResults(prisma.artist, 'name', 'artist');
        }

        if (type === 'album' || type === 'all') {
            results.albums = await fetchResults(prisma.album, 'title', 'album', { artist: true });
        }

        if (type === 'playlist' || type === 'all') {
            results.playlists = await fetchResults(prisma.playlist, 'name', 'playlist');
        }

        return results;
    });
}
