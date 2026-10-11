import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RecommendationsService } from '../services/recommendations.service';

const radioQueueSchema = z.object({
  seedType: z.enum(['track', 'artist', 'album']),
  seedId: z.string().min(1),
  limit: z.coerce.number().optional().default(30)
});

export async function queueRoutes(server: FastifyInstance) {
  server.get('/radio', {
    preHandler: [server.authenticate],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute'
      }
    },
    schema: {
      querystring: radioQueueSchema
    }
  }, async (req: FastifyRequest<{ Querystring: z.infer<typeof radioQueueSchema> }>, reply: FastifyReply) => {
    const userId = (req.user as any)?.id;
    const { seedType, seedId, limit } = req.query;

    const tracks = await RecommendationsService.buildRadioQueue(userId, {
      type: seedType,
      id: seedId
    }, limit);

    return reply.send({
      seedType,
      seedId,
      tracks
    });
  });
}
