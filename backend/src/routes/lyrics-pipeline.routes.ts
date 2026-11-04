import { FastifyInstance } from 'fastify';
import { LyricsPipelineController } from '../controllers/lyrics-pipeline.controller';

export async function lyricsPipelineRoutes(fastify: FastifyInstance) {
  // Public Endpoint: Rate-limited per IP (120 req/min)
  fastify.get('/lyrics/:trackId', {
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '1 minute'
      }
    }
  }, LyricsPipelineController.getLyrics);

  const adminGuard = fastify.authenticate ? [fastify.authenticate] : [];

  // Admin Endpoints: Auth guard, returns 404 for non-admins
  fastify.get('/admin/lyrics/health', {
    preHandler: adminGuard
  }, LyricsPipelineController.getHealth);

  fastify.post('/admin/lyrics/purge/:trackId', {
    preHandler: adminGuard
  }, LyricsPipelineController.purgeTrack);

  fastify.post('/admin/lyrics/purge/provider/:providerId', {
    preHandler: adminGuard
  }, LyricsPipelineController.purgeProvider);
}
