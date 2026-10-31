import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { uploadUrlToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';
import { invalidateCache } from '../utils/cache';
import { DeduplicationService } from '../services/deduplication.service.js';
import { cleanArtistNames } from '../utils/artist.js';
import { CleanCdnAudioService } from '../services/clean-cdn-audio.service.js';

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

            // Insert tracks strictly belonging to this album release
            for (const t of tracksData) {
                const trackDuration = t.trackTimeMillis ? Math.floor(t.trackTimeMillis / 1000) : 180;
                const existingInThisAlbum = await prisma.track.findFirst({
                    where: {
                        albumId: album.id,
                        title: { equals: t.trackName, mode: 'insensitive' }
                    }
                });

                if (existingInThisAlbum) {
                    await prisma.track.update({
                        where: { id: existingInThisAlbum.id },
                        data: {
                            trackNumber: t.trackNumber || existingInThisAlbum.trackNumber || 1,
                            coverUrl: existingInThisAlbum.coverUrl || cloudinaryCover || '',
                        }
                    }).catch(() => {});
                } else {
                    await prisma.track.create({
                        data: {
                            title: t.trackName,
                            artistId: artist.id,
                            albumId: album.id,
                            coverUrl: cloudinaryCover || '',
                            audioUrl: `/api/utils/stream-youtube?url=${encodeURIComponent(`${artist.name} - ${t.trackName}`)}`,
                            duration: trackDuration,
                            trackNumber: t.trackNumber || 1,
                            genre: t.primaryGenreName || albumData.primaryGenreName
                        }
                    });
                }
            }

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
                    
                    // Fetch Audio if not already a direct JioSaavn 320kbps CDN stream
                    if (!track.audioUrl || !track.audioUrl.includes('saavncdn.com')) {
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
                    }

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

        // 0.5. Virtual Album Resolution (JioSaavn regional multi-language album)
        if (decodedId.startsWith('saavn-album-') || decodedId.startsWith('sp-album-') || decodedId.startsWith('saavn-')) {
            const saavnAlbumId = decodedId.replace(/^(saavn|sp)-album-/, '').replace(/^saavn-/, '');
            try {
                const { default: axios } = await import('axios');
                const res = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'content.getAlbumDetails',
                        _format: 'json',
                        albumid: saavnAlbumId
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 4500
                }).catch(() => null);

                if (res?.data && (res.data.title || res.data.name)) {
                    const albData = res.data;
                    const albTitle = albData.title || albData.name;
                    let artwork = albData.image || '';
                    artwork = artwork.replace('150x150', '500x500').replace('50x50', '500x500');
                    const artistName = albData.primary_artists || 'Various Artists';
                    const cleanMainArtist = cleanArtistNames(artistName);

                    const songsList = albData.list || albData.songs || [];
                    const tracks = songsList.map((s: any, idx: number) => {
                        const cleanT = (s.song || s.title || `Track ${idx + 1}`).trim();
                        const rawSingers = s.singers || s.primary_artists || s.more_info?.singers;
                        const rawMusic = s.music || s.more_info?.music;
                        const trackArtist = cleanArtistNames(rawSingers, rawMusic || cleanMainArtist);
                        const dur = parseInt(s.duration || s.more_info?.duration, 10) || 180;
                        let songArt = s.image || artwork;
                        songArt = songArt.replace('150x150', '500x500').replace('50x50', '500x500');

                        const encMediaUrl = s.encrypted_media_url || s.more_info?.encrypted_media_url;
                        let directAudioUrl = '';
                        if (encMediaUrl) {
                            directAudioUrl = CleanCdnAudioService.decryptSaavnMediaUrl(encMediaUrl, '320') || CleanCdnAudioService.decryptSaavnMediaUrl(encMediaUrl, '160') || '';
                        }
                        const finalAudioUrl = directAudioUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(`${trackArtist} - ${cleanT}`)}&title=${encodeURIComponent(cleanT)}&artist=${encodeURIComponent(trackArtist)}&album=${encodeURIComponent(albTitle)}`;

                        return {
                            id: `saavn-${s.id}`,
                            title: cleanT,
                            duration: dur,
                            trackNumber: idx + 1,
                            coverUrl: songArt,
                            audioUrl: finalAudioUrl,
                            artistId: `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                            artist: {
                                id: `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                                name: trackArtist,
                                imageUrl: songArt
                            },
                            album: {
                                id: decodedId,
                                title: albTitle,
                                coverUrl: artwork
                            },
                            genre: albData.language ? `${albData.language.charAt(0).toUpperCase() + albData.language.slice(1)} Soundtrack` : 'Soundtrack',
                            isVirtual: true,
                            streams: 0,
                            like_count: 0
                        };
                    });

                    return {
                        id: decodedId,
                        title: albTitle,
                        coverUrl: artwork,
                        releaseDate: albData.release_date ? new Date(albData.release_date) : (albData.year ? new Date(`${albData.year}-01-01`) : new Date()),
                        createdAt: albData.release_date ? new Date(albData.release_date) : new Date(),
                        genre: albData.language ? `${albData.language.charAt(0).toUpperCase() + albData.language.slice(1)} Soundtrack` : 'Soundtrack',
                        artist: {
                            id: `artist-${encodeURIComponent(cleanMainArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                            name: cleanMainArtist,
                            imageUrl: artwork
                        },
                        tracks
                    };
                }

                // Fallback: If content.getAlbumDetails did not match, check song.getDetails (single track album)
                const songRes = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'song.getDetails',
                        _format: 'json',
                        pids: saavnAlbumId
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 4500
                }).catch(() => null);

                const songObj = songRes?.data?.[saavnAlbumId] || (songRes?.data && typeof songRes.data === 'object' && Object.values(songRes.data)[0]);
                if (songObj && (songObj.song || songObj.title)) {
                    const songTitle = (songObj.song || songObj.title).trim();
                    const albTitle = (songObj.album && songObj.album !== 'undefined' ? songObj.album : songTitle).trim();
                    let artwork = songObj.image || '';
                    artwork = artwork.replace('150x150', '500x500').replace('50x50', '500x500');
                    const rawSingers = songObj.singers || songObj.primary_artists || songObj.more_info?.singers;
                    const rawMusic = songObj.music || songObj.more_info?.music;
                    const trackArtist = cleanArtistNames(rawSingers, rawMusic || 'Various Artists');
                    const dur = parseInt(songObj.duration || songObj.more_info?.duration, 10) || 180;

                    const encMediaUrl = songObj.encrypted_media_url || songObj.more_info?.encrypted_media_url;
                    let directAudioUrl = '';
                    if (encMediaUrl) {
                        directAudioUrl = CleanCdnAudioService.decryptSaavnMediaUrl(encMediaUrl, '320') || CleanCdnAudioService.decryptSaavnMediaUrl(encMediaUrl, '160') || '';
                    }
                    const finalAudioUrl = directAudioUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(`${trackArtist} - ${songTitle}`)}&title=${encodeURIComponent(songTitle)}&artist=${encodeURIComponent(trackArtist)}&album=${encodeURIComponent(albTitle)}`;

                    const relDate = songObj.release_date ? new Date(songObj.release_date) : (songObj.year ? new Date(`${songObj.year}-01-01`) : new Date());

                    return {
                        id: decodedId,
                        title: albTitle,
                        coverUrl: artwork,
                        releaseDate: relDate,
                        createdAt: relDate,
                        genre: songObj.language ? `${songObj.language.charAt(0).toUpperCase() + songObj.language.slice(1)} Single` : 'Single',
                        artist: {
                            id: `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                            name: trackArtist,
                            imageUrl: artwork
                        },
                        tracks: [{
                            id: `saavn-${songObj.id || saavnAlbumId}`,
                            title: songTitle,
                            duration: dur,
                            trackNumber: 1,
                            coverUrl: artwork,
                            audioUrl: finalAudioUrl,
                            artistId: `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                            artist: {
                                id: `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                                name: trackArtist,
                                imageUrl: artwork
                            },
                            album: {
                                id: decodedId,
                                title: albTitle,
                                coverUrl: artwork
                            },
                            genre: songObj.language ? `${songObj.language.charAt(0).toUpperCase() + songObj.language.slice(1)} Single` : 'Single',
                            isVirtual: true,
                            streams: 0,
                            like_count: 0
                        }]
                    };
                }
            } catch (err: any) {
                console.warn(`[AlbumRoute] Failed to resolve JioSaavn album ${saavnAlbumId}:`, err.message);
            }
        }

        // 1. Virtual Album Resolution (iTunes/Apple Music collection)
        if (/^\d+$/.test(decodedId) || decodedId.startsWith('itunes-album-') || decodedId.startsWith('itunes-') || decodedId.startsWith('sp-album-')) {
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
                    const cleanMainArtist = cleanArtistNames(artistName);

                    // 1.1 Seamless Redirect: Look up this album in JioSaavn catalog first for high-fidelity 320kbps full songs
                    try {
                        const cleanAlbName = (collection.collectionName || '').replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
                        const saavnQuery = `${cleanAlbName} ${cleanMainArtist}`.trim();
                        const saavnSearchRes = await axios.get('https://www.jiosaavn.com/api.php', {
                            params: {
                                __call: 'search.getAlbumResults',
                                q: saavnQuery,
                                _format: 'json',
                                _marker: '0',
                                api_version: '4',
                                ctx: 'web6dot0',
                                n: 5,
                                p: 1
                            },
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                            timeout: 3500
                        }).catch(() => null);

                        const candidates = saavnSearchRes?.data?.results || [];
                        const matchedSaavnAlbum = candidates.find((cand: any) => {
                            const candTitle = (cand.title || cand.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                            const targetTitle = cleanAlbName.toLowerCase().replace(/[^a-z0-9]/g, '');
                            return candTitle.includes(targetTitle) || targetTitle.includes(candTitle);
                        }) || candidates[0];

                        if (matchedSaavnAlbum?.id) {
                            const albDetRes = await axios.get('https://www.jiosaavn.com/api.php', {
                                params: {
                                    __call: 'content.getAlbumDetails',
                                    _format: 'json',
                                    albumid: matchedSaavnAlbum.id
                                },
                                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                                timeout: 4500
                            }).catch(() => null);

                            if (albDetRes?.data && (albDetRes.data.list || albDetRes.data.songs)) {
                                const albData = albDetRes.data;
                                const albTitle = albData.title || albData.name || collection.collectionName;
                                let albCover = albData.image || artwork;
                                albCover = albCover.replace('150x150', '500x500').replace('50x50', '500x500');
                                const songsList = albData.list || albData.songs || [];

                                const saavnTracks = songsList.map((s: any, idx: number) => {
                                    const cleanT = (s.song || s.title || `Track ${idx + 1}`).trim();
                                    const trackArtist = cleanArtistNames(s.singers || s.primary_artists, cleanMainArtist);
                                    const dur = parseInt(s.duration || s.more_info?.duration, 10) || 180;
                                    let songArt = s.image || albCover;
                                    songArt = songArt.replace('150x150', '500x500').replace('50x50', '500x500');

                                    const encMediaUrl = s.encrypted_media_url || s.more_info?.encrypted_media_url;
                                    let directAudioUrl = '';
                                    if (encMediaUrl) {
                                        directAudioUrl = CleanCdnAudioService.decryptSaavnMediaUrl(encMediaUrl, '320') || CleanCdnAudioService.decryptSaavnMediaUrl(encMediaUrl, '160') || '';
                                    }
                                    const finalAudioUrl = directAudioUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(`${trackArtist} - ${cleanT}`)}&title=${encodeURIComponent(cleanT)}&artist=${encodeURIComponent(trackArtist)}&album=${encodeURIComponent(albTitle)}&trackId=saavn-${s.id}`;

                                    return {
                                        id: `saavn-${s.id}`,
                                        title: cleanT,
                                        duration: dur,
                                        trackNumber: idx + 1,
                                        coverUrl: songArt,
                                        audioUrl: finalAudioUrl,
                                        artistId: `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                                        artist: {
                                            id: `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                                            name: trackArtist,
                                            imageUrl: songArt
                                        },
                                        album: {
                                            id: decodedId,
                                            title: albTitle,
                                            coverUrl: albCover
                                        },
                                        genre: albData.language ? `${albData.language.charAt(0).toUpperCase() + albData.language.slice(1)} Soundtrack` : (collection.primaryGenreName || 'Soundtrack'),
                                        isVirtual: true,
                                        streams: 0,
                                        like_count: 0
                                    };
                                });

                                if (saavnTracks.length > 0) {
                                    console.log(`[AlbumRoute] Seamlessly redirected itunes album ${collectionId} to JioSaavn album ${matchedSaavnAlbum.id} ("${albTitle}") with ${saavnTracks.length} high-fidelity tracks!`);
                                    return {
                                        id: decodedId,
                                        title: albTitle,
                                        coverUrl: albCover,
                                        releaseDate: albData.release_date ? new Date(albData.release_date) : (albData.year ? new Date(`${albData.year}-01-01`) : new Date()),
                                        createdAt: albData.release_date ? new Date(albData.release_date) : new Date(),
                                        genre: albData.language ? `${albData.language.charAt(0).toUpperCase() + albData.language.slice(1)} Soundtrack` : (collection.primaryGenreName || 'Soundtrack'),
                                        artist: {
                                            id: `artist-${encodeURIComponent(cleanMainArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                                            name: cleanMainArtist,
                                            imageUrl: albCover
                                        },
                                        tracks: saavnTracks
                                    };
                                }
                            }
                        }
                    } catch (saavnRedirectErr: any) {
                        console.warn(`[AlbumRoute] Failed to redirect itunes album to JioSaavn: ${saavnRedirectErr.message}`);
                    }

                    let dbArtist = await prisma.artist.findFirst({
                        where: { name: { equals: artistName, mode: 'insensitive' } }
                    }).catch(() => null);

                    // Match local tracks strictly belonging to this release ID
                    const localTracks = await prisma.track.findMany({
                        where: {
                            deletedAt: null,
                            audioUrl: { not: '' },
                            OR: [
                                { albumId: `itunes-album-${collectionId}` },
                                { albumId: collectionId }
                            ]
                        },
                        include: { artist: true, album: true }
                    }).catch(() => []) as any[];
                    const localTrackMap = new Map<string, any>();
                    for (const t of localTracks) localTrackMap.set(t.title.toLowerCase().trim(), t);

                    const tracks = songs.map((t: any, idx: number) => {
                        const cleanTitle = (t.trackName || '').trim();
                        const localMatch = localTrackMap.get(cleanTitle.toLowerCase());
                        if (localMatch && localMatch.audioUrl && !localMatch.audioUrl.includes('audio-ssl') && !localMatch.audioUrl.includes('mzstatic') && !localMatch.audioUrl.includes('itunes.apple.com')) {
                            return {
                                ...localMatch,
                                trackNumber: t.trackNumber || (idx + 1),
                                album: {
                                    id: `itunes-album-${collectionId}`,
                                    title: collection.collectionName,
                                    coverUrl: artwork
                                },
                                isLocalAvailable: true,
                                isVirtual: false,
                                previewUrl: t.previewUrl || undefined
                            };
                        }

                        const trackArtist = cleanArtistNames(t.artistName || artistName);
                        const instantAudioUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(`${trackArtist} - ${cleanTitle}`)}&title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(trackArtist)}&album=${encodeURIComponent(collection.collectionName)}&trackId=itunes-${t.trackId}`;

                        return {
                            id: `itunes-${t.trackId}`,
                            title: cleanTitle || `Track ${idx + 1}`,
                            duration: t.trackTimeMillis ? Math.floor(t.trackTimeMillis / 1000) : 180,
                            trackNumber: t.trackNumber || (idx + 1),
                            coverUrl: artwork,
                            audioUrl: instantAudioUrl,
                            artistId: dbArtist?.id || `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                            artist: {
                                id: dbArtist?.id || `artist-${encodeURIComponent(trackArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                                name: trackArtist,
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
                            id: dbArtist?.id || `artist-${encodeURIComponent(cleanMainArtist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
                            name: cleanMainArtist,
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

        // Fallback: If not found by ID, search by title with JioSaavn as primary
        if (!album) {
            try {
                const { default: axios } = await import('axios');
                const movieMatch = decodedId.match(/[\(\[]\s*From\s+["'“]?([^"'”\)\]]+)["'”]?\s*[\)\]]/i);
                const cleanQuery = movieMatch ? movieMatch[1].trim() : (decodedId.replace(/[\(\[].*?[\)\]]/g, '').trim() || decodedId);

                // 1. Primary: JioSaavn Album Search
                const saavnSearch = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'search.getAlbumResults',
                        q: cleanQuery,
                        _format: 'json',
                        _marker: '0',
                        api_version: '4',
                        ctx: 'web6dot0',
                        p: 1,
                        n: 8
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 4500
                }).catch(() => null);

                const saavnCandidates = saavnSearch?.data?.results || [];
                // Sort candidates: prefer albums with more songs and title similarity
                const sortedSaavn = [...saavnCandidates].sort((a: any, b: any) => {
                    const countA = parseInt(a.more_info?.song_count || a.song_count || '1', 10);
                    const countB = parseInt(b.more_info?.song_count || b.song_count || '1', 10);
                    const titleA = (a.title || a.name || '').toLowerCase();
                    const titleB = (b.title || b.name || '').toLowerCase();
                    const target = cleanQuery.toLowerCase();
                    const exactA = titleA === target || titleA.startsWith(target) ? 100 : 0;
                    const exactB = titleB === target || titleB.startsWith(target) ? 100 : 0;
                    return (countB + exactB) - (countA + exactA);
                });

                const bestSaavnAlbum = sortedSaavn[0];
                const bestSaavnAlbumId = bestSaavnAlbum?.albumid || bestSaavnAlbum?.id;
                if (bestSaavnAlbumId) {
                    return (server as any).inject({
                        method: 'GET',
                        url: `/api/albums/saavn-album-${bestSaavnAlbumId}`,
                        headers: req.headers
                    }).then((r: any) => JSON.parse(r.body));
                }

                // 2. Secondary fallback: iTunes
                const searchRes = await axios.get(`https://itunes.apple.com/search`, {
                    params: { term: cleanQuery, media: 'music', entity: 'album', country: 'IN', limit: 10 },
                    timeout: 4500
                }).catch(() => null);

                if (searchRes?.data?.results?.length > 0) {
                    const results = searchRes.data.results;
                    const lowerQuery = cleanQuery.toLowerCase();
                    const wantsTelugu = lowerQuery.includes('telugu');
                    const wantsHindi = lowerQuery.includes('hindi');
                    const wantsTamil = lowerQuery.includes('tamil');

                    // Filter candidate avoiding wrong-language posters (e.g. Telugu on Tamil album)
                    let matchedCol = results[0];
                    for (const r of results) {
                        const rName = (r.collectionName || '').toLowerCase();
                        const isTelugu = rName.includes('telugu');
                        const isHindi = rName.includes('hindi');
                        const isTamil = rName.includes('tamil');

                        if (wantsTamil && isTelugu) continue;
                        if (wantsTamil && isHindi) continue;
                        if (wantsTelugu && isTamil) continue;
                        if (wantsTelugu && isHindi) continue;
                        if (!wantsTelugu && !wantsHindi && isTelugu) continue; // Default to original when not asking for dub
                        matchedCol = r;
                        break;
                    }

                    return (server as any).inject({
                        method: 'GET',
                        url: `/api/albums/itunes-album-${matchedCol.collectionId}`,
                        headers: req.headers
                    }).then((r: any) => JSON.parse(r.body));
                }
            } catch {}
            return reply.status(404).send({ message: 'Album not found' });
        }

        // Fetch tracks strictly for this specific album release ID
        const allTracks: any[] = await prisma.track.findMany({
            where: {
                albumId: album.id,
                deletedAt: null,
                audioUrl: { not: '' },
                OR: [
                    { releaseStatus: 'PUBLISHED' },
                    { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                ]
            },
            select: {
                id: true,
                title: true,
                coverUrl: true,
                audioUrl: true,
                duration: true,
                genre: true,
                streams: true,
                releaseStatus: true,
                createdAt: true,
                engagement_score: true,
                bpm: true,
                language: true,
                like_count: true,
                aura_color: true,
                aura_vibe: true,
                palette: true,
                artistId: true,
                albumId: true,
                trackNumber: true,
                featuredArtists: true,
                artist: { select: { id: true, name: true, imageUrl: true } },
                album: { select: { id: true, title: true, coverUrl: true, palette: true } }
            },
            orderBy: [
                { trackNumber: 'asc' },
                { createdAt: 'asc' }
            ]
        });

        // Background auto-enrichment: If the local album has 4 or fewer tracks and belongs to a movie/soundtrack,
        // seamlessly check JioSaavn to see if the full OST album has more songs available.
        if (allTracks.length <= 4 && album.title) {
            try {
                const { default: axios } = await import('axios');
                const movieMatch = album.title.match(/[\(\[]\s*From\s+["'“]?([^"'”\)\]]+)["'”]?\s*[\)\]]/i);
                const queryTitle = movieMatch ? movieMatch[1].trim() : album.title.replace(/[\(\[].*?[\)\]]/g, '').trim();

                const saavnSearch = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'search.getAlbumResults',
                        q: `${queryTitle} ${album.artist?.name || ''}`.trim(),
                        _format: 'json',
                        _marker: '0',
                        api_version: '4',
                        ctx: 'web6dot0',
                        p: 1,
                        n: 6
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 3500
                }).catch(() => null);

                const candidates = saavnSearch?.data?.results || [];
                const fullAlbumCandidate = candidates.find((c: any) => {
                    const songCount = parseInt(c.more_info?.song_count || c.song_count || '0', 10);
                    return songCount > allTracks.length;
                });

                const fullAlbumCandidateId = fullAlbumCandidate?.albumid || fullAlbumCandidate?.id;
                if (fullAlbumCandidateId) {
                    const fullAlbum = await (server as any).inject({
                        method: 'GET',
                        url: `/api/albums/saavn-album-${fullAlbumCandidateId}`,
                        headers: req.headers
                    }).then((r: any) => JSON.parse(r.body)).catch(() => null);

                    if (fullAlbum && fullAlbum.tracks && fullAlbum.tracks.length > allTracks.length) {
                        return {
                            ...fullAlbum,
                            id: album.id, // preserve requested album id for frontend route consistency
                        };
                    }
                }
            } catch (enrichErr: any) {
                console.warn('[AlbumRoute] Background JioSaavn full-album check error:', enrichErr.message);
            }
        }

        return {
            ...album,
            tracks: allTracks
        };
    });

    // List all albums (for library/browse pages) - each release is an independent entity
    server.get('/', async (req: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
        const limit = Math.min(parseInt(req.query?.limit || '60', 10), 100);
        const albums = await prisma.album.findMany({
            take: limit,
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

        return albums;
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
