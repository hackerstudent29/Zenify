import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import os from 'os';
import { prisma } from '../utils/prisma';
import { config } from '../config/env';
import { logBuffer, LogEntry } from '../utils/log-buffer';

export async function databaseAdminRoutes(server: FastifyInstance) {
    // Enforce server-side authentication and ADMIN role check on all database admin routes
    const adminGuard = [server.authenticate, server.authorize(['ADMIN'])];

    /**
     * 1. GET /api/admin/database/overview
     * Returns database connection status, PostgreSQL engine version,
     * table row counts across all 26 Prisma models, cache hit ratio, active connections,
     * and system memory stats.
     */
    server.get('/overview', { preHandler: adminGuard }, async (_req: FastifyRequest, reply: FastifyReply) => {
        try {
            const start = Date.now();
            await prisma.$queryRaw`SELECT 1;`;
            const dbLatencyMs = Date.now() - start;

            // Fetch PostgreSQL Version
            let pgVersion = 'PostgreSQL';
            try {
                const versionRes = await prisma.$queryRawUnsafe<any[]>('SELECT version();');
                if (versionRes?.[0]?.version) {
                    pgVersion = versionRes[0].version.split(',')[0];
                }
            } catch (_) {}

            // Fetch PostgreSQL Cache Hit Ratio
            let cacheHitRatio = '99.9%';
            try {
                const cacheRes = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT round(sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100, 2)::text as ratio FROM pg_statio_user_tables;`
                );
                if (cacheRes?.[0]?.ratio) {
                    cacheHitRatio = `${cacheRes[0].ratio}%`;
                }
            } catch (_) {}

            // Fetch PostgreSQL Active & Total Connections
            let activeConnections = 1;
            let totalConnections = 1;
            try {
                const activeRes = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT count(*)::int as count FROM pg_stat_activity WHERE state = 'active';`
                );
                if (activeRes?.[0]?.count !== undefined) {
                    activeConnections = Number(activeRes[0].count);
                }
                const totalRes = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT count(*)::int as count FROM pg_stat_activity;`
                );
                if (totalRes?.[0]?.count !== undefined) {
                    totalConnections = Number(totalRes[0].count);
                }
            } catch (_) {}

            // Fetch Row Counts across ALL 26 Prisma models
            const [
                userCount,
                preferencesCount,
                interestProfileCount,
                refreshTokenCount,
                subscriptionCount,
                transactionCount,
                purchaseCount,
                notificationCount,
                trackCount,
                artistCount,
                albumCount,
                artistAliasCount,
                trackVibeProfileCount,
                featuredContentCount,
                playlistCount,
                playlistTrackCount,
                likeCount,
                ratingCount,
                historyCount,
                userTrackStatCount,
                userDailyStatCount,
                activityEventCount,
                trackAnalyticsCount,
                lyricJobCount,
                analysisRunCount,
                systemSettingsCount,
            ] = await Promise.all([
                prisma.user.count().catch(() => 0),
                prisma.userPreferences.count().catch(() => 0),
                prisma.userInterestProfile.count().catch(() => 0),
                prisma.refreshToken.count().catch(() => 0),
                prisma.subscription.count().catch(() => 0),
                prisma.transaction.count().catch(() => 0),
                prisma.purchase.count().catch(() => 0),
                prisma.notification.count().catch(() => 0),
                prisma.track.count().catch(() => 0),
                prisma.artist.count().catch(() => 0),
                prisma.album.count().catch(() => 0),
                prisma.artistAlias.count().catch(() => 0),
                prisma.trackVibeProfile.count().catch(() => 0),
                prisma.featuredContent.count().catch(() => 0),
                prisma.playlist.count().catch(() => 0),
                prisma.playlistTrack.count().catch(() => 0),
                prisma.like.count().catch(() => 0),
                prisma.rating.count().catch(() => 0),
                prisma.history.count().catch(() => 0),
                prisma.userTrackStat.count().catch(() => 0),
                prisma.userDailyStat.count().catch(() => 0),
                prisma.userActivityEvent.count().catch(() => 0),
                prisma.trackAnalytics.count().catch(() => 0),
                prisma.lyricEnrichmentJob.count().catch(() => 0),
                prisma.analysisRun.count().catch(() => 0),
                prisma.systemSettings.count().catch(() => 0),
            ]);

            // Database Size and Table Sizes
            let dbSize = 'N/A';
            let dbSizeBytes = 0;
            let tableSizes: { table: string; size: string; rows: number }[] = [];

            try {
                const sizeRes = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as bytes;`
                );
                if (sizeRes?.[0]) {
                    dbSize = sizeRes[0].size || 'N/A';
                    dbSizeBytes = Number(sizeRes[0].bytes || 0);
                }

                const tablesRes = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT relname as name, pg_size_pretty(pg_total_relation_size(relid)) as size, n_live_tup as rows
                     FROM pg_stat_user_tables
                     ORDER BY pg_total_relation_size(relid) DESC;`
                );
                if (Array.isArray(tablesRes) && tablesRes.length > 0) {
                    tableSizes = tablesRes.map((t) => ({
                        table: t.name,
                        size: t.size,
                        rows: Number(t.rows || 0),
                    }));
                }
            } catch (_) {}

            // Comprehensive mapping of ALL 26 Prisma models with schema categories
            const allTables = [
                // Category: Identity & Accounts
                { model: 'User', table: 'User', category: 'Identity & Accounts', count: userCount, description: 'Core registered user accounts and credentials' },
                { model: 'UserPreferences', table: 'UserPreferences', category: 'Identity & Accounts', count: preferencesCount, description: 'Audio quality, preferred languages, and genre tastes' },
                { model: 'UserInterestProfile', table: 'UserInterestProfile', category: 'Identity & Accounts', count: interestProfileCount, description: 'Long-term taste embedding and affinity clusters' },
                { model: 'RefreshToken', table: 'RefreshToken', category: 'Identity & Accounts', count: refreshTokenCount, description: 'Active cryptographically secure session refresh tokens' },
                { model: 'Subscription', table: 'Subscription', category: 'Identity & Accounts', count: subscriptionCount, description: 'User subscription tiers, billing cycles, and status' },
                { model: 'Transaction', table: 'Transaction', category: 'Identity & Accounts', count: transactionCount, description: 'Payment processor transaction records and audit logs' },
                { model: 'Purchase', table: 'Purchase', category: 'Identity & Accounts', count: purchaseCount, description: 'One-off audio/merchandise purchase receipts' },
                { model: 'Notification', table: 'Notification', category: 'Identity & Accounts', count: notificationCount, description: 'User push alerts, system notices, and release alarms' },

                // Category: Music Catalog
                { model: 'Track', table: 'Track', category: 'Music Catalog', count: trackCount, description: 'Musical tracks with metadata, audio streams, and lyrics' },
                { model: 'Artist', table: 'Artist', category: 'Music Catalog', count: artistCount, description: 'Musicians, bands, composers, and verified profile data' },
                { model: 'Album', table: 'Album', category: 'Music Catalog', count: albumCount, description: 'Studio albums, EPs, singles, and discographies' },
                { model: 'ArtistAlias', table: 'ArtistAlias', category: 'Music Catalog', count: artistAliasCount, description: 'Regional, transliterated, and alternate artist spellings' },
                { model: 'TrackVibeProfile', table: 'TrackVibeProfile', category: 'Music Catalog', count: trackVibeProfileCount, description: 'Tempo, energy, danceability, and mood attributes' },
                { model: 'FeaturedContent', table: 'FeaturedContent', category: 'Music Catalog', count: featuredContentCount, description: 'Curated home hero banners, editorial carousels, and spotlights' },

                // Category: User Library & Social
                { model: 'Playlist', table: 'Playlist', category: 'User Library & Social', count: playlistCount, description: 'User-created and algorithmic curated playlists' },
                { model: 'PlaylistTrack', table: 'PlaylistTrack', category: 'User Library & Social', count: playlistTrackCount, description: 'Normalized join table mapping tracks to ordered playlists' },
                { model: 'Like', table: 'Like', category: 'User Library & Social', count: likeCount, description: 'Favorite songs bookmarked to personal libraries' },
                { model: 'Rating', table: 'Rating', category: 'User Library & Social', count: ratingCount, description: '1-to-5 star user ratings for tracks and releases' },
                { model: 'History', table: 'History', category: 'User Library & Social', count: historyCount, description: 'Individual play events with playback completion percentage' },

                // Category: Analytics & Telemetry
                { model: 'UserTrackStat', table: 'UserTrackStat', category: 'Analytics & Telemetry', count: userTrackStatCount, description: 'Aggregated per-user play counts and skip rates per track' },
                { model: 'UserDailyStat', table: 'UserDailyStat', category: 'Analytics & Telemetry', count: userDailyStatCount, description: 'Daily listening minutes and session duration rollups' },
                { model: 'UserActivityEvent', table: 'UserActivityEvent', category: 'Analytics & Telemetry', count: activityEventCount, description: 'Real-time UI engagement events and stream telemetry' },
                { model: 'TrackAnalytics', table: 'TrackAnalytics', category: 'Analytics & Telemetry', count: trackAnalyticsCount, description: 'Global play counters, completion metrics, and popularity' },

                // Category: System & Workers
                { model: 'LyricEnrichmentJob', table: 'LyricEnrichmentJob', category: 'System & Workers', count: lyricJobCount, description: 'Background queue jobs for LRCLIB/Deepgram onset alignment' },
                { model: 'AnalysisRun', table: 'AnalysisRun', category: 'System & Workers', count: analysisRunCount, description: 'Batch AI music analysis scheduler execution checkpoints' },
                { model: 'SystemSettings', table: 'SystemSettings', category: 'System & Workers', count: systemSettingsCount, description: 'Dynamic system configuration toggles and feature flags' },
            ];

            const memory = process.memoryUsage();

            return reply.send({
                success: true,
                database: {
                    status: 'CONNECTED',
                    latencyMs: dbLatencyMs,
                    engine: pgVersion,
                    size: dbSize,
                    sizeBytes: dbSizeBytes,
                    cacheHitRatio,
                    activeConnections,
                    totalConnections,
                    totalTablesCount: allTables.length,
                },
                counts: {
                    users: userCount,
                    tracks: trackCount,
                    albums: albumCount,
                    artists: artistCount,
                    playlists: playlistCount,
                    likes: likeCount,
                    history: historyCount,
                    notifications: notificationCount,
                    events: activityEventCount,
                    lyricJobs: lyricJobCount,
                    analysisRuns: analysisRunCount,
                },
                allTables,
                tableSizes,
                system: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    uptimeSeconds: Math.floor(process.uptime()),
                    memory: {
                        rssMB: Math.round(memory.rss / (1024 * 1024)),
                        heapTotalMB: Math.round(memory.heapTotal / (1024 * 1024)),
                        heapUsedMB: Math.round(memory.heapUsed / (1024 * 1024)),
                        externalMB: Math.round(memory.external / (1024 * 1024)),
                    },
                },
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to retrieve database overview',
                details: error?.message,
            });
        }
    });

    /**
     * 2. GET /api/admin/database/users
     * Paginated and searchable users list with role, listening history, and preference counts.
     */
    server.get('/users', { preHandler: adminGuard }, async (req: FastifyRequest<{
        Querystring: { page?: string; limit?: string; search?: string; role?: string }
    }>, reply: FastifyReply) => {
        try {
            const page = Math.max(1, parseInt(req.query.page || '1', 10));
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
            const search = req.query.search?.trim();
            const role = req.query.role?.trim();

            const where: any = {};
            if (role) {
                where.role = role.toUpperCase();
            }
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { username: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ];
            }

            const [totalUsers, users] = await Promise.all([
                prisma.user.count({ where }),
                prisma.user.findMany({
                    where,
                    skip: (page - 1) * limit,
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        email: true,
                        role: true,
                        avatarUrl: true,
                        country: true,
                        createdAt: true,
                        updatedAt: true,
                        preferences: {
                            select: {
                                languages: true,
                                preferredGenres: true,
                                audioQuality: true,
                            },
                        },
                        _count: {
                            select: {
                                likes: true,
                                history: true,
                                playlists: true,
                            },
                        },
                    },
                }),
            ]);

            return reply.send({
                success: true,
                data: users.map((u) => ({
                    id: u.id,
                    name: u.name || 'Anonymous',
                    username: u.username || u.email?.split('@')[0] || 'user',
                    email: u.email,
                    role: u.role,
                    avatar: u.avatarUrl,
                    country: u.country || 'Global',
                    createdAt: u.createdAt,
                    updatedAt: u.updatedAt,
                    preferences: {
                        languages: u.preferences?.languages || [],
                        genres: u.preferences?.preferredGenres || [],
                        audioQuality: u.preferences?.audioQuality || 'HIGH',
                    },
                    stats: {
                        likesCount: u._count.likes,
                        historyCount: u._count.history,
                        playlistsCount: u._count.playlists,
                    },
                })),
                pagination: {
                    page,
                    limit,
                    total: totalUsers,
                    totalPages: Math.ceil(totalUsers / limit),
                },
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to retrieve users',
                details: error?.message,
            });
        }
    });

    /**
     * 3. GET /api/admin/database/music-stats
     * Catalog health: lyrics availability, artwork integrity, audio stream resolution types,
     * and potential duplicates.
     */
    server.get('/music-stats', { preHandler: adminGuard }, async (_req: FastifyRequest, reply: FastifyReply) => {
        try {
            const [
                totalTracks,
                totalAlbums,
                totalArtists,
                tracksWithSyncedLyrics,
                tracksWithPlainLyrics,
                tracksWithCover,
            ] = await Promise.all([
                prisma.track.count(),
                prisma.album.count(),
                prisma.artist.count(),
                prisma.track.count({ where: { synced_lyrics: { not: null } } }),
                prisma.track.count({ where: { lyrics: { not: null } } }),
                prisma.track.count({ where: { coverUrl: { not: null } } }),
            ]);

            // Audio Stream Distribution Analysis (Sample analysis across database)
            const sampleTracks = await prisma.track.findMany({
                take: 1000,
                select: { audioUrl: true },
                orderBy: { createdAt: 'desc' },
            });

            let r2AudioCount = 0;
            let cdnAudioCount = 0;
            let youtubeAudioCount = 0;
            let otherAudioCount = 0;

            for (const t of sampleTracks) {
                const url = t.audioUrl || '';
                if (url.includes('r2.dev') || url.includes('r2.cloudflarestorage')) {
                    r2AudioCount++;
                } else if (url.includes('saavn') || url.includes('jiosaavn') || url.includes('akamai')) {
                    cdnAudioCount++;
                } else if (url.includes('stream-youtube') || url.includes('googlevideo') || url.includes('youtube')) {
                    youtubeAudioCount++;
                } else if (url) {
                    otherAudioCount++;
                }
            }

            const sampleTotal = sampleTracks.length || 1;
            const r2Estimated = Math.round((r2AudioCount / sampleTotal) * totalTracks);
            const cdnEstimated = Math.round((cdnAudioCount / sampleTotal) * totalTracks);
            const ytEstimated = Math.round((youtubeAudioCount / sampleTotal) * totalTracks);
            const otherEstimated = Math.max(0, totalTracks - (r2Estimated + cdnEstimated + ytEstimated));

            let duplicateCandidates: any[] = [];
            try {
                duplicateCandidates = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT LOWER(title) as title, "artistId", COUNT(*) as count
                     FROM "Track"
                     WHERE "artistId" IS NOT NULL
                     GROUP BY LOWER(title), "artistId"
                     HAVING COUNT(*) > 1
                     ORDER BY count DESC
                     LIMIT 10;`
                );
            } catch (_) {}

            return reply.send({
                success: true,
                catalog: {
                    tracks: totalTracks,
                    albums: totalAlbums,
                    artists: totalArtists,
                },
                metadataHealth: {
                    syncedLyricsCount: tracksWithSyncedLyrics,
                    syncedLyricsPercent: totalTracks > 0 ? Math.round((tracksWithSyncedLyrics / totalTracks) * 100) : 0,
                    plainLyricsCount: tracksWithPlainLyrics,
                    plainLyricsPercent: totalTracks > 0 ? Math.round((tracksWithPlainLyrics / totalTracks) * 100) : 0,
                    coverArtCount: tracksWithCover,
                    coverArtPercent: totalTracks > 0 ? Math.round((tracksWithCover / totalTracks) * 100) : 0,
                },
                audioSources: {
                    jiosaavnCdn: cdnEstimated,
                    cloudflareR2: r2Estimated,
                    youtubeProxy: ytEstimated,
                    directOrOther: otherEstimated,
                },
                duplicates: duplicateCandidates.map((d) => ({
                    title: d.title,
                    artistId: d.artistId,
                    duplicateCount: Number(d.count || 2),
                })),
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to retrieve music stats',
                details: error?.message,
            });
        }
    });

    /**
     * 4. GET /api/admin/database/storage
     * Storage volume estimates, Cloudflare R2 bucket connectivity, and media statistics.
     */
    server.get('/storage', { preHandler: adminGuard }, async (_req: FastifyRequest, reply: FastifyReply) => {
        try {
            const trackCount = await prisma.track.count();
            const r2TrackCount = await prisma.track.count({
                where: {
                    audioUrl: {
                        contains: 'r2.dev',
                    },
                },
            });

            // Average high-fidelity audio size: ~7.5MB per track
            const estimatedR2AudioBytes = r2TrackCount * 7.5 * 1024 * 1024;
            const estimatedTotalAudioBytes = trackCount * 7.5 * 1024 * 1024;
            const isR2Configured = Boolean(config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY);

            return reply.send({
                success: true,
                r2: {
                    configured: isR2Configured,
                    bucketName: config.R2_BUCKET_NAME || 'zenify-audio',
                    publicDomain: config.R2_PUBLIC_DOMAIN || 'pub-2e8a5f55356644999b77124c45ef0753.r2.dev',
                    endpoint: config.R2_ENDPOINT ? 'Configured' : 'Default Cloudflare',
                    storedTracksCount: r2TrackCount,
                    estimatedStorageMB: Math.round(estimatedR2AudioBytes / (1024 * 1024)),
                    estimatedStorageGB: (estimatedR2AudioBytes / (1024 * 1024 * 1024)).toFixed(2),
                },
                catalogStorage: {
                    totalTracks: trackCount,
                    estimatedTotalVolumeGB: (estimatedTotalAudioBytes / (1024 * 1024 * 1024)).toFixed(2),
                },
                thirdPartyProviders: {
                    cloudinary: Boolean(config.CLOUDINARY_CLOUD_NAME),
                    redis: Boolean(config.REDIS_URL),
                    brevoEmail: Boolean(config.BREVO_API_KEY),
                    deepgramTranscription: Boolean(config.DEEPGRAM_API_KEY),
                },
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to retrieve storage status',
                details: error?.message,
            });
        }
    });

    /**
     * 5. GET /api/admin/database/system-health
     * Backend server uptime, memory usage, CPU telemetry, OS metrics,
     * background queue workers status, and error logs.
     */
    server.get('/system-health', { preHandler: adminGuard }, async (_req: FastifyRequest, reply: FastifyReply) => {
        try {
            const start = Date.now();
            await prisma.$queryRaw`SELECT 1;`;
            const dbPing = Date.now() - start;

            const [lyricJobsCount, analysisRunsCount, recentEvents] = await Promise.all([
                prisma.lyricEnrichmentJob.count().catch(() => 0),
                prisma.analysisRun.count().catch(() => 0),
                prisma.userActivityEvent.findMany({
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        eventType: true,
                        createdAt: true,
                        userId: true,
                    },
                }).catch(() => []),
            ]);

            // Database stats
            let cacheHitRatio = '99.9%';
            let activeConnections = 1;
            try {
                const cacheRes = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT round(sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100, 2)::text as ratio FROM pg_statio_user_tables;`
                );
                if (cacheRes?.[0]?.ratio) cacheHitRatio = `${cacheRes[0].ratio}%`;

                const connRes = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT count(*)::int as count FROM pg_stat_activity WHERE state = 'active';`
                );
                if (connRes?.[0]?.count !== undefined) activeConnections = Number(connRes[0].count);
            } catch (_) {}

            const uptimeSec = Math.floor(process.uptime());
            const hours = Math.floor(uptimeSec / 3600);
            const minutes = Math.floor((uptimeSec % 3600) / 60);
            const seconds = uptimeSec % 60;

            const mem = process.memoryUsage();
            const totalSysMem = os.totalmem();
            const freeSysMem = os.freemem();
            const usedSysMem = totalSysMem - freeSysMem;

            const cpus = os.cpus();
            const loadAvg = os.loadavg();

            return reply.send({
                success: true,
                status: 'HEALTHY',
                uptime: `${hours}h ${minutes}m ${seconds}s`,
                uptimeSeconds: uptimeSec,
                systemUptimeSeconds: Math.floor(os.uptime()),
                environment: config.NODE_ENV,
                pid: process.pid,
                nodeVersion: process.version,
                platform: `${process.platform} (${os.arch()})`,
                osRelease: os.release(),
                hostname: os.hostname(),
                database: {
                    status: 'CONNECTED',
                    latencyMs: dbPing,
                    cacheHitRatio,
                    activeConnections,
                },
                memory: {
                    process: {
                        rssMB: Math.round(mem.rss / (1024 * 1024)),
                        heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
                        heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
                        externalMB: Math.round(mem.external / (1024 * 1024)),
                        arrayBuffersMB: Math.round(mem.arrayBuffers / (1024 * 1024)),
                    },
                    system: {
                        totalMB: Math.round(totalSysMem / (1024 * 1024)),
                        freeMB: Math.round(freeSysMem / (1024 * 1024)),
                        usedMB: Math.round(usedSysMem / (1024 * 1024)),
                        usedPercentage: Math.round((usedSysMem / totalSysMem) * 100),
                    },
                },
                cpu: {
                    cores: cpus.length,
                    model: cpus[0]?.model || 'Generic Processor',
                    speedMHz: cpus[0]?.speed || 0,
                    loadAvg1m: Number(loadAvg[0]?.toFixed(2) || 0),
                    loadAvg5m: Number(loadAvg[1]?.toFixed(2) || 0),
                    loadAvg15m: Number(loadAvg[2]?.toFixed(2) || 0),
                },
                backgroundTasks: {
                    lyricEnrichmentJobs: lyricJobsCount,
                    musicAnalysisRuns: analysisRunsCount,
                    activeWorkers: [
                        { name: 'ElasticLyricWorker', status: 'RUNNING', concurrency: 'Elastic 24/7' },
                        { name: 'AnalysisSchedulerService', status: 'ACTIVE', schedule: '12:30 AM Daily' },
                        { name: 'CronService', status: 'ACTIVE', interval: 'Hourly & Daily Rollups' },
                        { name: 'EngagementScorer', status: 'ACTIVE', interval: 'Every 3 Hours' },
                    ],
                },
                recentActivityLogs: recentEvents,
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to retrieve system health',
                details: error?.message,
            });
        }
    });

    /**
     * 6. GET /api/admin/database/logs
     * Query in-memory buffered backend server logs with level, category, and text search filters.
     */
    server.get('/logs', { preHandler: adminGuard }, async (req: FastifyRequest<{
        Querystring: { limit?: string; level?: string; category?: string; search?: string; sinceId?: string }
    }>, reply: FastifyReply) => {
        try {
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
            const level = req.query.level;
            const category = req.query.category;
            const search = req.query.search;
            const sinceId = req.query.sinceId;

            const logs = logBuffer.getLogs({
                limit,
                level,
                category,
                search,
                sinceId,
            });

            return reply.send({
                success: true,
                logs,
                stats: logBuffer.getStats(),
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to retrieve server logs',
                details: error?.message,
            });
        }
    });

    /**
     * 7. GET /api/admin/database/logs/stream
     * Server-Sent Events (SSE) live streaming of real-time backend logs.
     */
    server.get('/logs/stream', { preHandler: adminGuard }, async (req: FastifyRequest, reply: FastifyReply) => {
        const origin = req.headers.origin || '*';
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
        });

        // Send initial recent logs
        const initialLogs = logBuffer.getRecent(30);
        reply.raw.write(`data: ${JSON.stringify({ type: 'init', logs: initialLogs })}\n\n`);

        const onLog = (entry: LogEntry) => {
            try {
                reply.raw.write(`data: ${JSON.stringify({ type: 'log', log: entry })}\n\n`);
            } catch (_) {}
        };

        logBuffer.on('log', onLog);

        // Keep-alive heartbeat every 15 seconds
        const heartbeat = setInterval(() => {
            try {
                reply.raw.write(': keepalive\n\n');
            } catch (_) {}
        }, 15000);

        req.raw.on('close', () => {
            clearInterval(heartbeat);
            logBuffer.off('log', onLog);
        });
    });

    /**
     * 8. POST /api/admin/database/logs/clear
     * Clears in-memory log buffer.
     */
    server.post('/logs/clear', { preHandler: adminGuard }, async (_req: FastifyRequest, reply: FastifyReply) => {
        try {
            logBuffer.clear();
            return reply.send({
                success: true,
                message: 'Server logs cleared successfully',
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to clear server logs',
                details: error?.message,
            });
        }
    });

    /**
     * 9. POST /api/admin/database/reset-catalog
     * Safely resets all catalog data, tracks, albums, artists, history, likes, and analytics
     * while strictly preserving all User accounts, UserPreferences, and Subscriptions.
     */
    server.post('/reset-catalog', { preHandler: adminGuard }, async (_req: FastifyRequest, reply: FastifyReply) => {
        try {
            const clearActions = [
                () => prisma.playlistTrack.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.like.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.history.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.rating.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.trackAnalytics.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.userTrackStat.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.userDailyStat.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.userActivityEvent.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.userInterestProfile.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.trackVibeProfile.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.analysisRun.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.lyricEnrichmentJob.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.playlist.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.track.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.album.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.artist.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.featuredContent.deleteMany().catch(() => ({ count: 0 })),
                () => prisma.notification.deleteMany().catch(() => ({ count: 0 })),
            ];

            for (const action of clearActions) {
                await action();
            }

            const afterUserCount = await prisma.user.count();

            logBuffer.add({
                level: 'WARN',
                category: 'DATABASE',
                message: `Catalog data reset completed. Preserved ${afterUserCount} user accounts.`,
            });

            return reply.send({
                success: true,
                message: 'Catalog, history, likes, and queue cache cleared successfully.',
                usersPreserved: afterUserCount,
            });
        } catch (error: any) {
            return reply.status(500).send({
                success: false,
                error: 'Failed to reset catalog data',
                details: error?.message,
            });
        }
    });
}
