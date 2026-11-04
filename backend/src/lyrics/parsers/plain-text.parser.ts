import { LyricsDoc, LyricsLine } from '../types';

export class PlainTextParser {
  /**
   * Scrubs unwanted junk like credits, video links, and website ads.
   */
  static clean(text: string): string {
    if (!text) return '';

    const lines = text.split(/\r?\n/);
    const cleanedLines: string[] = [];

    const garbageKeywordRegex = /\b(submit corrections|paroles de la chanson|writer\(s\)|all rights reserved|subscribe|official video|stream now|lyrics for .* by)\b/i;

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      // Remove HTML comments
      line = line.replace(/<!--.*?-->/gi, '').trim();
      // Remove trailing Embed digits
      line = line.replace(/\d*Embed$/i, '').trim();
      line = line.replace(/\*{5,}.*?\*{5,}/g, '').trim();

      if (!line) continue;

      const lower = line.toLowerCase();
      if (lower.startsWith('http://') || lower.startsWith('https://')) continue;
      if (lower.startsWith('follow us') || lower.startsWith('subscribe')) continue;
      if (garbageKeywordRegex.test(lower)) continue;

      cleanedLines.push(line);
    }

    return cleanedLines.join('\n').trim();
  }

  static parse(plainText: string, providerId: string = 'lyrics.ovh', providerRef?: string): LyricsDoc | null {
    if (!plainText || typeof plainText !== 'string') return null;

    const cleaned = PlainTextParser.clean(plainText);
    const rawLines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (rawLines.length === 0) return null;

    // For plain lyrics, assign a sequential 3-second placeholder per line for display structure
    const lines: LyricsLine[] = rawLines.map((text, idx) => ({
      startMs: idx * 3000,
      endMs: (idx + 1) * 3000,
      text
    }));

    return {
      syncLevel: 'plain',
      instrumental: false,
      aiGenerated: false,
      aiSynced: false,
      providerId,
      providerRef,
      lines
    };
  }
}
