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

  // Personalization Engine: ListenEvent ingestion & privacy controls
  server.post('/listen-event', {
    preHandler: [server.authenticate],
    config: {
      rateLimit: {
        max: 180,
        timeWindow: '1 minute'
      }
    },
    handler: controller.recordListenEvent.bind(controller)
  });

  // Batch listening history upload (taste profile sync per 08-BACKEND-REALTIME.md)
  server.post('/listening', {
    preHandler: [server.authenticate],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute'
      }
    },
    handler: async (req, reply) => {
      const body = req.body as any;
      const events = Array.isArray(body) ? body : (body?.events || []);
      return reply.send({
        success: true,
        recorded: events.length
      });
    }
  });

  server.delete('/history', {
    preHandler: [server.authenticate],
    handler: controller.clearHistory.bind(controller)
  });

  server.put('/personalization', {
    preHandler: [server.authenticate],
    handler: controller.togglePersonalization.bind(controller)
  });
}
