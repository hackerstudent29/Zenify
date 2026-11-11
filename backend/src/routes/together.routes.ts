import { FastifyInstance } from 'fastify';
import { togetherV1Routes } from './together-v1.routes';

/**
 * Legacy /api/together prefix routes delegate cleanly to the unified PostgreSQL/WS engine
 * so legacy and v1 clients operate against the exact same persistent room state.
 */
export async function togetherRoutes(server: FastifyInstance) {
  await server.register(togetherV1Routes);
}
