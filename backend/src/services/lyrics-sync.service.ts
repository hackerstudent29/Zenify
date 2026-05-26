import axios from 'axios';
import { AILyricsService } from './ai-lyrics.service';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
     * Primary Function: Attempt LRCLIB first, fallback to mathematical distribution.
     */
    static async getSyncedLyrics(title: string, artist: string, audioUrl?: string, plainLyrics?: string, duration?: number): Promise<{ syncedTokens: SyncedLyricLine[], rawLrc?: string } | null> {
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

        try {
            console.log(`[LyricsSync] Attempting LRCLIB for ${title} by ${artist}`);
            const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '').trim();
            const cleanArtist = artist.replace(/\s*feat\.?\s*.*/i, '').trim();

            try {
                // Primary: Exact Match (Fastest) - 2.5s timeout
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
                // Secondary: Fuzzy Search (More resilient) - 2.5s timeout
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
            console.log(`[LyricsSync] LRCLIB synced miss (${err.message}). Proceeding to fallback...`);
        }

        if (!plainLyrics) {
            try {
                const { WhisperSyncService } = await import('./whisper-sync.service.js');
                const happiLyrics = await WhisperSyncService.searchHappiLyrics(title, artist);
                if (happiLyrics) {
                    plainLyrics = happiLyrics;
                }
            } catch (happiErr: any) {
                console.log(`[LyricsSync] Happi.dev plain lyrics retrieval failed: ${happiErr.message}`);
            }
        }

        if (plainLyrics) {
            // ── QuickLRC forced alignment ──────────────────────────────────
            // Use the QuickLRC API if we have an audioUrl. This gives us acoustically
            // accurate timestamps instead of a mathematical distribution.
            // Budget: 5 songs/month — only called after LRCLIB misses.
            if (audioUrl) {
                try {
                    const { alignWithQuickLrc, isQuickLrcAvailable } = await import('../utils/quicklrc.js');
                    if (isQuickLrcAvailable()) {
                        console.log(`[LyricsSync] Attempting QuickLRC forced alignment for "${title}"`);
                        const lrcResult = await alignWithQuickLrc(audioUrl, plainLyrics);
                        if (lrcResult) {
                            const parsedTokens = this.parseLRC(lrcResult);
                            if (parsedTokens.length > 0) {
                                // Persist this back to DB in background
                                import('../utils/prisma.js').then(async ({ prisma }) => {
                                    const track = await prisma.track.findFirst({
                                        where: { title, artist: { name: artist } },
                                        select: { id: true }
                                    });
                                    if (track) {
                                        await prisma.track.update({
                                            where: { id: track.id },
                                            data: { synced_lyrics: parsedTokens as any, raw_lrc: lrcResult }
                                        });
                                        console.log(`[LyricsSync] QuickLRC result persisted for track: ${track.id}`);
                                    }
                                }).catch(err => console.warn('[LyricsSync] QuickLRC DB persist failed:', err.message));

                                return { syncedTokens: parsedTokens, rawLrc: lrcResult };
                            }
                        }
                    }
                } catch (qlrcErr: any) {
                    console.log(`[LyricsSync] QuickLRC alignment failed: ${qlrcErr.message}`);
                }
            }

            // ── Background AI Alignment (math + AI improvement) ───────────
            // Fast Background AI Alignment: trigger in the background and save to DB
            // while returning the mathematical fallback alignment immediately for instant response.
            if (duration && duration > 0) {
                console.log(`[LyricsSync] Triggering background AI Alignment for ${title}`);
                AILyricsService.alignLyrics(plainLyrics, duration)
                    .then(async (aiSynced) => {
                        if (aiSynced && aiSynced.length > 0) {
                            console.log(`[LyricsSync] Background AI Alignment completed successfully for ${title}. Persisting...`);
                            const prisma = (await import('../utils/prisma.js')).prisma;
                            const track = await prisma.track.findFirst({
                                where: { title, artist: { name: artist } }
                            });
                            if (track) {
                                await prisma.track.update({
                                    where: { id: track.id },
                                    data: {
                                        synced_lyrics: aiSynced as any
                                    }
                                });
                                console.log(`[LyricsSync] Background AI Alignment saved to DB for track: ${track.id}`);
                            }
                        }
                    })
                    .catch(err => {
                        console.error(`[LyricsSync] Background AI Alignment failed:`, err);
                    });
            }

            console.log(`[LyricsSync] Generating instant mathematical distribution for ${plainLyrics.length} chars over duration: ${duration}`);
            return { 
                syncedTokens: this.generateFallbackAlignment(plainLyrics, duration) 
            };
        }

        return null;
    }

    /**
     * Part 6: Fallback Handling - distribute timestamps proportionately across song duration.
     * Use a 2-second offset at start and end to avoid cutting off.
     */
    private static generateFallbackAlignment(lyrics: string, duration?: number): SyncedLyricLine[] {
        const lines = lyrics
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('['));
        
        if (lines.length === 0) return [];

        // If we have no duration, we assume a standard 3-minute average
        const activeDuration = (duration || 180) - 10; // 10s buffer
        const interval = activeDuration / lines.length;
        
        let currentTime = 4.0; 
        return lines.map(text => {
            const entry = { time: currentTime, text };
            currentTime += interval;
            return entry;
        });
    }
}
