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
        // Try to verify token from header first
        if (request.headers.authorization) {
            await request.jwtVerify();
            return;
        }

        // If no header, check cookie
        const token = request.cookies.accessToken;
        if (!token) {
            throw server.httpErrors.unauthorized('Authentication required');
        }

        try {
            // Verify manually from cookie
            const decoded = await server.jwt.verify(token);
            request.user = decoded;
        } catch (err) {
            // If token is invalid/expired
            throw server.httpErrors.unauthorized('Invalid or expired session');
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
