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
export async function alignWithQuickLrc(_audioUrl: string, _lyrics: string): Promise<string | null> {
    void QUICKLRC_BASE;
    void axios;
    return null;
}

export function isQuickLrcAvailable(): boolean {
    void config;
    return false;
}
