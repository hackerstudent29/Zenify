import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { safeExecFile } from '../utils/security.js';
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

export interface LyricOnsetVerificationResult {
    verified: boolean;
    adjusted: boolean;
    tDeepgram?: number;
    tLyrics?: number;
    driftSeconds: number;
    syncedTokens: SyncedLyricLine[];
    rawLrc: string;
    plainLyrics?: string;
    message: string;
}

export class DeepgramLyricsService {
    private static DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';

    private static keyIndex = 0;

    /**
     * Get active API key (from env config, process.env, or comma-separated pool).
     */
    static getApiKey(): string {
        const raw = (
            process.env.DEEPGRAM_KEYS ||
            config.DEEPGRAM_API_KEY ||
            process.env.DEEPGRAM_API_KEY ||
            'b97ceb65c0ee4552c3fd29b9827a15065c168699'
        );
        const keys = raw.split(',').map((k: string) => k.trim()).filter(Boolean);
        if (keys.length === 0) return 'b97ceb65c0ee4552c3fd29b9827a15065c168699';
        return keys[this.keyIndex % keys.length];
    }

    static rotateKey(): void {
        this.keyIndex++;
        console.warn(`[Deepgram] Rotated to next key in pool (index=${this.keyIndex})`);
    }

    /**
     * Check if Deepgram is configured and available.
     */
    static isAvailable(): boolean {
        const key = this.getApiKey();
        return !!key && key.trim().length > 0;
    }

    /**
     * Normalizes friendly/stored language strings into ISO language codes for Deepgram.
     */
    static normalizeLanguageCode(rawLang?: string | null): string {
        if (!rawLang) return 'en';
        const l = rawLang.trim().toLowerCase();
        if (l === 'tamil' || l === 'ta' || l === 'tanglish') return 'ta';
        if (l === 'hindi' || l === 'hi' || l === 'hinglish') return 'hi';
        if (l === 'telugu' || l === 'te' || l === 'tenglish') return 'te';
        if (l === 'kannada' || l === 'kn' || l === 'kanglish') return 'kn';
        if (l === 'malayalam' || l === 'ml' || l === 'manglish') return 'ml';
        if (l === 'bengali' || l === 'bn') return 'bn';
        if (l === 'punjabi' || l === 'pa') return 'pa';
        if (l === 'gujarati' || l === 'gu') return 'gu';
        if (l === 'marathi' || l === 'mr') return 'mr';
        if (l === 'swahili' || l === 'sw' || l === 'kiswahili') return 'sw';
        if (l === 'spanish' || l === 'es') return 'es';
        if (l === 'french' || l === 'fr') return 'fr';
        if (l === 'korean' || l === 'ko') return 'ko';
        if (l === 'japanese' || l === 'ja') return 'ja';
        if (l === 'german' || l === 'de') return 'de';
        if (l === 'italian' || l === 'it') return 'it';
        if (l === 'portuguese' || l === 'pt') return 'pt';
        if (l === 'russian' || l === 'ru') return 'ru';
        if (l === 'turkish' || l === 'tr') return 'tr';
        if (l === 'indonesian' || l === 'id') return 'id';
        if (l === 'arabic' || l === 'ar') return 'ar';
        if (l === 'chinese' || l === 'zh') return 'zh';
        if (l === 'english' || l === 'en') return 'en';
        return l;
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
        const isRegionalIndicOrNova3 = ['ta', 'te', 'hi', 'ml', 'kn', 'mr', 'bn', 'gu', 'pa', 'sw'].includes(targetLang.toLowerCase());
        let currentModel = options.model || (isRegionalIndicOrNova3 ? 'nova-3' : 'nova-2');

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
                        await safeExecFile('ffmpeg', [
                            '-y', '-ss', String(currentResume),
                            '-i', targetAudio,
                            '-t', String(chunkDur),
                            '-c:a', 'libmp3lame',
                            tempChunk
                        ], { timeout: 30000 });
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
     * Serializes synced lyric lines and word timings into standard/enhanced LRC string.
     */
    static generateLrcFromTokens(tokens: SyncedLyricLine[]): string {
        return tokens.map(line => {
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
    }

    /**
     * Extracts an ultra-compact 60-second snippet (16kHz mono MP3) of the audio track for lightning-fast onset detection.
     */
    static async extractFirst60sSnippet(audioSource: string | Buffer): Promise<Buffer | null> {
        const tempIn = path.join(os.tmpdir(), `dg-in-${Date.now()}-${Math.floor(Math.random() * 10000)}.bin`);
        const tempOut = path.join(os.tmpdir(), `dg-snip-${Date.now()}-${Math.floor(Math.random() * 10000)}.mp3`);

        try {
            let inputTarget = '';

            if (Buffer.isBuffer(audioSource)) {
                fs.writeFileSync(tempIn, audioSource);
                inputTarget = tempIn;
            } else if (typeof audioSource === 'string') {
                const trimmed = audioSource.trim();

                if (trimmed.startsWith('http')) {
                    // If YouTube watch URL or search query, resolve direct media stream URL first
                    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
                        try {
                            const { runYtDlp } = await import('./external-metadata.service.js');
                            const { stdout } = await runYtDlp(['-g', '-f', 'ba/b', trimmed], { timeout: 10000 });
                            const directUrl = stdout.trim().split(/\r?\n/)[0];

                            if (directUrl && directUrl.startsWith('http')) {
                                inputTarget = directUrl;
                            } else {
                                inputTarget = trimmed;
                            }
                        } catch {
                            inputTarget = trimmed;
                        }
                    } else {
                        inputTarget = trimmed;
                    }
                } else if (fs.existsSync(trimmed)) {
                    inputTarget = trimmed;
                } else {
                    return null;
                }
            } else {
                return null;
            }

            // Run ffmpeg asynchronously to extract the first 60 seconds of 16kHz mono audio
            try {
                await safeExecFile('ffmpeg', [
                    '-y', '-ss', '0', '-t', '60',
                    '-i', inputTarget,
                    '-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k',
                    tempOut
                ], { timeout: 25000 });
            } catch (ffmpegErr: any) {
                // If direct ffmpeg URL access failed (e.g. 403 or headers), download first 1.5MB via HTTP Range
                if (inputTarget.startsWith('http')) {
                    console.warn(`[Deepgram] FFmpeg direct slice failed (${ffmpegErr.message}). Downloading first 1.5MB chunk via HTTP Range...`);
                    const rangeRes = await axios.get(inputTarget, {
                        headers: {
                            'Range': 'bytes=0-1572864',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZenifyAudio/1.0',
                        },
                        responseType: 'arraybuffer',
                        timeout: 20000,
                    });
                    fs.writeFileSync(tempIn, Buffer.from(rangeRes.data));
                    await safeExecFile('ffmpeg', [
                        '-y', '-ss', '0', '-t', '60',
                        '-i', tempIn,
                        '-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k',
                        tempOut
                    ], { timeout: 20000 });
                } else {
                    throw ffmpegErr;
                }
            }

            if (fs.existsSync(tempOut) && fs.statSync(tempOut).size > 1000) {
                return fs.readFileSync(tempOut);
            }
            return null;
        } catch (err: any) {
            console.warn(`[Deepgram] extractFirst60sSnippet failed: ${err.message}`);
            return null;
        } finally {
            try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch {}
            try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch {}
        }
    }

    /**
     * VERIFIES & ALIGNS LYRICS ONSET WITH DEEPGRAM STT:
     * 1. Inspects the first 60 seconds of song audio with Deepgram to detect exact singing onset (T_deepgram).
     * 2. Compares against the first line of synced lyrics (T_lyrics).
     * 3. Tolerance: If drift is within +- 0.5s to 2.0s, no adjustment needed (natural singing tolerance).
     * 4. If drift exceeds 2.0s, shifts ALL lines, word timings, and LRC forward or backward by the difference!
     * 5. Automatically updates PostgreSQL database if trackId is provided.
     */
    static async verifyAndAlignLyricOnset(params: {
        audioSource: string | Buffer;
        syncedLyrics: SyncedLyricLine[];
        rawLrc?: string;
        language?: string;
        trackId?: string;
        title?: string;
    }): Promise<LyricOnsetVerificationResult> {
        if (!this.isAvailable()) {
            return {
                verified: false,
                adjusted: false,
                driftSeconds: 0,
                syncedTokens: params.syncedLyrics,
                rawLrc: params.rawLrc || this.generateLrcFromTokens(params.syncedLyrics),
                message: 'Deepgram is not available/configured'
            };
        }

        if (!params.syncedLyrics || params.syncedLyrics.length === 0) {
            return {
                verified: false,
                adjusted: false,
                driftSeconds: 0,
                syncedTokens: params.syncedLyrics || [],
                rawLrc: params.rawLrc || '',
                message: 'No synced lyrics provided'
            };
        }

        // 1. Identify where singing starts in the provided synced lyrics (T_lyrics)
        const firstSingingLine = params.syncedLyrics.find(
            l => l.type !== 'instrumental' && 
                 !l.text.includes('♪') && 
                 !l.text.includes('•') && 
                 l.text.trim().length > 1
        );

        if (!firstSingingLine) {
            return {
                verified: false,
                adjusted: false,
                driftSeconds: 0,
                syncedTokens: params.syncedLyrics,
                rawLrc: params.rawLrc || this.generateLrcFromTokens(params.syncedLyrics),
                message: 'No singing lines found in lyrics tokens'
            };
        }

        const tLyrics = Math.round(firstSingingLine.time * 100) / 100;
        console.log(`[DeepgramOnset] Checking onset for "${params.title || 'Track'}" | Lyric onset T_lyrics = ${tLyrics}s ("${firstSingingLine.text.slice(0, 30)}")`);

        // 2. Extract first 60 seconds audio snippet
        const snippetBuffer = await this.extractFirst60sSnippet(params.audioSource);
        if (!snippetBuffer) {
            console.warn(`[DeepgramOnset] Could not extract 60s audio snippet for "${params.title || 'Track'}". Keeping original lyrics.`);
            return {
                verified: false,
                adjusted: false,
                tLyrics,
                driftSeconds: 0,
                syncedTokens: params.syncedLyrics,
                rawLrc: params.rawLrc || this.generateLrcFromTokens(params.syncedLyrics),
                message: 'Could not extract audio snippet'
            };
        }

        // 3. Send snippet to Deepgram to detect vocal onset
        const targetLang = this.normalizeLanguageCode(params.language || 'en');
        const isRegional = ['ta', 'te', 'hi', 'ml', 'kn', 'mr', 'bn', 'gu', 'pa', 'sw'].includes(targetLang);
        const model = isRegional ? 'nova-3' : 'nova-2';

        const apiKey = this.getApiKey();
        const queryParams = new URLSearchParams();
        queryParams.set('model', model);
        queryParams.set('smart_format', 'true');
        queryParams.set('punctuate', 'true');
        queryParams.set('utterances', 'true');
        queryParams.set('language', targetLang);
        queryParams.set('endpointing', 'false');

        let dgWords: DeepgramWord[] = [];
        let dgUtterances: DeepgramUtterance[] = [];

        try {
            const listenUrl = `${this.DEEPGRAM_API_URL}?${queryParams.toString()}`;
            const dgRes = await axios.post(listenUrl, snippetBuffer, {
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'audio/mpeg',
                },
                timeout: 30000,
            });

            const alt = dgRes.data?.results?.channels?.[0]?.alternatives?.[0];
            dgWords = alt?.words || [];
            dgUtterances = dgRes.data?.results?.utterances || [];
        } catch (dgErr: any) {
            console.warn(`[DeepgramOnset] Deepgram call failed for "${params.title || 'Track'}": ${dgErr.message}`);
            return {
                verified: false,
                adjusted: false,
                tLyrics,
                driftSeconds: 0,
                syncedTokens: params.syncedLyrics,
                rawLrc: params.rawLrc || this.generateLrcFromTokens(params.syncedLyrics),
                message: `Deepgram call failed: ${dgErr.message}`
            };
        }

        // 4. Determine T_deepgram (exact second where vocals start)
        const validWords = dgWords.filter(w => w.confidence >= 0.35 && w.word.trim().length > 1);
        const validUtterances = dgUtterances.filter(u => u.transcript.trim().length > 1);

        let tDeepgram: number | undefined;
        if (validWords.length > 0) {
            tDeepgram = Math.round(validWords[0].start * 100) / 100;
        } else if (validUtterances.length > 0) {
            tDeepgram = Math.round(validUtterances[0].start * 100) / 100;
        }

        if (tDeepgram === undefined) {
            console.log(`[DeepgramOnset] Deepgram detected no singing words in first 60s for "${params.title || 'Track'}". Lyric onset is ${tLyrics}s.`);
            return {
                verified: true,
                adjusted: false,
                tLyrics,
                driftSeconds: 0,
                syncedTokens: params.syncedLyrics,
                rawLrc: params.rawLrc || this.generateLrcFromTokens(params.syncedLyrics),
                message: 'No vocal onset detected in first 60s (possible instrumental intro or track)'
            };
        }

        // 5. Compare T_deepgram and T_lyrics & check tolerance
        const drift = Math.round((tDeepgram - tLyrics) * 100) / 100;
        console.log(`[DeepgramOnset] "${params.title || 'Track'}" | T_deepgram = ${tDeepgram}s | T_lyrics = ${tLyrics}s | Drift = ${drift > 0 ? '+' : ''}${drift}s`);

        // The tolerance rule:
        // "if atleast +- 0.5-2 seconds means no problem if it goes more that that u should change the lyrics atart time change for whole lyrics like backward or forward based on the lyrics issue."
        const isWithinTolerance = Math.abs(drift) <= 2.0;

        if (isWithinTolerance) {
            console.log(`[DeepgramOnset] "${params.title || 'Track'}" drift (${drift > 0 ? '+' : ''}${drift}s) is within tolerance (<= 2.0s). Preserving original timings.`);
            return {
                verified: true,
                adjusted: false,
                tDeepgram,
                tLyrics,
                driftSeconds: drift,
                syncedTokens: params.syncedLyrics,
                rawLrc: params.rawLrc || this.generateLrcFromTokens(params.syncedLyrics),
                message: `Onset aligned within tolerance (${drift > 0 ? '+' : ''}${drift}s drift <= 2.0s). No shift needed.`
            };
        }

        // 6. Drift exceeds 2.0 seconds -> SHIFT the entire lyrics forward or backward!
        console.log(`[DeepgramOnset] "${params.title || 'Track'}" drift (${drift > 0 ? '+' : ''}${drift}s) exceeds 2.0s! Shifting whole lyrics ${drift > 0 ? 'FORWARD' : 'BACKWARD'} by ${Math.abs(drift)}s...`);

        const adjustedTokens: SyncedLyricLine[] = params.syncedLyrics.map(line => {
            const newTime = Math.max(0, Math.round((line.time + drift) * 100) / 100);
            const originalDuration = (line.endTime && line.endTime > line.time) ? (line.endTime - line.time) : 3.5;
            const newEndTime = line.endTime
                ? Math.max(newTime + 0.8, Math.round((line.endTime + drift) * 100) / 100)
                : Math.round((newTime + originalDuration) * 100) / 100;

            let adjustedWords: SyncedWord[] | undefined;
            if (line.words && line.words.length > 0) {
                adjustedWords = line.words.map(w => {
                    const wTime = Math.max(0, Math.round((w.time + drift) * 100) / 100);
                    const wOrigDur = (w.endTime && w.endTime > w.time) ? (w.endTime - w.time) : 0.3;
                    const wEndTime = w.endTime
                        ? Math.max(wTime + 0.08, Math.round((w.endTime + drift) * 100) / 100)
                        : Math.round((wTime + wOrigDur) * 100) / 100;
                    return { word: w.word, time: wTime, endTime: wEndTime };
                });
            }

            return {
                ...line,
                time: newTime,
                endTime: newEndTime,
                words: adjustedWords
            };
        });

        adjustedTokens.sort((a, b) => a.time - b.time);
        const adjustedRawLrc = this.generateLrcFromTokens(adjustedTokens);

        // 7. Persist to database if trackId is provided
        if (params.trackId) {
            try {
                const track = await prisma.track.findUnique({
                    where: { id: params.trackId },
                    select: { romanizedSyncedLyrics: true }
                });

                let shiftedRomanizedSynced: any = undefined;
                if (track?.romanizedSyncedLyrics && Array.isArray(track.romanizedSyncedLyrics)) {
                    shiftedRomanizedSynced = (track.romanizedSyncedLyrics as any[]).map(line => ({
                        ...line,
                        time: Math.max(0, Math.round((line.time + drift) * 100) / 100),
                        endTime: line.endTime ? Math.max(line.time + 0.8, Math.round((line.endTime + drift) * 100) / 100) : undefined,
                        words: line.words ? line.words.map((w: any) => ({
                            ...w,
                            time: Math.max(0, Math.round((w.time + drift) * 100) / 100),
                            endTime: w.endTime ? Math.max(w.time + 0.08, Math.round((w.endTime + drift) * 100) / 100) : undefined
                        })) : undefined
                    }));
                }

                await prisma.track.update({
                    where: { id: params.trackId },
                    data: {
                        synced_lyrics: adjustedTokens as any,
                        raw_lrc: adjustedRawLrc,
                        sync_source: 'DEEPGRAM_ONSET_ALIGNED',
                        lyricsOffset: 0,
                        ...(shiftedRomanizedSynced ? { romanizedSyncedLyrics: shiftedRomanizedSynced } : {})
                    }
                });
                console.log(`[DeepgramOnset] Successfully updated track ${params.trackId} with shifted lyrics in DB.`);
            } catch (dbErr: any) {
                console.error(`[DeepgramOnset] Failed to update track DB record: ${dbErr.message}`);
            }
        }

        return {
            verified: true,
            adjusted: true,
            tDeepgram,
            tLyrics,
            driftSeconds: drift,
            syncedTokens: adjustedTokens,
            rawLrc: adjustedRawLrc,
            message: `Shifted whole lyrics ${drift > 0 ? 'forward' : 'backward'} by ${Math.abs(drift)}s (T_deepgram=${tDeepgram}s, T_lyrics=${tLyrics}s, drift=${drift > 0 ? '+' : ''}${drift}s)`
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
                language: this.normalizeLanguageCode(options.songLang),
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
                language: this.normalizeLanguageCode(options.songLang),
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
        options: { force?: boolean; tryVocals?: boolean; plainLyrics?: string; language?: string } = {}
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

        const effectiveLyrics = (options.plainLyrics && options.plainLyrics.trim().length > 0)
            ? options.plainLyrics.trim()
            : (track.lyrics || '');

        // 1. Detect accurate language using LLM
        const { AILyricsService } = await import('./ai-lyrics.service.js');
        const songLangDetails = await AILyricsService.detectSongLanguageDetails({
            title: track.title,
            artist: track.artist?.name || '',
            lyrics: effectiveLyrics || undefined
        });

        const targetLangCode = (options.language && options.language !== 'English' && options.language !== 'auto')
            ? this.normalizeLanguageCode(options.language)
            : songLangDetails.code;
        const targetLangName = songLangDetails.language;

        console.log(`[Deepgram] Track "${track.title}" classified by LLM as ${targetLangName} (code: ${targetLangCode}, romanized: ${songLangDetails.romanizedLang})`);

        // If synced lyrics already exist and force not specified, return existing record
        if (
            !options.force &&
            track.synced_lyrics &&
            Array.isArray(track.synced_lyrics) &&
            track.synced_lyrics.length > 5 &&
            !options.plainLyrics
        ) {
            console.log(`[Deepgram] Track "${track.title}" already has synced lyrics. Returning existing.`);
            return {
                plainLyrics: track.lyrics || '',
                syncedTokens: track.synced_lyrics as any,
                rawLrc: '',
                source: 'DEEPGRAM_ALIGNMENT',
            };
        }

        let result: DeepgramLyricsResult | null = null;

        // Determine if plain lyrics match the detected language or if we should transcribe from audio
        const hasIndicScript = /[\u0900-\u0dff]/.test(effectiveLyrics);
        const isMismatchedLyrics = ['ta', 'te', 'hi', 'ml', 'kn'].includes(targetLangCode) && 
            !hasIndicScript && 
            (effectiveLyrics.includes('bukla') || effectiveLyrics.includes('manze') || effectiveLyrics.includes('fiti') || effectiveLyrics.includes('Kenya'));

        // If options.force is set without custom plainLyrics, or if existing lyrics are mismatched, transcribe audio with Deepgram STT
        const shouldTranscribeFromAudio = !options.plainLyrics || isMismatchedLyrics || effectiveLyrics.length === 0;

        if (!shouldTranscribeFromAudio && effectiveLyrics.length > 0) {
            console.log(`[Deepgram] Track has plain lyrics (${effectiveLyrics.length} chars, lang=${targetLangCode}). Aligning with audio timestamps via Deepgram...`);
            result = await this.alignPlainLyricsWithAudio(track.audioUrl, effectiveLyrics, {
                duration: track.duration,
                songLang: targetLangCode,
                tryVocals: options.tryVocals,
            });

            // If alignment returned null or 0 tokens with regional lang, try English
            if ((!result || !result.syncedTokens || result.syncedTokens.length === 0) && targetLangCode !== 'en') {
                console.log(`[Deepgram] Alignment with ${targetLangCode} produced no tokens. Retrying alignment with English...`);
                result = await this.alignPlainLyricsWithAudio(track.audioUrl, effectiveLyrics, {
                    duration: track.duration,
                    songLang: 'english',
                    tryVocals: false,
                });
            }

            // If alignment still returned null or 0 tokens, fall back to direct audio transcription
            if (!result || !result.syncedTokens || result.syncedTokens.length === 0) {
                console.log(`[Deepgram] Plain lyrics alignment produced no tokens. Falling back to direct STT generation (lang=${targetLangCode})...`);
                result = await this.generateLyricsFromSong(track.audioUrl, {
                    songLang: targetLangCode,
                    tryVocals: options.tryVocals,
                    duration: track.duration,
                });
            }
        } else {
            console.log(`[Deepgram] Transcribing lyrics directly from audio via Deepgram STT (lang=${targetLangCode})...`);
            result = await this.generateLyricsFromSong(track.audioUrl, {
                songLang: targetLangCode,
                tryVocals: options.tryVocals,
                duration: track.duration,
            });
        }

        if (result && result.syncedTokens && result.syncedTokens.length > 0) {
            // Apply AI Tanglish / Romanization format if non-English or containing native scripts
            const { RomanizationService } = await import('./romanization.service.js');
            const needsRomanization = !songLangDetails.isEnglish && (
                RomanizationService.containsNonLatin(result.plainLyrics) ||
                ['Tamil', 'Hindi', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Punjabi', 'Gujarati', 'Marathi', 'Korean', 'Japanese'].includes(targetLangName)
            );

            if (needsRomanization) {
                console.log(`[Deepgram] Formatting non-English lyrics into Tanglish / Romanized format (${songLangDetails.romanizedLang})...`);
                try {
                    const romanizedSynced = await RomanizationService.romanizeSyncedTokens(result.syncedTokens, songLangDetails.romanizedLang);
                    if (romanizedSynced && Array.isArray(romanizedSynced) && romanizedSynced.length === result.syncedTokens.length) {
                        result.syncedTokens = romanizedSynced;
                        // Derive plain lyrics directly from romanized tokens for guaranteed 1-to-1 match
                        result.plainLyrics = romanizedSynced
                            .filter((t: any) => t.type !== 'instrumental')
                            .map((t: any) => t.text)
                            .join('\n');
                    } else {
                        const romanizedPlain = await RomanizationService.romanizeLyricsText(result.plainLyrics, songLangDetails.romanizedLang);
                        if (romanizedPlain?.romanized) {
                            result.plainLyrics = romanizedPlain.romanized;
                        }
                    }
                } catch (romErr: any) {
                    console.warn(`[Deepgram] Tanglish / Romanization formatting warning:`, romErr.message);
                }
            }

            await prisma.track.update({
                where: { id: track.id },
                data: {
                    lyrics: result.plainLyrics,
                    synced_lyrics: result.syncedTokens as any,
                    raw_lrc: result.rawLrc,
                    sync_source: result.source,
                    language: targetLangName,
                    romanizedLyrics: result.plainLyrics,
                    romanizedSyncedLyrics: result.syncedTokens as any,
                    romanizedLang: songLangDetails.romanizedLang,
                    romanizedAt: new Date()
                },
            });
            console.log(`[Deepgram] Saved ${result.syncedTokens.length} synced lyric lines to DB for "${track.title}" in ${targetLangName} (${songLangDetails.romanizedLang})!`);

            (result as any).language = targetLangName;
            (result as any).romanizedLang = songLangDetails.romanizedLang;
        }

        return result;
    }
}