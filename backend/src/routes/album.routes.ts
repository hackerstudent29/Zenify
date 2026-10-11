import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { uploadUrlToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';
import { invalidateCache } from '../utils/cache';

async function clearAlbumCaches() {
    try {
        await invalidateCache('hp:top_albums');
        await invalidateCache('new_releases_row');
        await invalidateCache('trending_row');
        await invalidateCache('featured_row');
        await invalidateCache('most_played_row');
    } catch (cacheErr: any) {
        console.warn('[AlbumCache] Failed to invalidate homepage cache:', cacheErr.message);
    }
}


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

            // Trigger background fetches for Lyrics and Palettes for the newly created tracks
            const newTracks = await prisma.track.findMany({
                where: { albumId: album.id }
            });

            Promise.all([
                import('../services/lyrics-sync.service.js'),
                import('../services/palette.service.js'),
                import('../services/external-metadata.service.js')
            ]).then(([ { LyricsSyncService }, { PaletteService }, { ExternalMetadataService } ]) => {
                for (const track of newTracks) {
                    // Fetch Palette
                    if (track.coverUrl) {
                        PaletteService.extractAndSaveTrack(track.id, track.coverUrl).catch(console.error);
                    }
                    
                    // Fetch Audio (Always Full Song)
                    ExternalMetadataService.fetchAudio(track.title, artistName, track.duration, undefined, { preview: false, bypassCache: true })
                        .then(async (audioResult) => {
                            if (audioResult) {
                                const isPreview = audioResult.url && (audioResult.url.includes('itunes.apple.com') || audioResult.url.includes('audio-ssl'));
                                const newAudioUrl = (!isPreview && audioResult.url) ? audioResult.url : (audioResult.watchUrl || audioResult.url);
                                if (newAudioUrl && !newAudioUrl.includes('audio-ssl')) {
                                    await prisma.track.update({
                                        where: { id: track.id },
                                        data: { 
                                            audioUrl: newAudioUrl,
                                            duration: audioResult.duration || track.duration
                                        }
                                    }).catch(console.error);
                                }
                            }
                        })
                        .catch(err => console.warn(`[AudioSync] Failed for track "${track.title}":`, err.message));

                    // Fetch Lyrics and Detect language
                    LyricsSyncService.detectSongLanguage(track.title, artistName, track.lyrics || undefined)
                        .then(async songLang => {
                            // Update database language
                            await prisma.track.update({
                                where: { id: track.id },
                                data: { language: songLang }
                            }).catch(console.error);

                            const synced = await LyricsSyncService.getSyncedLyrics(track.title, artistName, track.audioUrl, track.lyrics || undefined, track.duration);
                            if (synced && synced.syncedTokens && synced.syncedTokens.length > 0) {
                                await prisma.track.update({
                                    where: { id: track.id },
                                    data: {
                                        synced_lyrics: synced.syncedTokens as any,
                                        raw_lrc: synced.rawLrc || null,
                                    }
                                }).catch(console.error);
                            }
                        })
                        .catch(err => console.warn(`[LyricsSync] Failed for Apple Music track "${track.title}":`, err.message));
                }
            }).catch(console.error);

            return reply.send({ message: "Album successfully imported!", albumId: album.id });

        } catch (error: any) {
            console.error("Apple Music Import Error:", error);
            return reply.status(500).send({ message: "An error occurred while importing the album." });
        }
    });


    // List all albums for administration (includes empty albums)
    server.get('/admin', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, async (_req: FastifyRequest, reply: FastifyReply) => {
        const albums = await prisma.album.findMany({
            include: { artist: true },
            orderBy: { title: 'asc' }
        });
        return albums;
    });

    // Contextual recommendations for album (more by artist, related albums, same vibe)
    server.get('/:id/related', {
        preHandler: [server.authenticate],
        config: {
            rateLimit: {
                max: 60,
                timeWindow: '1 minute'
            }
        }
    }, async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = req.params;
        const userId = (req.user as any)?.id;
        const { RecommendationsService } = await import('../services/recommendations.service.js');
        const data = await RecommendationsService.getContextRecommendations(userId, { type: 'album', id });
        return reply.send(data);
    });

    server.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = req.params;
        const decodedId = decodeURIComponent(id).trim();

        // 0. Virtual Album Resolution (YouTube Music database MPREb_...)
        if (decodedId.startsWith('yt-album-') || decodedId.startsWith('MPREb_') || decodedId.startsWith('OLAK5uy_')) {
            const browseId = decodedId.replace(/^yt-album-/, '');
            try {
                const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                const ytAlbum = await ExternalMetadataService.browseYoutubeMusicAlbum(browseId);
                if (ytAlbum) {
                    return ytAlbum;
                }
            } catch (err: any) {
                console.warn(`[AlbumRoute] Failed to resolve YouTube Music album ${browseId}:`, err.message);
            }
        }

        // 1. Virtual Album Resolution (iTunes/Apple Music collection)
        if (decodedId.startsWith('itunes-album-') || decodedId.startsWith('itunes-') || decodedId.startsWith('sp-album-')) {
            const collectionId = decodedId.replace(/^itunes-album-/, '').replace(/^itunes-/, '').replace(/^sp-album-/, '');
            try {
                const { default: axios } = await import('axios');
                let itunesRes = await axios.get(`https://itunes.apple.com/lookup`, {
                    params: { id: collectionId, entity: 'song', country: 'IN' },
                    timeout: 5000
                }).catch(() => null);

                let results = itunesRes?.data?.results;
                if (!results || results.length === 0) {
                    const itunesUs = await axios.get(`https://itunes.apple.com/lookup`, {
                        params: { id: collectionId, entity: 'song', country: 'US' },
                        timeout: 5000
                    }).catch(() => null);
                    results = itunesUs?.data?.results;
                }

                if (results && results.length > 0) {
                    const collection = results[0];
                    const songs = results.slice(1);
                    const artwork = collection.artworkUrl100 ? collection.artworkUrl100.replace('100x100bb', '1000x1000bb') : '';
                    const artistName = collection.artistName || 'Unknown Artist';

                    let dbArtist = await prisma.artist.findFirst({
                        where: { name: { equals: artistName, mode: 'insensitive' } }
                    }).catch(() => null);

                    const localTracks = dbArtist ? await prisma.track.findMany({
                        where: {
                            artistId: dbArtist.id,
                            deletedAt: null,
                            audioUrl: { not: '' }
                        },
                        include: { artist: true, album: true }
                    }).catch(() => []) : [];
                    const localTrackMap = new Map(localTracks.map(t => [t.title.toLowerCase().trim(), t]));

                    const tracks = songs.map((t: any, idx: number) => {
                        const cleanTitle = (t.trackName || '').trim();
                        const localMatch = localTrackMap.get(cleanTitle.toLowerCase());
                        if (localMatch) {
                            return {
                                ...localMatch,
                                trackNumber: t.trackNumber || (idx + 1),
                                album: {
                                    id: `itunes-album-${collectionId}`,
                                    title: collection.collectionName,
                                    coverUrl: artwork
                                }
                            };
                        }

                        return {
                            id: `itunes-${t.trackId}`,
                            title: cleanTitle || `Track ${idx + 1}`,
                            duration: t.trackTimeMillis ? Math.floor(t.trackTimeMillis / 1000) : 180,
                            trackNumber: t.trackNumber || (idx + 1),
                            coverUrl: artwork,
                            audioUrl: `itunes:${t.trackId}`,
                            artistId: dbArtist?.id || `itunes-artist-${collection.artistId}`,
                            artist: {
                                id: dbArtist?.id || `itunes-artist-${collection.artistId}`,
                                name: artistName,
                                imageUrl: dbArtist?.imageUrl || artwork
                            },
                            album: {
                                id: `itunes-album-${collectionId}`,
                                title: collection.collectionName,
                                coverUrl: artwork
                            },
                            genre: t.primaryGenreName || collection.primaryGenreName,
                            isVirtual: true,
                            streams: 0,
                            like_count: 0
                        };
                    });

                    return {
                        id: `itunes-album-${collectionId}`,
                        title: collection.collectionName,
                        coverUrl: artwork,
                        releaseDate: collection.releaseDate ? new Date(collection.releaseDate) : new Date(),
                        createdAt: collection.releaseDate ? new Date(collection.releaseDate) : new Date(),
                        genre: collection.primaryGenreName,
                        artist: {
                            id: dbArtist?.id || `itunes-artist-${collection.artistId}`,
                            name: artistName,
                            imageUrl: dbArtist?.imageUrl || artwork
                        },
                        tracks
                    };
                }
            } catch (err: any) {
                console.warn(`[AlbumRoute] Failed to resolve virtual iTunes album ${collectionId}:`, err.message);
            }
        }

        // 2. Find the target album in local database
        let album = await prisma.album.findUnique({
            where: { id: decodedId },
            include: { artist: true }
        }).catch(() => null);

        // Fallback: If not found by ID, search by title or query iTunes
        if (!album) {
            try {
                const { default: axios } = await import('axios');
                const searchRes = await axios.get(`https://itunes.apple.com/search`, {
                    params: { term: decodedId, media: 'music', entity: 'album', limit: 1 },
                    timeout: 4000
                }).catch(() => null);

                if (searchRes?.data?.results?.length > 0) {
                    const matchedCol = searchRes.data.results[0];
                    return (server as any).inject({
                        method: 'GET',
                        url: `/api/albums/itunes-album-${matchedCol.collectionId}`,
                        headers: req.headers
                    }).then((r: any) => JSON.parse(r.body));
                }
            } catch {}
            return reply.status(404).send({ message: 'Album not found' });
        }

        // Find ALL sibling albums with the same title (handles fragmented batch imports)
        const siblingAlbums = await prisma.album.findMany({
            where: {
                title: album.title,
                artistId: album.artistId
            },
            select: { id: true }
        });
        const siblingIds = siblingAlbums.map((a: any) => a.id);

        // Aggregate all tracks from all sibling albums
        const allTracks: any[] = await prisma.track.findMany({
            where: {
                albumId: { in: siblingIds },
                deletedAt: null,
                audioUrl: { not: '' },
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

        // 3. Enrich partial album with full external tracklist if album has < 5 tracks
        if (allTracks.length < 5 && !album.title.toLowerCase().includes('single')) {
            try {
                const { default: axios } = await import('axios');
                const searchQuery = `${album.title} ${album.artist?.name || ''}`.trim();
                const itunesSearch = await axios.get(`https://itunes.apple.com/search`, {
                    params: { term: searchQuery, media: 'music', entity: 'album', limit: 3, country: 'IN' },
                    timeout: 4000
                }).catch(() => null);

                if (itunesSearch?.data?.results?.length > 0) {
                    const match = itunesSearch.data.results.find((col: any) => 
                        col.collectionName.toLowerCase().includes(album.title.toLowerCase()) ||
                        album.title.toLowerCase().includes(col.collectionName.toLowerCase())
                    ) || itunesSearch.data.results[0];

                    if (match && match.collectionId) {
                        const songRes = await axios.get(`https://itunes.apple.com/lookup`, {
                            params: { id: match.collectionId, entity: 'song', country: 'IN' },
                            timeout: 4000
                        }).catch(() => null);

                        if (songRes?.data?.results?.length > 1) {
                            const songs = songRes.data.results.slice(1);
                            const existingTitles = new Set(allTracks.map(t => t.title.toLowerCase().trim()));
                            const artwork = match.artworkUrl100 ? match.artworkUrl100.replace('100x100bb', '600x600bb') : album.coverUrl;

                            for (const s of songs) {
                                const cleanSongTitle = (s.trackName || '').trim();
                                if (cleanSongTitle && !existingTitles.has(cleanSongTitle.toLowerCase())) {
                                    existingTitles.add(cleanSongTitle.toLowerCase());
                                    allTracks.push({
                                        id: `itunes-${s.trackId}`,
                                        title: cleanSongTitle,
                                        duration: s.trackTimeMillis ? Math.floor(s.trackTimeMillis / 1000) : 180,
                                        trackNumber: s.trackNumber || (allTracks.length + 1),
                                        coverUrl: artwork,
                                        audioUrl: `itunes:${s.trackId}`,
                                        artistId: album.artistId,
                                        artist: album.artist,
                                        album: { id: album.id, title: album.title, coverUrl: artwork },
                                        isVirtual: true,
                                        streams: 0,
                                        like_count: 0
                                    });
                                }
                            }
                            allTracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
                        }
                    }
                }
            } catch (enrichErr: any) {
                console.warn(`[AlbumRoute] Could not enrich tracklist for "${album.title}":`, enrichErr.message);
            }
        }

        return {
            ...album,
            tracks: allTracks
        };
    });

    // List all albums (for library/browse pages)
    server.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
        // Return distinct albums by title (deduplicated)
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
        const unique: any[] = albums.filter((a: any) => {
            const lowerTitle = a.title.trim().toLowerCase();
            if (seen.has(lowerTitle)) return false;
            seen.add(lowerTitle);
            return true;
        });

        // Curated iconic albums to guarantee a rich catalog
        const ICONIC_ALBUMS = [
            { id: 'itunes-album-1712470763', title: 'Leo (Original Motion Picture Soundtrack)', artist: { name: 'Anirudh Ravichander' }, coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/37/2c/6d/372c6d4a-5f33-1498-f2b7-a859c258d41a/8903431976077_cover.jpg/600x600bb.jpg' },
            { id: 'itunes-album-1700140224', title: 'Jailer (Original Motion Picture Soundtrack)', artist: { name: 'Anirudh Ravichander' }, coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/4a/1f/ee/4a1feeef-bb66-41e9-46be-7fa9ea4342a3/8903431964395_cover.jpg/600x600bb.jpg' },
            { id: 'itunes-album-1624147779', title: 'Vikram (Original Motion Picture Soundtrack)', artist: { name: 'Anirudh Ravichander' }, coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/a4/c8/f5/a4c8f52d-ee68-52cb-7dbf-9b2447d25686/8903431911467_cover.jpg/600x600bb.jpg' },
            { id: 'itunes-album-1644158428', title: 'Ponniyin Selvan Part-1 (Tamil)', artist: { name: 'A. R. Rahman' }, coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/d3/18/84/d31884ba-1111-6675-d1ce-2f5a54b38d38/196589433604.jpg/600x600bb.jpg' },
            { id: 'itunes-album-1503144889', title: 'Master (Original Motion Picture Soundtrack)', artist: { name: 'Anirudh Ravichander' }, coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/7c/4f/2f/7c4f2fa1-2be0-2d83-49fa-e3d1ae989ffb/8902894358897_cover.jpg/600x600bb.jpg' },
            { id: 'itunes-album-1639352994', title: 'Thiruchitrambalam (Original Motion Picture Soundtrack)', artist: { name: 'Anirudh Ravichander' }, coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/8b/6e/c3/8b6ec34d-b6a9-83bc-22ea-e2fb9547d7c6/8903431922715_cover.jpg/600x600bb.jpg' }
        ];

        for (const item of ICONIC_ALBUMS) {
            const lower = item.title.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                unique.push({
                    ...item,
                    createdAt: new Date(),
                    releaseDate: new Date(),
                    isVirtual: true
                });
            }
        }

        return unique;
    });

    // Create a new album manually
    server.post('/', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, async (req: FastifyRequest<{ Body: { title: string, coverUrl?: string, artistId?: string, artistName?: string, releaseDate?: string, trackIds?: string[] } }>, reply: FastifyReply) => {
        try {
            const { title, coverUrl, artistId, artistName, releaseDate, trackIds } = req.body;
            if (!title || (!artistId && !artistName)) {
                return reply.status(400).send({ message: "Title and either artistId or artistName are required." });
            }

            let finalArtistId = artistId;
            if (!finalArtistId && artistName) {
                const artist = await prisma.artist.upsert({
                    where: { name: artistName },
                    update: {},
                    create: { name: artistName }
                });
                finalArtistId = artist.id;
            }

            let finalCoverUrl = coverUrl ? await uploadUrlToCloudinary(coverUrl, 'zenify/albums') : '';

            // If no coverUrl provided, automatically choose the song artwork from selected tracks
            if (!finalCoverUrl && trackIds && trackIds.length > 0) {
                const firstTrackWithCover = await prisma.track.findFirst({
                    where: { 
                        id: { in: trackIds }, 
                        coverUrl: { not: null } 
                    },
                    select: { coverUrl: true }
                });
                if (firstTrackWithCover?.coverUrl && firstTrackWithCover.coverUrl.trim().length > 0) {
                    finalCoverUrl = firstTrackWithCover.coverUrl;
                    console.log(`[AlbumCreation] Inherited album cover art from track: ${finalCoverUrl}`);
                }
            }

            const album = await prisma.album.create({
                data: {
                    title,
                    coverUrl: finalCoverUrl || '',
                    artistId: finalArtistId!,
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

            // Assign tracks to this album
            if (trackIds && trackIds.length > 0) {
                await prisma.track.updateMany({
                    where: { id: { in: trackIds } },
                    data: { 
                        albumId: album.id,
                        ...(album.coverUrl ? { coverUrl: album.coverUrl } : {})
                    }
                });
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

            // Delete cover from Cloudinary
            if (album.coverUrl) {
                await deleteFromCloudinary(album.coverUrl);
            }

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

            await clearAlbumCaches();

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
            
            let finalCoverUrl = undefined;
            if (coverUrl !== undefined && coverUrl !== album.coverUrl) {
                finalCoverUrl = coverUrl ? await uploadUrlToCloudinary(coverUrl, 'zenify/albums') : null;
                updateData.coverUrl = finalCoverUrl;
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

            // Cleanup old cover if replaced
            if (coverUrl !== undefined && album.coverUrl && album.coverUrl !== finalCoverUrl) {
                await deleteFromCloudinary(album.coverUrl);
            }

            if (genre) {
                await prisma.track.updateMany({
                    where: { albumId: { in: siblingIds } },
                    data: { genre }
                });
            }

            await clearAlbumCaches();

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

            await clearAlbumCaches();

            return reply.status(200).send({ message: "Albums merged successfully" });
        } catch (err: any) {
            console.error("Album Merge Error:", err);
            return reply.status(500).send({ message: "Failed to merge albums" });
        }
    });
}
