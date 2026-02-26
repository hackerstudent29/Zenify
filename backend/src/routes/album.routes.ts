import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';

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

            // Isolate high-definition premium cover art (1000px)
            const artworkUrl = albumData.artworkUrl100?.replace('100x100bb', '1000x1000bb') || '';

            // Construct and instantiate the new Album record
            const album = await prisma.album.create({
                data: {
                    title: albumData.collectionName,
                    coverUrl: artworkUrl,
                    artistId: artist.id,
                    releaseDate: albumData.releaseDate ? new Date(albumData.releaseDate) : new Date()
                }
            });

            // Map scraped tracks to Zenify Track schema formatting
            const tracksToInsert = tracksData.map((t: any) => ({
                title: t.trackName,
                artistId: artist.id,
                albumId: album.id,
                coverUrl: artworkUrl,
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
