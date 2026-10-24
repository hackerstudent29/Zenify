import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env';
import { prisma } from '../utils/prisma';
import { setCacheVal } from '../utils/cache';
import { CompositeCatalogService, CatalogTrack } from '../services/catalog-provider.service';
import { HomeShelvesJobData } from './home-shelves.queue';
import { isCompilationOrPlaylist, cleanArtistNames } from '../services/universal-search.service';
import { AICurationService } from '../services/ai-curation.service';

const REDIS_HOST_URL = config.REDIS_URL;
let redisConnection: IORedis | null = null;
let homeShelvesWorker: Worker<HomeShelvesJobData> | null = null;

const isProd = process.env.NODE_ENV === 'production' || !!process.env.HEROKU_APP_ID || !!process.env.RAILWAY_ENVIRONMENT_NAME;
const isLocalhostRedis = REDIS_HOST_URL ? (REDIS_HOST_URL.includes('127.0.0.1') || REDIS_HOST_URL.includes('localhost')) : true;
const shouldUseRedis = !!REDIS_HOST_URL && !(isProd && isLocalhostRedis);

export interface ShelfItem {
  section: string;
  title: string;
  subtitle?: string;
  type: string;
  items: CatalogTrack[];
  builtAt: number;
  expiresAt: number;
}

export interface UserHomeShelvesPayload {
  shelves: ShelfItem[];
  builtAt: number;
  expiresAt: number;
}

/**
 * Executes the 5-step User Home Shelves building pipeline
 */
export async function buildUserShelves(userId: string): Promise<UserHomeShelvesPayload> {
  const startTime = Date.now();
  console.log(`[HomeShelvesWorker] Building catalog-first shelves for user ${userId}...`);

  // Step 1: Load User Taste Profile & Preferences
  const [user, profile, preferences, recentHistory, recentLikes] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { country: true } }),
    prisma.userInterestProfile.findUnique({ where: { userId } }),
    prisma.userPreferences.findUnique({ where: { userId } }),
    prisma.history.findMany({
      where: {
        userId,
        playedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Played in last 24h
      },
      select: {
        track: { select: { title: true, isrc: true, youtubeId: true } }
      },
      take: 100
    }),
    prisma.like.findMany({
      where: { userId },
      select: {
        track: { select: { artist: { select: { name: true } }, genre: true, language: true } }
      },
      take: 20
    })
  ]);

  // Resolve Storefront / Country
  const rawCountry = (user?.country || 'India').trim().toLowerCase();
  const countryCode = rawCountry === 'united states' || rawCountry === 'us' || rawCountry === 'usa' ? 'us'
    : rawCountry === 'united kingdom' || rawCountry === 'uk' || rawCountry === 'gb' ? 'gb'
    : 'in';
  const countryName = countryCode === 'us' ? 'United States' : countryCode === 'gb' ? 'United Kingdom' : 'India';

  // Resolve Languages (User's selected language first)
  const languageNames: string[] = [];
  if (preferences?.selectedLanguageName) {
    languageNames.push(preferences.selectedLanguageName);
  } else if (preferences?.selectedLanguageCode) {
    languageNames.push(preferences.selectedLanguageCode === 'ta' ? 'Tamil' : preferences.selectedLanguageCode);
  } else if (preferences?.languages && preferences.languages.length > 0) {
    languageNames.push(preferences.languages[0]);
  } else if (profile?.languageWeights && Object.keys(profile.languageWeights as any).length > 0) {
    const sorted = Object.entries(profile.languageWeights as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0]);
    languageNames.push(...sorted);
  }
  if (languageNames.length === 0) {
    languageNames.push('Tamil');
  }

  const primaryLang = languageNames[0] || 'Tamil';

  // Resolve Favorite Artists
  const seedArtists: string[] = [];
  if (preferences?.favoriteArtists && Array.isArray(preferences.favoriteArtists)) {
    for (const fav of preferences.favoriteArtists as any[]) {
      const name = fav?.name?.trim();
      if (name && !seedArtists.includes(name)) seedArtists.push(name);
    }
  }
  for (const l of recentLikes) {
    const aName = l.track?.artist?.name?.trim();
    if (aName && !seedArtists.includes(aName)) seedArtists.push(aName);
  }

  const curation = await AICurationService.getCuration({
    language: primaryLang,
    country: countryName,
    favoriteArtists: seedArtists
  });

  const finalArtists = (seedArtists.length > 0 ? seedArtists : curation.artists).slice(0, 4);

  // Set of tracks played in the last 24h to drop from discovery shelves
  const recentlyPlayedTitles = new Set<string>();
  const recentlyPlayedIds = new Set<string>();
  for (const h of recentHistory) {
    if (h.track?.title) recentlyPlayedTitles.add(h.track.title.toLowerCase().trim());
    if (h.track?.isrc) recentlyPlayedIds.add(h.track.isrc.toLowerCase().trim());
    if (h.track?.youtubeId) recentlyPlayedIds.add(h.track.youtubeId.toLowerCase().trim());
  }

  // Step 2 & 3: Parallel Catalog Queries strictly for primary language
  const [langTopSearch, ...artistTracksResults] = await Promise.all([
    CompositeCatalogService.search(`Top ${primaryLang} Songs 2026`, countryCode, 30),
    ...finalArtists.map(artist => CompositeCatalogService.getArtistTopSongs(artist, countryCode, 15))
  ]);
  const countryCharts = langTopSearch.tracks;

  // Step 4: Rank, Dedupe & Filter
  const dedupeAndFilter = (tracks: CatalogTrack[], isDiscovery = false): CatalogTrack[] => {
    const seenTitles = new Set<string>();
    const artistCounts = new Map<string, number>();
    const result: CatalogTrack[] = [];

    for (const t of tracks) {
      if (isCompilationOrPlaylist(t.title, t.duration)) continue;
      const cleanTitle = (t.title || '').toLowerCase().trim();
      if (seenTitles.has(cleanTitle)) continue;

      // Drop tracks played in last 24 hours from discovery shelves
      if (isDiscovery) {
        if (recentlyPlayedTitles.has(cleanTitle)) continue;
        if (t.isrc && recentlyPlayedIds.has(t.isrc.toLowerCase().trim())) continue;
        if (t.sourceId && recentlyPlayedIds.has(t.sourceId.toLowerCase().trim())) continue;
      }

      // Max 2 tracks per artist
      const cleanArtist = cleanArtistNames(t.artist?.name || t.artists?.[0]?.name || 'Unknown');
      const artistNorm = cleanArtist.toLowerCase().trim();
      const currentArtistCount = artistCounts.get(artistNorm) || 0;
      if (currentArtistCount >= 2) continue;

      seenTitles.add(cleanTitle);
      artistCounts.set(artistNorm, currentArtistCount + 1);

      result.push({
        ...t,
        artist: {
          ...t.artist,
          id: cleanArtist ? `artist-${cleanArtist.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : (t.artist?.id || ''),
          name: cleanArtist
        }
      });
      if (result.length >= 15) break;
    }

    return result;
  };

  // Step 5: Batched indexed lookup by sourceId/isrc to mark "inLibrary" (Section 15)
  const allCandidateTracks = [
    ...countryCharts,
    ...artistTracksResults.flat()
  ];
  const sourceIds = allCandidateTracks.map(t => t.sourceId).filter(Boolean);
  const isrcs = allCandidateTracks.map(t => t.isrc).filter(Boolean) as string[];

  const inLibraryMatches = await prisma.track.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...(sourceIds.length > 0 ? [{ youtubeId: { in: sourceIds } }] : []),
        ...(isrcs.length > 0 ? [{ isrc: { in: isrcs } }] : [])
      ]
    },
    select: { id: true, youtubeId: true, isrc: true }
  });

  const librarySourceIdSet = new Set(inLibraryMatches.map(m => m.youtubeId).filter(Boolean));
  const libraryIsrcSet = new Set(inLibraryMatches.map(m => m.isrc).filter(Boolean));

  const markInLibrary = (tracks: CatalogTrack[]): CatalogTrack[] => {
    return tracks.map(t => ({
      ...t,
      inLibrary: (t.sourceId && librarySourceIdSet.has(t.sourceId)) || (t.isrc && libraryIsrcSet.has(t.isrc))
    }));
  };

  // Build Individual Shelves
  const shelves: ShelfItem[] = [];
  const now = Date.now();
  const expiresAt = now + 30 * 60 * 1000; // 30 min TTL

  // 1. Made For You (Discovery shelf)
  const madeForYouPool = artistTracksResults.flat();
  const madeForYouTracks = markInLibrary(dedupeAndFilter(madeForYouPool, true));
  if (madeForYouTracks.length > 0) {
    shelves.push({
      section: 'made_for_you',
      title: 'Made For You',
      subtitle: 'TAILORED TO YOUR ARTIST & LANGUAGE TASTE',
      type: 'made_for_you',
      items: madeForYouTracks,
      builtAt: now,
      expiresAt
    });
  }

  // 2. Top Songs in [user's country]
  const topCountryTracks = markInLibrary(dedupeAndFilter(countryCharts, false));
  shelves.push({
    section: 'top_country',
    title: `Top Songs in ${countryName}`,
    subtitle: `WHAT'S BIG IN YOUR REGION`,
    type: 'top_country',
    items: topCountryTracks,
    builtAt: now,
    expiresAt
  });

  // 3. Intro Shelf (User's primary selected artist)
  if (seedArtists[0] && artistTracksResults[0]?.length > 0) {
    shelves.push({
      section: 'intro_artist',
      title: `Essentials: ${seedArtists[0]}`,
      subtitle: 'FEATURED CATALOG HIGHLIGHTS',
      type: 'intro_artist',
      items: markInLibrary(dedupeAndFilter(artistTracksResults[0], false)),
      builtAt: now,
      expiresAt
    });
  }

  // 4. Because you like [artist] (for up to 2 other favorite artists)
  for (let i = 1; i < Math.min(seedArtists.length, 3); i++) {
    const artist = seedArtists[i];
    const tracks = artistTracksResults[i] || [];
    if (tracks.length > 0) {
      shelves.push({
        section: `because_like_${i}`,
        title: `Because You Like ${artist}`,
        subtitle: 'POPULAR DISCOVERIES',
        type: 'because_like',
        items: markInLibrary(dedupeAndFilter(tracks, true)),
        builtAt: now,
        expiresAt
      });
    }
  }

  // 5. Trending Now
  shelves.push({
    section: 'trending_now',
    title: 'Trending Now',
    subtitle: 'VIRAL SOUNDS & HIT CHARTS',
    type: 'trending_now',
    items: markInLibrary(dedupeAndFilter(countryCharts.slice(5), false)),
    builtAt: now,
    expiresAt
  });

  const payload: UserHomeShelvesPayload = {
    shelves,
    builtAt: now,
    expiresAt
  };

  // Save to Cache with 30 min TTL
  await setCacheVal(`user:home:shelves:${userId}`, payload, 1800);

  const durationMs = Date.now() - startTime;
  console.log(`[HomeShelvesWorker] Completed shelves build for ${userId} (${shelves.length} shelves, ${durationMs}ms)`);
  return payload;
}

// Initialize BullMQ Worker if Redis is active
if (shouldUseRedis) {
  try {
    redisConnection = new IORedis(REDIS_HOST_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });

    homeShelvesWorker = new Worker<HomeShelvesJobData>(
      'home-shelves',
      async (job: Job<HomeShelvesJobData>) => {
        const { userId } = job.data;
        await buildUserShelves(userId);
      },
      {
        connection: redisConnection,
        concurrency: Math.max(1, parseInt(process.env.HOME_SHELVES_CONCURRENCY || '1', 10))
      }
    );

    homeShelvesWorker.on('failed', (job, err) => {
      console.warn(`[HomeShelvesWorker] Job ${job?.id} failed:`, err.message);
    });

    console.log('[HomeShelvesWorker] BullMQ worker initialized with concurrency 1.');
  } catch (err: any) {
    console.warn('[HomeShelvesWorker] BullMQ worker init skipped:', err.message);
  }
}
