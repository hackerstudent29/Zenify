import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RecommendationsService } from '../services/recommendations.service';

const radioQueueSchema = z.object({
  seedType: z.string().optional().default('track'),
  seedId: z.string().min(1),
  title: z.string().optional(),
  artist: z.string().optional(),
  language: z.string().optional(),
  genre: z.string().optional(),
  country: z.string().optional(),
  album: z.string().optional(),
  movie: z.string().optional(),
  mood: z.string().optional(),
  aura_vibe: z.string().optional(),
  excludeIds: z.string().optional(),
  limit: z.coerce.number().optional().default(30)
});

export async function queueRoutes(server: FastifyInstance) {
  server.get('/radio', {
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
    let userId: string | undefined;
    try {
      if ((server as any).authenticate) {
        await (server as any).authenticate(req, reply);
        userId = (req.user as any)?.id;
      }
    } catch {
      // Allow guest / unauthenticated sessions
    }

    const { seedType, seedId, title, artist, language, genre, country, album, movie, mood, aura_vibe, excludeIds, limit } = req.query;

    const excludedSet = new Set<string>();
    if (excludeIds) {
      excludeIds.split(',').forEach(id => {
        const trimmed = id.trim();
        if (trimmed) excludedSet.add(trimmed);
      });
    }

    const tracks = await RecommendationsService.buildRadioQueue(userId, {
      type: (seedType === 'artist' || seedType === 'album') ? seedType : 'track',
      id: seedId
    }, limit, { title, artist, language, genre, country, album, movie, mood, aura_vibe, excludeIds: excludedSet });

    return reply.send({
      seedType,
      seedId,
      tracks
    });
  });
}
