import { FastifyInstance } from 'fastify';
import { LyricsPipelineController } from '../controllers/lyrics-pipeline.controller';

export async function lyricsPipelineRoutes(fastify: FastifyInstance) {
  // Public Endpoint: Rate-limited per IP (120 req/min) — kept for Android fallback
  fastify.get('/lyrics/:trackId', {
    config: {
      rateLimit: {
        max: 120,
        timeWindow: '1 minute'
      }
    }
  }, LyricsPipelineController.getLyrics);
}
