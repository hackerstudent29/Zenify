import type { FastifyInstance } from 'fastify';
import { Authenticator, requireUser } from '../auth/auth';
import { rateLimit } from '../security/rateLimit';
import { publicProfileBody, username as usernameSchema, type PublicProfileDoc } from '../shared/schemas';
import type { JsonStore } from '../store/jsonStore';

export interface ProfileState {
  profiles: Record<string, { doc: PublicProfileDoc; updatedAt: number }>;
  usernames: Record<string, string>; // username -> userId
}

export const emptyProfileState = (): ProfileState => ({ profiles: {}, usernames: {} });

class Conflict extends Error {}

export interface ProfileOptions {
  store: JsonStore<ProfileState>;
  auth: Authenticator;
  now?: () => number;
}

/**
 * Public profiles. The server only ever stores the allowlisted public document
 * (see PublicProfile on the client) and never returns the owner's user id.
 */
export function profileRoutes(opts: ProfileOptions) {
  const now = opts.now ?? Date.now;
  const authed = requireUser(opts.auth);
  const write = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, now });
  const read = rateLimit({ windowMs: 60 * 1000, max: 120, now, key: (r) => `ip:${r.ip}` });

  return async function register(server: FastifyInstance): Promise<void> {
    server.put('/profiles/me', { preHandler: [authed, write] }, async (req, reply) => {
      const p = publicProfileBody.safeParse(req.body);
      if (!p.success) {
        return reply.code(400).send({ error: 'Invalid request', fields: [...new Set(p.error.issues.map((i) => i.path.join('.')))].slice(0, 10) });
      }
      const uid = req.zenUserId as string;
      const doc = p.data;
      try {
        await opts.store.update((s) => {
          const owner = s.usernames[doc.username];
          if (owner && owner !== uid) throw new Conflict();
          const old = s.profiles[uid]?.doc.username;
          if (old && old !== doc.username) delete s.usernames[old];
          s.usernames[doc.username] = uid;
          s.profiles[uid] = { doc, updatedAt: now() };
        });
      } catch (e) {
        if (e instanceof Conflict) return reply.code(409).send({ error: 'Username is taken' });
        throw e;
      }
      return reply.send({ profile: doc });
    });

    server.get('/profiles/:username', { preHandler: [read] }, async (req, reply) => {
      const parsed = usernameSchema.safeParse((req.params as { username: string }).username);
      if (!parsed.success) return reply.code(404).send({ error: 'Not found' });
      const s = opts.store.read();
      const uid = s.usernames[parsed.data];
      const rec = uid ? s.profiles[uid] : undefined;
      if (!rec) return reply.code(404).send({ error: 'Not found' });
      return reply.header('Cache-Control', 'public, max-age=60').send({ profile: rec.doc });
    });

    server.delete('/profiles/me', { preHandler: [authed, write] }, async (req, reply) => {
      const uid = req.zenUserId as string;
      await opts.store.update((s) => {
        const u = s.profiles[uid]?.doc.username;
        if (u) delete s.usernames[u];
        delete s.profiles[uid];
      });
      return reply.code(204).send();
    });
  };
}
