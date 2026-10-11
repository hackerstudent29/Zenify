import { FastifyInstance } from 'fastify';
import { TrackController } from '../controllers/track.controller';
import { createTrackSchema, updateTrackSchema, trackQuerySchema } from '../controllers/track.schemas';

export async function trackRoutes(server: FastifyInstance) {
    const trackController = new TrackController(server);

    server.post('/', {
        schema: { body: createTrackSchema },
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.create);

    server.post('/upload', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
        // No schema validation for multipart body here, handled by service/controller logic or specific multipart schema
    }, trackController.upload);

    server.post('/import-external', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.importExternal);

    server.post('/import-instant', {
        config: {
            rateLimit: {
                max: 60,
                timeWindow: '1 minute'
            }
        }
    }, trackController.importInstant);

    server.post('/import-batch', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.importBatch);

    server.get('/', {
        schema: { querystring: trackQuerySchema }
    }, trackController.getAll);

    server.get('/featured', trackController.getFeatured);
    server.get('/trending', trackController.getTrending);

    server.get('/liked', {
        preHandler: [server.authenticate]
    }, trackController.getLiked);

    server.get('/stream/:id', trackController.streamTrack);
    
    // Contextual recommendations for track (same vibe songs, more from artist)
    server.get('/:id/similar', {
        preHandler: [server.authenticate],
        config: {
            rateLimit: {
                max: 60,
                timeWindow: '1 minute'
            }
        }
    }, async (req, reply) => {
        const { id } = req.params as { id: string };
        const userId = (req.user as any)?.id;
        const { RecommendationsService } = await import('../services/recommendations.service.js');
        const data = await RecommendationsService.getContextRecommendations(userId, { type: 'track', id });
        return reply.send(data);
    });

    server.get('/:id', trackController.getOne);

    server.put('/:id', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.update);

    server.delete('/:id', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.delete);

    server.post('/:id/play', trackController.play);
    server.post('/:id/heartbeat', { preHandler: [server.authenticate] }, trackController.heartbeat);
    server.post('/:id/update-duration', { preHandler: [server.authenticate, server.authorize(['ADMIN'])] }, trackController.updateDuration);
    server.post('/:id/lyrics-offset', { preHandler: [server.authenticate, server.authorize(['ADMIN'])] }, trackController.updateLyricsOffset);
    server.post('/:id/download', trackController.download);
    server.get('/:id/process-download', trackController.processDownload);
    server.post('/convert-format', { preHandler: [server.authenticate] }, trackController.convertFormat);

    server.get('/:id/progress', async (req, reply) => {
        const { id } = req.params as { id: string };
        const { trackProgressEmitter } = await import('../queues/import.queue.js');
        const { prisma } = await import('../utils/prisma.js');
        const track = await prisma.track.findUnique({ where: { id }, select: { id: true, audioUrl: true, releaseStatus: true, duration: true } });
        if (!track) return reply.status(404).send({ error: 'Track not found' });
        
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');

        reply.raw.write(`data: ${JSON.stringify({ trackId: id, stage: track.releaseStatus === 'PUBLISHED' ? 'audio_ready' : 'audio_resolving', audioUrl: track.audioUrl, duration: track.duration })}\n\n`);

        const listener = (event: any) => {
            if (event.trackId === id) {
                reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
                if (event.stage === 'finalized' || event.stage === 'failed') {
                    cleanup();
                }
            }
        };

        const cleanup = () => {
            trackProgressEmitter.off('progress', listener);
            try { reply.raw.end(); } catch {}
        };

        trackProgressEmitter.on('progress', listener);
        req.raw.on('close', cleanup);
    });

    server.post('/:id/like', {
        preHandler: [server.authenticate]
    }, trackController.toggleLike);
}
