import type { FastifyReply, FastifyRequest } from 'fastify';

export interface LimitOptions {
  windowMs: number;
  max: number;
  /** Key for the caller; defaults to authenticated user id, then IP. */
  key?: (req: FastifyRequest) => string;
  now?: () => number;
}

/** Tiny fixed-window limiter (no plugin needed). Returns a Fastify preHandler. */
export function rateLimit(opts: LimitOptions) {
  const hits = new Map<string, { count: number; reset: number }>();
  const now = opts.now ?? Date.now;
  let sweepAt = 0;

  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const t = now();
    if (t > sweepAt) {
      for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
      sweepAt = t + opts.windowMs;
    }
    const key = opts.key ? opts.key(req) : (req.zenUserId ?? req.ip);
    const cur = hits.get(key);
    if (!cur || cur.reset <= t) {
      hits.set(key, { count: 1, reset: t + opts.windowMs });
      return;
    }
    cur.count++;
    if (cur.count > opts.max) {
      reply.header('Retry-After', String(Math.ceil((cur.reset - t) / 1000)));
      return reply.code(429).send({ error: 'Too many requests' });
    }
  };
}
