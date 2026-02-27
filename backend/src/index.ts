import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
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
        const allowedOrigins = config.FRONTEND_URL.split(',');
        if (!origin ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            origin.includes('vercel.app') ||
            origin.includes('listenzenify.com') ||
            allowedOrigins.includes(origin)) {
            cb(null, true);
            return;
        }
        cb(null, false); // Block other origins
    },
    credentials: true,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
});

server.register(helmet, {
    global: true,
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'", "http://localhost:3000", "http://127.0.0.1:3000", "http://10.216.26.186:3000", "https:", "data:", "blob:", "'unsafe-inline'", "'unsafe-eval'"],
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            "connect-src": ["'self'", "http://localhost:3000", "http://127.0.0.1:3000", "http://10.216.26.186:3000", "https:", "data:", "blob:"],
            "media-src": ["'self'", "http://localhost:3000", "http://127.0.0.1:3000", "http://10.216.26.186:3000", "https:", "data:", "blob:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "cross-origin" }
});

server.register(sensible);

server.register(cookie);

server.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/public/',
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
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
import { albumRoutes } from './routes/album.routes';
import { billingRoutes } from './routes/billing.routes';
import { analyticsRoutes } from './routes/analytics.routes';
import { metadataRoutes } from './routes/metadata.routes';
import { homepageRoutes } from './routes/homepage.routes';
import { utilsRoutes } from './routes/utils.routes';
import { authMiddleware } from './middleware/auth';
import { HomepageService } from './services/homepage.service';

server.register(authMiddleware);

server.register(authRoutes, { prefix: '/api/auth' });
server.register(trackRoutes, { prefix: '/api/tracks' });
server.register(searchRoutes, { prefix: '/api/search' });
server.register(playlistRoutes, { prefix: '/api/playlists' });
server.register(albumRoutes, { prefix: '/api/albums' });
server.register(billingRoutes, { prefix: '/api/billing' });
server.register(analyticsRoutes, { prefix: '/api/analytics' });
server.register(metadataRoutes, { prefix: '/api/metadata' });
server.register(homepageRoutes, { prefix: '/api/home' });
server.register(utilsRoutes, { prefix: '/api/utils' });

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

        // Run engagement score update on startup + every 15 minutes
        HomepageService.updateEngagementScores();
        setInterval(() => HomepageService.updateEngagementScores(), 15 * 60 * 1000);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
