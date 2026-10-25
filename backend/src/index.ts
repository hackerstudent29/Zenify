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

// Global uncaught exceptions and unhandled rejections safety net
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION] Prevented server crash:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION] Prevented server crash:', error);
});

// BigInt Serialization Polyfill
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

const server = fastify({
    trustProxy: true,
    logger: {
        level: 'info',
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

import rateLimit from '@fastify/rate-limit';

server.register(rateLimit, {
    max: 300, // 300 requests per minute per IP for high-concurrency browsing
    timeWindow: '1 minute',
    allowList: (req) =>
        req.method === 'OPTIONS' ||
        ['127.0.0.1', '::1'].includes(req.ip) ||
        req.url.includes('/stream-youtube') ||
        req.url.includes('/proxy-audio') ||
        req.url.includes('/proxy-image'),
    errorResponseBuilder: (request, context) => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    })
});

server.register(cors, {
    origin: (origin, cb) => {
        const allowedOrigins = [
            ...config.FRONTEND_URL.split(','),
            'https://listenzenify.vercel.app',
            'https://listenzenify.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:3001',
            'http://127.0.0.1:3001',
            'http://localhost:5173',
            'http://127.0.0.1:5173'
        ].map(o => o.trim()).filter(Boolean);

        const isVercel = origin ? (
            origin === 'https://listenzenify.vercel.app' || 
            origin === 'https://listenzenify.com' ||
            /^https:\/\/listenzenify[a-z0-9-]*\.vercel\.app$/.test(origin) ||
            /^https:\/\/zenify[a-z0-9-]*\.vercel\.app$/.test(origin)
        ) : false;

        if (!origin || allowedOrigins.includes(origin) || isVercel) {
            cb(null, true);
            return;
        }
        cb(null, false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
        'Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 
        'Range', 'baggage', 'sentry-trace', 'x-user-language', 'x-user-country', 'x-admin-key'
    ],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
});

server.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false, // Allows Google OAuth popup window.closed check
    crossOriginResourcePolicy: { policy: "cross-origin" }
});

server.setErrorHandler((error: any, request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
    }
    server.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
        statusCode,
        error: error.name || 'Internal Server Error',
        message: error.message || 'An unexpected error occurred'
    });
});

server.register(sensible);

server.register(cookie);

server.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/public/',
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
});

server.register(fastifyMultipart, {
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        fieldSize: 150 * 1024 * 1024 // 150MB
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
import { webhookRoutes } from './routes/webhook.routes';
import { artistRoutes } from './routes/artist.routes';
import { notificationRoutes } from './routes/notification.routes';
import { authMiddleware } from './middleware/auth';
import { settingsRoutes } from './routes/settings.routes';
import { preferencesRoutes } from './routes/preferences.routes';
import { activityRoutes } from './routes/activity.routes';
import { queueRoutes } from './routes/queue.routes';
import { HomepageService } from './services/homepage.service';
import { ScheduledPublishService } from './services/scheduled-publish.service';
import { AnalysisSchedulerService } from './services/analysis-scheduler.service';

server.register(authMiddleware);

server.register(authRoutes, { prefix: '/api/auth' });
server.register(trackRoutes, { prefix: '/api/tracks' });
server.register(searchRoutes, { prefix: '/api/search' });
server.register(playlistRoutes, { prefix: '/api/playlists' });
server.register(albumRoutes, { prefix: '/api/albums' });
server.register(billingRoutes, { prefix: '/api/billing' });
server.register(analyticsRoutes, { prefix: '/api/analytics' });
server.register(metadataRoutes, { prefix: '/api/metadata' });
server.register(homepageRoutes, { prefix: '/api/homepage' });
server.register(settingsRoutes, { prefix: '/api/settings' });
server.register(utilsRoutes, { prefix: '/api/utils' });
server.register(webhookRoutes, { prefix: '/webhooks' });
server.register(artistRoutes, { prefix: '/api/artists' });
server.register(notificationRoutes, { prefix: '/api/notifications' });
server.register(preferencesRoutes, { prefix: '/api/preferences' });
server.register(activityRoutes, { prefix: '/api/activity' });
server.register(queueRoutes, { prefix: '/api/queue' });
import { discoveryRoutes } from './routes/discovery.routes';
server.register(discoveryRoutes, { prefix: '/api/discover' });

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

import { CronService } from './services/cron.service';

const start = async () => {
    try {
        await server.listen({ port: config.PORT, host: '0.0.0.0' });
        server.log.info(`Server listening on port ${config.PORT}`);

        // Run engagement score update on startup + every 3 hours
        HomepageService.updateEngagementScores();
        setInterval(() => HomepageService.updateEngagementScores(), 3 * 60 * 60 * 1000);

        // Start scheduled publishing service
        ScheduledPublishService.start();
        server.log.info('Scheduled publishing service started');

        // Start Cron jobs
        CronService.init();
        server.log.info('CronService initialized');

        // Start deterministic AI Analysis Scheduler (12:30 AM Asia/Kolkata, 10 req/min cap)
        AnalysisSchedulerService.init();
        server.log.info('AnalysisSchedulerService initialized');

        // Start 24/7 Elastic Auto-Scaling Lyrics Enrichment & Deepgram Onset Engine
        const { ElasticLyricWorker } = await import('./queues/lyric-enrichment.worker.js');
        ElasticLyricWorker.start();
        server.log.info('ElasticLyricWorker started (Elastic Auto-scaling Concurrency & Deepgram Onset Alignment)');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
