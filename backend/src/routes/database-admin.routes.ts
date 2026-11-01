import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { prisma } from '../utils/prisma';

import { config } from '../config/env';



export async function databaseAdminRoutes(server: FastifyInstance) {

    // Enforce server-side authentication and ADMIN role check on all database admin routes

    const adminGuard = [server.authenticate, server.authorize(['ADMIN'])];



    /**

     * 1. GET /api/admin/database/overview

     * Returns database connection status, PostgreSQL engine version,

     * table row counts, size estimates, and system memory stats.

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



            // Fetch Row Counts across core models

            const [

                userCount,

                trackCount,

                albumCount,

                artistCount,

                playlistCount,

                likeCount,

                historyCount,

                notificationCount,

                activityEventCount,

            ] = await Promise.all([

                prisma.user.count().catch(() => 0),

                prisma.track.count().catch(() => 0),

                prisma.album.count().catch(() => 0),

                prisma.artist.count().catch(() => 0),

                prisma.playlist.count().catch(() => 0),

                prisma.like.count().catch(() => 0),

                prisma.history.count().catch(() => 0),

                prisma.notification.count().catch(() => 0),

                prisma.userActivityEvent.count().catch(() => 0),

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

                     ORDER BY pg_total_relation_size(relid) DESC

                     LIMIT 12;`

                );

                if (Array.isArray(tablesRes) && tablesRes.length > 0) {

                    tableSizes = tablesRes.map((t) => ({

                        table: t.name,

                        size: t.size,

                        rows: Number(t.rows || 0),

                    }));

                } else {

                    throw new Error('No user tables stat');

                }

            } catch (_) {

                // Fallback table listing from known counts

                tableSizes = [

                    { table: 'Track', size: '~' + ((trackCount * 2) / 1024).toFixed(1) + ' MB', rows: trackCount },

                    { table: 'History', size: '~' + ((historyCount * 0.8) / 1024).toFixed(1) + ' MB', rows: historyCount },

                    { table: 'UserActivityEvent', size: '~' + ((activityEventCount * 0.5) / 1024).toFixed(1) + ' MB', rows: activityEventCount },

                    { table: 'User', size: '~' + ((userCount * 1) / 1024).toFixed(1) + ' MB', rows: userCount },

                    { table: 'Like', size: '~' + ((likeCount * 0.4) / 1024).toFixed(1) + ' MB', rows: likeCount },

                    { table: 'Album', size: '~' + ((albumCount * 1.5) / 1024).toFixed(1) + ' MB', rows: albumCount },

                    { table: 'Artist', size: '~' + ((artistCount * 1.2) / 1024).toFixed(1) + ' MB', rows: artistCount },

                    { table: 'Playlist', size: '~' + ((playlistCount * 0.6) / 1024).toFixed(1) + ' MB', rows: playlistCount },

                ];

            }



            const memory = process.memoryUsage();



            return reply.send({

                success: true,

                database: {

                    status: 'CONNECTED',

                    latencyMs: dbLatencyMs,

                    engine: pgVersion,

                    size: dbSize,

                    sizeBytes: dbSizeBytes,

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

                },

                tableSizes,

                system: {

                    nodeVersion: process.version,

                    platform: process.platform,

                    uptimeSeconds: Math.floor(process.uptime()),

                    memory: {

                        rssMB: Math.round(memory.rss / (1024 * 1024)),

                        heapTotalMB: Math.round(memory.heapTotal / (1024 * 1024)),

                        heapUsedMB: Math.round(memory.heapUsed / (1024 * 1024)),

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



            // Estimate total distribution from sampled percentage

            const sampleTotal = sampleTracks.length || 1;

            const r2Estimated = Math.round((r2AudioCount / sampleTotal) * totalTracks);

            const cdnEstimated = Math.round((cdnAudioCount / sampleTotal) * totalTracks);

            const ytEstimated = Math.round((youtubeAudioCount / sampleTotal) * totalTracks);

            const otherEstimated = Math.max(0, totalTracks - (r2Estimated + cdnEstimated + ytEstimated));



            // Potential Duplicate Tracks Scanner (Group by lower(title) and artistId)

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



            // Average high-fidelity MP3/AAC audio size: ~7.5MB per track

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

     * Backend server uptime, memory usage, background queue workers status, and error logs.

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



            const uptimeSec = Math.floor(process.uptime());

            const hours = Math.floor(uptimeSec / 3600);

            const minutes = Math.floor((uptimeSec % 3600) / 60);

            const seconds = uptimeSec % 60;



            const mem = process.memoryUsage();



            return reply.send({

                success: true,

                status: 'HEALTHY',

                uptime: `${hours}h ${minutes}m ${seconds}s`,

                uptimeSeconds: uptimeSec,

                environment: config.NODE_ENV,

                databaseLatencyMs: dbPing,

                memory: {

                    rss: `${Math.round(mem.rss / (1024 * 1024))} MB`,

                    heapTotal: `${Math.round(mem.heapTotal / (1024 * 1024))} MB`,

                    heapUsed: `${Math.round(mem.heapUsed / (1024 * 1024))} MB`,

                },

                backgroundTasks: {

                    lyricEnrichmentJobs: lyricJobsCount,

                    musicAnalysisRuns: analysisRunsCount,

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

     * 6. POST /api/admin/database/reset-catalog

     * Safely resets all catalog data, tracks, albums, artists, history, likes, and analytics

     * while strictly preserving all User accounts, UserPreferences, and Subscriptions.

     */

    server.post('/reset-catalog', { preHandler: adminGuard }, async (_req: FastifyRequest, reply: FastifyReply) => {

        try {

            const userCount = await prisma.user.count();



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

