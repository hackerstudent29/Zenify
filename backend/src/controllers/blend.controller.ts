import { FastifyRequest, FastifyReply } from 'fastify';
import { BlendEngineService } from '../services/blend-engine.service';
import { config } from '../config/env';

export class BlendController {
  /**
   * Create an invite for a new Blend session
   * POST /api/me/blend/create
   */
  static async createInvite(request: FastifyRequest, reply: FastifyReply) {
    if (!config.FEATURE_BLEND && config.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Feature disabled', message: 'Blend is currently disabled.' });
    }

    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const result = await BlendEngineService.createInvite(user.userId || user.id);
    return reply.status(201).send(result);
  }

  /**
   * Join a Blend session using invite token
   * POST /api/me/blend/join
   */
  static async joinInvite(
    request: FastifyRequest<{ Body: { token: string } }>,
    reply: FastifyReply
  ) {
    if (!config.FEATURE_BLEND && config.NODE_ENV === 'production') {
      return reply.status(403).send({ error: 'Feature disabled', message: 'Blend is currently disabled.' });
    }

    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { token } = request.body || {};
    if (!token) {
      return reply.status(400).send({ error: 'Invite token is required.' });
    }

    try {
      const result = await BlendEngineService.joinInvite(user.userId || user.id, token);
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  }

  /**
   * Get all user active blends
   * GET /api/me/blend
   */
  static async getUserBlends(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const blends = await BlendEngineService.getUserBlends(user.userId || user.id);
    return reply.status(200).send({ blends });
  }

  /**
   * Get details and 50 blended tracks for a session
   * GET /api/me/blend/:sessionId
   */
  static async getBlendDetails(
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const details = await BlendEngineService.getBlendDetails(
        user.userId || user.id,
        request.params.sessionId
      );
      return reply.status(200).send(details);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  }

  /**
   * Force recalculation of blend playlist
   * POST /api/me/blend/:sessionId/refresh
   */
  static async refreshBlend(
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      // Validate user is member first
      await BlendEngineService.getBlendDetails(user.userId || user.id, request.params.sessionId);
      const snapshot = await BlendEngineService.computeBlend(request.params.sessionId);
      return reply.status(200).send(snapshot);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  }

  /**
   * Leave / delete a blend session
   * DELETE /api/me/blend/:sessionId
   */
  static async leaveBlend(
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const result = await BlendEngineService.leaveBlend(
        user.userId || user.id,
        request.params.sessionId
      );
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  }
}
