/**
 * QuickLRC API Client
 * 
 * Used ONLY as a last-resort fallback when:
 * 1. LRCLIB has no synced lyrics for the track
 * 2. We have plain-text lyrics (from Happi.dev or stored DB) AND an audio URL
 * 3. Replicate/Whisper is not configured
 *
 * ⚠️  BUDGET WARNING: This API allows only 5 songs per month.
 * Only call this function after all other sync methods have failed.
 */

import { config } from '../config/env.js';
import axios from 'axios';

const QUICKLRC_BASE = 'https://quicklrc.com';

export interface QuickLrcResult {
  lrc: string;
}

/**
 * Call QuickLRC forced-alignment: given audio URL + plain lyrics text,
 * return a synced LRC string.
 *
 * Returns null if API key not set, quota exceeded, or request fails.
 */
export async function alignWithQuickLrc(audioUrl: string, lyrics: string): Promise<string | null> {
    const apiKey = config.QUICKLRC_API_KEY;
    if (!apiKey) {
        console.log('[QuickLRC] QUICKLRC_API_KEY not configured. Skipping.');
        return null;
    }

    console.log(`[QuickLRC] Attempting forced alignment for audio: ${audioUrl.slice(0, 80)}...`);

    try {
        const response = await axios.post(
            `${QUICKLRC_BASE}/api/v1/transcribe`,
            {
                fileUrl: audioUrl,
                lyrics: lyrics,
                format: 'lrc',
                isWordLevel: false,
                smartSections: false,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                responseType: 'text',  // LRC is plain text
                timeout: 120000, // 2 min — audio transcription can take time
            }
        );

        if (typeof response.data === 'string' && response.data.includes('[')) {
            console.log(`[QuickLRC] ✅ Forced alignment successful. LRC received (${response.data.length} chars).`);
            return response.data;
        }

        console.warn('[QuickLRC] Unexpected response format:', String(response.data).slice(0, 200));
        return null;
    } catch (err: any) {
        if (err.response?.status === 402) {
            console.warn('[QuickLRC] ⚠️  Credit limit reached. Cannot process more songs this month.');
        } else if (err.response?.status === 403) {
            console.warn('[QuickLRC] ⚠️  Monthly usage cap reached.');
        } else if (err.response?.status === 401) {
            console.warn('[QuickLRC] Invalid API key.');
        } else {
            console.warn(`[QuickLRC] Alignment failed: ${err.message}`);
        }
        return null;
    }
}

export function isQuickLrcAvailable(): boolean {
    return !!config.QUICKLRC_API_KEY;
}
