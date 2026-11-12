import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { ArtistController } from '../controllers/artist.controller';
import { cleanArtistNames, isFakeOrNumericArtistName, CANONICAL_ARTISTS, getCanonicalArtist } from '../utils/artist.js';
import { CleanCdnAudioService } from '../services/clean-cdn-audio.service.js';
import { upgradeInnerTubeArtwork } from '../utils/innertube-artwork';

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

        // 0. Canonical Provider ID Resolution (JioSaavn Artist ID, e.g. "455663" or "saavn-artist-455663")
        const rawNumMatch = decoded.match(/^(?:saavn-artist-|artist-)?(\d{3,})$/);
        if (rawNumMatch) {
            const providerArtistId = rawNumMatch[1];
            try {
                const { jiosaavnCatalog } = await import('../services/jiosaavn-catalog.service.js');
                const { DataIdentityService } = await import('../services/data-identity.service.js');
                const providerArtist = await jiosaavnCatalog.getArtist(providerArtistId);
                if (providerArtist && providerArtist.name && providerArtist.imageUrl) {
                    const dbArtist = await DataIdentityService.syncArtist({
                        id: providerArtist.id,
                        name: providerArtist.name,
                        imageUrl: providerArtist.imageUrl,
                        role: 'primary'
                    }, providerArtist.bio);

                    // Sync top songs in background
                    if (providerArtist.topSongs && providerArtist.topSongs.length > 0) {
                        Promise.all(providerArtist.topSongs.slice(0, 20).map(t => DataIdentityService.syncTrack(t))).catch(() => {});
                    }

                    return {
                        id: dbArtist.id,
                        providerId: providerArtist.id,
                        provider: 'jiosaavn',
                        name: providerArtist.name,
                        imageUrl: providerArtist.imageUrl,
                        coverUrl: providerArtist.imageUrl,
                        bio: providerArtist.bio,
                        follower_count: providerArtist.followerCount || 500000,
                        fan_count: providerArtist.fanCount || 0,
                        isVerified: providerArtist.isVerified ?? true,
                        dob: providerArtist.dob,
                        wiki: providerArtist.wiki,
                        topTracks: providerArtist.topSongs,
                        topSongs: providerArtist.topSongs,
                        topAlbums: providerArtist.albums,
                        studioAlbums: providerArtist.albums,
                        albums: providerArtist.albums,
                        singles: providerArtist.singles,
                        singlesAndEPs: providerArtist.singles,
                        dedicatedPlaylists: providerArtist.dedicatedPlaylists || [],
                        featuredInPlaylists: providerArtist.featuredInPlaylists || [],
                        latestReleases: providerArtist.latestReleases || [],
                        latestRelease: providerArtist.latestReleases?.[0] || providerArtist.albums?.[0] || null,
                        playlists: providerArtist.dedicatedPlaylists || [],
                        relatedArtists: providerArtist.relatedArtists
                    };
                }
            } catch (err: any) {
                console.warn(`[ArtistRoute] Failed to resolve canonical artist ${providerArtistId}:`, err.message);
            }
        }

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

        // If artist found in DB, resolve or enrich from canonical JioSaavn provider
        if (artist) {
            let providerIdToUse = artist.providerId;
            const { jiosaavnCatalog } = await import('../services/jiosaavn-catalog.service.js');

            // If providerId is null, search by artist name to resolve and persist canonical providerId
            if (!providerIdToUse && artist.name && !isFakeOrNumericArtistName(artist.name)) {
                try {
                    const searchRes = await jiosaavnCatalog.search(artist.name, 'in', 5);
                    const targetNorm = artist.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const matched = searchRes.artists.find(a => {
                        const aNorm = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        return aNorm === targetNorm || aNorm.includes(targetNorm) || targetNorm.includes(aNorm);
                    });
                    if (matched?.id) {
                        providerIdToUse = matched.id;
                        prisma.artist.update({
                            where: { id: artist.id },
                            data: {
                                providerId: matched.id,
                                imageUrl: matched.imageUrl || artist.imageUrl,
                                bio: matched.bio || artist.bio
                            }
                        }).catch(() => {});
                    }
                } catch (searchErr: any) {
                    console.warn(`[ArtistRoute] JioSaavn match error for DB artist ${artist.name}:`, searchErr.message);
                }
            }

            if (providerIdToUse) {
                try {
                    const providerArtist = await jiosaavnCatalog.getArtist(providerIdToUse);
                    if (providerArtist && providerArtist.name) {
                        return {
                            id: artist.id,
                            providerId: providerIdToUse,
                            provider: 'jiosaavn',
                            name: artist.name || providerArtist.name,
                            imageUrl: providerArtist.imageUrl || artist.imageUrl,
                            coverUrl: providerArtist.imageUrl || artist.coverUrl,
                            bio: providerArtist.bio || artist.bio,
                            follower_count: providerArtist.followerCount || artist.follower_count || 500000,
                            fan_count: providerArtist.fanCount || 0,
                            isVerified: providerArtist.isVerified ?? true,
                            dob: providerArtist.dob,
                            wiki: providerArtist.wiki,
                            topTracks: providerArtist.topSongs,
                            topSongs: providerArtist.topSongs,
                            topAlbums: providerArtist.albums,
                            studioAlbums: providerArtist.albums,
                            albums: providerArtist.albums,
                            singles: providerArtist.singles,
                            singlesAndEPs: providerArtist.singles,
                            dedicatedPlaylists: providerArtist.dedicatedPlaylists || [],
                            featuredInPlaylists: providerArtist.featuredInPlaylists || [],
                            latestReleases: providerArtist.latestReleases || [],
                            latestRelease: providerArtist.latestReleases?.[0] || providerArtist.albums?.[0] || null,
                            playlists: providerArtist.dedicatedPlaylists || [],
                            relatedArtists: providerArtist.relatedArtists
                        };
                    }
                } catch {}
            }
        }

        // 2. If not found by ID, try finding by Name / Slug (case-insensitive & space-normalized)
        let cleanName = decoded
            .replace(/^itunes-artist-/, '')
            .replace(/^itunes-/, '')
            .replace(/^artist-/, '')
            .replace(/^yt-artist-/, '')
            .replace(/^sp-artist-/, '')
            .replace(/^canonical-/, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Try searching provider by artist name first to resolve canonical ID
        if (cleanName.length >= 2 && !isFakeOrNumericArtistName(cleanName)) {
            try {
                const { jiosaavnCatalog } = await import('../services/jiosaavn-catalog.service.js');
                const { DataIdentityService } = await import('../services/data-identity.service.js');
                const searchRes = await jiosaavnCatalog.search(cleanName, 'in', 5);
                const targetNorm = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const matchedArtist = searchRes.artists.find(a => {
                    const aNorm = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return aNorm === targetNorm || aNorm.includes(targetNorm) || targetNorm.includes(aNorm);
                });

                if (matchedArtist && matchedArtist.id) {
                    const fullArtist = await jiosaavnCatalog.getArtist(matchedArtist.id);
                    if (fullArtist && fullArtist.name && fullArtist.imageUrl) {
                        const dbArtist = await DataIdentityService.syncArtist({
                            id: fullArtist.id,
                            name: fullArtist.name,
                            imageUrl: fullArtist.imageUrl,
                            role: 'primary'
                        }, fullArtist.bio);

                        if (fullArtist.topSongs && fullArtist.topSongs.length > 0) {
                            Promise.all(fullArtist.topSongs.slice(0, 20).map(t => DataIdentityService.syncTrack(t))).catch(() => {});
                        }

                        return {
                            id: dbArtist.id,
                            providerId: fullArtist.id,
                            provider: 'jiosaavn',
                            name: fullArtist.name,
                            imageUrl: fullArtist.imageUrl,
                            coverUrl: fullArtist.imageUrl,
                            bio: fullArtist.bio,
                            follower_count: fullArtist.followerCount || 500000,
                            fan_count: fullArtist.fanCount || 0,
                            isVerified: fullArtist.isVerified ?? true,
                            dob: fullArtist.dob,
                            wiki: fullArtist.wiki,
                            topTracks: fullArtist.topSongs,
                            topSongs: fullArtist.topSongs,
                            topAlbums: fullArtist.albums,
                            studioAlbums: fullArtist.albums,
                            albums: fullArtist.albums,
                            singles: fullArtist.singles,
                            singlesAndEPs: fullArtist.singles,
                            dedicatedPlaylists: fullArtist.dedicatedPlaylists || [],
                            featuredInPlaylists: fullArtist.featuredInPlaylists || [],
                            latestReleases: fullArtist.latestReleases || [],
                            latestRelease: fullArtist.latestReleases?.[0] || fullArtist.albums?.[0] || null,
                            playlists: fullArtist.dedicatedPlaylists || [],
                            relatedArtists: fullArtist.relatedArtists
                        };
                    }
                }
            } catch (err: any) {
                console.warn(`[ArtistRoute] JioSaavn name lookup warn for "${cleanName}":`, err.message);
            }
        }

                const canonical = getCanonicalArtist(cleanName) || getCanonicalArtist(decoded) || getCanonicalArtist(decoded.replace(/^artist-/, ''));

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

        const searchNames = [cleanName, decoded];
        if (canonical?.name) searchNames.push(canonical.name);

        if (!artist && (cleanName.length > 0 || canonical?.name)) {
            artist = await prisma.artist.findFirst({
                where: { 
                    OR: searchNames.filter(Boolean).map(n => ({ name: { equals: n, mode: 'insensitive' } }))
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

        // 3. Fallback: Alphanumeric match against DB artists (handles punctuation differences like "G. V." vs "G V")
        if (!artist) {
            const normTarget = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normTarget.length >= 3) {
                const dbArtists = await prisma.artist.findMany({
                    select: { id: true, name: true }
                }).catch(() => []);
                const match = dbArtists.find(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normTarget);
                if (match) {
                    artist = await prisma.artist.findUnique({
                        where: { id: match.id },
                        include: {
                            albums: {
                                take: 50,
                                orderBy: { releaseDate: 'desc' },
                                include: { _count: { select: { tracks: true } } }
                            }
                        }
                    }).catch(() => null);
                }
            }
        }

        if (artist?.name) {
            cleanName = artist.name;
        }

        if (isFakeOrNumericArtistName(cleanName) && !artist) {
            return null;
        }

        // 3. Pre-fetch JioSaavn, Deezer & Wikipedia metadata
        let saavnArtistData: any = null;
        let saavnPic: string | null = null;
        let saavnBio: string | null = null;
        let saavnFollowers: number | null = null;
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

            // Primary: JioSaavn Artist Lookup
            const sRes = await axios.get('https://www.jiosaavn.com/api.php', {
                params: {
                    __call: 'search.getArtistResults',
                    _format: 'json',
                    _marker: '0',
                    api_version: '4',
                    ctx: 'web6dot0',
                    p: 1,
                    n: 10,
                    q: targetQuery
                },
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 3500
            }).catch(() => null);

            let matchedSaavn = (sRes?.data?.results || []).find((r: any) => {
                const rClean = (r.name || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
                return rClean === normTarget;
            });

            if (!matchedSaavn) {
                matchedSaavn = (sRes?.data?.results || []).find((r: any) => {
                    const rWords = (r.name || '').toLowerCase().split(/\s+/).filter(Boolean);
                    const tWords = targetQuery.toLowerCase().split(/\s+/).filter(Boolean);
                    return tWords.length > 0 && tWords.every((tw: string) => rWords.includes(tw));
                });
            }

            if (!matchedSaavn) {
                const autoRes = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'autocomplete.get',
                        _format: 'json',
                        _marker: '0',
                        api_version: '4',
                        ctx: 'web6dot0',
                        query: targetQuery
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 3000
                }).catch(() => null);
                const autoArtists = autoRes?.data?.artists?.data || [];
                matchedSaavn = autoArtists.find((r: any) => {
                    const rClean = (r.name || r.title || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
                    return rClean === normTarget;
                });
            }
            const sArtistId = matchedSaavn?.id;
            if (sArtistId) {
                const aRes = await axios.get('https://www.jiosaavn.com/api.php', {
                    params: {
                        __call: 'artist.getArtistPageDetails',
                        _format: 'json',
                        _marker: '0',
                        api_version: '4',
                        ctx: 'web6dot0',
                        artistId: sArtistId,
                        n_song: 50,
                        n_album: 50
                    },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 4500
                }).catch(() => null);

                if (aRes?.data?.name) {
                    saavnArtistData = aRes.data;
                    if (saavnArtistData.image) {
                        const img = saavnArtistData.image;
                        if (!img.includes('share-image') && !img.includes('default-artist') && !img.includes('default_artist') && !img.includes('_i/')) {
                            saavnPic = img.replace('150x150', '500x500').replace('50x50', '500x500');
                        }
                    }
                    if (saavnArtistData.bio) {
                        try {
                            const parsedBio = typeof saavnArtistData.bio === 'string' ? JSON.parse(saavnArtistData.bio) : saavnArtistData.bio;
                            if (Array.isArray(parsedBio)) {
                                saavnBio = parsedBio.map((b: any) => b.text || b).join(' ');
                            } else if (typeof parsedBio === 'string') {
                                saavnBio = parsedBio;
                            }
                        } catch {
                            if (typeof saavnArtistData.bio === 'string') saavnBio = saavnArtistData.bio;
                        }
                    }
                    if (saavnArtistData.follower_count) {
                        saavnFollowers = parseInt(saavnArtistData.follower_count, 10) || null;
                    }
                    if (saavnArtistData.similarArtists && Array.isArray(saavnArtistData.similarArtists) && saavnArtistData.similarArtists.length > 0) {
                        relatedArtists = saavnArtistData.similarArtists.slice(0, 15).map((a: any) => {
                            const artPic = (a.image_url || a.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
                            return {
                                id: `artist-${(a.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                                name: a.name,
                                imageUrl: artPic,
                                coverUrl: artPic,
                                follower_count: 500000,
                                isArtist: true,
                                type: 'artist'
                            };
                        });
                    }
                }
            }

            // Secondary lookup: Deezer Artist Search & Wikipedia Summary
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
                candidates.sort((a: any, b: any) => {
                    const exactA = (a.name || '').toLowerCase().trim() === targetQuery.toLowerCase().trim() ? 1 : 0;
                    const exactB = (b.name || '').toLowerCase().trim() === targetQuery.toLowerCase().trim() ? 1 : 0;
                    if (exactA !== exactB) return exactB - exactA;
                    return (b.nb_fan || 0) - (a.nb_fan || 0);
                });
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

            // Fetch Deezer Related Artists if not already filled by JioSaavn
            if (deezerArtistId && relatedArtists.length === 0) {
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
                        const canonical = getCanonicalArtist(cleanName);
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            const adbInfo = await ExternalMetadataService.fetchArtistFromAudioDB(cleanName).catch(() => null);

            const resolvedImage = canonical?.imageUrl || saavnPic || deezerPic || adbInfo?.imageUrl;
            const resolvedCover = saavnPic || wikiBanner || deezerCover || adbInfo?.coverUrl || resolvedImage;
            const resolvedBio = saavnBio || wikiBio || canonical?.bio || adbInfo?.bio;
            const capitalizedName = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            const newArtist = await prisma.artist.create({
                data: {
                    name: canonical?.name || capitalizedName,
                    bio: resolvedBio || `Listen to tracks by ${capitalizedName} on Zenify.`,
                    imageUrl: resolvedImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=18181b&color=e11d48&size=512`,
                    coverUrl: resolvedCover,
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : null,
                    follower_count: saavnFollowers || adbInfo?.followers || 500000
                },
                include: { albums: true }
            }).catch(async () => {
                // If unique constraint error, fetch existing artist
                return await prisma.artist.findFirst({
                    where: { name: { equals: canonical?.name || capitalizedName, mode: 'insensitive' } },
                    include: { albums: true }
                }).catch(() => null);
            });

            if (newArtist) artist = newArtist;
        }

        if (!artist) {
            if (canonical || saavnArtistData) {
                artist = {
                    id: decoded,
                    name: canonical?.name || saavnArtistData?.name || cleanName,
                    bio: canonical?.bio || saavnBio || `Listen to ${cleanName} on Zenify.`,
                    imageUrl: canonical?.imageUrl || saavnPic || '',
                    coverUrl: canonical?.coverUrl || saavnPic || '',
                    albums: [],
                    tracks: []
                };
            } else {
                return null;
            }
        }

        // Helper to detect circular mask or cropped image URLs
        const isCircular = (url?: string | null): boolean => {
            if (!url) return false;
            return (
                url.includes('cw.png') ||
                url.includes('cw.jpg') ||
                url.includes('cw.webp') ||
                url.includes('_cropped.png') ||
                url.includes('_cropped.jpg') ||
                url.includes('AMCArtistImages') ||
                url.includes('1920x1080cw') ||
                url.includes('1200x630cw')
            );
        };

        // Enrich artist bio / image / banner if missing or placeholder or has circular mask
        let widescreenBanner: string | null = null;
        const hasBadBio = !artist.bio || artist.bio.length < 30 || artist.bio.includes('ui-avatars.com');
        const hasBadImage = !artist.imageUrl || artist.imageUrl.includes('ui-avatars.com') || artist.imageUrl.includes('artist-default') || isCircular(artist.imageUrl);
        const hasBadCover = !artist.coverUrl || artist.coverUrl.includes('ui-avatars.com') || artist.coverUrl.includes('artist-default') || isCircular(artist.coverUrl);
        const isCurrentBannerWidescreen = artist.coverUrl && !isCircular(artist.coverUrl) && (
            artist.coverUrl.includes('headerImage') || 
            artist.coverUrl.includes('dzcdn.net') ||
            artist.coverUrl.includes('saavncdn.com') ||
            artist.coverUrl.includes('mzstatic')
        );

        if (!isCurrentBannerWidescreen || hasBadBio || hasBadImage || hasBadCover) {
            try {
                const { ArtistMetadataService } = await import('../services/artist-metadata.service.js');
                const visuals = await ArtistMetadataService.fetchArtistVisuals(artist.id, artist.name).catch(() => null);
                if (visuals) {
                    const updateData: any = {};
                    if (visuals.coverUrl) {
                        widescreenBanner = visuals.coverUrl;
                        artist.coverUrl = visuals.coverUrl;
                        updateData.coverUrl = visuals.coverUrl;
                    }
                    if (visuals.imageUrl && (hasBadImage || !artist.imageUrl)) {
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

                const normTitle = (t: string) => (t || '').toLowerCase().replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '').trim();
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
            if (a === t) return true;
            const artistParts = a.split(/[,&/]|feat\.?|featuring/i).map(s => s.trim());
            if (artistParts.some(part => part === t)) return true;
            const rx = new RegExp(`(^|[^a-z0-9])${t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
            return rx.test(a);
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

            // 0. Primary Pass: Official JioSaavn Top Songs with direct audio URLs
            const saavnSongsList: any[] = Array.isArray(saavnArtistData?.topSongs) ? saavnArtistData.topSongs : (saavnArtistData?.topSongs?.songs || []);
            if (saavnSongsList.length > 0) {
                // Build lookup for local DB tracks to preserve playback state and local audio
                const localTrackMap = new Map<string, any>();
                for (const t of topTracks) {
                    if (t?.title) localTrackMap.set(t.title.toLowerCase().trim(), t);
                }
                finalTopTracks = [];
                const seenTitles = new Set<string>();

                saavnSongsList.forEach((s: any, sIdx: number) => {
                    const cleanTitle = (s.title || s.song || s.name || '')
                        .replace(/&quot;/g, '"')
                        .replace(/&#039;/g, "'")
                        .replace(/&amp;/g, '&')
                        .trim();
                    if (!cleanTitle || seenTitles.has(cleanTitle.toLowerCase())) return;
                    seenTitles.add(cleanTitle.toLowerCase());

                    let artwork = (s.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
                    if (!artwork || artwork.includes('artist-default') || artwork.includes('placeholder')) {
                        artwork = saavnPic || artist.imageUrl || '';
                    }
                    const encMedia = s.more_info?.encrypted_media_url || s.encrypted_media_url;
                    let directAudio = '';
                    if (encMedia) {
                        directAudio = CleanCdnAudioService.decryptSaavnMediaUrl(encMedia, '320') || CleanCdnAudioService.decryptSaavnMediaUrl(encMedia, '160') || '';
                    }
                    const englishSingers = s.more_info?.artistMap?.primary_artists?.map((a: any) => a.name).filter(Boolean).join(', ')
                        || s.more_info?.artistMap?.artists?.map((a: any) => a.name).filter(Boolean).join(', ')
                        || (s.more_info?.music && typeof s.more_info.music === 'string' ? s.more_info.music : '')
                        || (s.primary_artists && s.primary_artists !== 'None' ? s.primary_artists : '')
                        || (s.singers && s.singers !== 'None' ? s.singers : '')
                        || s.more_info?.singers;
                    const trackArtist = cleanArtistNames(englishSingers, artist.name);
                    const rawAlb = s.album || s.more_info?.album;
                    const rawAlbId = s.more_info?.album_id || s.albumid || s.album_id;
                    const isSingle = !rawAlbId || (rawAlb && rawAlb.toLowerCase() === 'single') || (rawAlb && rawAlb.toLowerCase() === cleanTitle.toLowerCase());
                    const albTitle = (!isSingle && rawAlb && rawAlb !== 'undefined' ? rawAlb : '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim();
                    const dur = parseInt(s.duration || s.more_info?.duration, 10) || 180;

                    // Parse real release date with day/month precision from metadata or CDN timestamp
                    let relDate: Date = new Date();
                    const rawRel = s.more_info?.release_date || s.release_date;
                    if (rawRel && !isNaN(new Date(rawRel).getTime())) {
                        relDate = new Date(rawRel);
                    } else {
                        const cdnMatch = (s.image || '').match(/-([12][0-9]{3}[01][0-9][0-3][0-9])/);
                        if (cdnMatch) {
                            const y = cdnMatch[1].slice(0, 4);
                            const m = cdnMatch[1].slice(4, 6);
                            const d = cdnMatch[1].slice(6, 8);
                            const parsed = new Date(`${y}-${m}-${d}`);
                            if (!isNaN(parsed.getTime())) relDate = parsed;
                        } else if (s.year) {
                            relDate = new Date(`${s.year}-01-01`);
                        }
                    }

                    // Popularity ranking: preserve JioSaavn descending popularity order
                    const parsedPlays = parseInt(s.play_count || s.more_info?.play_count, 10);
                    const streamCount = (parsedPlays && parsedPlays > 1000) ? parsedPlays : Math.max(10000, 10000000 - (sIdx * 45000));

                    const localMatch = localTrackMap.get(cleanTitle.toLowerCase());
                    const finalAudio = (localMatch && localMatch.audioUrl && !localMatch.audioUrl.includes('mzstatic') && !localMatch.audioUrl.includes('audio-ssl'))
                        ? localMatch.audioUrl
                        : (directAudio || `/api/utils/stream-youtube?url=${encodeURIComponent(`${trackArtist} - ${cleanTitle}`)}&title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(trackArtist)}&album=${encodeURIComponent(albTitle)}&trackId=saavn-${s.id}`);

                    finalTopTracks.push({
                        id: localMatch?.id || `saavn-${s.id}`,
                        title: cleanTitle,
                        duration: dur,
                        coverUrl: artwork,
                        audioUrl: finalAudio,
                        streamUrl: finalAudio,
                        artistId: artist.id,
                        artist: { id: artist.id, name: trackArtist, imageUrl: artist.imageUrl },
                        artists: [{ id: artist.id, name: trackArtist, imageUrl: artist.imageUrl }],
                        album: isSingle ? undefined : {
                            id: `saavn-album-${rawAlbId}`,
                            title: albTitle,
                            coverUrl: artwork
                        },
                        releaseDate: relDate,
                        createdAt: relDate,
                        isVirtual: !localMatch,
                        isLocalAvailable: !!localMatch,
                        streams: streamCount,
                        like_count: 0
                    } as any);
                });

                // Append any remaining distinct local DB tracks that were not in JioSaavn top songs
                for (const t of topTracks) {
                    if (t?.title && !seenTitles.has(t.title.toLowerCase().trim())) {
                        seenTitles.add(t.title.toLowerCase().trim());
                        finalTopTracks.push(t);
                    }
                }
            }

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

                        const itunesRelDate = item.releaseDate ? new Date(item.releaseDate) : (item.year ? new Date(`${item.year}-01-01`) : new Date());
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
                            releaseDate: localMatch?.releaseDate ? new Date(localMatch.releaseDate) : itunesRelDate,
                            createdAt: itunesRelDate,
                            isVirtual: !localMatch,
                            isLocalAvailable: !!localMatch,
                            streams: localMatch?.streams || Math.max(5000, 5000000 - (finalTopTracks.length * 30000)),
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

            // 0. Primary Pass: Official JioSaavn Albums
            const saavnAlbumsList: any[] = [
                ...(Array.isArray(saavnArtistData?.topAlbums) ? saavnArtistData.topAlbums : (saavnArtistData?.topAlbums?.albums || [])),
                ...(saavnAlbumsRes?.data?.results || [])
            ];
            for (const alb of saavnAlbumsList) {
                const albTitle = (alb.album || alb.title || alb.name || '')
                    .replace(/&quot;/g, '"')
                    .replace(/&#039;/g, "'")
                    .replace(/&amp;/g, '&')
                    .trim();
                const saavnAlbId = `saavn-album-${alb.albumid || alb.id}`;
                if (!albTitle || seenCollectionIds.has(saavnAlbId)) continue;
                seenCollectionIds.add(saavnAlbId);

                const albArt = (alb.imageUrl || alb.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
                const count = parseInt(alb.more_info?.song_count || alb.song_count || alb.numSongs || alb.more_info?.song_pids?.split(',')?.length || '1', 10) || 1;

                // Check authentic artist composer/primary credit
                const albMusic = (alb.more_info?.music || alb.music || '').toLowerCase();
                const primaryList = (alb.more_info?.artistMap?.primary_artists || []).map((a: any) => (a.name || '').toLowerCase());
                const rawPrimary = (alb.primary_artists || '').toLowerCase();
                const isComposerOrPrimary = albMusic.includes(artist.name.toLowerCase()) ||
                    primaryList.some((p: string) => isAuthenticArtistRelease(p, artist.name)) ||
                    isAuthenticArtistRelease(rawPrimary, artist.name) ||
                    isAuthenticArtistRelease(alb.more_info?.artistMap?.artists?.[0]?.name, artist.name);

                const realArtistName = cleanArtistNames(alb.more_info?.music || alb.more_info?.artistMap?.primary_artists?.[0]?.name || alb.primary_artists || artist.name);

                const existingLocal = finalAlbums.find(a => normTitle(a.title) === normTitle(albTitle));
                if (existingLocal) {
                    existingLocal.trackCount = Math.max(existingLocal.trackCount || 1, count);
                    existingLocal.isSingle = existingLocal.trackCount <= 1;
                    if (!existingLocal.coverUrl && albArt) existingLocal.coverUrl = albArt;
                    continue;
                }

                let albRelDate: Date | null = null;
                const rawRelDate = alb.more_info?.release_date || alb.release_date;
                if (rawRelDate && !isNaN(new Date(rawRelDate).getTime())) {
                    albRelDate = new Date(rawRelDate);
                } else if (alb.year) {
                    albRelDate = new Date(`${alb.year}-01-01`);
                }

                if (isComposerOrPrimary) {
                    finalAlbums.push({
                        id: saavnAlbId,
                        title: albTitle,
                        artistName: artist.name,
                        coverUrl: albArt,
                        artistId: artist.id,
                        releaseDate: albRelDate,
                        createdAt: albRelDate,
                        trackCount: count,
                        isSingle: count <= 1,
                        genre: alb.language ? `${alb.language.charAt(0).toUpperCase() + alb.language.slice(1)}` : 'Indian'
                    });
                } else {
                    // Feature / guest appearance -> Appears On
                    appearsOnAlbums.push({
                        id: saavnAlbId,
                        title: albTitle,
                        artistName: realArtistName,
                        coverUrl: albArt,
                        artistId: artist.id,
                        releaseDate: albRelDate,
                        createdAt: albRelDate,
                        trackCount: count,
                        genre: alb.language ? `${alb.language.charAt(0).toUpperCase() + alb.language.slice(1)}` : 'Indian',
                        isSingle: count <= 1,
                        isVirtual: true
                    } as any);
                }
            }

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
                    const existingMatch = finalAlbums.find(a => normTitle(a.title) === normTitle(albTitle));
                    if (existingMatch) {
                        existingMatch.trackCount = Math.max(existingMatch.trackCount || 1, count);
                        existingMatch.isSingle = existingMatch.trackCount <= 1;
                        continue;
                    }
                    finalAlbums.push({
                        id: colId,
                        title: albTitle,
                        artistName: albArtist,
                        coverUrl: albArt,
                        artistId: artist.id,
                        releaseDate: alb.releaseDate ? new Date(alb.releaseDate) : null,
                        createdAt: alb.releaseDate ? new Date(alb.releaseDate) : null,
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
                        releaseDate: alb.releaseDate ? new Date(alb.releaseDate) : null,
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
                const saCount = parseInt(sa.more_info?.song_count || sa.song_count || sa.numSongs || '1', 10) || 1;

                const existingMatch = finalAlbums.find(a => normTitle(a.title) === normTitle(saTitle));
                if (existingMatch) {
                    existingMatch.trackCount = Math.max(existingMatch.trackCount || 1, saCount);
                    existingMatch.isSingle = existingMatch.trackCount <= 1;
                    if ((!existingMatch.coverUrl || existingMatch.coverUrl.includes('placeholder')) && saArt) {
                        existingMatch.coverUrl = saArt;
                    }
                    continue;
                }

                const saRelDate = sa.more_info?.release_date ? new Date(sa.more_info.release_date) : (sa.year ? new Date(`${sa.year}-01-01`) : null);

                finalAlbums.push({
                    id: saId,
                    title: saTitle,
                    artistName: sa.subtitle || artist.name,
                    coverUrl: saArt,
                    artistId: artist.id,
                    releaseDate: saRelDate,
                    createdAt: saRelDate,
                    trackCount: saCount,
                    genre: sa.language ? `${sa.language.charAt(0).toUpperCase() + sa.language.slice(1)} Soundtrack` : 'Soundtrack',
                    isSingle: (saCount <= 1),
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
                const artistLower = (artist.name || '').toLowerCase().trim();
                const artistTokens = artistLower.split(/\s+/).filter((w: string) => w.length > 1);

                for (const yt of ytResults) {
                    const cleanRawTitle = (yt.title || '').trim();
                    const vId = yt.videoId || yt.id;
                    if (!cleanRawTitle || !vId || typeof vId !== 'string' || vId === 'undefined' || vId.length < 3) continue;

                    // Clean YouTube noise from song titles (removes channel names, [Official Video], etc.)
                    const cleanTitle = cleanRawTitle
                        .replace(/\s*\|\s*.*$/i, '')
                        .replace(/\s*\[(official\s*(video|audio|music\s*video)|lyric\s*video|audio|video|lyrics)\]/gi, '')
                        .replace(/\s*\((official\s*(video|audio|music\s*video)|lyric\s*video|audio|video|lyrics)\)/gi, '')
                        .trim();

                    if (!cleanTitle) continue;

                    // Strictly verify track belongs to this artist (word boundary check: reject Rush for Rudh)
                    const uploaderLower = (yt.uploader || yt.channel || yt.artist || '').toLowerCase();
                    const artistLower = (artist.name || '').toLowerCase().trim();
                    const wordRegex = new RegExp(`\\b${artistLower.replace(/[^a-z0-9]/gi, '\\$&')}\\b`, 'i');
                    const matchesArtist = wordRegex.test(cleanRawTitle) || wordRegex.test(uploaderLower);

                    if (!matchesArtist) {
                        continue;
                    }

                    if (!existingTitles.has(cleanTitle.toLowerCase())) {
                        existingTitles.add(cleanTitle.toLowerCase());
                        const vThumb = upgradeInnerTubeArtwork(yt.thumbnail, { videoId: vId, kind: 'song' })
                            || `https://i.ytimg.com/vi/${vId}/maxresdefault.jpg`;
                        finalTopTracks.push({
                            id: `yt-${vId}`,
                            title: cleanTitle,
                            duration: yt.duration || 210,
                            coverUrl: vThumb,
                            audioUrl: yt.audioUrl || `https://www.youtube.com/watch?v=${vId}`,
                            artistId: artist.id,
                            artist: { id: artist.id, name: artist.name, imageUrl: artist.imageUrl },
                            artists: [{ id: artist.id, name: artist.name, imageUrl: artist.imageUrl }],
                            album: undefined,
                            isVirtual: true,
                            isYoutube: true,
                            youtubeId: vId,
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

        // Clean placeholder artwork & fallback to Deezer or genuine top song cover art
        const isPlaceholderArt = (url?: string | null): boolean => {
            if (!url || typeof url !== 'string') return true;
            const u = url.toLowerCase();
            return (
                u.includes('share-image') ||
                u.includes('default-artist') ||
                u.includes('default_artist') ||
                u.includes('artist-default') ||
                u.includes('saavncdn.com/_i/') ||
                u.includes('jiosaavn.com/_i/') ||
                u.includes('ui-avatars.com') ||
                u.includes('placeholder')
            );
        };

        const genuineTopArt = saavnPic || deezerPic || finalTopTracks.find(t => t.coverUrl && !isPlaceholderArt(t.coverUrl))?.coverUrl;
        if ((isPlaceholderArt(artist.imageUrl) || !artist.imageUrl) && genuineTopArt) {
            artist.imageUrl = genuineTopArt;
            if (isPlaceholderArt(artist.coverUrl) || !artist.coverUrl) artist.coverUrl = genuineTopArt;
            prisma.artist.update({
                where: { id: artist.id },
                data: { imageUrl: genuineTopArt, coverUrl: artist.coverUrl }
            }).catch(() => {});
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

                const canon = getCanonicalArtist(artist.name);

        let finalImageUrl = canon?.imageUrl || (!isPlaceholderArt(artist.imageUrl) ? artist.imageUrl : null) || saavnPic || deezerPic || genuineTopArt || '';

        if (canon?.imageUrl && artist.imageUrl !== canon.imageUrl) {
            finalImageUrl = canon.imageUrl;
            artist.imageUrl = canon.imageUrl;
            prisma.artist.update({ where: { id: artist.id }, data: { imageUrl: canon.imageUrl, coverUrl: canon.coverUrl || artist.coverUrl } }).catch(() => {});
        }

        // Categorize releases for layout
        const sortedAlbums = [...finalAlbums].sort((a, b) => {
            const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
            const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
            return dateB - dateA;
        });

        const latestRelease = sortedAlbums[0] || null;

        const dedupedStudioMap = new Map();
        for (const alb of sortedAlbums) {
            const count = alb.trackCount || 1;
            if (alb.isSingle || count <= 1 || (alb.title || '').toLowerCase().includes('single') || (alb.title || '').toLowerCase().includes('ep')) {
                continue;
            }
            const key = normTitle(alb.title);
            if (!dedupedStudioMap.has(key)) {
                dedupedStudioMap.set(key, alb);
            } else {
                const existing = dedupedStudioMap.get(key);
                existing.trackCount = Math.max(existing.trackCount || 1, count);
            }
        }
        const studioAlbums = Array.from(dedupedStudioMap.values());

        const dedupedSinglesMap = new Map();
        for (const item of sortedAlbums) {
            const count = item.trackCount || 1;
            if (!item.isSingle && count > 1 && !(item.title || '').toLowerCase().includes('single') && !(item.title || '').toLowerCase().includes('ep')) {
                continue;
            }
            const key = normTitle(item.title);
            if (!dedupedSinglesMap.has(key) && !dedupedStudioMap.has(key)) {
                dedupedSinglesMap.set(key, item);
            }
        }
        const singlesAndEPs = Array.from(dedupedSinglesMap.values());
        const essentialAlbums = studioAlbums.length >= 2 ? studioAlbums.slice(0, 6) : [];

        // ── Map JioSaavn Rich Sections ─────────────────────────────────────────
        // 1. "Just [Artist Name]" Dedicated Playlists
        const dedicatedPlaylists = (saavnArtistData?.dedicated_artist_playlist || []).map((pl: any, pIdx: number) => {
            const title = (pl.title || pl.name || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
            const image = (pl.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
            const songCount = pl.subtitle || (pl.more_info?.song_count ? `${pl.more_info.song_count} Songs` : 'Playlist');
            return {
                id: `saavn-playlist-${pl.id || pIdx}`,
                title,
                name: title,
                subtitle: songCount,
                coverUrl: image,
                image,
                trackCount: parseInt(pl.more_info?.song_count || '0', 10) || 50,
                type: 'playlist',
                isVirtual: true
            };
        }).filter((p: any) => p.title && p.coverUrl);

        // 2. "Featured In" Playlists & Soundtracks
        const featuredInPlaylists = (saavnArtistData?.featured_artist_playlist || []).map((pl: any, pIdx: number) => {
            const title = (pl.title || pl.name || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
            const image = (pl.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
            const songCount = pl.subtitle || (pl.more_info?.song_count ? `${pl.more_info.song_count} Songs` : 'Playlist');
            return {
                id: `saavn-playlist-${pl.id || pIdx}`,
                title,
                name: title,
                subtitle: songCount,
                coverUrl: image,
                image,
                trackCount: parseInt(pl.more_info?.song_count || '0', 10) || 50,
                type: 'playlist',
                isVirtual: true
            };
        }).filter((p: any) => p.title && p.coverUrl);

        // 3. "Latest Releases"
        const latestReleases = (saavnArtistData?.latest_release || []).map((lr: any, rIdx: number) => {
            const title = (lr.title || lr.name || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
            const image = (lr.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
            const targetId = `saavn-album-${lr.albumid || lr.id || rIdx}`;
            return {
                id: targetId,
                title,
                name: title,
                subtitle: lr.subtitle || lr.description || (lr.year ? `Released ${lr.year}` : 'Latest Release'),
                coverUrl: image,
                image,
                year: lr.year || '2026',
                type: 'album',
                isVirtual: true
            };
        }).filter((lr: any) => lr.title && lr.coverUrl);

        // 4. "Singles"
        const saavnSingles = (saavnArtistData?.singles || []).map((sg: any, sIdx: number) => {
            const title = (sg.title || sg.name || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
            const image = (sg.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
            const targetId = `saavn-album-${sg.albumid || sg.id || sIdx}`;
            return {
                id: targetId,
                title,
                name: title,
                subtitle: sg.year ? `Single • ${sg.year}` : 'Single',
                coverUrl: image,
                image,
                year: sg.year || '',
                type: 'album',
                isVirtual: true
            };
        }).filter((sg: any) => sg.title && sg.coverUrl);

        const candidateBanner = (!isCircular(widescreenBanner) ? widescreenBanner : null)
            || (!isCircular(canon?.coverUrl) ? canon?.coverUrl : null)
            || (!isCircular(artist.coverUrl) ? artist.coverUrl : null)
            || saavnPic
            || (!isCircular(wikiBanner) ? wikiBanner : null)
            || deezerCover
            || (!isCircular(finalImageUrl) ? finalImageUrl : null);

        let heroBanner = candidateBanner || saavnPic || deezerCover || artist.imageUrl;
        if (isPlaceholderArt(heroBanner)) {
            heroBanner = genuineTopArt || `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=18181b&color=e11d48&size=512`;
        }
        if (isPlaceholderArt(finalImageUrl)) {
            finalImageUrl = genuineTopArt || heroBanner;
        }

        // Clean any circular Apple Music masks from DB records
        if (isCircular(artist.coverUrl) || isCircular(artist.imageUrl)) {
            const cleanImage = (!isCircular(finalImageUrl) ? finalImageUrl : null) || saavnPic || deezerPic || heroBanner;
            artist.coverUrl = heroBanner;
            artist.imageUrl = cleanImage;
            finalImageUrl = cleanImage;
            if (artist.id) {
                prisma.artist.update({
                    where: { id: artist.id },
                    data: { coverUrl: heroBanner, imageUrl: cleanImage }
                }).catch(() => {});
            }
        }

        if (relatedArtists.length > 0) {
            try {
                const allDbArtists = await prisma.artist.findMany({
                    select: { id: true, name: true, imageUrl: true, coverUrl: true }
                }).catch(() => []);

                for (const rel of relatedArtists) {
                    const normClean = (rel.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const canonRel = getCanonicalArtist(rel.name);
                    const dbMatch = allDbArtists.find(m => m.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normClean);

                    if (canonRel?.imageUrl) {
                        rel.imageUrl = canonRel.imageUrl;
                        rel.coverUrl = canonRel.coverUrl || canonRel.imageUrl;
                    } else if (dbMatch?.imageUrl && !dbMatch.imageUrl.includes('/albums/') && !dbMatch.imageUrl.includes('Golden_Sparrow') && !dbMatch.imageUrl.includes('mza_16722262254049312592')) {
                        rel.imageUrl = dbMatch.imageUrl;
                        rel.coverUrl = dbMatch.coverUrl || dbMatch.imageUrl;
                    }

                    if (rel.imageUrl && (rel.imageUrl.includes('mza_16722262254049312592') || rel.imageUrl.includes('Golden_Sparrow'))) {
                        rel.imageUrl = 'https://c.saavncdn.com/artists/G_V__Prakash_Kumar_003_20251113063655_500x500.jpg';
                        rel.coverUrl = 'https://c.saavncdn.com/artists/G_V__Prakash_Kumar_003_20251113063655_500x500.jpg';
                    }

                    if (dbMatch) {
                        rel.id = dbMatch.id;
                    }
                }
            } catch {}
        }

        return JSON.parse(JSON.stringify({ 
            ...artist, 
            imageUrl: finalImageUrl,
            coverUrl: heroBanner,
            bannerUrl: heroBanner,
            bio: artist.bio || saavnBio || wikiBio,
            latestRelease,
            latestReleases: latestReleases.length > 0 ? latestReleases : (latestRelease ? [latestRelease] : []),
            essentialAlbums,
            studioAlbums,
            singlesAndEPs,
            singles: saavnSingles.length > 0 ? saavnSingles : singlesAndEPs,
            topAlbums: studioAlbums.length > 0 ? studioAlbums : finalAlbums.filter(a => (a.trackCount || 1) > 1),
            dedicatedPlaylists,
            featuredInPlaylists,
            appearsOn: appearsOnAlbums,
            compilations: appearsOnAlbums.length > 0 ? appearsOnAlbums : [],
            topTracks: finalTopTracks, 
            albums: studioAlbums.length > 0 ? studioAlbums : finalAlbums,
            playlists: dedicatedPlaylists.length > 0 ? dedicatedPlaylists : artistPlaylists,
            relatedArtists: relatedArtists.length > 0 ? relatedArtists : [],
            trackCount: Math.max(trackCount, finalTopTracks.length), 
            totalStreams: Number(streamAgg._sum.streams || 0),
            follower_count: artist.follower_count || saavnFollowers || 0,
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

    // Liked / followed artists
    server.get('/liked', {
        preHandler: [server.authenticate]
    }, artistController.getLiked);

    server.post('/:id/like', {
        preHandler: [server.authenticate]
    }, artistController.toggleLike);

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

            const { CANONICAL_ARTISTS } = await import('../utils/artist.js');
            const processedArtists: any[] = artists
                .filter(a => !isFakeOrNumericArtistName(a.name))
                .map(a => {
                    const canon = getCanonicalArtist(a.name);
                    const canonImage = canon?.imageUrl;
                    const hasValidImage = a.imageUrl && !a.imageUrl.includes('placeholder') && !a.imageUrl.includes('ui-avatars.com') && !a.imageUrl.includes('mza_16722262254049312592');
                    const finalImage = canonImage || (hasValidImage ? a.imageUrl : null) || a.imageUrl;
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
