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
     * Aggressively scrubs unwanted text like "Lyrics for X", "Submit Corrections", etc.
     */
    static cleanLyricsText(lyrics: string): string {
        if (!lyrics) return '';
        // Normalize line breaks
        let clean = lyrics.replace(/\r\n/g, '\n');
        
        // Strip Genius contributor prefix (e.g. "227 ContributorsTranslations... [Verse 1]")
        if (/^\d+\s+Contributors/i.test(clean)) {
            if (clean.includes('[')) {
                clean = clean.replace(/^\d+\s+Contributors.*?(?=\[)/gis, '');
            } else {
                clean = clean.replace(/^\d+\s+Contributors.*?\n/is, '');
            }
        }
        
        // Remove trailing "Submit Corrections"
        clean = clean.replace(/Submit Corrections.*/gis, '');
        
        // Remove Musixmatch commercial text
        clean = clean.replace(/\*{7}.*?\*{7}/gs, '');
        
        // Remove "Lyrics for [Song] by [Artist]" header
        clean = clean.replace(/^.*Lyrics for.*?by.*?\n+/i, '');
        
        // Remove "Paroles de la chanson" header
        clean = clean.replace(/^.*Paroles de la chanson.*?\n+/i, '');
        
        // Remove "Writer(s): " footers
        clean = clean.replace(/Writer\(s\):.*/gis, '');

        // Remove AZLyrics usage warnings
        clean = clean.replace(/<!-- Usage of azlyrics.*?-->/gis, '');

        // Remove Genius specific "Embed" at the end
        clean = clean.replace(/\d*Embed$/i, '');
        
        // Remove "You might also like"
        clean = clean.replace(/You might also like/gi, '');

        return clean.trim();
    }

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
                
                let text = line.replace(timeRegex, '').trim();
                // Apply our aggressive text cleaner to remove "Submit Corrections" etc
                text = this.cleanLyricsText(text);
                if (text && !text.match(/^\[.*\]$/)) {
                    result.push({ time: timeInSeconds, text });
                }
            }
        }
        return result.sort((a, b) => a.time - b.time);
    }

    /**
     * Parse WebVTT (.vtt) format into structured array.
     * Handles YouTube auto-generated captions which use overlapping rolling windows.
     */
    static parseVTT(vttText: string): SyncedLyricLine[] {
        const lines = vttText.split(/\r?\n/);
        const rawCues: Array<{ start: number; end: number; text: string }> = [];
        const timeRegex = /(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

        let currentStart: number | null = null;
        let currentEnd: number | null = null;
        let currentTextLines: string[] = [];

        const parseTime = (h: string | undefined, m: string, s: string, ms: string) => {
            return (h ? parseInt(h) : 0) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:') || line.startsWith('NOTE')) continue;

            const match = timeRegex.exec(line);
            if (match) {
                // Save previous cue
                if (currentStart !== null && currentEnd !== null && currentTextLines.length > 0) {
                    const text = currentTextLines.join(' ').trim();
                    if (text) rawCues.push({ start: currentStart, end: currentEnd, text });
                }
                currentStart = parseTime(match[1], match[2], match[3], match[4]);
                currentEnd = parseTime(match[5], match[6], match[7], match[8]);
                currentTextLines = [];
            } else if (currentStart !== null) {
                // Strip all HTML tags (including positioning like <00:00:01.000><c> etc.)
                const cleanLine = line
                    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '') // timestamp tags
                    .replace(/<[^>]+>/g, '')                      // all other HTML tags
                    .trim();
                if (cleanLine) {
                    currentTextLines.push(cleanLine);
                }
            }
        }
        // Push last cue
        if (currentStart !== null && currentEnd !== null && currentTextLines.length > 0) {
            const text = currentTextLines.join(' ').trim();
            if (text) rawCues.push({ start: currentStart, end: currentEnd, text });
        }

        // Sort cues by start time
        rawCues.sort((a, b) => a.start - b.start);

        // YouTube auto-captions: deduplicate overlapping/rolling cues
        // Each cue typically shows the last N words with the same end text
        // We only keep cues that add NEW content not seen in the previous cue
        const deduped: Array<{ time: number; text: string }> = [];
        let prevText = '';

        for (const cue of rawCues) {
            const cueText = cue.text.trim();

            // Filter out pure instrumental/noise placeholders
            if (/^[.\s\u266a\u266b\u2669\u266c♪♫♩♬]+$/.test(cueText)) continue;
            if (/^\[.*\]$/.test(cueText)) continue;
            if (/^\(.*\)$/.test(cueText)) continue;

            // Skip if this cue text ends the same way as the last kept text
            // (rolling window duplicate)
            const normalizedCue = cueText.toLowerCase().replace(/[^a-z0-9\u0b80-\u0bff]/g, '');
            const normalizedPrev = prevText.toLowerCase().replace(/[^a-z0-9\u0b80-\u0bff]/g, '');

            if (normalizedPrev && normalizedCue === normalizedPrev) continue;

            // Check if this is just an overlap (prev text contains the new text at the end)
            if (normalizedPrev.endsWith(normalizedCue) && normalizedCue.length < normalizedPrev.length * 0.8) continue;

            deduped.push({ time: cue.start, text: cueText });
            prevText = cueText;
        }

        // Further dedup: remove entries where the text is identical and timestamps are within 2s
        const result: SyncedLyricLine[] = [];
        for (let i = 0; i < deduped.length; i++) {
            const curr = deduped[i];
            if (result.length > 0) {
                const last = result[result.length - 1];
                const normalizedCurr = curr.text.toLowerCase().replace(/\s+/g, ' ');
                const normalizedLast = last.text.toLowerCase().replace(/\s+/g, ' ');
                // Skip if same (or nearly same) text within 2 seconds
                if (normalizedCurr === normalizedLast && (curr.time - last.time) < 2) continue;
            }
            result.push({ time: curr.time, text: curr.text });
        }

        return result;
    }

    /**
     * Download and extract synced lyrics from YouTube video subtitles.
     */
    static async fetchYouTubeSubtitles(title: string, artist: string, videoUrl?: string, duration?: number, songLang: 'english' | 'tamil' | 'other' = 'english'): Promise<{ syncedTokens: SyncedLyricLine[], rawLrc?: string } | null> {
        try {
            const { ExternalMetadataService } = await import('./external-metadata.service.js');
            let finalUrl = videoUrl;

            const isYt = finalUrl && (finalUrl.includes('youtube.com') || finalUrl.includes('youtu.be'));
            if (!isYt) {
                console.log(`[LyricsSync/YT] Searching YouTube for subtitles match: "${artist} - ${title} lyrics"`);
                try {
                    const searchRes = await ExternalMetadataService.execYtDlp(
                        '--dump-json --flat-playlist --no-warnings',
                        `ytsearch5:${artist} ${title} lyrics`
                    );
                    const lines = searchRes.trim().split('\n').filter(l => l.trim());
                    let bestVideo = null;
                    for (const line of lines) {
                        try {
                            const video = JSON.parse(line);
                            if (video && video.id) {
                                if (duration && Math.abs(video.duration - duration) >= 10) {
                                    console.log(`[LyricsSync/YT] Skipping candidate "${video.title}" due to duration difference: video ${video.duration}s vs track ${duration}s`);
                                    continue;
                                }
                                bestVideo = video;
                                break;
                            }
                        } catch (e) {}
                    }
                    if (!bestVideo && lines.length > 0) {
                        try {
                            const firstVideo = JSON.parse(lines[0]);
                            if (firstVideo && firstVideo.id && !duration) {
                                bestVideo = firstVideo;
                            }
                        } catch {}
                    }
                    if (bestVideo) {
                        finalUrl = `https://www.youtube.com/watch?v=${bestVideo.id}`;
                        console.log(`[LyricsSync/YT] Found lyrics video: ${finalUrl}`);
                    }
                } catch (searchErr: any) {
                    console.warn(`[LyricsSync/YT] Search failed:`, searchErr.message);
                }
            } else if (finalUrl && duration) {
                try {
                    const infoRes = await ExternalMetadataService.execYtDlp(
                        '--dump-json --no-playlist --no-warnings',
                        finalUrl
                    );
                    const video = JSON.parse(infoRes);
                    if (video && video.duration && Math.abs(video.duration - duration) >= 10) {
                        console.log(`[LyricsSync/YT] Rejected direct YouTube video due to duration mismatch: video ${video.duration}s vs track ${duration}s`);
                        return null;
                    }
                } catch (e: any) {
                    console.warn(`[LyricsSync/YT] Could not verify direct video duration:`, e.message);
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
                '--write-subs --write-auto-subs --skip-download --ignore-errors --sub-format vtt --sub-langs en,ta,hi,ml,te,en-orig,ta-orig',
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
                    if (songLang === 'tamil') {
                        // For Tamil songs, prefer Tamil subtitles, then English
                        if (low.includes('.ta.vtt') || low.includes('.ta-orig.vtt')) return 1;
                        if (low.includes('.en.vtt') || low.includes('.en-orig.vtt')) return 2;
                        if (low.includes('.hi.vtt')) return 3;
                    } else {
                        // For English (and other) songs, always prefer English subtitles
                        if (low.includes('.en.vtt') || low.includes('.en-orig.vtt')) return 1;
                        if (low.includes('.en-us.vtt') || low.includes('.en-gb.vtt')) return 2;
                    }
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

                if (rawLrc && !this.isLyricsLanguageAcceptable(rawLrc, songLang)) {
                    console.log(`[LyricsSync/YT] Rejected subtitles due to language mismatch: songLang is ${songLang}`);
                    return null;
                }

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
    static async scrapeGeniusLyrics(title: string, artist: string, songLang: 'english' | 'tamil' | 'other' = 'english'): Promise<string | null> {
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

            // If the song is English or Tamil, strictly filter out translations
            const bestHit = hits.find((h: any) => {
                const titleLower = h.result.title.toLowerCase();
                const pathLower = h.result.path.toLowerCase();
                const isTranslation = titleLower.includes('translation') || 
                                       titleLower.includes('çeviri') || 
                                       titleLower.includes('traducc') || 
                                       titleLower.includes('traduz') || 
                                       titleLower.includes('traduc') || 
                                       titleLower.includes('türkçe') || 
                                       titleLower.includes('turkish') || 
                                       titleLower.includes('german') || 
                                       titleLower.includes('spanish') || 
                                       titleLower.includes('french') || 
                                       titleLower.includes('russian') || 
                                       titleLower.includes('portuguese') || 
                                       pathLower.includes('translation') || 
                                       pathLower.includes('ceviri') || 
                                       pathLower.includes('tradu');
                return (songLang === 'english' || songLang === 'tamil') ? !isTranslation : true;
            })?.result || hits[0].result;

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
                if (!this.isLyricsLanguageAcceptable(cleaned, songLang)) {
                    console.log(`[LyricsSync/Genius] Rejected Genius lyrics due to language mismatch: songLang is ${songLang}`);
                    return null;
                }
                console.log(`[LyricsSync/Genius] Scraped lyrics (${cleaned.length} chars).`);
                return cleaned;
            }
        } catch (e: any) {
            console.warn(`[LyricsSync/Genius] Scraping failed:`, e.message);
        }
        return null;
    }

    /**
     * Helper to verify if the lyrics language matches our acceptable set for the song's language.
     */
    static isLyricsLanguageAcceptable(rawLrc: string, songLang: 'english' | 'tamil' | 'other'): boolean {
        const textLang = this.detectLyricsTextLanguage(rawLrc);
        if (songLang === 'english') {
            return textLang === 'english' || textLang === 'other';
        }
        if (songLang === 'tamil') {
            // Tamil songs should only accept Tamil script or Romanized Tamil ('other').
            // Reject 'english' to prevent accepting English translations.
            return textLang === 'tamil' || textLang === 'other';
        }
        return true;
    }

    /**
     * Primary Function: Attempt LRCLIB first, YouTube subtitles second, fallback to Genius / Happi + AI alignment, and automatically translate non-English lyrics to English.
     */
    static async getSyncedLyrics(
        title: string, 
        artist: string, 
        audioUrl?: string, 
        plainLyrics?: string, 
        duration?: number,
        youtubeUrl?: string
    ): Promise<{ syncedTokens: SyncedLyricLine[], rawLrc?: string, source?: string } | null> {
        // Detect song language
        const songLang = await this.detectSongLanguage(title, artist, plainLyrics);
        console.log(`[LyricsSync] Song language classified as: ${songLang} for "${title}"`);

        const result = await this.getSyncedLyricsInternal(title, artist, audioUrl, plainLyrics, duration, youtubeUrl, songLang);
        
        return result;
    }

    private static async getSyncedLyricsInternal(
        title: string, 
        artist: string, 
        audioUrl?: string, 
        plainLyrics?: string, 
        duration?: number,
        youtubeUrl?: string,
        songLang: 'english' | 'tamil' | 'other' = 'english'
    ): Promise<{ syncedTokens: SyncedLyricLine[], rawLrc?: string, source?: string } | null> {
        // Priority: Check if plainLyrics already contains LRC format (e.g., uploaded or seeded)
        if (plainLyrics && /\[\d{2}:\d{2}/.test(plainLyrics)) {
            console.log(`[LyricsSync] Pre-formatted LRC detected for "${title}". Direct parsing applied.`);
            const parsed = this.parseLRC(plainLyrics);
            if (parsed && parsed.length > 0) {
                return { 
                    syncedTokens: parsed, 
                    rawLrc: plainLyrics,
                    source: 'LOCAL_LRC'
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
                    const lrclibDuration = res.data.duration;
                    
                    // Always enforce strict duration matching to prevent massive desyncs between Music Videos and Official Lyrics
                    if (duration && lrclibDuration && Math.abs(lrclibDuration - duration) >= 3) {
                        console.log(`[LyricsSync] Rejected LRCLIB exact match due to massive duration mismatch: Official Lyrics (${lrclibDuration}s) vs Imported Audio (${duration}s)`);
                    } else if (!this.isLyricsLanguageAcceptable(res.data.syncedLyrics, songLang)) {
                        console.log(`[LyricsSync] Rejected LRCLIB exact match due to language mismatch: songLang is ${songLang}`);
                    } else {
                        console.log(`[LyricsSync] Synced lyrics found exactly via LRCLIB!`);
                        return { 
                            syncedTokens: this.parseLRC(res.data.syncedLyrics), 
                            rawLrc: res.data.syncedLyrics,
                            source: 'LRCLIB'
                        };
                    }
                }
            } catch (strictErr: any) {
                console.log(`[LyricsSync] Exact match missed (${strictErr.message}). Attempting fuzzy search...`);
                const searchRes = await axios.get(
                    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`,
                    { timeout: 2500 }
                );
                
                if (searchRes.data && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                    const bestMatch = searchRes.data.find((track: any) => {
                        if (!track.syncedLyrics) return false;
                        // Strict tolerance (3 seconds) to prevent completely out-of-sync lyrics when the audio is a Music Video
                        if (duration && track.duration && Math.abs(track.duration - duration) >= 3) return false;
                        if (!this.isLyricsLanguageAcceptable(track.syncedLyrics, songLang)) return false;
                        return true;
                    });
                    if (bestMatch?.syncedLyrics) {
                        console.log(`[LyricsSync] Synced lyrics found via fuzzy search!`);
                        return { 
                            syncedTokens: this.parseLRC(bestMatch.syncedLyrics), 
                            rawLrc: bestMatch.syncedLyrics,
                            source: 'LRCLIB'
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
        const ytSynced = await this.fetchYouTubeSubtitles(title, artist, targetYtUrl, duration, songLang);
        if (ytSynced) {
            return {
                ...ytSynced,
                source: 'YOUTUBE'
            };
        }

        // Stage 3: Fetch plain text lyrics as fallback
        if (!plainLyrics) {
            plainLyrics = (await this.scrapeGeniusLyrics(title, artist, songLang)) || undefined;
            
            if (!plainLyrics) {
                try {
                    const { WhisperSyncService } = await import('./whisper-sync.service.js');
                    const happiLyrics = (await WhisperSyncService.searchHappiLyrics(title, artist)) || undefined;
                    if (happiLyrics && this.isLyricsLanguageAcceptable(happiLyrics, songLang)) {
                        plainLyrics = happiLyrics;
                    }
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
                                return { syncedTokens: parsedTokens, rawLrc: lrcResult, source: 'QUICKLRC' };
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
                                    data: { 
                                        synced_lyrics: aiSynced as any,
                                        sync_source: 'AI_ALIGNMENT'
                                    }
                                });
                                console.log(`[LyricsSync] Background AI Alignment saved to DB.`);
                            }
                        }
                    })
                    .catch(err => {
                        console.error(`[LyricsSync] Background AI Alignment failed:`, err);
                    });
            }

            if (audioUrl) {
                console.log(`[LyricsSync] Attempting local Python alignment fallback...`);
                const localAligned = await this.alignWithLocalPython(audioUrl, plainLyrics, songLang);
                if (localAligned) {
                    return {
                        ...localAligned,
                        source: 'LOCAL_ALIGNER'
                    };
                }
            }

            console.log(`[LyricsSync] Generating instant mathematical distribution for ${plainLyrics.length} chars`);
            return { 
                syncedTokens: this.generateFallbackAlignment(plainLyrics, duration),
                source: 'FALLBACK'
            };
        }

        return null;
    }

    /**
     * Fallback Handling - distribute timestamps proportionately across song duration.
     */
    private static generateFallbackAlignment(lyrics: string, duration?: number): SyncedLyricLine[] {
        const cleanedLyrics = this.cleanLyricsText(lyrics);
        const lines = cleanedLyrics
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

    /**
     * Detects the language of a song based on title, artist, and optionally the lyrics text.
     */
    static async detectSongLanguage(title: string, artistName: string, lyricsText?: string): Promise<'english' | 'tamil' | 'other'> {
        const lowTitle = title.toLowerCase();
        const lowArtist = artistName.toLowerCase();
        
        // Fast heuristics for Tamil music directors / singers / bands
        const tamilKeywords = [
            'anirudh', 'ar rahman', 'rahman', 'ilayaraja', 'yuvan', 'sid sriram', 'harris jayaraj', 
            'g.v. prakash', 'gv prakash', 'santhosh narayanan', 'vijay antony', 'dhibu ninan thomas', 
            'imman', 'deva', 'hiphop tamizha', 'vidyasagar', 'kartik', 'spb', 's. p. balasubrahmanyam', 
            'chinmayi', 'shreya ghoshal', 'hariharan', 'unni krishnan', 'srinivas', 'shweta mohan',
            'pradeep kumar', 'karthik', 'dhanush', 'g. v. prakash', 'sathyaprakash', 'sidharth'
        ];
        const isTamilArtist = tamilKeywords.some(tk => lowArtist.includes(tk));
        
        if (isTamilArtist) {
            console.log(`[LyricsSync/Language] Detected Tamil language by artist heuristics for "${title}"`);
            return 'tamil';
        }

        // If lyrics text contains Tamil script, it is Tamil
        if (lyricsText && /[\u0b80-\u0bff]/.test(lyricsText)) {
            console.log(`[LyricsSync/Language] Detected Tamil language by Tamil script characters`);
            return 'tamil';
        }

        // Fallback to LLM query for smart detection
        try {
            const prompt = `Task: Classify the language of the song "${title}" by artist "${artistName}".
            Return exactly one of the following words in lowercase: "english", "tamil", or "other". Do not write anything else.`;
            const response = await AILyricsService.queryLLM(prompt);
            const cleanRes = response?.trim().toLowerCase();
            if (cleanRes === 'english' || cleanRes === 'tamil' || cleanRes === 'other') {
                console.log(`[LyricsSync/Language] LLM classified "${title}" as: ${cleanRes}`);
                return cleanRes as any;
            }
        } catch (err: any) {
            console.warn(`[LyricsSync/Language] LLM classification failed:`, err.message);
        }

        return 'english'; // Default fallback
    }

    /**
     * Helper to detect the language of the lyrics text itself
     */
    static detectLyricsTextLanguage(text: string): 'english' | 'tamil' | 'turkish' | 'spanish' | 'french' | 'other' {
        if (!text) return 'other';
        
        // Tamil unicode characters check
        if (/[\u0b80-\u0bff]/.test(text)) {
            return 'tamil';
        }
        
        const lowText = text.toLowerCase();
        
        // Turkish specific words/particles
        const turkishIndicators = [' ve ', ' bir ', ' için ', ' değil ', ' daha ', ' ama ', ' çok ', ' ç ', ' ş ', ' ğ ', ' ı ', ' ö ', ' ü '];
        let trCount = 0;
        for (const ind of turkishIndicators) {
            if (lowText.includes(ind)) trCount++;
        }
        if (trCount >= 3) return 'turkish';

        // Spanish specific words/particles
        const spanishIndicators = [' que ', ' los ', ' con ', ' para ', ' por ', ' una ', ' del ', ' como '];
        let esCount = 0;
        for (const ind of spanishIndicators) {
            if (lowText.includes(ind)) esCount++;
        }
        if (esCount >= 3) return 'spanish';

        // French specific words/particles
        const frenchIndicators = [' que ', ' les ', ' avec ', ' pour ', ' par ', ' une ', ' des ', ' comme ', ' dans '];
        let frCount = 0;
        for (const ind of frenchIndicators) {
            if (lowText.includes(ind)) frCount++;
        }
        if (frCount >= 3) return 'french';

        // English specific words/particles
        const englishIndicators = [' the ', ' and ', ' you ', ' that ', ' was ', ' for ', ' on ', ' are ', ' with ', ' to '];
        let enCount = 0;
        for (const ind of englishIndicators) {
            if (lowText.includes(ind)) enCount++;
        }
        if (enCount >= 2) return 'english';

        return 'other';
    }

    /**
     * Call the local Python forced aligner script.
     */
    private static async alignWithLocalPython(
        audioUrl: string,
        plainLyrics: string,
        songLang: 'english' | 'tamil' | 'other'
    ): Promise<{ syncedTokens: SyncedLyricLine[], rawLrc?: string } | null> {
        const tempDir = os.tmpdir();
        const fileId = `local-align-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const tempAudioPath = path.join(tempDir, `${fileId}.mp3`);
        const tempLyricsPath = path.join(tempDir, `${fileId}.txt`);

        try {
            console.log(`[LyricsSync/Local] Downloading audio for local alignment: ${audioUrl.slice(0, 80)}...`);
            const response = await axios({
                method: 'get',
                url: audioUrl,
                responseType: 'stream',
                timeout: 30000,
            });

            const writer = fs.createWriteStream(tempAudioPath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`[LyricsSync/Local] Writing lyrics to temporary file...`);
            fs.writeFileSync(tempLyricsPath, plainLyrics, 'utf-8');

            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execPromise = promisify(exec);

            const alignerPath = path.join(process.cwd(), 'aligner.py');
            const langCode = songLang === 'tamil' ? 'ta-IN' : 'en-US';

            console.log(`[LyricsSync/Local] Spawning Python aligner: python "${alignerPath}" "${tempAudioPath}" "${tempLyricsPath}" "${langCode}"`);
            const { stdout } = await execPromise(`python "${alignerPath}" "${tempAudioPath}" "${tempLyricsPath}" "${langCode}"`);

            const alignedData = JSON.parse(stdout);
            if (alignedData && Array.isArray(alignedData) && alignedData.length > 0) {
                if (alignedData[0].error) {
                    console.warn(`[LyricsSync/Local] Aligner script returned error:`, alignedData[0].error);
                    return null;
                }

                const syncedTokens: SyncedLyricLine[] = alignedData.map((item: any) => ({
                    time: Number(item.time) || 0,
                    text: String(item.text).trim()
                }));

                const rawLrc = syncedTokens.map(line => {
                    const m = Math.floor(line.time / 60);
                    const s = Math.floor(line.time % 60);
                    const ms = Math.floor((line.time % 1) * 100);
                    return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}] ${line.text}`;
                }).join('\n');

                console.log(`[LyricsSync/Local] Successfully aligned ${syncedTokens.length} lines locally!`);
                return { syncedTokens, rawLrc };
            }
        } catch (err: any) {
            console.warn(`[LyricsSync/Local] Local alignment failed:`, err.message);
        } finally {
            // Cleanup temp files
            try {
                if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
                if (fs.existsSync(tempLyricsPath)) fs.unlinkSync(tempLyricsPath);
            } catch {}
        }
        return null;
    }
}
