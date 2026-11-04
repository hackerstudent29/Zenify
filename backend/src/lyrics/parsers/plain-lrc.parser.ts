import { LyricsDoc, LyricsLine } from '../types';

export class PlainLrcParser {
  private static parseStamp(minStr: string, secStr: string): number {
    const min = parseInt(minStr, 10);
    const sec = parseFloat(secStr);
    return Math.round((min * 60 + sec) * 1000);
  }

  static parse(lrcText: string, providerId: string = 'lrclib', providerRef?: string): LyricsDoc | null {
    if (!lrcText || typeof lrcText !== 'string') return null;

    const rawLines = lrcText.split(/\r?\n/);
    const lineEntries: { startMs: number; text: string }[] = [];

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // Extract all timestamps
      const lineStampRegex = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;
      const timestamps: number[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = lineStampRegex.exec(trimmed)) !== null) {
        timestamps.push(PlainLrcParser.parseStamp(match[1], match[2]));
        lastIndex = lineStampRegex.lastIndex;
      }

      if (timestamps.length === 0) continue;

      const content = trimmed.substring(lastIndex).trim();
      if (!content) continue;

      for (const ts of timestamps) {
        lineEntries.push({
          startMs: ts,
          text: content
        });
      }
    }

    if (lineEntries.length === 0) return null;

    lineEntries.sort((a, b) => a.startMs - b.startMs);

    const lines: LyricsLine[] = [];
    for (let i = 0; i < lineEntries.length; i++) {
      const entry = lineEntries[i];
      const nextStartMs = (i < lineEntries.length - 1)
        ? lineEntries[i + 1].startMs
        : entry.startMs + 4000;
      const endMs = Math.max(entry.startMs + 500, nextStartMs);

      lines.push({
        startMs: entry.startMs,
        endMs,
        text: entry.text
      });
    }

    return {
      syncLevel: 'line',
      instrumental: false,
      aiGenerated: false,
      aiSynced: false,
      providerId,
      providerRef,
      lines
    };
  }
}

