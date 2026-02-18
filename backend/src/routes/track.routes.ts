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

    server.get('/', {
        schema: { querystring: trackQuerySchema }
    }, trackController.getAll);

    server.get('/featured', trackController.getFeatured);
    server.get('/trending', trackController.getTrending);

    server.get('/liked', {
        preHandler: [server.authenticate]
    }, trackController.getLiked);

    server.get('/:id', trackController.getOne);

    server.put('/:id', {
        schema: { body: updateTrackSchema },
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.update);

    server.delete('/:id', {
        preHandler: [server.authenticate, server.authorize(['ADMIN'])]
    }, trackController.delete);

    server.post('/:id/play', trackController.play);

    server.post('/:id/like', {
        preHandler: [server.authenticate]
    }, trackController.toggleLike);
}
