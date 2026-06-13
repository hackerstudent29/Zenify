/**
 * Whisper + Demucs Lyrics Sync Service
 *
 * Automated pipeline:
 * 1. Download audio from Cloudinary/R2 URL
 * 2. Separate vocals using Demucs (via Replicate)
 * 3. Transcribe vocals using Whisper (via Replicate)
 * 4. Align Whisper timestamps to provided lyrics using fuzzy matching
 * 5. Save synced_lyrics to database
 */

import { prisma } from '../utils/prisma.js';
import { runDemucs, runWhisperX, isReplicateAvailable, WhisperXSegment } from '../utils/replicate.js';
import { config } from '../config/env.js';
import axios from 'axios';

interface AlignedLyricLine {
    time: number;
    text: string;
}

export class WhisperSyncService {
    /**
     * Main entry point: sync a track's lyrics using the Whisper+Demucs pipeline.
     */
    static async syncTrack(trackId: string): Promise<AlignedLyricLine[] | null> {
        console.log(`[WhisperSync] Starting Whisper+Demucs sync pipeline for track: ${trackId}`);

        const track = await prisma.track.findUnique({
            where: { id: trackId },
            select: {
                id: true,
                title: true,
                audioUrl: true,
                lyrics: true,
                synced_lyrics: true,
                duration: true,
                language: true,
                artist: { select: { name: true } },
            },
        });

        if (!track) {
            console.error(`[WhisperSync] Track not found: ${trackId}`);
            return null;
        }

        if (!track.audioUrl) {
            console.error(`[WhisperSync] Track has no audioUrl: ${track.title}`);
            return null;
        }

        // If synced lyrics already exist and look good (>10 entries), skip
        if (track.synced_lyrics && Array.isArray(track.synced_lyrics) && track.synced_lyrics.length > 10) {
            console.log(`[WhisperSync] Track already has ${(track.synced_lyrics as any[]).length} synced lyrics. Skipping.`);
            return track.synced_lyrics as unknown as AlignedLyricLine[];
        }

        const lyricsText = track.lyrics;
        if (!lyricsText) {
            console.warn(`[WhisperSync] Track has no plain lyrics to align against. Will use Whisper transcription directly.`);
        }

        try {
            let whisperSegments: WhisperXSegment[];
            let detectedLanguage = 'unknown';

            if (isReplicateAvailable()) {
                // ── Full Pipeline: Demucs → WhisperX ───────────────────
                console.log(`[WhisperSync] Running full Demucs → WhisperX pipeline for "${track.title}"`);

                // Step 1: Vocal separation with Demucs
                let vocalsUrl: string;
                try {
                    vocalsUrl = await runDemucs(track.audioUrl);
                    console.log(`[WhisperSync] Demucs vocals extracted: ${vocalsUrl.slice(0, 80)}...`);
                } catch (demucsErr: any) {
                    console.warn(`[WhisperSync] Demucs failed (${demucsErr.message}). Falling back to raw audio for WhisperX.`);
                    vocalsUrl = track.audioUrl;
                }

                // Step 2: WhisperX transcription on vocals
                let whisperxLanguage: string | undefined = undefined;
                if (track.language === 'english') {
                    whisperxLanguage = 'en';
                } else if (track.language === 'tamil') {
                    whisperxLanguage = 'ta';
                }

                const whisperResult = await runWhisperX(vocalsUrl, whisperxLanguage);
                whisperSegments = whisperResult.segments;
                detectedLanguage = whisperResult.detected_language;
                console.log(`[WhisperSync] WhisperX transcription: ${whisperSegments.length} segments, language: ${detectedLanguage}`);
            } else {
                console.warn(`[WhisperSync] Replicate not configured. Cannot run WhisperX+Demucs pipeline.`);
                return null;
            }

            if (!whisperSegments || whisperSegments.length === 0) {
                console.error(`[WhisperSync] WhisperX returned no segments for "${track.title}"`);
                return null;
            }

            // Step 3: Align WhisperX segments to provided lyrics
            let aligned: AlignedLyricLine[];

            if (lyricsText) {
                const lyricsLines = lyricsText
                    .split('\n')
                    .map(l => l.trim())
                    .filter(l => l.length > 0 && !l.startsWith('['));

                aligned = this.alignWhisperXToLyrics(whisperSegments, lyricsLines, track.duration || 180);
                console.log(`[WhisperSync] Aligned ${aligned.length} lyrics lines using fuzzy matching and word-level timestamps.`);
            } else {
                // No lyrics provided — use WhisperX transcription directly
                aligned = whisperSegments.map(seg => ({
                    time: Math.round(seg.start * 10) / 10,
                    text: seg.text,
                }));
                console.log(`[WhisperSync] Using ${aligned.length} WhisperX segments directly (no lyrics to align).`);
            }

            // Step 4: Save to database
            await prisma.track.update({
                where: { id: trackId },
                data: {
                    synced_lyrics: aligned as any,
                    sync_source: 'WHISPERX',
                    // If no lyrics existed, save Whisper's transcription
                    ...(lyricsText ? {} : {
                        lyrics: whisperSegments.map(s => s.text).join('\n')
                    }),
                },
            });

            console.log(`[WhisperSync] ✅ Successfully synced "${track.title}" with ${aligned.length} timestamped lines.`);
            return aligned;

        } catch (err: any) {
            console.error(`[WhisperSync] Pipeline failed for "${track.title}":`, err.message);
            return null;
        }
    }

    /**
     * Core alignment algorithm: match WhisperX's timestamped segments to provided lyrics lines.
     * Use word-level timestamps for precise start times of lines when available.
     */
    static alignWhisperXToLyrics(
        segments: WhisperXSegment[],
        lyricsLines: string[],
        duration: number
    ): AlignedLyricLine[] {
        if (segments.length === 0 || lyricsLines.length === 0) {
            return [];
        }

        const aligned: AlignedLyricLine[] = [];
        let segmentCursor = 0;

        for (let i = 0; i < lyricsLines.length; i++) {
            const lyricLine = lyricsLines[i];
            const cleanLyric = this.normalizeText(lyricLine);

            let bestMatch = -1;
            let bestScore = 0;
            const searchWindow = Math.min(segments.length, segmentCursor + 15); // Look ahead max 15 segments

            for (let j = segmentCursor; j < searchWindow; j++) {
                const cleanSegment = this.normalizeText(segments[j].text);
                const score = this.textSimilarity(cleanLyric, cleanSegment);

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = j;
                }
            }

            if (bestScore >= 0.3 && bestMatch >= 0) {
                // Good match found - get the precise start time using word timestamps if available
                const startTime = this.getPreciseStartTime(segments[bestMatch], lyricLine);
                aligned.push({
                    time: Math.round(startTime * 10) / 10,
                    text: lyricLine,
                });
                segmentCursor = bestMatch + 1;
            } else {
                // No good match — interpolate timestamp
                const lastTime = aligned.length > 0 ? aligned[aligned.length - 1].time : 0;
                const remainingLines = lyricsLines.length - i;

                // Find next good anchor point
                let nextAnchorTime = duration - 5;
                for (let k = i + 1; k < lyricsLines.length && k < i + 10; k++) {
                    const futureClean = this.normalizeText(lyricsLines[k]);
                    for (let j = segmentCursor; j < Math.min(segments.length, segmentCursor + 20); j++) {
                        const futureSegClean = this.normalizeText(segments[j].text);
                        if (this.textSimilarity(futureClean, futureSegClean) >= 0.4) {
                            nextAnchorTime = segments[j].start;
                            break;
                        }
                    }
                    if (nextAnchorTime < duration - 5) break;
                }

                const gap = nextAnchorTime - lastTime;
                const interval = gap / Math.max(1, remainingLines);
                aligned.push({
                    time: Math.round((lastTime + interval) * 10) / 10,
                    text: lyricLine,
                });
            }
        }

        return aligned;
    }

    /**
     * Get precise start time of the lyric line using WhisperX word-level timestamps.
     */
    private static getPreciseStartTime(segment: WhisperXSegment, lyricLine: string): number {
        if (!segment.words || segment.words.length === 0) {
            return segment.start;
        }

        const lyricWords = this.normalizeText(lyricLine).split(' ').filter(w => w.length > 0);
        if (lyricWords.length === 0) {
            return segment.start;
        }

        // Try to match the first few words of the lyric line in the segment's words
        const searchWords = lyricWords.slice(0, 3);
        for (const searchWord of searchWords) {
            const matchedWord = segment.words.find(w => {
                const normalizedW = this.normalizeText(w.word);
                return normalizedW === searchWord || normalizedW.includes(searchWord) || searchWord.includes(normalizedW);
            });
            if (matchedWord && typeof matchedWord.start === 'number') {
                return matchedWord.start;
            }
        }

        // Fallback to the first word in the segment that has a valid timestamp
        const firstVal = segment.words.find(w => typeof w.start === 'number');
        return firstVal ? firstVal.start : segment.start;
    }

    /**
     * Normalize text for comparison: lowercase, remove punctuation,
     * strip common prefixes like "Male :", collapse whitespace.
     */
    private static normalizeText(text: string): string {
        return text
            .toLowerCase()
            .replace(/^(male|female|chorus)\s*:\s*/i, '')
            .replace(/[^\p{L}\p{N}\s]/gu, '') // Keep letters and numbers (Unicode-aware)
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Compute text similarity using bigram overlap (Dice coefficient).
     * Works for any script (Tamil, English, etc.) and is fast.
     * Returns 0-1, where 1 = identical.
     */
    private static textSimilarity(a: string, b: string): number {
        if (!a || !b) return 0;
        if (a === b) return 1;

        const bigramsA = this.getBigrams(a);
        const bigramsB = this.getBigrams(b);

        if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
        if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

        let intersectionCount = 0;
        for (const bigram of bigramsA) {
            if (bigramsB.has(bigram)) {
                intersectionCount++;
            }
        }

        return (2 * intersectionCount) / (bigramsA.size + bigramsB.size);
    }

    /**
     * Extract character bigrams from text.
     */
    private static getBigrams(text: string): Set<string> {
        const bigrams = new Set<string>();
        for (let i = 0; i < text.length - 1; i++) {
            bigrams.add(text.slice(i, i + 2));
        }
        return bigrams;
    }

    /**
     * Try fetching lyrics from Happi.dev Lyrics Search API.
     * Returns plain lyrics text or null.
     */
    static async searchHappiLyrics(title: string, artist: string): Promise<string | null> {
        const apiKey = config.HAPPI_API_KEY;
        if (!apiKey) {
            console.log('[WhisperSync/Happi] HAPPI_API_KEY not configured.');
            return null;
        }

        try {
            console.log(`[WhisperSync/Happi] Searching lyrics for "${title}" by ${artist}...`);
            const searchRes = await axios.get('https://api.happi.dev/v1/music', {
                params: {
                    q: `${title} ${artist}`,
                    limit: 5,
                    type: 'track',
                },
                headers: {
                    'x-happi-key': apiKey,
                },
                timeout: 5000,
            });

            const tracks = searchRes.data?.result;
            if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
                console.log('[WhisperSync/Happi] No tracks found.');
                return null;
            }

            // Find best match
            const bestTrack = tracks.find((t: any) =>
                t.track?.toLowerCase().includes(title.toLowerCase()) ||
                t.artist?.toLowerCase().includes(artist.toLowerCase())
            ) || tracks[0];

            if (!bestTrack?.api_lyrics) {
                console.log('[WhisperSync/Happi] No lyrics API URL in results.');
                return null;
            }

            // Fetch actual lyrics
            const lyricsRes = await axios.get(bestTrack.api_lyrics, {
                headers: { 'x-happi-key': apiKey },
                timeout: 5000,
            });

            const lyricsText = lyricsRes.data?.result?.lyrics;
            if (lyricsText) {
                console.log(`[WhisperSync/Happi] ✅ Found lyrics for "${title}" (${lyricsText.length} chars).`);
                return lyricsText;
            }

            console.log('[WhisperSync/Happi] Lyrics response empty.');
            return null;
        } catch (err: any) {
            console.warn(`[WhisperSync/Happi] Search failed: ${err.message}`);
            return null;
        }
    }
}
