import { LyricsDoc, LyricsLine } from './types';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  doc?: LyricsDoc;
}

export class LyricsValidator {
  /**
   * Validates and normalizes a LyricsDoc against strict timing and structure rules.
   * @param doc The parsed candidate lyrics document
   * @param trackDurationSeconds Track duration in seconds (optional)
   */
  static validate(doc: LyricsDoc | null | undefined, trackDurationSeconds?: number): ValidationResult {
    if (!doc) {
      return { valid: false, reason: 'Document is null or undefined' };
    }

    if (!doc.providerId) {
      return { valid: false, reason: 'Missing providerId' };
    }

    // Instrumental tracks require 0 lines or special instrumental marker
    if (doc.instrumental) {
      return {
        valid: true,
        doc: {
          ...doc,
          syncLevel: doc.syncLevel || 'plain',
          lines: doc.lines || []
        }
      };
    }

    if (!Array.isArray(doc.lines) || doc.lines.length === 0) {
      return { valid: false, reason: 'Non-instrumental document contains no lyric lines' };
    }

    if (doc.lines.length > 1500) {
      return { valid: false, reason: `Excessive line count (${doc.lines.length} > 1500)` };
    }

    const maxAllowedMs = trackDurationSeconds && trackDurationSeconds > 0
      ? (trackDurationSeconds + 2) * 1000
      : Number.MAX_SAFE_INTEGER;

    // Check lines sorting and bounds
    let prevLineStart = -1;
    const validatedLines: LyricsLine[] = [];

    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];

      if (!line || typeof line.text !== 'string') {
        return { valid: false, reason: `Line ${i} has invalid text structure` };
      }

      const cleanText = line.text.trim();
      if (cleanText.length === 0 && (!line.words || line.words.length === 0)) {
        // Skip purely empty lines without word tokens
        continue;
      }

      if (cleanText.length > 500) {
        return { valid: false, reason: `Line ${i} text exceeds maximum length (500 chars)` };
      }

      if (line.startMs < 0) {
        return { valid: false, reason: `Line ${i} has negative startMs (${line.startMs})` };
      }

      if (line.endMs < line.startMs) {
        return { valid: false, reason: `Line ${i} endMs (${line.endMs}) is before startMs (${line.startMs})` };
      }

      if (line.startMs > maxAllowedMs) {
        return { valid: false, reason: `Line ${i} startMs (${line.startMs}ms) exceeds track duration limit (${maxAllowedMs}ms)` };
      }

      if (line.startMs < prevLineStart) {
        return { valid: false, reason: `Line ${i} is out of chronological order (${line.startMs}ms < ${prevLineStart}ms)` };
      }
      prevLineStart = line.startMs;

      // Validate nested words if word sync is claimed
      if (line.words && line.words.length > 0) {
        if (line.words.length > 60) {
          return { valid: false, reason: `Line ${i} contains excessive word tokens (${line.words.length} > 60)` };
        }

        let prevWordStart = -1;
        const normalizedWordsText: string[] = [];

        for (let w = 0; w < line.words.length; w++) {
          const word = line.words[w];
          if (!word || typeof word.text !== 'string') {
            return { valid: false, reason: `Line ${i} word ${w} is invalid` };
          }

          if (word.startMs < line.startMs - 50) {
            return { valid: false, reason: `Line ${i} word ${w} starts before line (${word.startMs}ms < ${line.startMs}ms)` };
          }

          if (word.endMs > line.endMs + 100) {
            return { valid: false, reason: `Line ${i} word ${w} ends after line (${word.endMs}ms > ${line.endMs}ms)` };
          }

          if (word.endMs < word.startMs) {
            return { valid: false, reason: `Line ${i} word ${w} ends before it starts (${word.endMs}ms < ${word.startMs}ms)` };
          }

          if (word.startMs < prevWordStart) {
            return { valid: false, reason: `Line ${i} word ${w} is out of order (${word.startMs}ms < ${prevWordStart}ms)` };
          }
          prevWordStart = word.startMs;

          if (word.text.trim().length > 0) {
            normalizedWordsText.push(word.text.trim());
          }
        }

        // Validate word texts loosely concatenate or relate to line text
        const concatenatedWords = normalizedWordsText.join(' ').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const normalizedLineText = cleanText.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        
        // If both are non-empty, ensure substantial alignment
        if (concatenatedWords.length > 0 && normalizedLineText.length > 0) {
          const lengthRatio = concatenatedWords.length / normalizedLineText.length;
          if (lengthRatio < 0.4 || lengthRatio > 2.2) {
            return {
              valid: false,
              reason: `Line ${i} words do not align with line text (word chars: ${concatenatedWords.length}, line chars: ${normalizedLineText.length})`
            };
          }
        }
      }

      validatedLines.push({
        ...line,
        text: cleanText,
        words: line.words ? [...line.words] : undefined
      });
    }

    if (validatedLines.length === 0) {
      return { valid: false, reason: 'All candidate lines were empty' };
    }

    return {
      valid: true,
      doc: {
        ...doc,
        lines: validatedLines
      }
    };
  }
}

