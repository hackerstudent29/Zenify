import axios from 'axios';
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
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{1,3})\]/;

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;
            const match = timeRegex.exec(line);
            if (match) {
                const mins = parseInt(match[1]);
                const secs = parseInt(match[2]);
                const msStr = match[3];
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
    static async getSyncedLyrics(title: string, artist: string, audioUrl?: string, plainLyrics?: string, duration?: number): Promise<SyncedLyricLine[] | null> {
        try {
            console.log(`[LyricsSync] Attempting LRCLIB for ${title} by ${artist}`);
            const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '').trim();
            const cleanArtist = artist.replace(/\s*feat\.?\s*.*/i, '').trim();

            try {
                // Primary: Exact Match (Fastest)
                const res = await axios.get(
                    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`,
                    { timeout: 5000 }
                );

                if (res.data?.syncedLyrics) {
                    console.log(`[LyricsSync] Synced lyrics found exactly via LRCLIB!`);
                    return this.parseLRC(res.data.syncedLyrics);
                }
            } catch (strictErr: any) {
                console.log(`[LyricsSync] Exact match missed (${strictErr.message}). Attempting fuzzy search...`);
                // Secondary: Fuzzy Search (More resilient)
                const searchRes = await axios.get(
                    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`,
                    { timeout: 5000 }
                );
                
                if (searchRes.data && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                    const bestMatch = searchRes.data.find((track: any) => track.syncedLyrics);
                    if (bestMatch?.syncedLyrics) {
                        console.log(`[LyricsSync] Synced lyrics found via fuzzy search!`);
                        return this.parseLRC(bestMatch.syncedLyrics);
                    }
                }
            }
        } catch (err: any) {
            console.log(`[LyricsSync] LRCLIB synced miss (${err.message}). Proceeding to fallback...`);
        }

        if (plainLyrics) {
            console.log(`[LyricsSync] Generating mathematical distribution for ${plainLyrics.length} chars over duration: ${duration}`);
            return this.generateFallbackAlignment(plainLyrics, duration);
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
