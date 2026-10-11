import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ActivityService } from '../services/activity.service';
import { RecommendationsService } from '../services/recommendations.service';

const singleEventSchema = z.object({
  eventType: z.string().min(1),
  eventData: z.record(z.string(), z.any()).optional().default({}),
  sourceType: z.enum(['search', 'artist', 'album', 'playlist', 'autoplay', 'recommendation', 'library']).optional(),
  seedId: z.string().optional()
});

const batchEventSchema = z.object({
  events: z.array(singleEventSchema).min(1).max(50)
});

const activityPayloadSchema = z.union([singleEventSchema, batchEventSchema]);

export class ActivityController {
  /**
   * POST /api/activity/event
   * Ingest single or batched user events
   */
  async recordEvent(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const parseResult = activityPayloadSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid activity event payload',
        details: parseResult.error.format()
      });
    }

    const payload = parseResult.data;

    if ('events' in payload) {
      // Batch
      const formatted = payload.events.map(e => ({
        eventType: e.eventType,
        eventData: {
          ...e.eventData,
          sourceType: e.sourceType,
          seedId: e.seedId
        }
      }));
      const res = await ActivityService.logBatch(userId, formatted);
      return reply.send({ success: true, count: res.count });
    } else {
      // Single event
      const eventData: any = {
        ...payload.eventData,
        sourceType: payload.sourceType,
        seedId: payload.seedId
      };

      // If it's a play event, feed into RecommendationsService session taste!
      if (payload.eventType === 'play') {
        RecommendationsService.recordSessionPlay(userId, {
          genre: eventData.genre,
          language: eventData.language,
          artistId: eventData.artistId
        });
      }

      await ActivityService.logEvent(userId, payload.eventType, eventData);
      return reply.send({ success: true });
    }
  }

  /**
   * POST /api/activity/reset
   * Reset personalization history and profile (Privacy feature)
   */
  async resetPersonalization(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const result = await ActivityService.resetPersonalization(userId);
    return reply.send(result);
  }
}
