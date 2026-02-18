import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { CreatePlaylistInput, UpdatePlaylistInput } from '../controllers/playlist.schemas';

export class PlaylistService {
    constructor(private server: FastifyInstance) { }

    async create(userId: string, data: CreatePlaylistInput) {
        return prisma.playlist.create({
            data: {
                ...data,
                userId,
            },
        });
    }

    async findAllPublic(limit: number = 20) {
        return prisma.playlist.findMany({
            where: { isPublic: true },
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, email: true } } }, // Simple user info
        });
    }

    async findMyPlaylists(userId: string) {
        return prisma.playlist.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const playlist = await prisma.playlist.findUnique({
            where: { id },
            include: {
                tracks: {
                    include: {
                        track: {
                            include: { artist: true, album: true }
                        },
                    },
                    orderBy: { addedAt: 'asc' }
                },
                user: { select: { id: true, email: true } }
            },
        });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');
        return playlist;
    }

    async update(id: string, userId: string, data: UpdatePlaylistInput) {
        const playlist = await prisma.playlist.findUnique({ where: { id } });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');
        if (playlist.userId !== userId) throw this.server.httpErrors.forbidden('Not your playlist');

        return prisma.playlist.update({
            where: { id },
            data,
        });
    }

    async delete(id: string, userId: string) {
        const playlist = await prisma.playlist.findUnique({ where: { id } });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');
        if (playlist.userId !== userId) throw this.server.httpErrors.forbidden('Not your playlist');

        return prisma.playlist.delete({ where: { id } });
    }

    async addTrack(playlistId: string, trackId: string, userId: string) {
        const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
        if (!playlist) throw this.server.httpErrors.notFound('Playlist not found');
        if (playlist.userId !== userId) throw this.server.httpErrors.forbidden('Not your playlist');

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
