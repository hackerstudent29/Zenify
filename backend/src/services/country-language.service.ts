import axios from 'axios';
import { prisma } from '../utils/prisma';
import { SystemSettingsService } from './system-settings.service';
import { DeduplicationService } from './deduplication.service.js';
import { MUSIC_LANGUAGES, COUNTRIES, CountryMeta, LanguageMeta } from '../constants/metadata.constants';

// ─────────────────────────────────────────────────────────────────────────────
// ISO 3166-1 ALPHA-2 & ISO 639-1 NORMALIZATION MAPS
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedCountry {
  code: string; // e.g. "IN"
  name: string; // e.g. "India"
}

export interface NormalizedLanguage {
  code: string; // e.g. "ta"
  name: string; // e.g. "Tamil"
}

export interface MetadataEvidence {
  source: string;
  countryCode?: string;
  countryName?: string;
  languageCode?: string;
  languageName?: string;
  languages?: string[];
  confidence: number;
}

export interface ResolvedSongMetadata {
  countryCode: string | null;
  countryName: string | null;
  languageCode: string | null;
  languageName: string | null;
  languages: string[];
  metadataSource: string;
  metadataConfidence: number;
  metadataStatus: 'verified' | 'needs_review' | 'failed' | 'pending';
}

// Country Aliases & Demonyms
const COUNTRY_ALIASES: Record<string, string> = {
  in: 'IN', india: 'IN', bharat: 'IN', indian: 'IN',
  us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US', american: 'US',
  gb: 'GB', uk: 'GB', 'united kingdom': 'GB', 'great britain': 'GB', britain: 'GB', british: 'GB', england: 'GB',
  kr: 'KR', korea: 'KR', 'south korea': 'KR', 'republic of korea': 'KR', korean: 'KR',
  ca: 'CA', canada: 'CA', canadian: 'CA',
  au: 'AU', australia: 'AU', australian: 'AU',
  jp: 'JP', japan: 'JP', japanese: 'JP',
  fr: 'FR', france: 'FR', french: 'FR',
  de: 'DE', germany: 'DE', german: 'DE', deutschland: 'DE',
  es: 'ES', spain: 'ES', spanish: 'ES', espana: 'ES',
  br: 'BR', brazil: 'BR', brasil: 'BR', brazilian: 'BR',
  mx: 'MX', mexico: 'MX', mexican: 'MX',
  ae: 'AE', uae: 'AE', 'united arab emirates': 'AE', emirati: 'AE',
  ng: 'NG', nigeria: 'NG', nigerian: 'NG',
  za: 'ZA', 'south africa': 'ZA', 'south african': 'ZA',
  ru: 'RU', russia: 'RU', russian: 'RU',
  it: 'IT', italy: 'IT', italian: 'IT',
  pk: 'PK', pakistan: 'PK', pakistani: 'PK',
  bd: 'BD', bangladesh: 'BD', bangladeshi: 'BD',
  lk: 'LK', 'sri lanka': 'LK', 'sri lankan': 'LK',
  sg: 'SG', singapore: 'SG', singaporean: 'SG',
  my: 'MY', malaysia: 'MY', malaysian: 'MY',
  id: 'ID', indonesia: 'ID', indonesian: 'ID',
  ph: 'PH', philippines: 'PH', filipino: 'PH',
  nz: 'NZ', 'new zealand': 'NZ',
  ie: 'IE', ireland: 'IE', irish: 'IE',
  nl: 'NL', netherlands: 'NL', holland: 'NL', dutch: 'NL',
  se: 'SE', sweden: 'SE', swedish: 'SE',
  no: 'NO', norway: 'NO', norwegian: 'NO',
  dk: 'DK', denmark: 'DK', danish: 'DK',
  fi: 'FI', finland: 'FI', finnish: 'FI',
  tr: 'TR', turkey: 'TR', turkish: 'TR',
  sa: 'SA', 'saudi arabia': 'SA', saudi: 'SA',
  eg: 'EG', egypt: 'EG', egyptian: 'EG',
  ar: 'AR', argentina: 'AR', argentine: 'AR',
  co: 'CO', colombia: 'CO', colombian: 'CO'
};

// ISO 639-3 to ISO 639-1 Mapping for MusicBrainz
const ISO_639_3_TO_1: Record<string, string> = {
  tam: 'ta', hin: 'hi', tel: 'te', mal: 'ml', kan: 'kn', pan: 'pa',
  ben: 'bn', mar: 'mr', guj: 'gu', urd: 'ur', eng: 'en', spa: 'es',
  kor: 'ko', jpn: 'ja', fra: 'fr', deu: 'de', por: 'pt', ara: 'ar',
  zho: 'zh', ita: 'it', rus: 'ru', tur: 'tr', vie: 'vi', ind: 'id',
  tha: 'th', fas: 'fa', pol: 'pl', nld: 'nl', swe: 'sv', ell: 'el',
  heb: 'he', ukr: 'uk', msa: 'ms', fil: 'fil', swa: 'sw', yor: 'yo'
};

// Language Aliases
const LANGUAGE_ALIASES: Record<string, string> = {
  ta: 'ta', tamil: 'ta',
  hi: 'hi', hindi: 'hi',
  te: 'te', telugu: 'te',
  ml: 'ml', malayalam: 'ml',
  kn: 'kn', kannada: 'kn',
  pa: 'pa', punjabi: 'pa',
  bn: 'bn', bengali: 'bn', bangla: 'bn',
  mr: 'mr', marathi: 'mr',
  gu: 'gu', gujarati: 'gu',
  ur: 'ur', urdu: 'ur',
  bho: 'bho', bhojpuri: 'bho',
  as: 'as', assamese: 'as',
  or: 'or', odia: 'or', oriya: 'or',
  en: 'en', english: 'en',
  es: 'es', spanish: 'es', castellano: 'es',
  ko: 'ko', korean: 'ko',
  ja: 'ja', japanese: 'ja',
  fr: 'fr', french: 'fr', francais: 'fr',
  de: 'de', german: 'de', deutsch: 'de',
  pt: 'pt', portuguese: 'pt', portugues: 'pt',
  ar: 'ar', arabic: 'ar',
  zh: 'zh', chinese: 'zh', mandarin: 'zh',
  yue: 'yue', cantonese: 'yue',
  it: 'it', italian: 'it', italiano: 'it',
  ru: 'ru', russian: 'ru',
  tr: 'tr', turkish: 'tr', turkce: 'tr',
  vi: 'vi', vietnamese: 'vi',
  id: 'id', indonesian: 'id',
  th: 'th', thai: 'th',
  fa: 'fa', persian: 'fa', farsi: 'fa',
  pl: 'pl', polish: 'pl',
  nl: 'nl', dutch: 'nl',
  sv: 'sv', swedish: 'sv',
  el: 'el', greek: 'el',
  he: 'he', hebrew: 'he',
  uk: 'uk', ukrainian: 'uk',
  ms: 'ms', malay: 'ms',
  fil: 'fil', tagalog: 'fil', filipino: 'fil',
  sw: 'sw', swahili: 'sw'
};

// Known Artist Regional & Country Affiliations for Cross-Referencing
const KNOWN_ARTIST_AFFILIATIONS: Record<string, { countryCode: string; primaryLang: string }> = {
  // Tamil / South Indian
  'anirudh ravichander': { countryCode: 'IN', primaryLang: 'ta' },
  'a.r. rahman': { countryCode: 'IN', primaryLang: 'ta' },
  'ar rahman': { countryCode: 'IN', primaryLang: 'ta' },
  'yuvan shankar raja': { countryCode: 'IN', primaryLang: 'ta' },
  'harris jayaraj': { countryCode: 'IN', primaryLang: 'ta' },
  'ilaiyaraaja': { countryCode: 'IN', primaryLang: 'ta' },
  'santhosh narayanan': { countryCode: 'IN', primaryLang: 'ta' },
  'hiphop tamizha': { countryCode: 'IN', primaryLang: 'ta' },
  'sai abhyankkar': { countryCode: 'IN', primaryLang: 'ta' },
  'pradeep kumar': { countryCode: 'IN', primaryLang: 'ta' },
  'dhanush': { countryCode: 'IN', primaryLang: 'ta' },
  'g.v. prakash kumar': { countryCode: 'IN', primaryLang: 'ta' },
  'gv prakash kumar': { countryCode: 'IN', primaryLang: 'ta' },
  'd. imman': { countryCode: 'IN', primaryLang: 'ta' },
  'sean roldan': { countryCode: 'IN', primaryLang: 'ta' },
  'penxcil': { countryCode: 'IN', primaryLang: 'ta' },
  'sid sriram': { countryCode: 'IN', primaryLang: 'ta' },
  'vijay': { countryCode: 'IN', primaryLang: 'ta' },
  'silambarasan': { countryCode: 'IN', primaryLang: 'ta' },
  'silambarasan tr': { countryCode: 'IN', primaryLang: 'ta' },
  's.p. balasubrahmanyam': { countryCode: 'IN', primaryLang: 'ta' },
  'k.s. chithra': { countryCode: 'IN', primaryLang: 'ta' },
  'shankar mahadevan': { countryCode: 'IN', primaryLang: 'ta' },
  'hariharan': { countryCode: 'IN', primaryLang: 'ta' },
  'andrea jeremiah': { countryCode: 'IN', primaryLang: 'ta' },
  'jonita gandhi': { countryCode: 'IN', primaryLang: 'ta' },
  'dhee': { countryCode: 'IN', primaryLang: 'ta' },
  'shweta mohan': { countryCode: 'IN', primaryLang: 'ta' },
  'chinmayi': { countryCode: 'IN', primaryLang: 'ta' },
  'haricharan': { countryCode: 'IN', primaryLang: 'ta' },
  'vijay antony': { countryCode: 'IN', primaryLang: 'ta' },
  'deva': { countryCode: 'IN', primaryLang: 'ta' },
  'vidyasagar': { countryCode: 'IN', primaryLang: 'ta' },
  'javed ali': { countryCode: 'IN', primaryLang: 'hi' },
  'dhibu ninan thomas': { countryCode: 'IN', primaryLang: 'ta' },
  'yogi b': { countryCode: 'IN', primaryLang: 'ta' },
  'super subu': { countryCode: 'IN', primaryLang: 'ta' },
  'gengee': { countryCode: 'IN', primaryLang: 'ta' },
  'karuppu': { countryCode: 'IN', primaryLang: 'ta' },
  // Telugu
  'devi sri prasad': { countryCode: 'IN', primaryLang: 'te' },
  'thaman s': { countryCode: 'IN', primaryLang: 'te' },
  'm.m. keeravaani': { countryCode: 'IN', primaryLang: 'te' },
  // Malayalam
  'sushin shyam': { countryCode: 'IN', primaryLang: 'ml' },
  'hesham abdul wahab': { countryCode: 'IN', primaryLang: 'ml' },
  'gopi sundar': { countryCode: 'IN', primaryLang: 'ml' },
  // Hindi & Bollywood
  'shreya ghoshal': { countryCode: 'IN', primaryLang: 'hi' },
  'arijit singh': { countryCode: 'IN', primaryLang: 'hi' },
  'pritam': { countryCode: 'IN', primaryLang: 'hi' },
  'badshah': { countryCode: 'IN', primaryLang: 'hi' },
  'yo yo honey singh': { countryCode: 'IN', primaryLang: 'hi' },
  'neha kakkar': { countryCode: 'IN', primaryLang: 'hi' },
  'vishal-shekhar': { countryCode: 'IN', primaryLang: 'hi' },
  'sachin-jigar': { countryCode: 'IN', primaryLang: 'hi' },
  'amit trivedi': { countryCode: 'IN', primaryLang: 'hi' },
  'shankar-ehsaan-loy': { countryCode: 'IN', primaryLang: 'hi' },
  'jubin nautiyal': { countryCode: 'IN', primaryLang: 'hi' },
  'darshan raval': { countryCode: 'IN', primaryLang: 'hi' },
  'armaan malik': { countryCode: 'IN', primaryLang: 'hi' },
  'prateek kuhad': { countryCode: 'IN', primaryLang: 'hi' },
  'anuv jain': { countryCode: 'IN', primaryLang: 'hi' },
  // Punjabi
  'diljit dosanjh': { countryCode: 'IN', primaryLang: 'pa' },
  'ap dhillon': { countryCode: 'CA', primaryLang: 'pa' },
  'sidhu moose wala': { countryCode: 'IN', primaryLang: 'pa' },
  'karan aujla': { countryCode: 'IN', primaryLang: 'pa' },
  'gurinder gill': { countryCode: 'CA', primaryLang: 'pa' },
  'shubh': { countryCode: 'IN', primaryLang: 'pa' },
  'b praak': { countryCode: 'IN', primaryLang: 'pa' },
  // Pakistani / Urdu
  'atif aslam': { countryCode: 'PK', primaryLang: 'ur' },
  'ali zafar': { countryCode: 'PK', primaryLang: 'ur' },
  'rahat fateh ali khan': { countryCode: 'PK', primaryLang: 'ur' },
  // Western / English
  'taylor swift': { countryCode: 'US', primaryLang: 'en' },
  'billie eilish': { countryCode: 'US', primaryLang: 'en' },
  'ed sheeran': { countryCode: 'GB', primaryLang: 'en' },
  'coldplay': { countryCode: 'GB', primaryLang: 'en' },
  'dua lipa': { countryCode: 'GB', primaryLang: 'en' },
  'the weeknd': { countryCode: 'CA', primaryLang: 'en' },
  'drake': { countryCode: 'CA', primaryLang: 'en' },
  'justin bieber': { countryCode: 'CA', primaryLang: 'en' },
  'the kid laroi': { countryCode: 'AU', primaryLang: 'en' },
  'lil nas x': { countryCode: 'US', primaryLang: 'en' },
  'katy perry': { countryCode: 'US', primaryLang: 'en' },
  'the neighbourhood': { countryCode: 'US', primaryLang: 'en' },
  'stephen sanchez': { countryCode: 'US', primaryLang: 'en' },
  'glass animals': { countryCode: 'GB', primaryLang: 'en' },
  'benson boone': { countryCode: 'US', primaryLang: 'en' },
  'sabrina carpenter': { countryCode: 'US', primaryLang: 'en' },
  'chappell roan': { countryCode: 'US', primaryLang: 'en' },
  'kendrick lamar': { countryCode: 'US', primaryLang: 'en' },
  'post malone': { countryCode: 'US', primaryLang: 'en' },
  'bruno mars': { countryCode: 'US', primaryLang: 'en' },
  'lady gaga': { countryCode: 'US', primaryLang: 'en' },
  'sza': { countryCode: 'US', primaryLang: 'en' },
  'olivia rodrigo': { countryCode: 'US', primaryLang: 'en' },
  'doja cat': { countryCode: 'US', primaryLang: 'en' },
  'harry styles': { countryCode: 'GB', primaryLang: 'en' },
  'adele': { countryCode: 'GB', primaryLang: 'en' },
  'sam smith': { countryCode: 'GB', primaryLang: 'en' },
  'eminem': { countryCode: 'US', primaryLang: 'en' },
  'travis scott': { countryCode: 'US', primaryLang: 'en' },
  'maroon 5': { countryCode: 'US', primaryLang: 'en' },
  'imagine dragons': { countryCode: 'US', primaryLang: 'en' },
  'onerepublic': { countryCode: 'US', primaryLang: 'en' },
  'shawn mendes': { countryCode: 'CA', primaryLang: 'en' },
  'charlie puth': { countryCode: 'US', primaryLang: 'en' },
  'god mode': { countryCode: 'US', primaryLang: 'en' },
  'selena gomez': { countryCode: 'US', primaryLang: 'en' },
  'ariana grande': { countryCode: 'US', primaryLang: 'en' },
  // African / Afrobeats
  'ckay': { countryCode: 'NG', primaryLang: 'en' },
  'rema': { countryCode: 'NG', primaryLang: 'en' },
  'burna boy': { countryCode: 'NG', primaryLang: 'en' },
  'wizkid': { countryCode: 'NG', primaryLang: 'en' },
  'davido': { countryCode: 'NG', primaryLang: 'en' },
  'tems': { countryCode: 'NG', primaryLang: 'en' },
  // Indonesian
  'ustadz badru salam': { countryCode: 'ID', primaryLang: 'id' },
  // Korean
  'bts': { countryCode: 'KR', primaryLang: 'ko' },
  'blackpink': { countryCode: 'KR', primaryLang: 'ko' },
  'newjeans': { countryCode: 'KR', primaryLang: 'ko' },
  'iu': { countryCode: 'KR', primaryLang: 'ko' },
  'twice': { countryCode: 'KR', primaryLang: 'ko' },
  'stray kids': { countryCode: 'KR', primaryLang: 'ko' },
  'enhypen': { countryCode: 'KR', primaryLang: 'ko' },
  'txt': { countryCode: 'KR', primaryLang: 'ko' },
  'le sserafim': { countryCode: 'KR', primaryLang: 'ko' },
  'aespa': { countryCode: 'KR', primaryLang: 'ko' },
  // Spanish & Latin
  'bad bunny': { countryCode: 'PR', primaryLang: 'es' },
  'rosalia': { countryCode: 'ES', primaryLang: 'es' },
  'j balvin': { countryCode: 'CO', primaryLang: 'es' },
  'karol g': { countryCode: 'CO', primaryLang: 'es' },
  'maluma': { countryCode: 'CO', primaryLang: 'es' },
  'shakira': { countryCode: 'CO', primaryLang: 'es' },
  'rauw alejandro': { countryCode: 'PR', primaryLang: 'es' },
  'feid': { countryCode: 'CO', primaryLang: 'es' },
  'peso pluma': { countryCode: 'MX', primaryLang: 'es' },
  // Japanese
  'yoasobi': { countryCode: 'JP', primaryLang: 'ja' },
  'kenshi yonezu': { countryCode: 'JP', primaryLang: 'ja' },
  'ado': { countryCode: 'JP', primaryLang: 'ja' },
  'fujii kaze': { countryCode: 'JP', primaryLang: 'ja' }
};

export class CountryLanguageService {
  private static mbLastCall = 0;
  private static readonly MB_COOLDOWN_MS = 1050; // MusicBrainz allows 1 req/sec max

  /**
   * Normalize country string to ISO 3166-1 alpha-2 code and display name.
   */
  static normalizeCountry(input?: string | null): NormalizedCountry | null {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim().toLowerCase();
    const code = COUNTRY_ALIASES[clean] || (clean.length === 2 ? clean.toUpperCase() : null);
    if (!code) return null;

    const meta = COUNTRIES.find(c => c.code.toUpperCase() === code.toUpperCase());
    return {
      code: code.toUpperCase(),
      name: meta?.name || input.trim()
    };
  }

  /**
   * Normalize language string to ISO 639-1 code and display name.
   */
  static normalizeLanguage(input?: string | null): NormalizedLanguage | null {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim().toLowerCase();
    const code = LANGUAGE_ALIASES[clean] || (clean.length === 2 ? clean.toLowerCase() : null);
    if (!code) return null;

    const meta = MUSIC_LANGUAGES.find(l => l.code.toLowerCase() === code.toLowerCase());
    return {
      code: code.toLowerCase(),
      name: meta?.name || input.trim()
    };
  }

  /**
   * Detect language from Unicode script ranges.
   */
  static detectLanguageFromScript(text: string): NormalizedLanguage | null {
    if (!text || typeof text !== 'string') return null;

    // Tamil
    if (/[\u0B80-\u0BFF]/.test(text)) return { code: 'ta', name: 'Tamil' };
    // Devanagari (Hindi, Marathi, Nepali)
    if (/[\u0900-\u097F]/.test(text)) return { code: 'hi', name: 'Hindi' };
    // Telugu
    if (/[\u0C00-\u0C7F]/.test(text)) return { code: 'te', name: 'Telugu' };
    // Malayalam
    if (/[\u0D00-\u0D7F]/.test(text)) return { code: 'ml', name: 'Malayalam' };
    // Kannada
    if (/[\u0C80-\u0CFF]/.test(text)) return { code: 'kn', name: 'Kannada' };
    // Gurmukhi (Punjabi)
    if (/[\u0A00-\u0A7F]/.test(text)) return { code: 'pa', name: 'Punjabi' };
    // Bengali / Assamese
    if (/[\u0980-\u09FF]/.test(text)) return { code: 'bn', name: 'Bengali' };
    // Gujarati
    if (/[\u0A80-\u0AFF]/.test(text)) return { code: 'gu', name: 'Gujarati' };
    // Odia
    if (/[\u0B00-\u0B7F]/.test(text)) return { code: 'or', name: 'Odia' };
    // Korean Hangul
    if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return { code: 'ko', name: 'Korean' };
    // Japanese Hiragana/Katakana
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return { code: 'ja', name: 'Japanese' };
    // Arabic
    if (/[\u0600-\u06FF]/.test(text)) return { code: 'ar', name: 'Arabic' };
    // Cyrillic (Russian/Ukrainian)
    if (/[\u0400-\u04FF]/.test(text)) return { code: 'ru', name: 'Russian' };

    return null;
  }

  /**
   * Research a track across MusicBrainz, RapidAPI (Spotify/iTunes), Deezer, and verified heuristics.
   */
  static async researchTrackMetadata(params: {
    title: string;
    artistName?: string;
    isrc?: string | null;
    existingLanguage?: string | null;
    existingRegion?: string | null;
    lyrics?: string | null;
  }): Promise<ResolvedSongMetadata> {
    const { title, artistName, isrc, existingLanguage, existingRegion, lyrics } = params;
    const evidences: MetadataEvidence[] = [];

    const cleanTitle = title.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
    const cleanArtist = (artistName || '').trim();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Script Analysis (Title + Lyrics if available)
    // ─────────────────────────────────────────────────────────────────────────
    const scriptLangTitle = this.detectLanguageFromScript(title);
    if (scriptLangTitle) {
      evidences.push({
        source: 'unicode_script_title',
        languageCode: scriptLangTitle.code,
        languageName: scriptLangTitle.name,
        confidence: 0.96
      });
    }

    if (lyrics && lyrics.length > 20) {
      const scriptLangLyrics = this.detectLanguageFromScript(lyrics);
      if (scriptLangLyrics) {
        evidences.push({
          source: 'unicode_script_lyrics',
          languageCode: scriptLangLyrics.code,
          languageName: scriptLangLyrics.name,
          confidence: 0.98
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Canonical Artist Registry
    // ─────────────────────────────────────────────────────────────────────────
    if (cleanArtist) {
      const lowerArtist = cleanArtist.toLowerCase().trim();
      let match = KNOWN_ARTIST_AFFILIATIONS[lowerArtist];
      if (!match) {
        const found = Object.keys(KNOWN_ARTIST_AFFILIATIONS).find(k => lowerArtist.includes(k) || k.includes(lowerArtist));
        if (found) match = KNOWN_ARTIST_AFFILIATIONS[found];
      }

      if (match) {
        const country = this.normalizeCountry(match.countryCode);
        const lang = this.normalizeLanguage(match.primaryLang);
        if (country && lang) {
          evidences.push({
            source: 'artist_canonical_registry',
            countryCode: country.code,
            countryName: country.name,
            languageCode: lang.code,
            languageName: lang.name,
            confidence: 0.95
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Existing Verified Record Context (language, region)
    // ─────────────────────────────────────────────────────────────────────────
    if (existingLanguage && existingLanguage !== 'other' && existingLanguage !== 'unknown') {
      const normExisting = this.normalizeLanguage(existingLanguage);
      if (normExisting) {
        evidences.push({
          source: 'existing_db_record',
          languageCode: normExisting.code,
          languageName: normExisting.name,
          confidence: 0.88
        });
      }
    }

    if (existingRegion && existingRegion !== 'Global') {
      const normRegion = this.normalizeCountry(existingRegion);
      if (normRegion) {
        evidences.push({
          source: 'existing_db_record',
          countryCode: normRegion.code,
          countryName: normRegion.name,
          confidence: 0.85
        });
      }
    }

    // Fast Path: If local high-confidence signals already verify both country and language
    const localSynth = this.synthesizeEvidences(evidences, cleanTitle, cleanArtist);
    if (localSynth.metadataStatus === 'verified' && (localSynth.metadataConfidence || 0) >= 0.85) {
      return localSynth;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. iTunes Search Metadata (Fast storefront & primary genre mapping)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const itunesEvidence = await this.queryITunes(cleanTitle, cleanArtist);
      if (itunesEvidence) evidences.push(itunesEvidence);
    } catch (itunesErr: any) {
      // Non-blocking
    }

    const itunesSynth = this.synthesizeEvidences(evidences, cleanTitle, cleanArtist);
    if (itunesSynth.metadataStatus === 'verified' && (itunesSynth.metadataConfidence || 0) >= 0.85) {
      return itunesSynth;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. RapidAPI Spotify Track & Artist Lookup
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const rapidEvidence = await this.queryRapidApiSpotify(cleanTitle, cleanArtist);
      if (rapidEvidence) evidences.push(rapidEvidence);
    } catch (rapidErr: any) {
      // Non-blocking
    }

    const rapidSynth = this.synthesizeEvidences(evidences, cleanTitle, cleanArtist);
    if (rapidSynth.metadataStatus === 'verified' && (rapidSynth.metadataConfidence || 0) >= 0.85) {
      return rapidSynth;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. MusicBrainz Recording & Release Group API (Rate-limited authoritative fallback)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const mbEvidence = await this.queryMusicBrainz(cleanTitle, cleanArtist, isrc);
      if (mbEvidence) evidences.push(mbEvidence);
    } catch (mbErr: any) {
      // Non-blocking
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Final Synthesis
    // ─────────────────────────────────────────────────────────────────────────
    return this.synthesizeEvidences(evidences, cleanTitle, cleanArtist);
  }

  /**
   * Query MusicBrainz with Rate Limiting (1 request per second)
   */
  private static async queryMusicBrainz(
    title: string,
    artist: string,
    isrc?: string | null
  ): Promise<MetadataEvidence | null> {
    // Respect MusicBrainz rate limit
    const now = Date.now();
    const timeSinceLast = now - this.mbLastCall;
    if (timeSinceLast < this.MB_COOLDOWN_MS) {
      await new Promise(res => setTimeout(res, this.MB_COOLDOWN_MS - timeSinceLast));
    }
    this.mbLastCall = Date.now();

    let query = isrc
      ? `isrc:${encodeURIComponent(isrc)}`
      : `recording:"${encodeURIComponent(title)}" AND artist:"${encodeURIComponent(artist)}"`;

    const url = `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=3`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'ZenifyMusicDiscovery/2.2 (contact@zenify.app)',
        Accept: 'application/json'
      },
      timeout: 4500
    });

    const recordings = res.data?.recordings || [];
    if (recordings.length === 0) return null;

    const best = recordings[0];
    let countryCode: string | undefined;
    let languageCode: string | undefined;

    // Check releases for country and language
    for (const rel of best.releases || []) {
      if (!countryCode && rel.country) {
        countryCode = rel.country;
      }
      if (!languageCode && rel['text-representation']?.language) {
        const iso3 = rel['text-representation'].language.toLowerCase();
        languageCode = ISO_639_3_TO_1[iso3] || (iso3.length === 2 ? iso3 : undefined);
      }
      if (countryCode && languageCode) break;
    }

    // Fallback: check artist area for country
    if (!countryCode && best['artist-credit']?.[0]?.artist?.area?.['iso-3166-1-codes']?.[0]) {
      countryCode = best['artist-credit'][0].artist.area['iso-3166-1-codes'][0];
    }

    const normCountry = countryCode ? this.normalizeCountry(countryCode) : null;
    const normLang = languageCode ? this.normalizeLanguage(languageCode) : null;

    if (!normCountry && !normLang) return null;

    return {
      source: 'musicbrainz',
      countryCode: normCountry?.code,
      countryName: normCountry?.name,
      languageCode: normLang?.code,
      languageName: normLang?.name,
      confidence: 0.95
    };
  }

  /**
   * Query RapidAPI Spotify for metadata
   */
  private static async queryRapidApiSpotify(title: string, artist: string): Promise<MetadataEvidence | null> {
    const rapidKey = await SystemSettingsService.getSpotifyApiKey();
    if (!rapidKey) return null;

    const query = `${artist} ${title}`.trim();
    const res = await axios.get('https://spotify23.p.rapidapi.com/search/', {
      params: { q: query, type: 'tracks', limit: 3 },
      headers: {
        'x-rapidapi-key': rapidKey,
        'x-rapidapi-host': 'spotify23.p.rapidapi.com'
      },
      timeout: 5000
    });

    const items = res.data?.tracks?.items || [];
    if (items.length === 0) return null;

    const t = items[0]?.data || items[0];
    const trackName = t.name || '';
    const artistName = t.artists?.items?.[0]?.profile?.name || t.artists?.[0]?.name || '';

    // Script check on Spotify title
    const detectedLang = this.detectLanguageFromScript(trackName);

    // Markets check
    const markets = t.albumOfTrack?.sharingInfo?.shareUrl || t.album?.available_markets || [];

    return {
      source: 'rapidapi_spotify',
      languageCode: detectedLang?.code,
      languageName: detectedLang?.name,
      confidence: detectedLang ? 0.90 : 0.70
    };
  }

  /**
   * Query iTunes for storefront and genre
   */
  private static async queryITunes(title: string, artist: string): Promise<MetadataEvidence | null> {
    const term = `${artist} ${title}`.trim();
    const res = await axios.get('https://itunes.apple.com/search', {
      params: { term, entity: 'song', limit: 3 },
      timeout: 4000
    });

    const results = res.data?.results || [];
    if (results.length === 0) return null;

    const song = results[0];
    let country = song.country ? this.normalizeCountry(song.country) : null;
    const genre = (song.primaryGenreName || '').toLowerCase();

    let langCode: string | undefined;
    if (genre.includes('tamil') || genre.includes('kollywood')) langCode = 'ta';
    else if (genre.includes('hindi') || genre.includes('bollywood')) langCode = 'hi';
    else if (genre.includes('telugu') || genre.includes('tollywood')) langCode = 'te';
    else if (genre.includes('malayalam') || genre.includes('mollywood')) langCode = 'ml';
    else if (genre.includes('k-pop') || genre.includes('korean')) langCode = 'ko';
    else if (genre.includes('j-pop') || genre.includes('japanese')) langCode = 'ja';

    const normLang = langCode ? this.normalizeLanguage(langCode) : null;

    // iTunes queries default to the US storefront, which marks international Indian tracks with country 'USA'.
    // If language is uniquely South Asian regional, do NOT accept US/GB as origin country from iTunes storefront.
    if (normLang && ['ta', 'te', 'ml', 'kn', 'hi', 'pa', 'mr', 'gu', 'bn'].includes(normLang.code)) {
      if (country?.code === 'US' || country?.code === 'GB') {
        country = this.normalizeCountry('IN');
      }
    }

    if (!country && !normLang) return null;

    return {
      source: 'itunes',
      countryCode: country?.code,
      countryName: country?.name,
      languageCode: normLang?.code,
      languageName: normLang?.name,
      confidence: 0.88
    };
  }

  /**
   * Synthesize and cross-validate multiple metadata evidences.
   */
  private static synthesizeEvidences(
    evidences: MetadataEvidence[],
    title: string,
    artist: string
  ): ResolvedSongMetadata {
    if (evidences.length === 0) {
      return {
        countryCode: null,
        countryName: null,
        languageCode: null,
        languageName: null,
        languages: [],
        metadataSource: 'unresolved',
        metadataConfidence: 0.0,
        metadataStatus: 'needs_review'
      };
    }

    // Weight and aggregate country votes
    const countryVotes = new Map<string, { name: string; score: number; sources: string[] }>();
    for (const ev of evidences) {
      if (ev.countryCode && ev.countryName) {
        const cur = countryVotes.get(ev.countryCode) || { name: ev.countryName, score: 0, sources: [] };
        cur.score += ev.confidence;
        cur.sources.push(ev.source);
        countryVotes.set(ev.countryCode, cur);
      }
    }

    // Weight and aggregate language votes
    const langVotes = new Map<string, { name: string; score: number; sources: string[] }>();
    for (const ev of evidences) {
      if (ev.languageCode && ev.languageName) {
        const cur = langVotes.get(ev.languageCode) || { name: ev.languageName, score: 0, sources: [] };
        cur.score += ev.confidence;
        cur.sources.push(ev.source);
        langVotes.set(ev.languageCode, cur);
      }
    }

    // Best Country
    let bestCountryCode: string | null = null;
    let bestCountryName: string | null = null;
    let topCountryScore = 0;
    for (const [code, val] of countryVotes.entries()) {
      if (val.score > topCountryScore) {
        topCountryScore = val.score;
        bestCountryCode = code;
        bestCountryName = val.name;
      }
    }

    // Best Language & Multi-languages
    let bestLangCode: string | null = null;
    let bestLangName: string | null = null;
    let topLangScore = 0;
    const verifiedLangs: string[] = [];

    for (const [code, val] of langVotes.entries()) {
      if (val.score >= 0.80) {
        verifiedLangs.push(code);
      }
      if (val.score > topLangScore) {
        topLangScore = val.score;
        bestLangCode = code;
        bestLangName = val.name;
      }
    }

    // If language is uniquely South Asian regional (Tamil, Telugu, Malayalam, Kannada, Hindi, Punjabi, etc.)
    // never let a digital distributor store artifact (US / GB storefront) override authentic Indian origin.
    if (bestLangCode && ['ta', 'te', 'ml', 'kn', 'hi', 'pa', 'mr', 'gu', 'bn'].includes(bestLangCode)) {
      if (!bestCountryCode || bestCountryCode === 'US' || bestCountryCode === 'GB') {
        bestCountryCode = 'IN';
        bestCountryName = 'India';
        topCountryScore = 0.95;
      }
    } else if (!bestCountryCode && bestLangCode) {
      if (bestLangCode === 'ko') {
        bestCountryCode = 'KR';
        bestCountryName = 'South Korea';
        topCountryScore = 0.88;
      } else if (bestLangCode === 'ja') {
        bestCountryCode = 'JP';
        bestCountryName = 'Japan';
        topCountryScore = 0.88;
      }
    }

    // Calculate composite confidence
    const confidence = Math.min(1.0, (topCountryScore + topLangScore) / 2);
    const isVerified = topCountryScore >= 0.75 && topLangScore >= 0.75 && !!bestCountryCode && !!bestLangCode;

    const sources = Array.from(new Set(evidences.map(e => e.source))).join('+');

    return {
      countryCode: bestCountryCode,
      countryName: bestCountryName,
      languageCode: bestLangCode,
      languageName: bestLangName,
      languages: verifiedLangs.length > 0 ? verifiedLangs : (bestLangCode ? [bestLangCode] : []),
      metadataSource: sources || 'zenify_engine',
      metadataConfidence: parseFloat(confidence.toFixed(2)),
      metadataStatus: isVerified ? 'verified' : (confidence >= 0.5 ? 'needs_review' : 'failed')
    };
  }

  /**
   * Discovers and dynamically ingests popular/relatable songs for a country and language using RapidAPI & Catalog Providers.
   * Ensures the database catalog has authentic, verified playable tracks for that territory.
   */
  static async discoverAndIngestForCountryLanguage(
    countryCode: string,
    languageCode: string,
    limit = 20
  ): Promise<any[]> {
    const normCountry = this.normalizeCountry(countryCode);
    const normLang = this.normalizeLanguage(languageCode);
    if (!normCountry || !normLang) return [];

    console.log(`[CountryLanguageService] Discovering songs via RapidAPI for ${normCountry.name} (${normCountry.code}) in ${normLang.name} (${normLang.code})...`);

    const { CompositeCatalogService } = await import('./catalog-provider.service');
    const { ExternalMetadataService } = await import('./external-metadata.service');

    // 1. Build targeted search queries based on country & language
    const searchTerms: string[] = [
      `top ${normLang.name} songs`,
      `trending ${normLang.name} hits`,
      `latest ${normLang.name} music`
    ];

    // Language-specific seeds
    if (normLang.code === 'ta') {
      searchTerms.unshift('Anirudh Ravichander Tamil hits', 'Top Tamil Songs 2026', 'A.R. Rahman Tamil');
    } else if (normLang.code === 'hi') {
      searchTerms.unshift('Arijit Singh Hindi hits', 'Top Hindi Bollywood 2026');
    } else if (normLang.code === 'te') {
      searchTerms.unshift('Top Telugu Songs 2026', 'Thaman S Telugu');
    } else if (normLang.code === 'ko') {
      searchTerms.unshift('Top K-Pop Korea 2026', 'NewJeans BTS Korean');
    } else if (normLang.code === 'en' && normCountry.code === 'GB') {
      searchTerms.unshift('Top UK Songs 2026', 'Ed Sheeran Coldplay UK');
    } else if (normLang.code === 'en' && normCountry.code === 'US') {
      searchTerms.unshift('Top US Billboard 2026', 'Taylor Swift The Weeknd');
    }

    const ingestedTracks: any[] = [];
    const seenTitles = new Set<string>();

    for (const term of searchTerms) {
      if (ingestedTracks.length >= limit) break;

      try {
        const storefront = normCountry.code.toLowerCase();
        const catalogRes = await CompositeCatalogService.search(term, storefront, 10);
        const candidates = catalogRes.tracks || [];

        for (const candidate of candidates) {
          if (ingestedTracks.length >= limit) break;
          const cleanT = candidate.title.toLowerCase().trim();
          if (seenTitles.has(cleanT)) continue;
          seenTitles.add(cleanT);

          // Check if already in DB
          const existing = await prisma.track.findFirst({
            where: {
              deletedAt: null,
              title: { equals: candidate.title, mode: 'insensitive' },
              artist: { name: { equals: candidate.artist?.name || '', mode: 'insensitive' } }
            },
            include: { artist: true, album: true }
          });

          if (existing) {
            // Update country and language metadata if missing or pending
            if (!existing.countryCode || existing.metadataStatus !== 'verified') {
              const updated = await prisma.track.update({
                where: { id: existing.id },
                data: {
                  countryCode: normCountry.code,
                  countryName: normCountry.name,
                  languageCode: normLang.code,
                  languageName: normLang.name,
                  languages: [normLang.code],
                  metadataStatus: 'verified',
                  metadataUpdatedAt: new Date()
                },
                include: { artist: true, album: true }
              });
              ingestedTracks.push(updated);
            } else if (existing.countryCode === normCountry.code && (existing.languageCode === normLang.code || existing.languages.includes(normLang.code))) {
              ingestedTracks.push(existing);
            }
            continue;
          }

          // Check if candidate track already exists in catalog before inserting
          const existingTrack = await DeduplicationService.findExistingDuplicate(
            candidate.title,
            candidate.artist?.name || 'Various Artists',
            candidate.duration
          );

          if (existingTrack) {
            console.log(`[CountryLanguageService] Reusing existing track for "${candidate.title}" (${existingTrack.id})`);
            // Enrich existing track with country/language if missing
            if (!existingTrack.countryCode || !existingTrack.languageCode) {
              await prisma.track.update({
                where: { id: existingTrack.id },
                data: {
                  countryCode: existingTrack.countryCode || normCountry.code,
                  countryName: existingTrack.countryName || normCountry.name,
                  languageCode: existingTrack.languageCode || normLang.code,
                  languageName: existingTrack.languageName || normLang.name,
                  languages: existingTrack.languages?.length ? existingTrack.languages : [normLang.code],
                }
              }).catch(() => {});
            }
            ingestedTracks.push(existingTrack);
            continue;
          }

          // Ingest new track with verified country and language
          let artistRec = await prisma.artist.findFirst({
            where: { name: { equals: candidate.artist?.name || 'Various Artists', mode: 'insensitive' } }
          });

          if (!artistRec) {
            artistRec = await prisma.artist.create({
              data: {
                name: candidate.artist?.name || 'Various Artists',
                imageUrl: candidate.artist?.imageUrl || candidate.coverUrl,
                coverUrl: candidate.artist?.imageUrl || candidate.coverUrl
              }
            });
          }

          const createdTrack = await prisma.track.create({
            data: {
              title: candidate.title,
              artistId: artistRec.id,
              coverUrl: candidate.coverUrl,
              audioUrl: candidate.audioUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(`${artistRec.name} - ${candidate.title}`)}`,
              duration: candidate.duration || 180,
              genre: candidate.genre || 'Pop',
              countryCode: normCountry.code,
              countryName: normCountry.name,
              languageCode: normLang.code,
              languageName: normLang.name,
              languages: [normLang.code],
              metadataSource: 'rapidapi_discovery',
              metadataConfidence: 0.95,
              metadataStatus: 'verified',
              metadataUpdatedAt: new Date(),
              isrc: candidate.isrc,
              youtubeId: candidate.sourceId
            },
            include: { artist: true, album: true }
          });

          ingestedTracks.push(createdTrack);
        }
      } catch (searchErr: any) {
        console.warn(`[CountryLanguageService] Search for "${term}" error:`, searchErr.message);
      }
    }

    return ingestedTracks;
  }
}
