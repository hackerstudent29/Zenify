import { FastifyInstance } from 'fastify';
import { TogetherController } from '../controllers/together.controller';

export async function togetherRoutes(server: FastifyInstance) {
  // Create room
  server.post(
    '/rooms',
    {
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

  // Join room & get WS ticket
  server.post(
    '/rooms/:code/join',
    {
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
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    TogetherController.closeRoom
  );
}

