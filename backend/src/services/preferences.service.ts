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

export class PreferencesService {
  private static imageCache = new Map<string, string>();

  /**
   * Resolve an image for an artist using Deezer / Spotify / iTunes / DB with memory caching
   */
  static async resolveArtistImage(artistName: string): Promise<string> {
    const key = artistName.toLowerCase().trim();
    if (this.imageCache.has(key)) {
      return this.imageCache.get(key)!;
    }

    // 1. Check local DB Artist table
    try {
      const dbArtist = await prisma.artist.findFirst({
        where: { name: { equals: artistName, mode: 'insensitive' } },
        select: { imageUrl: true, coverUrl: true }
      });
      if (dbArtist?.imageUrl || dbArtist?.coverUrl) {
        const url = (dbArtist.imageUrl || dbArtist.coverUrl)!;
        this.imageCache.set(key, url);
        return url;
      }
    } catch {}

    // 2. Fast Deezer lookup (Free, zero auth)
    try {
      const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`, {
        timeout: 3500
      });
      const match = dzRes.data?.data?.[0];
      if (match?.picture_medium || match?.picture_big || match?.picture) {
        const url = match.picture_big || match.picture_medium || match.picture;
        this.imageCache.set(key, url);
        return url;
      }
    } catch {}

    // 3. iTunes fallback
    try {
      const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1`, {
        timeout: 3000
      });
      const itunesArtist = itunesRes.data?.results?.[0];
      // Note: iTunes artist search doesn't return artist images directly, try song search for artist
      const songRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=1`, {
        timeout: 3000
      });
      const song = songRes.data?.results?.[0];
      if (song?.artworkUrl100) {
        const url = song.artworkUrl100.replace('100x100bb', '600x600bb');
        this.imageCache.set(key, url);
        return url;
      }
    } catch {}

    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(artistName)}&background=18181b&color=e11d48&size=300`;
    this.imageCache.set(key, defaultAvatar);
    return defaultAvatar;
  }

  /**
   * Search artists across local database and external music APIs (Spotify / Deezer / iTunes)
   */
  static async searchArtists(query: string, limit: number = 10): Promise<ArtistSummary[]> {
    if (!query || query.trim().length === 0) return [];
    const cleanQ = query.trim();
    const results: ArtistSummary[] = [];
    const seenNames = new Set<string>();

    // 1. Search DB Artist table
    try {
      const dbMatches = await prisma.artist.findMany({
        where: {
          name: { contains: cleanQ, mode: 'insensitive' }
        },
        orderBy: { monthlyListeners: 'desc' },
        take: limit,
        select: { id: true, name: true, imageUrl: true, coverUrl: true }
      });

      for (const a of dbMatches) {
        seenNames.add(a.name.toLowerCase());
        results.push({
          id: a.id,
          name: a.name,
          image: a.imageUrl || a.coverUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=18181b&color=e11d48&size=300`,
          source: 'local'
        });
      }
    } catch (err: any) {
      console.warn('[PreferencesService] DB artist search failed:', err.message);
    }

    // 2. Query Spotify RapidAPI if key is available
    if (results.length < limit) {
      try {
        const spotifyKey = await SystemSettingsService.getSpotifyApiKey();
        if (spotifyKey) {
          const sRes = await axios.get('https://spotify23.p.rapidapi.com/search/', {
            params: { q: cleanQ, type: 'artists', limit: 8 },
            headers: { 'x-rapidapi-key': spotifyKey, 'x-rapidapi-host': 'spotify23.p.rapidapi.com' },
            timeout: 4000
          });

          const items = sRes.data?.artists?.items || sRes.data?.results || [];
          for (const item of items) {
            const artistData = item.data || item;
            const name = artistData.profile?.name || artistData.name;
            if (name && !seenNames.has(name.toLowerCase())) {
              seenNames.add(name.toLowerCase());
              const avatar = artistData.visuals?.avatarImage?.sources?.[0]?.url ||
                             artistData.images?.[0]?.url ||
                             `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=18181b&color=e11d48&size=300`;

              results.push({
                id: `sp-${artistData.id || name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                name,
                image: avatar,
                source: 'spotify'
              });
              if (results.length >= limit) break;
            }
          }
        }
      } catch (e: any) {
        // Spotify failed, continue to Deezer fallback
      }
    }

    // 3. Free Deezer Artist Search Fallback
    if (results.length < limit) {
      try {
        const dzRes = await axios.get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanQ)}&limit=10`, {
          timeout: 4000
        });
        const items = dzRes.data?.data || [];
        for (const item of items) {
          if (item.name && !seenNames.has(item.name.toLowerCase())) {
            seenNames.add(item.name.toLowerCase());
            results.push({
              id: `dz-${item.id}`,
              name: item.name,
              image: item.picture_big || item.picture_medium || item.picture || '',
              source: 'deezer'
            });
            if (results.length >= limit) break;
          }
        }
      } catch (dzErr: any) {
        console.warn('[PreferencesService] Deezer search fallback failed:', dzErr.message);
      }
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
