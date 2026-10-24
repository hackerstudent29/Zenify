import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env';

export interface HomeShelvesJobData {
  userId: string;
  isHighPriority?: boolean;
}

const REDIS_HOST_URL = config.REDIS_URL;
let redisConnection: IORedis | null = null;
let homeShelvesQueue: Queue<HomeShelvesJobData> | null = null;

const isProd = process.env.NODE_ENV === 'production' || !!process.env.HEROKU_APP_ID || !!process.env.RAILWAY_ENVIRONMENT_NAME;
const isLocalhostRedis = REDIS_HOST_URL ? (REDIS_HOST_URL.includes('127.0.0.1') || REDIS_HOST_URL.includes('localhost')) : true;
const shouldUseRedis = !!REDIS_HOST_URL && !(isProd && isLocalhostRedis);

if (shouldUseRedis) {
  try {
    redisConnection = new IORedis(REDIS_HOST_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 3) {
          redisConnection = null;
          return null;
        }
        return Math.min(times * 100, 2000);
      }
    });

    redisConnection.on('error', () => {
      // Suppress connection errors
    });

    homeShelvesQueue = new Queue<HomeShelvesJobData>('home-shelves', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 }
      }
    });

    console.log('[HomeShelvesQueue] BullMQ "home-shelves" queue initialized.');
  } catch (err: any) {
    console.warn('[HomeShelvesQueue] Failed to initialize BullMQ. Falling back to inline tasks:', err.message);
  }
}

// In-memory debouncer: max 1 build per user per 30 minutes (1800s)
const lastUserBuildTimes = new Map<string, number>();

export async function enqueueHomeShelvesBuild(userId: string, isHighPriority = false): Promise<void> {
  if (!userId) return;

  const now = Date.now();
  const lastBuild = lastUserBuildTimes.get(userId) || 0;
  const thirtyMinMs = 30 * 60 * 1000;

  // Debounce check: if not high priority and was built in the last 30 minutes, skip
  if (!isHighPriority && now - lastBuild < thirtyMinMs) {
    return;
  }

  lastUserBuildTimes.set(userId, now);

  if (homeShelvesQueue && redisConnection && redisConnection.status === 'ready') {
    try {
      await homeShelvesQueue.add(
        `build-shelves-${userId}`,
        { userId, isHighPriority },
        { priority: isHighPriority ? 1 : 10 }
      );
      return;
    } catch (err: any) {
      console.warn('[HomeShelvesQueue] Failed to add BullMQ job, running inline:', err.message);
    }
  }

  // Detached inline task if Redis queue is unavailable
  import('./home-shelves.worker.js').then(({ buildUserShelves }) => {
    buildUserShelves(userId).catch(err => {
      console.warn(`[HomeShelvesWorker] Inline build failed for ${userId}:`, err.message);
    });
  }).catch(() => {});
}
