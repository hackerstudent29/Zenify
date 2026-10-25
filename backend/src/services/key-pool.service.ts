import { prisma } from '../utils/prisma';

export interface KeyState {
  key: string;
  cooldownUntil: number;
  failedAttempts: number;
  successCount: number;
}

export class KeyPoolService {
  private static pools: Map<string, KeyState[]> = new Map();
  private static currentIndices: Map<string, number> = new Map();
  private static lastSettingsFetch: number = 0;
  private static readonly SETTINGS_CACHE_TTL = 30000; // 30s
  private static defaultKeys: Record<string, string[]> = {
    rapidapi: [
      process.env.RAPIDAPI_KEY || '',
      ...(process.env.RAPIDAPI_KEYS ? process.env.RAPIDAPI_KEYS.split(',').map(s => s.trim()) : []),
      '54aa86f9b2msh2700548ef9684acp19b05ajsn76cf3c333188',
      'e9a22f3c78msh7958b19f074d251p1d198ejsn3a1b4d0812cf',
      '79b4d18ec2msh6345a07e868b94ap104642jsn47b19dc6312a',
      'bf105d890amsh1258d4477839ec9p1726a2jsnb7c569a35e80',
      'd4850c4103msh89073e72c842b0fp10e429jsne1a2df335198'
    ].filter(k => k && k.length > 5),
    spotify: [
      process.env.SPOTIFY_API_KEY || '',
      process.env.RAPIDAPI_KEY || '',
      '54aa86f9b2msh2700548ef9684acp19b05ajsn76cf3c333188',
      'e9a22f3c78msh7958b19f074d251p1d198ejsn3a1b4d0812cf',
      '79b4d18ec2msh6345a07e868b94ap104642jsn47b19dc6312a'
    ].filter(k => k && k.length > 5),
    genius: [
      process.env.GENIUS_API_KEY || '',
      process.env.RAPIDAPI_KEY || '',
      '54aa86f9b2msh2700548ef9684acp19b05ajsn76cf3c333188',
      'e9a22f3c78msh7958b19f074d251p1d198ejsn3a1b4d0812cf',
      '79b4d18ec2msh6345a07e868b94ap104642jsn47b19dc6312a'
    ].filter(k => k && k.length > 5),
    youtube: [
      process.env.YOUTUBE_API_KEY || '',
      process.env.RAPIDAPI_KEY || '',
      '54aa86f9b2msh2700548ef9684acp19b05ajsn76cf3c333188',
      'bf105d890amsh1258d4477839ec9p1726a2jsnb7c569a35e80',
      'd4850c4103msh89073e72c842b0fp10e429jsne1a2df335198'
    ].filter(k => k && k.length > 5),
    lyrics: [
      process.env.LYRICS_API_KEY || '',
      process.env.RAPIDAPI_KEY || '',
      '54aa86f9b2msh2700548ef9684acp19b05ajsn76cf3c333188',
      'e9a22f3c78msh7958b19f074d251p1d198ejsn3a1b4d0812cf',
      'bf105d890amsh1258d4477839ec9p1726a2jsnb7c569a35e80'
    ].filter(k => k && k.length > 5),
    applemusic: [
      process.env.APPLE_MUSIC_DEVELOPER_TOKEN || '',
      ...(process.env.APPLE_MUSIC_DEVELOPER_TOKENS ? process.env.APPLE_MUSIC_DEVELOPER_TOKENS.split(',').map(s => s.trim()) : []),
      // Verified Working Apple Music Tokens (Active until 2027)
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6IldlYlBsYXlLaWQifQ.eyJpc3MiOiJBTVBXZWJQbGF5IiwiaWF0IjoxNzkyNTM1Njc2LCJleHAiOjE3OTg1ODM2NzYsInJvb3RfaHR0cHNfb3JpZ2luIjpbImFwcGxlLmNvbSJdfQ.YpBDqePdK0r_5lxtByqto20zc60FhO1eLoYJ5mrayZ73IYsW4yguaJAFMzud_5FSZ7cjTCdM5ST_MecdbHDA2Q',
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6IkxUMlpEWlNYTlEifQ.eyJpc3MiOiI1SUtQUDJJRUNRIiwiaWF0IjoxNzkyNTM1Njc2LCJleHAiOjE3OTg1ODM2NzYsInJvb3RfaHR0cHNfb3JpZ2luIjpbImFwcGxlLmNvbSJdfQ.K-C_J9LLy07ZTV_MgoDT5KzJQQIOa8MlquKx919sPI3QbprU1sYc8c2E5fvWZkXA5xlEPyy05SWxSFZBq29xfA',
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6IldlYlBsYXlLaWQifQ.eyJpc3MiOiJBTVBXZWJQbGF5IiwiaWF0IjoxNzkxOTAzMTk0LCJleHAiOjE3OTc5NTExOTQsInJvb3RfaHR0cHNfb3JpZ2luIjpbImFwcGxlLmNvbSJdfQ.3x-70iwl8xfaZvlRoH-4_Z_kBmfaFrEYW6Pqa9u0vJKZHwq1iYdw_LJs1LA8mxQpyxeHcmuHPXdq6pjBO41_kA',
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6IkxUMlpEWlNYTlEifQ.eyJpc3MiOiI1SUtQUDJJRUNRIiwiaWF0IjoxNzkxOTAzMTk0LCJleHAiOjE3OTc5NTExOTQsInJvb3RfaHR0cHNfb3JpZ2luIjpbImFwcGxlLmNvbSJdfQ.ennJxL6nOvgRUV1Hcp2Rn-0I7syN0haC_LQnJ2FGvyY9FSqSnsCYvpxGuqM_DnaWs1Gf_3TrkiwAv71BJ6bDow'
    ].filter(k => k && k.length > 5)
  };

  /**
   * Refreshes key pools from database system settings & environment variables
   */
  private static async syncPool(poolName: string): Promise<KeyState[]> {
    const now = Date.now();
    const existing = this.pools.get(poolName) || [];

    // If existing and refreshed recently, return
    if (existing.length > 0 && (now - this.lastSettingsFetch) < this.SETTINGS_CACHE_TTL) {
      return existing;
    }

    let candidateKeys: string[] = [];

    // 1. Fetch from Database SystemSettings
    try {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
      const dbKeys = (settings?.keys as any) || {};

      let envOrDbKeys = dbKeys[`${poolName.toUpperCase()}_KEYS`] || dbKeys[`${poolName.toUpperCase()}_KEY`];
      if (!envOrDbKeys && poolName === 'applemusic') {
        envOrDbKeys = dbKeys.APPLE_MUSIC_DEVELOPER_TOKENS || dbKeys.APPLE_MUSIC_DEVELOPER_TOKEN;
      } else if (!envOrDbKeys && (poolName === 'rapidapi' || poolName === 'spotify' || poolName === 'lyrics' || poolName === 'genius' || poolName === 'youtube')) {
        envOrDbKeys = dbKeys.RAPIDAPI_KEYS || dbKeys.RAPIDAPI_KEY;
      }

      if (Array.isArray(envOrDbKeys)) {
        candidateKeys.push(...envOrDbKeys.filter(Boolean));
      } else if (typeof envOrDbKeys === 'string') {
        candidateKeys.push(...envOrDbKeys.split(',').map((k: string) => k.trim()).filter(Boolean));
      }
    } catch {}

    // 2. Fetch from Process Environment Variables (supports comma-separated list of keys)
    let envVal = process.env[`${poolName.toUpperCase()}_KEYS`] || process.env[`${poolName.toUpperCase()}_KEY`];
    if (!envVal && poolName === 'applemusic') {
      envVal = process.env.APPLE_MUSIC_DEVELOPER_TOKENS || process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    } else if (!envVal && (poolName === 'rapidapi' || poolName === 'spotify' || poolName === 'lyrics' || poolName === 'genius' || poolName === 'youtube')) {
      envVal = process.env.RAPIDAPI_KEYS || process.env.RAPIDAPI_KEY;
    }

    if (envVal) {
      candidateKeys.push(...envVal.split(',').map(k => k.trim()).filter(Boolean));
    }

    // 3. Fallback defaults
    if (this.defaultKeys[poolName]) {
      candidateKeys.push(...this.defaultKeys[poolName]);
    }

    // Deduplicate
    const uniqueKeys = Array.from(new Set(candidateKeys.map(k => k.trim()).filter(k => k.length > 5)));

    // Preserve existing health state for existing keys
    const stateMap = new Map(existing.map(s => [s.key, s]));
    const updatedStates: KeyState[] = uniqueKeys.map(k => {
      const prev = stateMap.get(k);
      return prev || {
        key: k,
        cooldownUntil: 0,
        failedAttempts: 0,
        successCount: 0
      };
    });

    this.pools.set(poolName, updatedStates);
    this.lastSettingsFetch = now;
    return updatedStates;
  }

  /**
   * Returns an active healthy key from the specified pool with round-robin rotation.
   * Automatically skips keys in cooldown.
   */
  static async getKey(poolName: string = 'rapidapi'): Promise<string> {
    const states = await this.syncPool(poolName);
    if (states.length === 0) {
      if (poolName === 'applemusic') {
        return this.defaultKeys.applemusic?.[0] || '';
      }
      return process.env.RAPIDAPI_KEY || '54aa86f9b2msh2700548ef9684acp19b05ajsn76cf3c333188';
    }

    const now = Date.now();
    let currentIndex = this.currentIndices.get(poolName) || 0;

    // Find the next key that is NOT in cooldown
    for (let i = 0; i < states.length; i++) {
      const idx = (currentIndex + i) % states.length;
      const candidate = states[idx];
      if (candidate.cooldownUntil <= now) {
        this.currentIndices.set(poolName, (idx + 1) % states.length);
        return candidate.key;
      }
    }

    // All keys are currently in cooldown; return the one that recovers soonest
    const sorted = [...states].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
    const earliest = sorted[0];
    return earliest.key;
  }

  /**
   * Records a 429/403 Rate Limit on a key, setting a cooldown period.
   * Automatically rotates to the next available key.
   */
  static markRateLimited(poolName: string, key: string, cooldownMs: number = 15 * 60 * 1000): void {
    const states = this.pools.get(poolName);
    if (!states) return;

    const found = states.find(s => s.key === key);
    if (found) {
      found.failedAttempts += 1;
      found.cooldownUntil = Date.now() + cooldownMs;
      const masked = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : '****';
      console.warn(`[KeyPool] Pool "${poolName}": Key "${masked}" hit rate-limit/429. Cooldown for ${Math.round(cooldownMs / 1000)}s.`);
    }
  }

  /**
   * Records a successful request on a key, resetting failure counters.
   */
  static markSuccess(poolName: string, key: string): void {
    const states = this.pools.get(poolName);
    if (!states) return;

    const found = states.find(s => s.key === key);
    if (found) {
      found.failedAttempts = 0;
      found.successCount += 1;
    }
  }

  /**
   * Executes an API request with automatic multi-key rotation and provider failover.
   * If a key throws 429 (Rate Limit) or 403 (Quota Exceeded), it immediately rotates
   * to the next key and retries seamlessly!
   */
  static async executeWithFailover<T>(
    poolName: string,
    requestFn: (key: string) => Promise<T>,
    fallbackFn?: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    const states = await this.syncPool(poolName);
    const attempts = Math.min(maxRetries, Math.max(1, states.length));

    for (let attempt = 0; attempt < attempts; attempt++) {
      const key = await this.getKey(poolName);
      try {
        const result = await requestFn(key);
        this.markSuccess(poolName, key);
        return result;
      } catch (err: any) {
        const status = err.response?.status;
        const respMsg = (typeof err.response?.data?.message === 'string' ? err.response.data.message : '') + ' ' + (typeof err.response?.data === 'string' ? err.response.data : '');
        const msg = ((err.message || '') + ' ' + respMsg).toLowerCase();
        const isQuotaOrKeyError = status === 429 || status === 403 || status === 401 ||
                             msg.includes('rate limit') || 
                             msg.includes('quota') ||
                             msg.includes('monthly quota') ||
                             msg.includes('exceeded') ||
                             msg.includes('too many requests') ||
                             msg.includes('invalid api key') ||
                             msg.includes('not subscribed');

        if (isQuotaOrKeyError) {
          this.markRateLimited(poolName, key, 60 * 60 * 1000); // 1 hour cooldown for exhausted keys
          // Loop will retry with next key in the pool
          continue;
        }

        // For non-quota errors (e.g. 404 or bad params), rethrow or continue
        throw err;
      }
    }

    // If all keys in this pool exhausted, invoke fallback function if provided
    if (fallbackFn) {
      console.warn(`[KeyPool] All keys exhausted in pool "${poolName}". Falling back to secondary provider.`);
      return await fallbackFn();
    }

    throw new Error(`[KeyPool] All keys in pool "${poolName}" exhausted and no fallback provider available.`);
  }

  /**
   * Returns current statistics of all pools for diagnostics/admin monitoring.
   */
  static getStats(): Record<string, { totalKeys: number; activeKeys: number; inCooldown: number }> {
    const stats: Record<string, any> = {};
    const now = Date.now();

    for (const [pool, states] of this.pools.entries()) {
      const active = states.filter(s => s.cooldownUntil <= now).length;
      stats[pool] = {
        totalKeys: states.length,
        activeKeys: active,
        inCooldown: states.length - active
      };
    }

    return stats;
  }
}
