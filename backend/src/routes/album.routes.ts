import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';

export async function albumRoutes(server: FastifyInstance) {
    server.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = req.params;

        // Find the target album first
        const album = await prisma.album.findUnique({
            where: { id },
            include: { artist: true }
        });

        if (!album) return reply.status(404).send({ message: 'Album not found' });

        // Find ALL albums with the same title (handles fragmented batch imports)
        const siblingAlbums = await prisma.album.findMany({
            where: { title: album.title },
            select: { id: true }
        });
        const siblingIds = siblingAlbums.map((a: any) => a.id);

        // Aggregate all tracks from all sibling albums
        const allTracks = await prisma.track.findMany({
            where: {
                albumId: { in: siblingIds },
                deletedAt: null
            },
            include: { artist: true, album: true },
            orderBy: { createdAt: 'asc' }
        });

        return {
            ...album,
            tracks: allTracks
        };
    });

    // List all albums (for library/browse pages)
    server.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
        // Return distinct albums by title (deduplicated)
        const albums = await prisma.album.findMany({
            include: { artist: true },
            orderBy: { createdAt: 'desc' }
        });

        // Group by title, keep first occurrence (which has coverUrl etc.)
        const seen = new Set<string>();
        const unique = albums.filter((a: any) => {
            if (seen.has(a.title)) return false;
            seen.add(a.title);
            return true;
        });

        return unique;
    });
}
