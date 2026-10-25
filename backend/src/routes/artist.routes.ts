import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { ArtistController } from '../controllers/artist.controller';
import { cleanArtistNames, isFakeOrNumericArtistName } from '../utils/artist.js';

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
                    take: 50,
                    orderBy: { releaseDate: 'desc' },
                    include: {
                        _count: { select: { tracks: true } }
                    }
                }
            }
        }).catch(() => null);

        // 2. If not found by ID, try finding by Name (case-insensitive)
        let cleanName = decoded
            .replace(/^itunes-artist-/, '')
            .replace(/^itunes-/, '')
            .replace(/^artist-/, '')
            .replace(/^yt-artist-/, '')
            .replace(/^sp-artist-/, '')
            .replace(/^canonical-/, '')
            .replace(/-/g, ' ')
            .trim();

        // If cleanName is numeric or dummy iTunes artist string, resolve via Apple Music Lookup API
        if (isFakeOrNumericArtistName(cleanName)) {
            const numMatch = decoded.match(/\d+/) || cleanName.match(/\d+/);
            if (numMatch) {
                try {
                    const { default: axios } = await import('axios');
                    const itLookup = await axios.get(`https://itunes.apple.com/lookup?id=${numMatch[0]}&country=IN`, { timeout: 3500 }).catch(() => null);
                    const realArtistName = itLookup?.data?.results?.[0]?.artistName;
                    if (realArtistName && !isFakeOrNumericArtistName(realArtistName)) {
                        cleanName = realArtistName.trim();
                    }
                } catch {}
            }
        }

        if (!artist && cleanName.length > 0 && !isFakeOrNumericArtistName(cleanName)) {
            artist = await prisma.artist.findFirst({
                where: { 
                    OR: [
                        { name: { equals: cleanName, mode: 'insensitive' } },
                        { name: { equals: decoded, mode: 'insensitive' } }
                    ]
                },
                include: {
                    albums: {
                        take: 50,
                        orderBy: { releaseDate: 'desc' },
                        include: {
                            _count: { select: { tracks: true } }
                        }
                    }
                }
            }).catch(() => null);
        }

        if (isFakeOrNumericArtistName(cleanName) && !artist) {
            return null;
        }

        // 3. Pre-fetch Deezer metadata & candidate for real profile pic, banner & related artists
        let deezerArtistId: number | null = null;
        let deezerPic: string | null = null;
        let deezerCover: string | null = null;
        let wikiBio: string | null = null;
        let wikiBanner: string | null = null;
        let relatedArtists: any[] = [];

        try {
            const { default: axios } = await import('axios');
            const targetQuery = artist ? artist.name : cleanName;
            const normTarget = targetQuery.replace(/\s+/g, '').toLowerCase();

            // Parallel lookup: Deezer Artist Search & Wikipedia Summary
            const [dzRes, wikiRes] = await Promise.all([
                axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(targetQuery)}`, { timeout: 3500 }).catch(() => null),
                axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(targetQuery)}`, { 
                    headers: { 'User-Agent': 'ZenifyMusic/1.0' },
                    timeout: 3500 
                }).catch(() => null)
            ]);

            if (dzRes?.data?.data?.length > 0) {
                const candidates = (dzRes.data.data as any[]).filter((a: any) => {
                    const aNorm = (a.name || '').replace(/\s+/g, '').toLowerCase();
                    const pic = a.picture_big || a.picture_medium || '';
                    return (aNorm.includes(normTarget) || normTarget.includes(aNorm)) && pic && !pic.includes('artist//');
                });
                candidates.sort((a: any, b: any) => (b.nb_fan || 0) - (a.nb_fan || 0));
                const match = candidates[0] || (dzRes.data.data as any[]).find((a: any) => a.picture_big && !a.picture_big.includes('artist//'));
                if (match) {
                    deezerArtistId = match.id;
                    deezerPic = match.picture_xl || match.picture_big || match.picture_medium || null;
                    deezerCover = match.picture_xl || match.picture_big || null;
                }
            }

            if (wikiRes?.data) {
                if (wikiRes.data.extract && typeof wikiRes.data.extract === 'string') {
                    wikiBio = wikiRes.data.extract;
                }
                if (wikiRes.data.originalimage?.source) {
                    wikiBanner = wikiRes.data.originalimage.source;
                }
            }

            // Fetch Deezer Related Artists if deezerArtistId was resolved
            if (deezerArtistId) {
                const relRes = await axios.get(`https://api.deezer.com/artist/${deezerArtistId}/related`, { timeout: 3500 }).catch(() => null);
                if (relRes?.data?.data && Array.isArray(relRes.data.data)) {
                    relatedArtists = relRes.data.data.slice(0, 15).map((a: any) => {
                        const artPic = a.picture_xl || a.picture_big || a.picture_medium || '';
                        return {
                            id: `artist-${a.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                            name: a.name,
                            imageUrl: artPic,
                            coverUrl: artPic,
                            follower_count: a.nb_fan || 0,
                            isArtist: true,
                            type: 'artist'
                        };
                    });
                }
            }
        } catch {}

        // 4. If still not in DB, create new artist from Deezer, Wikipedia, canonical list, or AudioDB
        if (!artist && cleanName.length > 0 && !isFakeOrNumericArtistName(cleanName)) {
            const { CANONICAL_ARTISTS } = await import('../utils/artist.js');
            const canonical = CANONICAL_ARTISTS[cleanName.toLowerCase()];
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            const adbInfo = await ExternalMetadataService.fetchArtistFromAudioDB(cleanName).catch(() => null);

            const resolvedImage = deezerPic || canonical?.imageUrl || adbInfo?.imageUrl;
            const resolvedCover = wikiBanner || deezerCover || adbInfo?.coverUrl || resolvedImage;
            const resolvedBio = wikiBio || canonical?.bio || adbInfo?.bio;
            const capitalizedName = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            const newArtist = await prisma.artist.create({
                data: {
                    name: canonical?.name || capitalizedName,
                    bio: resolvedBio || `Listen to tracks by ${capitalizedName} on Zenify.`,
                    imageUrl: resolvedImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=18181b&color=e11d48&size=512`,
                    coverUrl: resolvedCover,
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : null,
                    follower_count: adbInfo?.followers || 500000
                },
                include: { albums: true }
            }).catch(() => null);

            if (newArtist) artist = newArtist;
        }

        if (!artist) return null;

        // Enrich artist bio / image / banner if missing or placeholder
        const hasBadCover = !artist.coverUrl || artist.coverUrl.trim() === '' || artist.coverUrl.includes('placeholder') || artist.coverUrl.includes('logo.png');
        const hasBadImage = !artist.imageUrl || artist.imageUrl.trim() === '' || artist.imageUrl.includes('ui-avatars.com') || artist.imageUrl.includes('placeholder') || artist.imageUrl.includes('logo.png');
        const hasBadBio = !artist.bio || artist.bio.startsWith('Listen to tracks') || artist.bio.length < 30;

        if (hasBadBio || hasBadImage || hasBadCover) {
            try {
                const { ArtistMetadataService } = await import('../services/artist-metadata.service.js');
                const visuals = await ArtistMetadataService.fetchArtistVisuals(artist.id, artist.name).catch(() => null);
                if (visuals) {
                    const updateData: any = {};
                    if (visuals.coverUrl && visuals.coverUrl !== artist.coverUrl) {
                        artist.coverUrl = visuals.coverUrl;
                        updateData.coverUrl = visuals.coverUrl;
                    }
                    if (visuals.imageUrl && visuals.imageUrl !== artist.imageUrl) {
                        artist.imageUrl = visuals.imageUrl;
                        updateData.imageUrl = visuals.imageUrl;
                    }
                    if (visuals.bio && (!artist.bio || artist.bio.length < 30)) {
                        artist.bio = visuals.bio;
                        updateData.bio = visuals.bio;
                    }
                    if (Object.keys(updateData).length > 0 && artist.id) {
                        prisma.artist.update({ where: { id: artist.id }, data: updateData }).catch(() => null);
                    }
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

        // Filter out duplicate or fake albums where album title equals a single track title and track count <= 1
        const validLocalAlbums = (artist.albums || []).filter((alb: any) => {
            const isSingleTrackNamedAlbum = topTracks.some(t => 
                t.title.trim().toLowerCase() === alb.title.trim().toLowerCase()
            );
            const count = alb._count?.tracks ?? alb.trackCount ?? 1;
            if (isSingleTrackNamedAlbum && count <= 1) {
                return false;
            }
            return true;
        });

        let finalAlbums = validLocalAlbums.map((alb: any) => ({
            ...alb,
            trackCount: alb._count?.tracks ?? alb.trackCount ?? 1,
            isSingle: (alb._count?.tracks ?? 1) <= 1 || alb.title.toLowerCase().includes('single')
        }));

        let artistPlaylists: any[] = [];


        // Helper to verify if an album/track is authentic to the artist
        const isAuthenticArtistRelease = (rawArtist: string, targetName: string): boolean => {
            const a = (rawArtist || '').toLowerCase().trim();
            const t = (targetName || '').toLowerCase().trim();
            if (!a || !t) return false;
            if (a === t || a.includes(t) || t.includes(a)) return true;
            const tWords = t.split(/\s+/).filter(w => w.length > 2);
            return tWords.length > 0 && tWords.every(w => a.includes(w));
        };

        const appearsOnAlbums: any[] = [];

        // Enrich with Artist's real Global Catalog (Top Songs, Discography Albums & Playlists from Apple Music)
        try {
            const { default: axios } = await import('axios');
            const { SystemSettingsService } = await import('../services/system-settings.service.js');
            const rapidApiKey = await SystemSettingsService.getSpotifyApiKey();

            // 1. Direct official iTunes Artist Search to get official Apple Music Artist ID
            let itunesArtistId: number | null = null;
            let appleMusicViews: any = null;
            try {
                const itArtistRes = await axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, entity: 'musicArtist', country: 'IN', limit: 5 },
                    timeout: 4000
                }).catch(() => null);
                const matchedArtist = itArtistRes?.data?.results?.find((a: any) => isAuthenticArtistRelease(a.artistName, artist.name));
                if (matchedArtist?.artistId) {
                    itunesArtistId = matchedArtist.artistId;
                }
            } catch {}

            // 2. Fetch Verified Apple Music Lookup (Official Songs & Albums directly from Apple Music)
            const [itunesLookupSongsRes, itunesLookupAlbumsRes, itunesInRes, itunesGlobalRes, itunesAlbumsInRes, itunesAlbumsGlobalRes, saavnAlbumsRes, spotifyPlaylistsRes] = await Promise.all([
                itunesArtistId ? axios.get(`https://itunes.apple.com/lookup`, {
                    params: { id: itunesArtistId, entity: 'song', limit: 50, country: 'IN' },
                    timeout: 4500
                }).catch(() => null) : Promise.resolve(null),
                itunesArtistId ? axios.get(`https://itunes.apple.com/lookup`, {
                    params: { id: itunesArtistId, entity: 'album', limit: 50, country: 'IN' },
                    timeout: 4500
                }).catch(() => null) : Promise.resolve(null),
                axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, media: 'music', entity: 'song', country: 'IN', limit: 50 },
                    timeout: 4500
                }).catch(() => null),
                axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, media: 'music', entity: 'song', limit: 30 },
                    timeout: 4500
                }).catch(() => null),
                axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, media: 'music', entity: 'album', country: 'IN', limit: 50 },
                    timeout: 4500
                }).catch(() => null),
                axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, media: 'music', entity: 'album', limit: 40 },
                    timeout: 4500
                }).catch(() => null),
                axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'search.getAlbumResults',
                        q: artist.name,
                        _format: 'json',
                        _marker: '0',
                        api_version: '4',
                        ctx: 'web6dot0',
                        n: 30
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 4500
                }).catch(() => null),
                rapidApiKey ? axios.get('https://spotify81.p.rapidapi.com/search', {
                    params: { q: artist.name, type: 'playlists', limit: 25 },
                    headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'spotify81.p.rapidapi.com' },
                    timeout: 5000
                }).catch(() => null) : Promise.resolve(null)
            ]);

            // Combine candidate songs strictly prioritizing verified Apple Music lookup
            const rawLookupTracks = (itunesLookupSongsRes?.data?.results || [])
                .filter((r: any) => r.wrapperType === 'track' && r.kind === 'song');

            const rawSearchTracks = [
                ...(itunesInRes?.data?.results || []),
                ...(itunesGlobalRes?.data?.results || [])
            ].filter((r: any) => (r.wrapperType === 'track' || !r.wrapperType) && (r.kind === 'song' || !r.kind));

            const allItunesSongs = [...rawLookupTracks, ...rawSearchTracks];

            if (allItunesSongs.length > 0) {
                const existingTitles = new Set(finalTopTracks.map(t => t.title.toLowerCase().trim()));
                const candidateTitles = allItunesSongs.map((r: any) => (r.trackName || '').trim()).filter(Boolean);
                const localTracks = await prisma.track.findMany({
                    where: {
                        deletedAt: null,
                        audioUrl: { not: '' },
                        OR: [
                            { artistId: artist.id },
                            { title: { in: candidateTitles, mode: 'insensitive' } }
                        ]
                    },
                    include: { artist: true }
                }).catch(() => []) as any[];
                const localTrackMap = new Map<string, any>();
                for (const t of localTracks) localTrackMap.set(t.title.toLowerCase().trim(), t);

                for (const item of allItunesSongs) {
                    // Strictly exclude music videos
                    if (item.kind && item.kind !== 'song') continue;

                    const cleanTitle = (item.trackName || '').trim();
                    if (!cleanTitle || cleanTitle.toLowerCase().includes('official music video') || cleanTitle.toLowerCase().includes('[music video]')) {
                        continue;
                    }

                    const match = isAuthenticArtistRelease(item.artistName, artist.name);
                    if (match && !existingTitles.has(cleanTitle.toLowerCase())) {
                        existingTitles.add(cleanTitle.toLowerCase());
                        const artwork = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                        const localMatch = localTrackMap.get(cleanTitle.toLowerCase());
                        const trackArtist = cleanArtistNames(item.artistName || artist.name);
                        const albumTitle = item.collectionName || 'Single';
                        const instantAudioUrl = (localMatch && localMatch.audioUrl && !localMatch.audioUrl.includes('audio-ssl') && !localMatch.audioUrl.includes('mzstatic') && !localMatch.audioUrl.includes('itunes.apple.com'))
                            ? localMatch.audioUrl
                            : `/api/utils/stream-youtube?url=${encodeURIComponent(`${trackArtist} - ${cleanTitle}`)}&title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(trackArtist)}&album=${encodeURIComponent(albumTitle)}&trackId=itunes-${item.trackId}`;

                        finalTopTracks.push({
                            id: localMatch ? localMatch.id : `itunes-${item.trackId}`,
                            title: cleanTitle,
                            duration: localMatch?.duration || Math.floor((item.trackTimeMillis || 180000) / 1000),
                            coverUrl: localMatch?.coverUrl || artwork,
                            audioUrl: instantAudioUrl,
                            artistId: artist.id,
                            artist: { id: artist.id, name: trackArtist, imageUrl: artist.imageUrl },
                            album: {
                                id: `itunes-album-${item.collectionId || 'single'}`,
                                title: albumTitle,
                                coverUrl: artwork
                            },
                            isVirtual: !localMatch,
                            isLocalAvailable: !!localMatch,
                            streams: localMatch?.streams || 0,
                            like_count: 0
                        } as any);
                    }
                }
            }

            // Combine and verify albums
            const rawLookupAlbums = (itunesLookupAlbumsRes?.data?.results || [])
                .filter((r: any) => r.wrapperType === 'collection');

            const rawSearchAlbums = [
                ...(itunesAlbumsInRes?.data?.results || []),
                ...(itunesAlbumsGlobalRes?.data?.results || [])
            ].filter((r: any) => r.wrapperType === 'collection' || r.collectionType === 'Album' || !r.wrapperType);

            const allItunesAlbums = [...rawLookupAlbums, ...rawSearchAlbums];
            const seenCollectionIds = new Set<string>(finalAlbums.map(a => a.id));
            const seenAlbumKeys = new Set<string>(finalAlbums.map(a => `${(a.title || '').toLowerCase().trim()}:::${a.id}`));

            for (const alb of allItunesAlbums) {
                const albTitle = (alb.collectionName || '').trim();
                const albArtist = alb.artistName || '';
                const colId = `itunes-album-${alb.collectionId}`;
                if (!albTitle || seenCollectionIds.has(colId)) continue;

                const albArt = alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                const count = alb.trackCount || 1;
                const isSingle = count <= 1 || albTitle.toLowerCase().includes('single');

                // Strict artist verification: Only albums where this artist is credited belong to this artist
                const isAuthentic = isAuthenticArtistRelease(albArtist, artist.name);

                if (isAuthentic) {
                    seenCollectionIds.add(colId);
                    finalAlbums.push({
                        id: colId,
                        title: albTitle,
                        artistName: albArtist,
                        coverUrl: albArt,
                        artistId: artist.id,
                        releaseDate: alb.releaseDate ? new Date(alb.releaseDate) : new Date(),
                        createdAt: alb.releaseDate ? new Date(alb.releaseDate) : new Date(),
                        trackCount: count,
                        genre: alb.primaryGenreName || 'Soundtrack',
                        isSingle,
                        isVirtual: true
                    } as any);
                } else if (
                    albTitle.toLowerCase().includes('remix') || 
                    albTitle.toLowerCase().includes(artist.name.toLowerCase()) || 
                    albArtist.toLowerCase().includes('ofro')
                ) {
                    // Genuine remix / collaboration release where artist is featured -> Appears On
                    seenCollectionIds.add(colId);
                    appearsOnAlbums.push({
                        id: colId,
                        title: albTitle,
                        artistName: albArtist,
                        coverUrl: albArt,
                        artistId: artist.id,
                        releaseDate: alb.releaseDate ? new Date(alb.releaseDate) : new Date(),
                        trackCount: count,
                        isSingle,
                        isVirtual: true
                    });
                }
            }

            // Merge regional multi-language albums from JioSaavn with STRICT artist verification
            const saavnAlbums = saavnAlbumsRes?.data?.results || [];
            for (const sa of saavnAlbums) {
                const saTitle = (sa.title || '').trim();
                const saId = `saavn-album-${sa.id}`;
                if (!saTitle || seenCollectionIds.has(saId)) continue;

                // Strict JioSaavn verification: target artist MUST be in subtitle, music, or artistMap
                const saArtistStr = [
                    sa.subtitle || '',
                    sa.music || '',
                    ...(sa.more_info?.artistMap?.primary_artists?.map((x: any) => x.name) || []),
                    ...(sa.more_info?.artistMap?.artists?.map((x: any) => x.name) || [])
                ].join(', ');

                if (!isAuthenticArtistRelease(saArtistStr, artist.name)) {
                    // Skip unrelated compilation albums (e.g. Anirudh Certified Bangers, Jakes Bejoy Top Hits)
                    continue;
                }
                
                const dedupKey = `${saTitle.toLowerCase()}:::${sa.language || ''}`;
                if (seenAlbumKeys.has(dedupKey)) continue;
                seenAlbumKeys.add(dedupKey);
                seenCollectionIds.add(saId);

                let saArt = sa.image || '';
                saArt = saArt.replace('150x150', '500x500').replace('50x50', '500x500');

                finalAlbums.push({
                    id: saId,
                    title: saTitle,
                    artistName: sa.subtitle || artist.name,
                    coverUrl: saArt,
                    artistId: artist.id,
                    releaseDate: sa.year ? new Date(`${sa.year}-01-01`) : new Date(),
                    createdAt: sa.year ? new Date(`${sa.year}-01-01`) : new Date(),
                    trackCount: parseInt(sa.more_info?.song_count || '1', 10) || 1,
                    genre: sa.language ? `${sa.language.charAt(0).toUpperCase() + sa.language.slice(1)} Soundtrack` : 'Soundtrack',
                    isSingle: (parseInt(sa.more_info?.song_count || '1', 10) <= 1),
                    isVirtual: true
                } as any);
            }

            // 1. Populate playlists from official Apple Music Essentials
            if (appleMusicViews && appleMusicViews['featured-playlists']?.data?.length > 0) {
                artistPlaylists = appleMusicViews['featured-playlists'].data.map((pl: any) => {
                    const rawArt = pl.attributes?.artwork?.url || '';
                    const art = rawArt ? rawArt.replace('{w}x{h}', '600x600').replace('{f}', 'jpg') : '';
                    return {
                        id: `am-playlist-${pl.id}`,
                        name: pl.attributes?.name || '',
                        title: pl.attributes?.name || '',
                        description: pl.attributes?.editorialNotes?.short || pl.attributes?.description?.standard || `Featuring ${artist.name}`,
                        coverUrl: art,
                        trackCount: pl.attributes?.trackCount || 25,
                        owner: pl.attributes?.curatorName || 'Apple Music',
                        isVirtual: true
                    };
                }).filter((p: any) => p && p.name && p.coverUrl);
            } else if (spotifyPlaylistsRes?.data?.playlists?.items) {
                artistPlaylists = spotifyPlaylistsRes.data.playlists.items
                    .map((p: any) => {
                        const pl = p.data || p;
                        const uri = pl.uri || '';
                        const playlistId = uri.replace('spotify:playlist:', '');
                        const name = pl.name || '';
                        const cover = pl.images?.items?.[0]?.sources?.[0]?.url || pl.images?.[0]?.url || '';
                        const total = pl.tracks?.total ?? pl.trackCount;
                        if (!playlistId || !name || !cover || cover.includes('placeholder')) return null;
                        // Strictly hide playlists with zero tracks
                        if (total !== undefined && total <= 0) return null;
                        return {
                            id: `sp-playlist-${playlistId}`,
                            name,
                            title: name,
                            description: pl.description || `Featuring ${artist.name}`,
                            coverUrl: cover,
                            trackCount: total || 1,
                            owner: pl.ownerV2?.data?.name || pl.owner?.name || 'Spotify',
                            isVirtual: true
                        };
                    })
                    .filter(Boolean);
            }

            // 2. Populate Similar Artists ("Fans Also Like") from official Apple Music
            if (appleMusicViews && appleMusicViews['similar-artists']?.data?.length > 0) {
                const amSimilar = appleMusicViews['similar-artists'].data.map((a: any) => {
                    const rawArt = a.attributes?.artwork?.url || '';
                    const art = rawArt ? rawArt.replace('{w}x{h}', '600x600').replace('{f}', 'jpg') : '';
                    return {
                        id: `artist-${a.attributes?.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                        name: a.attributes?.name,
                        imageUrl: art,
                        coverUrl: art,
                        follower_count: 500000,
                        isArtist: true,
                        type: 'artist'
                    };
                }).filter((a: any) => a && a.name && a.imageUrl);
                if (amSimilar.length > 0) {
                    relatedArtists = amSimilar;
                }
            }

            // Also include local verified public playlists containing this artist's tracks
            const localPlaylists = await prisma.playlist.findMany({
                where: {
                    isPublic: true,
                    tracks: { some: { track: { artistId: artist.id, deletedAt: null } } }
                },
                take: 8,
                include: {
                    _count: { select: { tracks: true } },
                    user: { select: { name: true, username: true } }
                }
            }).catch(() => []);

            for (const lp of localPlaylists) {
                if ((lp._count?.tracks || 0) > 0 && lp.coverUrl) {
                    artistPlaylists.unshift({
                        id: lp.id,
                        name: lp.name,
                        title: lp.name,
                        description: lp.description || `${lp._count?.tracks} songs`,
                        coverUrl: lp.coverUrl,
                        trackCount: lp._count?.tracks || 0,
                        owner: lp.user?.name || lp.user?.username || 'Zenify Curator',
                        isVirtual: false
                    });
                }
            }

            // Strictly filter out any playlists with 0 tracks or invalid covers
            artistPlaylists = artistPlaylists.filter(p => p && (p.trackCount || 0) > 0 && p.coverUrl);
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

        // Categorize releases for Apple Music layout
        const sortedAlbums = [...finalAlbums].sort((a, b) => {
            const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
            const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
            return dateB - dateA;
        });

        const latestRelease = sortedAlbums[0] || null;
        const studioAlbums = sortedAlbums.filter(a => !a.isSingle && !(a.title || '').toLowerCase().includes('single') && !(a.title || '').toLowerCase().includes('ep'));
        const singlesAndEPs = sortedAlbums.filter(a => a.isSingle || (a.title || '').toLowerCase().includes('single') || (a.title || '').toLowerCase().includes('ep'));
        const essentialAlbums = studioAlbums.length >= 2 ? studioAlbums.slice(0, 6) : [];

        return JSON.parse(JSON.stringify({ 
            ...artist, 
            imageUrl: finalImageUrl,
            coverUrl: artist.coverUrl || wikiBanner || deezerCover || finalImageUrl,
            bio: artist.bio || wikiBio,
            latestRelease,
            essentialAlbums,
            studioAlbums,
            singlesAndEPs,
            appearsOn: appearsOnAlbums,
            compilations: appearsOnAlbums.length > 0 ? appearsOnAlbums : [],
            topTracks: finalTopTracks, 
            albums: finalAlbums,
            playlists: artistPlaylists,
            relatedArtists: relatedArtists.length > 0 ? relatedArtists : [],
            trackCount: Math.max(trackCount, finalTopTracks.length), 
            totalStreams: Number(streamAgg._sum.streams || 0),
            follower_count: artist.follower_count || 0,
            monthlyListeners: artist.monthlyListeners || 0
        },
            (key, value) => typeof value === 'bigint' ? value.toString() : value
        ));
    }

    // Contextual recommendations artist page (Popular, Albums, Fans also like, Similar vibe)
    server.get('/:id/page', {
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
        const data = await RecommendationsService.getContextRecommendations(userId, { type: 'artist', id });
        return reply.send(data);
    });

    // Related artists (Fans Also Like)
    server.get('/:id/related', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const { id } = req.params;
        const response = await resolveArtistWithFullCatalog(id);
        if (!response) return reply.status(404).send({ message: 'Artist not found' });
        return reply.send(response.relatedArtists || []);
    });

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

            const processedArtists: any[] = artists
                .filter(a => !isFakeOrNumericArtistName(a.name))
                .map(a => {
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
