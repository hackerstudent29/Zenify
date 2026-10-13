import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { CreatePlaylistInput, UpdatePlaylistInput } from '../controllers/playlist.schemas';
import { uploadUrlToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';


export class PlaylistService {
    constructor(private server: FastifyInstance) { }

    async create(userId: string, data: CreatePlaylistInput) {
        const coverUrl = data.coverUrl ? await uploadUrlToCloudinary(data.coverUrl, 'zenify/playlists') : data.coverUrl;
        return prisma.playlist.create({
            data: {
                ...data,
                coverUrl,
                userId,
            },
        });
    }

    async findAllPublic(limit: number = 20) {
        return prisma.playlist.findMany({
            where: { isPublic: true },
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { 
                _count: { select: { tracks: true } },
                user: { select: { id: true, name: true, username: true, avatarUrl: true } },
                tracks: {
                    where: {
                        track: { deletedAt: null }
                    },
                    include: {
                        track: {
                            select: { coverUrl: true }
                        }
                    },
                    orderBy: { addedAt: 'asc' },
                    take: 4
                }
            },
        });
    }

    async findMyPlaylists(userId: string) {
        return prisma.playlist.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            include: {
                _count: { select: { tracks: true } },
                tracks: {
                    where: {
                        track: { deletedAt: null }
                    },
                    include: {
                        track: {
                            select: { coverUrl: true }
                        }
                    },
                    orderBy: { addedAt: 'asc' },
                    take: 4
                }
            }
        });
    }

    async findOne(id: string, requestingUserId?: string, userRole?: string) {
        if (id.startsWith('sp-playlist-') || id.startsWith('sp-')) {
            const spId = id.replace(/^sp-playlist-/, '').replace(/^sp-/, '');
            try {
                const { default: axios } = await import('axios');
                const { SystemSettingsService } = await import('./system-settings.service.js');
                const rapidApiKey = await SystemSettingsService.getSpotifyApiKey();
                
                const [infoRes, tracksRes] = await Promise.allSettled([
                    axios.get('https://spotify81.p.rapidapi.com/playlist', {
                        params: { id: spId },
                        headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'spotify81.p.rapidapi.com' },
                        timeout: 8000
                    }),
                    axios.get('https://spotify81.p.rapidapi.com/playlist_tracks', {
                        params: { id: spId, offset: 0, limit: 50 },
                        headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'spotify81.p.rapidapi.com' },
                        timeout: 8000
                    })
                ]);

                const info = infoRes.status === 'fulfilled' ? infoRes.value.data : null;
                const items = tracksRes.status === 'fulfilled' ? (tracksRes.value.data?.items || []) : [];

                const tracks = items.map((item: any, idx: number) => {
                    const t = item.track || item;
                    const artists = (t.artists || []).map((a: any) => ({ name: a.name }));
                    const cover = t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || '';
                    const artistName = artists.map((a: any) => a.name).join(', ') || 'Unknown Artist';
                    return {
                        id: `sp-${t.id || idx}`,
                        title: t.name,
                        duration: Math.round((t.duration_ms || 180000) / 1000),
                        coverUrl: cover,
                        artist: { name: artistName },
                        artists,
                        album: { title: t.album?.name || 'Spotify Playlist', coverUrl: cover },
                        audioUrl: `/api/utils/stream-youtube?url=${encodeURIComponent(`${artistName} - ${t.name}`)}`,
                        isVirtual: true,
                        trackNumber: idx + 1
                    };
                });

                // Ultra-Fast Local DB search for playlist tracks (<5-10ms)
                // If any of these songs were downloaded or imported from search, link the real local audio immediately!
                const trackTitles = tracks.map((t: any) => t.title).filter(Boolean);
                if (trackTitles.length > 0) {
                    try {
                        const localMatches = await prisma.track.findMany({
                            where: {
                                deletedAt: null,
                                title: { in: trackTitles, mode: 'insensitive' },
                                audioUrl: { not: '' }
                            },
                            include: { artist: true },
                            take: 100
                        });

                        if (localMatches.length > 0) {
                            for (const t of tracks) {
                                const cleanTTitle = (t.title || '').trim().toLowerCase();
                                const cleanTArtist = (t.artist?.name || '').trim().toLowerCase();
                                const match = localMatches.find(lm => {
                                    const lmTitle = (lm.title || '').trim().toLowerCase();
                                    const lmArtist = (lm.artist?.name || '').trim().toLowerCase();
                                    const isTitleMatch = lmTitle === cleanTTitle;
                                    const isArtistMatch = !cleanTArtist || lmArtist.includes(cleanTArtist) || cleanTArtist.includes(lmArtist);
                                    return isTitleMatch && isArtistMatch;
                                });

                                if (match && match.audioUrl && !match.audioUrl.includes('audio-ssl') && !match.audioUrl.includes('mzstatic') && !match.audioUrl.includes('itunes.apple.com')) {
                                    t.id = match.id;
                                    t.audioUrl = match.audioUrl;
                                    t.isVirtual = false;
                                    (t as any).isLocalAvailable = true;
                                    if (match.duration) t.duration = match.duration;
                                    if (match.coverUrl) t.coverUrl = match.coverUrl;
                                }
                            }
                        }
                    } catch (e: any) {
                        console.warn('[PlaylistService] Local track enrichment error:', e.message);
                    }
                }

                const plTitle = info?.name || 'Spotify Playlist';
                const plDesc = info?.description || 'Curated Spotify Playlist';
                const plCover = info?.images?.[0]?.url || tracks[0]?.coverUrl || '';
                const plOwner = info?.owner?.display_name || 'Spotify';

                return {
                    id,
                    name: plTitle,
                    title: plTitle,
                    description: plDesc,
                    coverUrl: plCover,
                    isPublic: true,
                    tracks: tracks.map((t: any, i: number) => ({
                        trackId: t.id,
                        order: i,
                        track: t
                    })),
                    user: { name: plOwner, username: plOwner.toLowerCase().replace(/\s+/g, '_') }
                };
            } catch (spErr: any) {
                console.warn(`[PlaylistService] Failed to load Spotify playlist ${spId}:`, spErr.message);
            }
        }

        const playlist = await prisma.playlist.findUnique({
            where: { id },
            include: {
                tracks: {
                    where: {
                        track: { deletedAt: null }
                    },
                    include: {
                        track: {
                            include: { artist: true, album: true }
                        },
                    },
                    orderBy: { addedAt: 'asc' }
                },
                user: { select: { id: true, name: true, username: true, avatarUrl: true } }
            },
        });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');

        // Prevent unauthorized access to private playlists
        if (!playlist.isPublic && playlist.userId !== requestingUserId && userRole !== 'ADMIN') {
            throw this.server.httpErrors.notFound('Playlist not found');
        }

        // Sanitize tracks: upgrade any legacy 30s previews or empty audioUrls to full stream proxy
        if (playlist.tracks) {
            for (const pt of playlist.tracks) {
                if (pt.track) {
                    const audioUrl = pt.track.audioUrl || '';
                    const isPreviewUrl = audioUrl.includes('audio-ssl') || audioUrl.includes('mzstatic') || audioUrl.includes('itunes.apple.com');
                    if (!audioUrl || isPreviewUrl) {
                        pt.track.audioUrl = `/api/utils/stream-youtube?url=${encodeURIComponent(`${pt.track.artist?.name || ''} - ${pt.track.title}`)}`;
                    }
                }
            }
        }

        return playlist;
    }

    async update(id: string, userId: string, data: UpdatePlaylistInput) {
        const playlist = await prisma.playlist.findUnique({ where: { id } });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');
        if (playlist.userId !== userId) throw this.server.httpErrors.forbidden('Not your playlist');

        const coverUrl = data.coverUrl !== undefined ? (data.coverUrl ? await uploadUrlToCloudinary(data.coverUrl, 'zenify/playlists') : null) : undefined;

        const updated = await prisma.playlist.update({
            where: { id },
            data: {
                ...data,
                coverUrl
            },
        });

        // Cleanup old cover if replaced
        if (coverUrl !== undefined && playlist.coverUrl && playlist.coverUrl !== coverUrl) {
            await deleteFromCloudinary(playlist.coverUrl);
        }

        return updated;
    }

    async delete(id: string, userId: string) {
        const playlist = await prisma.playlist.findUnique({ where: { id } });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');
        if (playlist.userId !== userId) throw this.server.httpErrors.forbidden('Not your playlist');

        if (playlist.coverUrl) {
            await deleteFromCloudinary(playlist.coverUrl);
        }

        return prisma.playlist.delete({ where: { id } });
    }

    async addTrack(playlistId: string, trackId: string, userId: string) {
        const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');
        if (playlist.userId !== userId) throw this.server.httpErrors.forbidden('Not your playlist');

        // Check if track already exists in playlist
        const existing = await prisma.playlistTrack.findFirst({
            where: { playlistId, trackId }
        });

        if (existing) {
            throw (this.server as any).httpErrors.conflict('This song is already in your playlist');
        }

        return prisma.playlistTrack.create({
            data: {
                playlistId,
                trackId,
            }
        });
    }

    async removeTrack(playlistId: string, trackId: string, userId: string) {
        const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');
        if (playlist.userId !== userId) throw this.server.httpErrors.forbidden('Not your playlist');

        return prisma.playlistTrack.deleteMany({
            where: {
                playlistId,
                trackId
            }
        });
    }
}
