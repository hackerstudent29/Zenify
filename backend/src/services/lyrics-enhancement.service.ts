/**
 * Enhanced Lyrics Service - Additional sources and improvements
 * 
 * This service adds:
 * - Musixmatch API integration
 * - Lyrics caching
 * - Better error handling
 * - Quality scoring
 */

import axios from 'axios';
import { config } from '../config/env';

interface CachedLyrics {
    lyrics: string;
    source: string;
    expires: number;
    quality: number; // 1-5 score
}

export class LyricsEnhancementService {
    private static lyricsCache = new Map<string, CachedLyrics>();
    private static readonly CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

    /**
     * Fetch lyrics from Musixmatch API
     */
    static async fetchMusixmatchLyrics(title: string, artist: string): Promise<{ lyrics: string; quality: number } | null> {
        const apiKey = process.env.MUSIXMATCH_API_KEY;
        if (!apiKey) {
            console.log('[Musixmatch] API key not configured');
            return null;
        }

        try {
            console.log(`[Musixmatch] Searching for "${title}" by ${artist}`);
            
            // Search for track
            const searchRes = await axios.get('https://api.musixmatch.com/ws/1.1/matcher.lyrics.get', {
                params: {
                    q_track: title,
                    q_artist: artist,
                    apikey: apiKey
                },
                timeout: 5000
            });

            const lyricsBody = searchRes.data?.message?.body?.lyrics?.lyrics_body;
            if (lyricsBody) {
                // Musixmatch free tier has truncated lyrics
                const isTruncated = lyricsBody.includes('******* This Lyrics is NOT for Commercial use *******');
                const quality = isTruncated ? 3 : 5; // Lower quality if truncated
                
                console.log(`[Musixmatch] Found lyrics (${lyricsBody.length} chars, quality: ${quality})`);
                return { 
                    lyrics: lyricsBody.replace(/\*{7}.*?\*{7}/gs, '').trim(), 
                    quality 
                };
            }
        } catch (err: any) {
            console.warn('[Musixmatch] Failed:', err.message);
        }
        return null;
    }

    /**
     * Fetch lyrics from AZLyrics (web scraping)
     */
    static async fetchAZLyrics(title: string, artist: string): Promise<{ lyrics: string; quality: number } | null> {
        try {
            const cheerio = require('cheerio');
            
            // AZLyrics URL format: https://www.azlyrics.com/lyrics/artistname/songtitle.html
            const cleanArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const url = `https://www.azlyrics.com/lyrics/${cleanArtist}/${cleanTitle}.html`;
            
            console.log(`[AZLyrics] Fetching from ${url}`);
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 8000
            });

            const $ = cheerio.load(response.data);
            
            // AZLyrics has lyrics in a div without a class, after the ringtone div
            let lyricsText = '';
            $('div').each((i: number, el: any) => {
                const html = $(el).html();
                if (html && html.includes('<!-- Usage of azlyrics.com content')) {
                    lyricsText = $(el).text().trim();
                    return false; // break
                }
            });

            if (lyricsText && lyricsText.length > 50) {
                console.log(`[AZLyrics] Found lyrics (${lyricsText.length} chars)`);
                return { lyrics: lyricsText, quality: 4 };
            }
        } catch (err: any) {
            console.warn('[AZLyrics] Failed:', err.message);
        }
        return null;
    }

    /**
     * Fetch lyrics from Lyrics.com
     */
    static async fetchLyricsDotCom(title: string, artist: string): Promise<{ lyrics: string; quality: number } | null> {
        try {
            const cheerio = require('cheerio');
            
            // Search first
            const searchUrl = `https://www.lyrics.com/serp.php?st=${encodeURIComponent(title + ' ' + artist)}&qtype=1`;
            console.log(`[Lyrics.com] Searching...`);
            
            const searchRes = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 5000
            });

            const $ = cheerio.load(searchRes.data);
            const firstResult = $('.best-matches .bm-case a').first().attr('href');
            
            if (!firstResult) {
                console.log('[Lyrics.com] No results found');
                return null;
            }

            const lyricsUrl = `https://www.lyrics.com${firstResult}`;
            console.log(`[Lyrics.com] Fetching from ${lyricsUrl}`);
            
            const lyricsRes = await axios.get(lyricsUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 5000
            });

            const $$ = cheerio.load(lyricsRes.data);
            const lyricsText = $$('#lyric-body-text').text().trim();

            if (lyricsText && lyricsText.length > 50) {
                console.log(`[Lyrics.com] Found lyrics (${lyricsText.length} chars)`);
                return { lyrics: lyricsText, quality: 4 };
            }
        } catch (err: any) {
            console.warn('[Lyrics.com] Failed:', err.message);
        }
        return null;
    }

    /**
     * Get cached lyrics or fetch from multiple sources
     */
    static async getLyricsWithCache(title: string, artist: string): Promise<{ lyrics: string; source: string; quality: number } | null> {
        const cacheKey = `${artist}:${title}`.toLowerCase().replace(/\s+/g, '');
        
        // Check cache
        const cached = this.lyricsCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            console.log(`[LyricsCache] Cache hit for "${title}"`);
            return {
                lyrics: cached.lyrics,
                source: cached.source + ' (cached)',
                quality: cached.quality
            };
        }

        // Try multiple sources in parallel
        const sources = [
            this.fetchMusixmatchLyrics(title, artist).then(r => r ? { ...r, source: 'Musixmatch' } : null),
            this.fetchAZLyrics(title, artist).then(r => r ? { ...r, source: 'AZLyrics' } : null),
            this.fetchLyricsDotCom(title, artist).then(r => r ? { ...r, source: 'Lyrics.com' } : null),
        ];

        const results = await Promise.allSettled(sources);
        
        // Find best result (highest quality)
        let bestResult: { lyrics: string; source: string; quality: number } | null = null;
        
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                if (!bestResult || result.value.quality > bestResult.quality) {
                    bestResult = result.value;
                }
            }
        }

        // Cache the result
        if (bestResult) {
            this.lyricsCache.set(cacheKey, {
                lyrics: bestResult.lyrics,
                source: bestResult.source,
                quality: bestResult.quality,
                expires: Date.now() + this.CACHE_TTL
            });
            
            console.log(`[LyricsCache] Cached lyrics from ${bestResult.source} (quality: ${bestResult.quality})`);
        }

        return bestResult;
    }

    /**
     * Calculate lyrics quality score (1-5)
     */
    static calculateQualityScore(lyrics: string, title: string, artist: string): number {
        let score = 3; // Base score

        // Length check
        if (lyrics.length < 100) score -= 1;
        if (lyrics.length > 500) score += 1;

        // Structure check (has verse/chorus markers)
        if (/\[(Verse|Chorus|Bridge|Hook|Intro|Outro)/i.test(lyrics)) score += 1;

        // Contains title or artist name (good sign)
        if (lyrics.toLowerCase().includes(title.toLowerCase().slice(0, 10))) score += 0.5;

        // Has proper line breaks
        const lines = lyrics.split('\n').filter(l => l.trim().length > 0);
        if (lines.length > 10 && lines.length < 200) score += 0.5;

        return Math.min(5, Math.max(1, score));
    }

    /**
     * Clear cache (for testing or maintenance)
     */
    static clearCache(): void {
        this.lyricsCache.clear();
        console.log('[LyricsCache] Cache cleared');
    }

    /**
     * Get cache stats
     */
    static getCacheStats(): { size: number; entries: Array<{ key: string; source: string; quality: number }> } {
        const entries = Array.from(this.lyricsCache.entries()).map(([key, value]) => ({
            key,
            source: value.source,
            quality: value.quality
        }));

        return {
            size: this.lyricsCache.size,
            entries
        };
    }
}
