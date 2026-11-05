import { FastifyInstance } from 'fastify';
import { ReplayController } from '../controllers/replay.controller';

export async function replayRoutes(server: FastifyInstance) {
  server.get(
    '/replay',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    ReplayController.getReplay
  );

  server.post(
    '/replay/refresh',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    ReplayController.refreshReplay
  );
}
