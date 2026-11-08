import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import path from 'path';
import fs from 'fs';
import { config } from './config/env';
import { logBuffer } from './utils/log-buffer';

// Global uncaught exceptions and unhandled rejections safety net
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION] Prevented server crash:', reason);
    logBuffer.add({
        level: 'ERROR',
        category: 'SYSTEM',
        message: `[UNHANDLED REJECTION] ${String(reason)}`
    });
});

process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION] Prevented server crash:', error);
    logBuffer.add({
        level: 'ERROR',
        category: 'SYSTEM',
        message: `[UNCAUGHT EXCEPTION] ${error?.message || String(error)}`
    });
});

// BigInt Serialization Polyfill
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

const server = fastify({
    trustProxy: true,
    ignoreTrailingSlash: true,
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
        ['127.0.0.1', '::1'].includes(req.ip),
    errorResponseBuilder: (request, context) => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    })
});

function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true;
    // Allow all local development origins (Flutter Chrome :8085, Preview :8080, Vite :5173, etc.)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return true;
    }
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

    const isVercel = (
        origin === 'https://listenzenify.vercel.app' || 
        origin === 'https://listenzenify.com' ||
        /^https:\/\/listenzenify[a-z0-9-]*\.vercel\.app$/.test(origin) ||
        /^https:\/\/zenify[a-z0-9-]*\.vercel\.app$/.test(origin)
    );

    return allowedOrigins.includes(origin) || isVercel;
}

server.register(cors, {
    origin: (origin, cb) => {
        if (!origin || isOriginAllowed(origin)) {
            cb(null, true);
            return;
        }
        cb(null, false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
        'Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 
        'Range', 'baggage', 'sentry-trace', 'x-user-language', 'x-user-country', 'x-user-recent-artists', 'x-admin-key'
    ],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
});

server.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false, // Allows Google OAuth popup window.closed check
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: 'sameorigin' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

// CSRF check hook for state-changing browser requests
server.addHook('onRequest', async (request, reply) => {
    const method = request.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const url = request.url;
        // Allow public webhooks
        if (url.startsWith('/webhooks') || url.startsWith('/api/webhooks')) {
            return;
        }
        const origin = request.headers.origin;
        if (origin && !isOriginAllowed(origin)) {
            server.log.warn(`[CSRF] Blocked cross-origin request from: ${origin} to ${url}`);
            return reply.status(403).send({
                statusCode: 403,
                error: 'Forbidden',
                message: 'Cross-origin request blocked.'
            });
        }
    }
});


// Real-time backend request and response logging to logBuffer for Admin Telemetry
server.addHook('onResponse', (request, reply, done) => {
    const status = reply.statusCode;
    const method = request.method;
    const url = request.url;
    // Filter out internal high-frequency poll/stream/health checks
    if (url.startsWith('/api/admin/database/logs') || url === '/health') {
        done();
        return;
    }
    const elapsed = Math.round(reply.elapsedTime);
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
    const category = url.startsWith('/api/auth') ? 'AUTH' : (url.startsWith('/api/admin') ? 'DATABASE' : 'HTTP');

    logBuffer.add({
        level,
        category,
        message: `[${method}] ${url} -> ${status} (${elapsed}ms)`,
        details: {
            method,
            url,
            statusCode: status,
            elapsedMs: elapsed,
            ip: request.ip
        }
    });
    done();
});

server.setErrorHandler((error: any, request, reply) => {
    const origin = request.headers.origin;
    if (origin && isOriginAllowed(origin)) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
    }
    server.log.error(error);
    logBuffer.add({
        level: 'ERROR',
        category: 'HTTP',
        message: `[ERROR ${error.statusCode || 500}] ${request.method} ${request.url} - ${error.message}`,
        details: { stack: error.stack }
    });
    const statusCode = error.statusCode || 500;
    const isProd = config.NODE_ENV === 'production';
    reply.status(statusCode).send({
        statusCode,
        error: error.name || (statusCode >= 500 ? 'Internal Server Error' : 'Bad Request'),
        message: isProd && statusCode >= 500 ? 'An unexpected error occurred' : (error.message || 'An unexpected error occurred')
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

server.register(websocket);

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
import { togetherRoutes } from './routes/together.routes';
import { registerTogetherWebSocket } from './websocket/together-ws';
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
server.register(togetherRoutes, { prefix: '/api/together' });
server.register(registerTogetherWebSocket);
import { shareRoutes } from './routes/share.routes';
server.register(shareRoutes);
import { followRoutes } from './routes/follow.routes';
server.register(followRoutes, { prefix: '/api/me' });
import { dayMixRoutes } from './routes/day-mix.routes';
server.register(dayMixRoutes, { prefix: '/api/me' });
import { blendRoutes } from './routes/blend.routes';
server.register(blendRoutes, { prefix: '/api/me' });
import { meRoutes } from './routes/me.routes';
server.register(meRoutes, { prefix: '/api/me' });
import { discoveryRoutes } from './routes/discovery.routes';
server.register(discoveryRoutes, { prefix: '/api/discover' });
import { databaseAdminRoutes } from './routes/database-admin.routes';
server.register(databaseAdminRoutes, { prefix: '/api/admin/database' });
import { lyricsPipelineRoutes } from './routes/lyrics-pipeline.routes';
server.register(lyricsPipelineRoutes, { prefix: '/api' });

server.get('/health', async () => {
    return { status: 'ok' };
});

server.get('/time', async () => {
    return { serverNowMs: Date.now() };
});

server.get('/api/time', async () => {
    return { serverNowMs: Date.now() };
});

server.post('/api/diag', async (request, reply) => {
    const body = request.body as any;
    if (body) {
        server.log.warn({ diag: body }, '[Diagnostics] Device playback failure reported');
        logBuffer.add({
            level: 'WARN',
            category: 'SYSTEM',
            message: `[DIAG] ${body.code || 'UNKNOWN'} (${body.layer || 'unknown'}) - ${body.httpStatus || ''}`,
            details: body,
        });
    }
    return { ok: true };
});

const defaultRemoteConfig = {
    version: 2,
    streamMode: 'device',
    resolver: {
        maxConcurrentResolves: 2,
        urlSafetyMarginSec: 600,
        breakerThreshold: 5,
        baseCooldownSec: 30,
        maxCooldownSec: 1800,
        preResolveCount: 1,
    },
    innertube: {
        clientVersion: '1.20241101.01.00',
        maxAttempts: 3,
        bucketCapacity: 6,
        refillPerSecond: 2.5,
    },
    killSwitches: {
        cloudFallback: false,
        remoteSuggestions: false,
        charts: false,
        newReleases: false,
        preResolve: false,
        homeFeed: false,
    },
    minAppVersion: '1.0.0',
    latestAppVersion: '2.6.5',
    updateUrl: 'https://listenzenify.com/download/app',
    releaseNotes: '• Native InnerTube audio streaming: Sub-300ms instant playback without 403 errors\n• Universal Media Normalizer: Clean album/track titles & accurate artist names across Home, Explore & Search\n• High-definition artist artwork upscaled across all search cards and recent history\n• Fixed marquee title left-edge clipping and improved docked player clearance\n• Enhanced stability & Android 14+ navigation performance',
    message: null,
};

server.get('/download/app', async (request, reply) => {
    const apkPath = path.join(__dirname, '../public/downloads/zenify.apk');
    if (fs.existsSync(apkPath)) {
        reply.header('Content-Disposition', 'attachment; filename="zenify-v2.6.5.apk"');
        reply.header('Content-Type', 'application/vnd.android.package-archive');
        return reply.sendFile('downloads/zenify.apk');
    }
    return reply.redirect('https://listenzenify.com/downloads/zenify.apk');
});

server.get('/api/download/app', async (request, reply) => {
    const apkPath = path.join(__dirname, '../public/downloads/zenify.apk');
    if (fs.existsSync(apkPath)) {
        reply.header('Content-Disposition', 'attachment; filename="zenify-v2.6.5.apk"');
        reply.header('Content-Type', 'application/vnd.android.package-archive');
        return reply.sendFile('downloads/zenify.apk');
    }
    return reply.redirect('https://listenzenify.com/downloads/zenify.apk');
});

server.get('/remote_config.json', async () => {
    return defaultRemoteConfig;
});

server.get('/api/config', async () => {
    return defaultRemoteConfig;
});

server.get('/', async () => {
    return { message: 'Zenify API is running 🎵', documentation: '/documentation' };
});

import { CronService } from './services/cron.service';

const start = async () => {
    try {
        await server.listen({ port: config.PORT, host: '0.0.0.0' });
        server.log.info(`Server listening on port ${config.PORT}`);
        logBuffer.add({ level: 'INFO', category: 'SYSTEM', message: `Zenify API listening on port ${config.PORT} (${config.NODE_ENV})` });

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
