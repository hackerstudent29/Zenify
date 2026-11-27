import Fastify, { type FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { denyAll, type Authenticator } from './auth/auth';
import { emptyProfileState, profileRoutes, type ProfileState } from './routes/profile.routes';
import { emptySocialState, socialRoutes, type SocialState } from './routes/social.routes';
import { JsonStore } from './store/jsonStore';

export interface AppOptions {
  /** Verify the caller. Defaults to deny-all (fail closed). */
  auth?: Authenticator;
  dataDir: string;
  publicBaseUrl?: string;
  /** Set when running behind a reverse proxy so rate limits use the real IP. */
  trustProxy?: boolean;
  now?: () => number;
}

/** Builds the Replay social/profile API. Mount the same plugins in the main server. */
export async function buildApp(o: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 32 * 1024, trustProxy: o.trustProxy ?? false });
  const social = await new JsonStore<SocialState>(join(o.dataDir, 'social.json'), emptySocialState).init();
  const profiles = await new JsonStore<ProfileState>(join(o.dataDir, 'profiles.json'), emptyProfileState).init();
  const auth = o.auth ?? denyAll;

  // Tolerate empty bodies on JSON requests (e.g. DELETE) while keeping the size cap.
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 32 * 1024 }, (_req, body, done) => {
    if (typeof body !== 'string' || body.length === 0) return done(null, undefined);
    try {
      done(null, JSON.parse(body));
    } catch {
      const err = new Error('Invalid JSON') as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
  });

  app.setErrorHandler((err, _req, reply) => {
    const e = err as { statusCode?: number };
    const code = typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500 ? e.statusCode : 500;
    // never leak internals
    reply.code(code).send({ error: code === 500 ? 'Internal error' : 'Bad request' });
  });

  await app.register(socialRoutes({ store: social, auth, publicBaseUrl: o.publicBaseUrl ?? 'https://zenify.app', ...(o.now ? { now: o.now } : {}) }));
  await app.register(profileRoutes({ store: profiles, auth, ...(o.now ? { now: o.now } : {}) }));
  return app;
}
