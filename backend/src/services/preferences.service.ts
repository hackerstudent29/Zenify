import axios from 'axios';
import { prisma } from '../utils/prisma';
import { SystemSettingsService } from './system-settings.service';
import { MUSIC_LANGUAGES, MUSIC_GENRES, COUNTRIES } from '../constants/metadata.constants';

export interface ArtistSummary {
  id: string;
  name: string;
  image: string;
  source: string;
}

// Curated high-relevance popular artists per language & genre for instant suggestion bootstrapping
const SEED_ARTISTS_BY_LANG: Record<string, string[]> = {
  zh: [
    'Jay Chou', 'JJ Lin', 'Eason Chan', 'G.E.M.', 'Jolin Tsai', 'Mayday',
    'Eric Chou', 'Hua Chenyu', 'Teresa Teng', 'Li Ronghao', 'Faye Wong', 'Joker Xue'
  ],
  yue: [
    'Eason Chan', 'Leslie Cheung', 'Jacky Cheung', 'Beyond', 'Hins Cheung', 'Miriam Yeung', 'Joey Yung'
  ],
  ta: [
    'Anirudh Ravichander', 'A.R. Rahman', 'Yuvan Shankar Raja', 'Sid Sriram',
    'Harris Jayaraj', 'Ilaiyaraaja', 'Santhosh Narayanan', 'Pradeep Kumar',
    'Shreya Ghoshal', 'G.V. Prakash Kumar', 'Sean Roldan', 'D. Imman', 'Dhanush', 'K.S. Chithra'
  ],
  hi: [
    'Arijit Singh', 'A.R. Rahman', 'Pritam', 'Shreya Ghoshal', 'Atif Aslam',
    'Badshah', 'Sonu Nigam', 'Vishal-Shekhar', 'Neha Kakkar', 'Sachin-Jigar', 'Jubin Nautiyal'
  ],
  te: [
    'Devi Sri Prasad', 'Thaman S', 'Sid Sriram', 'A.R. Rahman', 'Anirudh Ravichander',
    'Ram Miriyala', 'Anurag Kulkarni', 'Mangli', 'Shreya Ghoshal', 'S.P. Balasubrahmanyam'
  ],
  ml: [
    'Sushin Shyam', 'Hesham Abdul Wahab', 'K.J. Yesudas', 'Job Kurian', 'Vineeth Sreenivasan',
    'Shaan Rahman', 'Gopi Sundar', 'K.S. Chithra', 'Sithara Krishnakumar'
  ],
  kn: [
    'Ravi Basrur', 'Arjun Janya', 'Sanjith Hegde', 'Vijay Prakash', 'Charan Raj', 'Raghu Dixit'
  ],
  pa: [
    'Diljit Dosanjh', 'AP Dhillon', 'Sidhu Moose Wala', 'Karan Aujla', 'Gurdas Maan', 'B Praak'
  ],
  en: [
    'The Weeknd', 'Taylor Swift', 'Drake', 'Billie Eilish', 'Ed Sheeran',
    'Dua Lipa', 'Bruno Mars', 'Post Malone', 'Ariana Grande', 'Coldplay',
    'Kendrick Lamar', 'Eminem', 'Adele', 'Justin Bieber', 'Travis Scott'
  ],
  ko: [
    'BTS', 'BLACKPINK', 'NewJeans', 'Stray Kids', 'TWICE', 'IU', 'LE SSERAFIM', 'SEVENTEEN'
  ],
  es: [
    'Bad Bunny', 'Rosalía', 'J Balvin', 'Shakira', 'Daddy Yankee', 'Rauw Alejandro', 'Karol G'
  ],
  ja: [
    'YOASOBI', 'Kenshi Yonezu', 'Ado', 'Fujii Kaze', 'LiSA', 'Radwimps', 'Official HIGE DANdism'
  ]
};

const SEED_ARTISTS_BY_GENRE: Record<string, string[]> = {
  'Pop': ['Taylor Swift', 'The Weeknd', 'Dua Lipa', 'Ariana Grande', 'Billie Eilish', 'Ed Sheeran'],
  'Hip-Hop': ['Drake', 'Kendrick Lamar', 'Travis Scott', 'Eminem', 'Post Malone', 'Kanye West'],
  'Rock': ['Linkin Park', 'Coldplay', 'Queen', 'Imagine Dragons', 'Arctic Monkeys', 'Nirvana'],
  'Soundtrack': ['A.R. Rahman', 'Anirudh Ravichander', 'Hans Zimmer', 'John Williams', 'Yuvan Shankar Raja'],
  'R&B': ['The Weeknd', 'SZA', 'Frank Ocean', 'Beyoncé', 'Daniel Caesar', 'Bruno Mars'],
  'EDM / Electronic': ['Avicii', 'Calvin Harris', 'The Chainsmokers', 'Martin Garrix', 'David Guetta', 'Kygo'],
  'Indie / Alternative': ['Arctic Monkeys', 'The Neighbourhood', 'Lana Del Rey', 'Cigarettes After Sex', 'Pradeep Kumar']
};

import { KeyPoolService } from './key-pool.service.js';

function isMultiArtist(name: string, query: string): boolean {
  const qLower = query.toLowerCase();
  const lower = name.toLowerCase();
  const delimiters = [
    ' & ', ' and ', ' feat ', ' feat. ', ' ft ', ' ft. ',
    ' featuring ', ' x ', ' vs ', ' with ', ' / ', ', '
  ];
  for (const d of delimiters) {
    if (lower.includes(d) && !qLower.includes(d.trim())) {
      return true;
    }
  }
  return false;
}

function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class PreferencesService {
  private static imageCache = new Map<string, string>();

  /**
   * Resolve an artist portrait image from Apple Music Official Developer API or Deezer
   */
  static async resolveArtistImage(artistName: string): Promise<string> {
    const key = artistName.toLowerCase().trim();
    if (this.imageCache.has(key)) return this.imageCache.get(key)!;

    // 1. Primary: Apple Music Developer API
    try {
      await KeyPoolService.executeWithFailover('applemusic', async (amToken) => {
        const searchRes = await axios.get('https://amp-api.music.apple.com/v1/catalog/in/search', {
          headers: { Authorization: `Bearer ${amToken}`, Origin: 'https://music.apple.com' },
          params: { term: artistName, types: 'artists', limit: 3 },
          timeout: 4500
        });
        const items = searchRes.data.results?.artists?.data || [];
        const normTarget = normalizeArtistName(artistName);
        const match = items.find((a: any) => normalizeArtistName(a.attributes?.name || '') === normTarget && a.attributes?.artwork?.url) || items[0];
        const rawArt = match?.attributes?.artwork?.url;
        if (rawArt) {
          const url = rawArt.replace('{w}x{h}', '600x600').replace('{f}', 'jpg');
          this.imageCache.set(key, url);
        }
      });
      if (this.imageCache.has(key)) return this.imageCache.get(key)!;
    } catch {}

    // 2. Fallback: Deezer artist portrait (strictly filter out generic placeholders)
    try {
      const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`, {
        timeout: 3500
      });
      const validCandidates = (dzRes.data?.data || []).filter((a: any) => {
        const pic = a.picture_big || a.picture_medium || '';
        return pic && !pic.includes('artist//');
      });
      if (validCandidates[0]) {
        const url = validCandidates[0].picture_xl || validCandidates[0].picture_big || validCandidates[0].picture_medium;
        this.imageCache.set(key, url);
        return url;
      }
    } catch {}

    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(artistName)}&background=18181b&color=e11d48&size=300`;
    this.imageCache.set(key, defaultAvatar);
    return defaultAvatar;
  }

  /**
   * Search artists across Apple Music Official Developer API with multi-artist filtering and deduplication
   */
  static async searchArtists(query: string, limit: number = 10): Promise<ArtistSummary[]> {
    if (!query || query.trim().length === 0) return [];
    const cleanQ = query.trim();
    const results: ArtistSummary[] = [];
    const seenNorm = new Set<string>();

    // 1. Primary: Apple Music Official Catalog API
    try {
      await KeyPoolService.executeWithFailover('applemusic', async (amToken) => {
        const storefronts = ['in', 'us'];
        for (const sf of storefronts) {
          if (results.length >= limit) break;
          const searchRes = await axios.get(`https://amp-api.music.apple.com/v1/catalog/${sf}/search`, {
            headers: { Authorization: `Bearer ${amToken}`, Origin: 'https://music.apple.com' },
            params: { term: cleanQ, types: 'artists', limit: Math.max(15, limit * 2) },
            timeout: 5000
          });
          const items = searchRes.data.results?.artists?.data || [];
          for (const item of items) {
            const name = item.attributes?.name;
            if (!name || isMultiArtist(name, cleanQ)) continue;
            const norm = normalizeArtistName(name);
            if (seenNorm.has(norm)) continue;

            const rawArt = item.attributes?.artwork?.url;
            if (!rawArt) continue; // Require authentic official artwork

            seenNorm.add(norm);
            results.push({
              id: `am-${item.id}`,
              name,
              image: rawArt.replace('{w}x{h}', '600x600').replace('{f}', 'jpg'),
              source: 'apple_music'
            });
            if (results.length >= limit) break;
          }
        }
      });
    } catch (amErr: any) {
      console.warn('[PreferencesService] Apple Music search failed:', amErr.message);
    }

    // 2. Fallback: Free Deezer Artist Search (filter out combined artist strings)
    if (results.length < limit) {
      try {
        const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanQ)}&limit=15`, {
          timeout: 4000
        });
        const items = dzRes.data?.data || [];
        for (const item of items) {
          if (!item.name || isMultiArtist(item.name, cleanQ)) continue;
          const norm = normalizeArtistName(item.name);
          if (seenNorm.has(norm)) continue;
          const pic = item.picture_big || item.picture_medium || item.picture;
          if (!pic || pic.includes('artist//')) continue;

          seenNorm.add(norm);
          results.push({
            id: `dz-${item.id}`,
            name: item.name,
            image: pic,
            source: 'deezer'
          });
          if (results.length >= limit) break;
        }
      } catch (dzErr: any) {
        console.warn('[PreferencesService] Deezer search fallback failed:', dzErr.message);
      }
    }

    // 3. Fallback: Spotify RapidAPI if available
    if (results.length < limit) {
      try {
        const spotifyKey = await SystemSettingsService.getSpotifyApiKey();
        if (spotifyKey) {
          const sRes = await axios.get('https://spotify23.p.rapidapi.com/search/', {
            params: { q: cleanQ, type: 'artists', limit: 10 },
            headers: { 'x-rapidapi-key': spotifyKey, 'x-rapidapi-host': 'spotify23.p.rapidapi.com' },
            timeout: 4000
          });
          const items = sRes.data?.artists?.items || sRes.data?.results || [];
          for (const item of items) {
            const artistData = item.data || item;
            const name = artistData.profile?.name || artistData.name;
            if (!name || isMultiArtist(name, cleanQ)) continue;
            const norm = normalizeArtistName(name);
            if (seenNorm.has(norm)) continue;
            const avatar = artistData.visuals?.avatarImage?.sources?.[0]?.url || artistData.images?.[0]?.url;
            if (!avatar) continue;

            seenNorm.add(norm);
            results.push({
              id: `sp-${artistData.id || norm.replace(/\s+/g, '-')}`,
              name,
              image: avatar,
              source: 'spotify'
            });
            if (results.length >= limit) break;
          }
        }
      } catch {}
    }

    // 4. Fallback: Local database artists (strictly clean single artists with real images)
    if (results.length < limit) {
      try {
        const dbMatches = await prisma.artist.findMany({
          where: {
            name: { contains: cleanQ, mode: 'insensitive' }
          },
          orderBy: { monthlyListeners: 'desc' },
          take: limit * 2,
          select: { id: true, name: true, imageUrl: true, coverUrl: true }
        });
        for (const a of dbMatches) {
          if (!a.name || isMultiArtist(a.name, cleanQ)) continue;
          const norm = normalizeArtistName(a.name);
          if (seenNorm.has(norm)) continue;
          const pic = a.imageUrl || a.coverUrl;
          if (!pic || pic.includes('ui-avatars.com')) continue;

          seenNorm.add(norm);
          results.push({
            id: a.id,
            name: a.name,
            image: pic,
            source: 'local'
          });
          if (results.length >= limit) break;
        }
      } catch {}
    }

    return results.slice(0, limit);
  }

  /**
   * Get suggested popular artists based on user's selected languages and genres
   */
  static async getSuggestedArtists(languages: string[] = [], genres: string[] = []): Promise<ArtistSummary[]> {
    const candidateNames: string[] = [];
    const seen = new Set<string>();

    const addName = (name: string) => {
      const lower = name.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        candidateNames.push(name);
      }
    };

    // 1. Language seeds
    for (const lang of languages) {
      const langKey = lang.toLowerCase();
      const seeds = SEED_ARTISTS_BY_LANG[langKey] || [];
      seeds.forEach(addName);
    }

    // 2. Genre seeds
    for (const genre of genres) {
      const seeds = SEED_ARTISTS_BY_GENRE[genre] || [];
      seeds.forEach(addName);
    }

    // Default global fallback if none or few
    if (candidateNames.length < 12) {
      (SEED_ARTISTS_BY_LANG['ta'] || []).slice(0, 6).forEach(addName);
      (SEED_ARTISTS_BY_LANG['en'] || []).slice(0, 6).forEach(addName);
      (SEED_ARTISTS_BY_LANG['hi'] || []).slice(0, 4).forEach(addName);
    }

    // 3. Resolve images and IDs
    const resolved: ArtistSummary[] = [];
    for (const name of candidateNames.slice(0, 24)) {
      const image = await this.resolveArtistImage(name);
      resolved.push({
        id: `artist-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name,
        image,
        source: 'curated'
      });
    }

    return resolved;
  }

  /**
   * Get options metadata (all languages with native names, ISO 3166 countries, and genres)
   */
  static getMetadata() {
    return {
      languages: MUSIC_LANGUAGES,
      genres: MUSIC_GENRES,
      countries: COUNTRIES
    };
  }
}
