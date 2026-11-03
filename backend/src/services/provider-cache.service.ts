import { prisma } from '../utils/prisma.js';

export class ProviderCacheService {
  /**
   * Retrieves a cached value from PostgreSQL provider_cache if not expired.
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const entry = await prisma.providerCache.findUnique({
        where: { key }
      });
      if (!entry) return null;

      if (new Date() > entry.expiresAt) {
        // Expired entry - clean up lazily in background
        prisma.providerCache.delete({ where: { key } }).catch(() => {});
        return null;
      }

      return entry.data as T;
    } catch (err: any) {
      console.warn(`[ProviderCache] Read error for key "${key}":`, err.message);
      return null;
    }
  }

  /**
   * Stores a value in PostgreSQL provider_cache with an absolute expiration TTL.
   */
  static async set(key: string, data: any, ttlSeconds: number, provider = 'jiosaavn'): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + Math.max(ttlSeconds, 60) * 1000);
      await prisma.providerCache.upsert({
        where: { key },
        update: {
          data: data as any,
          expiresAt,
          provider
        },
        create: {
          key,
          data: data as any,
          expiresAt,
          provider
        }
      });
    } catch (err: any) {
      console.warn(`[ProviderCache] Write error for key "${key}":`, err.message);
    }
  }

  /**
   * Invalidates a specific cache key or prefix
   */
  static async invalidate(key: string): Promise<void> {
    try {
      await prisma.providerCache.delete({ where: { key } }).catch(() => {});
    } catch {}
  }
}

