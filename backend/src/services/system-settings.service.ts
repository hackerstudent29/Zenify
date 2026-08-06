import prisma from '../lib/prisma.js';

export class SystemSettingsService {
    private static cache: any = null;
    private static lastFetched: number = 0;
    private static readonly CACHE_TTL = 30000; // 30 seconds

    static async getKeys(): Promise<any> {
        const now = Date.now();
        if (this.cache && (now - this.lastFetched) < this.CACHE_TTL) {
            return this.cache;
        }

        try {
            const settings = await prisma.systemSettings.findUnique({
                where: { id: 'global' }
            });
            this.cache = settings?.keys || {};
            this.lastFetched = now;
            return this.cache;
        } catch (err) {
            console.error('[SystemSettings] Failed to fetch settings', err);
            return {};
        }
    }

    static async getRapidApiKey(): Promise<string> {
        const keys = await this.getKeys();
        
        // If it's an array of keys (for rotation), pick a random one
        if (Array.isArray(keys.RAPIDAPI_KEYS) && keys.RAPIDAPI_KEYS.length > 0) {
            const idx = Math.floor(Math.random() * keys.RAPIDAPI_KEYS.length);
            return keys.RAPIDAPI_KEYS[idx];
        }
        
        // Fallback to single key or env var or hardcoded fallback
        return keys.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY || '44bd95eaa5mshf1ff2d3f2a80084p1ef41cjsne30367546df5';
    }

    static async getMusixmatchApiKey(): Promise<string> {
        const keys = await this.getKeys();
        return keys.MUSIXMATCH_API_KEY || process.env.MUSIXMATCH_API_KEY || '';
    }
}
