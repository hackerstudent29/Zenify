import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: any, reply: any) => Promise<void>;
        optionalAuthenticate: (request: any, reply: any) => Promise<void>;
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
                // If header failed, it might be expired. Proceed to check query or cookie.
                request.log.warn({ err: err.message }, "Authorization header verification failed");
            }
        }

        // 2. Try Query Param (for EventSource SSE streams which cannot send custom headers)
        const queryToken = (request.query as any)?.token;
        if (queryToken) {
            try {
                const decoded = await server.jwt.verify(queryToken);
                request.user = decoded;
                return;
            } catch (err: any) {
                request.log.warn({ err: err.message }, "Query token verification failed");
            }
        }

        // 3. Try Cookie
        const token = request.cookies?.accessToken;
        if (!token) {
            throw server.httpErrors.unauthorized('Authentication required: No token found in authorization header, query param, or cookie');
        }

        try {
            const decoded = await server.jwt.verify(token);
            request.user = decoded;
        } catch (err: any) {
            request.log.error({ err: err.message }, "Cookie verification failed");
            throw server.httpErrors.unauthorized(`Invalid or expired session: ${err.message}`);
        }
    });

    server.decorate('optionalAuthenticate', async (request: any, reply: any) => {
        // 1. Try Header
        if (request.headers?.authorization) {
            try {
                await request.jwtVerify();
                return;
            } catch (err: any) {
                // Ignore expired or invalid token for optional auth
            }
        }

        // 2. Try Query Param
        const queryToken = (request.query as any)?.token;
        if (queryToken) {
            try {
                const decoded = await server.jwt.verify(queryToken);
                request.user = decoded;
                return;
            } catch (err: any) {
                // Ignore for optional auth
            }
        }

        // 3. Try Cookie
        const token = request.cookies?.accessToken;
        if (!token) return;

        try {
            const decoded = await server.jwt.verify(token);
            request.user = decoded;
        } catch (err: any) {
            // Ignore for optional auth
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
