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

    async update(id: string, data: any) {
        const track = await prisma.track.findUnique({ where: { id } });
        if (!track) throw this.server.httpErrors.notFound('Track not found');

        const { artistName, artistId, albumId, tags, ...rest } = data;
        let finalArtistId = artistId || track.artistId;

        if (artistName) {
            const artist = await prisma.artist.upsert({
                where: { name: artistName },
                update: {},
                create: {
                    name: artistName,
                    bio: "Generated via update",
                    imageUrl: "https://ui-avatars.com/api/?name=" + artistName
                }
            });
            finalArtistId = artist.id;
        }

        return prisma.track.update({
            where: { id },
            data: {
                ...rest,
                artist: { connect: { id: finalArtistId } },
                album: albumId ? { connect: { id: albumId } } : undefined,
                tags: tags || undefined,
            },
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
    async incrementPlayCount(id: string, userId?: string, sessionData?: { listenDuration?: number; skipped?: boolean; completionRate?: number }) {
        prisma.track.update({
            where: { id },
            data: { plays: { increment: 1 } }
        }).catch((err: any) => this.server.log.error(err));

        if (userId) {
            // Record user history (Chronological)
            prisma.history.create({
                data: { userId, trackId: id }
            }).catch((err: any) => this.server.log.error(err));

            // Build the update data for UserTrackStat
            const updateData: any = {
                playCount: { increment: 1 },
                lastPlayedAt: new Date(),
            };
            if (sessionData?.skipped) {
                updateData.skipCount = { increment: 1 };
            }
            if (sessionData?.listenDuration) {
                updateData.totalListenDuration = { increment: sessionData.listenDuration };
            }

            // Update stats (Aggregated)
            prisma.userTrackStat.upsert({
                where: { userId_trackId: { userId, trackId: id } },
                create: {
                    userId, trackId: id, playCount: 1, lastPlayedAt: new Date(),
                    skipCount: sessionData?.skipped ? 1 : 0,
                    totalListenDuration: sessionData?.listenDuration || 0,
                    completionRateAvg: sessionData?.completionRate || 0,
                },
                update: updateData
            }).catch((err: any) => this.server.log.error(err));
        }
    }

    async incrementDownloadCount(id: string) {
        // @ts-ignore
        prisma.track.update({
            where: { id },
            data: { downloads: { increment: 1 } }
        }).catch((err: any) => this.server.log.error(err));
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

    async upload(parts: any, userId?: string) {
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

        // Validate that the user exists before linking
        let validUserId = userId;
        if (userId) {
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!userExists) {
                console.warn(`[Upload] userId "${userId}" not found in DB, uploading without user link.`);
                validUserId = undefined;
            }
        }

        return prisma.track.create({
            data: {
                title: fields.title || "Untitled Upload",
                artistId: artist.id,
                audioUrl: audioUrl,
                coverUrl: coverUrl || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
                duration: fields.duration ? parseInt(fields.duration) : 180,
                genre: fields.genre || "Pop",
                lyrics: fields.lyrics || "",
                description: fields.description || "",
                plays: 0,
                userId: validUserId,
                // New Fields
                isUnlisted: fields.isUnlisted === 'true',
                allowDownloads: fields.allowDownloads === 'true',
                enableComments: fields.enableComments === 'true',
                releaseStatus: fields.releaseStatus || "PUBLISHED",
                scheduledAt: fields.scheduledAt && !isNaN(new Date(fields.scheduledAt).getTime()) ? new Date(fields.scheduledAt) : null,
                copyrightLabel: fields.copyrightLabel || null,
                bpm: fields.bpm ? parseInt(fields.bpm) : null,
                key: fields.key || null,
                composers: fields.composers || null,
                featuredArtists: fields.featuredArtists || null,
            },
            include: { artist: true, album: true }
        });
    }

    async importExternal(data: any, userId?: string) {
        const { title, artistName, audioUrl, coverUrl, genre, albumTitle, duration } = data;

        // Create or find artist
        const artist = await prisma.artist.upsert({
            where: { name: artistName },
            update: {},
            create: {
                name: artistName,
                bio: "Generated via external import",
                imageUrl: "https://ui-avatars.com/api/?name=" + artistName
            }
        });

        // Create or find album if provided
        let albumId = undefined;
        if (albumTitle) {
            // First try: Matching title AND artist (Standard)
            let album = await prisma.album.findFirst({
                where: { title: albumTitle, artistId: artist.id }
            });

            // Second try: Matching title ONLY (for Soundtracks/Various Artists collections)
            if (!album) {
                album = await prisma.album.findFirst({
                    where: { title: albumTitle }
                });

                // If it's the same album title but different artist, we might want to check coverUrl too to be safe
                // but usually, within a single import, title is sufficient if unique enough.
            }

            if (!album) {
                album = await prisma.album.create({
                    data: {
                        title: albumTitle,
                        artistId: artist.id, // Assign to the first artist that triggers creation
                        coverUrl: coverUrl
                    }
                });
            }
            albumId = album.id;
        }

        // Validate that the user exists before linking
        let validUserId = userId;
        if (userId) {
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!userExists) {
                console.warn(`[Import] userId "${userId}" not found in DB, importing without user link.`);
                validUserId = undefined;
            }
        }

        // Duplicate Check: See if a track with this title and artist already exists
        const safeTitle = title || "External Track";
        const existingTrack = await prisma.track.findFirst({
            where: {
                title: safeTitle,
                artistId: artist.id
            },
            include: { artist: true, album: true }
        });

        if (existingTrack) {
            console.log(`[Import] Track "${safeTitle}" by artist ID ${artist.id} already exists. Skipping insertion.`);
            return existingTrack;
        }

        return prisma.track.create({
            data: {
                title: title || "External Track",
                artistId: artist.id,
                albumId,
                audioUrl,
                coverUrl: coverUrl || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
                duration: duration ? Math.round(Number(duration)) : 180,
                genre: genre || "Pop",
                userId: validUserId,
                releaseStatus: "PUBLISHED",
                copyrightLabel: data.copyrightLabel || null,
                bpm: data.bpm ? parseInt(data.bpm) : null,
                key: data.key || null,
                composers: data.composers || null,
                featuredArtists: data.featuredArtists || null,
                lyrics: data.lyrics || null,
            },
            include: { artist: true, album: true }
        });
    }
}
