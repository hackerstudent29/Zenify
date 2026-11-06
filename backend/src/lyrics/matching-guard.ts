import { LyricsDoc, TrackMetadataQuery } from './types';

export interface CandidateMetadata {
  title: string;
  artist: string;
  album?: string;
  duration?: number; // in seconds
  isrc?: string;
  byModel?: boolean;
  raw?: any;
}

export class MatchingGuard {
  public static readonly DEFAULT_DURATION_TOLERANCE_SEC = 3;
  public static readonly MIN_TITLE_SCORE = 0.75;
  public static readonly MIN_ARTIST_SCORE = 0.70;

  /**
   * Normalizes titles by stripping extraneous film credits, remaster tags, and video suffixes.
   */
  static normalizeTitle(title: string): string {
    if (!title) return '';
    let t = title.trim();

    // Remove (From "...") or [From "..."]
    t = t.replace(/\((?:from|soundtrack from|theme from|ost from)[^\)]*\)/gi, '');
    t = t.replace(/\[(?:from|soundtrack from|theme from|ost from)[^\]]*\]/gi, '');

    // Remove - Remastered ..., - 2011 Remaster, etc.
    t = t.replace(/[-–—]\s*(?:\d{4}\s*)?remaster(?:ed)?(?:\s*\d{4})?/gi, '');
    t = t.replace(/\((?:\d{4}\s*)?remaster(?:ed)?(?:\s*\d{4})?\)/gi, '');
    t = t.replace(/\[(?:\d{4}\s*)?remaster(?:ed)?(?:\s*\d{4})?\]/gi, '');

    // Remove (feat. ...) / [feat. ...]
    t = t.replace(/\((?:feat\.|featuring|ft\.)[^\)]*\)/gi, '');
    t = t.replace(/\[(?:feat\.|featuring|ft\.)[^\]]*\]/gi, '');
    t = t.replace(/\b(?:feat\.|featuring|ft\.)\s+[^\(\[\-]+/gi, '');

    // Remove video markers: (Official Audio), [Official Video], (Lyric Video)
    t = t.replace(/\((?:official|lyric|audio|video|music video)[^\)]*\)/gi, '');
    t = t.replace(/\[(?:official|lyric|audio|video|music video)[^\]]*\]/gi, '');

    // Normalize quotes & symbols
    t = t.replace(/['"“”‘’]/g, '');
    t = t.replace(/[\s\-_]+/g, ' ').trim();

    return t.toLowerCase();
  }

  /**
   * Normalizes artist names down to core identifiable tokens.
   */
  static normalizeArtist(artist: string): string {
    if (!artist) return '';
    let a = artist.trim();
    // Take primary artist before comma, &, or feat
    a = a.split(/[,&]/)[0];
    a = a.replace(/\b(?:feat\.|featuring|ft\.)\b.*/i, '');
    a = a.replace(/['"“”‘’]/g, '');
    a = a.replace(/[\s\-_]+/g, ' ').trim();
    return a.toLowerCase();
  }

  /**
   * Detects mismatch between studio original track and remix / live / karaoke versions.
   */
  static isVersionMismatch(queryTitle: string, candidateTitle: string): boolean {
    const qLower = queryTitle.toLowerCase();
    const cLower = candidateTitle.toLowerCase();

    const versionKeywords = [
      'remix',
      'live',
      'acoustic',
      'unplugged',
      'slowed',
      'sped up',
      'instrumental',
      'karaoke',
      'cover',
      'tribute',
      'orchestral',
      'demo'
    ];

    for (const kw of versionKeywords) {
      const qHas = qLower.includes(kw);
      const cHas = cLower.includes(kw);
      // If query does not ask for this version but candidate is this version, reject
      if (!qHas && cHas) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detects whether candidate title or album explicitly indicates another conflicting language.
   */
  static isLanguageConflicted(text: string, expectedLang: string): boolean {
    if (!text || !expectedLang) return false;
    const lowerText = text.toLowerCase();
    const lang = expectedLang.toLowerCase().trim();

    const allLanguages = [
      'tamil', 'telugu', 'hindi', 'malayalam', 'kannada',
      'punjabi', 'bengali', 'marathi', 'bhojpuri', 'gujarati', 'urdu'
    ];

    for (const other of allLanguages) {
      if (other === lang) continue;
      // If other language is explicitly indicated in the text (e.g. "(Telugu)", "[Telugu]", " Telugu ")
      const regex = new RegExp(`[\\(\\[\\s\\-_]${other}[\\)\\]\\s\\-_]|^${other}[\\s\\-_]|[\\s\\-_]${other}$`, 'i');
      if (regex.test(lowerText)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if candidate lyrics content contradicts the expected language
   * using both native script ranges and Romanized tokens.
   */
  static isLyricsLanguageMismatch(lyricsText: string, expectedLang?: string): boolean {
    if (!lyricsText || !expectedLang) return false;
    const lang = expectedLang.toLowerCase().trim();
    if (lang === 'instrumental' || lang === 'other' || lang === 'universal') return false;

    // 1. Native script detection (Unicode ranges)
    const teluguChars = (lyricsText.match(/[\u0c00-\u0c7f]/g) || []).length;
    const tamilChars = (lyricsText.match(/[\u0b80-\u0bff]/g) || []).length;
    const hindiChars = (lyricsText.match(/[\u0900-\u097f]/g) || []).length;
    const malayalamChars = (lyricsText.match(/[\u0d00-\u0d7f]/g) || []).length;
    const kannadaChars = (lyricsText.match(/[\u0c80-\u0cff]/g) || []).length;

    if (lang === 'tamil') {
      if (teluguChars >= 3 && teluguChars > tamilChars) return true;
      if (hindiChars >= 5 && hindiChars > tamilChars) return true;
      if (malayalamChars >= 5 && malayalamChars > tamilChars) return true;
      if (kannadaChars >= 5 && kannadaChars > tamilChars) return true;
    } else if (lang === 'telugu') {
      if (tamilChars >= 3 && tamilChars > teluguChars) return true;
      if (hindiChars >= 5 && hindiChars > teluguChars) return true;
      if (malayalamChars >= 5 && malayalamChars > teluguChars) return true;
      if (kannadaChars >= 5 && kannadaChars > teluguChars) return true;
    } else if (lang === 'hindi') {
      if (tamilChars >= 3 || teluguChars >= 3 || malayalamChars >= 3 || kannadaChars >= 3) return true;
    } else if (lang === 'malayalam') {
      if (tamilChars >= 5 && tamilChars > malayalamChars) return true;
      if (teluguChars >= 3) return true;
    } else if (lang === 'kannada') {
      if (tamilChars >= 3 || teluguChars >= 5 || hindiChars >= 5) return true;
    }

    // 2. Romanized / Latin vocabulary detection
    const lower = lyricsText.toLowerCase();

    const teluguTokens = [
      'nuvvu', 'nuvve', 'nenu', 'meeru', 'chala', 'ledu', 'ledhu', 'undhi', 'undi',
      'chesi', 'cheppina', 'unnanu', 'kavali', 'raavali', 'raavayya', 'raavaiyya', 'chudu',
      'ammai', 'abbayi', 'vachave', 'vachava', 'ledhaiyya', 'chebutha', 'manasulo',
      'cheyyi', 'cheppave', 'ekkada', 'endhuku', 'chusthe', 'chusa', 'kalisi', 'pillada',
      'ippudu', 'anukunna', 'telusa', 'ippude', 'naatho', 'neetho', 'nannu', 'ninnu', 'gunde'
    ];

    const tamilTokens = [
      'machan', 'machatha', 'achatha', 'naan', 'nee', 'enakku', 'unakku', 'enna',
      'edhu', 'epdi', 'solla', 'sonna', 'kooda', 'mattum', 'thaan', 'dhaan', 'uyire',
      'podhum', 'vandhaaye', 'paathu', 'theriyum', 'illai', 'illa', 'illama', 'azhaga',
      'azhage', 'pesum', 'kadhal', 'manasu', 'nillu', 'vaada', 'vaadi', 'aachu', 'pochu',
      'vandha', 'serndha', 'paarvai', 'siricha', 'nenjukulle', 'nenjil', 'kannukulla',
      'kanna', 'kannu', 'vazha', 'therinja', 'irukku', 'irukken', 'vandhuten'
    ];

    const hindiTokens = [
      'mera', 'meri', 'mere', 'tere', 'teri', 'tera', 'hum', 'tum', 'aap', 'kya',
      'kyun', 'nahi', 'nahin', 'hoga', 'hogi', 'karna', 'karo', 'dekha', 'zindagi',
      'ishq', 'pyar', 'baat', 'kuch', 'saath', 'raha', 'rahi', 'karte', 'chahiye',
      'chal', 'bolo', 'aankhon', 'muskuraye', 'dilbar', 'duniya'
    ];

    const countTokens = (tokens: string[]) => {
      let count = 0;
      for (const token of tokens) {
        const regex = new RegExp(`\\b${token}\\b`, 'gi');
        const m = lower.match(regex);
        if (m) count += m.length;
      }
      return count;
    };

    const teluguCount = countTokens(teluguTokens);
    const tamilCount = countTokens(tamilTokens);
    const hindiCount = countTokens(hindiTokens);

    if (lang === 'tamil') {
      if (teluguCount >= 3 && teluguCount > tamilCount * 1.5) return true;
      if (hindiCount >= 4 && hindiCount > tamilCount * 1.5) return true;
    } else if (lang === 'telugu') {
      if (tamilCount >= 3 && tamilCount > teluguCount * 1.5) return true;
      if (hindiCount >= 4 && hindiCount > teluguCount * 1.5) return true;
    } else if (lang === 'hindi') {
      if (tamilCount >= 3 && tamilCount > hindiCount) return true;
      if (teluguCount >= 3 && teluguCount > hindiCount) return true;
    }

    return false;
  }

  /**
   * String similarity using Dice's Coefficient (bigram matching).
   */
  static stringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const s2 = str2.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0.0;

    const bigrams1 = new Map<string, number>();
    for (let i = 0; i < s1.length - 1; i++) {
      const b = s1.substring(i, i + 2);
      bigrams1.set(b, (bigrams1.get(b) || 0) + 1);
    }

    let intersection = 0;
    for (let i = 0; i < s2.length - 1; i++) {
      const b = s2.substring(i, i + 2);
      const count = bigrams1.get(b) || 0;
      if (count > 0) {
        intersection++;
        bigrams1.set(b, count - 1);
      }
    }

    const totalBigrams = (s1.length - 1) + (s2.length - 1);
    return (2.0 * intersection) / totalBigrams;
  }

  /**
   * Scores a candidate against the query track metadata.
   * Returns a score (>= 1000 is match, < 0 is hard rejection).
   */
  static scoreCandidate(
    query: TrackMetadataQuery,
    candidate: CandidateMetadata,
    durationToleranceSec: number = MatchingGuard.DEFAULT_DURATION_TOLERANCE_SEC
  ): number {
    // 1. Direct ISRC Match
    if (query.isrc && candidate.isrc) {
      const qIsrc = query.isrc.trim().toUpperCase();
      const cIsrc = candidate.isrc.trim().toUpperCase();
      if (qIsrc === cIsrc) {
        return 10000;
      }
    }

    // 2. Reject version mismatch (e.g. remix vs original)
    if (MatchingGuard.isVersionMismatch(query.title, candidate.title)) {
      return -9999;
    }

    // 2b. Language conflict rejection
    if (query.language) {
      const targetLang = query.language.toLowerCase().trim();
      if (targetLang && targetLang !== 'instrumental' && targetLang !== 'other' && targetLang !== 'universal') {
        const cTitle = (candidate.title || '').toLowerCase();
        const cAlbum = (candidate.album || '').toLowerCase();

        if (MatchingGuard.isLanguageConflicted(cTitle, targetLang) || MatchingGuard.isLanguageConflicted(cAlbum, targetLang)) {
          return -9999; // Explicit language conflict (e.g. Telugu version when looking for Tamil)
        }

        const candLyrics = candidate.raw?.syncedLyrics || candidate.raw?.plainLyrics || candidate.raw?.lyrics;
        if (candLyrics && typeof candLyrics === 'string') {
          if (MatchingGuard.isLyricsLanguageMismatch(candLyrics, targetLang)) {
            return -9999; // Candidate lyrics text is in the wrong language
          }
        }
      }
    }

    // 3. Duration closeness verification
    if (query.duration && candidate.duration) {
      const diffSec = Math.abs(query.duration - candidate.duration);
      if (diffSec > durationToleranceSec) {
        return -9999; // Hard rejection: duration drift exceeds tolerance
      }
    }

    // 4. Normalized title & artist similarity
    const normQTitle = MatchingGuard.normalizeTitle(query.title);
    const normCTitle = MatchingGuard.normalizeTitle(candidate.title);
    const normQArtist = MatchingGuard.normalizeArtist(query.artist);
    const normCArtist = MatchingGuard.normalizeArtist(candidate.artist);

    const titleSim = MatchingGuard.stringSimilarity(normQTitle, normCTitle);
    const artistSim = MatchingGuard.stringSimilarity(normQArtist, normCArtist);

    if (titleSim < MatchingGuard.MIN_TITLE_SCORE || artistSim < MatchingGuard.MIN_ARTIST_SCORE) {
      return -9999;
    }

    let score = Math.round(titleSim * 1000 + artistSim * 800);

    // Duration bonus
    if (query.duration && candidate.duration) {
      const diffSec = Math.abs(query.duration - candidate.duration);
      if (diffSec <= 1) score += 500;
      else if (diffSec <= 2) score += 300;
      else if (diffSec <= 3) score += 100;
    }

    // Album bonus
    if (query.album && candidate.album) {
      const albumSim = MatchingGuard.stringSimilarity(query.album, candidate.album);
      if (albumSim >= 0.7) score += 200;
    }

    // Prefer human sync over AI sync
    if (candidate.byModel === false) {
      score += 300;
    }

    // Language fidelity bonus
    if (query.language) {
      const targetLang = query.language.toLowerCase().trim();
      const cTitle = (candidate.title || '').toLowerCase();
      const cAlbum = (candidate.album || '').toLowerCase();
      if (cTitle.includes(targetLang) || cAlbum.includes(targetLang)) {
        score += 2500;
      }

      const candLyrics = candidate.raw?.syncedLyrics || candidate.raw?.plainLyrics || candidate.raw?.lyrics;
      if (candLyrics && typeof candLyrics === 'string') {
        if (targetLang === 'tamil' && /[\u0b80-\u0bff]/.test(candLyrics)) score += 4000;
        else if (targetLang === 'telugu' && /[\u0c00-\u0c7f]/.test(candLyrics)) score += 4000;
        else if (targetLang === 'hindi' && /[\u0900-\u097f]/.test(candLyrics)) score += 4000;
        else if (targetLang === 'malayalam' && /[\u0d00-\u0d7f]/.test(candLyrics)) score += 4000;
        else if (targetLang === 'kannada' && /[\u0c80-\u0cff]/.test(candLyrics)) score += 4000;
      }
    }

    return score;
  }

  /**
   * Evaluates candidates and returns the highest scoring valid candidate.
   */
  static pickBestCandidate(
    query: TrackMetadataQuery,
    candidates: CandidateMetadata[],
    durationToleranceSec: number = MatchingGuard.DEFAULT_DURATION_TOLERANCE_SEC
  ): CandidateMetadata | null {
    if (!candidates || candidates.length === 0) return null;

    let bestCandidate: CandidateMetadata | null = null;
    let highestScore = -1;

    for (const cand of candidates) {
      const score = MatchingGuard.scoreCandidate(query, cand, durationToleranceSec);
      if (score > highestScore && score >= 1000) {
        highestScore = score;
        bestCandidate = cand;
      }
    }

    return bestCandidate;
  }

  /**
   * Resolves preference between an AI-synced word doc and a human-synced word doc.
   * If primary is AI-synced (byModel = true) and alternative is human-synced (aiSynced = false),
   * prefer the human sync!
   */
  static resolveSyncPreference(primary: LyricsDoc, alternative?: LyricsDoc | null): LyricsDoc {
    if (!alternative) return primary;

    // Both are word-level
    const primaryIsWord = primary.syncLevel === 'word' || primary.syncLevel === 'ai-word';
    const altIsWord = alternative.syncLevel === 'word' || alternative.syncLevel === 'ai-word';

    if (primaryIsWord && altIsWord) {
      if (primary.aiSynced && !alternative.aiSynced) {
        return alternative; // Prefer human sync!
      }
    }

    return primary;
  }
}

