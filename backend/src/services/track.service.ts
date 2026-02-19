import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { CreateTrackInput, UpdateTrackInput, TrackQuery } from '../controllers/track.schemas';

export class TrackService {
    constructor(private server: FastifyInstance) { }

    async create(data: CreateTrackInput) {
        const { artistId, albumId, tags, ...rest } = data;
        return prisma.track.create({
            data: {
                ...rest,
                audioUrl: rest.audioUrl || "",
                artist: { connect: { id: artistId } },
                album: albumId ? { connect: { id: albumId } } : undefined,
                tags: tags || [],
            },
            include: { artist: true, album: true }
        });
    }

    async findAll(query: TrackQuery) {
        const { cursor, limit = 20 } = query;

        const tracks = await prisma.track.findMany({
            take: limit + 1,
            cursor: cursor ? { id: cursor } : undefined,
            where: { deletedAt: null },
            include: {
                artist: true,
                album: true,
            },
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
            include: {
                artist: true,
                album: true,
            }
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
            include: { artist: true, album: true }
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

    // New Production Features
    async getFeatured() {
        return prisma.track.findMany({
            where: { isFeatured: true, deletedAt: null },
            include: { artist: true, album: true },
            take: 10
        });
    }

    async getTrending() {
        return prisma.track.findMany({
            where: { isTrending: true, deletedAt: null },
            include: { artist: true, album: true },
            orderBy: { plays: 'desc' },
            take: 10
        });
    }

    // Increment play count (Async/Non-blocking)
    async incrementPlayCount(id: string, userId?: string) {
        prisma.track.update({
            where: { id },
            data: { plays: { increment: 1 } }
        }).catch((err: any) => this.server.log.error(err));

        if (userId) {
            // Record user history (Chronological)
            prisma.history.create({
                data: { userId, trackId: id }
            }).catch((err: any) => this.server.log.error(err));

            // Update stats (Aggregated)
            prisma.userTrackStat.upsert({
                where: { userId_trackId: { userId, trackId: id } },
                create: { userId, trackId: id, playCount: 1, lastPlayedAt: new Date() },
                update: { playCount: { increment: 1 }, lastPlayedAt: new Date() }
            }).catch((err: any) => this.server.log.error(err));
        }
    }

    async getLiked(userId: string) {
        const likes = await prisma.like.findMany({
            where: { userId },
            include: {
                track: {
                    include: { artist: true, album: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return likes.map(like => like.track);
    }

    async toggleLike(userId: string, trackId: string) {
        const existingLike = await prisma.like.findUnique({
            where: { userId_trackId: { userId, trackId } }
        });

        if (existingLike) {
            await prisma.like.delete({
                where: { userId_trackId: { userId, trackId } }
            });
            return { liked: false };
        } else {
            await prisma.like.create({
                data: { userId, trackId }
            });
            return { liked: true };
        }
    }

    async upload(parts: any) {
        const fs = require('fs');
        const path = require('path');
        const { pipeline } = require('stream/promises');

        let audioUrl = "";
        let coverUrl = "";
        const fields: any = {};

        // Ensure directory exists
        const uploadDir = path.join(__dirname, '../../public/music');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        for await (const part of parts) {
            if (part.file) {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const filename = `${uniqueSuffix}${path.extname(part.filename)}`;
                const savePath = path.join(uploadDir, filename);

                await pipeline(part.file, fs.createWriteStream(savePath));

                // Correctly assign URL based on fieldname
                if (part.fieldname === 'audio') {
                    audioUrl = `/public/music/${filename}`;
                } else if (part.fieldname === 'cover') {
                    coverUrl = `/public/music/${filename}`;
                }
            } else {
                // Fields come as part.value, but sometimes they are truncated if not handled?
                // fastify-multipart yields fields too.
                fields[part.fieldname] = part.value;
            }
        }

        // Log for debugging
        console.log("Upload processed:", { fields, audioUrl, coverUrl });

        if (!audioUrl) {
            throw new Error("No audio file uploaded");
        }

        // Create or find artist
        const artistName = fields.artistName || fields.artist || "Unknown Artist";
        const artist = await prisma.artist.upsert({
            where: { name: artistName },
            update: {},
            create: {
                name: artistName,
                bio: "Generated via upload",
                imageUrl: "https://ui-avatars.com/api/?name=" + artistName
            }
        });

        return prisma.track.create({
            data: {
                title: fields.title || "Untitled Upload",
                artistId: artist.id,
                audioUrl: audioUrl,
                coverUrl: coverUrl || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
                duration: 180, // Mock duration
                genre: fields.genre || "Pop",
                lyrics: fields.lyrics || "",
                description: fields.description || "",
                plays: 0
            },
            include: { artist: true, album: true }
        });
    }
}
