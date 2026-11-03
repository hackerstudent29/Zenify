import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ActivityService } from '../services/activity.service';
import { RecommendationsService } from '../services/recommendations.service';
import { PersonalizationEngineService } from '../services/personalization-engine.service.js';

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

const singleListenEventSchema = z.object({
  clientEventId: z.string().optional(),
  trackId: z.string().min(1),
  artistIds: z.array(z.string()).optional(),
  albumId: z.string().optional(),
  language: z.string().optional(),
  msPlayed: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  completed: z.boolean().optional(),
  skipped: z.boolean().optional(),
  source: z.string().optional(),
  hour: z.number().int().min(0).max(23).optional(),
});

const batchListenEventSchema = z.object({
  events: z.array(singleListenEventSchema).min(1).max(50),
});

const listenEventPayloadSchema = z.union([
  singleListenEventSchema,
  batchListenEventSchema,
  z.array(singleListenEventSchema).min(1).max(50),
]);

export class ActivityController {
  /**
   * POST /api/activity/listen-event
   * Precise playback signal ingestion for personalization engine
   */
  async recordListenEvent(req: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const parseResult = listenEventPayloadSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid listen event payload',
        details: parseResult.error.format()
      });
    }

    const payload = parseResult.data;
    const items = Array.isArray(payload) ? payload : ('events' in payload ? payload.events : [payload]);

    const results = await Promise.allSettled(
      items.map(item => PersonalizationEngineService.recordListenEvent({ userId, ...item }))
    );

    const saved = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);

    return reply.send({
      success: true,
      count: saved.length,
      eventId: saved[0]?.id || null,
      events: saved
    });
  }

  /**
   * DELETE /api/activity/history
   * Privacy control: completely clear user's listening history
   */
  async clearHistory(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const result = await PersonalizationEngineService.clearListeningHistory(userId);
    return reply.send(result);
  }

  /**
   * PUT /api/activity/personalization
   * Privacy control: toggle personalization on or off
   */
  async togglePersonalization(req: FastifyRequest<{ Body: { enabled: boolean } }>, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const enabled = Boolean(req.body?.enabled ?? true);
    const result = await PersonalizationEngineService.setPersonalizationEnabled(userId, enabled);
    return reply.send(result);
  }
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
