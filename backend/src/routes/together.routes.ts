import { FastifyInstance } from 'fastify';
import { TogetherController } from '../controllers/together.controller';

export async function togetherRoutes(server: FastifyInstance) {
  // Create room (supports signed in users or guest hosts)
  server.post(
    '/rooms',
    {
      preHandler: [server.optionalAuthenticate],
      config: {
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
    },
    TogetherController.createRoom
  );

  // Get room info
  server.get(
    '/rooms/:code',
    {
      config: {
        rateLimit: { max: 60, timeWindow: '1 minute' },
      },
    },
    TogetherController.getRoom
  );

  // Join room & get WS ticket (supports signed in users or guest listeners)
  server.post(
    '/rooms/:code/join',
    {
      preHandler: [server.optionalAuthenticate],
      config: {
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
    },
    TogetherController.joinRoom
  );

  // Update room settings (host only)
  server.patch(
    '/rooms/:code/settings',
    {
      preHandler: [server.authenticate],
      config: {
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
    },
    TogetherController.updateSettings
  );

  // Transfer host
  server.post(
    '/rooms/:code/transfer',
    {
      preHandler: [server.authenticate],
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    TogetherController.transferHost
  );

  // Close room
  server.delete(
    '/rooms/:code',
    {
      preHandler: [server.authenticate],
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    TogetherController.closeRoom
  );
}
