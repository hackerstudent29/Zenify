import { FastifyInstance } from 'fastify';
import { LibraryController } from '../controllers/library.controller';

export async function libraryRoutes(server: FastifyInstance) {
  // All library routes require authentication
  server.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', server.authenticate);

    // GET /api/me/library
    protectedRoutes.get('/', LibraryController.getLibrary);

    // POST /api/me/library/albums
    protectedRoutes.post('/albums', LibraryController.saveAlbum);

    // DELETE /api/me/library/albums
    protectedRoutes.delete('/albums', LibraryController.removeAlbum);

    // POST /api/me/library/sync
    protectedRoutes.post('/sync', LibraryController.syncLibrary);
  });
}

