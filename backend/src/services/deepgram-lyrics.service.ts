import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
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
     * Extracts utterances and per-word timestamps. Automatically chunks audio if gaps or silence cause premature cutoff.
     */
    static async transcribeAudio(
        audioSource: string | Buffer,
        options: {
            language?: string;
            detectLanguage?: boolean;
            tryVocals?: boolean;
            model?: string;
            duration?: number;
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
            queryParams.set('endpointing', 'false'); // Prevents premature cutoff during instrumental breaks

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

        let transcript = alternative.transcript || '';
        let words: DeepgramWord[] = alternative.words || [];
        let utterances: DeepgramUtterance[] = data?.results?.utterances || [];
        const detectedLanguage = data?.results?.channels?.[0]?.detected_language;
        const duration = data?.metadata?.duration;

        // Auto-chunking recovery if Deepgram terminated prematurely before end of song (e.g., long instrumental interludes)
        if (options.duration && options.duration > 75 && typeof targetAudio === 'string' && (targetAudio.startsWith('http') || fs.existsSync(targetAudio))) {
            const targetDuration = options.duration;
            let lastTimestamp = 0;
            if (words.length > 0) {
                lastTimestamp = words[words.length - 1].end;
            } else if (utterances.length > 0) {
                lastTimestamp = utterances[utterances.length - 1].end;
            }

            if (lastTimestamp > 0 && (targetDuration - lastTimestamp > 30)) {
                console.log(`[Deepgram] Single pass stopped at ${lastTimestamp.toFixed(1)}s but song duration is ${targetDuration}s (${(targetDuration - lastTimestamp).toFixed(1)}s remaining). Resuming transcription with chunking...`);
                let currentResume = Math.max(0, lastTimestamp);

                while (currentResume < targetDuration - 8) {
                    const chunkDur = Math.min(90, targetDuration - currentResume);
                    const tempChunk = path.join(os.tmpdir(), `dg-chunk-${Date.now()}-${Math.floor(Math.random() * 10000)}.mp3`);
                    try {
                        execSync(`ffmpeg -y -ss ${currentResume} -i "${targetAudio}" -t ${chunkDur} -c:a libmp3lame "${tempChunk}"`, { stdio: 'pipe' });
                        if (fs.existsSync(tempChunk) && fs.statSync(tempChunk).size > 1000) {
                            const chunkBuffer = fs.readFileSync(tempChunk);
                            const chunkQueryParams = new URLSearchParams();
                            chunkQueryParams.set('model', currentModel);
                            chunkQueryParams.set('smart_format', 'true');
                            chunkQueryParams.set('punctuate', 'true');
                            chunkQueryParams.set('utterances', 'true');
                            chunkQueryParams.set('paragraphs', 'true');
                            chunkQueryParams.set('language', targetLang);
                            chunkQueryParams.set('endpointing', 'false');

                            const chunkRes = await axios.post(`${this.DEEPGRAM_API_URL}?${chunkQueryParams.toString()}`, chunkBuffer, {
                                headers: {
                                    'Authorization': `Token ${apiKey}`,
                                    'Content-Type': 'audio/mpeg',
                                },
                                timeout: 60000,
                            });

                            const chunkAlt = chunkRes.data?.results?.channels?.[0]?.alternatives?.[0];
                            const chunkWords: DeepgramWord[] = (chunkAlt?.words || []).map((w: any) => ({
                                ...w,
                                start: Math.round((w.start + currentResume) * 100) / 100,
                                end: Math.round((w.end + currentResume) * 100) / 100,
                            }));
                            const chunkUtterances: DeepgramUtterance[] = (chunkRes.data?.results?.utterances || []).map((u: any) => ({
                                ...u,
                                start: Math.round((u.start + currentResume) * 100) / 100,
                                end: Math.round((u.end + currentResume) * 100) / 100,
                                words: (u.words || []).map((w: any) => ({
                                    ...w,
                                    start: Math.round((w.start + currentResume) * 100) / 100,
                                    end: Math.round((w.end + currentResume) * 100) / 100,
                                })),
                            }));

                            if (chunkWords.length > 0) {
                                words.push(...chunkWords);
                                if (chunkAlt?.transcript) {
                                    transcript += ' ' + chunkAlt.transcript;
                                }
                                currentResume = chunkWords[chunkWords.length - 1].end;
                            } else {
                                currentResume += chunkDur;
                            }

                            if (chunkUtterances.length > 0) {
                                utterances.push(...chunkUtterances);
                            }
                        } else {
                            break;
                        }
                    } catch (chunkErr: any) {
                        console.warn(`[Deepgram] Chunk at ${currentResume}s failed:`, chunkErr.message);
                        currentResume += chunkDur;
                    } finally {
                        try { if (fs.existsSync(tempChunk)) fs.unlinkSync(tempChunk); } catch {}
                    }
                }
            }
        }

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
                duration: options.duration,
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
     * precisely to the audio timeline with word-by-word highlights and instrumental breaks.
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

            // Transcribe audio using Deepgram Nova-3/Nova-2 with full duration chunking
            const transcription = await this.transcribeAudio(audioUrl, {
                language: options.songLang === 'tamil' ? 'ta' : (options.songLang === 'english' ? 'en' : undefined),
                tryVocals: options.tryVocals,
                duration: options.duration,
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
            const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9\u0b80-\u0bff]/gi, '');

            const deepgramWordList = deepgramWords.map((dw, idx) => ({
                idx,
                clean: cleanWord(dw.word),
                start: dw.start,
                end: dw.end,
            }));

            const rawTokens: SyncedLyricLine[] = [];
            let currentWordSearchIndex = 0;

            for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
                const lineText = rawLines[lineIndex];

                // If this is a section header like [Verse 1] or [Chorus]
                if (/^\[.*?\]$/.test(lineText)) {
                    continue;
                }

                const lineWordTokens = lineText
                    .split(/\s+/)
                    .filter(w => w.length > 0);

                const cleanTokens = lineWordTokens.map(w => cleanWord(w)).filter(w => w.length > 0);
                if (cleanTokens.length === 0) continue;

                // Look ahead in deepgramWordList starting at currentWordSearchIndex
                let bestMatchIndex = -1;
                let bestMatchScore = 0;

                const searchWindow = Math.min(deepgramWordList.length, currentWordSearchIndex + 60);

                for (let i = currentWordSearchIndex; i < searchWindow; i++) {
                    let score = 0;
                    const checkLen = Math.min(cleanTokens.length, 4);
                    for (let j = 0; j < checkLen; j++) {
                        if (i + j < deepgramWordList.length) {
                            const expected = cleanTokens[j];
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

                let lineStart: number;
                let lineEnd: number;
                let words: SyncedWord[] = [];

                if (bestMatchIndex !== -1) {
                    const matchedWord = deepgramWordList[bestMatchIndex];
                    lineStart = Math.round(matchedWord.start * 100) / 100;
                    const matchEndIndex = Math.min(deepgramWordList.length - 1, bestMatchIndex + cleanTokens.length - 1);
                    const matchedEndWord = deepgramWordList[matchEndIndex];
                    lineEnd = Math.round(Math.max(lineStart + 1.2, matchedEndWord.end) * 100) / 100;

                    const wordSpan = (lineEnd - lineStart) / lineWordTokens.length;
                    words = lineWordTokens.map((w, wIdx) => {
                        const dw = deepgramWordList[bestMatchIndex + wIdx];
                        return {
                            word: w,
                            time: dw ? Math.round(dw.start * 100) / 100 : Math.round((lineStart + wIdx * wordSpan) * 100) / 100,
                            endTime: dw ? Math.round(dw.end * 100) / 100 : Math.round((lineStart + (wIdx + 1) * wordSpan) * 100) / 100,
                        };
                    });

                    currentWordSearchIndex = Math.min(
                        deepgramWordList.length - 1,
                        bestMatchIndex + cleanTokens.length
                    );
                } else {
                    const prevTime = rawTokens.length > 0 ? (rawTokens[rawTokens.length - 1].endTime || rawTokens[rawTokens.length - 1].time) : 0;
                    lineStart = Math.round((prevTime + 0.8) * 100) / 100;
                    lineEnd = Math.round((lineStart + Math.max(1.8, lineWordTokens.length * 0.5)) * 100) / 100;
                    const wordSpan = (lineEnd - lineStart) / lineWordTokens.length;
                    words = lineWordTokens.map((w, wIdx) => ({
                        word: w,
                        time: Math.round((lineStart + wIdx * wordSpan) * 100) / 100,
                        endTime: Math.round((lineStart + (wIdx + 1) * wordSpan) * 100) / 100,
                    }));
                }

                rawTokens.push({
                    time: lineStart,
                    endTime: lineEnd,
                    text: lineText,
                    words,
                });
            }

            // Ensure strictly chronological timestamps
            for (let i = 1; i < rawTokens.length; i++) {
                if (rawTokens[i].time <= rawTokens[i - 1].time) {
                    rawTokens[i].time = Math.round((rawTokens[i - 1].time + 1.2) * 100) / 100;
                    if (rawTokens[i].endTime && rawTokens[i].endTime <= rawTokens[i].time) {
                        rawTokens[i].endTime = Math.round((rawTokens[i].time + 2.0) * 100) / 100;
                    }
                }
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
                if (options.duration && last.endTime && (options.duration - last.endTime > 5.0)) {
                    syncedTokens.push({
                        time: last.endTime,
                        endTime: Math.round(options.duration * 100) / 100,
                        text: '♪ [Instrumental Outro] ♪',
                        type: 'instrumental',
                        words: [],
                    });
                }
            }

            // Format LRC with word tags when available
            const rawLrc = syncedTokens.map(line => {
                const totalSecs = Math.max(0, line.time);
                const m = Math.floor(totalSecs / 60);
                const s = Math.floor(totalSecs % 60);
                const ms = Math.floor((totalSecs % 1) * 100);
                const timeTag = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;

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
