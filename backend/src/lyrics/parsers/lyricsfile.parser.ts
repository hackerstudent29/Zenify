import YAML from 'yaml';
import { LyricsDoc, LyricsLine, LyricsWord } from '../types';

export class LyricsfileParser {
  static parse(yamlText: string, providerId: string = 'lrclib', providerRef?: string): LyricsDoc | null {
    if (!yamlText || typeof yamlText !== 'string') return null;

    try {
      const data = YAML.parse(yamlText);
      if (!data) return null;

      const isInstrumental = Boolean(data.metadata?.instrumental);
      if (isInstrumental) {
        return {
          syncLevel: 'plain',
          instrumental: true,
          aiGenerated: false,
          aiSynced: false,
          providerId,
          providerRef,
          lines: []
        };
      }

      if (!Array.isArray(data.lines) || data.lines.length === 0) {
        return null;
      }

      const lines: LyricsLine[] = [];
      let hasWordLevel = false;

      for (const rawLine of data.lines) {
        const text = String(rawLine.text || '').trim();
        if (!text) continue;

        const startMs = typeof rawLine.start_ms === 'number' ? rawLine.start_ms : 0;
        const endMs = typeof rawLine.end_ms === 'number' ? rawLine.end_ms : (startMs + 3000);

        let words: LyricsWord[] | undefined;
        if (Array.isArray(rawLine.words) && rawLine.words.length > 0) {
          hasWordLevel = true;
          words = rawLine.words
            .map((w: any) => ({
              startMs: typeof w.start_ms === 'number' ? w.start_ms : startMs,
              endMs: typeof w.end_ms === 'number' ? w.end_ms : endMs,
              text: String(w.text || '').trim()
            }))
            .filter((w: LyricsWord) => w.text.length > 0);
        }

        lines.push({
          startMs,
          endMs,
          text,
          words: words && words.length > 0 ? words : undefined
        });
      }

      if (lines.length === 0) return null;

      lines.sort((a, b) => a.startMs - b.startMs);

      return {
        syncLevel: hasWordLevel ? 'word' : 'line',
        instrumental: false,
        aiGenerated: false,
        aiSynced: false,
        providerId,
        providerRef,
        lines
      };
    } catch (err) {
      return null;
    }
  }
}

