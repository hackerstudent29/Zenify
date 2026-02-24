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

        // Run all queries in PARALLEL — single round trip per type instead of 2
        const [tracks, artists, albums, playlists] = await Promise.all([
            // Tracks
            (type === 'track' || type === 'all') ? prisma.track.findMany({
                where: {
                    deletedAt: null,
                    OR: [
                        { title: { contains: q, mode: 'insensitive' } },
                        { artist: { name: { contains: q, mode: 'insensitive' } } },
                        { genre: { contains: q, mode: 'insensitive' } },
                        { album: { title: { contains: q, mode: 'insensitive' } } },
                    ]
                },
                include: { artist: true, album: true },
                take: limit,
                orderBy: [
                    // Boost "starts with" results to top by sorting title
                    { title: 'asc' }
                ],
            }) : Promise.resolve([]),

            // Artists
            (type === 'artist' || type === 'all') ? prisma.artist.findMany({
                where: {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                    ]
                },
                take: limit,
            }) : Promise.resolve([]),

            // Albums
            (type === 'album' || type === 'all') ? prisma.album.findMany({
                where: {
                    OR: [
                        { title: { contains: q, mode: 'insensitive' } },
                        { artist: { name: { contains: q, mode: 'insensitive' } } },
                    ]
                },
                include: { artist: true },
                take: limit,
            }) : Promise.resolve([]),

            // Playlists
            (type === 'playlist' || type === 'all') ? prisma.playlist.findMany({
                where: {
                    isPublic: true,
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                    ]
                },
                take: limit,
            }) : Promise.resolve([]),
        ]);

        // Deduplicate albums by title (handles fragmented bulk imports)
        const seenTitles = new Set<string>();
        const deduplicatedAlbums = (albums as any[]).filter((a: any) => {
            if (seenTitles.has(a.title)) return false;
            seenTitles.add(a.title);
            return true;
        });

        return {
            tracks,
            artists,
            albums: deduplicatedAlbums,
            playlists,
        };
    });
}
