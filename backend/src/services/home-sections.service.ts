import axios from 'axios';
import { prisma } from '../utils/prisma';
import { getCacheVal, setCacheVal, invalidateCache } from '../utils/cache';
import { PreferencesService } from './preferences.service';
import { COUNTRIES } from '../constants/metadata.constants';
import { CompositeCatalogService, CatalogTrack } from './catalog-provider.service';
import { enqueueHomeShelvesBuild } from '../queues/home-shelves.queue';
import { UserHomeShelvesPayload, buildUserShelves } from '../queues/home-shelves.worker';
import { isCompilationOrPlaylist, cleanArtistNames } from './universal-search.service';
import { isFakeOrNumericArtistName } from '../utils/artist';

// Cache TTL constants
const CHARTS_CACHE_TTL = 900; // 15 min
const ARTIST_CACHE_TTL = 21600; // 6 hours
const SHELVES_CACHE_TTL = 1800; // 30 min

// ── Language Normalizer Map ──
const LANG_MAP: Record<string, { code: string; name: string }> = {
  ta: { code: 'ta', name: 'Tamil' },
  tamil: { code: 'ta', name: 'Tamil' },
  hi: { code: 'hi', name: 'Hindi' },
  hindi: { code: 'hi', name: 'Hindi' },
  te: { code: 'te', name: 'Telugu' },
  telugu: { code: 'te', name: 'Telugu' },
  ml: { code: 'ml', name: 'Malayalam' },
  malayalam: { code: 'ml', name: 'Malayalam' },
  kn: { code: 'kn', name: 'Kannada' },
  kannada: { code: 'kn', name: 'Kannada' },
  pa: { code: 'pa', name: 'Punjabi' },
  punjabi: { code: 'pa', name: 'Punjabi' },
  bn: { code: 'bn', name: 'Bengali' },
  bengali: { code: 'bn', name: 'Bengali' },
  mr: { code: 'mr', name: 'Marathi' },
  marathi: { code: 'mr', name: 'Marathi' },
  gu: { code: 'gu', name: 'Gujarati' },
  gujarati: { code: 'gu', name: 'Gujarati' },
  en: { code: 'en', name: 'English' },
  english: { code: 'en', name: 'English' },
  es: { code: 'es', name: 'Spanish' },
  spanish: { code: 'es', name: 'Spanish' },
  ko: { code: 'ko', name: 'Korean' },
  korean: { code: 'ko', name: 'Korean' },
  ja: { code: 'ja', name: 'Japanese' },
  japanese: { code: 'ja', name: 'Japanese' },
  fr: { code: 'fr', name: 'French' },
  french: { code: 'fr', name: 'French' },
  de: { code: 'de', name: 'German' },
  german: { code: 'de', name: 'German' },
  ar: { code: 'ar', name: 'Arabic' },
  arabic: { code: 'ar', name: 'Arabic' },
  pt: { code: 'pt', name: 'Portuguese' },
  portuguese: { code: 'pt', name: 'Portuguese' },
  zh: { code: 'zh', name: 'Mandarin Chinese' },
  chinese: { code: 'zh', name: 'Mandarin Chinese' },
  mandarin: { code: 'zh', name: 'Mandarin Chinese' },
  'c-pop': { code: 'zh', name: 'Mandarin Chinese' },
  cpop: { code: 'zh', name: 'Mandarin Chinese' },
  yue: { code: 'yue', name: 'Cantonese' },
  cantonese: { code: 'yue', name: 'Cantonese' }
};

// ── Country Name to ISO 3166-1 alpha-2 Map & Display Names ──
const COUNTRY_MAP: Record<string, string> = {
  india: 'in',
  in: 'in',
  china: 'cn',
  cn: 'cn',
  taiwan: 'tw',
  tw: 'tw',
  'hong kong': 'hk',
  hk: 'hk',
  'united states': 'us',
  us: 'us',
  usa: 'us',
  'united kingdom': 'gb',
  uk: 'gb',
  gb: 'gb',
  uae: 'ae',
  korea: 'kr'
};

const COUNTRY_DISPLAY_NAME_MAP: Record<string, string> = {
  in: 'India',
  india: 'India',
  cn: 'China',
  china: 'China',
  tw: 'Taiwan',
  hk: 'Hong Kong',
  us: 'United States',
  usa: 'United States',
  'united states': 'United States',
  gb: 'United Kingdom',
  uk: 'United Kingdom',
  'united kingdom': 'United Kingdom',
  ae: 'United Arab Emirates',
  uae: 'United Arab Emirates'
};

for (const c of COUNTRIES) {
  const lowerName = c.name.toLowerCase().trim();
  const lowerCode = c.code.toLowerCase().trim();
  COUNTRY_MAP[lowerName] = lowerCode;
  COUNTRY_MAP[lowerCode] = lowerCode;
  COUNTRY_DISPLAY_NAME_MAP[lowerCode] = c.name;
  COUNTRY_DISPLAY_NAME_MAP[lowerName] = c.name;
}

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

function formatTrackItem(t: any) {
  const cleanName = cleanArtistNames(t.artist?.name || t.artistName || '');
  const cleanId = cleanName ? `artist-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : '';
  const rawArtistId = t.artist?.id || t.artistId || '';
  const finalArtistId = (!rawArtistId || rawArtistId.startsWith('itunes-artist-') || /^\d+$/.test(rawArtistId)) ? cleanId : rawArtistId;

  return {
    id: t.id,
    title: t.title,
    coverUrl: t.coverUrl || t.artwork,
    audioUrl: t.audioUrl,
    duration: t.duration,
    genre: t.genre,
    language: t.language,
    streams: t.streams || 2500000,
    like_count: t.like_count || 120000,
    palette: t.palette,
    artistId: finalArtistId,
    isVirtual: t.isVirtual !== false,
    inLibrary: !!t.inLibrary,
    artist: {
      id: finalArtistId,
      name: cleanName || 'Unknown Artist',
      imageUrl: t.artist?.imageUrl || t.artist?.coverUrl || t.coverUrl
    },
    album: t.album ? {
      id: t.album.id,
      title: t.album.title,
      coverUrl: t.album.coverUrl || t.coverUrl,
      palette: t.album.palette
    } : undefined
  };
}

export class HomeSectionsService {
  private static inFlightRequests = new Map<string, Promise<any>>();

  private static async getCachedOrFetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = await getCacheVal(key);
    if (cached) return cached as T;

    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    const fetchPromise = (async () => {
      try {
        const result = await fetcher();
        if (result) {
          await setCacheVal(key, result, ttlSeconds);
        }
        return result;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, fetchPromise);
    return fetchPromise;
  }

  static async invalidateUserHomeCache(userId: string) {
    if (!userId) return;
    await Promise.allSettled([
      invalidateCache(`user:home:shelves:${userId}`),
      invalidateCache(`home:recently_played:${userId}`),
      invalidateCache(`catalog:genre_playlists:${userId}`),
      invalidateCache(`catalog:genre_playlists:anon`),
      invalidateCache(`catalog:albums_for_you:${userId}`),
      invalidateCache(`catalog:albums_for_you:anon`),
      invalidateCache(`catalog:artists_lang:${userId}`),
      invalidateCache(`catalog:artists_lang:anon`)
    ]);
  }

  /**
   * Helper: Resolves User Taste Profile seeds without querying Track rows
   */
  private static async getUserTaste(userId?: string) {
    const cacheKey = `user_taste:${userId || 'anon'}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached;

    if (!userId) {
      return {
        languages: ['Tamil', 'English'],
        languageNames: ['Tamil', 'English'],
        languageCodes: ['ta', 'en'],
        genres: ['Pop', 'Film Music', 'Hip-Hop', 'Soundtrack'],
        countryName: 'India',
        countryCode: 'in',
        favoriteArtistNames: ['Anirudh Ravichander', 'A.R. Rahman', 'The Weeknd'],
        topArtists: ['Anirudh Ravichander', 'A.R. Rahman', 'The Weeknd']
      };
    }

    const [user, profile, preferences, recentLikes] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { country: true } }),
      prisma.userInterestProfile.findUnique({ where: { userId } }),
      prisma.userPreferences.findUnique({ where: { userId } }),
      prisma.like.findMany({
        where: { userId },
        include: { track: { select: { artist: { select: { name: true } }, genre: true, language: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    // 1. Country / Storefront
    const rawCountry = (user?.country || 'India').trim().toLowerCase();
    const countryCode = COUNTRY_MAP[rawCountry] || 'in';
    const countryName = COUNTRY_DISPLAY_NAME_MAP[rawCountry] || COUNTRY_DISPLAY_NAME_MAP[countryCode] || 'India';

    // 2. Languages (user's language weights first, never alphabetical)
    const languageNames: string[] = [];
    const languageCodes: string[] = [];

    if (profile?.languageWeights && Object.keys(profile.languageWeights as any).length > 0) {
      const sorted = Object.entries(profile.languageWeights as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .map(e => e[0]);
      for (const l of sorted) {
        const mapped = LANG_MAP[l.toLowerCase()];
        if (mapped && !languageCodes.includes(mapped.code)) {
          languageCodes.push(mapped.code);
          languageNames.push(mapped.name);
        }
      }
    } else if (preferences?.languages && preferences.languages.length > 0) {
      for (const l of preferences.languages) {
        const mapped = LANG_MAP[l.toLowerCase()];
        if (mapped && !languageCodes.includes(mapped.code)) {
          languageCodes.push(mapped.code);
          languageNames.push(mapped.name);
        } else if (!languageNames.includes(l)) {
          languageNames.push(l);
        }
      }
    }

    if (languageNames.length === 0) {
      if (countryCode === 'cn' || countryCode === 'tw') {
        languageNames.push('Mandarin Chinese');
        languageCodes.push('zh');
      } else if (countryCode === 'hk') {
        languageNames.push('Cantonese');
        languageCodes.push('yue');
      } else if (countryCode === 'jp') {
        languageNames.push('Japanese');
        languageCodes.push('ja');
      } else if (countryCode === 'kr') {
        languageNames.push('Korean');
        languageCodes.push('ko');
      } else if (countryCode === 'us' || countryCode === 'gb' || countryCode === 'ca' || countryCode === 'au') {
        languageNames.push('English');
        languageCodes.push('en');
      } else if (countryCode === 'fr') {
        languageNames.push('French');
        languageCodes.push('fr');
      } else if (countryCode === 'de') {
        languageNames.push('German');
        languageCodes.push('de');
      } else if (countryCode === 'es' || countryCode === 'mx') {
        languageNames.push('Spanish');
        languageCodes.push('es');
      } else {
        languageNames.push('Tamil', 'English');
        languageCodes.push('ta', 'en');
      }
    }

    // 3. Genres
    let genres: string[] = [];
    if (profile?.genreWeights && Object.keys(profile.genreWeights as any).length > 0) {
      genres = Object.keys(profile.genreWeights as any);
    } else if (preferences?.preferredGenres && preferences.preferredGenres.length > 0) {
      genres = preferences.preferredGenres;
    }
    if (genres.length === 0) {
      genres = ['Pop', 'Film Music', 'Soundtrack', 'Hip-Hop'];
    }

    // 4. Favorite Artists
    const favoriteArtistNames: string[] = [];
    const favoriteArtistsMap: Record<string, string> = {};
    if (preferences?.favoriteArtists && Array.isArray(preferences.favoriteArtists)) {
      for (const fav of preferences.favoriteArtists as any[]) {
        const name = fav?.name?.trim();
        if (name && !favoriteArtistNames.includes(name)) {
          favoriteArtistNames.push(name);
          if (fav.image) {
            favoriteArtistsMap[name.toLowerCase()] = fav.image;
          }
        }
      }
    }
    for (const like of recentLikes) {
      const artistName = like.track?.artist?.name?.trim();
      if (artistName && !favoriteArtistNames.includes(artistName)) {
        favoriteArtistNames.push(artistName);
      }
    }
    if (favoriteArtistNames.length === 0) {
      if (countryCode === 'cn' || countryCode === 'tw' || languageCodes.includes('zh')) {
        favoriteArtistNames.push('Jay Chou', 'JJ Lin', 'G.E.M.', 'Eason Chan');
      } else if (countryCode === 'jp' || languageCodes.includes('ja')) {
        favoriteArtistNames.push('YOASOBI', 'Kenshi Yonezu', 'Ado', 'Fujii Kaze');
      } else if (countryCode === 'kr' || languageCodes.includes('ko')) {
        favoriteArtistNames.push('BTS', 'BLACKPINK', 'NewJeans', 'IU');
      } else if (countryCode === 'us' || countryCode === 'gb' || countryCode === 'ca' || countryCode === 'au') {
        favoriteArtistNames.push('Taylor Swift', 'The Weeknd', 'Drake', 'Billie Eilish');
      } else {
        favoriteArtistNames.push('Anirudh Ravichander', 'A.R. Rahman', 'The Weeknd');
      }
    }

    const result = {
      languages: languageNames,
      languageNames,
      languageCodes,
      genres,
      countryName,
      countryCode,
      favoriteArtistNames,
      favoriteArtistsMap,
      topArtists: favoriteArtistNames.slice(0, 4)
    };
    await setCacheVal(cacheKey, result, 600); // 10 minutes cache
    return result;
  }

  /**
   * Helper: Performs ONE batched indexed lookup by sourceId/isrc to mark "inLibrary: true" (Section 15)
   */
  private static async annotateInLibrary(tracks: CatalogTrack[]): Promise<CatalogTrack[]> {
    if (!tracks || tracks.length === 0) return [];

    const sourceIds = tracks.map(t => t.sourceId).filter(Boolean);
    const isrcs = tracks.map(t => t.isrc).filter(Boolean) as string[];

    if (sourceIds.length === 0 && isrcs.length === 0) {
      return tracks.map(t => ({ ...t, inLibrary: false }));
    }

    try {
      const matches = await prisma.track.findMany({
        where: {
          deletedAt: null,
          OR: [
            ...(sourceIds.length > 0 ? [{ youtubeId: { in: sourceIds } }] : []),
            ...(isrcs.length > 0 ? [{ isrc: { in: isrcs } }] : [])
          ]
        },
        select: { id: true, youtubeId: true, isrc: true }
      });

      const matchedSourceIds = new Set(matches.map(m => m.youtubeId).filter(Boolean));
      const matchedIsrcs = new Set(matches.map(m => m.isrc).filter(Boolean));

      return tracks.map(t => ({
        ...t,
        inLibrary: (t.sourceId && matchedSourceIds.has(t.sourceId)) || (t.isrc && matchedIsrcs.has(t.isrc))
      }));
    } catch {
      return tracks.map(t => ({ ...t, inLibrary: false }));
    }
  }

  /**
   * Reads saved user shelves or triggers high-priority background worker build (Section 14)
   */
  private static async getSavedUserShelves(userId: string): Promise<UserHomeShelvesPayload | null> {
    const key = `user:home:shelves:${userId}`;
    const cached = await getCacheVal(key);
    if (cached) {
      // Stale-while-revalidate: if expiring in under 5 minutes, trigger background rebuild
      const payload = cached as UserHomeShelvesPayload;
      if (payload.expiresAt && Date.now() > payload.expiresAt - 300000) {
        enqueueHomeShelvesBuild(userId).catch(() => {});
      }
      return payload;
    }

    // Trigger high-priority build if missing
    enqueueHomeShelvesBuild(userId, true).catch(() => {});
    return null;
  }

  /**
   * 1. Made For You (Pure Catalog — Section 13)
   */
  static async getMadeForYou(userId?: string) {
    if (userId) {
      const saved = await this.getSavedUserShelves(userId);
      const shelf = saved?.shelves.find(s => s.section === 'made_for_you');
      if (shelf && shelf.items.length > 0) {
        return {
          title: shelf.title,
          subtitle: shelf.subtitle,
          type: 'made_for_you',
          items: shelf.items.map(formatTrackItem)
        };
      }
    }

    const { topArtists, countryCode } = await this.getUserTaste(userId);
    const key = `catalog:made_for_you:${userId || 'anon'}`;

    return this.getCachedOrFetch(key, SHELVES_CACHE_TTL, async () => {
      // Fetch catalog top songs for user's favorite artists in parallel
      const trackBatches = await Promise.all(
        topArtists.slice(0, 3).map(artist => CompositeCatalogService.getArtistTopSongs(artist, countryCode, 6))
      );
      const merged = trackBatches.flat().filter(t => !isCompilationOrPlaylist(t.title, t.duration));
      const annotated = await this.annotateInLibrary(merged);

      return {
        title: 'Made For You',
        subtitle: 'TAILORED TO YOUR MUSIC TASTE',
        type: 'made_for_you',
        items: annotated.slice(0, 15).map(formatTrackItem)
      };
    });
  }

  /**
   * 2. Top Songs in [user's country] (Pure Catalog Charts — Section 13)
   */
  static async getTopSongsInCountry(userId?: string, countryParam?: string) {
    const { countryCode, countryName } = await this.getUserTaste(userId);
    const effectiveCode = countryParam ? (COUNTRY_MAP[countryParam.toLowerCase()] || countryParam) : countryCode;
    const effectiveName = COUNTRY_DISPLAY_NAME_MAP[effectiveCode] || countryName;

    if (userId) {
      const saved = await this.getSavedUserShelves(userId);
      const shelf = saved?.shelves.find(s => s.section === 'top_country');
      if (shelf && shelf.items.length > 0) {
        return {
          title: shelf.title,
          subtitle: shelf.subtitle,
          type: 'top_country',
          items: shelf.items.filter(t => !isCompilationOrPlaylist(t.title, t.duration)).map(formatTrackItem)
        };
      }
    }

    const key = `catalog:top_country:${effectiveCode}`;
    return this.getCachedOrFetch(key, CHARTS_CACHE_TTL, async () => {
      const charts = await CompositeCatalogService.getCharts(effectiveCode, 35);
      const filtered = charts.filter(t => !isCompilationOrPlaylist(t.title, t.duration));
      const annotated = await this.annotateInLibrary(filtered);

      return {
        title: `Top Songs in ${effectiveName}`,
        subtitle: `WHAT'S BIG IN YOUR REGION`,
        type: 'top_country',
        items: annotated.slice(0, 15).map(formatTrackItem)
      };
    });
  }

  /**
   * 3. New Releases in Your Languages (Pure Catalog — Section 13)
   */
  static async getNewReleasesInLanguages(userId?: string) {
    const { languageNames, countryCode } = await this.getUserTaste(userId);
    const key = `catalog:new_releases:${userId || 'anon'}`;

    return this.getCachedOrFetch(key, SHELVES_CACHE_TTL, async () => {
      // Query external catalog for top latest tracks in user's languages
      const targetLangs = languageNames.slice(0, 3);
      const results: CatalogTrack[] = [];
      const seenTitles = new Set<string>();

      for (const lang of targetLangs) {
        const searchRes = await CompositeCatalogService.search(`${lang} songs`, countryCode, 12);
        for (const t of searchRes.tracks) {
          if (isCompilationOrPlaylist(t.title, t.duration)) continue;
          const lower = (t.title || '').toLowerCase().trim();
          if (!seenTitles.has(lower)) {
            seenTitles.add(lower);
            const cleanArtist = cleanArtistNames(t.artist?.name || t.artists?.[0]?.name || '');
            results.push({ 
              ...t, 
              language: lang,
              artist: {
                ...t.artist,
                id: cleanArtist ? `artist-${cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : '',
                name: cleanArtist
              }
            });
            if (results.length >= 15) break;
          }
        }
        if (results.length >= 15) break;
      }

      const annotated = await this.annotateInLibrary(results);

      return {
        title: 'New Releases in Your Languages',
        subtitle: 'FRESH DROPS IN YOUR FAVORITE FREQUENCIES',
        type: 'new_releases_lang',
        items: annotated.map(formatTrackItem)
      };
    });
  }

  /**
   * 4. Trending Now (Pure Catalog Charts — Section 13)
   */
  static async getTrendingNow() {
    const key = 'catalog:trending_now';
    return this.getCachedOrFetch(key, CHARTS_CACHE_TTL, async () => {
      const charts = await CompositeCatalogService.getCharts('in', 35);
      const filtered = charts.filter(t => !isCompilationOrPlaylist(t.title, t.duration));
      const trending = filtered.slice(0, 15); // Trending subset of top charts
      const annotated = await this.annotateInLibrary(trending);

      return {
        title: 'Trending Now',
        subtitle: 'THE MOST PLAYED TRACKS RIGHT NOW',
        type: 'trending_now',
        items: annotated.map(formatTrackItem)
      };
    });
  }

  /**
   * 5. Because You Like [Artist] (Deprecated placeholder)
   */
  static async getBecauseYouLike(_userId?: string) {
    return {
      title: '',
      subtitle: '',
      type: 'because_you_like',
      items: []
    };
  }

  /**
   * 6. Popular Artists in Your Languages (Catalog & Preferences)
   */
  static async getPopularArtistsInLanguages(userId?: string) {
    const key = `catalog:artists_lang:${userId || 'anon'}`;
    return this.getCachedOrFetch(key, ARTIST_CACHE_TTL, async () => {
      const { languageCodes, favoriteArtistNames, favoriteArtistsMap } = await this.getUserTaste(userId);
      const items: any[] = [];
      const seenNames = new Set<string>();

      // 1. User's chosen favorite artists first
      for (const artistName of favoriteArtistNames) {
        if (!artistName || isFakeOrNumericArtistName(artistName)) continue;
        const lower = artistName.toLowerCase().trim();
        if (!seenNames.has(lower)) {
          seenNames.add(lower);
          const image = (favoriteArtistsMap && favoriteArtistsMap[lower]) || await PreferencesService.resolveArtistImage(artistName);
          items.push({
            id: `artist-${artistName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            name: artistName,
            imageUrl: image || `https://ui-avatars.com/api/?name=${encodeURIComponent(artistName)}&background=18181b&color=e11d48&size=300`,
            coverUrl: image || `https://ui-avatars.com/api/?name=${encodeURIComponent(artistName)}&background=18181b&color=e11d48&size=300`,
            isArtist: true,
            type: 'artist',
            href: `/artist/artist-${artistName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
          });
        }
      }

      // 2. High-relevance seed artists for user's selected languages
      for (const code of languageCodes) {
        const seeds = SEED_ARTISTS_BY_LANG[code] || [];
        for (const name of seeds.slice(0, 4)) {
          if (!name || isFakeOrNumericArtistName(name)) continue;
          const lower = name.toLowerCase().trim();
          if (!seenNames.has(lower)) {
            seenNames.add(lower);
            const image = await PreferencesService.resolveArtistImage(name);
            items.push({
              id: `artist-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
              name,
              imageUrl: image || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=18181b&color=e11d48&size=300`,
              coverUrl: image || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=18181b&color=e11d48&size=300`,
              isArtist: true,
              type: 'artist',
              href: `/artist/artist-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
            });
            if (items.length >= 16) break;
          }
        }
        if (items.length >= 16) break;
      }

      return {
        title: 'Popular Artists in Your Languages',
        subtitle: 'VOICES LEADING THE SCENE',
        type: 'popular_artists_lang',
        items
      };
    });
  }

  /**
   * 7. Top Albums for You (Curated studio albums from selected artists, languages, and region)
   */
  static async getAlbumsForYou(userId?: string) {
    const key = `catalog:albums_for_you:${userId || 'anon'}`;
    return this.getCachedOrFetch(key, SHELVES_CACHE_TTL, async () => {
      const { favoriteArtistNames, languageNames, countryCode, countryName } = await this.getUserTaste(userId);
      const items: any[] = [];
      const seenAlbumTitles = new Set<string>();

      try {
        const { default: axios } = await import('axios');

        // 1. Fetch authentic studio albums for user's favorite artists
        for (const artist of favoriteArtistNames.slice(0, 4)) {
          try {
            const itunesRes = await axios.get(`https://itunes.apple.com/search`, {
              params: {
                term: artist,
                entity: 'album',
                limit: 4
              },
              timeout: 4000
            }).catch(() => null);

            if (itunesRes?.data?.results) {
              for (const alb of itunesRes.data.results) {
                const albTitle = (alb.collectionName || '').trim();
                const norm = albTitle.toLowerCase();
                const cleanArtist = cleanArtistNames(alb.artistName || artist);
                if (isFakeOrNumericArtistName(cleanArtist)) continue;
                if (albTitle && !seenAlbumTitles.has(norm)) {
                  seenAlbumTitles.add(norm);
                  const art = alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                  items.push({
                    id: `itunes-album-${alb.collectionId}`,
                    title: albTitle,
                    name: albTitle,
                    coverUrl: art,
                    imageUrl: art,
                    isAlbum: true,
                    type: 'album',
                    href: `/album/itunes-album-${alb.collectionId}`,
                    artistName: cleanArtist,
                    trackCount: alb.trackCount || 1,
                    releaseDate: alb.releaseDate,
                    genre: alb.primaryGenreName || 'Album',
                    artist: {
                      id: `artist-${cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                      name: cleanArtist,
                      imageUrl: art
                    }
                  });
                  if (items.length >= 12) break;
                }
              }
            }
          } catch {}
          if (items.length >= 12) break;
        }

        // 2. Fetch popular albums / soundtracks for user's languages
        for (const lang of languageNames.slice(0, 3)) {
          if (items.length >= 16) break;
          try {
            const langQuery = `${lang} soundtrack`;
            const langRes = await axios.get(`https://itunes.apple.com/search`, {
              params: {
                term: langQuery,
                entity: 'album',
                limit: 3,
                country: countryCode || 'in'
              },
              timeout: 4000
            }).catch(() => null);

            if (langRes?.data?.results) {
              for (const alb of langRes.data.results) {
                const albTitle = (alb.collectionName || '').trim();
                const norm = albTitle.toLowerCase();
                const cleanArtist = cleanArtistNames(alb.artistName || lang);
                if (isFakeOrNumericArtistName(cleanArtist)) continue;
                if (albTitle && !seenAlbumTitles.has(norm)) {
                  seenAlbumTitles.add(norm);
                  const art = alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                  items.push({
                    id: `itunes-album-${alb.collectionId}`,
                    title: albTitle,
                    name: albTitle,
                    coverUrl: art,
                    imageUrl: art,
                    isAlbum: true,
                    type: 'album',
                    href: `/album/itunes-album-${alb.collectionId}`,
                    artistName: cleanArtist,
                    trackCount: alb.trackCount || 1,
                    releaseDate: alb.releaseDate,
                    genre: alb.primaryGenreName || 'Soundtrack',
                    artist: {
                      id: `artist-${cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                      name: cleanArtist,
                      imageUrl: art
                    }
                  });
                  if (items.length >= 16) break;
                }
              }
            }
          } catch {}
        }

        // 3. Supplement with regional top albums for user's country
        if (items.length < 8 && countryCode) {
          try {
            const regionRes = await axios.get(`https://itunes.apple.com/search`, {
              params: {
                term: `${countryName} top albums`,
                entity: 'album',
                limit: 4,
                country: countryCode
              },
              timeout: 4000
            }).catch(() => null);

            if (regionRes?.data?.results) {
              for (const alb of regionRes.data.results) {
                const albTitle = (alb.collectionName || '').trim();
                const norm = albTitle.toLowerCase();
                if (albTitle && !seenAlbumTitles.has(norm)) {
                  seenAlbumTitles.add(norm);
                  const art = alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : '';
                  items.push({
                    id: `itunes-album-${alb.collectionId}`,
                    title: albTitle,
                    name: albTitle,
                    coverUrl: art,
                    imageUrl: art,
                    isAlbum: true,
                    type: 'album',
                    href: `/album/itunes-album-${alb.collectionId}`,
                    artistName: alb.artistName,
                    trackCount: alb.trackCount || 1,
                    releaseDate: alb.releaseDate,
                    genre: alb.primaryGenreName || 'Album',
                    artist: {
                      id: `artist-${(alb.artistName || 'Artist').toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                      name: alb.artistName,
                      imageUrl: art
                    }
                  });
                }
              }
            }
          } catch {}
        }

        // 4. Also check local database for any albums
        try {
          const dbAlbums = await prisma.album.findMany({
            take: 6,
            include: { artist: true },
            orderBy: { releaseDate: 'desc' }
          });
          for (const alb of dbAlbums) {
            const albTitle = alb.title.trim();
            const norm = albTitle.toLowerCase();
            if (albTitle && !seenAlbumTitles.has(norm) && alb.coverUrl) {
              seenAlbumTitles.add(norm);
              items.push({
                id: alb.id,
                title: albTitle,
                name: albTitle,
                coverUrl: alb.coverUrl,
                imageUrl: alb.coverUrl,
                isAlbum: true,
                type: 'album',
                href: `/album/${alb.id}`,
                artistName: alb.artist?.name || 'Various Artists',
                releaseDate: alb.releaseDate,
                artist: {
                  id: alb.artist?.id || '',
                  name: alb.artist?.name || 'Various Artists',
                  imageUrl: alb.artist?.imageUrl || alb.coverUrl
                }
              });
            }
          }
        } catch {}
      } catch (err: any) {
        console.warn('[HomeSectionsService] Albums for you fetch warn:', err.message);
      }

      return {
        title: 'Top Albums for You',
        subtitle: 'ALBUMS FROM YOUR FAVORITE ARTISTS, LANGUAGES & REGION',
        type: 'genre_playlists',
        items
      };
    });
  }

  static async getTopGenrePlaylists(userId?: string) {
    return this.getAlbumsForYou(userId);
  }

  /**
   * 8. Recently Played — THE ONLY section that reads local DB history (Section 13)
   */
  static async getRecentlyPlayed(userId?: string) {
    if (!userId) {
      return {
        title: 'Recently Played',
        subtitle: 'PICK UP WHERE YOU LEFT OFF',
        type: 'recently_played',
        items: []
      };
    }

    const key = `home:recently_played:${userId}`;
    return this.getCachedOrFetch(key, 60, async () => {
      const plays = await prisma.history.findMany({
        where: { userId },
        orderBy: { playedAt: 'desc' },
        take: 15,
        distinct: ['trackId'],
        include: {
          track: {
            include: { artist: true, album: true }
          }
        }
      });

      const items = plays
        .filter(p => p.track && !p.track.deletedAt && p.track.audioUrl)
        .map(p => formatTrackItem(p.track));

      return {
        title: 'Recently Played',
        subtitle: 'PICK UP WHERE YOU LEFT OFF',
        type: 'recently_played',
        items
      };
    });
  }
}
