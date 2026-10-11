import crypto from 'crypto';
import { generateText, createGateway } from 'ai';
import { config } from '../config/env.js';
import { prisma } from '../utils/prisma.js';
import { transliterateLineRuleBased, transliterateTextRuleBased } from '../utils/indic-transliterator.js';

export interface ScriptDetectionResult {
    hasNonLatin: boolean;
    primaryLanguage: string;
    scriptDetails: Record<string, number>;
}

export class RomanizationService {
    // Model fallback sequence strictly as required
    private static readonly MODEL_CHAIN = [
        'openai/gpt-4o-mini',
        'inclusionai/ling-3.0-flash',
        'mistral/ministral-3b',
        'meta/llama-3.1-8b',
    ];

    /**
     * Compute deterministic hash of lyrics content to avoid redundant processing.
     */
    static computeSourceHash(lyrics: string | null | undefined, syncedLyrics: any): string {
        const cleanPlain = (lyrics || '').trim();
        const cleanSynced = syncedLyrics ? JSON.stringify(syncedLyrics) : '';
        return crypto.createHash('sha256').update(`${cleanPlain}::${cleanSynced}`).digest('hex');
    }

    /**
     * Detect scripts per line using standard Unicode block ranges.
     */
    static detectScript(text: string): ScriptDetectionResult {
        if (!text) {
            return { hasNonLatin: false, primaryLanguage: 'English', scriptDetails: {} };
        }

        const counts: Record<string, number> = {
            Tamil: 0,
            Devanagari: 0,
            Telugu: 0,
            Kannada: 0,
            Malayalam: 0,
            Bengali: 0,
            Gurmukhi: 0,
            Gujarati: 0,
            Odia: 0,
            Latin: 0
        };

        for (const char of text) {
            const code = char.charCodeAt(0);
            if (code >= 0x0B80 && code <= 0x0BFF) counts.Tamil++;
            else if (code >= 0x0900 && code <= 0x097F) counts.Devanagari++;
            else if (code >= 0x0C00 && code <= 0x0C7F) counts.Telugu++;
            else if (code >= 0x0C80 && code <= 0x0CFF) counts.Kannada++;
            else if (code >= 0x0D00 && code <= 0x0D7F) counts.Malayalam++;
            else if (code >= 0x0980 && code <= 0x09FF) counts.Bengali++;
            else if (code >= 0x0A00 && code <= 0x0A7F) counts.Gurmukhi++;
            else if (code >= 0x0A80 && code <= 0x0AFF) counts.Gujarati++;
            else if (code >= 0x0B00 && code <= 0x0B7F) counts.Odia++;
            else if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A)) counts.Latin++;
        }

        const totalNonLatin = counts.Tamil + counts.Devanagari + counts.Telugu +
            counts.Kannada + counts.Malayalam + counts.Bengali +
            counts.Gurmukhi + counts.Gujarati + counts.Odia;

        if (totalNonLatin === 0) {
            return { hasNonLatin: false, primaryLanguage: 'English', scriptDetails: counts };
        }

        // Determine dominant regional language label (friendly conversational terms)
        const entries = [
            { script: 'Tamil', lang: 'Tanglish', count: counts.Tamil },
            { script: 'Devanagari', lang: 'Hinglish', count: counts.Devanagari },
            { script: 'Telugu', lang: 'Tenglish', count: counts.Telugu },
            { script: 'Kannada', lang: 'Kanglish', count: counts.Kannada },
            { script: 'Malayalam', lang: 'Manglish', count: counts.Malayalam },
            { script: 'Bengali', lang: 'Bengali', count: counts.Bengali },
            { script: 'Gurmukhi', lang: 'Punjabi', count: counts.Gurmukhi },
            { script: 'Gujarati', lang: 'Gujarati', count: counts.Gujarati },
            { script: 'Odia', lang: 'Odia', count: counts.Odia },
        ];

        entries.sort((a, b) => b.count - a.count);
        const top = entries[0];

        return {
            hasNonLatin: totalNonLatin > 0,
            primaryLanguage: top.count > 0 ? top.lang : 'English',
            scriptDetails: counts
        };
    }

    /**
     * Checks if a string contains any Indic or non-Latin script characters.
     */
    static containsNonLatin(text: string): boolean {
        if (!text) return false;
        // Check for Indic (0900-0D7F), Tamil (0B80-0BFF), East Asian/CJK (4E00-9FFF, 3040-30FF), Korean (AC00-D7AF), Cyrillic (0400-04FF), Arabic (0600-06FF)
        return /[\u0900-\u0D7F\u0A00-\u0A7F\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u0400-\u04FF\u0600-\u06FF]/.test(text);
    }

    /**
     * Validates transliteration output against source lines.
     */
    static validateOutput(sourceLines: string[], romanizedLines: string[]): boolean {
        if (!romanizedLines || romanizedLines.length !== sourceLines.length) {
            console.warn(`[Romanization] Line count mismatch: expected ${sourceLines.length}, got ${romanizedLines?.length}`);
            return false;
        }

        for (let i = 0; i < sourceLines.length; i++) {
            const src = sourceLines[i];
            const rom = romanizedLines[i];

            // If source was blank, romanized must be blank
            if (src.trim().length === 0 && rom.trim().length > 0) {
                console.warn(`[Romanization] Blank line corrupted at index ${i}`);
                return false;
            }

            // Must not contain any non-Latin / Indic characters
            if (this.containsNonLatin(rom)) {
                console.warn(`[Romanization] Output contains residual non-Latin characters at line ${i}: "${rom.slice(0, 30)}"`);
                return false;
            }

            // Check if section tags like [Chorus] or [Verse] were altered
            const srcTag = src.match(/^\[(.*?)\]/);
            const romTag = rom.match(/^\[(.*?)\]/);
            if (srcTag && (!romTag || srcTag[1].toLowerCase() !== romTag[1].toLowerCase())) {
                console.warn(`[Romanization] Section tag mismatch at line ${i}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Execute AI Transliteration using the strict model chain:
     * Ling 3.0 Flash -> Ministral 3B -> Llama 3.1 8B.
     * Retries up to 3 times per model. Switches only on genuine model failure.
     */
    private static async transliterateWithAIChain(
        lines: string[],
        targetLang: string
    ): Promise<string[] | null> {
        const apiKey = config.VERCEL_AI_KEY;
        if (!apiKey) {
            console.warn('[Romanization] VERCEL_AI_KEY missing. Skipping AI engine directly to rule-based fallback.');
            return null;
        }

        const gateway = createGateway({ apiKey });

        const prompt = `You are an expert lyrics transliterator for music streaming.
Task: Transliterate the following song lyrics into English/Latin letters (casual readable chat-style: ${targetLang}).
STRICT RULES:
1. Transliterate ONLY based on pronunciation. DO NOT translate into English.
   Example: "நீ இல்லாம என்ன ஆச்சு" -> "Nee illaama enna aachu"
   Example: "காதல்" -> "Kaadhal"
   Example: "तुम बिन" -> "Tum bin"
2. Use casual, readable romanization similar to how people naturally chat.
3. NEVER use diacritics or academic symbols (no ā, ī, ū, ś, ṇ, etc. Use plain English alphabet letters).
4. NEVER change the meaning. Words that are ALREADY in English must remain completely UNTOUCHED.
5. Return the EXACT SAME line count (exactly ${lines.length} lines).
6. Preserve all blank lines, line order, punctuation, and section headers like [Chorus] or [Verse].
7. Output Latin characters ONLY. Do not output any notes, explanations, or markdown code fences.

Input Lyrics:
${lines.join('\n')}`;

        // Move through the model chain sequentially:
        // Ling 3.0 Flash -> Ministral 3B -> Llama 3.1 8B
        for (const modelId of this.MODEL_CHAIN) {
            console.log(`[Romanization] Attempting transliteration with model: ${modelId}...`);

            // Retry up to 3 times for the current model on transient failures
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const model = gateway(modelId as any);
                    const { text } = await generateText({
                        model,
                        prompt,
                    });

                    if (!text || text.trim().length === 0) {
                        console.warn(`[Romanization] Model ${modelId} attempt ${attempt} returned empty text.`);
                        continue;
                    }

                    // Parse output lines
                    const cleanText = text.replace(/```(?:[a-zA-Z]*)?/g, '').trim();
                    const outputLines = cleanText.split('\n');

                    // If line count matches and output validates, ACCEPT IMMEDIATELY AND STOP CHAIN
                    if (this.validateOutput(lines, outputLines)) {
                        console.log(`[Romanization] Transliteration succeeded with model ${modelId} on attempt ${attempt}!`);
                        return outputLines;
                    }

                    console.warn(`[Romanization] Model ${modelId} attempt ${attempt} failed validation.`);
                } catch (err: any) {
                    console.error(`[Romanization] Model ${modelId} attempt ${attempt} error:`, err.message || err);
                }
            }

            console.warn(`[Romanization] Model ${modelId} permanently failed after 3 attempts. Moving to next fallback model.`);
        }

        console.warn('[Romanization] All AI models in fallback chain failed. Resorting to rule-based transliterator.');
        return null;
    }

    /**
     * Process plain lyrics text into casual Latin romanization.
     */
    static async romanizeLyricsText(
        plainLyrics: string,
        dominantLang: string
    ): Promise<{ romanized: string; lang: string }> {
        const lines = plainLyrics.split('\n');

        // Check if any lines actually need transliteration
        const needsTransliteration = lines.some(l => this.containsNonLatin(l));
        if (!needsTransliteration) {
            return { romanized: plainLyrics, lang: 'English' };
        }

        // Try AI fallback chain first
        const aiResultLines = await this.transliterateWithAIChain(lines, dominantLang);
        if (aiResultLines && aiResultLines.length === lines.length) {
            return { romanized: aiResultLines.join('\n'), lang: dominantLang };
        }

        // Final deterministic rule-based fallback
        console.log(`[Romanization] Applying rule-based transliterator fallback for ${lines.length} lines.`);
        const ruleBased = lines.map(line => transliterateLineRuleBased(line)).join('\n');
        return { romanized: ruleBased, lang: dominantLang };
    }

    /**
     * Romanize synced lyrics tokens while preserving line order, count, and timestamps.
     */
    static async romanizeSyncedTokens(
        tokens: any[],
        dominantLang: string
    ): Promise<any[]> {
        if (!Array.isArray(tokens) || tokens.length === 0) return tokens;

        // Extract raw lines from tokens
        const tokenLines = tokens.map(t => t.text || '');
        const hasNonLatin = tokenLines.some(l => this.containsNonLatin(l));
        // If already completely in Latin script and language is English or Swahili, return tokens directly
        if (!hasNonLatin && (dominantLang === 'English' || dominantLang === 'Swahili')) return tokens;

        // Transliterate lines
        let transliteratedLines: string[] | null = await this.transliterateWithAIChain(tokenLines, dominantLang);
        if (!transliteratedLines || transliteratedLines.length !== tokenLines.length) {
            transliteratedLines = tokenLines.map(l => transliterateLineRuleBased(l));
        }

        // Merge back into tokens preserving all timing properties
        return tokens.map((token, idx) => {
            const romanText = transliteratedLines![idx] || token.text;

            // If word-level tokens exist, transliterate each word
            let romanWords = token.words;
            if (Array.isArray(token.words) && token.words.length > 0) {
                romanWords = token.words.map((w: any) => ({
                    ...w,
                    word: transliterateLineRuleBased(w.word || '')
                }));
            }

            return {
                ...token,
                text: romanText,
                words: romanWords
            };
        });
    }

    /**
     * Master method: Processes and persists romanization for a single track.
     * Idempotent & cached via sourceHash.
     */
    static async processTrack(trackId: string, force: boolean = false): Promise<{
        success: boolean;
        skipped?: boolean;
        trackTitle?: string;
        lang?: string;
        error?: string;
    }> {
        try {
            const track = await prisma.track.findUnique({
                where: { id: trackId },
                select: {
                    id: true,
                    title: true,
                    lyrics: true,
                    synced_lyrics: true,
                    romanizedLyrics: true,
                    romanizedSyncedLyrics: true,
                    sourceHash: true,
                    language: true
                }
            });

            if (!track) {
                return { success: false, error: 'Track not found' };
            }

            const plainText = track.lyrics || '';
            const syncedTokens = Array.isArray(track.synced_lyrics) ? (track.synced_lyrics as any[]) : [];

            // If track has neither plain lyrics nor synced lyrics, skip
            if (!plainText.trim() && syncedTokens.length === 0) {
                return { success: true, skipped: true, trackTitle: track.title, error: 'No lyrics available' };
            }

            // Detect script
            const detection = this.detectScript(plainText + ' ' + syncedTokens.map(t => t.text || '').join(' '));
            if (!detection.hasNonLatin) {
                // Lyrics are already English/Latin
                return { success: true, skipped: true, trackTitle: track.title, error: 'Already English/Latin' };
            }

            // Compute source hash
            const currentHash = this.computeSourceHash(plainText, track.synced_lyrics);

            // Skip if sourceHash matches and valid romanization already exists
            if (!force && track.sourceHash === currentHash && track.romanizedLyrics && !this.containsNonLatin(track.romanizedLyrics)) {
                return { success: true, skipped: true, trackTitle: track.title, lang: track.language || detection.primaryLanguage };
            }

            console.log(`[Romanization] Processing lyrics for "${track.title}" (${detection.primaryLanguage})...`);

            // 1. Process plain lyrics
            let romanizedPlain: string | null = null;
            let finalLang = detection.primaryLanguage;

            if (plainText.trim()) {
                const res = await this.romanizeLyricsText(plainText, detection.primaryLanguage);
                romanizedPlain = res.romanized;
                finalLang = res.lang;
            }

            // 2. Process synced lyrics
            let romanizedTokens: any = null;
            if (syncedTokens.length > 0) {
                romanizedTokens = await this.romanizeSyncedTokens(syncedTokens, detection.primaryLanguage);
                if (!romanizedPlain && romanizedTokens && Array.isArray(romanizedTokens)) {
                    romanizedPlain = romanizedTokens.map((t: any) => t.text || '').join('\n');
                }
            }

            // 3. Persist to DB
            await prisma.track.update({
                where: { id: trackId },
                data: {
                    romanizedLyrics: romanizedPlain,
                    romanizedSyncedLyrics: romanizedTokens,
                    romanizedLang: finalLang,
                    romanizedAt: new Date(),
                    sourceHash: currentHash
                }
            });

            console.log(`[Romanization] Successfully saved romanized lyrics for "${track.title}" (${finalLang})!`);
            return { success: true, trackTitle: track.title, lang: finalLang };
        } catch (err: any) {
            console.error(`[Romanization] Error processing track ${trackId}:`, err);
            return { success: false, error: err.message };
        }
    }
}
