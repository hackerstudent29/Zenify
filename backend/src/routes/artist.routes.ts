import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { ArtistController } from '../controllers/artist.controller';

export async function artistRoutes(server: FastifyInstance) {
    const artistController = new ArtistController(server);

    // ── ADMIN ROUTES ─────────────────────────────────────────────────

    // Create new artist
    server.post('/', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, artistController.create);

    // Update artist
    server.put('/:id', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, artistController.update);

    // Delete artist
    server.delete('/:id', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, artistController.delete);

    // List all artists (admin enhanced view)
    server.get('/admin', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, artistController.getAll);

    // ── PUBLIC ROUTES ────────────────────────────────────────────────

    // 1. Get artist by ID (including top tracks and albums)
    server.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = req.params;

        const artist = await prisma.artist.findUnique({
            where: { id },
            include: {
                albums: {
                    take: 10,
                    orderBy: { releaseDate: 'desc' }
                }
            }
        });

        if (!artist) return reply.status(404).send({ message: 'Artist not found' });

        // Fetch top tracks (most played)
        const topTracks = await prisma.track.findMany({
            where: { artistId: id, deletedAt: null },
            include: { artist: true, album: true },
            orderBy: { streams: 'desc' },
            take: 10
        });

        // Fetch total track count
        const trackCount = await prisma.track.count({
            where: { artistId: id, deletedAt: null }
        });

        const response = JSON.parse(JSON.stringify({ ...artist, topTracks, trackCount },
            (key, value) => typeof value === 'bigint' ? value.toString() : value
        ));
        return response;
    });

    // 2. Get artist by name (for name-based navigation)
    server.get('/name/:name', async (req: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
        const { name } = req.params;

        const artist = await prisma.artist.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
            include: {
                albums: {
                    take: 10,
                    orderBy: { releaseDate: 'desc' }
                }
            }
        });

        if (!artist) return reply.status(404).send({ message: 'Artist not found' });

        const topTracks = await prisma.track.findMany({
            where: { artistId: artist.id, deletedAt: null },
            include: { artist: true, album: true },
            orderBy: { streams: 'desc' },
            take: 10
        });

        const trackCount = await prisma.track.count({
            where: { artistId: artist.id, deletedAt: null }
        });

        return {
            ...artist,
            topTracks,
            trackCount
        };
    });

    // 3. List all artists (with track counts)
    server.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const artists = await prisma.artist.findMany({
                orderBy: [{ verified: 'desc' }, { name: 'asc' }],
                take: 50,
            });

            // Serialize any BigInt values safely
            const response = JSON.parse(JSON.stringify(artists, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.send(response);
        } catch (error) {
            req.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch artists' });
        }
    });
}
