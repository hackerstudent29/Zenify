import { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma';
import { CreateTrackInput, UpdateTrackInput, TrackQuery } from '../controllers/track.schemas';
import cloudinary from '../utils/cloudinary';
import stream from 'stream';
import { promisify } from 'util';
const pipeline = promisify(stream.pipeline);
import path from 'path';
import fs from 'fs';
import { normalizeArtistName, CANONICAL_ARTISTS } from '../utils/artist';
import { ArtistMappingService } from './artist-mapping.service';


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
            include: { artist: true, album: { include: { artist: true } } }
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
                album: { include: { artist: true } },
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
                album: { include: { artist: true } },
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
            const normalizedName = normalizeArtistName(artistName);
            const canonical = CANONICAL_ARTISTS[normalizedName.toLowerCase()];

            const artist = await prisma.artist.upsert({
                where: { name: normalizedName },
                update: {},
                create: {
                    name: normalizedName,
                    bio: canonical?.bio || "Generated via update",
                    // @ts-ignore
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : undefined,
                    imageUrl: "https://ui-avatars.com/api/?name=" + normalizedName
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
            orderBy: { streams: 'desc' },
            take: 10
        });
    }

    // Increment play count (Async/Non-blocking)
    async incrementStreamCount(id: string, userId?: string, sessionData?: { listenDuration?: number; skipped?: boolean; completionRate?: number }) {
        prisma.track.update({
            where: { id },
            data: {
                streams: { increment: 1 },
                artist: { update: { totalStreams: { increment: 1 } } }
            }
        }).catch((err: any) => this.server.log.error(err));

        if (userId) {
            // Record user history (Chronological)
            prisma.history.create({
                data: { userId, trackId: id }
            }).catch((err: any) => this.server.log.error(err));

            // Build the update data for UserTrackStat
            const updateData: any = {
                streamCount: { increment: 1 },
                lastStreamedAt: new Date(),
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
                    userId, trackId: id, streamCount: 1, lastStreamedAt: new Date(),
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
            where: {
                userId,
                track: { deletedAt: null }
            },
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
                console.log(`[Upload] Processing file part: ${part.fieldname} (${part.filename})`);

                try {
                    // Upload directly to Cloudinary via stream
                    const folder = part.fieldname === 'audio' ? 'zenify/tracks' : 'zenify/covers';
                    const resourceType = part.fieldname === 'audio' ? 'video' : 'image';

                    const uploadPromise = new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            {
                                resource_type: resourceType,
                                folder: folder,
                                public_id: `upload-${Date.now()}-${Math.round(Math.random() * 1E9)}`,
                            },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        );

                        // Error handling for the stream
                        part.file.on('error', (err: any) => {
                            console.error(`[Upload] Stream error for ${part.fieldname}:`, err);
                            reject(err);
                        });

                        part.file.pipe(uploadStream);
                    });

                    const result: any = await uploadPromise;

                    if (part.fieldname === 'audio') {
                        audioUrl = result.secure_url;
                    } else if (part.fieldname === 'cover') {
                        coverUrl = result.secure_url;
                    }
                    console.log(`[Upload] Cloudinary upload success for ${part.fieldname}:`, result.secure_url);
                } catch (uploadErr) {
                    console.error(`[Upload] Cloudinary upload failed for ${part.fieldname}:`, uploadErr);
                    // Fallback to local storage only if Cloudinary fails and we are not in prod
                    if (process.env.NODE_ENV !== 'production') {
                        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                        const filename = `${uniqueSuffix}${path.extname(part.filename)}`;
                        const savePath = path.join(uploadDir, filename);
                        await pipeline(part.file, fs.createWriteStream(savePath));
                        if (part.fieldname === 'audio') audioUrl = `/public/music/${filename}`;
                        else if (part.fieldname === 'cover') coverUrl = `/public/music/${filename}`;
                    } else {
                        throw uploadErr;
                    }
                }
            } else {
                fields[part.fieldname] = part.value;
            }
        }

        // Log for debugging
        console.log("Upload processed:", { fields, audioUrl, coverUrl });

        if (!audioUrl && !fields.audioUrl) {
            throw new Error("No audio file uploaded");
        }

        // Use pre-fetched Cloudinary URL if no file was uploaded
        if (!audioUrl && fields.audioUrl) {
            audioUrl = fields.audioUrl;
            console.log("[Upload] Using pre-fetched audioUrl:", audioUrl);
        }

        // Create or find artist via Intelligent Mapping
        const rawArtistName = fields.artistName || fields.artist || "Unknown Artist";
        
        // Split and pick primary artist
        const artistParts = rawArtistName.split(/[,&]|\bfeat\.?\b|\bft\.?\b|\bx\b|\bvs\b/i).map((s: string) => s.trim()).filter(Boolean);
        const primaryRaw = artistParts[0] || "Unknown Artist";
        const others = artistParts.slice(1).join(', ');

        const resolved = await ArtistMappingService.resolveArtist(primaryRaw);
        
        let artist;
        if (resolved.id) {
            // Found a confident match
            artist = await prisma.artist.findUnique({ where: { id: resolved.id } });
        }

        if (!artist) {
            // Create new or confirmed canonical
            const canonical = CANONICAL_ARTISTS[resolved.name.toLowerCase()];
            artist = await prisma.artist.upsert({
                where: { name: resolved.name },
                update: {},
                create: {
                    name: resolved.name,
                    bio: canonical?.bio || "Generated via intelligent upload",
                    // @ts-ignore
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : undefined,
                    imageUrl: "https://ui-avatars.com/api/?name=" + encodeURIComponent(resolved.name)
                }
            });
        }

        // Combine suggested featured artists with any in fields
        const finalFeatured = [fields.featuredArtists, others].filter(Boolean).join(', ');


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
                title: (fields.title || "Untitled Upload").trim(),
                artistId: artist.id,
                audioUrl: audioUrl,
                coverUrl: coverUrl || fields.coverUrl || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
                duration: fields.duration ? parseInt(fields.duration) : 180,
                genre: fields.genre || "Pop",
                lyrics: fields.lyrics || "",
                description: fields.description || "",
                streams: 0,
                userId: validUserId,
                albumId: fields.albumId || null,
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
                featuredArtists: finalFeatured || null,
            },
            include: { artist: true, album: true }
        });
    }

    async importExternal(data: any, userId?: string) {
        const title = (data.title || "External Track").trim();
        const artistName = (data.artistName || "Unknown Artist").trim();
        const albumTitle = data.albumTitle ? data.albumTitle.trim() : null;
        const { audioUrl, coverUrl, genre, duration } = data;

        // Split and pick primary artist
        const artistParts = artistName.split(/[,&]|\bfeat\.?\b|\bft\.?\b|\bx\b|\bvs\b/i).map((s: string) => s.trim()).filter(Boolean);
        const primaryRaw = artistParts[0] || "Unknown Artist";
        const others = artistParts.slice(1).join(', ');

        const resolved = await ArtistMappingService.resolveArtist(primaryRaw);
        
        let artist;
        if (resolved.id) {
            artist = await prisma.artist.findUnique({ where: { id: resolved.id } });
        }

        if (!artist) {
            const canonical = CANONICAL_ARTISTS[resolved.name.toLowerCase()];
            artist = await prisma.artist.upsert({
                where: { name: resolved.name },
                update: {},
                create: {
                    name: resolved.name,
                    bio: canonical?.bio || "Generated via intelligent external import",
                    // @ts-ignore
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : undefined,
                    imageUrl: "https://ui-avatars.com/api/?name=" + encodeURIComponent(resolved.name)
                }
            });
        }

        // Add detected secondary artists to featured
        const finalFeatured = [data.featuredArtists, others].filter(Boolean).join(', ');


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
        const safeTitle = title;
        const existingTrack = await prisma.track.findFirst({
            where: {
                title: safeTitle,
                artistId: artist.id
            },
            include: { artist: true, album: true }
        });

        if (existingTrack) {
            console.log(`[Import] Track "${safeTitle}" by artist ID ${artist.id} already exists. Status: ${existingTrack.deletedAt ? 'Deleted' : 'Active'}`);

            const updateData: any = {
                deletedAt: null // Restore if it was soft-deleted
            };

            // If the existing track doesn't have an album, but we are importing it via an album collection, link it!
            if (albumId && existingTrack.albumId !== albumId) {
                console.log(`[Import] Linking existing track to album ID: ${albumId}`);
                updateData.albumId = albumId;
                updateData.trackNumber = data.trackNumber ? Number(data.trackNumber) : existingTrack.trackNumber;
            }

            const updatedTrack = await prisma.track.update({
                where: { id: existingTrack.id },
                data: updateData,
                include: { artist: true, album: true }
            });
            return updatedTrack;
        }

        return prisma.track.create({
            data: {
                title: title || "External Track",
                artistId: artist.id,
                albumId,
                audioUrl,
                coverUrl: coverUrl || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
                duration: duration ? Math.round(Number(duration)) : 180,
                trackNumber: data.trackNumber ? Number(data.trackNumber) : 1,
                genre: genre || "Pop",
                userId: validUserId,
                releaseStatus: "PUBLISHED",
                copyrightLabel: data.copyrightLabel || null,
                bpm: data.bpm ? parseInt(data.bpm) : null,
                key: data.key || null,
                composers: data.composers || null,
                featuredArtists: finalFeatured || null,
                lyrics: data.lyrics || null,
            },
            include: { artist: true, album: true }
        });
    }
}
