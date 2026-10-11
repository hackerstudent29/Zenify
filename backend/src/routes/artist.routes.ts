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

    async function resolveArtistWithFullCatalog(idOrName: string) {
        const decoded = decodeURIComponent(idOrName).trim();

        // 1. Try finding by ID
        let artist = await prisma.artist.findUnique({
            where: { id: decoded },
            include: {
                albums: {
                    take: 20,
                    orderBy: { releaseDate: 'desc' }
                }
            }
        }).catch(() => null);

        // 2. If not found by ID, try finding by Name (case-insensitive)
        const cleanName = decoded.replace(/^yt-artist-/, '').replace(/^sp-artist-/, '').trim();
        if (!artist && cleanName.length > 0) {
            artist = await prisma.artist.findFirst({
                where: { name: { equals: cleanName, mode: 'insensitive' } },
                include: {
                    albums: {
                        take: 20,
                        orderBy: { releaseDate: 'desc' }
                    }
                }
            }).catch(() => null);
        }

        // 3. If still not in DB, create new artist from canonical list or AudioDB
        if (!artist && cleanName.length > 1 && !cleanName.startsWith('yt-') && !cleanName.includes('-artist-')) {
            const { CANONICAL_ARTISTS } = await import('../utils/artist.js');
            const canonical = CANONICAL_ARTISTS[cleanName.toLowerCase()];
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            const adbInfo = await ExternalMetadataService.fetchArtistFromAudioDB(cleanName).catch(() => null);

            const newArtist = await prisma.artist.create({
                data: {
                    name: canonical?.name || cleanName,
                    bio: canonical?.bio || adbInfo?.bio || `Listen to tracks by ${cleanName} on Zenify.`,
                    imageUrl: canonical?.imageUrl || adbInfo?.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=random&color=fff&size=512`,
                    coverUrl: adbInfo?.coverUrl || null,
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : null,
                    follower_count: adbInfo?.followers || 0
                },
                include: { albums: true }
            }).catch(() => null);

            if (newArtist) artist = newArtist;
        }

        if (!artist) return null;

        // Enrich artist bio / image if missing
        if (!artist.bio || !artist.imageUrl || artist.imageUrl.includes('ui-avatars.com')) {
            try {
                const { CANONICAL_ARTISTS } = await import('../utils/artist.js');
                const canonical = CANONICAL_ARTISTS[artist.name.toLowerCase()];
                const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                const adbInfo = await ExternalMetadataService.fetchArtistFromAudioDB(artist.name).catch(() => null);

                const updateData: any = {};
                if (!artist.bio && (canonical?.bio || adbInfo?.bio)) {
                    updateData.bio = canonical?.bio || adbInfo?.bio;
                }
                if ((!artist.imageUrl || artist.imageUrl.includes('ui-avatars.com')) && (canonical?.imageUrl || adbInfo?.imageUrl)) {
                    updateData.imageUrl = canonical?.imageUrl || adbInfo?.imageUrl;
                }
                if (!artist.coverUrl && adbInfo?.coverUrl) {
                    updateData.coverUrl = adbInfo?.coverUrl;
                }
                if ((!artist.follower_count || artist.follower_count === 0) && adbInfo?.followers) {
                    updateData.follower_count = adbInfo?.followers;
                }

                if (Object.keys(updateData).length > 0) {
                    const updated = await prisma.artist.update({
                        where: { id: artist.id },
                        data: updateData,
                        include: {
                            albums: {
                                take: 20,
                                orderBy: { releaseDate: 'desc' }
                            }
                        }
                    }).catch(() => null);
                    if (updated) artist = updated;
                }
            } catch (err: any) {
                server.log.warn(`[ArtistRoute] Metadata enrichment warn for ${artist.name}: ${err.message}`);
            }
        }

        // Fetch top tracks from local database
        const topTracks = await prisma.track.findMany({
            where: { 
                OR: [
                    { artistId: artist.id },
                    { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                ],
                deletedAt: null,
                releaseStatus: 'PUBLISHED',
                audioUrl: { not: '' }
            },
            include: { artist: true, album: true },
            orderBy: { streams: 'desc' },
            take: 50
        });

        let finalTopTracks = [...topTracks];
        let finalAlbums = [...(artist.albums || [])];

        // Enrich with Artist's real Global Catalog (Top Songs & Discography Albums from iTunes)
        try {
            const { default: axios } = await import('axios');
            const [itunesRes, itunesAlbumsRes] = await Promise.all([
                axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, media: 'music', entity: 'song', limit: 25 },
                    timeout: 4000
                }).catch(() => null),
                axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, media: 'music', entity: 'album', limit: 15 },
                    timeout: 4000
                }).catch(() => null)
            ]);

            if (itunesRes && itunesRes.data?.results) {
                const existingTitles = new Set(finalTopTracks.map(t => t.title.toLowerCase().trim()));
                for (const item of itunesRes.data.results) {
                    const match = item.artistName?.toLowerCase().includes(artist.name.toLowerCase()) || 
                                  artist.name.toLowerCase().includes(item.artistName?.toLowerCase());
                    if (match) {
                        const cleanTitle = (item.trackName || '').trim();
                        if (cleanTitle && !existingTitles.has(cleanTitle.toLowerCase())) {
                            existingTitles.add(cleanTitle.toLowerCase());
                            const artwork = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                            finalTopTracks.push({
                                id: `itunes-${item.trackId}`,
                                title: cleanTitle,
                                duration: Math.floor((item.trackTimeMillis || 180000) / 1000),
                                coverUrl: artwork,
                                audioUrl: `itunes:${item.trackId}`,
                                artistId: artist.id,
                                artist: { id: artist.id, name: artist.name, imageUrl: artist.imageUrl },
                                album: {
                                    id: `itunes-album-${item.collectionId || 'single'}`,
                                    title: item.collectionName || 'Single',
                                    coverUrl: artwork
                                },
                                isVirtual: true,
                                streams: 0,
                                like_count: 0
                            } as any);
                        }
                    }
                }
            }

            if (itunesAlbumsRes && itunesAlbumsRes.data?.results) {
                const existingAlbumTitles = new Set(finalAlbums.map(a => a.title.toLowerCase().trim()));
                for (const alb of itunesAlbumsRes.data.results) {
                    const albTitle = (alb.collectionName || '').trim();
                    if (albTitle && !existingAlbumTitles.has(albTitle.toLowerCase())) {
                        existingAlbumTitles.add(albTitle.toLowerCase());
                        const albArt = alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                        finalAlbums.push({
                            id: `itunes-album-${alb.collectionId}`,
                            title: albTitle,
                            coverUrl: albArt,
                            artistId: artist.id,
                            releaseDate: alb.releaseDate ? new Date(alb.releaseDate) : new Date(),
                            createdAt: alb.releaseDate ? new Date(alb.releaseDate) : new Date(),
                            isVirtual: true
                        } as any);
                    }
                }
            }
        } catch (enrichErr: any) {
            server.log.warn(`[ArtistRoute] Global catalog enrichment error: ${enrichErr.message}`);
        }

        // If top tracks are still few (< 15), supplement with YouTube Music top tracks
        if (finalTopTracks.length < 15) {
            try {
                const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                const ytResults = await ExternalMetadataService.searchYoutubeMusic(`${artist.name} songs`);
                const existingTitles = new Set(finalTopTracks.map(t => t.title.toLowerCase().trim()));
                for (const yt of ytResults) {
                    const cleanTitle = (yt.title || '').trim();
                    if (cleanTitle && !existingTitles.has(cleanTitle.toLowerCase())) {
                        existingTitles.add(cleanTitle.toLowerCase());
                        finalTopTracks.push({
                            id: `yt-${yt.videoId}`,
                            title: cleanTitle,
                            duration: yt.duration || 210,
                            coverUrl: yt.thumbnail || artist.imageUrl,
                            audioUrl: yt.audioUrl || `https://www.youtube.com/watch?v=${yt.videoId}`,
                            artistId: artist.id,
                            artist: { id: artist.id, name: artist.name, imageUrl: artist.imageUrl },
                            album: { id: `yt-album-${artist.id}`, title: 'YouTube Releases', coverUrl: yt.thumbnail || artist.imageUrl },
                            isVirtual: true,
                            isYoutube: true,
                            youtubeId: yt.videoId,
                            streams: 0,
                            like_count: 0
                        } as any);
                        if (finalTopTracks.length >= 25) break;
                    }
                }
            } catch (ytErr: any) {
                server.log.warn(`[ArtistRoute] YouTube catalog enrichment warn: ${ytErr.message}`);
            }
        }

        const [trackCount, streamAgg] = await Promise.all([
            prisma.track.count({ 
                where: { 
                    OR: [
                        { artistId: artist.id },
                        { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                    ],
                    deletedAt: null,
                    releaseStatus: 'PUBLISHED',
                    audioUrl: { not: '' }
                } 
            }),
            prisma.track.aggregate({
                where: { 
                    OR: [
                        { artistId: artist.id },
                        { featuredArtists: { contains: artist.name, mode: 'insensitive' } }
                    ],
                    deletedAt: null,
                    releaseStatus: 'PUBLISHED',
                    audioUrl: { not: '' }
                },
                _sum: { streams: true }
            })
        ]);

        // If artist has no profile pic, use their song's cover artwork
        let finalImageUrl = artist.imageUrl;
        if (!finalImageUrl || finalImageUrl.includes('placeholder') || finalImageUrl.includes('ui-avatars.com')) {
            const songCover = finalTopTracks.find(t => t.coverUrl && t.coverUrl.trim() !== '' && !t.coverUrl.includes('logo.png'))?.coverUrl;
            if (songCover) {
                finalImageUrl = songCover;
                prisma.artist.update({ where: { id: artist.id }, data: { imageUrl: songCover } }).catch(() => {});
            }
        }

        return JSON.parse(JSON.stringify({ 
            ...artist, 
            imageUrl: finalImageUrl,
            topTracks: finalTopTracks, 
            albums: finalAlbums,
            trackCount: Math.max(trackCount, finalTopTracks.length), 
            totalStreams: Number(streamAgg._sum.streams || 0),
            follower_count: artist.follower_count || 0,
            monthlyListeners: artist.monthlyListeners || 0
        },
            (key, value) => typeof value === 'bigint' ? value.toString() : value
        ));
    }

    // 1. Get artist by ID or Name
    server.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = req.params;
        const response = await resolveArtistWithFullCatalog(id);
        if (!response) return reply.status(404).send({ message: 'Artist not found' });
        return response;
    });

    // 2. Get artist by name (for name-based navigation)
    server.get('/name/:name', async (req: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
        const { name } = req.params;
        const response = await resolveArtistWithFullCatalog(name);
        if (!response) return reply.status(404).send({ message: 'Artist not found' });
        return response;
    });

    // 3. List all artists (with track counts and song cover fallback)
    server.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const artists = await prisma.artist.findMany({
                orderBy: [{ verified: 'desc' }, { name: 'asc' }],
                take: 50,
                include: {
                    tracks: {
                        where: { deletedAt: null, coverUrl: { not: '' } },
                        take: 1,
                        select: { coverUrl: true }
                    }
                }
            });

            const processedArtists: any[] = artists.map(a => {
                const songCover = a.tracks?.[0]?.coverUrl;
                const hasValidImage = a.imageUrl && !a.imageUrl.includes('placeholder') && !a.imageUrl.includes('ui-avatars.com');
                const finalImage = hasValidImage ? a.imageUrl : (songCover || a.imageUrl);
                const { tracks, ...rest } = a;
                return { ...rest, imageUrl: finalImage };
            });

            // If fewer than 20 artists, merge canonical artists
            if (processedArtists.length < 20) {
                const { CANONICAL_ARTISTS } = await import('../utils/artist.js');
                const existingNames = new Set(processedArtists.map(a => a.name.toLowerCase().trim()));
                for (const [key, can] of Object.entries(CANONICAL_ARTISTS)) {
                    if (!existingNames.has(can.name.toLowerCase().trim())) {
                        existingNames.add(can.name.toLowerCase().trim());
                        processedArtists.push({
                            id: `canonical-${key}`,
                            name: can.name,
                            bio: can.bio,
                            imageUrl: can.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(can.name)}&background=random&color=fff&size=512`,
                            follower_count: 500000,
                            verified: true,
                            isCanonical: true
                        });
                    }
                }
            }

            // Serialize any BigInt values safely
            const response = JSON.parse(JSON.stringify(processedArtists, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.send(response);
        } catch (error) {
            req.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch artists' });
        }
    });
}
