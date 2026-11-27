import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  FeedbackService,
  MAX_REPORT_SCREENSHOTS,
  MAX_SCREENSHOT_BYTES,
  REPORT_CATEGORIES,
  REPORT_SEVERITIES,
  ScreenshotInput,
} from '../services/feedback.service';

function parseArrayField(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string' && val.trim().length > 0) {
    const trimmed = val.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {}
    }
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function feedbackRoutes(
  server: FastifyInstance,
  opts?: { service?: FeedbackService }
) {
  const service = opts?.service ?? FeedbackService.defaultInstance;
  const optAuth =
    typeof (server as any).optionalAuthenticate === 'function'
      ? [(server as any).optionalAuthenticate]
      : [];

  // Static metadata endpoint so clients can inspect supported categories
  server.get('/reports/meta', async (_req, reply) => {
    return reply.send({
      categories: REPORT_CATEGORIES,
      severities: REPORT_SEVERITIES,
      maxScreenshots: MAX_REPORT_SCREENSHOTS,
      maxScreenshotBytes: MAX_SCREENSHOT_BYTES,
    });
  });

  // POST /api/me/reports — Submit a structured song/playback/metadata report with up to 5 screenshots
  server.post(
    '/reports',
    {
      preHandler: optAuth,
      config: {
        rateLimit: {
          max: 25,
          timeWindow: '1 hour',
        },
      },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = FeedbackService.resolveActor(req);
      if (!actor) {
        return reply.status(401).send({ error: 'Authentication or X-Device-Key required' });
      }

      try {
        let body: Record<string, any> = {};
        const screenshots: ScreenshotInput[] = [];

        if (typeof (req as any).isMultipart === 'function' && (req as any).isMultipart()) {
          const parts = (req as any).parts();
          for await (const part of parts) {
            if (part.type === 'file') {
              const buf: Buffer = await part.toBuffer();
              if (screenshots.length >= MAX_REPORT_SCREENSHOTS) {
                return reply.status(400).send({
                  error: `Maximum ${MAX_REPORT_SCREENSHOTS} screenshots allowed per report.`,
                });
              }
              if (buf.length > MAX_SCREENSHOT_BYTES) {
                return reply.status(400).send({
                  error: 'Each screenshot must be 8 MB or smaller.',
                });
              }
              screenshots.push({
                buffer: buf,
                filename: String(part.filename || `screenshot_${screenshots.length + 1}.jpg`),
                mimetype: String(part.mimetype || 'application/octet-stream'),
              });
            } else if (part.fieldname === 'payload' && typeof part.value === 'string') {
              try {
                const parsedPayload = JSON.parse(part.value);
                if (parsedPayload && typeof parsedPayload === 'object') {
                  body = { ...body, ...parsedPayload };
                }
              } catch {
                return reply.status(400).send({ error: 'Invalid JSON in payload field' });
              }
            } else {
              if (part.fieldname === 'subIssues' || part.fieldname === 'suggestedSolutions') {
                const existing = Array.isArray(body[part.fieldname]) ? body[part.fieldname] : [];
                body[part.fieldname] = [...existing, ...parseArrayField(part.value)];
              } else {
                body[part.fieldname] = part.value;
              }
            }
          }
        } else {
          body = (req.body as Record<string, any>) || {};
          if (body.subIssues) body.subIssues = parseArrayField(body.subIssues);
          if (body.suggestedSolutions) {
            body.suggestedSolutions = parseArrayField(body.suggestedSolutions);
          }
        }

        const report = await service.submitReport(actor, body, screenshots);
        return reply.status(201).send({
          status: 'submitted',
          ticketCode: report.ticketCode,
          report,
        });
      } catch (err: any) {
        const code = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        if (code >= 400 && code < 500) {
          return reply.status(code).send({
            error: err.message || 'Bad request',
            ...(err.details ? { details: err.details } : {}),
          });
        }
        req.log.error(`[FeedbackRoutes] submitReport error: ${err?.message || err}`);
        return reply.status(500).send({ error: 'Failed to submit report' });
      }
    }
  );

  // GET /api/me/reports — Fetch caller's submitted reports
  server.get(
    '/reports',
    { preHandler: optAuth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = FeedbackService.resolveActor(req);
      if (!actor) {
        return reply.status(401).send({ error: 'Authentication or X-Device-Key required' });
      }
      const reports = await service.getReports(actor);
      return reply.send({ reports });
    }
  );

  // GET /api/me/suggestions/less — Retrieve active Suggest Less items for user/device
  server.get(
    '/suggestions/less',
    { preHandler: optAuth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = FeedbackService.resolveActor(req);
      if (!actor) {
        return reply.status(401).send({ error: 'Authentication or X-Device-Key required' });
      }
      const items = await service.getSuppressedTracks(actor);
      return reply.send({ items });
    }
  );

  // POST /api/me/suggestions/less — Mark a track for no suggestions / suggest ultra less
  server.post(
    '/suggestions/less',
    { preHandler: optAuth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = FeedbackService.resolveActor(req);
      if (!actor) {
        return reply.status(401).send({ error: 'Authentication or X-Device-Key required' });
      }
      try {
        const item = await service.addSuppressedTrack(actor, req.body);
        return reply.status(200).send({ status: 'suppressed', item });
      } catch (err: any) {
        const code = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        return reply.status(code).send({ error: err?.message || 'Failed to save Suggest Less' });
      }
    }
  );

  // POST /api/me/suggestions/less/sync — Bidirectional sync across login / reinstall / updates
  server.post(
    '/suggestions/less/sync',
    { preHandler: optAuth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = FeedbackService.resolveActor(req);
      if (!actor) {
        return reply.status(401).send({ error: 'Authentication or X-Device-Key required' });
      }
      try {
        const items = await service.syncSuppressedTracks(actor, req.body);
        return reply.status(200).send({ status: 'synced', items });
      } catch (err: any) {
        const code = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        return reply.status(code).send({ error: err?.message || 'Failed to sync Suggest Less' });
      }
    }
  );

  // DELETE /api/me/suggestions/less/:trackKey — Revoke Suggest Less and restore suggestions
  server.delete(
    '/suggestions/less/:trackKey',
    { preHandler: optAuth },
    async (
      req: FastifyRequest<{
        Params: { trackKey: string };
        Querystring: { title?: string; artist?: string };
      }>,
      reply: FastifyReply
    ) => {
      const actor = FeedbackService.resolveActor(req);
      if (!actor) {
        return reply.status(401).send({ error: 'Authentication or X-Device-Key required' });
      }
      const res = await service.removeSuppressedTrack(
        actor,
        req.params.trackKey,
        req.query?.title,
        req.query?.artist
      );
      return reply.status(200).send({ status: 'restored', ...res });
    }
  );
}
