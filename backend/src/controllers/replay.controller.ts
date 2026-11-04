import { FastifyRequest, FastifyReply } from 'fastify';
import { ReplayAggregatorService } from '../services/replay-aggregator.service';
import { config } from '../config/env';

export class ReplayController {
  /**
   * Get user replay for specified year
   * GET /api/me/replay?year=2026
   */
  static async getReplay(
    request: FastifyRequest<{ Querystring: { year?: string; force?: string } }>,
    reply: FastifyReply
  ) {
    if (!config.FEATURE_REPLAY && config.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Feature disabled', message: 'Replay is currently disabled in production.' });
    }

    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const currentYear = new Date().getFullYear();
    const year = parseInt(request.query.year || String(currentYear), 10);
    const force = request.query.force === 'true';

    if (isNaN(year) || year < 2020 || year > currentYear + 1) {
      return reply.status(400).send({ error: 'Invalid year requested.' });
    }

    const result = await ReplayAggregatorService.getReplay(user.userId || user.id, year, force);
    return reply.status(200).send(result);
  }

  /**
   * Force refresh user replay
   * POST /api/me/replay/refresh?year=2026
   */
  static async refreshReplay(
    request: FastifyRequest<{ Querystring: { year?: string } }>,
    reply: FastifyReply
  ) {
    if (!config.FEATURE_REPLAY && config.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Feature disabled', message: 'Replay is currently disabled in production.' });
    }

    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const currentYear = new Date().getFullYear();
    const year = parseInt(request.query.year || String(currentYear), 10);

    const result = await ReplayAggregatorService.getReplay(user.userId || user.id, year, true);
    return reply.status(200).send(result);
  }
}

