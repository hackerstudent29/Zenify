import { FastifyInstance } from 'fastify';
import { BlendController } from '../controllers/blend.controller';

export async function blendRoutes(server: FastifyInstance) {
  server.post(
    '/blend/create',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    BlendController.createInvite
  );

  server.post(
    '/blend/join',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    BlendController.joinInvite
  );

  server.get(
    '/blend',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    BlendController.getUserBlends
  );

  server.get(
    '/blend/:sessionId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    BlendController.getBlendDetails
  );

  server.post(
    '/blend/:sessionId/refresh',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    BlendController.refreshBlend
  );

  server.delete(
    '/blend/:sessionId',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    BlendController.leaveBlend
  );
}

