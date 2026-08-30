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

        let artist = await prisma.artist.findUnique({
            where: { id },
            include: {
                albums: {
                    take: 10,
                    orderBy: { releaseDate: 'desc' }
                }
            }
        });

        if (!artist) return reply.status(404).send({ message: 'Artist not found' });

        if (!artist.bio) {
            try {
                const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                const adbInfo = await ExternalMetadataService.fetchArtistFromAudioDB(artist.name);
                if (adbInfo) {
                    const updateData: any = {};
                    if (adbInfo.bio) updateData.bio = adbInfo.bio;
                    if (adbInfo.imageUrl && (!artist.imageUrl || artist.imageUrl.includes('placeholder') || artist.imageUrl.includes('ui-avatars.com'))) {
                        updateData.imageUrl = adbInfo.imageUrl;
                    }
                    if (adbInfo.coverUrl && (!artist.coverUrl || artist.coverUrl.includes('placeholder') || artist.coverUrl === '')) {
                        updateData.coverUrl = adbInfo.coverUrl;
                    }
                    if (adbInfo.followers && (!artist.follower_count || artist.follower_count === 0)) {
                        updateData.follower_count = adbInfo.followers;
                    }

                    if (Object.keys(updateData).length > 0) {
                        const updated = await prisma.artist.update({
                            where: { id },
                            data: updateData,
                            include: {
                                albums: {
                                    take: 10,
                                    orderBy: { releaseDate: 'desc' }
                                }
                            }
                        });
                        artist = updated;
                    }
                }
            } catch (err: any) {
                server.log.error(`Failed to enrich artist metadata for ${artist.name}:`, err.message);
            }
        }

        // Fetch top tracks (most played)
        const topTracks = await prisma.track.findMany({
            where: { 
                OR: [
                    { artistId: id },
                    { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                ],
                deletedAt: null 
            },
            include: { artist: true, album: true },
            orderBy: { streams: 'desc' },
            take: 50
        });

        const [trackCount, streamAgg] = await Promise.all([
            prisma.track.count({ 
                where: { 
                    OR: [
                        { artistId: id },
                        { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                    ],
                    deletedAt: null 
                } 
            }),
            prisma.track.aggregate({
                where: { 
                    OR: [
                        { artistId: id },
                        { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                    ],
                    deletedAt: null 
                },
                _sum: { streams: true }
            })
        ]);

        const response = JSON.parse(JSON.stringify({ 
            ...artist, 
            topTracks, 
            trackCount, 
            totalStreams: Number(streamAgg._sum.streams || 0),
            follower_count: artist.follower_count || 0,
            monthlyListeners: artist.monthlyListeners || 0
        },
            (key, value) => typeof value === 'bigint' ? value.toString() : value
        ));
        return response;
    });

    // 2. Get artist by name (for name-based navigation)
    server.get('/name/:name', async (req: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
        const { name } = req.params;
        const normalizedName = decodeURIComponent(name);

        let artist = await prisma.artist.findFirst({
            where: { name: { equals: normalizedName, mode: 'insensitive' } },
            include: { albums: { take: 5, orderBy: { releaseDate: 'desc' } } }
        });

        if (!artist) return reply.status(404).send({ message: 'Artist not found' });

        if (!artist.bio) {
            try {
                const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                const adbInfo = await ExternalMetadataService.fetchArtistFromAudioDB(artist.name);
                if (adbInfo) {
                    const updateData: any = {};
                    if (adbInfo.bio) updateData.bio = adbInfo.bio;
                    if (adbInfo.imageUrl && (!artist.imageUrl || artist.imageUrl.includes('placeholder') || artist.imageUrl.includes('ui-avatars.com'))) {
                        updateData.imageUrl = adbInfo.imageUrl;
                    }
                    if (adbInfo.coverUrl && (!artist.coverUrl || artist.coverUrl.includes('placeholder') || artist.coverUrl === '')) {
                        updateData.coverUrl = adbInfo.coverUrl;
                    }
                    if (adbInfo.followers && (!artist.follower_count || artist.follower_count === 0)) {
                        updateData.follower_count = adbInfo.followers;
                    }

                    if (Object.keys(updateData).length > 0) {
                        const updated = await prisma.artist.update({
                            where: { id: artist.id },
                            data: updateData,
                            include: { albums: { take: 5, orderBy: { releaseDate: 'desc' } } }
                        });
                        artist = updated;
                    }
                }
            } catch (err: any) {
                server.log.error(`Failed to enrich artist metadata for ${artist.name}:`, err.message);
            }
        }

        const topTracks = await prisma.track.findMany({
            where: { 
                OR: [
                    { artistId: artist.id },
                    { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                ],
                deletedAt: null 
            },
            include: { artist: true, album: true },
            orderBy: { streams: 'desc' },
            take: 50
        });

        const [trackCount, streamAgg] = await Promise.all([
            prisma.track.count({ 
                where: { 
                    OR: [
                        { artistId: artist.id },
                        { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                    ],
                    deletedAt: null 
                } 
            }),
            prisma.track.aggregate({
                where: { 
                    OR: [
                        { artistId: artist.id },
                        { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                    ],
                    deletedAt: null 
                },
                _sum: { streams: true }
            })
        ]);

        const response = JSON.parse(JSON.stringify({ 
            ...artist, 
            topTracks, 
            trackCount, 
            totalStreams: Number(streamAgg._sum.streams || 0),
            follower_count: artist.follower_count || 0 
        },
            (key, value) => typeof value === 'bigint' ? value.toString() : value
        ));
        return response;
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
