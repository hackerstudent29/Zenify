import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { uploadUrlToCloudinary } from '../utils/cloudinary';


export async function albumRoutes(server: FastifyInstance) {
    // ────────────── APPLE MUSIC ALBUM IMPORT ──────────────
    server.post('/import', async (req: FastifyRequest<{ Body: { appleMusicUrl: string } }>, reply: FastifyReply) => {
        try {
            const { appleMusicUrl } = req.body;
            if (!appleMusicUrl) return reply.status(400).send({ message: "appleMusicUrl is required" });

            // Extract album ID using standard patterns
            const match = appleMusicUrl.match(/\/album\/[^/]+\/(\d+)/) || appleMusicUrl.match(/id=(\d+)/) || appleMusicUrl.match(/\/album\/(\d+)/);
            if (!match) return reply.status(400).send({ message: "Invalid Apple Music URL format" });
            const appleAlbumId = match[1];

            // Primary Pass: US iTunes Lookup
            let itunesRes = await fetch(`https://itunes.apple.com/lookup?id=${appleAlbumId}&entity=song&country=US`);
            let data: any = await itunesRes.json();

            // Fallback Pass: IN (India) iTunes Lookup for local regional content
            if (!data.results || data.results.length === 0) {
                const itunesResIn = await fetch(`https://itunes.apple.com/lookup?id=${appleAlbumId}&entity=song&country=IN`);
                data = await itunesResIn.json() as any;
                if (!data.results || data.results.length === 0) {
                    return reply.status(404).send({ message: "Album not found or unavailable in iTunes Catalog." });
                }
            }

            const albumData = data.results[0]; // First item is always 'collection' (Album)
            const tracksData = data.results.slice(1); // Remaining are tracks

            // Upsert the main artist
            const artistName = albumData.artistName || 'Unknown Artist';
            const artist = await prisma.artist.upsert({
                where: { name: artistName },
                update: {},
                create: { name: artistName, imageUrl: albumData.artworkUrl100?.replace('100x100bb', '300x300bb') }
            });

            // Isolate high-definition premium cover art (1000px) and mirror to Cloudinary
            const artworkUrl = albumData.artworkUrl100?.replace('100x100bb', '1000x1000bb') || '';
            const cloudinaryCover = artworkUrl ? await uploadUrlToCloudinary(artworkUrl, 'zenify/albums') : '';

            // Construct and instantiate the new Album record
            const album = await prisma.album.create({
                data: {
                    title: albumData.collectionName,
                    coverUrl: cloudinaryCover || '',
                    artistId: artist.id,
                    releaseDate: albumData.releaseDate ? new Date(albumData.releaseDate) : new Date()
                }
            });

            // Extract palette in background
            if (cloudinaryCover) {
                import('../services/palette.service.js').then(({ PaletteService }) => {
                    PaletteService.extractAndSaveAlbum(album.id, cloudinaryCover).catch((err: any) => {
                        console.error("Failed to extract palette for imported album:", err);
                    });
                }).catch(console.error);
            }

            // Map scraped tracks to Zenify Track schema formatting
            const tracksToInsert = tracksData.map((t: any) => ({
                title: t.trackName,
                artistId: artist.id,
                albumId: album.id,
                coverUrl: cloudinaryCover || '',
                audioUrl: t.previewUrl || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Fallback stream
                duration: t.trackTimeMillis ? Math.floor(t.trackTimeMillis / 1000) : 180,
                trackNumber: t.trackNumber || 1,
                genre: t.primaryGenreName || albumData.primaryGenreName
            }));

            // Bulk injection, order inherently preserved through 'trackNumber' values!
            await prisma.track.createMany({
                data: tracksToInsert
            });

            return reply.send({ message: "Album successfully imported!", albumId: album.id });

        } catch (error: any) {
            console.error("Apple Music Import Error:", error);
            return reply.status(500).send({ message: "An error occurred while importing the album." });
        }
    });


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
            where: {
                title: album.title,
                artistId: album.artistId
            },
            select: { id: true }
        });
        const siblingIds = siblingAlbums.map((a: any) => a.id);

        // Aggregate all tracks from all sibling albums
        const allTracks = await prisma.track.findMany({
            where: {
                albumId: { in: siblingIds },
                deletedAt: null,
                OR: [
                    { releaseStatus: 'PUBLISHED' },
                    { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                ]
            },
            include: { artist: true, album: true },
            orderBy: [
                { trackNumber: 'asc' },
                { createdAt: 'asc' }
            ]
        });

        return {
            ...album,
            tracks: allTracks
        };
    });

    // List all albums (for library/browse pages)
    server.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
        // Return distinct albums by title (deduplicated)
        // Only return albums that have at least one ACTIVE track
        const albums = await prisma.album.findMany({
            where: {
                tracks: {
                    some: {
                        deletedAt: null,
                        OR: [
                            { releaseStatus: 'PUBLISHED' },
                            { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                        ]
                    }
                }
            },
            include: { artist: true },
            orderBy: { createdAt: 'desc' }
        });

        // Group by title, keep first occurrence (which has coverUrl etc.)
        const seen = new Set<string>();
        const unique = albums.filter((a: any) => {
            const lowerTitle = a.title.trim().toLowerCase();
            if (seen.has(lowerTitle)) return false;
            seen.add(lowerTitle);
            return true;
        });

        return unique;
    });

    // Create a new album manually
    server.post('/', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, async (req: FastifyRequest<{ Body: { title: string, coverUrl?: string, artistId: string, releaseDate?: string } }>, reply: FastifyReply) => {
        try {
            const { title, coverUrl, artistId, releaseDate } = req.body;
            if (!title || !artistId) {
                return reply.status(400).send({ message: "Title and artistId are required." });
            }

            const finalCoverUrl = coverUrl ? await uploadUrlToCloudinary(coverUrl, 'zenify/albums') : '';

            const album = await prisma.album.create({
                data: {
                    title,
                    coverUrl: finalCoverUrl || '',
                    artistId,
                    releaseDate: releaseDate ? new Date(releaseDate) : new Date()
                }
            });

            // Extract palette in background
            if (album.coverUrl) {
                import('../services/palette.service.js').then(({ PaletteService }) => {
                    PaletteService.extractAndSaveAlbum(album.id, album.coverUrl!).catch((err: any) => {
                        console.error("Failed to extract palette for manual album:", err);
                    });
                }).catch(console.error);
            }

            return reply.status(201).send(album);
        } catch (error: any) {
            console.error("Album Creation Error:", error);
            return reply.status(500).send({ message: "An error occurred while creating the album." });
        }
    });

    // Delete an album + all its tracks
    server.delete('/:id', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = req.params;
        try {
            const album = await prisma.album.findUnique({ where: { id } });
            if (!album) return reply.status(404).send({ message: 'Album not found' });

            // Find all sibling albums with the same title (batch-imported albums can be fragmented)
            const siblings = await prisma.album.findMany({
                where: { title: album.title },
                select: { id: true }
            });
            const siblingIds = siblings.map((a: any) => a.id);

            // Soft-delete all tracks in these albums
            await prisma.track.updateMany({
                where: { albumId: { in: siblingIds } },
                data: { deletedAt: new Date() }
            });

            // Hard-delete the album records
            await prisma.album.deleteMany({
                where: { id: { in: siblingIds } }
            });

            return reply.status(200).send({ message: 'Album and all its tracks deleted successfully.' });
        } catch (err: any) {
            console.error('Album delete error:', err);
            return reply.status(500).send({ message: 'Failed to delete album.' });
        }
    });

    server.patch('/:id', async (req: FastifyRequest<{ Params: { id: string }, Body: { title?: string, genre?: string, coverUrl?: string } }>, reply: FastifyReply) => {
        const { id } = req.params;
        const { title, genre, coverUrl } = req.body;

        try {
            const album = await prisma.album.findUnique({ where: { id } });
            if (!album) return reply.status(404).send({ message: 'Album not found' });

            const siblings = await prisma.album.findMany({
                where: { title: album.title },
                select: { id: true }
            });
            const siblingIds = siblings.map((a: any) => a.id);

            const updateData: any = {};
            if (title) updateData.title = title;
            
            if (coverUrl) {
                // If the URL is external, we might want to mirror it to Cloudinary
                const finalCoverUrl = coverUrl.startsWith('http') ? await uploadUrlToCloudinary(coverUrl, 'zenify/albums') : coverUrl;
                updateData.coverUrl = finalCoverUrl || coverUrl;
            }

            if (Object.keys(updateData).length > 0) {
                await prisma.album.updateMany({
                    where: { id: { in: siblingIds } },
                    data: updateData
                });
                
                // Also update coverUrl on all tracks within the album if cover was updated
                if (updateData.coverUrl) {
                    await prisma.track.updateMany({
                        where: { albumId: { in: siblingIds } },
                        data: { coverUrl: updateData.coverUrl }
                    });
                }
            }

            if (genre) {
                await prisma.track.updateMany({
                    where: { albumId: { in: siblingIds } },
                    data: { genre }
                });
            }

            return reply.status(200).send({ message: 'Album updated successfully.' });
        } catch (err: any) {
            console.error('Album update error:', err);
            return reply.status(500).send({ message: 'Failed to update album.' });
        }
    });

    // Merge multiple albums into one
    server.post('/merge', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, async (req: FastifyRequest<{ Body: { sourceAlbumIds: string[], targetAlbumId: string } }>, reply: FastifyReply) => {
        try {
            const { sourceAlbumIds, targetAlbumId } = req.body;
            if (!sourceAlbumIds || !targetAlbumId || sourceAlbumIds.length === 0) {
                return reply.status(400).send({ message: "Invalid parameters" });
            }

            // Move all tracks from source albums to target album
            await prisma.track.updateMany({
                where: { albumId: { in: sourceAlbumIds } },
                data: { albumId: targetAlbumId }
            });

            // Delete the empty source albums
            await prisma.album.deleteMany({
                where: { id: { in: sourceAlbumIds } }
            });

            return reply.status(200).send({ message: "Albums merged successfully" });
        } catch (err: any) {
            console.error("Album Merge Error:", err);
            return reply.status(500).send({ message: "Failed to merge albums" });
        }
    });
}
