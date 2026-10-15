/**
 * Indic Rule-Based Transliterator
 * High-fidelity, diacritic-free casual chat transliterator (Tanglish, Hinglish, Tenglish, etc.)
 * Serves as the ultimate guaranteed deterministic fallback when AI models are unavailable or fail validation.
 */

interface ScriptMap {
    vowels: Record<string, string>;
    consonants: Record<string, string>;
    vowelSigns: Record<string, string>;
    virama: string;
    anusvara?: string;
    visarga?: string;
    special?: Record<string, string>;
}

// 1. TAMIL SCRIPT MAP (Tanglish style)
const TAMIL_MAP: ScriptMap = {
    virama: '\u0BCD',
    anusvara: '\u0B82', // Aytham ஃ
    vowels: {
        '\u0B85': 'a', '\u0B86': 'aa', '\u0B87': 'i', '\u0B88': 'ee',
        '\u0B89': 'u', '\u0B8A': 'oo', '\u0B8E': 'e', '\u0B8F': 'ae',
        '\u0B90': 'ai', '\u0B92': 'o', '\u0B93': 'oe', '\u0B94': 'au'
    },
    consonants: {
        '\u0B95': 'k', '\u0B99': 'ng', '\u0B9A': 'ch', '\u0B9E': 'nj',
        '\u0B9F': 't', '\u0BA3': 'n', '\u0BA4': 'th', '\u0BA8': 'n',
        '\u0BA9': 'n', '\u0BAA': 'p', '\u0BAE': 'm', '\u0BAF': 'y',
        '\u0BB0': 'r', '\u0BB1': 'r', '\u0BB2': 'l', '\u0BB3': 'l',
        '\u0BB4': 'zh', '\u0BB5': 'v', '\u0BB6': 'sh', '\u0BB7': 'sh',
        '\u0BB8': 's', '\u0BB9': 'h'
    },
    vowelSigns: {
        '\u0BBE': 'aa', '\u0BBF': 'i', '\u0BC0': 'ee', '\u0BC1': 'u',
        '\u0BC2': 'oo', '\u0BC6': 'e', '\u0BC7': 'ae', '\u0BC8': 'ai',
        '\u0BCA': 'o', '\u0BCB': 'oe', '\u0BCC': 'au'
    },
    special: {
        '\u0B83': 'ak' // ஃ (aytham)
    }
};

// 2. DEVANAGARI SCRIPT MAP (Hinglish style)
const DEVANAGARI_MAP: ScriptMap = {
    virama: '\u094D',
    anusvara: '\u0902',
    visarga: '\u0903',
    vowels: {
        '\u0905': 'a', '\u0906': 'aa', '\u0907': 'i', '\u0908': 'ee',
        '\u0909': 'u', '\u090A': 'oo', '\u090B': 'ri', '\u090F': 'e',
        '\u0910': 'ai', '\u0913': 'o', '\u0914': 'au'
    },
    consonants: {
        '\u0915': 'k', '\u0916': 'kh', '\u0917': 'g', '\u0918': 'gh', '\u0919': 'ng',
        '\u091A': 'ch', '\u091B': 'chh', '\u091C': 'j', '\u091D': 'jh', '\u091E': 'ny',
        '\u091F': 't', '\u0920': 'th', '\u0921': 'd', '\u0922': 'dh', '\u0923': 'n',
        '\u0924': 't', '\u0925': 'th', '\u0926': 'd', '\u0927': 'dh', '\u0928': 'n',
        '\u092A': 'p', '\u092B': 'ph', '\u092C': 'b', '\u092D': 'bh', '\u092E': 'm',
        '\u092F': 'y', '\u0930': 'r', '\u0932': 'l', '\u0933': 'l', '\u0935': 'v',
        '\u0936': 'sh', '\u0937': 'sh', '\u0938': 's', '\u0939': 'h',
        '\u0958': 'q', '\u0959': 'kh', '\u095A': 'gh', '\u095B': 'z', '\u095C': 'r',
        '\u095D': 'rh', '\u095E': 'f', '\u095F': 'y'
    },
    vowelSigns: {
        '\u093E': 'aa', '\u093F': 'i', '\u0940': 'ee', '\u0941': 'u',
        '\u0942': 'oo', '\u0943': 'ri', '\u0947': 'e', '\u0948': 'ai',
        '\u094B': 'o', '\u094C': 'au'
    },
    special: {
        '\u0901': 'n', // candrabindu
        '\u0902': 'n', // anusvara
        '\u0903': 'h'  // visarga
    }
};

// 3. TELUGU SCRIPT MAP (Tenglish style)
const TELUGU_MAP: ScriptMap = {
    virama: '\u0C4D',
    vowels: {
        '\u0C05': 'a', '\u0C06': 'aa', '\u0C07': 'i', '\u0C08': 'ee',
        '\u0C09': 'u', '\u0C0A': 'oo', '\u0C0B': 'ru', '\u0C0E': 'e',
        '\u0C0F': 'ae', '\u0C10': 'ai', '\u0C12': 'o', '\u0C13': 'oe',
        '\u0C14': 'au'
    },
    consonants: {
        '\u0C15': 'k', '\u0C16': 'kh', '\u0C17': 'g', '\u0C18': 'gh', '\u0C19': 'ng',
        '\u0C1A': 'ch', '\u0C1B': 'chh', '\u0C1C': 'j', '\u0C1D': 'jh', '\u0C1E': 'ny',
        '\u0C1F': 't', '\u0C20': 'th', '\u0C21': 'd', '\u0C22': 'dh', '\u0C23': 'n',
        '\u0C24': 'th', '\u0C25': 'th', '\u0C26': 'd', '\u0C27': 'dh', '\u0C28': 'n',
        '\u0C2A': 'p', '\u0C2B': 'ph', '\u0C2C': 'b', '\u0C2D': 'bh', '\u0C2E': 'm',
        '\u0C2F': 'y', '\u0C30': 'r', '\u0C31': 'r', '\u0C32': 'l', '\u0C33': 'l',
        '\u0C35': 'v', '\u0C36': 'sh', '\u0C37': 'sh', '\u0C38': 's', '\u0C39': 'h'
    },
    vowelSigns: {
        '\u0C3E': 'aa', '\u0C3F': 'i', '\u0C40': 'ee', '\u0C41': 'u',
        '\u0C42': 'oo', '\u0C43': 'ru', '\u0C46': 'e', '\u0C47': 'ae',
        '\u0C48': 'ai', '\u0C4A': 'o', '\u0C4B': 'oe', '\u0C4C': 'au'
    },
    special: {
        '\u0C02': 'm',
        '\u0C03': 'h'
    }
};

// 4. KANNADA SCRIPT MAP (Kanglish style)
const KANNADA_MAP: ScriptMap = {
    virama: '\u0CCD',
    vowels: {
        '\u0C85': 'a', '\u0C86': 'aa', '\u0C87': 'i', '\u0C88': 'ee',
        '\u0C89': 'u', '\u0C8A': 'oo', '\u0C8B': 'ru', '\u0C8E': 'e',
        '\u0C8F': 'ae', '\u0C90': 'ai', '\u0C92': 'o', '\u0C93': 'oe',
        '\u0C94': 'au'
    },
    consonants: {
        '\u0C95': 'k', '\u0C96': 'kh', '\u0C97': 'g', '\u0C98': 'gh', '\u0C99': 'ng',
        '\u0C9A': 'ch', '\u0C9B': 'chh', '\u0C9C': 'j', '\u0C9D': 'jh', '\u0C9E': 'ny',
        '\u0C9F': 't', '\u0CA0': 'th', '\u0CA1': 'd', '\u0CA2': 'dh', '\u0CA3': 'n',
        '\u0CA4': 'th', '\u0CA5': 'th', '\u0CA6': 'd', '\u0CA7': 'dh', '\u0CA8': 'n',
        '\u0CAA': 'p', '\u0CAB': 'ph', '\u0CAC': 'b', '\u0CAD': 'bh', '\u0CAE': 'm',
        '\u0CAF': 'y', '\u0CB0': 'r', '\u0CB1': 'r', '\u0CB2': 'l', '\u0CB3': 'l',
        '\u0CB5': 'v', '\u0CB6': 'sh', '\u0CB7': 'sh', '\u0CB8': 's', '\u0CB9': 'h'
    },
    vowelSigns: {
        '\u0CBE': 'aa', '\u0CBF': 'i', '\u0CC0': 'ee', '\u0CC1': 'u',
        '\u0CC2': 'oo', '\u0CC3': 'ru', '\u0CC6': 'e', '\u0CC7': 'ae',
        '\u0CC8': 'ai', '\u0CCA': 'o', '\u0CCB': 'oe', '\u0CCC': 'au'
    },
    special: {
        '\u0C82': 'm',
        '\u0C83': 'h'
    }
};

// 5. MALAYALAM SCRIPT MAP (Manglish style)
const MALAYALAM_MAP: ScriptMap = {
    virama: '\u0D4D',
    vowels: {
        '\u0D05': 'a', '\u0D06': 'aa', '\u0D07': 'i', '\u0D08': 'ee',
        '\u0D09': 'u', '\u0D0A': 'oo', '\u0D0B': 'ru', '\u0D0E': 'e',
        '\u0D0F': 'ae', '\u0D10': 'ai', '\u0D12': 'o', '\u0D13': 'oe',
        '\u0D14': 'au'
    },
    consonants: {
        '\u0D15': 'k', '\u0D16': 'kh', '\u0D17': 'g', '\u0D18': 'gh', '\u0D19': 'ng',
        '\u0D1A': 'ch', '\u0D1B': 'chh', '\u0D1C': 'j', '\u0D1D': 'jh', '\u0D1E': 'nj',
        '\u0D1F': 't', '\u0D20': 'th', '\u0D21': 'd', '\u0D22': 'dh', '\u0D23': 'n',
        '\u0D24': 'th', '\u0D25': 'th', '\u0D26': 'd', '\u0D27': 'dh', '\u0D28': 'n',
        '\u0D2A': 'p', '\u0D2B': 'ph', '\u0D2C': 'b', '\u0D2D': 'bh', '\u0D2E': 'm',
        '\u0D2F': 'y', '\u0D30': 'r', '\u0D31': 'r', '\u0D32': 'l', '\u0D33': 'l',
        '\u0D34': 'zh', '\u0D35': 'v', '\u0D36': 'sh', '\u0D37': 'sh', '\u0D38': 's',
        '\u0D39': 'h',
        // Chillu characters
        '\u0D7A': 'rn', '\u0D7B': 'r', '\u0D7C': 'l', '\u0D7D': 'l', '\u0D7E': 'k', '\u0D7F': 'n'
    },
    vowelSigns: {
        '\u0D3E': 'aa', '\u0D3F': 'i', '\u0D40': 'ee', '\u0D41': 'u',
        '\u0D42': 'oo', '\u0D43': 'ru', '\u0D46': 'e', '\u0D47': 'ae',
        '\u0D48': 'ai', '\u0D4A': 'o', '\u0D4B': 'oe', '\u0D4C': 'au'
    },
    special: {
        '\u0D02': 'm',
        '\u0D03': 'h'
    }
};

// 6. BENGALI SCRIPT MAP
const BENGALI_MAP: ScriptMap = {
    virama: '\u09CD',
    vowels: {
        '\u0985': 'o', '\u0986': 'aa', '\u0987': 'i', '\u0988': 'ee',
        '\u0989': 'u', '\u098A': 'oo', '\u098B': 'ri', '\u098F': 'e',
        '\u0990': 'oi', '\u0993': 'o', '\u0994': 'ou'
    },
    consonants: {
        '\u0995': 'k', '\u0996': 'kh', '\u0997': 'g', '\u0998': 'gh', '\u0999': 'ng',
        '\u099A': 'ch', '\u099B': 'chh', '\u099C': 'j', '\u099D': 'jh', '\u099E': 'ny',
        '\u099F': 't', '\u09A0': 'th', '\u09A1': 'd', '\u09A2': 'dh', '\u09A3': 'n',
        '\u09A4': 't', '\u09A5': 'th', '\u09A6': 'd', '\u09A7': 'dh', '\u09A8': 'n',
        '\u09AA': 'p', '\u09AB': 'ph', '\u09AC': 'b', '\u09AD': 'bh', '\u09AE': 'm',
        '\u09AF': 'j', '\u09B0': 'r', '\u09B2': 'l', '\u09B6': 'sh', '\u09B7': 'sh',
        '\u09B8': 's', '\u09B9': 'h', '\u09DC': 'r', '\u09DD': 'rh', '\u09DF': 'y'
    },
    vowelSigns: {
        '\u09BE': 'aa', '\u09BF': 'i', '\u09C0': 'ee', '\u09C1': 'u',
        '\u09C2': 'oo', '\u09C3': 'ri', '\u09C7': 'e', '\u09C8': 'oi',
        '\u09CB': 'o', '\u09CC': 'ou'
    },
    special: {
        '\u0981': 'n',
        '\u0982': 'ng',
        '\u0983': 'h'
    }
};

// 7. GURMUKHI (PUNJABI) SCRIPT MAP
const GURMUKHI_MAP: ScriptMap = {
    virama: '\u0A4D',
    vowels: {
        '\u0A05': 'a', '\u0A06': 'aa', '\u0A07': 'i', '\u0A08': 'ee',
        '\u0A09': 'u', '\u0A0A': 'oo', '\u0A0F': 'e', '\u0A10': 'ai',
        '\u0A13': 'o', '\u0A14': 'au'
    },
    consonants: {
        '\u0A15': 'k', '\u0A16': 'kh', '\u0A17': 'g', '\u0A18': 'gh', '\u0A19': 'ng',
        '\u0A1A': 'ch', '\u0A1B': 'chh', '\u0A1C': 'j', '\u0A1D': 'jh', '\u0A1E': 'ny',
        '\u0A1F': 't', '\u0A20': 'th', '\u0A21': 'd', '\u0A22': 'dh', '\u0A23': 'n',
        '\u0A24': 't', '\u0A25': 'th', '\u0A26': 'd', '\u0A27': 'dh', '\u0A28': 'n',
        '\u0A2A': 'p', '\u0A2B': 'ph', '\u0A2C': 'b', '\u0A2D': 'bh', '\u0A2E': 'm',
        '\u0A2F': 'y', '\u0A30': 'r', '\u0A32': 'l', '\u0A35': 'v', '\u0A38': 's', '\u0A39': 'h'
    },
    vowelSigns: {
        '\u0A3E': 'aa', '\u0A3F': 'i', '\u0A40': 'ee', '\u0A41': 'u',
        '\u0A42': 'oo', '\u0A47': 'e', '\u0A48': 'ai', '\u0A4B': 'o', '\u0A4C': 'au'
    },
    special: {
        '\u0A02': 'n',
        '\u0A70': 'n',
        '\u0A71': '' // Adhak (doubles consonant)
    }
};

// 8. GUJARATI SCRIPT MAP
const GUJARATI_MAP: ScriptMap = {
    virama: '\u0ACD',
    vowels: {
        '\u0A85': 'a', '\u0A86': 'aa', '\u0A87': 'i', '\u0A88': 'ee',
        '\u0A89': 'u', '\u0A8A': 'oo', '\u0A8F': 'e', '\u0A90': 'ai',
        '\u0A93': 'o', '\u0A94': 'au'
    },
    consonants: {
        '\u0A95': 'k', '\u0A96': 'kh', '\u0A97': 'g', '\u0A98': 'gh',
        '\u0A9A': 'ch', '\u0A9B': 'chh', '\u0A9C': 'j', '\u0A9D': 'jh',
        '\u0A9F': 't', '\u0AA0': 'th', '\u0AA1': 'd', '\u0AA2': 'dh', '\u0AA3': 'n',
        '\u0AA4': 't', '\u0AA5': 'th', '\u0AA6': 'd', '\u0AA7': 'dh', '\u0AA8': 'n',
        '\u0AAA': 'p', '\u0AAB': 'ph', '\u0AAC': 'b', '\u0AAD': 'bh', '\u0AAE': 'm',
        '\u0AAF': 'y', '\u0AB0': 'r', '\u0AB2': 'l', '\u0AB3': 'l', '\u0AB5': 'v',
        '\u0AB6': 'sh', '\u0AB7': 'sh', '\u0AB8': 's', '\u0AB9': 'h'
    },
    vowelSigns: {
        '\u0ABE': 'aa', '\u0ABF': 'i', '\u0AC0': 'ee', '\u0AC1': 'u',
        '\u0AC2': 'oo', '\u0AC7': 'e', '\u0AC8': 'ai', '\u0ACB': 'o', '\u0ACC': 'au'
    },
    special: {
        '\u0A81': 'n',
        '\u0A82': 'n',
        '\u0A83': 'h'
    }
};

function getScriptMapForChar(ch: string): { map: ScriptMap; lang: string } | null {
    const code = ch.charCodeAt(0);
    if (code >= 0x0B80 && code <= 0x0BFF) return { map: TAMIL_MAP, lang: 'Tanglish' };
    if (code >= 0x0900 && code <= 0x097F) return { map: DEVANAGARI_MAP, lang: 'Hinglish' };
    if (code >= 0x0C00 && code <= 0x0C7F) return { map: TELUGU_MAP, lang: 'Tenglish' };
    if (code >= 0x0C80 && code <= 0x0CFF) return { map: KANNADA_MAP, lang: 'Kanglish' };
    if (code >= 0x0D00 && code <= 0x0D7F) return { map: MALAYALAM_MAP, lang: 'Manglish' };
    if (code >= 0x0980 && code <= 0x09FF) return { map: BENGALI_MAP, lang: 'Bengali' };
    if (code >= 0x0A00 && code <= 0x0A7F) return { map: GURMUKHI_MAP, lang: 'Punjabi' };
    if (code >= 0x0A80 && code <= 0x0AFF) return { map: GUJARATI_MAP, lang: 'Gujarati' };
    return null;
}

/**
 * Transliterates a single line of text deterministically using linguistic phonetic rules.
 * Handles mixed scripts word-by-word while keeping English words, punctuation, and tags unchanged.
 */
export function transliterateLineRuleBased(line: string): string {
    let result = '';
    let i = 0;

    while (i < line.length) {
        const char = line[i];
        const scriptInfo = getScriptMapForChar(char);

        if (!scriptInfo) {
            // Keep English / ASCII / Latin / Punctuation as-is
            result += char;
            i++;
            continue;
        }

        const { map } = scriptInfo;

        // Check special symbols
        if (map.special && map.special[char]) {
            result += map.special[char];
            i++;
            continue;
        }

        // Check independent vowels
        if (map.vowels[char]) {
            result += map.vowels[char];
            i++;
            continue;
        }

        // Check consonants
        if (map.consonants[char]) {
            const baseConsonant = map.consonants[char];
            const nextChar = i + 1 < line.length ? line[i + 1] : null;

            if (nextChar === map.virama) {
                // Pure consonant without vowel
                result += baseConsonant;
                i += 2; // skip consonant and virama
                continue;
            } else if (nextChar && map.vowelSigns[nextChar]) {
                // Consonant + explicit vowel sign
                result += baseConsonant + map.vowelSigns[nextChar];
                i += 2; // skip consonant and vowel sign
                continue;
            } else {
                // Implicit vowel 'a'
                // In conversational Tanglish/Hinglish, final consonant in a word or followed by space often drops implicit 'a'
                const charAfter = nextChar;
                const isWordEnd = !charAfter || /\s|[.,!?;:'"()[\]{}]/.test(charAfter);
                
                // If it's Tamil, words ending in 'm', 'n', 'r', 'l' typically drop 'a'
                if (isWordEnd && ['m', 'n', 'r', 'l', 'y', 'v', 'zh'].includes(baseConsonant)) {
                    result += baseConsonant;
                } else {
                    result += baseConsonant + 'a';
                }
                i++;
                continue;
            }
        }

        // If vowel sign is standalone (rare corruption)
        if (map.vowelSigns[char]) {
            result += map.vowelSigns[char];
            i++;
            continue;
        }

        // Catch-all
        result += char;
        i++;
    }

    // Capitalize first letter of line for casual readability if it's lower
    return result.replace(/([,;:!?])([A-Za-z0-9])/g, '$1 $2').replace(/\s+/g, ' ').trim();
}

/**
 * Transliterates full multi-line text using rule-based engine.
 */
export function transliterateTextRuleBased(text: string): string {
    const lines = text.split('\n');
    return lines.map(line => transliterateLineRuleBased(line)).join('\n');
}
