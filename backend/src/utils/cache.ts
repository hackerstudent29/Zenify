import IORedis from 'ioredis';
import { config } from '../config/env';

const REDIS_HOST_URL = config.REDIS_URL || 'redis://127.0.0.1:6379';
let redisClient: IORedis | null = null;
const localMemoryCache = new Map<string, { data: any; expiresAt: number }>();

try {
  redisClient = new IORedis(REDIS_HOST_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 3) {
        console.warn('[Cache] Redis is down. Falling back to local in-memory caching.');
        redisClient = null;
        return null;
      }
      return Math.min(times * 100, 2000);
    }
  });

  redisClient.on('error', (err) => {
    // Suppress spam logs
  });

  console.log('[Cache] Redis Cache initialized.');
} catch (e: any) {
  console.warn('[Cache] Redis Cache failed to initialize. Falling back to local in-memory caching:', e.message);
}

/**
 * Fetches a parsed JSON value from cache.
 * @param key Unique key
 */
export async function getCacheVal(key: string): Promise<any | null> {
  if (redisClient && redisClient.status === 'ready') {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err: any) {
      console.warn(`[Cache] Redis get failed for ${key}:`, err.message);
    }
  }

  // Local Memory Fallback
  const entry = localMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    localMemoryCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Sets a value in cache.
 * @param key Unique key
 * @param data Payload to store
 * @param ttlSeconds TTL in seconds
 */
export async function setCacheVal(key: string, data: any, ttlSeconds: number): Promise<void> {
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.set(key, JSON.stringify(data), 'EX', ttlSeconds);
      return;
    } catch (err: any) {
      console.warn(`[Cache] Redis set failed for ${key}:`, err.message);
    }
  }

  // Local Memory Fallback
  localMemoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
}

/**
 * Invalidates a key in cache.
 * @param key Unique key to clear
 */
export async function invalidateCache(key: string): Promise<void> {
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.del(key);
      return;
    } catch (err: any) {
      console.warn(`[Cache] Redis del failed for ${key}:`, err.message);
    }
  }

  // Local Memory Fallback
  localMemoryCache.delete(key);
}
