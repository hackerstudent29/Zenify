import { FastifyInstance } from 'fastify';
import { ExternalMetadataService } from './external-metadata.service';
import { prisma } from '../utils/prisma';
import { CreateTrackInput, UpdateTrackInput, TrackQuery } from '../controllers/track.schemas';
import cloudinary, { uploadUrlToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';
import { uploadToR2, uploadUrlToR2, deleteUrlFromR2 } from '../utils/s3';
import { enqueueImport } from '../queues/import.queue';
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
    private static trackImportLocks = new Map<string, Promise<void>>();

    constructor(private server: FastifyInstance) { }

    async create(data: CreateTrackInput) {
        const { artistId, albumId, tags, releaseDate, ...rest } = data;

        let coverUrl = rest.coverUrl;
        if (coverUrl) {
            coverUrl = await uploadUrlToCloudinary(coverUrl, 'zenify/covers') || undefined;
        }

        const isExternalSource = !!(rest.audioUrl && (
            rest.audioUrl.includes('youtube.com') ||
            rest.audioUrl.includes('youtu.be') ||
            rest.audioUrl.includes('youtube-nocookie.com') ||
            rest.audioUrl.includes('googlevideo.com') ||
            rest.audioUrl.includes('cobalt') ||
            rest.audioUrl.includes('/tunnel') ||
            !rest.audioUrl.startsWith('http')
        ));

        let audioUrl = rest.audioUrl || "";
        if (rest.audioUrl && !isExternalSource) {
            audioUrl = await uploadUrlToR2(rest.audioUrl, 'zenify/tracks') || "";
        } else if (isExternalSource) {
            audioUrl = "";
        }

        const track = await prisma.track.create({
            data: {
                ...rest,
                coverUrl,
                audioUrl,
                releaseDate: releaseDate ? new Date(releaseDate) : null,
                artist: { connect: { id: artistId } },
                album: albumId ? { connect: { id: albumId } } : undefined,
                tags: tags || [],
                releaseStatus: isExternalSource ? "PENDING" : (rest.releaseStatus || "PUBLISHED")
            },
            include: { artist: true, album: { include: { artist: true } } }
        });

        if (isExternalSource && rest.audioUrl) {
            await enqueueImport({
                trackId: track.id,
                youtubeUrl: rest.audioUrl,
                title: track.title,
                artistName: track.artist.name,
            });
        }

        return track;
    }

    async findAll(query: TrackQuery, isAdmin = false) {
        const { cursor, limit = 20 } = query;

        const tracks = await prisma.track.findMany({
            take: limit + 1,
            cursor: cursor ? { id: cursor } : undefined,
            where: { 
                deletedAt: null,
                ...(isAdmin ? {} : {
                    OR: [
                        { releaseStatus: 'PUBLISHED' },
                        { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                    ]
                })
            },
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

    async findOne(id: string, isAdmin = false) {
        const track = await prisma.track.findFirst({
            where: { 
                id, 
                deletedAt: null,
                ...(isAdmin ? {} : {
                    OR: [
                        { releaseStatus: 'PUBLISHED' },
                        { releaseStatus: 'SCHEDULED', scheduledAt: { lte: new Date() } }
                    ]
                })
            },
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

        const { artistName, artistId, albumId, tags, trackType, ...rest } = data;
        let finalArtistId = artistId || track.artistId;

        if (artistName) {
            const resolved = await ArtistMappingService.resolveArtist(artistName);
            
            let artist: import('@prisma/client').Artist | null = null;
            if (resolved.id) {
                artist = await prisma.artist.findUnique({ where: { id: resolved.id } });
            }

            if (!artist) {
                const canonical = CANONICAL_ARTISTS[resolved.name.toLowerCase()];
                const enriched = await AIArtistService.enrichArtistProfile(resolved.name);

                artist = await prisma.artist.upsert({
                    where: { name: resolved.name },
                    update: {},
                    create: {
                        name: resolved.name,
                        bio: canonical?.bio || enriched.bio || "Generated via update",
                        birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : enriched.dob,
                        imageUrl: enriched.imageUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(resolved.name),
                        coverUrl: enriched.coverUrl || null,
                        role: enriched.genre || null
                    }
                });
            }
            finalArtistId = artist.id;
        }

        const isExternalSource = !!(data.audioUrl && (
            data.audioUrl.includes('youtube.com') ||
            data.audioUrl.includes('youtu.be') ||
            data.audioUrl.includes('youtube-nocookie.com') ||
            data.audioUrl.includes('googlevideo.com') ||
            data.audioUrl.includes('cobalt') ||
            data.audioUrl.includes('/tunnel') ||
            !data.audioUrl.startsWith('http')
        ));

        let coverUrl = rest.coverUrl;
        if (coverUrl !== undefined && coverUrl !== track.coverUrl) {
            coverUrl = coverUrl ? await uploadUrlToCloudinary(coverUrl, 'zenify/covers') || null : null;
        }

        let audioUrl = data.audioUrl;
        if (audioUrl !== undefined && audioUrl !== track.audioUrl) {
            if (isExternalSource) {
                audioUrl = "";
            } else if (audioUrl) {
                audioUrl = await uploadUrlToR2(audioUrl, 'zenify/tracks') || "";
            }
        } else {
            audioUrl = track.audioUrl;
        }
        
        // Multi-artist extraction
        if (artistName && typeof artistName === 'string') {
            const splitArtists = artistName.split(/\s*[,&]\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+/i)
                .map(a => a.trim())
                .filter(a => a.length > 0);
            
            if (splitArtists.length > 1) {
                // The first artist is the main artist, the rest are featured
                const mainArtistName = splitArtists[0];
                const featured = splitArtists.slice(1).join(', ');
                
                // We re-resolve the main artist using AI
                const normalizedMain = normalizeArtistName(mainArtistName);
                const mainCanonical = CANONICAL_ARTISTS[normalizedMain.toLowerCase()];
                const mainEnriched = await AIArtistService.enrichArtistProfile(normalizedMain);
                
                const mainArtist = await prisma.artist.upsert({
                    where: { name: normalizedMain },
                    update: {},
                    create: {
                        name: normalizedMain,
                        bio: mainCanonical?.bio || mainEnriched.bio || "Generated via extraction",
                        birthDate: mainCanonical?.birthDate ? new Date(mainCanonical.birthDate) : mainEnriched.dob,
                        imageUrl: mainEnriched.imageUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(normalizedMain),
                        coverUrl: mainEnriched.coverUrl || null,
                        role: mainEnriched.genre || null
                    }
                });
                finalArtistId = mainArtist.id;
                rest.featuredArtists = featured; // Save featured string to track
                
                // Fire off background creation for the featured artists so they get profiles too!
                Promise.all(splitArtists.slice(1).map(async (featName) => {
                    const normFeat = normalizeArtistName(featName);
                    const exist = await prisma.artist.findUnique({ where: { name: normFeat } });
                    if (!exist) {
                        const enr = await AIArtistService.enrichArtistProfile(normFeat);
                        await prisma.artist.create({
                            data: {
                                name: normFeat,
                                bio: enr.bio || "Featured artist",
                                imageUrl: enr.imageUrl || "https://ui-avatars.com/api/?name=" + encodeURIComponent(normFeat),
                                coverUrl: enr.coverUrl || null,
                                role: enr.genre || null
                            }
                        });
                    }
                })).catch(err => console.error("Error creating featured artists in background", err));
            }
        }

        const updatedTrack = await prisma.track.update({
            where: { id },
            data: {
                ...rest,
                track_type: trackType !== undefined ? trackType : undefined,
                coverUrl: coverUrl !== undefined ? coverUrl : undefined,
                audioUrl: audioUrl,
                artist: { connect: { id: finalArtistId } },
                album: albumId ? { connect: { id: albumId } } : (albumId === null ? { disconnect: true } : undefined),
                tags: tags || undefined,
                genre: data.genre || "Pop",
                releaseStatus: isExternalSource ? "PENDING" : (data.releaseStatus || "PUBLISHED")
            },
            include: { artist: true, album: true }
        });

        // Cleanup old replaced assets
        if (coverUrl !== undefined && track.coverUrl && track.coverUrl !== coverUrl) {
            await deleteFromCloudinary(track.coverUrl);
        }
        if (data.audioUrl !== undefined && track.audioUrl && track.audioUrl !== audioUrl) {
            await deleteUrlFromR2(track.audioUrl);
        }

        if (isExternalSource) {
            await enqueueImport({
                trackId: updatedTrack.id,
                youtubeUrl: data.audioUrl,
                title: updatedTrack.title,
                artistName: updatedTrack.artist.name,
                userId: updatedTrack.userId || undefined
            });
        }

        return updatedTrack;
    }

    async updateWithUpload(id: string, parts: any, userId?: string) {
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
                console.log(`[Update] Processing file part: ${part.fieldname} (${part.filename})`);

                let audioBuffer: Buffer | null = null;
                try {
                    if (part.fieldname === 'audio') {
                        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
                        const fileKey = `zenify/tracks/${uniqueSuffix}${path.extname(part.filename)}`;
                        
                        const chunks: any[] = [];
                        for await (const chunk of part.file) {
                            chunks.push(chunk);
                        }
                        audioBuffer = Buffer.concat(chunks);
                        
                        const mimeType = part.mimetype || 'audio/mpeg';
                        audioUrl = await uploadToR2(fileKey, audioBuffer, mimeType);
                    } else {
                        const uploadPromise = new Promise((resolve, reject) => {
                            const uploadStream = cloudinary.uploader.upload_stream(
                                {
                                    resource_type: 'image',
                                    folder: 'zenify/covers',
                                    public_id: `upload-${Date.now()}-${Math.round(Math.random() * 1E9)}`,
                                },
                                (error, result) => {
                                    if (error) reject(error);
                                    else resolve(result);
                                }
                            );

                            part.file.on('error', (err: any) => reject(err));
                            part.file.pipe(uploadStream);
                        });

                        const result: any = await uploadPromise;
                        coverUrl = result.secure_url;
                    }
                } catch (uploadErr) {
                    console.error(`[Update] Upload failed for ${part.fieldname}:`, uploadErr);
                    if (process.env.NODE_ENV !== 'production') {
                        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                        const filename = `${uniqueSuffix}${path.extname(part.filename)}`;
                        const savePath = path.join(uploadDir, filename);
                        
                        if (part.fieldname === 'audio') {
                            if (audioBuffer) {
                                fs.writeFileSync(savePath, audioBuffer);
                            } else {
                                const chunks: any[] = [];
                                for await (const chunk of part.file) { chunks.push(chunk); }
                                fs.writeFileSync(savePath, Buffer.concat(chunks));
                            }
                        } else {
                            await pipeline(part.file, fs.createWriteStream(savePath));
                        }
                        
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

        // Build the update data
        const updateData = { ...fields };
        if (audioUrl) updateData.audioUrl = audioUrl;
        if (coverUrl) updateData.coverUrl = coverUrl;

        // Number coercions for fields that updateTrackSchema expects as numbers or booleans
        if (updateData.duration) updateData.duration = parseInt(updateData.duration, 10);
        if (updateData.bpm) updateData.bpm = parseFloat(updateData.bpm);
        if (updateData.isUnlisted === 'true') updateData.isUnlisted = true;
        if (updateData.isUnlisted === 'false') updateData.isUnlisted = false;
        if (updateData.allowDownloads === 'true') updateData.allowDownloads = true;
        if (updateData.allowDownloads === 'false') updateData.allowDownloads = false;
        if (updateData.enableComments === 'true') updateData.enableComments = true;
        if (updateData.enableComments === 'false') updateData.enableComments = false;

        return this.update(id, updateData);
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
        // Fetch explicitly featured tracks
        const featured = await prisma.track.findMany({
            where: { isFeatured: true, deletedAt: null },
            include: { artist: true, album: true },
            take: 15
        });

        // If less than 15, pad with the newest tracks automatically
        if (featured.length < 15) {
            const newest = await prisma.track.findMany({
                where: { 
                    deletedAt: null, 
                    id: { notIn: featured.map((f: any) => f.id) } 
                },
                include: { artist: true, album: true },
                orderBy: { createdAt: 'desc' },
                take: 15 - featured.length
            });
            return [...featured, ...newest];
        }
        
        return featured;
    }

    async getTrending() {
        // Automatically fetch the highest streamed tracks (most played)
        return prisma.track.findMany({
            where: { deletedAt: null },
            include: { artist: true, album: true },
            orderBy: { streams: 'desc' },
            take: 15
        });
    }

    async incrementStreamCount(id: string, userId?: string, sessionData?: { listenDuration?: number; skipped?: boolean; completionRate?: number }) {
        prisma.track.update({
            where: { id },
            data: {
                streams: { increment: 1 },
                artist: { update: { totalStreams: { increment: 1 } } }
            }
        }).catch((err: any) => this.server.log.error(err));

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Update Daily Track Analytics (global) streams
        prisma.trackAnalytics.upsert({
            where: { trackId_date: { trackId: id, date: today } },
            create: { trackId: id, date: today, stream_count: 1, total_listen_time: 0 },
            update: { stream_count: { increment: 1 } }
        }).catch((err: any) => this.server.log.error(err));

        if (userId) {
            // Record user history (Chronological)
            prisma.history.create({
                data: { userId, trackId: id }
            }).catch((err: any) => this.server.log.error(err));

            // Update stats (Aggregated)
            prisma.userTrackStat.upsert({
                where: { userId_trackId: { userId, trackId: id } },
                create: {
                    userId, trackId: id, streamCount: 1, lastStreamedAt: new Date(),
                    skipCount: sessionData?.skipped ? 1 : 0,
                    totalListenDuration: sessionData?.listenDuration || 0,
                    completionRateAvg: sessionData?.completionRate || 0,
                },
                update: {
                    streamCount: { increment: 1 },
                    lastStreamedAt: new Date(),
                    skipCount: sessionData?.skipped ? { increment: 1 } : undefined,
                }
            }).catch((err: any) => this.server.log.error(err));
        }
    }

    async incrementListenDuration(id: string, userId: string, durationSeconds: number, progress?: number) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Update User Specific Stats
        prisma.userTrackStat.update({
            where: { userId_trackId: { userId, trackId: id } },
            data: {
                totalListenDuration: { increment: durationSeconds },
                resumeProgress: progress !== undefined ? progress : undefined
            }
        }).catch((err: any) => this.server.log.error(err));

        // Update User's Daily Analytics (for Trends)
        const minutes = Math.max(1, Math.round(durationSeconds / 60));
        prisma.userDailyStat.upsert({
            where: { userId_date: { userId, date: today } },
            create: { userId, date: today, minutesListened: minutes },
            update: { minutesListened: { increment: minutes } }
        }).catch((err: any) => this.server.log.error(err));

        // Update Daily Track Analytics (global) listen time
        prisma.trackAnalytics.upsert({
            where: { trackId_date: { trackId: id, date: today } },
            create: { trackId: id, date: today, total_listen_time: durationSeconds, stream_count: 0 },
            update: { total_listen_time: { increment: durationSeconds } }
        }).catch((err: any) => this.server.log.error(err));
    }

    async incrementDownloadCount(id: string) {
        // @ts-ignore
        prisma.track.update({
            where: { id },
            data: { downloads: { increment: 1 } }
        }).catch((err: any) => this.server.log.error(err));
    }

    async updateTrackDuration(id: string, durationSeconds: number) {
        try {
            const track = await prisma.track.findUnique({
                where: { id },
                select: { duration: true }
            });
            if (track && track.duration !== durationSeconds) {
                console.log(`[TrackService] Updating track "${id}" duration: ${track.duration}s -> ${durationSeconds}s`);
                await prisma.track.update({
                    where: { id },
                    data: { duration: durationSeconds }
                });
            }
        } catch (err: any) {
            this.server.log.error(`Failed to update track duration for ${id}: ${err.message}`);
        }
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

                let audioBuffer: Buffer | null = null;
                try {
                    if (part.fieldname === 'audio') {
                        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
                        const fileKey = `zenify/tracks/${uniqueSuffix}${path.extname(part.filename)}`;
                        
                        // Buffer the Fastify stream to prevent S3 Content-Length / stream consumptions issues
                        const chunks: any[] = [];
                        for await (const chunk of part.file) {
                            chunks.push(chunk);
                        }
                        audioBuffer = Buffer.concat(chunks);
                        
                        const mimeType = part.mimetype || 'audio/mpeg';
                        audioUrl = await uploadToR2(fileKey, audioBuffer, mimeType);
                        console.log(`[Upload] R2 upload success for audio:`, audioUrl);
                    } else {
                        // Upload cover directly to Cloudinary via stream
                        const uploadPromise = new Promise((resolve, reject) => {
                            const uploadStream = cloudinary.uploader.upload_stream(
                                {
                                    resource_type: 'image',
                                    folder: 'zenify/covers',
                                    public_id: `upload-${Date.now()}-${Math.round(Math.random() * 1E9)}`,
                                },
                                (error, result) => {
                                    if (error) reject(error);
                                    else resolve(result);
                                }
                            );

                            part.file.on('error', (err: any) => {
                                console.error(`[Upload] Stream error for cover:`, err);
                                reject(err);
                            });

                            part.file.pipe(uploadStream);
                        });

                        const result: any = await uploadPromise;
                        coverUrl = result.secure_url;
                        console.log(`[Upload] Cloudinary upload success for cover:`, coverUrl);
                    }
                } catch (uploadErr) {
                    console.error(`[Upload] Upload failed for ${part.fieldname}:`, uploadErr);
                    // Fallback to local storage only if upload fails and we are not in prod
                    if (process.env.NODE_ENV !== 'production') {
                        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                        const filename = `${uniqueSuffix}${path.extname(part.filename)}`;
                        const savePath = path.join(uploadDir, filename);
                        
                        if (part.fieldname === 'audio') {
                            if (audioBuffer) {
                                fs.writeFileSync(savePath, audioBuffer);
                            } else {
                                // In case it failed before buffer was filled, read from part.file
                                const chunks: any[] = [];
                                for await (const chunk of part.file) {
                                    chunks.push(chunk);
                                }
                                fs.writeFileSync(savePath, Buffer.concat(chunks));
                            }
                        } else {
                            await pipeline(part.file, fs.createWriteStream(savePath));
                        }
                        
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

        // Always try to fetch iTunes metadata to get the official release date and genre if not manually provided
        if (!refinedMetadata.releaseDate) {
            const hqMeta = await ExternalMetadataService.searchITunesMetadata(refinedMetadata.title, refinedMetadata.artist, refinedMetadata.album);
            if (hqMeta) {
                if (hqMeta.coverUrl && (!refinedMetadata.cover || refinedMetadata.cover.includes('ytimg.com'))) {
                    refinedMetadata.cover = hqMeta.coverUrl;
                }
                if (hqMeta.releaseDate) {
                    refinedMetadata.releaseDate = hqMeta.releaseDate;
                }
            }
        }

        const resolved = await ArtistMappingService.resolveArtist(refinedMetadata.artist);
        
        let artist: import('@prisma/client').Artist | null = null;
        if (resolved.id) {
            // Found a confident match
            artist = await prisma.artist.findUnique({ where: { id: resolved.id } });
        }

        if (!artist) {
            // Create new or confirmed canonical immediately
            const canonical = CANONICAL_ARTISTS[resolved.name.toLowerCase()];
            artist = await prisma.artist.upsert({
                where: { name: resolved.name },
                update: {},
                create: {
                    name: resolved.name,
                    bio: canonical?.bio || `Rising talent in ${fields.genre || "the industry"}.`,
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : null,
                    imageUrl: null,
                    coverUrl: null,
                    role: null
                }
            });

            AIArtistService.enrichArtistProfile(resolved.name).then(async (enriched) => {
                await prisma.artist.update({
                    where: { id: artist!.id },
                    data: {
                        bio: canonical?.bio || enriched.bio || `Rising talent in ${fields.genre || "the industry"}.`,
                        birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : enriched.dob,
                        imageUrl: enriched.imageUrl || null,
                        coverUrl: enriched.coverUrl || null,
                        role: enriched.genre || null
                    }
                });
            }).catch(e => console.error(`[Upload] Background enrichment failed for ${resolved.name}:`, e.message));
        }

        // Combine suggested featured artists with any in fields
        const featuredFromAI = resolved.featuredNames?.join(', ') || '';
        const rawFeaturedArr = [fields.featuredArtists, refinedMetadata.featuredArtists, featuredFromAI]
            .filter(Boolean)
            .map(s => String(s))
            .flatMap(s => s.split(','))
            .map(s => s.trim())
            .filter(Boolean);
        const uniqueFeaturedNames = Array.from(new Set(rawFeaturedArr));
        const finalFeatured = uniqueFeaturedNames.join(', ');

        // Create profiles for featured artists so they have their own pages (background processing)
        for (const fn of uniqueFeaturedNames) {
            const normName = normalizeArtistName(fn);
            
            await prisma.artist.upsert({
                where: { name: normName },
                update: {},
                create: {
                    name: normName,
                    bio: `Featured artist on ${refinedMetadata.title}`,
                }
            }).catch(e => console.error(`[Upload] Failed to init featured artist "${normName}":`, e.message));

            // Run AI enrichment in background
            AIArtistService.enrichArtistProfile(normName).then(async (enriched) => {
                await prisma.artist.update({
                    where: { name: normName },
                    data: {
                        bio: enriched.bio || `Featured artist on ${refinedMetadata.title}`,
                        imageUrl: enriched.imageUrl || null,
                        coverUrl: enriched.coverUrl || null,
                        birthDate: enriched.dob || null,
                        role: enriched.genre || null
                    }
                });
            }).catch(e => console.error(`[Upload] Background featured artist enrichment failed for "${normName}":`, e.message));
        }

        // Validate that the user exists before linking
        let validUserId = userId;
        if (userId) {
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!userExists) {
                console.warn(`[Upload] userId "${userId}" not found in DB, uploading without user link.`);
                validUserId = undefined;
            }
        }

        const isExternalSource = !!(audioUrl && (
            audioUrl.includes('youtube.com') ||
            audioUrl.includes('youtu.be') ||
            audioUrl.includes('youtube-nocookie.com') ||
            audioUrl.includes('googlevideo.com') ||
            audioUrl.includes('cobalt') ||
            audioUrl.includes('/tunnel') ||
            !audioUrl.startsWith('http')
        ));

        let finalCover = refinedMetadata.cover;
        if (finalCover) {
            finalCover = await uploadUrlToCloudinary(finalCover, 'zenify/covers') || undefined;
        }

        const newTrack = await prisma.track.create({
            data: {
                title: refinedMetadata.title.trim(),
                artistId: artist.id,
                audioUrl: isExternalSource ? "" : audioUrl,
                coverUrl: finalCover || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
                duration: fields.duration ? parseInt(fields.duration) : 180,
                genre: fields.genre && fields.genre !== 'Unknown' ? fields.genre : await AIArtistService.predictTrackGenre(refinedMetadata.title, artist.name),
                lyrics: fields.lyrics || "",
                description: fields.description || "",
                streams: 0,
                userId: validUserId,
                albumId: fields.albumId || null,
                // New Fields
                isUnlisted: fields.isUnlisted === 'true',
                allowDownloads: fields.allowDownloads === 'true',
                enableComments: fields.enableComments === 'true',
                releaseStatus: isExternalSource ? "PENDING" : (fields.releaseStatus || "PUBLISHED"),
                scheduledAt: fields.scheduledAt && !isNaN(new Date(fields.scheduledAt).getTime()) ? new Date(fields.scheduledAt) : null,
                copyrightLabel: fields.copyrightLabel || null,
                bpm: fields.bpm ? parseInt(fields.bpm) : null,
                key: fields.key || null,
                composers: fields.composers || null,
                featuredArtists: finalFeatured || null,
                synced_lyrics: fields.synced_lyrics ? JSON.parse(fields.synced_lyrics) : null,
                raw_lrc: fields.raw_lrc || null,
                releaseDate: (refinedMetadata.releaseDate && !isNaN(new Date(refinedMetadata.releaseDate).getTime()))
                    ? new Date(refinedMetadata.releaseDate)
                    : null,
            },
            include: { artist: true, album: true }
        });

        if (isExternalSource) {
            await enqueueImport({
                trackId: newTrack.id,
                youtubeUrl: audioUrl,
                title: refinedMetadata.title,
                artistName: artist.name,
                userId: validUserId
            });
        }

        return newTrack;
    }

    async importExternal(data: any, userId?: string) {
        const fingerprint = `${data.title || ''}:${data.artistName || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (TrackService.trackImportLocks.has(fingerprint)) {
            console.log(`[Import] Waiting for existing import lock for track: ${fingerprint}`);
            await TrackService.trackImportLocks.get(fingerprint);
        }
        
        let lockResolver!: () => void;
        TrackService.trackImportLocks.set(fingerprint, new Promise(resolve => lockResolver = resolve));
        
        try {
            return await this._importExternalCore(data, userId);
        } finally {
            lockResolver();
            TrackService.trackImportLocks.delete(fingerprint);
        }
    }

    private async _importExternalCore(data: any, userId?: string) {
        // Master Intake Intelligent Refinement
        const refined: any = {
            title: data.title || "External Track",
            artist: data.artistName || "Unknown Artist",
            album: data.albumTitle || "",
            cover: data.coverUrl || ""
        };

        ExternalMetadataService.refineMetadata(refined);
        console.log(`[Import] Refined Metadata:`, JSON.stringify(refined, null, 2));

        // Task 1, 2 & 3: Parallel AI & Metadata Resolution
        const genericAlbumTitles = ["", "single", "unknown album", "various artists", "unknown"];
        const currentAlbum = (refined.album || "").trim();
        const hasSubstantialAlbum = currentAlbum && !genericAlbumTitles.includes(currentAlbum.toLowerCase());

        const [resolved, iTunesMeta, classification] = await Promise.all([
            ArtistMappingService.resolveArtist(refined.artist),
            ExternalMetadataService.searchITunesMetadata(refined.title, refined.artist, refined.album).catch(() => null),
            (!hasSubstantialAlbum)
                ? AIArtistService.classifyTrack(refined.title, refined.artist, refined.album, data.description || refined.description)
                : Promise.resolve({ isMovie: false, movieName: null })
        ]);

        if (iTunesMeta) {
            if (iTunesMeta.coverUrl && (!refined.cover || refined.cover.includes('ytimg.com'))) {
                refined.cover = iTunesMeta.coverUrl;
            }
            if (iTunesMeta.releaseDate) refined.releaseDate = iTunesMeta.releaseDate;
            if (iTunesMeta.genre && (!data.genre || data.genre === 'Unknown')) refined.genre = iTunesMeta.genre;
        }
        
        let artist: import('@prisma/client').Artist | null = null;
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
                    bio: canonical?.bio || "Generating music that resonates with the soul.",
                    birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : null,
                    imageUrl: null,
                    coverUrl: null,
                    role: null
                }
            });

            // Trigger AI enrichment in background
            AIArtistService.enrichArtistProfile(resolved.name).then(async (enriched) => {
                await prisma.artist.update({
                    where: { id: artist!.id },
                    data: {
                        bio: canonical?.bio || enriched.bio || "Generating music that resonates with the soul.",
                        birthDate: canonical?.birthDate ? new Date(canonical.birthDate) : enriched.dob,
                        imageUrl: enriched.imageUrl || null,
                        coverUrl: enriched.coverUrl || null,
                        role: enriched.genre || null
                    }
                });
            }).catch(e => console.error(`[Import] Background enrichment failed for ${resolved.name}:`, e.message));
        }

        // Extract other data from payload
        let audioUrl = data.audioUrl;
        if (audioUrl && audioUrl.includes('/stream-youtube') && audioUrl.includes('url=')) {
            try {
                const urlObj = new URL(audioUrl.startsWith('http') ? audioUrl : `http://localhost${audioUrl}`);
                const extracted = urlObj.searchParams.get('url');
                if (extracted) {
                    audioUrl = extracted;
                    console.log(`[Import] Extracted original YouTube URL from stream proxy: ${audioUrl}`);
                }
            } catch (err: any) {
                console.warn(`[Import] Failed to parse YouTube URL from stream proxy:`, err.message);
            }
        }
        const { genre, duration } = data;

        // Add detected secondary artists to featured
        const featuredFromAI = resolved.featuredNames?.join(', ') || '';
        const rawFeaturedArr = [data.featuredArtists, refined.featuredArtists, featuredFromAI]
            .filter(Boolean)
            .map(s => String(s))
            .flatMap(s => s.split(','))
            .map(s => s.trim())
            .filter(Boolean);
        const uniqueFeaturedNames = Array.from(new Set(rawFeaturedArr));
        const finalFeatured = uniqueFeaturedNames.join(', ');

        // Create profiles for featured artists so they have their own pages (background processing)
        for (const fn of uniqueFeaturedNames) {
            const normName = normalizeArtistName(fn);
            
            await prisma.artist.upsert({
                where: { name: normName },
                update: {},
                create: {
                    name: normName,
                    bio: `Featured artist on ${refined.title}`,
                }
            }).catch(e => console.error(`[Import] Failed to init featured artist "${normName}":`, e.message));

            AIArtistService.enrichArtistProfile(normName).then(async (enriched) => {
                await prisma.artist.update({
                    where: { name: normName },
                    data: {
                        bio: enriched.bio || `Featured artist on ${refined.title}`,
                        imageUrl: enriched.imageUrl || null,
                        coverUrl: enriched.coverUrl || null,
                        birthDate: enriched.dob || null,
                        role: enriched.genre || null
                    }
                });
            }).catch(e => console.error(`[Import] Background featured artist enrichment failed for "${normName}":`, e.message));
        }

        // Create or find album if provided and valid
        let albumId = undefined;

        // Determine movie / single classification
        let albumTitleToUse = "";
        let isMovieAlbum = false;

        if (!hasSubstantialAlbum) {
            if (classification.isMovie && classification.movieName) {
                albumTitleToUse = classification.movieName.trim();
                isMovieAlbum = true;
            } else if (refined.album) {
                albumTitleToUse = refined.album.trim();
            }
        } else {
            albumTitleToUse = currentAlbum;
            // CHECK if this album is a soundtrack or compilation
            const lowerAlbum = albumTitleToUse.toLowerCase();
            if (
                lowerAlbum.includes('soundtrack') || 
                lowerAlbum.includes('motion picture') || 
                lowerAlbum.includes('compilation') ||
                lowerAlbum.includes('various artists') ||
                lowerAlbum.includes('original score') ||
                lowerAlbum.includes('ost')
            ) {
                isMovieAlbum = true;
            }
        }

        if (albumTitleToUse) {
            const fingerprint = albumTitleToUse.toLowerCase().replace(/[^a-z0-9]/g, '');
            console.log(`[Import] Processing album: ${albumTitleToUse} (Movie: ${isMovieAlbum}, Fingerprint: ${fingerprint})`);

            // Apply Lock to prevent race conditions during bulk imports
            if (TrackService.importLocks.has(fingerprint)) {
                await TrackService.importLocks.get(fingerprint);
            }
            
            let lockResolver!: () => void;
            TrackService.importLocks.set(fingerprint, new Promise(resolve => lockResolver = resolve));

            try {
                // Find existing album by title and artist (for regular albums) or just title (for movies)
                const existingAlbum = await prisma.album.findFirst({
                    where: {
                        OR: [
                            // 1. Exact or fingerprint title match for this artist
                            {
                                artistId: artist.id,
                                title: { equals: albumTitleToUse, mode: 'insensitive' }
                            },
                            // 2. Global fingerprint match for movies (which can have multiple artists)
                            isMovieAlbum ? {
                                title: { equals: albumTitleToUse, mode: 'insensitive' }
                            } : { id: 'none' } // Use an impossible condition for non-movies
                        ]
                    }
                });

                const isBulk = data.isBulk === true;

                if (existingAlbum) {
                    console.log(`[Import] Found existing album: ${existingAlbum.title}`);
                    albumId = existingAlbum.id;
                } else if (isBulk) {
                    console.log(`[Import] Creating new album (bulk import): ${albumTitleToUse}`);
                    const newAlbum = await prisma.album.create({
                        data: {
                            title: albumTitleToUse,
                            artistId: artist.id,
                            coverUrl: refined.cover
                        }
                    });
                    albumId = newAlbum.id;
                } else {
                    console.log(`[Import] Skipping album creation for single track import: ${albumTitleToUse}`);
                }
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

        // Duplicate Check: Match if same title + artist AND same album context
        const existingTrack = await prisma.track.findFirst({
            where: {
                title: refined.title,
                artistId: artist.id,
                albumId: albumId !== undefined ? albumId : null, // Strict album match
            },
            include: { artist: true, album: true }
        });
        
        if (existingTrack) {
            console.log(`[Import] Found existing track: "${existingTrack.title}" (ID: ${existingTrack.id}) for refined title: "${refined.title}"`);
        } else {
            console.log(`[Import] No existing track found for "${refined.title}". Creating new...`);
        }

        const isExternalSource = !!(audioUrl && (
            audioUrl.includes('youtube.com') ||
            audioUrl.includes('youtu.be') ||
            audioUrl.includes('youtube-nocookie.com') ||
            audioUrl.includes('googlevideo.com') ||
            audioUrl.includes('cobalt') ||
            audioUrl.includes('/tunnel') ||
            !audioUrl.startsWith('http')
        ));

        let finalCover = refined.cover;
        if (finalCover) {
            finalCover = await uploadUrlToCloudinary(finalCover, 'zenify/covers') || undefined;
        }

        let finalAudioUrl = audioUrl;
        if (finalAudioUrl && !isExternalSource) {
            finalAudioUrl = await uploadUrlToR2(finalAudioUrl, 'zenify/tracks') || undefined;
        } else if (isExternalSource) {
            finalAudioUrl = "";
        }

        if (existingTrack) {
            console.log(`[Import] Track "${refined.title}" already exists.`);

            const coverUrlToSave = finalCover || existingTrack.coverUrl;
            const audioUrlToSave = isExternalSource ? existingTrack.audioUrl : (finalAudioUrl || existingTrack.audioUrl);

            const updateData: any = {
                deletedAt: null, // Restore if it was soft-deleted
                audioUrl: audioUrlToSave,
                coverUrl: coverUrlToSave,
                lyrics: data.lyrics || existingTrack.lyrics,
                synced_lyrics: data.synced_lyrics || existingTrack.synced_lyrics,
                raw_lrc: data.raw_lrc || existingTrack.raw_lrc,
                releaseStatus: isExternalSource ? "PENDING" : (data.releaseStatus || existingTrack.releaseStatus),
                isUnlisted: data.isUnlisted !== undefined ? data.isUnlisted : existingTrack.isUnlisted,
                createdAt: new Date(), // Bump so re-imported track appears in New Arrivals
                releaseDate: (refined.releaseDate && !isNaN(new Date(refined.releaseDate).getTime()))
                    ? new Date(refined.releaseDate)
                    : (existingTrack.releaseDate || null),
            };

            if (albumId) {
                updateData.albumId = albumId;
                updateData.trackNumber = data.trackNumber ? Number(data.trackNumber) : (existingTrack.trackNumber || 1);
            }

            const updated = await prisma.track.update({
                where: { id: existingTrack.id },
                data: updateData,
                include: { artist: true, album: true }
            });

            // Cleanup replaced assets
            if (finalCover && existingTrack.coverUrl && existingTrack.coverUrl !== finalCover) {
                await deleteFromCloudinary(existingTrack.coverUrl);
            }
            if (finalAudioUrl && existingTrack.audioUrl && existingTrack.audioUrl !== finalAudioUrl) {
                await deleteUrlFromR2(existingTrack.audioUrl);
            }

            if (isExternalSource) {
                await enqueueImport({
                    trackId: updated.id,
                    youtubeUrl: audioUrl,
                    title: refined.title,
                    artistName: artist.name,
                    userId: validUserId
                });
            }

            return updated;
        }

        const newTrack = await prisma.track.create({
            data: {
                title: refined.title || "External Track",
                artistId: artist.id,
                albumId,
                audioUrl: isExternalSource ? "" : (finalAudioUrl || ""),
                coverUrl: finalCover || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&auto=format&fit=crop",
                duration: duration ? Math.round(Number(duration)) : 180,
                trackNumber: data.trackNumber ? Number(data.trackNumber) : 1,
                genre: genre && genre !== 'Unknown' ? genre : await AIArtistService.predictTrackGenre(refined.title, artist.name),
                userId: validUserId,
                releaseStatus: isExternalSource ? "PENDING" : (data.releaseStatus || "PUBLISHED"),
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
                copyrightLabel: data.copyrightLabel || null,
                bpm: data.bpm ? parseInt(data.bpm) : null,
                key: data.key || null,
                composers: data.composers || null,
                featuredArtists: finalFeatured || null,
                lyrics: data.lyrics || null,
                synced_lyrics: data.synced_lyrics || null,
                raw_lrc: data.raw_lrc || null,
                releaseDate: (refined.releaseDate && !isNaN(new Date(refined.releaseDate).getTime()))
                    ? new Date(refined.releaseDate)
                    : null,
            },
            include: { artist: true, album: true }
        });

        if (isExternalSource) {
            await enqueueImport({
                trackId: newTrack.id,
                youtubeUrl: audioUrl,
                title: refined.title,
                artistName: artist.name,
                userId: validUserId
            });
        }

        return newTrack;
    }
}
