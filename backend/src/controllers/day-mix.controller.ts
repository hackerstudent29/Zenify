import { FastifyRequest, FastifyReply } from 'fastify';
import { DayMixService, DayMixSlot } from '../services/day-mix.service';
import { config } from '../config/env';

export class DayMixController {
  /**
   * Get user day mix for current or specified slot
   * GET /api/me/day-mix?slot=morning
   */
  static async getDayMix(
    request: FastifyRequest<{ Querystring: { slot?: string } }>,
    reply: FastifyReply
  ) {
    if (!config.FEATURE_DAY_MIX && config.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Feature disabled', message: 'Day Mixes are currently disabled.' });
    }

    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const slotParam = request.query.slot as DayMixSlot | undefined;
    const result = await DayMixService.getDayMix(user.userId || user.id, slotParam);
    return reply.status(200).send(result);
  }

  /**
   * Get metadata for all 4 slots
   * GET /api/me/day-mix/slots
   */
  static async getSlotsMeta(
    _request: FastifyRequest,
    reply: FastifyReply
  ) {
    const slots = DayMixService.getSlotsMeta();
    return reply.status(200).send({ slots });
  }
}

