import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env.js';
import { prisma } from '../utils/prisma.js';
import { RomanizationService } from '../services/romanization.service.js';

export interface RomanizationJobData {
    trackId: string;
    force?: boolean;
}

const REDIS_HOST_URL = config.REDIS_URL || 'redis://127.0.0.1:6379';

let redisConnection: IORedis | null = null;
let romanizationQueue: Queue<RomanizationJobData> | null = null;
let romanizationWorker: Worker<RomanizationJobData> | null = null;

// Worker execution task (shared between BullMQ and inline fallback)
export async function runRomanizationTask(data: RomanizationJobData) {
    const { trackId, force } = data;
    try {
        console.log(`[RomanizationWorker] Starting romanization task for track: ${trackId}`);
        const result = await RomanizationService.processTrack(trackId, force);
        if (result.success) {
            if (result.skipped) {
                console.log(`[RomanizationWorker] Track ${trackId} (${result.trackTitle || ''}) skipped: ${result.error || 'Already up to date'}`);
            } else {
                console.log(`[RomanizationWorker] Track ${trackId} (${result.trackTitle || ''}) successfully romanized (${result.lang})`);
            }
        } else {
            console.warn(`[RomanizationWorker] Track ${trackId} failed romanization: ${result.error}`);
        }
    } catch (err: any) {
        console.error(`[RomanizationWorker] Exception in romanization task for track ${trackId}:`, err.message || err);
    }
}

// Initialize BullMQ Queue and Worker if Redis is configured
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT_NAME;
const isLocalhostRedis = config.REDIS_URL ? (config.REDIS_URL.includes('127.0.0.1') || config.REDIS_URL.includes('localhost')) : true;
const shouldUseRedis = !!config.REDIS_URL && !(isProd && isLocalhostRedis);

if (shouldUseRedis) {
    try {
        redisConnection = new IORedis(config.REDIS_URL!, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: (times) => {
                if (times > 3) {
                    console.warn('[RomanizationQueue] Redis connection failed after retries. Disabling BullMQ (falling back to inline async tasks).');
                    redisConnection = null;
                    romanizationQueue = null;
                    romanizationWorker = null;
                    return null;
                }
                return Math.min(times * 100, 2000);
            }
        });

        redisConnection.on('error', () => {
            // Suppress logs if Redis is down
        });

        romanizationQueue = new Queue<RomanizationJobData>('lyrics-romanization', {
            connection: redisConnection as any,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                },
                removeOnComplete: 100,
                removeOnFail: 200
            }
        });
        romanizationQueue.on('error', () => {});

        romanizationWorker = new Worker<RomanizationJobData>(
            'lyrics-romanization',
            async (job: Job<RomanizationJobData>) => {
                await runRomanizationTask(job.data);
            },
            {
                connection: redisConnection as any,
                concurrency: 2, // Concurrency limit to prevent overwhelming AI APIs
                limiter: {
                    max: 20, // Rate limit: max 20 jobs per minute
                    duration: 60000
                }
            }
        );
        romanizationWorker.on('error', () => {});

        console.log('[RomanizationQueue] BullMQ Romanization Worker initialized successfully.');
    } catch (e: any) {
        console.warn('[RomanizationQueue] Initialization skipped. Falling back to inline async execution.');
    }
}

/**
 * Enqueue a track for romanization. Safe, non-blocking, and idempotent.
 */
export async function enqueueRomanization(data: RomanizationJobData): Promise<void> {
    if (romanizationQueue && redisConnection && redisConnection.status === 'ready') {
        console.log(`[RomanizationQueue] Enqueuing romanization for track: ${data.trackId}`);
        await romanizationQueue.add(`romanize-${data.trackId}`, data, {
            jobId: `romanize-${data.trackId}-${data.force ? Date.now() : 'idempotent'}`
        });
    } else {
        console.log(`[RomanizationQueue] Redis unavailable. Executing romanization in background promise.`);
        runRomanizationTask(data).catch(err => {
            console.error('[RomanizationQueue] Background execution failed:', err.message);
        });
    }
}

/**
 * Repeatable 15-minute sweep:
 * Scans database for tracks that contain non-Latin regional scripts and either:
 * 1) Have no romanization yet, OR
 * 2) sourceHash has changed or is missing.
 */
export async function runRomanizationSweep(): Promise<{ scanned: number; enqueued: number }> {
    console.log('[RomanizationSweep] Starting 15-minute romanization sweep...');
    try {
        const tracks = await prisma.track.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { lyrics: { not: null } },
                    { synced_lyrics: { not: null } }
                ]
            },
            select: {
                id: true,
                title: true,
                lyrics: true,
                synced_lyrics: true,
                romanizedLyrics: true,
                sourceHash: true
            }
        });

        let enqueuedCount = 0;

        for (const track of tracks) {
            const plainText = track.lyrics || '';
            const syncedTokens = Array.isArray(track.synced_lyrics) ? (track.synced_lyrics as any[]) : [];
            const combined = plainText + ' ' + syncedTokens.map(t => t.text || '').join(' ');

            // Check if track lyrics contain non-Latin characters
            if (!RomanizationService.containsNonLatin(combined)) {
                continue;
            }

            const currentHash = RomanizationService.computeSourceHash(plainText, track.synced_lyrics);

            // Needs romanization if:
            // 1) Never romanized, OR
            // 2) Source lyrics changed (hash mismatch), OR
            // 3) Romanized text still contains residual non-Latin characters
            const needsRomanization =
                !track.romanizedLyrics ||
                track.sourceHash !== currentHash ||
                RomanizationService.containsNonLatin(track.romanizedLyrics);

            if (needsRomanization) {
                console.log(`[RomanizationSweep] Enqueuing track "${track.title}" (${track.id}) for romanization.`);
                await enqueueRomanization({ trackId: track.id });
                enqueuedCount++;
            }
        }

        console.log(`[RomanizationSweep] Sweep finished. Scanned ${tracks.length} tracks, enqueued ${enqueuedCount}.`);
        return { scanned: tracks.length, enqueued: enqueuedCount };
    } catch (err: any) {
        console.error('[RomanizationSweep] Sweep error:', err.message || err);
        return { scanned: 0, enqueued: 0 };
    }
}
