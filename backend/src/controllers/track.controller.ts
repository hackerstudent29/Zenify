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
            // Step 1: Resolve audio stream URL instantly via ExternalMetadataService
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            let audioUrl = data.audioUrl;
            let audioResult: any = null;
            
            if (!audioUrl) {
                console.log(`[ImportInstant] Searching YouTube stream for "${data.title}"...`);
                audioResult = await ExternalMetadataService.fetchAudio(
                    data.title, 
                    data.artistName, 
                    data.duration || undefined, 
                    undefined,
                    { preview: true }
                ).catch((e: any) => {
                    console.warn(`[ImportInstant] Audio search failed:`, e.message);
                    return null;
                });
                
                if (audioResult) {
                    audioUrl = audioResult.watchUrl || audioResult.url;
                } else {
                    // Search fallback
                    audioUrl = `${data.artistName || 'Unknown'} - ${data.title}`;
                }
            }
            
            // Step 2: Import into DB using existing importExternal logic
            const track = await this.trackService.importExternal({
                ...data,
                audioUrl,
            }, userId);
            
            if (track) {
                // Trigger background audio download to cache it locally
                import('../queues/import.queue.js').then(({ enqueueImport }) => {
                    enqueueImport({
                        trackId: track.id,
                        youtubeUrl: audioUrl,
                        title: track.title,
                        artistName: track.artist?.name || data.artistName,
                        duration: track.duration || data.duration,
                        userId: userId,
                        isInstant: true
                    }).catch(console.error);
                });

                // Background visual and aesthetic syncing
                if (track.coverUrl) {
                    import('../services/palette.service.js').then(({ PaletteService }) => {
                        PaletteService.extractAndSaveTrack(track.id, track.coverUrl!).catch(console.error);
                    });
                }
                import('../services/ai-aesthetic.service.js').then(({ AIAestheticService }) => {
                    AIAestheticService.syncTrackAesthetic(track.id).catch(console.error);
                });

                // OVERRIDE for instant playback: send the ultra-fast iTunes preview to the player
                // while the background worker downloads the full track.
                if (audioResult && audioResult.sourceType === 'itunes_direct_preview' && audioResult.url) {
                    console.log(`[ImportInstant] Overriding response audioUrl with iTunes preview for instant playback.`);
                    track.audioUrl = audioResult.url;
                } else if (audioUrl) {
                    console.log(`[ImportInstant] Overriding response audioUrl with external url for instant playback.`);
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
                    
                    if (!audioUrl) {
                        console.log(`[BatchImport] No audioUrl provided for "${trackData.title}", searching...`);
                        const audioResult = await ExternalMetadataService.fetchAudio(
                            trackData.title, 
                            trackData.artistName, 
                            trackData.duration, 
                            trackData.customUrl || undefined,
                            { preview: true }
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

            // Handle standard Cloudinary/R2 URLs or external HTTP sources
            const audioUrl = track.audioUrl.startsWith('http') ? track.audioUrl : `https://${track.audioUrl}`;

            await AudioProcessorService.processAndStream(audioUrl, format, fx, speed, direction8D, freq8D, reply, filename);
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
}
