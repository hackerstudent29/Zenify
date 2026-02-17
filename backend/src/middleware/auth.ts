import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: any, reply: any) => Promise<void>;
        authorize: (roles: string[]) => (request: any, reply: any) => Promise<void>;
    }
}

export const authMiddleware = fp(async (server: FastifyInstance, options: FastifyPluginOptions) => {
    server.decorate('authenticate', async (request: any, reply: any) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            reply.send(err);
        }
    });

    server.decorate('authorize', (roles: string[]) => {
        return async (request: any, reply: any) => {
            if (!request.user) {
                throw server.httpErrors.unauthorized('Not authenticated');
            }
            if (!roles.includes(request.user.role)) {
                throw server.httpErrors.forbidden('Insufficient permissions');
            }
        };
    });
});
