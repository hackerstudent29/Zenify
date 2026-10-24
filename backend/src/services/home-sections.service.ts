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
import { AICurationService } from './ai-curation.service';

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
   * Helper: Resolves User Taste Profile seeds with strict language isolation
   */
  private static async getUserTaste(userId?: string, requestedLang?: string, requestedCountry?: string) {
    const rawReqLang = (requestedLang || '').trim();
    const rawReqCountry = (requestedCountry || '').trim();
    const cacheKey = `user_taste:v3:${userId || 'anon'}:${rawReqLang.toLowerCase()}:${rawReqCountry.toLowerCase()}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached;

    let dbUser: any = null;
    let profile: any = null;
    let preferences: any = null;
    let recentLikes: any[] = [];

    if (userId) {
      [dbUser, profile, preferences, recentLikes] = await Promise.all([
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
    }

    // 1. Country / Storefront Resolution
    const userCountryRaw = rawReqCountry || preferences?.selectedCountryCode || preferences?.selectedCountryName || dbUser?.country || 'India';
    const rawCountry = userCountryRaw.trim().toLowerCase();
    const countryCode = COUNTRY_MAP[rawCountry] || 'in';
    const countryName = COUNTRY_DISPLAY_NAME_MAP[rawCountry] || COUNTRY_DISPLAY_NAME_MAP[countryCode] || 'India';

    // 2. Strict Language Resolution (Single Selected Language First)
    let primaryLangName = 'Tamil';
    let primaryLangCode = 'ta';

    if (rawReqLang) {
      const mapped = LANG_MAP[rawReqLang.toLowerCase()];
      if (mapped) {
        primaryLangName = mapped.name;
        primaryLangCode = mapped.code;
      } else {
        primaryLangName = rawReqLang;
        primaryLangCode = rawReqLang.slice(0, 2).toLowerCase();
      }
    } else if (preferences?.selectedLanguageName || preferences?.selectedLanguageCode) {
      const selected = preferences.selectedLanguageName || preferences.selectedLanguageCode;
      const mapped = LANG_MAP[selected.toLowerCase()];
      if (mapped) {
        primaryLangName = mapped.name;
        primaryLangCode = mapped.code;
      } else {
        primaryLangName = preferences.selectedLanguageName || selected;
        primaryLangCode = (preferences.selectedLanguageCode || 'ta').toLowerCase();
      }
    } else if (preferences?.languages && preferences.languages.length > 0) {
      const first = preferences.languages[0];
      const mapped = LANG_MAP[first.toLowerCase()];
      if (mapped) {
        primaryLangName = mapped.name;
        primaryLangCode = mapped.code;
      } else {
        primaryLangName = first;
        primaryLangCode = first.slice(0, 2).toLowerCase();
      }
    } else if (profile?.languageWeights && Object.keys(profile.languageWeights as any).length > 0) {
      const topLang = Object.entries(profile.languageWeights as Record<string, number>)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topLang) {
        const mapped = LANG_MAP[topLang.toLowerCase()];
        if (mapped) {
          primaryLangName = mapped.name;
          primaryLangCode = mapped.code;
        }
      }
    }

    const languageNames: string[] = [primaryLangName];
    const languageCodes: string[] = [primaryLangCode];

    // 3. Genres
    let genres: string[] = [];
    if (preferences?.preferredGenres && preferences.preferredGenres.length > 0) {
      genres = preferences.preferredGenres;
    } else if (profile?.genreWeights && Object.keys(profile.genreWeights as any).length > 0) {
      genres = Object.keys(profile.genreWeights as any);
    }
    if (genres.length === 0) {
      genres = ['Pop', 'Film Music', 'Melody', 'Soundtrack'];
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

    const result = {
      primaryLangName,
      primaryLangCode,
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
   * 1. Made For You (AI-Personalized strictly by user's selected language, country & artists)
   */
  static async getMadeForYou(userId?: string, requestedLang?: string, requestedCountry?: string) {
    const taste = await this.getUserTaste(userId, requestedLang, requestedCountry);
    const primaryLang = taste.languageNames[0] || 'Tamil';
    const key = `catalog:made_for_you:v2:${userId || 'anon'}:${primaryLang.toLowerCase()}:${taste.countryCode}`;

    return this.getCachedOrFetch(key, SHELVES_CACHE_TTL, async () => {
      const curation = await AICurationService.getCuration({
        language: primaryLang,
        country: taste.countryName,
        genres: taste.genres,
        favoriteArtists: taste.favoriteArtistNames
      });

      const artistsToQuery = (taste.favoriteArtistNames.length > 0 ? taste.favoriteArtistNames : curation.artists).slice(0, 4);
      const trackBatches = await Promise.all(
        artistsToQuery.map(artist => CompositeCatalogService.getArtistTopSongs(artist, taste.countryCode, 5))
      );
      let merged = trackBatches.flat().filter(t => !isCompilationOrPlaylist(t.title, t.duration));

      // Supplement with curated trending tracks of that language if needed
      if (merged.length < 12) {
        for (const songTitle of curation.trendingSongs.slice(0, 6)) {
          try {
            const songRes = await CompositeCatalogService.search(`${songTitle} ${primaryLang}`, taste.countryCode, 3);
            merged.push(...songRes.tracks);
            if (merged.length >= 15) break;
          } catch {}
        }
      }

      // Deduplicate by title
      const seen = new Set<string>();
      const deduplicated: CatalogTrack[] = [];
      for (const t of merged) {
        const cleanT = (t.title || '').toLowerCase().trim();
        if (!seen.has(cleanT)) {
          seen.add(cleanT);
          deduplicated.push({ ...t, language: primaryLang });
        }
      }

      const annotated = await this.annotateInLibrary(deduplicated);
      return {
        title: 'Made For You',
        subtitle: `TAILORED TO YOUR ${primaryLang.toUpperCase()} MUSIC TASTE`,
        type: 'made_for_you',
        items: annotated.slice(0, 15).map(formatTrackItem)
      };
    });
  }

  /**
   * 2. Top Songs in [user's country] (Strictly for User's Selected Language)
   */
  static async getTopSongsInCountry(userId?: string, countryParam?: string, requestedLang?: string) {
    const taste = await this.getUserTaste(userId, requestedLang, countryParam);
    const primaryLang = taste.languageNames[0] || 'Tamil';
    const effectiveCode = countryParam ? (COUNTRY_MAP[countryParam.toLowerCase()] || countryParam) : taste.countryCode;
    const effectiveName = COUNTRY_DISPLAY_NAME_MAP[effectiveCode] || taste.countryName;

    const key = `catalog:top_country:v2:${effectiveCode}:${primaryLang.toLowerCase()}`;
    return this.getCachedOrFetch(key, CHARTS_CACHE_TTL, async () => {
      const searchRes = await CompositeCatalogService.search(`Top ${primaryLang} Songs 2026`, effectiveCode, 20);
      const filtered = searchRes.tracks.filter(t => !isCompilationOrPlaylist(t.title, t.duration));
      const annotated = await this.annotateInLibrary(filtered);

      return {
        title: `Top ${primaryLang} Songs in ${effectiveName}`,
        subtitle: `WHAT'S BIG IN YOUR REGION`,
        type: 'top_country',
        items: annotated.slice(0, 15).map(t => ({ ...formatTrackItem(t), language: primaryLang }))
      };
    });
  }

  /**
   * 3. New Releases in Your Languages (Strictly in Selected Language)
   */
  static async getNewReleasesInLanguages(userId?: string, requestedLang?: string, requestedCountry?: string) {
    const taste = await this.getUserTaste(userId, requestedLang, requestedCountry);
    const primaryLang = taste.languageNames[0] || 'Tamil';
    const key = `catalog:new_releases:v2:${primaryLang.toLowerCase()}:${taste.countryCode}`;

    return this.getCachedOrFetch(key, SHELVES_CACHE_TTL, async () => {
      const curation = await AICurationService.getCuration({
        language: primaryLang,
        country: taste.countryName,
        genres: taste.genres
      });

      const tracks: CatalogTrack[] = [];
      const seen = new Set<string>();

      for (const song of curation.newReleases.slice(0, 8)) {
        try {
          const res = await CompositeCatalogService.search(`${song} ${primaryLang}`, taste.countryCode, 3);
          for (const t of res.tracks) {
            const cleanT = (t.title || '').toLowerCase().trim();
            if (!seen.has(cleanT) && !isCompilationOrPlaylist(t.title, t.duration)) {
              seen.add(cleanT);
              tracks.push({ ...t, language: primaryLang });
              break;
            }
          }
          if (tracks.length >= 15) break;
        } catch {}
      }

      if (tracks.length < 10) {
        const freshRes = await CompositeCatalogService.search(`New ${primaryLang} Songs 2026`, taste.countryCode, 15);
        for (const t of freshRes.tracks) {
          const cleanT = (t.title || '').toLowerCase().trim();
          if (!seen.has(cleanT) && !isCompilationOrPlaylist(t.title, t.duration)) {
            seen.add(cleanT);
            tracks.push({ ...t, language: primaryLang });
          }
          if (tracks.length >= 15) break;
        }
      }

      const annotated = await this.annotateInLibrary(tracks);

      return {
        title: `New ${primaryLang} Releases`,
        subtitle: 'FRESH DROPS IN YOUR FAVORITE FREQUENCIES',
        type: 'new_releases_lang',
        items: annotated.map(formatTrackItem)
      };
    });
  }

  /**
   * 4. Trending Now (Strictly in Selected Language)
   */
  static async getTrendingNow(userId?: string, requestedLang?: string, requestedCountry?: string) {
    const taste = await this.getUserTaste(userId, requestedLang, requestedCountry);
    const primaryLang = taste.languageNames[0] || 'Tamil';
    const key = `catalog:trending_now:v2:${primaryLang.toLowerCase()}:${taste.countryCode}`;

    return this.getCachedOrFetch(key, CHARTS_CACHE_TTL, async () => {
      const curation = await AICurationService.getCuration({
        language: primaryLang,
        country: taste.countryName,
        genres: taste.genres
      });

      const tracks: CatalogTrack[] = [];
      const seen = new Set<string>();

      for (const song of curation.trendingSongs.slice(0, 8)) {
        try {
          const res = await CompositeCatalogService.search(`${song} ${primaryLang}`, taste.countryCode, 3);
          for (const t of res.tracks) {
            const cleanT = (t.title || '').toLowerCase().trim();
            if (!seen.has(cleanT) && !isCompilationOrPlaylist(t.title, t.duration)) {
              seen.add(cleanT);
              tracks.push({ ...t, language: primaryLang });
              break;
            }
          }
          if (tracks.length >= 15) break;
        } catch {}
      }

      if (tracks.length < 10) {
        const topRes = await CompositeCatalogService.search(`Top ${primaryLang} Songs 2026`, taste.countryCode, 15);
        for (const t of topRes.tracks) {
          const cleanT = (t.title || '').toLowerCase().trim();
          if (!seen.has(cleanT) && !isCompilationOrPlaylist(t.title, t.duration)) {
            seen.add(cleanT);
            tracks.push({ ...t, language: primaryLang });
          }
          if (tracks.length >= 15) break;
        }
      }

      const annotated = await this.annotateInLibrary(tracks);

      return {
        title: `Trending in ${primaryLang}`,
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
   * 6. Popular Artists in Your Languages (Strictly in Selected Language)
   */
  static async getPopularArtistsInLanguages(userId?: string, requestedLang?: string, requestedCountry?: string) {
    const taste = await this.getUserTaste(userId, requestedLang, requestedCountry);
    const primaryLang = taste.languageNames[0] || 'Tamil';
    const key = `catalog:artists_lang:v2:${primaryLang.toLowerCase()}:${userId || 'anon'}`;

    return this.getCachedOrFetch(key, ARTIST_CACHE_TTL, async () => {
      const curation = await AICurationService.getCuration({
        language: primaryLang,
        country: taste.countryName,
        genres: taste.genres,
        favoriteArtists: taste.favoriteArtistNames
      });

      const items: any[] = [];
      const seenNames = new Set<string>();

      // 1. User's chosen favorite artists if provided
      for (const artistName of taste.favoriteArtistNames) {
        if (!artistName || isFakeOrNumericArtistName(artistName)) continue;
        const lower = artistName.toLowerCase().trim();
        if (!seenNames.has(lower)) {
          seenNames.add(lower);
          const image = (taste.favoriteArtistsMap && taste.favoriteArtistsMap[lower]) || await PreferencesService.resolveArtistImage(artistName);
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

      // 2. High-relevance curated artists strictly for this language
      for (const name of curation.artists) {
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

      return {
        title: `Popular ${primaryLang} Artists`,
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
