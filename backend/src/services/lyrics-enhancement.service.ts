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

import { SystemSettingsService } from './system-settings.service';

interface CachedLyrics {
    lyrics: string;
    isSynced: boolean;
    source: string;
    expires: number;
    quality: number; // 1-5 score
}

export class LyricsEnhancementService {
    private static lyricsCache = new Map<string, CachedLyrics>();
    private static readonly CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

    /**
     * Aggressively scrubs unwanted text like "Lyrics for X", "Submit Corrections", etc.
     */
    /**
     * Strictly verifies whether a text represents genuine song lyrics vs movie credits, video descriptions, or artist rosters.
     */
    static isValidSongLyrics(text: string): boolean {
        if (!text || typeof text !== 'string') return false;
        const clean = text.trim();
        if (clean.length < 30) return false;

        const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 4) return false;

        // Keywords indicative of descriptions, video credits, or streaming links
        const garbageKeywordsRegex = /\b(directed by|music by|sung by|singers?|starring|cast|lyricist|choreograph(er|y)|dop|cinematograph(er|y)|editor|producer|production|co-producer|executive producer|banner|music label|audio label|audio on|streaming on|stream on|stream now|listen on|download on|available on|subscribe|subscribers|official video|lyric video|official audio|all rights reserved|copyright|recorded at|mixed by|mastered by|guitars?|bass|percussion|flute|sound engineer|pro:|pr:|release date|label:|movie:|film:)\b/i;

        let garbageLinesCount = 0;
        let colonKeyValueLines = 0;

        for (const line of lines) {
            if (line.startsWith('http://') || line.startsWith('https://')) {
                garbageLinesCount++;
                continue;
            }
            if (garbageKeywordsRegex.test(line)) {
                garbageLinesCount++;
            }
            // Lines like "Role: Name" or "Credit: Value"
            if (/^[A-Za-z\s]{3,20}\s*:\s*[A-Za-z0-9\s,.-]{2,}$/.test(line)) {
                colonKeyValueLines++;
            }
        }

        // If more than 20% of lines are credit garbage or more than 35% are key-value lines, reject
        if (garbageLinesCount / lines.length > 0.20) {
            console.log(`[LyricsValidator] Rejected lyrics candidate: ${garbageLinesCount}/${lines.length} lines contain video credits/description keywords.`);
            return false;
        }

        if (colonKeyValueLines / lines.length > 0.35) {
            console.log(`[LyricsValidator] Rejected lyrics candidate: ${colonKeyValueLines}/${lines.length} lines are key-value credit pairs.`);
            return false;
        }

        return true;
    }

    /**
     * Aggressively scrubs unwanted text like "Lyrics for X", "Submit Corrections", description headers, etc.
     */
    static cleanLyricsText(lyrics: string): string {
        if (!lyrics) return '';
        let clean = lyrics;
        clean = clean.replace(/Submit Corrections.*/gis, '');
        clean = clean.replace(/\*{7}.*?\*{7}/gs, '');
        clean = clean.replace(/^.*Lyrics for.*?by.*?\n+/i, '');
        clean = clean.replace(/^.*Paroles de la chanson.*?\n+/i, '');
        clean = clean.replace(/Writer\(s\):.*/gis, '');
        clean = clean.replace(/<!-- Usage of azlyrics.*?-->/gis, '');
        clean = clean.replace(/\d*Embed$/i, '');
        clean = clean.replace(/You might also like/gi, '');

        // Remove video description footer links & social calls
        const lines = clean.split('\n');
        const filteredLines = lines.filter(l => {
            const line = l.trim().toLowerCase();
            if (line.startsWith('http://') || line.startsWith('https://')) return false;
            if (line.startsWith('follow us on') || line.startsWith('subscribe to') || line.startsWith('stream full song')) return false;
            return true;
        });

        return filteredLines.join('\n').trim();
    }

    /**
     * Fetch from lrc.red (Apple Music Word-by-word / Syllable synced lyrics)
     */
    static async fetchLrcRed(title: string, artist: string, isrc?: string): Promise<{ lyrics: string; isSynced: boolean; quality: number; source: string } | null> {
        try {
            console.log(`[lrc.red] Checking for word-by-word lyrics: "${title}" by ${artist}`);
            if (isrc) {
                const res = await axios.get(`https://lrc.red/s/${isrc}.lrc`, { timeout: 3000 });
                if (res.status === 200 && res.data && typeof res.data === 'string' && res.data.length > 50) {
                    console.log(`[lrc.red] Found word-by-word lyrics directly for ISRC: ${isrc}`);
                    return { lyrics: res.data, isSynced: true, quality: 6, source: 'lrc.red (Word-by-word)' };
                }
            }

            const cleanT = title.replace(/\(.*\)/g, '').replace(/\[.*\]/g, '').trim();
            const cleanA = artist.split(',')[0].split('&')[0].trim();
            const mbRes = await axios.get(
                `https://musicbrainz.org/ws/2/recording?query=recording:%22${encodeURIComponent(cleanT)}%22%20AND%20artist:%22${encodeURIComponent(cleanA)}%22&fmt=json`,
                { headers: { 'User-Agent': 'ZenifyApp/1.0 (contact@zenify.local)' }, timeout: 3000 }
            );

            if (mbRes.data?.recordings && Array.isArray(mbRes.data.recordings)) {
                for (const rec of mbRes.data.recordings.slice(0, 4)) {
                    if (rec.isrcs && Array.isArray(rec.isrcs)) {
                        for (const candIsrc of rec.isrcs) {
                            try {
                                const testRes = await axios.get(`https://lrc.red/s/${candIsrc}.lrc`, { timeout: 2500 });
                                if (testRes.status === 200 && testRes.data && typeof testRes.data === 'string' && testRes.data.length > 50) {
                                    console.log(`[lrc.red] Found word-by-word lyrics via MusicBrainz ISRC: ${candIsrc}`);
                                    return { lyrics: testRes.data, isSynced: true, quality: 6, source: 'lrc.red (Word-by-word)' };
                                }
                            } catch (e) {}
                        }
                    }
                }
            }
        } catch (e: any) {}
        return null;
    }

    /**
     * Checks if a candidate lyrics snippet conflicts with the expected song language.
     * Prevents cross-language dubs (e.g. Telugu lyrics for Tamil songs or vice versa).
     */
    static isLyricsLanguageMismatch(lyricsText: string, expectedLang?: string): boolean {
        if (!lyricsText || !expectedLang) return false;
        const lang = expectedLang.toLowerCase().trim();
        const hasTelugu = /[\u0c00-\u0c7f]/.test(lyricsText);
        const hasTamil = /[\u0b80-\u0bff]/.test(lyricsText);
        const hasHindi = /[\u0900-\u097f]/.test(lyricsText);
        const hasMalayalam = /[\u0d00-\u0d7f]/.test(lyricsText);
        const hasKannada = /[\u0c80-\u0cff]/.test(lyricsText);

        if (lang === 'tamil' && (hasTelugu || hasHindi || hasMalayalam || hasKannada)) return true;
        if (lang === 'telugu' && (hasTamil || hasHindi || hasMalayalam || hasKannada)) return true;
        if (lang === 'hindi' && (hasTamil || hasTelugu || hasMalayalam || hasKannada)) return true;
        if (lang === 'malayalam' && (hasTamil || hasTelugu || hasHindi || hasKannada)) return true;
        if (lang === 'kannada' && (hasTamil || hasTelugu || hasHindi || hasMalayalam)) return true;
        return false;
    }

    /**
     * Fetch from LRCLib (BEST SOURCE - Provides accurate time-synced LRC with Language Verification)
     */
    static async fetchLRCLib(title: string, artist: string, durationSeconds?: number, targetLanguage?: string): Promise<{ lyrics: string; isSynced: boolean; quality: number } | null> {
        try {
            console.log(`[LRCLib] Searching for "${title}" by ${artist} (Language: ${targetLanguage || 'auto'})`);
            const lowerTitle = title.toLowerCase();
            let resolvedLang = targetLanguage;
            if (!resolvedLang) {
                if (lowerTitle.includes('(tamil)') || lowerTitle.includes('[tamil]') || lowerTitle.includes(' tamil')) resolvedLang = 'tamil';
                else if (lowerTitle.includes('(telugu)') || lowerTitle.includes('[telugu]') || lowerTitle.includes(' telugu')) resolvedLang = 'telugu';
                else if (lowerTitle.includes('(hindi)') || lowerTitle.includes('[hindi]') || lowerTitle.includes(' hindi')) resolvedLang = 'hindi';
                else if (lowerTitle.includes('(malayalam)') || lowerTitle.includes('[malayalam]') || lowerTitle.includes(' malayalam')) resolvedLang = 'malayalam';
                else if (lowerTitle.includes('(kannada)') || lowerTitle.includes('[kannada]') || lowerTitle.includes(' kannada')) resolvedLang = 'kannada';
            }

            const cleanTitle = title.replace(/\(.*\)/g, '').replace(/\[.*\]/g, '').trim();
            const cleanArtist = artist.split(',')[0].split('&')[0].trim();
            
            // Search LRCLib catalog using multiple query strategies to find native language uploads
            const headers = { 'User-Agent': 'ZenifyMusicPlayer/2.5.0 (https://zenify.app)' };
            const candidateMap = new Map<number, any>();

            // Query 1: Clean artist and title
            const searchPromises = [
                axios.get(`https://lrclib.net/api/search?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`, { headers, timeout: 5000 })
                    .then(res => res.data).catch(() => [])
            ];

            // Query 2: If target language specified, search full text "Title Language" (e.g. "Powerhouse Tamil")
            if (resolvedLang) {
                searchPromises.push(
                    axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${resolvedLang}`)}`, { headers, timeout: 5000 })
                        .then(res => res.data).catch(() => [])
                );
            }

            // Query 3: General query "Title Artist"
            searchPromises.push(
                axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`, { headers, timeout: 5000 })
                    .then(res => res.data).catch(() => [])
            );

            const searchResults = await Promise.all(searchPromises);
            for (const list of searchResults) {
                if (Array.isArray(list)) {
                    for (const item of list) {
                        if (item?.id && !candidateMap.has(item.id)) {
                            candidateMap.set(item.id, item);
                        }
                    }
                }
            }

            let bestCandidate: any = null;
            if (candidateMap.size > 0) {
                const candidates = Array.from(candidateMap.values());
                const scoredCandidates = candidates.map((item: any) => {
                    const text = (item.syncedLyrics || item.plainLyrics || '').trim();
                    if (!text || text.length < 20) return { item, score: -999999 };

                    // Hard rejection for cross-language dubbed mismatches
                    if (resolvedLang && this.isLyricsLanguageMismatch(text, resolvedLang)) {
                        return { item, score: -999999 };
                    }

                    let score = 0;
                    if (item.syncedLyrics) score += 1000;
                    else if (item.plainLyrics) score += 200;

                    // Boost matching native script
                    if (resolvedLang === 'tamil' && /[\u0b80-\u0bff]/.test(text)) score += 3000;
                    if (resolvedLang === 'telugu' && /[\u0c00-\u0c7f]/.test(text)) score += 3000;
                    if (resolvedLang === 'hindi' && /[\u0900-\u097f]/.test(text)) score += 3000;
                    if (resolvedLang === 'malayalam' && /[\u0d00-\u0d7f]/.test(text)) score += 3000;
                    if (resolvedLang === 'kannada' && /[\u0c80-\u0cff]/.test(text)) score += 3000;

                    // Duration closeness bonus
                    if (durationSeconds && item.duration) {
                        const diff = Math.abs(item.duration - durationSeconds);
                        if (diff <= 3) score += 500;
                        else if (diff <= 8) score += 200;
                    }

                    // Artist name similarity
                    const itemArtist = (item.artistName || '').toLowerCase();
                    if (itemArtist.includes(cleanArtist.toLowerCase())) score += 300;

                    return { item, score };
                });

                scoredCandidates.sort((a, b) => b.score - a.score);
                if (scoredCandidates.length > 0 && scoredCandidates[0].score > 0) {
                    bestCandidate = scoredCandidates[0].item;
                    console.log(`[LRCLib] Selected best candidate [score: ${scoredCandidates[0].score}] for language "${resolvedLang || 'universal'}": id ${bestCandidate.id} (track: ${bestCandidate.trackName}, artist: ${bestCandidate.artistName})`);
                }
            }

            // Fallback to strict /api/get only if search yielded no valid candidates and no language conflict
            if (!bestCandidate) {
                let getUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
                if (durationSeconds && durationSeconds > 0) getUrl += `&duration=${durationSeconds}`;
                const getRes = await axios.get(getUrl, { headers, timeout: 3500 }).catch(() => null);
                if (getRes?.data) {
                    const candidateText = (getRes.data.syncedLyrics || getRes.data.plainLyrics || '');
                    if (!resolvedLang || !this.isLyricsLanguageMismatch(candidateText, resolvedLang)) {
                        bestCandidate = getRes.data;
                    }
                }
            }

            if (bestCandidate) {
                if (bestCandidate.syncedLyrics) {
                    console.log(`[LRCLib] Found language-verified SYNCED lyrics (${bestCandidate.syncedLyrics.length} chars)`);
                    return { lyrics: this.cleanLyricsText(bestCandidate.syncedLyrics), isSynced: true, quality: 5 };
                } else if (bestCandidate.plainLyrics) {
                    console.log(`[LRCLib] Found language-verified PLAIN lyrics (${bestCandidate.plainLyrics.length} chars)`);
                    return { lyrics: this.cleanLyricsText(bestCandidate.plainLyrics), isSynced: false, quality: 4 };
                }
            }
        } catch (err: any) {
            console.warn('[LRCLib] Failed:', err.message);
        }
        return null;
    }

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
                    lyrics: this.cleanLyricsText(lyricsBody), 
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
                const cleaned = this.cleanLyricsText(lyricsText);
                console.log(`[AZLyrics] Found lyrics (${cleaned.length} chars)`);
                return { lyrics: cleaned, quality: 4 };
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
                const cleaned = this.cleanLyricsText(lyricsText);
                console.log(`[Lyrics.com] Found lyrics (${cleaned.length} chars)`);
                return { lyrics: cleaned, quality: 4 };
            }
        } catch (err: any) {
            console.warn('[Lyrics.com] Failed:', err.message);
        }
        return null;
    }

    /**
     * Fetch lyrics from Genius RapidAPI
     */
    static async fetchGeniusRapidApiLyrics(title: string, artist: string): Promise<{ lyrics: string; quality: number; isSynced: boolean } | null> {
        const rapidApiKey = await SystemSettingsService.getGeniusApiKey();
        try {
            console.log(`[GeniusRapidAPI] Searching for "${title}" by ${artist}`);
            
            // 1. Search for track to get Genius ID
            const searchRes = await axios.get('https://genius-song-lyrics1.p.rapidapi.com/search/', {
                params: { q: `${artist} ${title}`, per_page: '1', page: '1' },
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': 'genius-song-lyrics1.p.rapidapi.com'
                },
                timeout: 5000
            });
            
            // Strictly check that it's a song and matches the title
            const hits = searchRes.data?.hits || [];
            let trackId = null;
            const { LyricsSyncService } = await import('./lyrics-sync.service.js');
            for (const h of hits) {
                if (h.type === 'song' && h.result?.lyrics_state === 'complete') {
                    if (LyricsSyncService.isTitleMatch(title, h.result.title || '')) {
                        trackId = h.result.id;
                        break;
                    }
                }
            }
            
            if (!trackId) {
                console.log('[GeniusRapidAPI] No valid track found.');
                return null;
            }

            // 2. Fetch lyrics using the track ID
            const lyricsRes = await axios.get('https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/', {
                params: { id: trackId },
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': 'genius-song-lyrics1.p.rapidapi.com'
                },
                timeout: 5000
            });
            
            const htmlLyrics = lyricsRes.data?.lyrics?.lyrics?.body?.html;
            if (htmlLyrics) {
                // Convert HTML to plain text
                let plainText = htmlLyrics
                    .replace(/<br\s*[\/]?>/gi, '\n') // Replace <br> with newlines
                    .replace(/<p.*?>/gi, '')         // Remove <p>
                    .replace(/<\/p>/gi, '\n\n')      // Replace </p> with double newlines
                    .replace(/<[^>]+>/g, '')         // Remove all other HTML tags
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .trim();
                
                // Clean up excessive newlines
                plainText = plainText.replace(/\n{3,}/g, '\n\n');
                
                if (plainText.length > 50) {
                    const cleaned = this.cleanLyricsText(plainText);
                    console.log(`[GeniusRapidAPI] Found lyrics (${cleaned.length} chars).`);
                    return { lyrics: cleaned, quality: 5, isSynced: false };
                }
            }
        } catch (err: any) {
            console.warn('[GeniusRapidAPI] Failed:', err.message);
        }
        return null;
    }

    /**
     * Fetch lyrics from Musixmatch via RapidAPI proxy
     */
    static async fetchMusixmatchRapidApiLyrics(title: string, artist: string, duration?: number): Promise<{ lyrics: string; quality: number; isSynced: boolean } | null> {
        const rapidApiKey = await SystemSettingsService.getRapidApiKey();
        try {
            console.log(`[MusixmatchRapidAPI] Searching for "${title}" by ${artist}`);
            
            const params: any = { t: title, a: artist };
            if (duration) {
                const m = Math.floor(duration / 60);
                const s = duration % 60;
                params.d = `${m}:${s.toString().padStart(2, '0')}`;
            }

            const lyricsRes = await axios.get('https://musixmatch-lyrics-songs.p.rapidapi.com/songs/lyrics', {
                params,
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': 'musixmatch-lyrics-songs.p.rapidapi.com'
                },
                timeout: 5000
            });
            
            if (lyricsRes.data && lyricsRes.data.success && lyricsRes.data.lyrics) {
                const lyrics = lyricsRes.data.lyrics;
                if (lyrics.length > 50) {
                    const cleaned = this.cleanLyricsText(lyrics);
                    console.log(`[MusixmatchRapidAPI] Found lyrics (${cleaned.length} chars).`);
                    return { lyrics: cleaned, quality: 4, isSynced: false };
                }
            }
        } catch (err: any) {
            console.warn('[MusixmatchRapidAPI] Failed:', err.message);
        }
        return null;
    }

    /**
     * Fetch lyrics from Genius RapidAPI version 5
     */
    static async fetchGeniusRapidApi5Lyrics(title: string, artist: string): Promise<{ lyrics: string; quality: number; isSynced: boolean } | null> {
        const rapidApiKey = await SystemSettingsService.getGeniusApiKey();
        try {
            console.log(`[GeniusRapidAPI5] Searching for "${title}" by ${artist}`);
            
            const searchRes = await axios.get('https://genius-song-lyrics5.p.rapidapi.com/search', {
                params: { q: `${artist} ${title}` },
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': 'genius-song-lyrics5.p.rapidapi.com'
                },
                timeout: 5000
            });
            
            const hits = searchRes.data?.data || [];
            const { LyricsSyncService } = await import('./lyrics-sync.service.js');
            const matchingTrack = Array.isArray(hits) ? hits.find((h: any) => 
                LyricsSyncService.isTitleMatch(title, h.title || h.name || '')
            ) : null;
            const trackId = matchingTrack?.id;
            if (!trackId) {
                return null;
            }

            const lyricsRes = await axios.get('https://genius-song-lyrics5.p.rapidapi.com/song/lyrics', {
                params: { id: trackId },
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': 'genius-song-lyrics5.p.rapidapi.com'
                },
                timeout: 5000
            });
            
            const lyrics = lyricsRes.data?.data?.lyrics;
            if (lyrics && lyrics.length > 50) {
                const cleaned = this.cleanLyricsText(lyrics);
                console.log(`[GeniusRapidAPI5] Found lyrics (${cleaned.length} chars).`);
                return { lyrics: cleaned, quality: 5, isSynced: false };
            }
        } catch (err: any) {
            console.warn('[GeniusRapidAPI5] Failed:', err.message);
        }
        return null;
    }

    /**
     * Fetch lyrics from Spotify23 RapidAPI
     */
    static async fetchSpotifyRapidApiLyrics(title: string, artist: string): Promise<{ lyrics: string; quality: number; isSynced: boolean } | null> {
        const rapidApiKey = await SystemSettingsService.getSpotifyApiKey();
        try {
            console.log(`[SpotifyRapidAPI] Searching for "${title}" by ${artist}`);
            
            // 1. Search for track to get Spotify ID
            const searchRes = await axios.get('https://spotify23.p.rapidapi.com/search/', {
                params: { q: `${title} ${artist}`, type: 'tracks', limit: 1 },
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': 'spotify23.p.rapidapi.com'
                },
                timeout: 5000
            });
            
            const trackItem = searchRes.data?.tracks?.items?.[0]?.data;
            const trackName = trackItem?.name || '';
            const { LyricsSyncService } = await import('./lyrics-sync.service.js');
            if (!LyricsSyncService.isTitleMatch(title, trackName)) {
                console.log(`[SpotifyRapidAPI] Track name "${trackName}" does not match "${title}".`);
                return null;
            }
            const trackId = trackItem?.id;
            if (!trackId) {
                console.log('[SpotifyRapidAPI] No track found.');
                return null;
            }

            // 2. Try Spotify81 lyrics endpoint first (verified active)
            try {
                const s81Res = await axios.get('https://spotify81.p.rapidapi.com/track_lyrics', {
                    params: { id: trackId },
                    headers: {
                        'x-rapidapi-key': rapidApiKey,
                        'x-rapidapi-host': 'spotify81.p.rapidapi.com'
                    },
                    timeout: 5000
                });
                const s81Data = s81Res.data;
                const lines = s81Data?.lines || s81Data?.lyrics?.lines;
                if (lines && lines.length > 0) {
                    console.log(`[SpotifyRapidAPI] Found ${lines.length} lines via spotify81.`);
                    let lrcContent = "";
                    let hasSync = false;
                    lines.forEach((line: any) => {
                        if (line.startTimeMs && line.startTimeMs !== "0") {
                            hasSync = true;
                            const date = new Date(parseInt(line.startTimeMs));
                            const m = date.getUTCMinutes().toString().padStart(2, '0');
                            const s = date.getUTCSeconds().toString().padStart(2, '0');
                            const ms = Math.floor(date.getUTCMilliseconds() / 10).toString().padStart(2, '0');
                            lrcContent += `[${m}:${s}.${ms}] ${line.words || ''}\n`;
                        } else {
                            lrcContent += `${line.words || ''}\n`;
                        }
                    });
                    if (lrcContent.trim()) {
                        return { lyrics: lrcContent.trim(), isSynced: hasSync, quality: 5 };
                    }
                }
            } catch (err: any) {
                console.warn('[SpotifyRapidAPI] spotify81 lyrics failed, trying fallback:', err.message);
            }

            // 3. Fallback: Spotify23 lyrics endpoint
            const lyricsRes = await axios.get('https://spotify23.p.rapidapi.com/track_lyrics/', {
                params: { id: trackId },
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': 'spotify23.p.rapidapi.com'
                },
                timeout: 5000
            });

            const data = lyricsRes.data;
            
            if (data && data.lyrics && data.lyrics.lines) {
                console.log(`[SpotifyRapidAPI] Found lyrics with ${data.lyrics.lines.length} lines.`);
                
                let lrcContent = "";
                let hasSync = false;
                
                data.lyrics.lines.forEach((line: any) => {
                    if (line.startTimeMs && line.startTimeMs !== "0") {
                        hasSync = true;
                        const date = new Date(parseInt(line.startTimeMs));
                        const m = date.getUTCMinutes().toString().padStart(2, '0');
                        const s = date.getUTCSeconds().toString().padStart(2, '0');
                        const ms = Math.floor(date.getUTCMilliseconds() / 10).toString().padStart(2, '0');
                        lrcContent += `[${m}:${s}.${ms}] ${line.words}\n`;
                    } else {
                        lrcContent += `${line.words}\n`;
                    }
                });
                
                return {
                    lyrics: lrcContent.trim(),
                    isSynced: hasSync,
                    quality: 5
                };
            }
        } catch (err: any) {
            console.warn('[SpotifyRapidAPI] Failed:', err.message);
        }
        return null;
    }

    /**
     * Get cached lyrics or fetch from multiple sources
     */
    static async getLyricsWithCache(title: string, artist: string, durationSeconds?: number, isrc?: string): Promise<{ lyrics: string; isSynced: boolean; source: string; quality: number } | null> {
        const cacheKey = `${artist}:${title}:${durationSeconds || 0}`.toLowerCase().replace(/\s+/g, '');
        
        // Check cache
        const cached = this.lyricsCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            console.log(`[LyricsCache] Cache hit for "${title}"`);
            return {
                lyrics: cached.lyrics,
                isSynced: cached.isSynced,
                source: cached.source + ' (cached)',
                quality: cached.quality
            };
        }

        // 1. Try lrc.red first (Primary: exact word-by-word syllable timings)
        const lrcRedResult = await this.fetchLrcRed(title, artist, isrc);
        if (lrcRedResult && lrcRedResult.isSynced) {
            this.lyricsCache.set(cacheKey, {
                ...lrcRedResult,
                source: 'lrc.red (Word-by-word)',
                expires: Date.now() + this.CACHE_TTL
            });
            return { ...lrcRedResult, source: 'lrc.red (Word-by-word)' };
        }

        // 2. Try LRCLib (Line synced with instrumental separations)
        const lrcResult = await this.fetchLRCLib(title, artist, durationSeconds);
        if (lrcResult && lrcResult.isSynced) {
            this.lyricsCache.set(cacheKey, {
                ...lrcResult,
                source: 'LRCLib',
                expires: Date.now() + this.CACHE_TTL
            });
            return { ...lrcResult, source: 'LRCLib' };
        }

        // Try multiple sources in parallel
        const fetchPromises = [
            this.fetchSpotifyRapidApiLyrics(title, artist).then(r => r ? { ...r, source: 'Spotify RapidAPI' } : null),
            this.fetchGeniusRapidApiLyrics(title, artist).then(r => r ? { ...r, source: 'Genius RapidAPI 1' } : null),
            this.fetchGeniusRapidApi5Lyrics(title, artist).then(r => r ? { ...r, source: 'Genius RapidAPI 5' } : null),
            this.fetchLRCLib(title, artist, durationSeconds).then(r => r ? { ...r, source: 'LRCLib' } : null),
            this.fetchMusixmatchRapidApiLyrics(title, artist, durationSeconds).then(r => r ? { ...r, source: 'Musixmatch RapidAPI' } : null),
            this.fetchMusixmatchLyrics(title, artist).then(r => r ? { ...r, isSynced: false, source: 'Musixmatch' } : null),
            this.fetchAZLyrics(title, artist).then(r => r ? { ...r, isSynced: false, source: 'AZLyrics' } : null),
            this.fetchLyricsDotCom(title, artist).then(r => r ? { ...r, isSynced: false, source: 'Lyrics.com' } : null),
        ];

        const results = await Promise.allSettled(fetchPromises);
        
        // Find best result (highest quality)
        let bestResult: { lyrics: string; isSynced: boolean; source: string; quality: number } | null = lrcResult ? { ...lrcResult, source: 'LRCLib' } : null;
        
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
                isSynced: bestResult.isSynced,
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
    static getCacheStats(): { size: number; entries: Array<{ key: string; isSynced: boolean; source: string; quality: number }> } {
        const entries = Array.from(this.lyricsCache.entries()).map(([key, value]) => ({
            key,
            isSynced: value.isSynced,
            source: value.source,
            quality: value.quality
        }));

        return {
            size: this.lyricsCache.size,
            entries
        };
    }
}
