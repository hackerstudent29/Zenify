import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TrackService } from '../services/track.service';
import { CreateTrackInput, UpdateTrackInput, TrackQuery } from './track.schemas';

export class TrackController {
    private trackService: TrackService;

    constructor(server: FastifyInstance) {
        this.trackService = new TrackService(server);
    }

    create = async (req: FastifyRequest<{ Body: CreateTrackInput }>, reply: FastifyReply) => {
        const track = await this.trackService.create(req.body);
        
        // Trigger AI Vision in background
        if (track) {
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
        
        // Trigger AI Vision in background
        if (track) {
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
        
        // Trigger AI Vision in background
        if (track) {
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

    importBatch = async (req: FastifyRequest<{ Body: { tracks: any[], opts?: any } }>, reply: FastifyReply) => {
        const userId = (req as any).user?.id;
        const { tracks, opts } = req.body;
        
        // Detached promise to process in background
        (async () => {
            const { ExternalMetadataService } = await import('../services/external-metadata.service.js');
            for (let i = 0; i < tracks.length; i++) {
                const trackData = tracks[i];
                try {
                    let audioUrl = trackData.audioUrl;
                    let lyrics = trackData.lyrics;
                    
                    if (!audioUrl) {
                        const query = trackData.customUrl || `${trackData.artistName} - ${trackData.title}`;
                        const audioResult = await ExternalMetadataService.fetchAudio(
                            trackData.title, 
                            trackData.artistName, 
                            trackData.duration, 
                            trackData.customUrl || undefined,
                            { preview: true }
                        ).catch(e => null);
                        
                        if (audioResult) {
                            audioUrl = audioResult.watchUrl || audioResult.url;
                        }
                    }
                    
                    if (audioUrl) {
                        const importedTrack = await this.trackService.importExternal({
                            ...trackData,
                            audioUrl,
                            lyrics
                        }, userId);
                        
                        if (importedTrack) {
                            import('../services/ai-aesthetic.service.js').then(({ AIAestheticService }) => {
                                AIAestheticService.syncTrackAesthetic(importedTrack.id).catch(console.error);
                            });
                        }
                    }
                } catch (e) {
                    console.error(`[BatchImport] Failed track: ${trackData.title}`, e);
                }
            }
        })();
        
        return reply.status(202).send({ message: "Batch import started in the background", total: tracks.length });
    }

    download = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        // @ts-ignore
        await this.trackService.incrementDownloadCount(req.params.id);
        return reply.send({ status: 'downloading' });
    }

    getAll = async (req: FastifyRequest<{ Querystring: TrackQuery }>, reply: FastifyReply) => {
        return this.trackService.findAll(req.query);
    }

    getFeatured = async (_req: FastifyRequest, _reply: FastifyReply) => {
        return this.trackService.getFeatured();
    }

    getTrending = async (_req: FastifyRequest, _reply: FastifyReply) => {
        return this.trackService.getTrending();
    }

    getOne = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        return this.trackService.findOne(req.params.id);
    }

    update = async (req: FastifyRequest<{ Params: { id: string }, Body: UpdateTrackInput }>, reply: FastifyReply) => {
        return this.trackService.update(req.params.id, req.body);
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

    heartbeat = async (req: FastifyRequest<{ Params: { id: string }, Body: { duration: number } }>, reply: FastifyReply) => {
        const userId = req.user?.id;
        if (!userId) return reply.status(401).send({ message: "Unauthorized" });
        
        await this.trackService.incrementListenDuration(req.params.id, userId, req.body.duration || 60);
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
}
