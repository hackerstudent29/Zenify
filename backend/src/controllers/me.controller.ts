import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserSettingsService } from '../services/user-settings.service';
import { ListeningService } from '../services/listening.service';
import { AuthService } from '../services/auth.service';

const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.any()).optional().default({}),
  timestamps: z.record(z.string(), z.string()).optional().default({}),
});

const listeningBatchSchema = z.object({
  events: z.array(
    z.object({
      eventId: z.string(),
      startedAt: z.string(),
      endedAt: z.string(),
      tzOffsetMin: z.number().int().optional().default(0),
      listenedMs: z.number().int().min(0),
      trackDurationMs: z.number().int().min(0),
      endReason: z.string().optional().default('completed'),
      trackSource: z.string().optional().default('youtube'),
      trackId: z.string(),
      trackTitle: z.string(),
      trackAlbum: z.string().optional(),
      language: z.string().optional(),
      genre: z.string().optional(),
      contextType: z.string().optional(),
      contextId: z.string().optional(),
      offline: z.boolean().optional().default(false),
      quality: z.number().int().optional().default(256),
      deviceId: z.string().optional(),
      artists: z
        .array(
          z.object({
            artistKey: z.string(),
            artistName: z.string(),
            artistImage: z.string().optional(),
            isPrimary: z.boolean().optional().default(true),
          })
        )
        .optional(),
    })
  ).min(1).max(200),
});

export class MeController {
  private authService: AuthService;

  constructor(server: any) {
    this.authService = new AuthService(server);
  }

  /**
   * GET /api/me/settings
   */
  async getSettings(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const data = await UserSettingsService.getSettings(userId);
    return reply.send(data);
  }

  /**
   * PUT /api/me/settings
   */
  async updateSettings(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const body = req.body as any;
    // Support either { settings: {...}, timestamps: {...} } or flat object
    let updates = body.settings || body;
    let timestamps = body.timestamps || body.syncTimestamps || {};

    const updated = await UserSettingsService.updateSettings(userId, updates, timestamps);
    return reply.send(updated);
  }

  /**
   * POST /api/me/listening/batch
   */
  async recordListeningBatch(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const parseResult = listeningBatchSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid listening events payload',
        details: parseResult.error.format(),
      });
    }

    const result = await ListeningService.recordBatch(userId, parseResult.data.events);
    return reply.send({ success: true, ...result });
  }

  /**
   * GET /api/me/insights
   */
  async getInsights(req: FastifyRequest<{ Querystring: { range?: string } }>, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const range = (req.query.range as any) || 'all';
    const insights = await ListeningService.getInsights(userId, range);
    return reply.send(insights);
  }

  /**
   * GET /api/me/sessions
   */
  async getSessions(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const sessions = await this.authService.getSessions(userId);
    return reply.send(sessions);
  }

  /**
   * DELETE /api/me/sessions/:id
   */
  async revokeSession(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const sessionId = req.params.id;
    const res = await this.authService.revokeSession(userId, sessionId);
    return reply.send(res);
  }

  /**
   * GET /api/me/export
   */
  async exportData(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const data = await this.authService.exportUserData(userId);
    return reply.send(data);
  }

  /**
   * DELETE /api/me/account
   */
  async deleteAccount(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any)?.id;
    if (!userId) throw reply.server.httpErrors.unauthorized();

    const res = await this.authService.deleteAccount(userId);
    return reply.send(res);
  }
}

