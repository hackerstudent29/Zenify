import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

import { syncArtistMetadata } from '../utils/artist-sync';
import { uploadUrlToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';


export const createArtistSchema = z.object({
    name: z.string().min(1),
    bio: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
    birthDate: z.string().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
    coverUrl: z.string().optional().nullable(),
    verified: z.boolean().optional().default(false),
    monthlyListeners: z.number().optional().default(0),
    totalStreams: z.number().optional().default(0),
});

export const updateArtistSchema = z.object({
    name: z.string().min(1).optional(),
    bio: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
    birthDate: z.string().optional().nullable(),
    imageUrl: z.string().optional().nullable(),
    coverUrl: z.string().optional().nullable(),
    verified: z.boolean().optional(),
    monthlyListeners: z.number().optional(),
    totalStreams: z.number().optional(),
});

export class ArtistController {
    constructor(private server: any) { }

    getAll = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const rawArtists = await prisma.artist.findMany({
                orderBy: [
                    { tracks: { _count: 'desc' } },
                    { name: 'asc' }
                ],
                include: {
                    _count: {
                        select: { tracks: true, albums: true }
                    }
                }
            });

            // Smart deduplication: group by base normalized name (e.g. "Anirudh Ravichander")
            const seenBaseNames = new Set<string>();
            const uniqueArtists: typeof rawArtists = [];

            for (const artist of rawArtists) {
                const baseName = artist.name
                    .toLowerCase()
                    .replace(/\s*&\s*.*/, '')
                    .replace(/\s*,\s*.*/, '')
                    .replace(/\s+feat\.?.*/, '')
                    .replace(/\s+ft\.?.*/, '')
                    .trim();

                if (!seenBaseNames.has(baseName)) {
                    seenBaseNames.add(baseName);
                    uniqueArtists.push(artist);
                }
            }

            // Lazy enrichment - fix images on the fly for canonical artists
            const artists = await Promise.all(uniqueArtists.map(a => syncArtistMetadata(a)));

            const response = JSON.parse(JSON.stringify(artists, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.send(response);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch artists' });
        }
    };

    getOne = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let artist = await prisma.artist.findUnique({
                where: { id },
                include: {
                    tracks: {
                        where: { 
                            deletedAt: null,
                            OR: [
                                { releaseStatus: 'PUBLISHED' },
                                { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                            ]
                        },
                        orderBy: { createdAt: 'desc' },
                        include: { album: true }
                    },
                    albums: {
                        orderBy: { releaseDate: 'desc' }
                    }
                }
            });

            if (!artist) {
                artist = await prisma.artist.findFirst({
                    where: { name: { equals: id, mode: 'insensitive' } },
                    include: {
                        tracks: {
                            where: { 
                                deletedAt: null,
                                OR: [
                                    { releaseStatus: 'PUBLISHED' },
                                    { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                                ]
                            },
                            orderBy: { createdAt: 'desc' },
                            include: { album: true }
                        },
                        albums: {
                            orderBy: { releaseDate: 'desc' }
                        }
                    }
                });
            }

            if (!artist) {
                return reply.status(404).send({ error: 'Artist not found' });
            }

            // Find tracks where this artist is featured
            const featuredTracks = await prisma.track.findMany({
                where: {
                    featuredArtists: { contains: artist.name, mode: 'insensitive' },
                    deletedAt: null,
                    OR: [
                        { releaseStatus: 'PUBLISHED' },
                        { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                include: { album: true }
            });

            // Merge featured tracks avoiding duplicates
            const existingTrackIds = new Set(artist.tracks.map(t => t.id));
            const mergedTracks = [...artist.tracks];
            
            for (const ft of featuredTracks) {
                if (!existingTrackIds.has(ft.id)) {
                    mergedTracks.push(ft);
                }
            }

            // Filter out duplicate or fake albums where album title equals a single track title and track count <= 1
            const validLocalAlbums = (artist.albums || []).filter(alb => {
                const isSingleTrackNamedAlbum = mergedTracks.some(t => 
                    t.title.trim().toLowerCase() === alb.title.trim().toLowerCase()
                );
                return !isSingleTrackNamedAlbum;
            });

            // Parallel external catalog enrichment: Genuine Albums, Playlists, Top Songs
            const { default: axios } = await import('axios');
            const { SystemSettingsService } = await import('../services/system-settings.service.js');
            const rapidApiKey = await SystemSettingsService.getSpotifyApiKey();

            const [catalogAlbumsRes, catalogSongsRes, spotifyPlaylistsRes] = await Promise.allSettled([
                // 1. Genuine Albums and Movie Soundtracks from iTunes
                axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, entity: 'album', limit: 40 },
                    timeout: 4500
                }).then(r => r.data?.results || []).catch(() => []),

                // 2. Maximum catalog songs from iTunes
                axios.get(`https://itunes.apple.com/search`, {
                    params: { term: artist.name, entity: 'song', limit: 50 },
                    timeout: 4500
                }).then(r => r.data?.results || []).catch(() => []),

                // 3. Spotify Playlists for this artist
                rapidApiKey ? axios.get('https://spotify81.p.rapidapi.com/search', {
                    params: { q: artist.name, type: 'playlists', limit: 25 },
                    headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'spotify81.p.rapidapi.com' },
                    timeout: 5000
                }).then(r => r.data?.playlists?.items || []).catch(() => []) : Promise.resolve([])
            ]);

            const externalAlbums = catalogAlbumsRes.status === 'fulfilled' ? catalogAlbumsRes.value : [];
            const externalSongs = catalogSongsRes.status === 'fulfilled' ? catalogSongsRes.value : [];
            const rawPlaylists = spotifyPlaylistsRes.status === 'fulfilled' ? spotifyPlaylistsRes.value : [];

            // Map and merge authentic albums (deduping by title)
            const seenAlbumTitles = new Set<string>(validLocalAlbums.map(a => a.title.toLowerCase().trim()));
            const enrichedAlbums = [...validLocalAlbums];

            for (const col of externalAlbums) {
                const normTitle = (col.collectionName || '').toLowerCase().trim();
                if (!normTitle || seenAlbumTitles.has(normTitle)) continue;
                seenAlbumTitles.add(normTitle);

                const artwork = col.artworkUrl100 ? col.artworkUrl100.replace('100x100bb', '1000x1000bb') : '';
                enrichedAlbums.push({
                    id: `itunes-album-${col.collectionId}`,
                    title: col.collectionName,
                    coverUrl: artwork,
                    releaseDate: col.releaseDate ? new Date(col.releaseDate) : new Date(),
                    trackCount: col.trackCount || 1,
                    genre: col.primaryGenreName || 'Soundtrack',
                    artistId: artist.id,
                    isSingle: (col.trackCount || 1) <= 1 || normTitle.includes('single')
                } as any);
            }

            // Map Spotify Playlists
            const artistPlaylists = rawPlaylists
                .map((p: any) => {
                    const pl = p.data || p;
                    const uri = pl.uri || '';
                    const playlistId = uri.replace('spotify:playlist:', '');
                    const name = pl.name || '';
                    const cover = pl.images?.items?.[0]?.sources?.[0]?.url || pl.images?.[0]?.url || '';
                    if (!playlistId || !name) return null;
                    return {
                        id: `sp-playlist-${playlistId}`,
                        name,
                        title: name,
                        description: pl.description || `Featuring ${artist.name}`,
                        coverUrl: cover,
                        owner: pl.ownerV2?.data?.name || pl.owner?.name || 'Spotify',
                        isVirtual: true
                    };
                })
                .filter(Boolean);

            // Merge Top Tracks: DB tracks first, then external catalog tracks
            const seenTrackTitles = new Set<string>(mergedTracks.map(t => t.title.toLowerCase().trim()));
            const allTopTracks = [...mergedTracks];

            for (const s of externalSongs) {
                const cleanTitle = (s.trackName || '').trim();
                const norm = cleanTitle.toLowerCase();
                if (!norm || seenTrackTitles.has(norm)) continue;
                seenTrackTitles.add(norm);

                const art = s.artworkUrl100 ? s.artworkUrl100.replace('100x100bb', '1000x1000bb') : '';
                const instantAudioUrl = s.previewUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(`${s.artistName || artist.name} - ${cleanTitle}`)}`;
                allTopTracks.push({
                    id: `itunes-${s.trackId}`,
                    title: cleanTitle,
                    artist: { id: artist.id, name: s.artistName || artist.name },
                    artistId: artist.id,
                    duration: s.trackTimeMillis ? Math.round(s.trackTimeMillis / 1000) : 180,
                    coverUrl: art,
                    audioUrl: instantAudioUrl,
                    previewUrl: s.previewUrl || undefined,
                    album: {
                        id: s.collectionId ? `itunes-album-${s.collectionId}` : `itunes-col-${s.trackId}`,
                        title: s.collectionName || 'Soundtrack',
                        coverUrl: art
                    },
                    isVirtual: true
                } as any);
            }

            const responseObj = {
                ...artist,
                tracks: allTopTracks,
                topTracks: allTopTracks.slice(0, 30),
                albums: enrichedAlbums,
                playlists: artistPlaylists,
                trackCount: allTopTracks.length
            };

            const response = JSON.parse(JSON.stringify(responseObj, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.send(response);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to fetch artist' });
        }
    };

    create = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const data = createArtistSchema.parse(request.body);

            // Check if artist with this name already exists to avoid Prisma crash
            const existing = await prisma.artist.findUnique({
                where: { name: data.name }
            });

            if (existing) {
                return reply.status(400).send({ error: 'An artist with this name already exists.' });
            }

            // Auto-fetch missing details via AI / Web Scraping
            let bioToSave = data.bio;
            let dobToSave = (data.birthDate && data.birthDate.trim() !== "") ? new Date(data.birthDate) : null;
            let finalImageUrl = data.imageUrl || null;
            let finalCoverUrl = data.coverUrl || null;
            let roleToSave = data.role;

            if (!bioToSave || !dobToSave || !finalImageUrl || !finalCoverUrl || !roleToSave) {
                try {
                    const { AIArtistService } = await import('../services/ai-artist.service.js');
                    const enriched = await AIArtistService.enrichArtistProfile(data.name);
                    
                    if (!bioToSave && enriched.bio) bioToSave = enriched.bio;
                    if (!dobToSave && enriched.dob) dobToSave = enriched.dob;
                    if (!finalImageUrl && enriched.imageUrl) finalImageUrl = enriched.imageUrl;
                    if (!finalCoverUrl && enriched.coverUrl) finalCoverUrl = enriched.coverUrl;
                    if (!roleToSave && enriched.genre) roleToSave = enriched.genre;
                } catch (enrichErr) {
                    request.log.warn(`[ArtistController] AI enrichment failed for ${data.name}`);
                }
            }

            const imageUrl = finalImageUrl ? await uploadUrlToCloudinary(finalImageUrl, 'zenify/artists/profile') : null;
            const coverUrl = finalCoverUrl ? await uploadUrlToCloudinary(finalCoverUrl, 'zenify/artists/banner') : null;

            const artist = await prisma.artist.create({
                data: {
                    name: data.name,
                    bio: bioToSave,
                    role: roleToSave,
                    imageUrl,
                    coverUrl,
                    verified: data.verified ?? false,
                    birthDate: dobToSave,
                    monthlyListeners: data.monthlyListeners || 0,
                    totalStreams: BigInt(data.totalStreams || 0),
                }
            });

            // Reliable serialization for BigInt
            const response = JSON.parse(JSON.stringify(artist, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.status(201).send(response);
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.format() });
            }

            // Handle unique constraint violation specifically if findUnique was bypassed
            if (error.code === 'P2002') {
                return reply.status(400).send({ error: 'An artist with this name already exists.' });
            }

            request.log.error(error);
            return reply.status(500).send({ error: error.message || 'Failed to create artist' });
        }
    };

    update = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            const data = updateArtistSchema.parse(request.body);

            const existing = await prisma.artist.findUnique({ where: { id } });
            if (!existing) {
                return reply.status(404).send({ error: 'Artist not found' });
            }

            const imageUrl = data.imageUrl !== undefined ? (data.imageUrl ? await uploadUrlToCloudinary(data.imageUrl, 'zenify/artists/profile') : null) : undefined;
            const coverUrl = data.coverUrl !== undefined ? (data.coverUrl ? await uploadUrlToCloudinary(data.coverUrl, 'zenify/artists/banner') : null) : undefined;

            const artist = await prisma.artist.update({
                where: { id },
                data: {
                    name: data.name,
                    bio: data.bio,
                    role: data.role,
                    imageUrl,
                    coverUrl,
                    verified: data.verified,
                    birthDate: data.birthDate === null ? null : (data.birthDate ? new Date(data.birthDate) : undefined),
                    monthlyListeners: data.monthlyListeners,
                    totalStreams: data.totalStreams !== undefined ? BigInt(data.totalStreams) : undefined,
                }
            });

            // Cleanup old assets if they were replaced
            if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== imageUrl) {
                await deleteFromCloudinary(existing.imageUrl);
            }
            if (coverUrl !== undefined && existing.coverUrl && existing.coverUrl !== coverUrl) {
                await deleteFromCloudinary(existing.coverUrl);
            }

            const response = JSON.parse(JSON.stringify(artist, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            return reply.send(response);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.format() });
            }
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to update artist' });
        }
    };

    delete = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;

            const existing = await prisma.artist.findUnique({ where: { id } });
            if (!existing) {
                return reply.status(404).send({ error: 'Artist not found' });
            }

            // Check if artist has tracks or albums
            const tracksCount = await prisma.track.count({ where: { artistId: id, deletedAt: null } });
            const albumsCount = await prisma.album.count({ where: { artistId: id } });

            if (tracksCount > 0 || albumsCount > 0) {
                return reply.status(400).send({
                    error: `Cannot delete artist. They have ${tracksCount} tracks and ${albumsCount} albums. Move or delete them first.`
                });
            }

            // Delete old Cloudinary assets
            if (existing.imageUrl) {
                await deleteFromCloudinary(existing.imageUrl);
            }
            if (existing.coverUrl) {
                await deleteFromCloudinary(existing.coverUrl);
            }

            await prisma.artist.delete({
                where: { id }
            });

            return reply.status(204).send();
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ error: 'Failed to delete artist' });
        }
    };
}
