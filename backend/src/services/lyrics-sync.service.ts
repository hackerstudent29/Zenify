import axios from 'axios';
import { AILyricsService } from './ai-lyrics.service';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as cheerio from 'cheerio';

export interface SyncedLyricLine {
    time: number; // in seconds
    text: string;
}

export class LyricsSyncService {
    /**
     * Parse raw LRC string into structured array.
     */
    static parseLRC(lrc: string): SyncedLyricLine[] {
        const lines = lrc.split('\n');
        const result: SyncedLyricLine[] = [];
        const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/;

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            const match = timeRegex.exec(line);
            if (match) {
                const mins = parseInt(match[1]);
                const secs = parseInt(match[2]);
                const msStr = match[3] || '0';
                const ms = parseInt(msStr);
                const timeInSeconds = mins * 60 + secs + (ms / Math.pow(10, msStr.length));
                
                const text = line.replace(timeRegex, '').trim();
                if (text) {
                    result.push({ time: timeInSeconds, text });
                }
            }
        }
        return result.sort((a, b) => a.time - b.time);
    }

    /**
     * Parse WebVTT (.vtt) format into structured array.
     */
    static parseVTT(vttText: string): SyncedLyricLine[] {
        const lines = vttText.split(/\r?\n/);
        const result: SyncedLyricLine[] = [];
        const timeRegex = /(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

        let currentTimestamp: number | null = null;
        let currentTextLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:')) continue;

            const match = timeRegex.exec(line);
            if (match) {
                if (currentTimestamp !== null && currentTextLines.length > 0) {
                    const text = currentTextLines.join(' ').trim();
                    if (text && !text.match(/^\[.*\]$/) && !text.match(/^\(.*\)$/)) {
                        result.push({ time: currentTimestamp, text });
                    }
                }
                const hours = match[1] ? parseInt(match[1]) : 0;
                const minutes = parseInt(match[2]);
                const seconds = parseInt(match[3]);
                const ms = parseInt(match[4]);
                currentTimestamp = hours * 3600 + minutes * 60 + seconds + ms / 1000;
                currentTextLines = [];
            } else if (currentTimestamp !== null) {
                const cleanLine = line.replace(/<[^>]+>/g, '').trim();
                if (cleanLine) {
                    currentTextLines.push(cleanLine);
                }
            }
        }

        if (currentTimestamp !== null && currentTextLines.length > 0) {
            const text = currentTextLines.join(' ').trim();
            if (text && !text.match(/^\[.*\]$/) && !text.match(/^\(.*\)$/)) {
                result.push({ time: currentTimestamp, text });
            }
        }

        return result.sort((a, b) => a.time - b.time);
    }

    /**
     * Download and extract synced lyrics from YouTube video subtitles.
     */
    static async fetchYouTubeSubtitles(title: string, artist: string, videoUrl?: string): Promise<{ syncedTokens: SyncedLyricLine[], rawLrc?: string } | null> {
        try {
            const { ExternalMetadataService } = await import('./external-metadata.service.js');
            let finalUrl = videoUrl;

            const isYt = finalUrl && (finalUrl.includes('youtube.com') || finalUrl.includes('youtu.be'));
            if (!isYt) {
                console.log(`[LyricsSync/YT] Searching YouTube for subtitles match: "${artist} - ${title} lyrics"`);
                try {
                    const searchRes = await ExternalMetadataService.execYtDlp(
                        '--dump-json --flat-playlist --no-warnings',
                        `ytsearch1:${artist} ${title} lyrics`
                    );
                    const video = JSON.parse(searchRes);
                    if (video && video.id) {
                        finalUrl = `https://www.youtube.com/watch?v=${video.id}`;
                        console.log(`[LyricsSync/YT] Found lyrics video: ${finalUrl}`);
                    }
                } catch (searchErr: any) {
                    console.warn(`[LyricsSync/YT] Search failed:`, searchErr.message);
                }
            }

            if (!finalUrl || !(finalUrl.includes('youtube.com') || finalUrl.includes('youtu.be'))) {
                return null;
            }

            const tempDir = os.tmpdir();
            const fileId = `subs-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            const outputStem = path.join(tempDir, fileId);

            console.log(`[LyricsSync/YT] Attempting subtitle download for: ${finalUrl}`);
            await ExternalMetadataService.execYtDlp(
                '--write-subs --write-auto-subs --skip-download --sub-format vtt --sub-langs en,ta,hi,ml,te,en-orig,ta-orig',
                finalUrl,
                outputStem
            );

            const files = fs.readdirSync(tempDir).filter(f => f.startsWith(fileId) && f.endsWith('.vtt'));
            if (files.length === 0) {
                console.log(`[LyricsSync/YT] No subtitle files found on disk for ${finalUrl}`);
                return null;
            }

            const bestFile = files.sort((a, b) => {
                const rank = (f: string) => {
                    const low = f.toLowerCase();
                    if (low.includes('.ta.vtt') || low.includes('.ta-orig.vtt')) return 1;
                    if (low.includes('.en.vtt') || low.includes('.en-orig.vtt')) return 2;
                    if (low.includes('.hi.vtt')) return 3;
                    return 10;
                };
                return rank(a) - rank(b);
            })[0];

            const filePath = path.join(tempDir, bestFile);
            console.log(`[LyricsSync/YT] Parsing subtitle file: ${bestFile}`);
            const content = fs.readFileSync(filePath, 'utf-8');
            
            files.forEach(f => {
                try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
            });

            const parsed = this.parseVTT(content);
            if (parsed && parsed.length > 0) {
                const rawLrc = parsed.map(line => {
                    const m = Math.floor(line.time / 60);
                    const s = Math.floor(line.time % 60);
                    const ms = Math.floor((line.time % 1) * 100);
                    return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}] ${line.text}`;
                }).join('\n');

                console.log(`[LyricsSync/YT] Parsed ${parsed.length} lines.`);
                return { syncedTokens: parsed, rawLrc };
            }
        } catch (err: any) {
            console.warn(`[LyricsSync/YT] Subtitles extraction failed:`, err.message);
        }
        return null;
    }

    /**
     * Scrape plain text lyrics from Genius.com.
     */
    static async scrapeGeniusLyrics(title: string, artist: string): Promise<string | null> {
        try {
            const query = `${artist} ${title}`;
            console.log(`[LyricsSync/Genius] Searching Genius for "${query}"`);
            const searchUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`;
            const searchRes = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                timeout: 5000
            });

            const sections = searchRes.data?.response?.sections;
            const songSection = sections?.find((s: any) => s.type === 'song');
            const hits = songSection?.hits;
            if (!hits || hits.length === 0) {
                console.log(`[LyricsSync/Genius] No hits found.`);
                return null;
            }

            const bestHit = hits[0].result;
            console.log(`[LyricsSync/Genius] Found match: "${bestHit.title}" by ${bestHit.primary_artist?.name}`);

            const pageRes = await axios.get(bestHit.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 8000
            });

            const $ = cheerio.load(pageRes.data);

            let lyricsText = '';
            $('[class^="Lyrics__Container"]').each((i, el) => {
                $(el).find('br').replaceWith('\n');
                lyricsText += $(el).text() + '\n';
            });

            if (!lyricsText.trim()) {
                lyricsText = $('.lyrics').text();
            }

            const cleaned = lyricsText.trim();
            if (cleaned) {
                console.log(`[LyricsSync/Genius] Scraped lyrics (${cleaned.length} chars).`);
                return cleaned;
            }
        } catch (e: any) {
            console.warn(`[LyricsSync/Genius] Scraping failed:`, e.message);
        }
        return null;
    }

    /**
     * Primary Function: Attempt LRCLIB first, YouTube subtitles second, fallback to Genius / Happi + AI alignment.
     */
    static async getSyncedLyrics(
        title: string, 
        artist: string, 
        audioUrl?: string, 
        plainLyrics?: string, 
        duration?: number,
        youtubeUrl?: string
    ): Promise<{ syncedTokens: SyncedLyricLine[], rawLrc?: string } | null> {
        // Priority: Check if plainLyrics already contains LRC format (e.g., uploaded or seeded)
        if (plainLyrics && /\[\d{2}:\d{2}/.test(plainLyrics)) {
            console.log(`[LyricsSync] Pre-formatted LRC detected for "${title}". Direct parsing applied.`);
            const parsed = this.parseLRC(plainLyrics);
            if (parsed && parsed.length > 0) {
                return { 
                    syncedTokens: parsed, 
                    rawLrc: plainLyrics 
                };
            }
        }

        // Stage 1: LRCLIB Check
        try {
            console.log(`[LyricsSync] Attempting LRCLIB for ${title} by ${artist}`);
            const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '').trim();
            const cleanArtist = artist.replace(/\s*feat\.?\s*.*/i, '').trim();

            try {
                const res = await axios.get(
                    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`,
                    { timeout: 2500 }
                );

                if (res.data?.syncedLyrics) {
                    console.log(`[LyricsSync] Synced lyrics found exactly via LRCLIB!`);
                    return { 
                        syncedTokens: this.parseLRC(res.data.syncedLyrics), 
                        rawLrc: res.data.syncedLyrics 
                    };
                }
            } catch (strictErr: any) {
                console.log(`[LyricsSync] Exact match missed (${strictErr.message}). Attempting fuzzy search...`);
                const searchRes = await axios.get(
                    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`,
                    { timeout: 2500 }
                );
                
                if (searchRes.data && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                    const bestMatch = searchRes.data.find((track: any) => track.syncedLyrics);
                    if (bestMatch?.syncedLyrics) {
                        console.log(`[LyricsSync] Synced lyrics found via fuzzy search!`);
                        return { 
                            syncedTokens: this.parseLRC(bestMatch.syncedLyrics), 
                            rawLrc: bestMatch.syncedLyrics 
                        };
                    }
                }
            }
        } catch (err: any) {
            console.log(`[LyricsSync] LRCLIB synced miss (${err.message}).`);
        }

        // Stage 2: YouTube Subtitles Extraction (Direct Video URL or search query)
        const targetYtUrl = youtubeUrl || (audioUrl?.includes('youtube.com') || audioUrl?.includes('youtu.be') ? audioUrl : undefined);
        console.log(`[LyricsSync] Checking YouTube subtitles for: ${title} (URL: ${targetYtUrl})`);
        const ytSynced = await this.fetchYouTubeSubtitles(title, artist, targetYtUrl);
        if (ytSynced) {
            return ytSynced;
        }

        // Stage 3: Fetch plain text lyrics as fallback
        if (!plainLyrics) {
            plainLyrics = (await this.scrapeGeniusLyrics(title, artist)) || undefined;
            
            if (!plainLyrics) {
                try {
                    const { WhisperSyncService } = await import('./whisper-sync.service.js');
                    plainLyrics = (await WhisperSyncService.searchHappiLyrics(title, artist)) || undefined;
                } catch (happiErr: any) {
                    console.log(`[LyricsSync] Happi.dev plain lyrics retrieval failed: ${happiErr.message}`);
                }
            }
        }

        // Stage 4: Align plain text lyrics
        if (plainLyrics) {
            if (audioUrl && !audioUrl.includes('youtube.com') && !audioUrl.includes('youtu.be')) {
                try {
                    const { alignWithQuickLrc, isQuickLrcAvailable } = await import('../utils/quicklrc.js');
                    if (isQuickLrcAvailable()) {
                        console.log(`[LyricsSync] Attempting QuickLRC forced alignment for "${title}"`);
                        const lrcResult = await alignWithQuickLrc(audioUrl, plainLyrics);
                        if (lrcResult) {
                            const parsedTokens = this.parseLRC(lrcResult);
                            if (parsedTokens.length > 0) {
                                return { syncedTokens: parsedTokens, rawLrc: lrcResult };
                            }
                        }
                    }
                } catch (qlrcErr: any) {
                    console.log(`[LyricsSync] QuickLRC alignment failed: ${qlrcErr.message}`);
                }
            }

            if (duration && duration > 0) {
                console.log(`[LyricsSync] Triggering background AI Alignment for ${title}`);
                AILyricsService.alignLyrics(plainLyrics, duration)
                    .then(async (aiSynced) => {
                        if (aiSynced && aiSynced.length > 0) {
                            const prisma = (await import('../utils/prisma.js')).prisma;
                            const track = await prisma.track.findFirst({
                                where: { title, artist: { name: artist } }
                            });
                            if (track) {
                                await prisma.track.update({
                                    where: { id: track.id },
                                    data: { synced_lyrics: aiSynced as any }
                                });
                                console.log(`[LyricsSync] Background AI Alignment saved to DB.`);
                            }
                        }
                    })
                    .catch(err => {
                        console.error(`[LyricsSync] Background AI Alignment failed:`, err);
                    });
            }

            console.log(`[LyricsSync] Generating instant mathematical distribution for ${plainLyrics.length} chars`);
            return { 
                syncedTokens: this.generateFallbackAlignment(plainLyrics, duration) 
            };
        }

        return null;
    }

    /**
     * Fallback Handling - distribute timestamps proportionately across song duration.
     */
    private static generateFallbackAlignment(lyrics: string, duration?: number): SyncedLyricLine[] {
        const lines = lyrics
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('['));
        
        if (lines.length === 0) return [];

        const activeDuration = (duration || 180) - 10;
        const interval = activeDuration / lines.length;
        
        let currentTime = 4.0; 
        return lines.map(text => {
            const entry = { time: currentTime, text };
            currentTime += interval;
            return entry;
        });
    }
}
