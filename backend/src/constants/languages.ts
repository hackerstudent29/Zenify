export interface VerifiedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

export const VERIFIED_CATALOG_LANGUAGES: VerifiedLanguage[] = [
  { code: 'tamil', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'telugu', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'hindi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'english', name: 'English', nativeName: 'English' },
  { code: 'punjabi', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'malayalam', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'kannada', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'bengali', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'marathi', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'gujarati', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'bhojpuri', name: 'Bhojpuri', nativeName: 'भोजपुरी' },
  { code: 'urdu', name: 'Urdu', nativeName: 'اردو' },
  { code: 'assamese', name: 'Assamese', nativeName: 'অসমীয়া' },
  { code: 'odia', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'spanish', name: 'Spanish', nativeName: 'Español' },
  { code: 'french', name: 'French', nativeName: 'Français' },
];

export const VALID_LANGUAGE_CODES = new Set(VERIFIED_CATALOG_LANGUAGES.map(l => l.code));

export const ISO_LOCALE_MAP: Record<string, string> = {
  'ta': 'tamil',
  'te': 'telugu',
  'hi': 'hindi',
  'en': 'english',
  'pa': 'punjabi',
  'ml': 'malayalam',
  'kn': 'kannada',
  'bn': 'bengali',
  'mr': 'marathi',
  'gu': 'gujarati',
  'bho': 'bhojpuri',
  'ur': 'urdu',
  'as': 'assamese',
  'or': 'odia',
  'es': 'spanish',
  'fr': 'french'
};

export function normalizeCatalogLanguage(input: string): string | null {
  if (!input) return null;
  const clean = input.toLowerCase().trim();
  if (VALID_LANGUAGE_CODES.has(clean)) return clean;
  if (ISO_LOCALE_MAP[clean]) return ISO_LOCALE_MAP[clean];

  const found = VERIFIED_CATALOG_LANGUAGES.find(l => 
    l.name.toLowerCase() === clean || 
    l.nativeName.toLowerCase() === clean
  );
  return found ? found.code : null;
}

export function detectLanguagesFromAcceptHeader(acceptLanguageHeader?: string): string[] {
  if (!acceptLanguageHeader) return [];
  const parts = acceptLanguageHeader.split(',').map(p => p.split(';')[0].trim().toLowerCase());
  const detected: string[] = [];

  for (const part of parts) {
    const langPrefix = part.split('-')[0];
    const match = ISO_LOCALE_MAP[langPrefix] || normalizeCatalogLanguage(part);
    if (match && !detected.includes(match)) {
      detected.push(match);
      if (detected.length >= 3) break;
    }
  }

  return detected;
}

