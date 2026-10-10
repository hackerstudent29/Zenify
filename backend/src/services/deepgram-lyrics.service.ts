import axios from 'axios';
import fs from 'fs';
import { config } from '../config/env.js';
import { prisma } from '../utils/prisma.js';

export interface DeepgramWord {
    word: string;
    start: number;
    end: number;
    confidence: number;
    punctuated_word?: string;
}

export interface DeepgramUtterance {
    start: number;
    end: number;
    confidence: number;
    transcript: string;
    words: DeepgramWord[];
}

export interface SyncedWord {
    word: string;
    time: number; // in seconds
    endTime?: number;
}

export interface SyncedLyricLine {
    time: number; // in seconds
    text: string;
    endTime?: number;
    type?: 'verse' | 'chorus' | 'instrumental' | 'bridge';
    words?: SyncedWord[];
}

export interface DeepgramLyricsResult {
    plainLyrics: string;
    syncedTokens: SyncedLyricLine[];
    rawLrc: string;
    source: 'DEEPGRAM_STT' | 'DEEPGRAM_ALIGNMENT';
    detectedLanguage?: string;
    duration?: number;
}

export class DeepgramLyricsService {
    private static DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';

    /**
     * Get active API key (from env config or fallback).
     */
    static getApiKey(): string {
        return (
            config.DEEPGRAM_API_KEY ||
            process.env.DEEPGRAM_API_KEY ||
            'b97ceb65c0ee4552c3fd29b9827a15065c168699'
        );
    }

    /**
     * Check if Deepgram is configured and available.
     */
    static isAvailable(): boolean {
        const key = this.getApiKey();
        return !!key && key.trim().length > 0;
    }

    /**
     * Transcribe audio URL or binary buffer using Deepgram models (Nova-3 for regional/Tamil, Nova-2 default).
     * Extracts utterances and per-word timestamps.
     */
    static async transcribeAudio(
        audioSource: string | Buffer,
        options: {
            language?: string;
            detectLanguage?: boolean;
            tryVocals?: boolean;
            model?: string;
        } = {}
    ): Promise<{
        transcript: string;
        words: DeepgramWord[];
        utterances: DeepgramUtterance[];
        detectedLanguage?: string;
        duration?: number;
    }> {
        if (!this.isAvailable()) {
            throw new Error('[Deepgram] DEEPGRAM_API_KEY is not configured');
        }

        const apiKey = this.getApiKey();
        let targetAudio = audioSource;

        // If vocals separation requested and source is a URL, optionally isolate vocals
        if (options.tryVocals && typeof targetAudio === 'string' && targetAudio.startsWith('http')) {
            try {
                const { isReplicateAvailable, runDemucs } = await import('../utils/replicate.js');
                if (isReplicateAvailable()) {
                    console.log(`[Deepgram] Attempting vocal isolation via Demucs for ${targetAudio.slice(0, 60)}...`);
                    const vocalsUrl = await runDemucs(targetAudio);
                    if (vocalsUrl) {
                        console.log(`[Deepgram] Vocals successfully separated. Transcribing vocal stem.`);
                        targetAudio = vocalsUrl;
                    }
                }
            } catch (vocalErr: any) {
                console.warn(`[Deepgram] Vocal separation skipped or failed (${vocalErr.message}). Using original audio.`);
            }
        }

        const targetLang = options.language || 'en';
        // Deepgram Nova-3 tier is required for Tamil ('ta') and other Indic/regional languages
        const isRegionalIndic = ['ta', 'te', 'hi', 'ml', 'kn', 'mr', 'bn', 'gu', 'pa'].includes(targetLang.toLowerCase());
        let currentModel = options.model || (isRegionalIndic ? 'nova-3' : 'nova-2');

        const executeDeepgramCall = async (modelToUse: string): Promise<any> => {
            const queryParams = new URLSearchParams();
            queryParams.set('model', modelToUse);
            queryParams.set('smart_format', 'true');
            queryParams.set('punctuate', 'true');
            queryParams.set('utterances', 'true');
            queryParams.set('paragraphs', 'true');
            queryParams.set('language', targetLang);

            const listenUrl = `${this.DEEPGRAM_API_URL}?${queryParams.toString()}`;
            console.log(`[Deepgram] Calling Deepgram STT (model=${modelToUse}, lang=${targetLang})...`);

            if (Buffer.isBuffer(targetAudio)) {
                return axios.post(listenUrl, targetAudio, {
                    headers: {
                        'Authorization': `Token ${apiKey}`,
                        'Content-Type': 'audio/mpeg',
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    timeout: 120000,
                });
            } else if (typeof targetAudio === 'string' && !targetAudio.startsWith('http') && fs.existsSync(targetAudio)) {
                const fileBuffer = fs.readFileSync(targetAudio);
                return axios.post(listenUrl, fileBuffer, {
                    headers: {
                        'Authorization': `Token ${apiKey}`,
                        'Content-Type': 'audio/mpeg',
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    timeout: 120000,
                });
            } else if (typeof targetAudio === 'string' && targetAudio.startsWith('http')) {
                try {
                    return await axios.post(
                        listenUrl,
                        { url: targetAudio },
                        {
                            headers: {
                                'Authorization': `Token ${apiKey}`,
                                'Content-Type': 'application/json',
                            },
                            timeout: 120000,
                        }
                    );
                } catch (urlErr: any) {
                    // Check if error is model/language tier mismatch (HTTP 400) - throw to trigger model fallback
                    if (urlErr.response?.status === 400 && JSON.stringify(urlErr.response?.data || '').includes('model/language/tier')) {
                        throw urlErr;
                    }
                    console.warn(`[Deepgram] Direct URL post failed (${urlErr.message}). Downloading audio buffer directly...`);
                    const downloadRes = await axios.get(targetAudio, {
                        responseType: 'arraybuffer',
                        timeout: 45000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZenifyAudio/1.0',
                        },
                    });

                    const audioBuffer = Buffer.from(downloadRes.data);
                    return axios.post(listenUrl, audioBuffer, {
                        headers: {
                            'Authorization': `Token ${apiKey}`,
                            'Content-Type': 'audio/mpeg',
                        },
                        maxBodyLength: Infinity,
                        maxContentLength: Infinity,
                        timeout: 120000,
                    });
                }
            } else {
                throw new Error(`[Deepgram] Invalid audio source provided`);
            }
        };

        let response: any;
        try {
            response = await executeDeepgramCall(currentModel);
        } catch (err: any) {
            const errStr = JSON.stringify(err.response?.data || err.message);
            if (err.response?.status === 400 && (errStr.includes('model/language/tier') || errStr.includes('Nova-3') || errStr.includes('nova-3'))) {
                console.warn(`[Deepgram] Model ${currentModel} not available for ${targetLang}. Upgrading request to Nova-3...`);
                currentModel = 'nova-3';
                response = await executeDeepgramCall('nova-3');
            } else {
                throw err;
            }
        }

        const data = response.data;
        const alternative = data?.results?.channels?.[0]?.alternatives?.[0];

        if (!alternative) {
            throw new Error('[Deepgram] No transcription results returned');
        }

        const transcript = alternative.transcript || '';
        const words: DeepgramWord[] = alternative.words || [];
        const utterances: DeepgramUtterance[] = data?.results?.utterances || [];
        const detectedLanguage = data?.results?.channels?.[0]?.detected_language;
        const duration = data?.metadata?.duration;

        return {
            transcript,
            words,
            utterances,
            detectedLanguage,
            duration,
        };
    }

    /**
     * Converts Deepgram utterances and words into structured lyrics lines, word-level timings,
     * and identifies instrumental sections (intro, interludes, outro).
     */
    static formatUtterancesToLyrics(
        utterances: DeepgramUtterance[],
        words: DeepgramWord[],
        rawTranscript: string,
        trackDuration?: number
    ): { plainLyrics: string; syncedTokens: SyncedLyricLine[]; rawLrc: string } {
        const rawTokens: SyncedLyricLine[] = [];

        if (utterances && utterances.length > 0) {
            for (const utt of utterances) {
                const text = utt.transcript.trim();
                if (!text) continue;

                // Extract word-by-word timing for each utterance
                const lineWords: SyncedWord[] = (utt.words || []).map(w => ({
                    word: w.punctuated_word || w.word,
                    time: Math.round(w.start * 100) / 100,
                    endTime: Math.round(w.end * 100) / 100,
                }));

                // If utterance is long (> 6s) and has multiple sentences, chunk into natural lyric lines
                if (utt.words && utt.words.length > 8 && (utt.end - utt.start > 5)) {
                    let currentLineWords: string[] = [];
                    let currentWordObjs: SyncedWord[] = [];
                    let currentLineStart = utt.words[0].start;

                    for (let i = 0; i < utt.words.length; i++) {
                        const w = utt.words[i];
                        const nextW = utt.words[i + 1];
                        const wordText = w.punctuated_word || w.word;
                        currentLineWords.push(wordText);
                        currentWordObjs.push({
                            word: wordText,
                            time: Math.round(w.start * 100) / 100,
                            endTime: Math.round(w.end * 100) / 100,
                        });

                        const hasPunctuationEnd = /[.?!,;]/.test(wordText);
                        const pauseToNext = nextW ? (nextW.start - w.end) : 0;
                        const wordsInLine = currentLineWords.length;

                        if (
                            (hasPunctuationEnd && wordsInLine >= 4) ||
                            (pauseToNext > 0.7 && wordsInLine >= 3) ||
                            wordsInLine >= 8 ||
                            i === utt.words.length - 1
                        ) {
                            const lineText = currentLineWords.join(' ').trim();
                            if (lineText) {
                                rawTokens.push({
                                    time: Math.round(currentLineStart * 100) / 100,
                                    text: lineText,
                                    endTime: Math.round(w.end * 100) / 100,
                                    words: currentWordObjs,
                                });
                            }
                            currentLineWords = [];
                            currentWordObjs = [];
                            if (nextW) {
                                currentLineStart = nextW.start;
                            }
                        }
                    }
                } else {
                    rawTokens.push({
                        time: Math.round(utt.start * 100) / 100,
                        text,
                        endTime: Math.round(utt.end * 100) / 100,
                        words: lineWords.length > 0 ? lineWords : undefined,
                    });
                }
            }
        } else if (words && words.length > 0) {
            // Group raw words into lines based on pauses > 0.8s or punctuation
            let currentLineWords: string[] = [];
            let currentWordObjs: SyncedWord[] = [];
            let currentLineStart = words[0].start;

            for (let i = 0; i < words.length; i++) {
                const w = words[i];
                const nextW = words[i + 1];
                const wordText = w.punctuated_word || w.word;
                currentLineWords.push(wordText);
                currentWordObjs.push({
                    word: wordText,
                    time: Math.round(w.start * 100) / 100,
                    endTime: Math.round(w.end * 100) / 100,
                });

                const pauseToNext = nextW ? (nextW.start - w.end) : 0;
                const hasPunctuation = /[.?!]/.test(wordText);

                if (pauseToNext > 0.8 || (hasPunctuation && currentLineWords.length >= 4) || currentLineWords.length >= 8 || i === words.length - 1) {
                    const lineText = currentLineWords.join(' ').trim();
                    if (lineText) {
                        rawTokens.push({
                            time: Math.round(currentLineStart * 100) / 100,
                            text: lineText,
                            endTime: Math.round(w.end * 100) / 100,
                            words: currentWordObjs,
                        });
                    }
                    currentLineWords = [];
                    currentWordObjs = [];
                    if (nextW) currentLineStart = nextW.start;
                }
            }
        } else if (rawTranscript) {
            rawTokens.push({
                time: 0,
                text: rawTranscript.trim(),
            });
        }

        // Auto-assign instrumental sections: intro, interlude breaks, and outro
        const syncedTokens: SyncedLyricLine[] = [];

        if (rawTokens.length > 0) {
            // 1. Intro Instrumental: if first line starts > 3.5s
            if (rawTokens[0].time > 3.5) {
                syncedTokens.push({
                    time: 0,
                    endTime: rawTokens[0].time,
                    text: '♪ [Instrumental Intro] ♪',
                    type: 'instrumental',
                    words: [],
                });
            }

            for (let i = 0; i < rawTokens.length; i++) {
                const current = rawTokens[i];
                syncedTokens.push(current);

                const next = rawTokens[i + 1];
                if (next && current.endTime) {
                    const gap = next.time - current.endTime;
                    if (gap >= 4.5) {
                        syncedTokens.push({
                            time: current.endTime,
                            endTime: next.time,
                            text: '♪ [Instrumental Interlude] ♪',
                            type: 'instrumental',
                            words: [],
                        });
                    }
                }
            }

            // 3. Outro Instrumental: if remaining time > 5.0s
            const last = syncedTokens[syncedTokens.length - 1];
            if (trackDuration && last.endTime && (trackDuration - last.endTime > 5.0)) {
                syncedTokens.push({
                    time: last.endTime,
                    endTime: Math.round(trackDuration * 100) / 100,
                    text: '♪ [Instrumental Outro] ♪',
                    type: 'instrumental',
                    words: [],
                });
            }
        }

        // Generate plain text lyrics (filtering out instrumental markers)
        const plainLyrics = syncedTokens
            .filter(t => t.type !== 'instrumental')
            .map(t => t.text)
            .join('\n');

        // Generate LRC file format with enhanced word timestamps when available
        const rawLrc = syncedTokens.map(line => {
            const totalSecs = Math.max(0, line.time);
            const m = Math.floor(totalSecs / 60);
            const s = Math.floor(totalSecs % 60);
            const ms = Math.floor((totalSecs % 1) * 100);
            const timeTag = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;

            // If word timestamps exist, output enhanced karaoke format
            if (line.words && line.words.length > 0) {
                const wordParts = line.words.map(w => {
                    const wm = Math.floor(w.time / 60);
                    const ws = Math.floor(w.time % 60);
                    const wms = Math.floor((w.time % 1) * 100);
                    return `<${String(wm).padStart(2, '0')}:${String(ws).padStart(2, '0')}.${String(wms).padStart(2, '0')}> ${w.word}`;
                }).join(' ');
                return `${timeTag} ${wordParts}`;
            }

            return `${timeTag} ${line.text}`;
        }).join('\n');

        return {
            plainLyrics,
            syncedTokens,
            rawLrc,
        };
    }

    /**
     * SCENARIO 1: Generate lyrics from audio directly when song has NO lyrics.
     * Uses Deepgram Nova-3/Nova-2 STT to generate plain lyrics, word-level timestamps, and synced LRC.
     */
    static async generateLyricsFromSong(
        audioUrl: string,
        options: {
            songLang?: string;
            tryVocals?: boolean;
            duration?: number;
        } = {}
    ): Promise<DeepgramLyricsResult | null> {
        try {
            console.log(`[Deepgram] Generating full lyrics from song audio (lang=${options.songLang || 'auto'})...`);
            const transcription = await this.transcribeAudio(audioUrl, {
                language: options.songLang === 'tamil' ? 'ta' : (options.songLang === 'english' ? 'en' : undefined),
                tryVocals: options.tryVocals,
            });

            if (!transcription.transcript && transcription.words.length === 0) {
                console.warn(`[Deepgram] Transcription returned empty lyrics.`);
                return null;
            }

            const formatted = this.formatUtterancesToLyrics(
                transcription.utterances,
                transcription.words,
                transcription.transcript,
                options.duration
            );

            console.log(`[Deepgram] Successfully generated ${formatted.syncedTokens.length} lyric lines.`);

            return {
                ...formatted,
                source: 'DEEPGRAM_STT',
                detectedLanguage: transcription.detectedLanguage,
                duration: transcription.duration,
            };
        } catch (err: any) {
            console.error(`[Deepgram] generateLyricsFromSong failed:`, err.message);
            return null;
        }
    }

    /**
     * SCENARIO 2: When plain lyrics ARE present, but NO metadata timings exist.
     * Deepgram transcribes the audio, extracts word timestamps, and aligns the plain lyric lines
     * precisely to the audio timeline.
     */
    static async alignPlainLyricsWithAudio(
        audioUrl: string,
        plainLyrics: string,
        options: {
            duration?: number;
            songLang?: string;
            tryVocals?: boolean;
        } = {}
    ): Promise<DeepgramLyricsResult | null> {
        try {
            if (!plainLyrics || !plainLyrics.trim()) {
                console.warn(`[Deepgram] Plain lyrics text is empty. Falling back to direct transcription.`);
                return this.generateLyricsFromSong(audioUrl, options);
            }

            console.log(`[Deepgram] Aligning ${plainLyrics.length} chars of plain lyrics to audio...`);

            // Transcribe audio using Deepgram Nova-2
            const transcription = await this.transcribeAudio(audioUrl, {
                language: options.songLang === 'tamil' ? 'ta' : (options.songLang === 'english' ? 'en' : undefined),
                tryVocals: options.tryVocals,
            });

            const deepgramWords = transcription.words || [];
            if (deepgramWords.length === 0) {
                console.warn(`[Deepgram] No words detected in audio. Cannot align plain lyrics.`);
                return null;
            }

            // Clean lines from input lyrics
            const rawLines = plainLyrics
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);

            // Filter out purely informational headings like [Verse 1], [Chorus] for alignment purposes
            // but keep the text
            const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9\u0b80-\u0bff]/gi, '');

            const deepgramWordList = deepgramWords.map((dw, idx) => ({
                idx,
                clean: cleanWord(dw.word),
                start: dw.start,
                end: dw.end,
            }));

            const syncedTokens: SyncedLyricLine[] = [];
            let currentWordSearchIndex = 0;

            for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
                const lineText = rawLines[lineIndex];

                // If this is a section header like [Verse 1] or [Chorus]
                if (/^\[.*?\]$/.test(lineText)) {
                    continue;
                }

                const wordsInLine = lineText
                    .split(/\s+/)
                    .map(w => cleanWord(w))
                    .filter(w => w.length > 0);

                if (wordsInLine.length === 0) continue;

                // Look ahead in deepgramWordList starting at currentWordSearchIndex
                // Find best matching start position
                let bestMatchIndex = -1;
                let bestMatchScore = 0;

                const searchWindow = Math.min(deepgramWordList.length, currentWordSearchIndex + 60);

                for (let i = currentWordSearchIndex; i < searchWindow; i++) {
                    let score = 0;
                    // Check up to 4 words match
                    const checkLen = Math.min(wordsInLine.length, 4);
                    for (let j = 0; j < checkLen; j++) {
                        if (i + j < deepgramWordList.length) {
                            const expected = wordsInLine[j];
                            const actual = deepgramWordList[i + j].clean;
                            if (expected === actual) {
                                score += 2;
                            } else if (expected.includes(actual) || actual.includes(expected)) {
                                score += 1;
                            }
                        }
                    }

                    if (score > bestMatchScore && score >= 2) {
                        bestMatchScore = score;
                        bestMatchIndex = i;
                    }
                }

                if (bestMatchIndex !== -1) {
                    const matchedWord = deepgramWordList[bestMatchIndex];
                    const timestamp = Math.round(matchedWord.start * 100) / 100;
                    syncedTokens.push({
                        time: timestamp,
                        text: lineText,
                    });
                    // Advance search pointer
                    currentWordSearchIndex = Math.min(
                        deepgramWordList.length - 1,
                        bestMatchIndex + wordsInLine.length
                    );
                } else {
                    // Line couldn't find exact match in window.
                    // Interpolate time smoothly between previous timestamp and next expected timestamp
                    const prevTime = syncedTokens.length > 0 ? syncedTokens[syncedTokens.length - 1].time : 0;
                    const estimatedTime = Math.round((prevTime + 3.2) * 100) / 100;
                    syncedTokens.push({
                        time: estimatedTime,
                        text: lineText,
                    });
                }
            }

            // Ensure strictly chronological timestamps
            for (let i = 1; i < syncedTokens.length; i++) {
                if (syncedTokens[i].time <= syncedTokens[i - 1].time) {
                    syncedTokens[i].time = Math.round((syncedTokens[i - 1].time + 1.5) * 100) / 100;
                }
            }

            // Format LRC
            const rawLrc = syncedTokens.map(line => {
                const totalSecs = Math.max(0, line.time);
                const m = Math.floor(totalSecs / 60);
                const s = Math.floor(totalSecs % 60);
                const ms = Math.floor((totalSecs % 1) * 100);
                return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}] ${line.text}`;
            }).join('\n');

            console.log(`[Deepgram] Successfully aligned ${syncedTokens.length} lines of lyrics.`);

            return {
                plainLyrics,
                syncedTokens,
                rawLrc,
                source: 'DEEPGRAM_ALIGNMENT',
                detectedLanguage: transcription.detectedLanguage,
                duration: transcription.duration,
            };
        } catch (err: any) {
            console.error(`[Deepgram] alignPlainLyricsWithAudio failed:`, err.message);
            // Fall back to direct transcription if alignment fails
            return this.generateLyricsFromSong(audioUrl, options);
        }
    }

    /**
     * High-Level Pipeline: Automatically inspects track in database,
     * fetches lyrics, or uses Deepgram to generate/align and saves result to DB.
     */
    static async syncTrackLyrics(
        trackId: string,
        options: { force?: boolean; tryVocals?: boolean } = {}
    ): Promise<DeepgramLyricsResult | null> {
        const track = await prisma.track.findUnique({
            where: { id: trackId },
            select: {
                id: true,
                title: true,
                audioUrl: true,
                duration: true,
                lyrics: true,
                synced_lyrics: true,
                language: true,
                artist: { select: { name: true } },
            },
        });

        if (!track || !track.audioUrl) {
            console.warn(`[Deepgram] Track ${trackId} not found or missing audioUrl.`);
            return null;
        }

        // If synced lyrics already exist and force not specified, return
        if (
            !options.force &&
            track.synced_lyrics &&
            Array.isArray(track.synced_lyrics) &&
            track.synced_lyrics.length > 5
        ) {
            console.log(`[Deepgram] Track "${track.title}" already has synced lyrics. Skipping.`);
            return null;
        }

        let result: DeepgramLyricsResult | null = null;

        // If track has plain lyrics but NO synced lyrics
        if (track.lyrics && track.lyrics.trim().length > 0) {
            console.log(`[Deepgram] Track has plain lyrics. Aligning with audio timestamps via Deepgram...`);
            result = await this.alignPlainLyricsWithAudio(track.audioUrl, track.lyrics, {
                duration: track.duration,
                songLang: track.language || 'english',
                tryVocals: options.tryVocals,
            });
        } else {
            console.log(`[Deepgram] Track has NO lyrics. Generating lyrics + timestamps via Deepgram...`);
            result = await this.generateLyricsFromSong(track.audioUrl, {
                songLang: track.language || 'english',
                tryVocals: options.tryVocals,
            });
        }

        if (result && result.syncedTokens && result.syncedTokens.length > 0) {
            await prisma.track.update({
                where: { id: track.id },
                data: {
                    lyrics: result.plainLyrics,
                    synced_lyrics: result.syncedTokens as any,
                    raw_lrc: result.rawLrc,
                    sync_source: result.source,
                },
            });
            console.log(`[Deepgram] Saved ${result.syncedTokens.length} synced lyric lines to DB for "${track.title}"!`);
        }

        return result;
    }
}
