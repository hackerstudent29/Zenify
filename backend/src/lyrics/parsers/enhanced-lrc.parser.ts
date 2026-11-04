import { LyricsDoc, LyricsLine, LyricsWord } from '../types';

export class EnhancedLrcParser {
  private static parseStamp(minStr: string, secStr: string): number {
    const min = parseInt(minStr, 10);
    const sec = parseFloat(secStr);
    return Math.round((min * 60 + sec) * 1000);
  }

  static parse(lrcText: string, providerId: string = 'lrc.red', providerRef?: string): LyricsDoc | null {
    if (!lrcText || typeof lrcText !== 'string') return null;

    const rawLines = lrcText.split(/\r?\n/);
    let offsetMs = 0;
    const lineEntries: { startMs: number; rawContent: string }[] = [];
    let hasAnyWordStamps = false;

    // First pass: extract offset and line entries
    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // Check for [offset:+/-ms]
      const offsetMatch = trimmed.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
      if (offsetMatch) {
        offsetMs = parseInt(offsetMatch[1], 10) || 0;
        continue;
      }

      // Check for metadata tags like [ti:], [ar:], [al:], [by:]
      if (/^\[(ti|ar|al|by|length|re|ve):/i.test(trimmed)) {
        continue;
      }

      // Extract all line timestamps e.g. [00:12.34][00:45.67]Content
      const lineStampRegex = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;
      const timestamps: number[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = lineStampRegex.exec(trimmed)) !== null) {
        timestamps.push(EnhancedLrcParser.parseStamp(match[1], match[2]));
        lastIndex = lineStampRegex.lastIndex;
      }

      if (timestamps.length === 0) continue;

      const content = trimmed.substring(lastIndex).trim();
      if (/<(\d{1,2}):(\d{2}(?:\.\d{1,3})?)>/.test(content)) {
        hasAnyWordStamps = true;
      }

      for (const ts of timestamps) {
        lineEntries.push({
          startMs: Math.max(0, ts + offsetMs),
          rawContent: content
        });
      }
    }

    if (lineEntries.length === 0) return null;

    // Sort by startMs
    lineEntries.sort((a, b) => a.startMs - b.startMs);

    const parsedLines: LyricsLine[] = [];

    for (let i = 0; i < lineEntries.length; i++) {
      const entry = lineEntries[i];
      const nextStartMs = (i < lineEntries.length - 1)
        ? lineEntries[i + 1].startMs
        : entry.startMs + 4000;
      const lineEndMs = Math.max(entry.startMs + 500, nextStartMs);

      const words: LyricsWord[] = [];
      let cleanLineText = '';
      const lineHasWordStamps = /<(\d{1,2}):(\d{2}(?:\.\d{1,3})?)>/.test(entry.rawContent);

      if (lineHasWordStamps) {
        // Word regex matching <mm:ss.xx>Word
        const wordRegex = /<(\d{1,2}):(\d{2}(?:\.\d{1,3})?)>([^<]*)/g;
        let wMatch: RegExpExecArray | null;
        const rawWords: { startMs: number; text: string }[] = [];

        while ((wMatch = wordRegex.exec(entry.rawContent)) !== null) {
          const wStart = Math.max(0, EnhancedLrcParser.parseStamp(wMatch[1], wMatch[2]) + offsetMs);
          const wText = wMatch[3];
          rawWords.push({ startMs: wStart, text: wText });
          cleanLineText += wText;
        }

        for (let w = 0; w < rawWords.length; w++) {
          const cur = rawWords[w];
          const wEnd = (w < rawWords.length - 1)
            ? rawWords[w + 1].startMs
            : lineEndMs;
          const trimmedWord = cur.text.trim();
          if (trimmedWord) {
            words.push({
              startMs: Math.max(entry.startMs, cur.startMs),
              endMs: Math.max(cur.startMs + 50, wEnd),
              text: trimmedWord
            });
          }
        }
      } else {
        // Line-level entry without inline word tags
        cleanLineText = entry.rawContent;
      }

      cleanLineText = cleanLineText.trim();
      if (!cleanLineText && words.length === 0) continue;

      parsedLines.push({
        startMs: entry.startMs,
        endMs: lineEndMs,
        text: cleanLineText || words.map(w => w.text).join(' '),
        words: words.length > 0 ? words : undefined
      });
    }

    if (parsedLines.length === 0) return null;

    return {
      syncLevel: hasAnyWordStamps && parsedLines.some(l => l.words && l.words.length > 0) ? 'word' : 'line',
      instrumental: false,
      aiGenerated: false,
      aiSynced: false,
      providerId,
      providerRef,
      lines: parsedLines
    };
  }
}
