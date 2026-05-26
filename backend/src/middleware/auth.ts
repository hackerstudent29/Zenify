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
        // 1. Try Header
        if (request.headers.authorization) {
            try {
                await request.jwtVerify();
                return;
            } catch (err: any) {
                // If header failed, it might be expired. Proceed to check cookie.
                request.log.warn({ err: err.message }, "Authorization header verification failed");
            }
        }

        // 2. Try Cookie
        const token = request.cookies.accessToken;
        if (!token) {
            throw server.httpErrors.unauthorized('Authentication required: No token found in header or cookie');
        }

        try {
            const decoded = await server.jwt.verify(token);
            request.user = decoded;
        } catch (err: any) {
            request.log.error({ err: err.message }, "Cookie verification failed");
            throw server.httpErrors.unauthorized(`Invalid or expired session: ${err.message}`);
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
