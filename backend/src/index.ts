import fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import path from 'path';
import { config } from './config/env';

const server = fastify({
    logger: {
        level: config.NODE_ENV === 'production' ? 'warn' : 'info',
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    },
}).withTypeProvider<ZodTypeProvider>();

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(cors, {
    origin: (origin, cb) => {
        if (!origin ||
            origin.includes('localhost') ||
            origin.includes('vercel.app') ||
            origin.includes('listenzenify.com') ||
            origin === config.FRONTEND_URL) {
            cb(null, true);
            return;
        }
        cb(null, false); // Block other origins
    },
    credentials: true,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
});

server.register(sensible);

server.register(cookie);

server.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/public/',
});

server.register(fastifyMultipart, {
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        fieldSize: 100 * 1024 * 1024 // 100MB
    }
});

server.register(jwt, {
    secret: config.JWT_SECRET,
});

import { authRoutes } from './routes/auth.routes';
import { trackRoutes } from './routes/track.routes';
import { searchRoutes } from './routes/search.routes';
import { playlistRoutes } from './routes/playlist.routes';
import { billingRoutes } from './routes/billing.routes';
import { authMiddleware } from './middleware/auth';

server.register(authMiddleware);

server.register(authRoutes, { prefix: '/api/auth' });
server.register(trackRoutes, { prefix: '/api/tracks' });
server.register(searchRoutes, { prefix: '/api/search' });
server.register(playlistRoutes, { prefix: '/api/playlists' });
server.register(billingRoutes, { prefix: '/api/billing' });
import { analyticsRoutes } from './routes/analytics.routes';
server.register(analyticsRoutes, { prefix: '/api/analytics' });

server.get('/health', async () => {
    return { status: 'ok' };
});

server.get('/', async () => {
    return { message: 'Zenify API is running 🎵', documentation: '/documentation' };
});

server.get('/pricing', async (request, reply) => {
    // If someone hits this on the backend port, they likely meant to hit the frontend
    return reply.status(200).send({
        message: 'This is the Zenify API. For the Pricing page, please visit the frontend.',
        frontendUrl: config.FRONTEND_URL + '/pricing'
    });
});

const start = async () => {
    try {
        await server.listen({ port: config.PORT, host: '0.0.0.0' });
        server.log.info(`Server listening on port ${config.PORT}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
