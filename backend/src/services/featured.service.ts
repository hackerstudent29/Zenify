import { prisma } from '../utils/prisma';
import { getCacheVal, setCacheVal } from '../utils/cache';

export interface CreateFeaturedContentInput {
    contentType: 'track' | 'album' | 'artist' | 'playlist';
    contentId: string;
    title?: string;
    description?: string;
    priority?: number;
    startAt?: Date;
    endAt?: Date;
}

export class FeaturedService {
    /**
     * Gets active featured content items filtered by start/end date and priority
     */
    static async getActiveFeatured(limit = 15) {
        const cached = await getCacheVal(`featured_content_active_${limit}`);
        if (cached && Array.isArray(cached) && cached.length > 0) return cached;

        const now = new Date();

        try {
            const items = await prisma.featuredContent.findMany({
                where: {
                    isActive: true,
                    OR: [
                        { startAt: null },
                        { startAt: { lte: now } }
                    ],
                    AND: [
                        {
                            OR: [
                                { endAt: null },
                                { endAt: { gte: now } }
                            ]
                        }
                    ]
                },
                orderBy: [
                    { priority: 'desc' },
                    { createdAt: 'desc' }
                ],
                take: limit
            });

            // Hydrate featured entities (tracks, albums, artists, playlists)
            const hydrated: any[] = [];

            for (const item of items) {
                if (item.contentType === 'track') {
                    const track = await prisma.track.findUnique({
                        where: { id: item.contentId },
                        include: {
                            artist: { select: { id: true, name: true, imageUrl: true } },
                            album: { select: { id: true, title: true, coverUrl: true, palette: true } }
                        }
                    });
                    if (track && !track.deletedAt && !track.isUnlisted) {
                        hydrated.push({
                            id: track.id,
                            title: item.title || track.title,
                            description: item.description,
                            coverUrl: track.coverUrl,
                            audioUrl: track.audioUrl,
                            duration: track.duration,
                            genre: track.genre,
                            artist: {
                                id: track.artist?.id || '',
                                name: track.artist?.name || 'Unknown Artist',
                                imageUrl: track.artist?.imageUrl
                            },
                            album: track.album ? {
                                id: track.album.id,
                                title: track.album.title,
                                coverUrl: track.album.coverUrl,
                                palette: track.album.palette
                            } : undefined
                        });
                    }
                } else if (item.contentType === 'album') {
                    const album = await prisma.album.findUnique({
                        where: { id: item.contentId },
                        include: {
                            artist: { select: { id: true, name: true, imageUrl: true } }
                        }
                    });
                    if (album) {
                        hydrated.push({
                            id: album.id,
                            title: item.title || album.title,
                            description: item.description,
                            coverUrl: album.coverUrl,
                            isAlbum: true,
                            artist: {
                                id: album.artist?.id || '',
                                name: album.artist?.name || 'Unknown Artist',
                                imageUrl: album.artist?.imageUrl
                            }
                        });
                    }
                } else if (item.contentType === 'artist') {
                    const artist = await prisma.artist.findUnique({
                        where: { id: item.contentId }
                    });
                    if (artist) {
                        hydrated.push({
                            id: artist.id,
                            name: artist.name,
                            title: item.title || artist.name,
                            description: item.description,
                            imageUrl: artist.imageUrl,
                            coverUrl: artist.coverUrl,
                            isArtist: true
                        });
                    }
                } else if (item.contentType === 'playlist') {
                    const playlist = await prisma.playlist.findUnique({
                        where: { id: item.contentId },
                        include: {
                            user: { select: { id: true, name: true, username: true } }
                        }
                    });
                    if (playlist) {
                        hydrated.push({
                            id: playlist.id,
                            name: playlist.name,
                            title: item.title || playlist.name,
                            description: item.description || playlist.description,
                            coverUrl: playlist.coverUrl,
                            isPlaylist: true
                        });
                    }
                }
            }

            // Fallback: If no CMS items exist, return tracks marked isFeatured or top engagement tracks
            if (hydrated.length === 0) {
                const fallbackTracks = await prisma.track.findMany({
                    where: {
                        deletedAt: null,
                        isUnlisted: false,
                        releaseStatus: 'PUBLISHED'
                    },
                    include: {
                        artist: { select: { id: true, name: true, imageUrl: true } },
                        album: { select: { id: true, title: true, coverUrl: true, palette: true } }
                    },
                    orderBy: [
                        { isFeatured: 'desc' },
                        { engagement_score: 'desc' }
                    ],
                    take: limit
                });

                const formatted = fallbackTracks.map(t => ({
                    id: t.id,
                    title: t.title,
                    coverUrl: t.coverUrl,
                    audioUrl: t.audioUrl,
                    duration: t.duration,
                    genre: t.genre,
                    artist: {
                        id: t.artist?.id || '',
                        name: t.artist?.name || 'Unknown Artist',
                        imageUrl: t.artist?.imageUrl
                    },
                    album: t.album ? {
                        id: t.album.id,
                        title: t.album.title,
                        coverUrl: t.album.coverUrl,
                        palette: t.album.palette
                    } : undefined
                }));

                await setCacheVal(`featured_content_active_${limit}`, formatted, 180);
                return formatted;
            }

            await setCacheVal(`featured_content_active_${limit}`, hydrated, 180);
            return hydrated;
        } catch (err) {
            console.error('[FeaturedService] Failed to fetch featured content:', err);
            return [];
        }
    }

    /**
     * Add new featured content item (Admin CMS)
     */
    static async createFeaturedItem(input: CreateFeaturedContentInput) {
        const item = await prisma.featuredContent.create({
            data: {
                contentType: input.contentType,
                contentId: input.contentId,
                title: input.title,
                description: input.description,
                priority: input.priority || 0,
                startAt: input.startAt,
                endAt: input.endAt,
                isActive: true
            }
        });
        return item;
    }
}
