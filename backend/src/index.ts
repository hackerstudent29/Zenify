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
    // Native Android app requests have no browser Origin header.
    if (!origin) return true;
    // Allow all local development origins (Flutter Chrome :8085, Preview :8080, Vite :5173, etc.)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return true;
    }
    const allowedOrigins = [
        ...config.FRONTEND_URL.split(','),
        'https://listenzenify.vercel.app',
        'https://listenzenify.com',
        'https://www.listenzenify.com',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
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
        'Range', 'baggage', 'sentry-trace', 'x-user-language', 'x-user-languages', 'x-user-country', 'x-user-recent-artists', 'x-admin-key',
        'Idempotency-Key', 'X-Timezone', 'X-Together-Ticket', 'X-Guest-Id', 'X-Guest-Name', 'X-Device-Key'
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
    setHeaders: (reply) => {
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
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
import { settingsRoutes } from './routes/settings.routes';
import { authMiddleware } from './middleware/auth';
import { preferencesRoutes } from './routes/preferences.routes';
import { activityRoutes } from './routes/activity.routes';
import { queueRoutes } from './routes/queue.routes';
import { togetherRoutes } from './routes/together.routes';
import { togetherPublicRoutes, togetherV1Routes } from './routes/together-v1.routes';
import { RoomLifecycleScheduler } from './services/together/room-lifecycle.scheduler';
import { registerTogetherWebSocket } from './websocket/together-ws';
import { ScheduledPublishService } from './services/scheduled-publish.service';
import { shareRoutes } from './routes/share.routes';
import { followRoutes } from './routes/follow.routes';
import { dayMixRoutes } from './routes/day-mix.routes';
import { blendRoutes } from './routes/blend.routes';
import { replayRoutes } from './routes/replay.routes';
import { emptySocialState, socialPublicRoutes, socialRoutes, type SocialState } from './routes/social.routes';
import { emptyProfileState, profileRoutes, type ProfileState } from './routes/profile.routes';
import type { Authenticator } from './auth/auth';
import { JsonStore } from './store/jsonStore';
import { meRoutes } from './routes/me.routes';
import { libraryRoutes } from './routes/library.routes';
import { discoveryRoutes } from './routes/discovery.routes';
import { databaseAdminRoutes } from './routes/database-admin.routes';
import { lyricsPipelineRoutes } from './routes/lyrics-pipeline.routes';
import { feedbackRoutes } from './routes/feedback.routes';

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
server.register(togetherV1Routes, { prefix: '/api/v1/together' });
server.register(togetherPublicRoutes);
server.register(registerTogetherWebSocket);
server.register(shareRoutes);
server.register(followRoutes, { prefix: '/api/me' });
server.register(dayMixRoutes, { prefix: '/api/me' });
server.register(blendRoutes, { prefix: '/api/me' });
server.register(async (replayApp) => {
    const replayDataDir = process.env.REPLAY_DATA_DIR || path.join(process.cwd(), 'data', 'replay');
    const [socialStore, profileStore] = await Promise.all([
        new JsonStore<SocialState>(path.join(replayDataDir, 'social.json'), emptySocialState).init(),
        new JsonStore<ProfileState>(path.join(replayDataDir, 'profiles.json'), emptyProfileState).init(),
    ]);

    const extractJwtUser: Authenticator = async (req) => {
        try {
            if (req.headers.authorization) {
                await req.jwtVerify();
            } else if ((req as any).cookies?.accessToken) {
                (req as any).user = await server.jwt.verify((req as any).cookies.accessToken);
            } else {
                return null;
            }
            const u = (req as any).user;
            const id = u?.id ?? u?.userId ?? u?.sub;
            return id ? { id: String(id) } : null;
        } catch {
            return null;
        }
    };

    const publicWebUrl = process.env.PUBLIC_WEB_URL || 'https://listenzenify.vercel.app';

    await replayApp.register(replayRoutes, { prefix: '/api/replay', optionalAuthenticate: server.optionalAuthenticate });
    await replayApp.register(socialRoutes({ store: socialStore, auth: extractJwtUser, publicBaseUrl: publicWebUrl }), { prefix: '/api/replay' });
    await replayApp.register(profileRoutes({ store: profileStore, auth: extractJwtUser }), { prefix: '/api/replay' });
    await replayApp.register(socialPublicRoutes({ store: socialStore, webBaseUrl: publicWebUrl }));
});
server.register(meRoutes, { prefix: '/api/me' });
server.register(libraryRoutes, { prefix: '/api/me/library' });
server.register(feedbackRoutes, { prefix: '/api/me' });
server.register(discoveryRoutes, { prefix: '/api/discover' });
server.register(databaseAdminRoutes, { prefix: '/api/admin/database' });
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
    version: 2036,
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
    minAppVersion: '1.0.12',
    latestAppVersion: '1.1.22',
    isForceUpdate: false,
    releaseDate: 'November 25, 2026',
    releaseTime: '09:40 PM IST',
    updateUrl: 'https://github.com/hackerstudent29/Zenify/releases/download/v1.1.22/zenify-v1.1.22.apk',
    features: [
        'Stable Version 1 Milestone: Official first stable release of Zenify for Android with the new white and rose Zendrum app icon',
        'Song Credits & Static View Lyrics: Full song credits breakdown (cast, composers, lyricists) and a clean, distraction-free static Lyrics page',
        'Smart Singles, Albums, Videos & Offline Downloads: Accurate album matching, quick Artist & Album jump sheet, offline video downloads, and cleaner song metadata',
        'Smooth 90° Rotation & Landscape Video Controls: Crisp portrait-to-landscape transition with ±10s skip controls, double-tap seeking, fit/fill zoom toggle, and transparent liquid-glass Top Picks',
    ],
    fixes: [
        'Improved Audio & Video Playback: Resolved playback startup errors across audio, fallback streams, and video playback, with smoother system volume and focus handling',
        'Persistent Dock & MiniPlayer when navigating to Credits, View Lyrics, Artist, Album, and Category pages',
        'Improved bottom scroll spacing across detail pages so content never hides behind the Dock or MiniPlayer',
        'Fixed wrong album redirects, unplugged version mismatches, and View Lyrics scroll layout shifting',
    ],
    improvements: [
        'Broader, user-friendly release notes and in-app update details',
        'Streamlined background services for faster startup and cleaner performance',
        'Improved stability across audio focus, credits, lyrics, artwork effects, and video downloads',
    ],
    releaseNotes: '🎉 Zenify v1.1.22 — Stable Version 1 is now live!\n• New white + rose Zendrum app icon & smoother audio/video playback\n• Persistent Dock & MiniPlayer on Credits, View Lyrics, Album & Artist pages\n• Dedicated Song Credits, clean static View Lyrics & offline video downloads\n• Smooth 90° portrait/landscape rotation & landscape video ±10s + fit/fill controls\n• Smarter Single/Album/Video browsing & transparent liquid-glass Top Picks',
    message: 'Update to Zenify v1.1.22 (Stable Version 1) for the new Zendrum app icon, smoother playback, persistent Dock & MiniPlayer on Credits & Lyrics, 90° landscape controls, and offline video downloads.',
};

server.get('/download/app', async (request, reply) => {
    const apkPath = path.join(__dirname, '../public/downloads/zenify.apk');
    if (fs.existsSync(apkPath)) {
        reply.header('Content-Disposition', 'attachment; filename="zenify-v1.1.22.apk"');
        reply.header('Content-Type', 'application/vnd.android.package-archive');
        return reply.sendFile('downloads/zenify.apk');
    }
    return reply.redirect(defaultRemoteConfig.updateUrl);
});

server.get('/api/download/app', async (request, reply) => {
    const apkPath = path.join(__dirname, '../public/downloads/zenify.apk');
    if (fs.existsSync(apkPath)) {
        reply.header('Content-Disposition', 'attachment; filename="zenify-v1.1.22.apk"');
        reply.header('Content-Type', 'application/vnd.android.package-archive');
        return reply.sendFile('downloads/zenify.apk');
    }
    return reply.redirect(defaultRemoteConfig.updateUrl);
});

server.get('/remote_config.json', async () => {
    return defaultRemoteConfig;
});

server.get('/api/config', async () => {
    return defaultRemoteConfig;
});

server.get('/', async () => {
    return {
        name: 'Zenify API',
        version: '1.1.22',
        status: 'ok',
        message: 'Zenify API is running 🎵',
        website: 'https://listenzenify.vercel.app',
        llms: 'https://listenzenify.vercel.app/llms.txt',
        sitemap: 'https://listenzenify.vercel.app/sitemap.xml',
        documentation: '/documentation',
    };
});

server.get('/robots.txt', async (_req, reply) => {
    return reply
        .type('text/plain; charset=utf-8')
        .send('User-agent: *\nAllow: /.well-known/\nAllow: /room/\nDisallow: /api/\n');
});

import { CronService } from './services/cron.service';

const start = async () => {
    try {
        await server.listen({ port: config.PORT, host: '0.0.0.0' });
        RoomLifecycleScheduler.start();
        server.log.info(`Server listening on port ${config.PORT}`);
        logBuffer.add({ level: 'INFO', category: 'SYSTEM', message: `Zenify API listening on port ${config.PORT} (${config.NODE_ENV})` });

        // Start scheduled publishing service
        ScheduledPublishService.start();
        server.log.info('Scheduled publishing service started');

        // Start Cron jobs (AI & Deepgram background pipelines are disabled)
        CronService.init();
        server.log.info('CronService initialized');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
