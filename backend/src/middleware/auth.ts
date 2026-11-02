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
        const isAdminPath = request.url.startsWith('/api/admin') || request.url.startsWith('/admin');

        // Helper to hide admin existence: return 404 for unauthenticated admin access
        const failAuth = (msg: string) => {
            if (isAdminPath) throw server.httpErrors.notFound();
            throw server.httpErrors.unauthorized(msg);
        };

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
            failAuth('Authentication required: No token found in authorization header, query param, or cookie');
        }

        try {
            const decoded = await server.jwt.verify(token);
            request.user = decoded;
        } catch (err: any) {
            request.log.error({ err: err.message }, "Cookie verification failed");
            failAuth(`Invalid or expired session: ${err.message}`);
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
            const isAdminCheck = roles.includes('ADMIN');

            if (!request.user) {
                // Return 404 for admin routes to mask existence from unauthenticated callers
                if (isAdminCheck) {
                    throw server.httpErrors.notFound();
                }
                throw server.httpErrors.unauthorized('Not authenticated');
            }

            if (!roles.includes(request.user.role)) {
                // Return 404 for admin routes to mask existence from non-admin users
                if (isAdminCheck) {
                    throw server.httpErrors.notFound();
                }
                throw server.httpErrors.forbidden('Insufficient permissions');
            }
        };
    });
});
