import { LyricsDoc, LyricsLine, LyricsWord, TrackMetadataQuery } from './types';
import { DeepgramLyricsService } from '../services/deepgram-lyrics.service';

export interface DeepgramLanguageConfig {
  code: string;
  model: 'nova-3' | 'nova-2' | 'enhanced';
}

export class DeepgramEngine {
  private static readonly SUPPORTED_LANGUAGES: Record<string, DeepgramLanguageConfig> = {
    en: { code: 'en', model: 'nova-3' },
    english: { code: 'en', model: 'nova-3' },
    es: { code: 'es', model: 'nova-3' },
    spanish: { code: 'es', model: 'nova-3' },
    fr: { code: 'fr', model: 'nova-3' },
    french: { code: 'fr', model: 'nova-3' },
    de: { code: 'de', model: 'nova-3' },
    german: { code: 'de', model: 'nova-3' },
    hi: { code: 'hi', model: 'nova-2' },
    hindi: { code: 'hi', model: 'nova-2' },
    ja: { code: 'ja', model: 'nova-3' },
    japanese: { code: 'ja', model: 'nova-3' },
    ko: { code: 'ko', model: 'nova-3' },
    korean: { code: 'ko', model: 'nova-3' },
    pt: { code: 'pt', model: 'nova-3' },
    portuguese: { code: 'pt', model: 'nova-3' },
    it: { code: 'it', model: 'nova-2' },
    italian: { code: 'it', model: 'nova-2' },
    nl: { code: 'nl', model: 'nova-2' },
    dutch: { code: 'nl', model: 'nova-2' },
    ta: { code: 'ta', model: 'nova-2' },
    tamil: { code: 'ta', model: 'nova-2' }
  };

  private static monthlyEstimatedSpendUsd = 0;
  private static readonly COST_PER_MINUTE_USD = 0.0043; // Standard Deepgram Nova tier

  /**
   * Checks if a language is explicitly supported by Deepgram.
   * If unsupported, returns null (do not guess!).
   */
  static getLanguageConfig(lang?: string): DeepgramLanguageConfig | null {
    if (!lang) return null;
    const clean = lang.toLowerCase().trim();
    return this.SUPPORTED_LANGUAGES[clean] || null;
  }

  /**
   * Spend cap verification
   */
  static isSpendCapExceeded(): boolean {
    const cap = parseFloat(process.env.DEEPGRAM_MONTHLY_SPEND_CAP_USD || '15.00');
    return this.monthlyEstimatedSpendUsd >= cap;
  }

  static recordUsage(durationSeconds: number) {
    const minutes = durationSeconds / 60;
    this.monthlyEstimatedSpendUsd += minutes * this.COST_PER_MINUTE_USD;
  }

  static getEstimatedSpend(): number {
    return Math.round(this.monthlyEstimatedSpendUsd * 100) / 100;
  }

  /**
   * Groups raw Deepgram word utterances into lines based on pauses, punctuation, and length.
   */
  static groupWordsIntoLines(words: Array<{ word: string; start: number; end: number; confidence: number; punctuated_word?: string }>): LyricsLine[] {
    if (!words || words.length === 0) return [];

    const lines: LyricsLine[] = [];
    let currentWords: LyricsWord[] = [];
    let lineStartMs = -1;
    let prevWordEndSec = -1;

    const flushCurrentLine = () => {
      if (currentWords.length === 0) return;
      const lineText = currentWords.map(cw => cw.text).join(' ').trim();
      const lineEndMs = currentWords[currentWords.length - 1].endMs;
      if (lineText.length > 0) {
        lines.push({
          startMs: lineStartMs,
          endMs: Math.max(lineStartMs + 500, lineEndMs),
          text: lineText,
          words: [...currentWords]
        });
      }
      currentWords = [];
      lineStartMs = -1;
    };

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      // Filter out low-confidence hallucinated words
      if (w.confidence < 0.40) continue;

      const wordText = (w.punctuated_word || w.word || '').trim();
      if (!wordText) continue;

      const wStartMs = Math.round(w.start * 1000);
      const wEndMs = Math.round(w.end * 1000);

      const pauseSec = prevWordEndSec > 0 ? (w.start - prevWordEndSec) : 0;
      if (pauseSec > 0.8 && currentWords.length > 0) {
        flushCurrentLine();
      }

      if (lineStartMs === -1) {
        lineStartMs = wStartMs;
      }

      currentWords.push({
        startMs: wStartMs,
        endMs: wEndMs,
        text: wordText
      });

      prevWordEndSec = w.end;

      const isPunctuationBoundary = /[.!?]$/.test(wordText) || (currentWords.length >= 6 && /[,;:]$/.test(wordText));
      const isLengthBoundary = currentWords.length >= 10;

      if (isPunctuationBoundary || isLengthBoundary || i === words.length - 1) {
        flushCurrentLine();
      }
    }

    // Flush any remaining words
    flushCurrentLine();

    return lines;
  }

  /**
   * Generates AI word-level synced lyrics from track audio.
   */
  static async transcribeTrack(audioUrl: string, query: TrackMetadataQuery): Promise<LyricsDoc | null> {
    const langConfig = this.getLanguageConfig(query.language);
    if (!langConfig) {
      console.log(`[DeepgramEngine] Track language "${query.language || 'unknown'}" is not supported by Deepgram. Skipping Tier A.`);
      return null;
    }

    if (this.isSpendCapExceeded()) {
      console.warn(`[DeepgramEngine] Monthly spend cap exceeded ($${this.getEstimatedSpend()}). Skipping Tier A.`);
      return null;
    }

    if (!DeepgramLyricsService.isAvailable()) {
      return null;
    }

    try {
      const key = DeepgramLyricsService.getApiKey();
      const params = new URLSearchParams({
        model: langConfig.model,
        language: langConfig.code,
        punctuate: 'true',
        smart_format: 'true',
        diarize: 'false'
      });

      const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: audioUrl }),
        signal: AbortSignal.timeout(20000)
      });

      if (!res.ok) {
        return null;
      }

      const data: any = await res.json();
      const rawWords = data?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
      const lines = this.groupWordsIntoLines(rawWords);

      if (lines.length < 3) {
        return null; // insufficient utterances detected
      }

      this.recordUsage(query.duration || 180);

      return {
        syncLevel: 'ai-word',
        language: langConfig.code,
        instrumental: false,
        aiGenerated: true,
        aiSynced: true,
        providerId: 'deepgram',
        providerRef: data?.metadata?.request_id,
        lines
      };
    } catch (err) {
      return null;
    }
  }
}
