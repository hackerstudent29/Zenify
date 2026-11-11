import Redis from 'ioredis';

interface MemoryEntry {
  value: string;
  expiresAtMs: number;
}

/**
 * Room-focused store backed by Redis when `REDIS_URL` is configured, with
 * deterministic in-memory fallback and per-room in-process async mutex locks.
 */
class RoomStore {
  private redis: Redis | null = null;
  private redisReady = false;
  private memory = new Map<string, MemoryEntry>();
  private roomLocks = new Map<string, Promise<void>>();
  private presenceHeartbeat = new Map<string, Map<string, { lastSeenMs: number; isPlaying: boolean; bufferReady: boolean; offsetMs: number }>>();
  private rateBuckets = new Map<string, { count: number; resetAtMs: number }>();

  constructor() {
    const url = process.env.REDIS_URL;
    if (url && !process.env.DISABLE_REDIS) {
      try {
        this.redis = new Redis(url, {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          retryStrategy: (times) => (times > 3 ? null : Math.min(times * 250, 2000)),
        });
        this.redis.on('ready', () => {
          this.redisReady = true;
        });
        this.redis.on('error', () => {
          this.redisReady = false;
        });
        this.redis.connect().catch(() => {
          this.redisReady = false;
        });
      } catch {
        this.redis = null;
      }
    }
  }

  public isRedisConnected(): boolean {
    return this.redisReady && this.redis !== null;
  }

  public async withRoomLock<T>(roomCode: string, fn: () => Promise<T>): Promise<T> {
    const code = roomCode.toUpperCase();
    const prev = this.roomLocks.get(code) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((res) => {
      release = res;
    });
    const queued = prev.then(() => next);
    this.roomLocks.set(code, queued);
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.roomLocks.get(code) === queued) {
        this.roomLocks.delete(code);
      }
    }
  }

  public async getJson<T>(key: string): Promise<T | null> {
    if (this.redisReady && this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw) return JSON.parse(raw) as T;
      } catch {
        // Fallback below
      }
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAtMs) {
      this.memory.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }

  public async setJson(key: string, value: any, ttlSeconds: number): Promise<void> {
    const serialized = JSON.stringify(value);
    this.memory.set(key, {
      value: serialized,
      expiresAtMs: Date.now() + ttlSeconds * 1000,
    });
    if (this.redisReady && this.redis) {
      try {
        await this.redis.set(key, serialized, 'EX', Math.max(1, Math.floor(ttlSeconds)));
      } catch {
        // Memory cache already set
      }
    }
  }

  public async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.redisReady && this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // ignore
      }
    }
  }

  public async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (this.redisReady && this.redis) {
      try {
        const val = await this.redis.incr(key);
        if (val === 1) {
          await this.redis.expire(key, Math.max(1, ttlSeconds));
        }
        return val;
      } catch {
        // fall back
      }
    }
    const existing = this.memory.get(key);
    const now = Date.now();
    if (!existing || now > existing.expiresAtMs) {
      this.memory.set(key, { value: '1', expiresAtMs: now + ttlSeconds * 1000 });
      return 1;
    }
    const next = (parseInt(existing.value, 10) || 0) + 1;
    existing.value = String(next);
    return next;
  }

  /**
   * Sliding-window rate limiter per key (`true` = allowed, `false` = limited).
   */
  public checkRateLimit(bucketKey: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.rateBuckets.get(bucketKey);
    if (!entry || now >= entry.resetAtMs) {
      this.rateBuckets.set(bucketKey, { count: 1, resetAtMs: now + windowMs });
      return true;
    }
    if (entry.count >= limit) {
      return false;
    }
    entry.count++;
    return true;
  }

  /**
   * Presence heartbeat stored in memory + Redis key when connected.
   */
  public updatePresence(
    roomCode: string,
    userId: string,
    patch: Partial<{ lastSeenMs: number; isPlaying: boolean; bufferReady: boolean; offsetMs: number }>
  ): void {
    const code = roomCode.toUpperCase();
    let roomMap = this.presenceHeartbeat.get(code);
    if (!roomMap) {
      roomMap = new Map();
      this.presenceHeartbeat.set(code, roomMap);
    }
    const current = roomMap.get(userId) ?? {
      lastSeenMs: Date.now(),
      isPlaying: false,
      bufferReady: true,
      offsetMs: 0,
    };
    const updated = {
      ...current,
      ...patch,
      lastSeenMs: patch.lastSeenMs ?? Date.now(),
    };
    roomMap.set(userId, updated);
    if (this.redisReady && this.redis) {
      this.redis
        .set(`room:presence:${code}:${userId}`, JSON.stringify(updated), 'EX', 45)
        .catch(() => undefined);
    }
  }

  public removePresence(roomCode: string, userId: string): void {
    const code = roomCode.toUpperCase();
    this.presenceHeartbeat.get(code)?.delete(userId);
    if (this.redisReady && this.redis) {
      this.redis.del(`room:presence:${code}:${userId}`).catch(() => undefined);
    }
  }

  public clearRoomPresence(roomCode: string): void {
    this.presenceHeartbeat.delete(roomCode.toUpperCase());
  }

  public getPresence(roomCode: string, userId: string) {
    return this.presenceHeartbeat.get(roomCode.toUpperCase())?.get(userId) ?? null;
  }

  public getRoomPresenceMap(roomCode: string) {
    return this.presenceHeartbeat.get(roomCode.toUpperCase()) ?? new Map();
  }

  public purgeExpiredMemoryEntries(): void {
    const now = Date.now();
    for (const [k, v] of this.memory.entries()) {
      if (now > v.expiresAtMs) this.memory.delete(k);
    }
    for (const [k, v] of this.rateBuckets.entries()) {
      if (now > v.resetAtMs) this.rateBuckets.delete(k);
    }
  }
}

export const roomStore = new RoomStore();

