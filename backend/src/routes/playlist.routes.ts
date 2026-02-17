import { FastifyInstance } from 'fastify';
import { PlaylistController } from '../controllers/playlist.controller';
import { createPlaylistSchema, updatePlaylistSchema, addTrackSchema } from '../controllers/playlist.schemas';

export async function playlistRoutes(server: FastifyInstance) {
    const playlistController = new PlaylistController(server);

    // Public routes
    server.get('/', playlistController.getPublic);
    server.get('/:id', playlistController.getOne);

    // Protected routes
    server.register(async (protectedRoutes) => {
        protectedRoutes.addHook('preHandler', server.authenticate);

        protectedRoutes.post('/', {
            schema: { body: createPlaylistSchema }
        }, playlistController.create);

        protectedRoutes.get('/my', playlistController.getMyPlaylists);

        protectedRoutes.put('/:id', {
            schema: { body: updatePlaylistSchema }
        }, playlistController.update);

        protectedRoutes.delete('/:id', playlistController.delete);

        protectedRoutes.post('/:id/tracks', {
            schema: { body: addTrackSchema }
        }, playlistController.addTrack);

        protectedRoutes.delete('/:id/tracks/:trackId', playlistController.removeTrack);
    });
}
