import { prisma } from '../utils/prisma';

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

    static async getGeniusApiKey(): Promise<string> {
        const keys = await this.getKeys();
        if (Array.isArray(keys.GENIUS_API_KEYS) && keys.GENIUS_API_KEYS.length > 0) {
            const idx = Math.floor(Math.random() * keys.GENIUS_API_KEYS.length);
            return keys.GENIUS_API_KEYS[idx];
        }
        return keys.GENIUS_API_KEY || process.env.GENIUS_API_KEY || await this.getRapidApiKey();
    }

    static async getSpotifyApiKey(): Promise<string> {
        const keys = await this.getKeys();
        if (Array.isArray(keys.SPOTIFY_API_KEYS) && keys.SPOTIFY_API_KEYS.length > 0) {
            const idx = Math.floor(Math.random() * keys.SPOTIFY_API_KEYS.length);
            return keys.SPOTIFY_API_KEYS[idx];
        }
        return keys.SPOTIFY_API_KEY || process.env.SPOTIFY_API_KEY || await this.getRapidApiKey();
    }

    static async getSoundcloudApiKey(): Promise<string> {
        const keys = await this.getKeys();
        if (Array.isArray(keys.SOUNDCLOUD_API_KEYS) && keys.SOUNDCLOUD_API_KEYS.length > 0) {
            const idx = Math.floor(Math.random() * keys.SOUNDCLOUD_API_KEYS.length);
            return keys.SOUNDCLOUD_API_KEYS[idx];
        }
        return keys.SOUNDCLOUD_API_KEY || process.env.SOUNDCLOUD_API_KEY || await this.getRapidApiKey();
    }

    static async getYoutubeApiKey(): Promise<string> {
        const keys = await this.getKeys();
        if (Array.isArray(keys.YOUTUBE_API_KEYS) && keys.YOUTUBE_API_KEYS.length > 0) {
            const idx = Math.floor(Math.random() * keys.YOUTUBE_API_KEYS.length);
            return keys.YOUTUBE_API_KEYS[idx];
        }
        return keys.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || await this.getRapidApiKey();
    }

    static async getMusixmatchApiKey(): Promise<string> {
        const keys = await this.getKeys();
        return keys.MUSIXMATCH_API_KEY || process.env.MUSIXMATCH_API_KEY || '';
    }
}
