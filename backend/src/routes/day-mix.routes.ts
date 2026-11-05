import { FastifyInstance } from 'fastify';
import { DayMixController } from '../controllers/day-mix.controller';

export async function dayMixRoutes(server: FastifyInstance) {
  server.get(
    '/day-mix',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    DayMixController.getDayMix
  );

  server.get(
    '/day-mix/slots',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    DayMixController.getSlotsMeta
  );
}
