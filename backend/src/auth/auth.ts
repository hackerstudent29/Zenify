import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    zenUserId?: string;
  }
}

/** Resolves the caller from a request (e.g. verifies the app's JWT). */
export type Authenticator = (req: FastifyRequest) => Promise<{ id: string } | null>;

/** Fail-closed default: nobody is authenticated until the app supplies one. */
export const denyAll: Authenticator = async () => null;

/** preHandler that 401s unless [auth] returns a user. Never leaks why. */
export function requireUser(auth: Authenticator) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    let user: { id: string } | null = null;
    try {
      user = await auth(req);
    } catch {
      user = null;
    }
    if (!user || !user.id) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    req.zenUserId = user.id;
  };
}
