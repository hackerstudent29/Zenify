import { FastifyInstance } from 'fastify';
import { ExternalMetadataService } from './external-metadata.service';
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
import { AIArtistService } from './ai-artist.service';


export class TrackService {
    // Memory lock to prevent race conditions during concurrent imports
    private static importLocks = new Map<string, Promise<void>>();

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
        // Use Intelligent Refinement for "Master Intake"
        const refinedMetadata: any = {
            title: fields.title || "Untitled Upload",
            artist: (fields.artistName || fields.artist || "Unknown Artist").trim(),
            album: fields.albumTitle || "",
            cover: coverUrl || fields.coverUrl || ""
        };

        ExternalMetadataService.refineMetadata(refinedMetadata);

        // If it's a YouTube-like upload or missing clean artwork, try to find HQ Square
        if (!refinedMetadata.cover || refinedMetadata.cover.includes('ytimg.com')) {
            const hqCover = await ExternalMetadataService.getHighQualitySquareCover(refinedMetadata.title, refinedMetadata.artist, refinedMetadata.album);
            if (hqCover) refinedMetadata.cover = hqCover;
        }

        const resolved = await ArtistMappingService.resolveArtist(refinedMetadata.artist);
        
        let artist;
        if (resolved.id) {
            // Found a confident match
            artist = await prisma.artist.findUnique({ where: { id: resolved.id } });
        }

        if (!artist) {
            // Create new or confirmed canonical
            const canonical = CANONICAL_ARTISTS[resolved.name.toLowerCase()];
            const aiBio = await AIArtistService.generateArtistBio(resolved.name);
            
            artist = await prisma.artist.upsert({
                where: { name: resolved.name },
                update: {},
                create: {
                    name: resolved.name,
                    bio: canonical?.bio || aiBio || `Rising talent in ${fields.genre || "the industry"}.`,
                    // @ts-ignore
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : undefined,
                    imageUrl: "https://ui-avatars.com/api/?name=" + encodeURIComponent(resolved.name)
                }
            });
        }

        // Combine suggested featured artists with any in fields
        const featuredFromAI = resolved.featuredNames?.join(', ') || '';
        const finalFeatured = [fields.featuredArtists, refinedMetadata.featuredArtists, featuredFromAI].filter(Boolean).join(', ');

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
                title: refinedMetadata.title.trim(),
                artistId: artist.id,
                audioUrl: audioUrl,
                coverUrl: refinedMetadata.cover || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
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
        // Master Intake Intelligent Refinement
        const refined: any = {
            title: data.title || "External Track",
            artist: data.artistName || "Unknown Artist",
            album: data.albumTitle || "",
            cover: data.coverUrl || ""
        };

        ExternalMetadataService.refineMetadata(refined);

        // Fetch HQ Square if missing or low quality
        if (!refined.cover || refined.cover.includes('ytimg.com')) {
            const hqCover = await ExternalMetadataService.getHighQualitySquareCover(refined.title, refined.artist, refined.album);
            if (hqCover) refined.cover = hqCover;
        }

        const resolved = await ArtistMappingService.resolveArtist(refined.artist);
        
        let artist;
        if (resolved.id) {
            artist = await prisma.artist.findUnique({ where: { id: resolved.id } });
        }

        if (!artist) {
            const canonical = CANONICAL_ARTISTS[resolved.name.toLowerCase()];
            const aiBio = await AIArtistService.generateArtistBio(resolved.name);

            artist = await prisma.artist.upsert({
                where: { name: resolved.name },
                update: {},
                create: {
                    name: resolved.name,
                    bio: canonical?.bio || aiBio || "Generating music that resonates with the soul.",
                    // @ts-ignore
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : undefined,
                    imageUrl: "https://ui-avatars.com/api/?name=" + encodeURIComponent(resolved.name)
                }
            });
        }

        // Extract other data from payload
        const { audioUrl, genre, duration } = data;

        // Add detected secondary artists to featured
        const featuredFromAI = resolved.featuredNames?.join(', ') || '';
        const finalFeatured = [data.featuredArtists, refined.featuredArtists, featuredFromAI].filter(Boolean).join(', ');

        // Create or find album if provided and valid
        let albumId = undefined;

        // Determine movie / single classification
        const classification = await AIArtistService.classifyTrack(refined.title, refined.artist, refined.album, data.description || refined.description);
        
        if (classification.isMovie && classification.movieName) {
            const normalizedMovieName = classification.movieName
                .toLowerCase()
                .trim()
                .replace(/\(.*?\)/g, '')
                .replace(/\[.*?\]/g, '')
                .replace(/soundtrack/ig, '')
                .replace(/ost/ig, '')
                .trim();
            
            const exactMovieName = classification.movieName.trim();
            const fingerprint = exactMovieName.toLowerCase().replace(/[^a-z0-9]/g, '');

            console.log(`[Import] Track classified as MOVIE: ${exactMovieName} (Fingerprint: ${fingerprint})`);

            // Apply Lock to prevent race conditions during bulk imports
            if (TrackService.importLocks.has(fingerprint)) {
                console.log(`[Import] Waiting for active lock on album: ${fingerprint}`);
                await TrackService.importLocks.get(fingerprint);
            }
            
            let lockResolver!: () => void;
            TrackService.importLocks.set(fingerprint, new Promise(resolve => lockResolver = resolve));

            try {
                // Fetch all recent albums to do a robust manual match unaffected by exact spacing
                // E.g. "GenGee" and "Gen Gee" both match "gengee"
                const recentAlbums = await prisma.album.findMany({
                    select: { id: true, title: true }
                });

                let album = recentAlbums.find(a => a.title.toLowerCase().replace(/[^a-z0-9]/g, '') === fingerprint);

                if (!album) {
                    console.log(`[Import] Creating new MOVIE ALBUM: ${exactMovieName}`);
                    album = await prisma.album.create({
                        data: {
                            title: exactMovieName,
                            artistId: artist.id, 
                            coverUrl: refined.cover
                        }
                    });
                } else {
                    console.log(`[Import] Found existing MOVIE ALBUM: ${album.title} (Matches fingerprint)`);
                }
                albumId = album.id;
            } finally {
                lockResolver();
                TrackService.importLocks.delete(fingerprint);
            }
        } else {
            console.log(`[Import] Track classified as SINGLE. No album assigned.`);
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

        // Duplicate Check
        const existingTrack = await prisma.track.findFirst({
            where: {
                title: refined.title,
                artistId: artist.id
            },
            include: { artist: true, album: true }
        });

        if (existingTrack) {
            console.log(`[Import] Track "${refined.title}" already exists.`);

            const updateData: any = {
                deletedAt: null // Restore if it was soft-deleted
            };

            if (albumId && existingTrack.albumId !== albumId) {
                updateData.albumId = albumId;
                updateData.trackNumber = data.trackNumber ? Number(data.trackNumber) : existingTrack.trackNumber;
            }

            return prisma.track.update({
                where: { id: existingTrack.id },
                data: updateData,
                include: { artist: true, album: true }
            });
        }

        return prisma.track.create({
            data: {
                title: refined.title || "External Track",
                artistId: artist.id,
                albumId,
                audioUrl,
                coverUrl: refined.cover || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
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
