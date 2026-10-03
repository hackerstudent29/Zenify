/**
 * Utility to structure plain and synced lyrics into clean single/double lines (max 45-50 chars per line).
 * Prevents long unwieldy paragraphs from wrapping into 3, 4, or 5 lines in the UI.
 */

export function cleanLyricLine(text: string): string {
  if (!text) return '';

  // Remove Genius / Musixmatch metadata headers and tags
  let cleaned = text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\(\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|music|instrumental|solo|spoken)([^)]*?)\)/gi, '')
    .replace(/^\s*(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|singer)\s*:\s*/gi, '')
    .replace(/\b(chorus|verse|intro|outro|bridge|male|female|view|vocal|hook|pre-chorus|refrain|instrumental)\b/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Split a single string into lines of maximum ~45 characters.
 * Splitting prioritizes punctuation (comma, dash, semicolon, question mark) or nearest space.
 */
export function splitLongLine(text: string, maxLen: number = 45): string[] {
  const cleaned = cleanLyricLine(text);
  if (!cleaned || cleaned.length <= maxLen) return cleaned ? [cleaned] : [];

  // If text already has newlines, process each segment
  if (cleaned.includes('\n')) {
    return cleaned.split('\n').flatMap(segment => splitLongLine(segment, maxLen));
  }

  // Find natural punctuation split near midpoint
  const mid = Math.floor(cleaned.length / 2);
  const punctuationRegex = /[,;?!|\-—]/g;
  let bestSplitIdx = -1;
  let match: RegExpExecArray | null;

  while ((match = punctuationRegex.exec(cleaned)) !== null) {
    const idx = match.index + 1; // Include punctuation on left side
    if (bestSplitIdx === -1 || Math.abs(idx - mid) < Math.abs(bestSplitIdx - mid)) {
      bestSplitIdx = idx;
    }
  }

  // If no good punctuation split, split at space nearest to mid
  if (bestSplitIdx === -1 || bestSplitIdx < 12 || bestSplitIdx > cleaned.length - 12) {
    const words = cleaned.split(' ');
    if (words.length <= 2) return [cleaned]; // Can't split cleanly

    let current = '';
    const firstHalf: string[] = [];
    const secondHalf: string[] = [];

    for (let i = 0; i < words.length; i++) {
      if (current.length < cleaned.length / 2) {
        firstHalf.push(words[i]);
        current += words[i] + ' ';
      } else {
        secondHalf.push(words[i]);
      }
    }
    return [firstHalf.join(' ').trim(), secondHalf.join(' ').trim()].filter(Boolean);
  }

  const part1 = cleaned.substring(0, bestSplitIdx).trim();
  const part2 = cleaned.substring(bestSplitIdx).trim();

  // Recursively ensure parts are <= maxLen
  return [
    ...splitLongLine(part1, maxLen),
    ...splitLongLine(part2, maxLen)
  ].filter(Boolean);
}

/**
 * Formats plain text lyrics to ensure no line exceeds ~48 characters.
 */
export function formatStructuredPlainLyrics(lyrics: string | null | undefined): string | null {
  if (!lyrics || typeof lyrics !== 'string') return null;

  const lines = lyrics.split('\n');
  const resultLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Preserve single empty line break between stanzas
      if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
        resultLines.push('');
      }
      continue;
    }

    const split = splitLongLine(trimmed, 48);
    resultLines.push(...split);
  }

  return resultLines.join('\n').trim();
}

export interface SyncedLyricToken {
  time: number;
  text: string;
  endTime?: number;
  words?: Array<{ word: string; time: number; endTime?: number }>;
}

/**
 * Formats synced lyrics array (or LRC tokens) to ensure every line text is strictly single or double line.
 */
export function formatStructuredSyncedLyrics(synced: any[] | null | undefined): SyncedLyricToken[] {
  if (!synced || !Array.isArray(synced) || synced.length === 0) return [];

  const formatted: SyncedLyricToken[] = [];

  for (let i = 0; i < synced.length; i++) {
    const item = synced[i];
    const time = parseFloat(item.time || 0);
    const text = item.text ? String(item.text) : '';
    const cleaned = cleanLyricLine(text);

    if (!cleaned) continue;

    const nextItem = synced[i + 1];
    const nextTime = nextItem ? parseFloat(nextItem.time || 0) : time + 4.0;
    const duration = Math.max(1.5, nextTime - time);

    // If text exceeds 45 chars, split into at most 2 lines joined by \n or split across timestamps
    if (cleaned.length > 45) {
      const parts = splitLongLine(cleaned, 45);
      if (parts.length === 2) {
        // Split timestamp into two sub-tokens for precise timed rendering
        const t1 = time;
        const t2 = time + Math.round((duration * 0.5) * 100) / 100;
        formatted.push({
          time: t1,
          text: parts[0],
          endTime: t2
        });
        formatted.push({
          time: t2,
          text: parts[1],
          endTime: nextTime
        });
      } else if (parts.length > 2) {
        // Multi-part split: join into max 2 lines with \n
        const line1 = parts.slice(0, Math.ceil(parts.length / 2)).join(' ');
        const line2 = parts.slice(Math.ceil(parts.length / 2)).join(' ');
        formatted.push({
          time: time,
          text: `${line1}\n${line2}`,
          endTime: item.endTime || nextTime
        });
      } else {
        formatted.push({
          time,
          text: parts[0],
          endTime: item.endTime || nextTime
        });
      }
    } else {
      formatted.push({
        time,
        text: cleaned,
        endTime: item.endTime || nextTime
      });
    }
  }

  return formatted.sort((a, b) => a.time - b.time);
}
