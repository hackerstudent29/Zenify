/**
 * Replicate API Client
 * Lightweight client for running Demucs (vocal separation) and Whisper (transcription)
 * models on Replicate's serverless GPU infrastructure.
 */

import { config } from '../config/env';

const REPLICATE_BASE = 'https://api.replicate.com/v1';

interface ReplicatePrediction {
    id: string;
    status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    output: any;
    error?: string;
}

async function replicateHeaders(): Promise<Record<string, string>> {
    const token = config.REPLICATE_API_TOKEN;
    if (!token) throw new Error('[Replicate] REPLICATE_API_TOKEN is not set');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
    };
}

/**
 * Create a prediction and poll until completion.
 * Uses the `Prefer: wait` header for up to 60s server-side wait,
 * then falls back to polling if still running.
 */
async function runPrediction(modelVersion: string, input: Record<string, any>): Promise<any> {
    const headers = await replicateHeaders();

    console.log(`[Replicate] Creating prediction for model version: ${modelVersion.slice(0, 20)}...`);

    const createRes = await fetch(`${REPLICATE_BASE}/predictions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            version: modelVersion,
            input,
        }),
    });

    if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`[Replicate] Prediction creation failed (${createRes.status}): ${errText}`);
    }

    let prediction: ReplicatePrediction = await createRes.json() as ReplicatePrediction;

    // If `Prefer: wait` returned a completed prediction, return immediately
    if (prediction.status === 'succeeded') {
        console.log(`[Replicate] Prediction ${prediction.id} completed immediately.`);
        return prediction.output;
    }
    if (prediction.status === 'failed') {
        throw new Error(`[Replicate] Prediction failed: ${prediction.error}`);
    }

    // Poll for completion
    const pollHeaders = await replicateHeaders();
    delete pollHeaders['Prefer']; // Don't use wait header for polling

    const maxPolls = 120; // 120 * 2s = 4 minutes max
    for (let i = 0; i < maxPolls; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const pollRes = await fetch(`${REPLICATE_BASE}/predictions/${prediction.id}`, {
            headers: pollHeaders,
        });

        if (!pollRes.ok) {
            console.warn(`[Replicate] Poll error (${pollRes.status}), retrying...`);
            continue;
        }

        prediction = await pollRes.json() as ReplicatePrediction;

        if (prediction.status === 'succeeded') {
            console.log(`[Replicate] Prediction ${prediction.id} completed after ${(i + 1) * 2}s.`);
            return prediction.output;
        }
        if (prediction.status === 'failed' || prediction.status === 'canceled') {
            throw new Error(`[Replicate] Prediction ${prediction.status}: ${prediction.error || 'Unknown error'}`);
        }

        if (i % 5 === 0) {
            console.log(`[Replicate] Prediction ${prediction.id} status: ${prediction.status} (${(i + 1) * 2}s elapsed)`);
        }
    }

    throw new Error(`[Replicate] Prediction ${prediction.id} timed out after ${maxPolls * 2}s`);
}

/**
 * Run Demucs vocal separation model.
 * Input: audio URL → Output: URL of separated vocals track
 */
export async function runDemucs(audioUrl: string): Promise<string> {
    console.log(`[Replicate/Demucs] Separating vocals from: ${audioUrl.slice(0, 80)}...`);

    // cjwbw/demucs is the most popular Demucs model on Replicate
    const DEMUCS_VERSION = '25a173108cff36ef9f80f854c162d01df9e6528be175794b81571db7e64521db';

    const output = await runPrediction(DEMUCS_VERSION, {
        audio: audioUrl,
        stem: 'vocals', // Extract only vocals
    });

    // Output is typically { vocals: "url", ... } or just a URL string
    if (typeof output === 'string') {
        return output;
    }
    if (output?.vocals) {
        return output.vocals;
    }
    // Some versions return an object with stems
    if (Array.isArray(output)) {
        // Find the vocals stem
        const vocalsUrl = output.find((url: string) => url.includes('vocals'));
        if (vocalsUrl) return vocalsUrl;
        return output[0]; // Fallback to first output
    }

    throw new Error('[Replicate/Demucs] Unexpected output format: ' + JSON.stringify(output));
}

export interface WhisperSegment {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface WhisperResult {
    text: string;
    segments: WhisperSegment[];
    language: string;
}

/**
 * Run OpenAI Whisper transcription model.
 * Input: audio URL → Output: timestamped transcription segments
 */
export async function runWhisper(audioUrl: string): Promise<WhisperResult> {
    console.log(`[Replicate/Whisper] Transcribing audio: ${audioUrl.slice(0, 80)}...`);

    // openai/whisper — the official Whisper large-v3 model on Replicate
    const WHISPER_VERSION = '4d50797290df275329f202e48c76360b3f22b08d28c65c8f0d6e8750eb6105a3';

    const output = await runPrediction(WHISPER_VERSION, {
        audio: audioUrl,
        model: 'large-v3',
        language: 'auto',           // Auto-detect language (works for Tamil)
        transcription: 'srt',      // Get SRT format for segment timestamps
        translate: false,           // Don't translate, keep original language
        word_timestamps: true,      // Get word-level timestamps
    });

    // Parse the Whisper output
    if (output?.segments) {
        return {
            text: output.transcription || output.text || '',
            segments: output.segments.map((seg: any, idx: number) => ({
                id: seg.id ?? idx,
                start: seg.start,
                end: seg.end,
                text: (seg.text || '').trim(),
            })),
            language: output.detected_language || output.language || 'unknown',
        };
    }

    // Fallback: parse SRT-style transcription text
    if (typeof output === 'string' || output?.transcription) {
        const srtText = typeof output === 'string' ? output : output.transcription;
        const segments = parseSRT(srtText);
        return {
            text: srtText,
            segments,
            language: 'unknown',
        };
    }

    throw new Error('[Replicate/Whisper] Unexpected output format: ' + JSON.stringify(output).slice(0, 200));
}

/**
 * Parse SRT-formatted text into segments with timestamps.
 */
function parseSRT(srt: string): WhisperSegment[] {
    const segments: WhisperSegment[] = [];
    const blocks = srt.split(/\n\n+/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;

        // Find the timestamp line (contains -->)
        const timeLine = lines.find(l => l.includes('-->'));
        if (!timeLine) continue;

        const [startStr, endStr] = timeLine.split('-->').map(t => t.trim());
        const start = parseSRTTime(startStr);
        const end = parseSRTTime(endStr);

        // Text is everything after the timestamp line
        const timeIdx = lines.indexOf(timeLine);
        const text = lines.slice(timeIdx + 1).join(' ').trim();

        if (text) {
            segments.push({ id: segments.length, start, end, text });
        }
    }

    return segments;
}

function parseSRTTime(timeStr: string): number {
    // Format: HH:MM:SS,mmm or HH:MM:SS.mmm
    const parts = timeStr.replace(',', '.').split(':');
    if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return 0;
}

/**
 * Check if Replicate API is configured and available.
 */
export function isReplicateAvailable(): boolean {
    return !!config.REPLICATE_API_TOKEN;
}

// ─── WhisperX Types ───────────────────────────────────────────────────────────

export interface WordTimestamp {
    word: string;
    start: number;
    end: number;
    score?: number;   // confidence score
}

export interface WhisperXSegment {
    id?: number;
    start: number;
    end: number;
    text: string;
    words?: WordTimestamp[];  // word-level timestamps (only when align_output: true)
    speaker?: string;         // only when diarization: true
}

export interface WhisperXResult {
    segments: WhisperXSegment[];
    detected_language: string;
}

/**
 * Run WhisperX (victor-upmeet/whisperx) — accelerated transcription
 * with word-level forced alignment timestamps.
 *
 * REPLACES plain Whisper for music lyrics sync — provides ±50ms accuracy
 * per word vs ~2s accuracy from plain Whisper segments.
 *
 * Input: publicly accessible audio URL (R2 / Cloudinary / etc.)
 * Output: segments with word-level timestamps
 */
export async function runWhisperX(
    audioUrl: string,
    language?: string  // ISO code e.g. 'en', 'ta', 'hi' — omit for auto-detect
): Promise<WhisperXResult> {
    console.log(`[Replicate/WhisperX] Transcribing with word-level alignment: ${audioUrl.slice(0, 80)}...`);

    // victor-upmeet/whisperx — large-v3, forced alignment, word timestamps
    const WHISPERX_VERSION = 'b54d330adfe47c12a63ed3df3dc3eb7c76dcf9a5cfe6b6b85a8937316a788ef2';

    const input: Record<string, any> = {
        audio_file: audioUrl,
        align_output: true,      // enables word-level forced alignment
        batch_size: 16,
        temperature: 0,
        diarization: false,
        debug: false,
    };

    // Only pass language if explicitly provided (omit = auto-detect)
    if (language) {
        input.language = language;
    }

    const output = await runPrediction(WHISPERX_VERSION, input);

    // WhisperX output format: { segments: [...], detected_language: "en" }
    if (output?.segments && Array.isArray(output.segments)) {
        return {
            segments: output.segments.map((seg: any, idx: number) => ({
                id: idx,
                start: Number(seg.start) || 0,
                end: Number(seg.end) || 0,
                text: (seg.text || '').trim(),
                words: Array.isArray(seg.words) ? seg.words.map((w: any) => ({
                    word: (w.word || '').trim(),
                    start: Number(w.start) || 0,
                    end: Number(w.end) || 0,
                    score: w.score,
                })) : undefined,
            })),
            detected_language: output.detected_language || 'unknown',
        };
    }

    throw new Error('[Replicate/WhisperX] Unexpected output format: ' + JSON.stringify(output).slice(0, 300));
}

