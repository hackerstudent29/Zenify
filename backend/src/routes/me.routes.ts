import { FastifyInstance } from 'fastify';
import { MeController } from '../controllers/me.controller';

export async function meRoutes(server: FastifyInstance) {
  const controller = new MeController(server);

  // Settings
  server.get(
    '/settings',
    { preHandler: [server.authenticate] },
    controller.getSettings.bind(controller)
  );

  server.put(
    '/settings',
    { preHandler: [server.authenticate] },
    controller.updateSettings.bind(controller)
  );

  // Listening Events & Tracking
  server.post(
    '/listening/batch',
    {
      preHandler: [server.authenticate],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    controller.recordListeningBatch.bind(controller)
  );

  // Insights / Replay
  server.get(
    '/insights',
    { preHandler: [server.authenticate] },
    controller.getInsights.bind(controller)
  );

  // Listening History
  server.get(
    '/history',
    { preHandler: [server.authenticate] },
    controller.getHistory.bind(controller)
  );

  server.delete(
    '/history/:eventId',
    { preHandler: [server.authenticate] },
    controller.deleteHistoryEvent.bind(controller)
  );

  server.delete(
    '/history',
    { preHandler: [server.authenticate] },
    controller.clearHistory.bind(controller)
  );

  // Achievements
  server.get(
    '/achievements',
    { preHandler: [server.authenticate] },
    controller.getAchievements.bind(controller)
  );

  // Sessions Management
  server.get(
    '/sessions',
    { preHandler: [server.authenticate] },
    controller.getSessions.bind(controller)
  );

  server.delete(
    '/sessions/:id',
    { preHandler: [server.authenticate] },
    controller.revokeSession.bind(controller)
  );

  // Export Data
  server.get(
    '/export',
    { preHandler: [server.authenticate] },
    controller.exportData.bind(controller)
  );

  // Delete Account
  server.delete(
    '/account',
    { preHandler: [server.authenticate] },
    controller.deleteAccount.bind(controller)
  );
}

