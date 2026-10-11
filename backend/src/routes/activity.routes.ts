import { FastifyInstance } from 'fastify';
import { ActivityController } from '../controllers/activity.controller';

export async function activityRoutes(server: FastifyInstance) {
  const controller = new ActivityController();

  server.post('/event', {
    preHandler: [server.authenticate],
    config: {
      rateLimit: {
        max: 120, // 120 per minute
        timeWindow: '1 minute'
      }
    },
    handler: controller.recordEvent.bind(controller)
  });

  server.post('/reset', {
    preHandler: [server.authenticate],
    handler: controller.resetPersonalization.bind(controller)
  });
}
