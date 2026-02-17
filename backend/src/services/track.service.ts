import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { CreateTrackInput, UpdateTrackInput, TrackQuery } from '../controllers/track.schemas';

export class TrackService {
    constructor(private server: FastifyInstance) { }

    async create(data: CreateTrackInput) {
        return prisma.track.create({
            data: {
                ...data,
                tags: data.tags || [],
            },
        });
    }

    async findAll(query: TrackQuery) {
        const { cursor, limit = 20 } = query;

        // Cursor-based pagination logic
        const tracks = await prisma.track.findMany({
            take: limit + 1, // Fetch one extra to determine if there's a next page
            cursor: cursor ? { id: cursor } : undefined,
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
        });

        let nextCursor: string | undefined = undefined;
        if (tracks.length > limit) {
            const nextItem = tracks.pop();
            nextCursor = nextItem?.id;
        }

        return {
            items: tracks,
            nextCursor,
        };
    }

    async findOne(id: string) {
        const track = await prisma.track.findFirst({
            where: { id, deletedAt: null },
        });
        if (!track) throw this.server.httpErrors.notFound('Track not found');
        return track;
    }

    async update(id: string, data: UpdateTrackInput) {
        const track = await prisma.track.findUnique({ where: { id } });
        if (!track) throw this.server.httpErrors.notFound('Track not found');

        return prisma.track.update({
            where: { id },
            data,
        });
    }

    async softDelete(id: string) {
        const track = await prisma.track.findUnique({ where: { id } });
        if (!track) throw this.server.httpErrors.notFound('Track not found');

        return prisma.track.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    // Increment play count (Async/Non-blocking)
    async incrementPlayCount(id: string, userId?: string) {
        // Fire and forget - don't await this in the main response
        prisma.track.update({
            where: { id },
            data: { plays: { increment: 1 } }
        }).catch((err: unknown) => this.server.log.error(err));

        if (userId) {
            // Record user history
            prisma.userTrackStat.upsert({
                where: { userId_trackId: { userId, trackId: id } },
                create: { userId, trackId: id, playCount: 1, lastPlayedAt: new Date() },
                update: { playCount: { increment: 1 }, lastPlayedAt: new Date() }
            }).catch((err: unknown) => this.server.log.error(err));
        }
    }
}
