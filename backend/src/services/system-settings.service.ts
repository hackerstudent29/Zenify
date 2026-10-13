import { prisma } from '../utils/prisma';
import { KeyPoolService } from './key-pool.service';

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
        return KeyPoolService.getKey('rapidapi');
    }

    static async getGeniusApiKey(): Promise<string> {
        return KeyPoolService.getKey('genius');
    }

    static async getSpotifyApiKey(): Promise<string> {
        return KeyPoolService.getKey('spotify');
    }

    static async getSoundcloudApiKey(): Promise<string> {
        return KeyPoolService.getKey('soundcloud');
    }

    static async getYoutubeApiKey(): Promise<string> {
        return KeyPoolService.getKey('youtube');
    }

    static async getLyricsApiKey(): Promise<string> {
        return KeyPoolService.getKey('lyrics');
    }

    static async getMusixmatchApiKey(): Promise<string> {
        const keys = await this.getKeys();
        return keys.MUSIXMATCH_API_KEY || process.env.MUSIXMATCH_API_KEY || '';
    }

    static async getSpotifyCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
        const keys = await this.getKeys();
        const clientId = keys.SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || '';
        const clientSecret = keys.SPOTIFY_CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET || '';
        if (clientId && clientSecret) {
            return { clientId, clientSecret };
        }
        return null;
    }

    static async getAppleMusicCredentials(): Promise<{ developerToken?: string; keyId?: string; teamId?: string; privateKey?: string } | null> {
        const keys = await this.getKeys();
        const developerToken = keys.APPLE_MUSIC_DEVELOPER_TOKEN || process.env.APPLE_MUSIC_DEVELOPER_TOKEN || '';
        const keyId = keys.APPLE_MUSIC_KEY_ID || process.env.APPLE_MUSIC_KEY_ID || '';
        const teamId = keys.APPLE_MUSIC_TEAM_ID || process.env.APPLE_MUSIC_TEAM_ID || '';
        const privateKey = keys.APPLE_MUSIC_PRIVATE_KEY || process.env.APPLE_MUSIC_PRIVATE_KEY || '';
        if (developerToken || (keyId && teamId && privateKey)) {
            return { developerToken, keyId, teamId, privateKey };
        }
        return null;
    }
}
