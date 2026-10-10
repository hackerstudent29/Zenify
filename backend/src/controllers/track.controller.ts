import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TrackService } from '../services/track.service';
import { CreateTrackInput, UpdateTrackInput, TrackQuery } from './track.schemas';
import { AudioProcessorService } from '../services/audio-processor.service';

export class TrackController {
    private trackService: TrackService;

    constructor(server: FastifyInstance) {
        this.trackService = new TrackService(server);
    }

    create = async (req: FastifyRequest<{ Body: CreateTrackInput }>, reply: FastifyReply) => {
        const track = await this.trackService.create(req.body);
        
        // Trigger palette extraction & AI Vision in background
        if (track) {
            if (track.coverUrl) {
                import('../services/palette.service.js').then(({ PaletteService }) => {
                    PaletteService.extractAndSaveTrack(track.id, track.coverUrl!).catch((err: any) => {
                        console.error(`[TrackController] Failed to extract palette for track ${track.id}:`, err);
                    });
                }).catch((err: any) => {
                    console.error('[TrackController] Failed to import PaletteService:', err);
                });
            }

            import('../services/ai-aesthetic.service.js').then(({ AIAestheticService }) => {
                AIAestheticService.syncTrackAesthetic(track.id).catch((err: any) => {
                    console.error(`[TrackController] Failed to sync aesthetic for track ${track.id}:`, err);
                });
            }).catch((err: any) => {
                console.error('[TrackController] Failed to import AIAestheticService:', err);
            });
        }
        
        return reply.status(201).send(track);
    }

    upload = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = (req as any).user?.id;
        const parts = req.parts();
        const track = await this.trackService.upload(parts, userId);
        
        // Trigger palette extraction & AI Vision in background
        if (track) {
            if (track.coverUrl) {
                import('../services/palette.service.js').then(({ PaletteService }) => {
                    PaletteService.extractAndSaveTrack(track.id, track.coverUrl!).catch((err: any) => {
                        console.error(`[TrackController] Failed to extract palette for track ${track.id}:`, err);
                    });
                }).catch((err: any) => {
                    console.error('[TrackController] Failed to import PaletteService:', err);
                });
            }

            import('../services/ai-aesthetic.service.js').then(({ AIAestheticService }) => {
                AIAestheticService.syncTrackAesthetic(track.id).catch((err: any) => {
                    console.error(`[TrackController] Failed to sync aesthetic for track ${track.id}:`, err);
                });
            }).catch((err: any) => {
                console.error('[TrackController] Failed to import AIAestheticService:', err);
            });
        }
        
        return reply.status(201).send(track);
    }

    importExternal = async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
        const userId = (req as any).user?.id;
        const track = await this.trackService.importExternal(req.body, userId);
        
        // Trigger palette extraction & AI Vision in background
        if (track) {
            if (track.coverUrl) {
                import('../services/palette.service.js').then(({ PaletteService }) => {
                    PaletteService.extractAndSaveTrack(track.id, track.coverUrl!).catch((err: any) => {
                        console.error(`[TrackController] Failed to extract palette for track ${track.id}:`, err);
                    });
                }).catch((err: any) => {
                    console.error('[TrackController] Failed to import PaletteService:', err);
                });
            }

            import('../services/ai-aesthetic.service.js').then(({ AIAestheticService }) => {
                AIAestheticService.syncTrackAesthetic(track.id).catch((err: any) => {
                    console.error(`[TrackController] Failed to sync aesthetic for track ${track.id}:`, err);
                });
            }).catch((err: any) => {
                console.error('[TrackController] Failed to import AIAestheticService:', err);
            });
        }
        
        return reply.status(201).send(track);
    }

    importInstant = async (req: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
        const userId = (req as any).user?.id || undefined;
        const data = req.body as any;
        
        console.log(`[ImportInstant] Received instant play request for "${data.title}" by ${data.artistName}`);
        
        try {
            // Step 1: Resolve high-speed playable audio stream URL (<50ms)
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            let audioUrl = data.audioUrl;
            if (audioUrl && audioUrl.startsWith('local:')) {
                audioUrl = undefined;
            }

            // If audioUrl is missing or spotify: URI, resolve full-length playable audio stream URL
            if (!audioUrl || audioUrl.startsWith('spotify:')) {
                console.log(`[ImportInstant] Searching full track audio stream for "${data.title}"...`);
                const audioResult = await ExternalMetadataService.fetchAudio(
                    data.title, 
                    data.artistName, 
                    data.duration || undefined, 
                    undefined,
                    { preview: false, bypassCache: true }
                ).catch((e: any) => {
                    console.warn(`[ImportInstant] Full audio search failed:`, e.message);
                    return null;
                });
                
                if (audioResult && (audioResult.watchUrl || audioResult.url)) {
                    const isItunesPreview = (audioResult.url && (audioResult.url.includes('itunes.apple.com') || audioResult.url.includes('audio-ssl')));
                    if (isItunesPreview && audioResult.watchUrl) {
                        audioUrl = audioResult.watchUrl;
                    } else if (!isItunesPreview && audioResult.url) {
                        audioUrl = audioResult.url;
                    } else if (audioResult.watchUrl) {
                        audioUrl = audioResult.watchUrl;
                    } else {
                        audioUrl = `${data.artistName || 'Unknown'} - ${data.title}`;
                    }
                    console.log(`[ImportInstant] Full track stream resolved: ${audioUrl.slice(0, 80)}`);
                } else {
                    audioUrl = `${data.artistName || 'Unknown'} - ${data.title}`;
                }
            }
            
            // Step 2: Import track into DB
            const track = await this.trackService.importExternal({
                ...data,
                audioUrl,
            }, userId);
            
            if (track) {
                const trackArtistName = track.artist?.name || data.artistName || 'Unknown Artist';

                // ==========================================
                // 🚀 PARALLEL WORKERS SYSTEM FOR INSTANT IMPORT
                // ==========================================

                // WORKER 1: Audio Stream Downloader, 128kbps Transcoder & Cloud R2 Storage Sync
                import('../queues/import.queue.js').then(({ enqueueImport }) => {
                    enqueueImport({
                        trackId: track.id,
                        youtubeUrl: audioUrl,
                        title: track.title,
                        artistName: trackArtistName,
                        duration: track.duration || data.duration,
                        userId: userId,
                        isInstant: true
                    }).catch(err => console.error('[Worker 1: Audio/R2] Failed:', err.message));
                });

                // WORKER 2: Parallel Synced LRC Lyrics Fetcher (Spotify81 / Spotify23 / LRCLIB)
                (async () => {
                    try {
                        const { LyricsEnhancementService } = await import('../services/lyrics-enhancement.service.js');
                        const lrcRes = await LyricsEnhancementService.getLyricsWithCache(track.title, trackArtistName, track.duration || undefined);
                        if (lrcRes && lrcRes.lyrics) {
                            const { prisma } = await import('../utils/prisma.js');
                            await prisma.track.update({
                                where: { id: track.id },
                                data: { lyrics: lrcRes.lyrics }
                            });
                            console.log(`[Worker 2: Lyrics] Successfully synced ${lrcRes.isSynced ? 'LINE_SYNCED' : 'PLAIN'} lyrics for "${track.title}"`);
                        }
                    } catch (lyricErr: any) {
                        console.warn('[Worker 2: Lyrics] Synced lyrics fetch failed:', lyricErr.message);
                    }
                })();

                // WORKER 3: Parallel Track & Artist Details Enrichment (Metadata / Covers / Bios)
                (async () => {
                    try {
                        const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                        const meta = await ExternalMetadataService.searchITunesMetadata(track.title, trackArtistName, data.albumTitle).catch(() => null);
                        if (meta) {
                            const { prisma } = await import('../utils/prisma.js');
                            await prisma.track.update({
                                where: { id: track.id },
                                data: {
                                    genre: meta.genre || undefined,
                                    releaseDate: meta.releaseDate ? new Date(meta.releaseDate) : undefined,
                                    coverUrl: meta.coverUrl && !track.coverUrl ? meta.coverUrl : undefined
                                }
                            });
                            console.log(`[Worker 3: Details] Enriched track metadata for "${track.title}"`);
                        }
                    } catch (metaErr: any) {
                        console.warn('[Worker 3: Details] Metadata enrichment failed:', metaErr.message);
                    }
                })();

                // WORKER 4: Color Palette & Visual Aesthetic Sync Worker
                if (track.coverUrl) {
                    import('../services/palette.service.js').then(({ PaletteService }) => {
                        PaletteService.extractAndSaveTrack(track.id, track.coverUrl!).catch(err => console.error('[Worker 4: Palette] Failed:', err.message));
                    });
                }
                import('../services/ai-aesthetic.service.js').then(({ AIAestheticService }) => {
                    AIAestheticService.syncTrackAesthetic(track.id).catch(err => console.error('[Worker 4: Aesthetic] Failed:', err.message));
                });

                if (audioUrl) {
                    console.log(`[ImportInstant] Using resolved audioUrl for instant playback: ${audioUrl.slice(0, 80)}`);
                    track.audioUrl = audioUrl;
                }
            }
            
            return reply.status(201).send(track);
        } catch (error: any) {
            console.error(`[ImportInstant] Failed to instantly import track:`, error);
            return reply.status(500).send({ error: 'Failed to instant import track' });
        }
    }

    importBatch = async (req: FastifyRequest<{ Body: { tracks: any[], opts?: any } }>, reply: FastifyReply) => {
        const userId = (req as any).user?.id;
        const { tracks, opts } = req.body;
        
        console.log(`[BatchImport] Received ${tracks.length} track(s) for background import. Returning 202 immediately.`);
        
        // Detached promise to process in background
        (async () => {
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            let successCount = 0;
            let failCount = 0;
            
            for (let i = 0; i < tracks.length; i++) {
                const trackData = tracks[i];
                console.log(`[BatchImport] Processing ${i + 1}/${tracks.length}: "${trackData.title}" by ${trackData.artistName}`);
                try {
                    let audioUrl = trackData.audioUrl;
                    let lyrics = trackData.lyrics;
                    
                    if (!audioUrl || audioUrl.startsWith('local:') || audioUrl.includes('itunes.apple.com') || audioUrl.includes('audio-ssl')) {
                        console.log(`[BatchImport] Resolving full audio stream for "${trackData.title}"...`);
                        const audioResult = await ExternalMetadataService.fetchAudio(
                            trackData.title, 
                            trackData.artistName, 
                            trackData.duration, 
                            trackData.customUrl || undefined,
                            { preview: false }
                        ).catch(e => {
                            console.warn(`[BatchImport] Audio search failed for "${trackData.title}":`, e.message);
                            return null;
                        });
                        
                        if (audioResult) {
                            audioUrl = audioResult.watchUrl || audioResult.url;
                            console.log(`[BatchImport] Found audio for "${trackData.title}": ${audioUrl}`);
                        } else {
                            // Search fallback: Use clean search query as audio link target
                            audioUrl = `${trackData.artistName || 'Various Artists'} - ${trackData.title}`;
                            console.log(`[BatchImport] Using search target fallback for "${trackData.title}": ${audioUrl}`);
                        }
                    }
                    
                    if (audioUrl) {
                        const importedTrack = await this.trackService.importExternal({
                            ...trackData,
                            audioUrl,
                            lyrics
                        }, userId);
                        
                        if (importedTrack) {
                            successCount++;
                            if (importedTrack.coverUrl) {
                                import('../services/palette.service.js').then(({ PaletteService }) => {
                                    PaletteService.extractAndSaveTrack(importedTrack.id, importedTrack.coverUrl!).catch(console.error);
                                }).catch(console.error);
                            }
                            import('../services/ai-aesthetic.service.js').then(({ AIAestheticService }) => {
                                AIAestheticService.syncTrackAesthetic(importedTrack.id).catch(console.error);
                            });
                        }
                    } else {
                        failCount++;
                    }
                } catch (e) {
                    failCount++;
                    console.error(`[BatchImport] Failed track: ${trackData.title}`, e);
                }
            }
            console.log(`[BatchImport] ✅ Complete! ${successCount} succeeded, ${failCount} failed out of ${tracks.length} total.`);
        })();
        
        return reply.status(202).send({ message: "Batch import started in the background", total: tracks.length });
    }

    download = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        // @ts-ignore
        await this.trackService.incrementDownloadCount(req.params.id);
        return reply.send({ status: 'downloading' });
    }

    processDownload = async (req: FastifyRequest<{ Params: { id: string }, Querystring: { format?: string, fx?: string, speed?: string, direction8d?: string, freq8d?: string } }>, reply: FastifyReply) => {
        try {
            const track = await this.trackService.findOne(req.params.id);
            if (!track || !track.audioUrl) {
                return reply.status(404).send({ error: 'Track not found or audio missing' });
            }

            const format = req.query.format || 'mp3';
            const fx = req.query.fx || 'flat';
            const speed = parseFloat(req.query.speed || '1.0');
            const direction8D = req.query.direction8d || 'clockwise';
            const freq8D = parseFloat(req.query.freq8d || '0.125');
            
            // Format filename safely
            const artistName = track.artist?.name || 'Unknown Artist';
            const safeTitle = track.title.replace(/[^a-zA-Z0-9 -]/g, '');
            const safeArtist = artistName.replace(/[^a-zA-Z0-9 -]/g, '');
            const fxSuffix = (fx !== 'flat' || speed !== 1.0) ? ` (${fx.toUpperCase()}${speed !== 1.0 ? ` ${speed}x` : ''})` : '';
            const filename = `${safeTitle} - ${safeArtist}${fxSuffix}`;

            await this.trackService.incrementDownloadCount(track.id);

            let audioUrl = track.audioUrl;
            
            const isPreviewOrSpotify = audioUrl ? (
                audioUrl.includes('itunes.apple.com') ||
                audioUrl.includes('audio-ssl') ||
                audioUrl.includes('mzstatic.com') ||
                audioUrl.startsWith('spotify:') ||
                audioUrl.includes('spotify.com')
            ) : true;

            if (isPreviewOrSpotify || !audioUrl) {
                const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                console.log(`[processDownload] Dynamically resolving audio stream for "${track.title}"...`);
                const audioResult = await ExternalMetadataService.fetchAudio(
                    track.title,
                    track.artist?.name || 'Unknown Artist',
                    track.duration || undefined,
                    undefined,
                    { preview: false }
                ).catch((e: any) => {
                    console.warn(`[processDownload] Dynamic audio resolution failed:`, e.message);
                    return null;
                });

                if (audioResult && audioResult.watchUrl && (audioResult.watchUrl.includes('youtube.com') || audioResult.watchUrl.includes('youtu.be'))) {
                    audioUrl = audioResult.watchUrl;
                } else {
                    audioUrl = `${track.artist?.name || 'Unknown'} - ${track.title}`;
                }

                await this.trackService.update(track.id, { audioUrl });
            }

            // If audioUrl is a YouTube URL or query, resolve it to direct media stream link using yt-dlp
            if (audioUrl.includes('youtube.com') || audioUrl.includes('youtu.be') || (!audioUrl.startsWith('http') && !audioUrl.startsWith('uploads/') && !audioUrl.startsWith('/') && !audioUrl.startsWith('zenify/'))) {
                const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
                let targetYtUrl = audioUrl;

                if (!targetYtUrl.startsWith('http')) {
                    const ytCandidates = await ExternalMetadataService.searchYoutubeDirect(targetYtUrl).catch(() => []);
                    if (ytCandidates && ytCandidates.length > 0) {
                        targetYtUrl = `https://www.youtube.com/watch?v=${ytCandidates[0].id}`;
                    } else {
                        return reply.status(404).send({ error: 'Could not resolve track query on YouTube' });
                    }
                }

                try {
                    const { execSync } = await import('child_process');
                    let ytBin = 'yt-dlp';
                    const path = require('path');
                    const fs = require('fs');
                    const localExe = path.resolve(process.cwd(), 'yt-dlp.exe');
                    if (fs.existsSync(localExe)) {
                        ytBin = localExe;
                    }
                    console.log(`[processDownload] Resolving direct stream URL using ${ytBin} for: ${targetYtUrl}`);
                    const directMediaUrl = execSync(`"${ytBin}" -g --force-ipv4 -f "bestaudio[ext=m4a]/bestaudio/best" --no-playlist "${targetYtUrl}"`, { timeout: 15000 }).toString().trim().split('\n')[0];
                    if (directMediaUrl && directMediaUrl.startsWith('http')) {
                        audioUrl = directMediaUrl;
                    } else {
                        throw new Error("Empty resolved URL");
                    }
                } catch (dlpErr: any) {
                    console.warn(`[processDownload] yt-dlp -g resolution failed: ${dlpErr.message}. Falling back to public API...`);
                    const streamUrl = await ExternalMetadataService.fetchYoutubeAudioViaPublicAPI(targetYtUrl).catch(() => null);
                    if (streamUrl) {
                        audioUrl = streamUrl;
                    } else {
                        return reply.status(500).send({ error: 'Failed to resolve YouTube audio stream' });
                    }
                }
            }

            const finalAudioUrl = audioUrl.startsWith('http') ? audioUrl : `https://${audioUrl}`;

            await AudioProcessorService.processAndStream(finalAudioUrl, format, fx, speed, direction8D, freq8D, reply, filename);
        } catch (error: any) {
            console.error('[TrackController] Process download failed:', error);
            if (!reply.raw.headersSent) {
                return reply.status(500).send({ error: 'Failed to process audio for download' });
            }
        }
    }

    getAll = async (req: FastifyRequest<{ Querystring: TrackQuery }>, reply: FastifyReply) => {
        let isAdmin = false;
        try {
            const token = req.headers.authorization 
                ? req.headers.authorization.replace('Bearer ', '') 
                : (req as any).cookies?.accessToken;
            if (token) {
                const decoded = await req.server.jwt.verify(token);
                if (decoded && (decoded as any).role === 'ADMIN') {
                    isAdmin = true;
                }
            }
        } catch (e) {
            // Optional auth verification failed
        }
        return this.trackService.findAll(req.query, isAdmin);
    }

    getFeatured = async (_req: FastifyRequest, _reply: FastifyReply) => {
        return this.trackService.getFeatured();
    }

    getTrending = async (_req: FastifyRequest, _reply: FastifyReply) => {
        return this.trackService.getTrending();
    }

    getOne = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        let isAdmin = false;
        try {
            const token = req.headers.authorization 
                ? req.headers.authorization.replace('Bearer ', '') 
                : (req as any).cookies?.accessToken;
            if (token) {
                const decoded = await req.server.jwt.verify(token);
                if (decoded && (decoded as any).role === 'ADMIN') {
                    isAdmin = true;
                }
            }
        } catch (e) {
            // Optional auth verification failed
        }
        return this.trackService.findOne(req.params.id, isAdmin);
    }

    update = async (req: FastifyRequest<{ Params: { id: string }, Body: any }>, reply: FastifyReply) => {
        if (req.isMultipart()) {
            const userId = (req as any).user?.id;
            const parts = req.parts();
            return this.trackService.updateWithUpload(req.params.id, parts, userId);
        } else {
            return this.trackService.update(req.params.id, req.body);
        }
    }

    delete = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        await this.trackService.softDelete(req.params.id);
        return reply.status(204).send();
    }

    play = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        // Logic to return signed URL could go here if using Cloudinary
        // For now, we just increment play count
        const userId = req.user?.id;
        this.trackService.incrementStreamCount(req.params.id, userId);
        return reply.send({ status: 'playing' });
    }

    heartbeat = async (req: FastifyRequest<{ Params: { id: string }, Body: { duration: number, progress?: number } }>, reply: FastifyReply) => {
        const userId = req.user?.id;
        if (!userId) return reply.status(401).send({ message: "Unauthorized" });
        
        await this.trackService.incrementListenDuration(req.params.id, userId, req.body.duration || 60, req.body.progress);
        return reply.send({ status: 'recorded' });
    }

    getLiked = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = (req as any).user?.id;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
        return this.trackService.getLiked(userId);
    }

    toggleLike = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = (req as any).user?.id;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
        const result = await this.trackService.toggleLike(userId, req.params.id);
        return reply.send(result);
    }

    updateDuration = async (req: FastifyRequest<{ Params: { id: string }, Body: { duration: number } }>, reply: FastifyReply) => {
        const { duration } = req.body;
        if (!duration || isNaN(duration) || duration <= 0) {
            return reply.status(400).send({ message: "Invalid duration value" });
        }
        await this.trackService.updateTrackDuration(req.params.id, Math.round(duration));
        return reply.send({ status: 'updated' });
    }

    updateLyricsOffset = async (req: FastifyRequest<{ Params: { id: string }, Body: { offset: number } }>, reply: FastifyReply) => {
        const { offset } = req.body;
        if (typeof offset !== 'number') {
            return reply.status(400).send({ message: "Invalid offset value" });
        }
        await this.trackService.updateLyricsOffset(req.params.id, Math.round(offset));
        return reply.send({ status: 'updated', offset: Math.round(offset) });
    }


    convertFormat = async (req: FastifyRequest<{ Querystring: { format?: string, filename?: string } }>, reply: FastifyReply) => {
        try {
            const data = await req.file();
            if (!data) {
                return reply.status(400).send({ error: 'No audio file provided' });
            }

            const format = req.query.format || 'mp3';
            const filename = req.query.filename || 'Converted Audio';

            await AudioProcessorService.convertFormat(data.file, format, reply, filename);
        } catch (error: any) {
            console.error('[TrackController] Format conversion failed:', error);
            if (!reply.raw.headersSent) {
                return reply.status(500).send({ error: 'Failed to convert format' });
            }
        }
    }

    streamTrack = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const track = await this.trackService.findOne(req.params.id);
            if (!track || !track.audioUrl) {
                return reply.status(404).send({ error: 'Track audio not found' });
            }

            // Direct R2 HTTP 302 redirect for native client Range (206 Partial Content) seeking (<100ms startup)
            if (track.audioUrl.startsWith('http://') || track.audioUrl.startsWith('https://')) {
                return reply.redirect(track.audioUrl, 302);
            }

            const path = await import('path');
            const fs = await import('fs');
            const localPath = path.join(__dirname, '../../', track.audioUrl.replace(/^\//, ''));
            if (fs.existsSync(localPath)) {
                return reply.sendFile(path.basename(localPath), path.dirname(localPath));
            }
            return reply.status(404).send({ error: 'Local audio file missing' });
        } catch (err: any) {
            console.error('[TrackController] Stream track failed:', err);
            return reply.status(500).send({ error: 'Failed to stream track' });
        }
    }
}
