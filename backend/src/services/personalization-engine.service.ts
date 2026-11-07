import { AffinityDecayService } from './affinity-decay.service.js';
import { prisma } from '../utils/prisma.js';
import { jiosaavnCatalog } from './jiosaavn-catalog.service.js';
import { NormalizedTrack, NormalizedArtist, NormalizedAlbum } from './catalog-provider.interface.js';
import { normalizeCatalogLanguage, VERIFIED_CATALOG_LANGUAGES } from '../constants/languages.js';
import { getCacheVal, setCacheVal, invalidateCache } from '../utils/cache.js';

export const PERSONALIZATION_CONFIG = {
  HALF_LIFE_DAYS: 30,
  HALF_LIFE_MS: 30 * 24 * 60 * 60 * 1000,
  DECAY_LAMBDA: Math.LN2 / (30 * 24 * 60 * 60 * 1000),

  // Signals
  SCORE_COMPLETED: 1.0,
  SCORE_REPLAY: 2.0,
  SCORE_LIKE: 3.0,
  SCORE_PLAYLIST_ADD: 3.0,
  SCORE_SKIP_SHORT: -1.0, // < 30 seconds
  SCORE_REPEATED_SKIP_ARTIST: -2.5, // > 2 skips of same artist

  // Language weights
  EXPLICIT_WEIGHT_FLOOR: 0.4,
  MATURE_LISTENS_THRESHOLD: 50,

  // Cold start threshold
  COLD_START_LISTENS: 15,

  // Row diversity caps
  MAX_TRACKS_PER_ARTIST_ROW: 2,
  EXPLORATION_RATIO: 0.15, // 15% exploration
};

export interface ListenEventInput {
  clientEventId?: string;
  userId: string;
  trackId: string;
  artistIds?: string[];
  albumId?: string;
  language?: string;
  msPlayed: number;
  durationMs: number;
  completed?: boolean;
  skipped?: boolean;
  source?: string;
  hour?: number;
}

export interface UserAffinities {
  enabled: boolean;
  isColdStart: boolean;
  totalListens: number;
  languageWeights: Record<string, number>;
  topArtistIds: Array<{ id: string; score: number }>;
  skippedArtistIds: Set<string>;
  recentTrackIds: string[];
}

export interface FeedSection {
  id: string;
  title: string;
  subtitle?: string;
  type: 'tracks' | 'artists' | 'albums' | 'playlists';
  items: any[];
}

export class PersonalizationEngineService {
  /**
   * Record a ListenEvent and sync to user history
   */
  static async recordListenEvent(input: ListenEventInput) {
    if (!input.userId || !input.trackId) return null;

    try {
      // 0. Deduplicate by clientEventId if provided
      if (input.clientEventId) {
        const existing = await prisma.listenEvent.findUnique({
          where: { clientEventId: input.clientEventId }
        });
        if (existing) {
          return existing;
        }
      }

      // 1. Resolve track metadata if artistIds or language are missing
      let artistIds = input.artistIds || [];
      let language = input.language ? normalizeCatalogLanguage(input.language) : null;
      let albumId = input.albumId;

      if (artistIds.length === 0 || !language) {
        const track = await prisma.track.findUnique({
          where: { id: input.trackId },
          include: {
            artist: true,
            album: true,
            trackArtists: true,
          }
        });

        if (track) {
          if (artistIds.length === 0) {
            if (track.trackArtists && track.trackArtists.length > 0) {
              artistIds = track.trackArtists.map(ta => ta.artistId);
            } else if (track.artistId) {
              artistIds = [track.artistId];
            }
          }
          if (!language && track.language) {
            language = normalizeCatalogLanguage(track.language);
          }
          if (!albumId && track.albumId) {
            albumId = track.albumId;
          }
        }
      }

      const completed = Boolean(input.completed);
      const skipped = Boolean(input.skipped);

      // Compute hour in user's timezone (0-23)
      let hour = input.hour;
      if (hour === undefined || isNaN(hour) || hour < 0 || hour > 23) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: input.userId },
            select: { timezone: true }
          });
          const tz = user?.timezone || 'UTC';
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: 'numeric',
            hour12: false
          });
          hour = parseInt(formatter.format(new Date()), 10);
          if (isNaN(hour) || hour < 0 || hour > 23) {
            hour = new Date().getUTCHours();
          }
        } catch {
          hour = new Date().getUTCHours();
        }
      }

      // 2. Persist to ListenEvent table
      const event = await prisma.listenEvent.create({
        data: {
          clientEventId: input.clientEventId || undefined,
          userId: input.userId,
          trackId: input.trackId,
          artistIds,
          albumId,
          language,
          msPlayed: Math.max(0, Math.round(input.msPlayed || 0)),
          durationMs: Math.max(0, Math.round(input.durationMs || 0)),
          completed,
          skipped,
          source: input.source || 'player',
          hour,
        }
      });

      // 3. Incrementally update exponential decay user affinities
      await AffinityDecayService.applyListenEventAffinities({
        userId: input.userId,
        artistIds,
        albumId,
        language,
        completed,
        skipped,
        msPlayed: input.msPlayed,
        durationMs: input.durationMs,
      }).catch((err) => console.error('[PersonalizationEngine] Failed to apply affinities:', err));

      // 4. Keep History table in sync for fast "Jump back in" queries
      if (input.msPlayed >= 5000 || completed) {
        await prisma.history.create({
          data: {
            userId: input.userId,
            trackId: input.trackId,
            playedAt: new Date(),
          }
        }).catch(() => {});
      }

      // 5. Invalidate personalized homepage cache
      await this.invalidateUserFeedCache(input.userId);

      return event;
    } catch (err: any) {
      console.error('[PersonalizationEngine] Failed to record listen event:', err.message);
      return null;
    }
  }

  /**
   * Invalidate user personalized feed cache
   */
  static async invalidateUserFeedCache(userId: string) {
    if (!userId) return;
    try {
      await Promise.allSettled([
        invalidateCache(`user:feed:${userId}`),
        invalidateCache(`home:recently_played:${userId}`),
        invalidateCache(`home:made_for_you:${userId}`),
        invalidateCache(`user:home:shelves:${userId}`)
      ]);
    } catch {}
  }

  /**
   * Compute aggregated affinities with 30-day exponential decay
   */
  static async getUserAffinities(userId: string, selectedLanguages: string[]): Promise<UserAffinities> {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { personalizationEnabled: true, languages: true }
    });

    const isEnabled = prefs?.personalizationEnabled ?? true;
    const userLangs = (selectedLanguages && selectedLanguages.length > 0)
      ? selectedLanguages
      : ((prefs?.languages && prefs.languages.length > 0) ? prefs.languages : ['english']);

    // Default equal explicit weights: 1 / n
    const equalWeight = 1 / userLangs.length;
    const defaultLanguageWeights: Record<string, number> = {};
    for (const l of userLangs) {
      defaultLanguageWeights[l] = equalWeight;
    }

    if (!isEnabled) {
      return {
        enabled: false,
        isColdStart: true,
        totalListens: 0,
        languageWeights: defaultLanguageWeights,
        topArtistIds: [],
        skippedArtistIds: new Set(),
        recentTrackIds: [],
      };
    }

    // Read listen events from past 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const events = await prisma.listenEvent.findMany({
      where: {
        userId,
        createdAt: { gte: ninetyDaysAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const totalListens = events.length;
    const isColdStart = totalListens < PERSONALIZATION_CONFIG.COLD_START_LISTENS;

    const now = Date.now();
    const artistScores = new Map<string, number>();
    const artistSkipCounts = new Map<string, number>();
    const langScores = new Map<string, number>();
    const recentTrackIds: string[] = [];
    const seenTracks = new Set<string>();

    for (const ev of events) {
      if (!seenTracks.has(ev.trackId)) {
        seenTracks.add(ev.trackId);
        recentTrackIds.push(ev.trackId);
      }

      // Compute exponential decay weight
      const ageMs = now - ev.createdAt.getTime();
      const decay = Math.exp(-PERSONALIZATION_CONFIG.DECAY_LAMBDA * ageMs);

      // Score signal
      let signal = 0.5; // base listen
      if (ev.completed) {
        signal = PERSONALIZATION_CONFIG.SCORE_COMPLETED;
      } else if (ev.skipped && ev.msPlayed < 30000) {
        signal = PERSONALIZATION_CONFIG.SCORE_SKIP_SHORT;
      }

      const weightedScore = signal * decay;

      // Accumulate language scores (only for selected languages)
      if (ev.language) {
        const normLang = normalizeCatalogLanguage(ev.language);
        if (normLang && userLangs.includes(normLang)) {
          langScores.set(normLang, (langScores.get(normLang) || 0) + Math.max(0, weightedScore));
        }
      }

      // Accumulate artist scores
      if (ev.artistIds && ev.artistIds.length > 0) {
        for (const aId of ev.artistIds) {
          if (!aId) continue;
          if (ev.skipped && ev.msPlayed < 30000) {
            artistSkipCounts.set(aId, (artistSkipCounts.get(aId) || 0) + 1);
          }
          artistScores.set(aId, (artistScores.get(aId) || 0) + weightedScore);
        }
      }
    }

    // Apply repeated skip penalties (> 2 skips)
    const skippedArtistIds = new Set<string>();
    for (const [aId, skipCount] of artistSkipCounts.entries()) {
      if (skipCount >= 3) {
        skippedArtistIds.add(aId);
        artistScores.set(aId, (artistScores.get(aId) || 0) + PERSONALIZATION_CONFIG.SCORE_REPEATED_SKIP_ARTIST);
      }
    }

    // Compute language weights: final = a * explicit + (1 - a) * behavior (a >= 0.4)
    let totalSelectedDecayed = 0;
    for (const l of userLangs) {
      totalSelectedDecayed += (langScores.get(l) || 0);
    }

    const aFactor = Math.max(
      PERSONALIZATION_CONFIG.EXPLICIT_WEIGHT_FLOOR,
      1.0 - (totalListens / PERSONALIZATION_CONFIG.MATURE_LISTENS_THRESHOLD) * (1.0 - PERSONALIZATION_CONFIG.EXPLICIT_WEIGHT_FLOOR)
    );

    const languageWeights: Record<string, number> = {};
    for (const l of userLangs) {
      const explicit = equalWeight;
      const behavior = totalSelectedDecayed > 0 ? ((langScores.get(l) || 0) / totalSelectedDecayed) : explicit;
      languageWeights[l] = aFactor * explicit + (1 - aFactor) * behavior;
    }

    // Top artists sorted by score (positive only)
    const topArtistIds = Array.from(artistScores.entries())
      .filter(([id, score]) => score > 0 && !skippedArtistIds.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([id, score]) => ({ id, score }));

    return {
      enabled: isEnabled,
      isColdStart,
      totalListens,
      languageWeights,
      topArtistIds,
      skippedArtistIds,
      recentTrackIds: recentTrackIds.slice(0, 20),
    };
  }

  /**
   * Generates the complete 8 canonical home sections
   */
  static async getPersonalizedFeed(params: {
    userId?: string;
    languages?: string[];
    country?: string;
  }): Promise<{ sections: FeedSection[]; coldStart: boolean; languages: string[] }> {
    const { userId } = params;

    // 1. Resolve user's chosen languages
    let resolvedLanguages: string[] = [];
    if (params.languages && params.languages.length > 0) {
      resolvedLanguages = params.languages
        .map(l => normalizeCatalogLanguage(l))
        .filter((l): l is string => Boolean(l));
    }

    if (resolvedLanguages.length === 0 && userId) {
      const userPrefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { languages: true }
      });
      if (userPrefs?.languages && userPrefs.languages.length > 0) {
        resolvedLanguages = userPrefs.languages
          .map(l => normalizeCatalogLanguage(l))
          .filter((l): l is string => Boolean(l));
      }
    }

    // If still empty (e.g. guest first visit), fall back to english
    if (resolvedLanguages.length === 0) {
      resolvedLanguages = ['english'];
    }

    // Dedupe & cap at 6
    resolvedLanguages = Array.from(new Set(resolvedLanguages)).slice(0, 6);

    // Cache key incorporates userId and sorted languages
    const cacheKey = `user:feed:${userId || 'guest'}:${[...resolvedLanguages].sort().join('-')}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Compute affinities
    let affinities: UserAffinities;
    if (userId) {
      affinities = await this.getUserAffinities(userId, resolvedLanguages);
    } else {
      const equalW = 1 / resolvedLanguages.length;
      const lw: Record<string, number> = {};
      for (const l of resolvedLanguages) lw[l] = equalW;
      affinities = {
        enabled: true,
        isColdStart: true,
        totalListens: 0,
        languageWeights: lw,
        topArtistIds: [],
        skippedArtistIds: new Set(),
        recentTrackIds: [],
      };
    }

    const seenTrackIds = new Set<string>();

    // ── Helper to format track ──
    const formatTrack = (t: NormalizedTrack) => {
      const primaryArtist = t.primaryArtist || t.artists?.[0] || { id: '', name: 'Artist' };
      const artistId = primaryArtist.id ? (primaryArtist.id.startsWith('saavn-artist-') ? primaryArtist.id : `saavn-artist-${primaryArtist.id}`) : '';
      const trackId = t.id ? (t.id.startsWith('saavn-') ? t.id : `saavn-${t.id}`) : '';

      return {
        id: trackId,
        providerId: t.id,
        title: t.title,
        coverUrl: t.coverUrl,
        audioUrl: t.audioUrl,
        duration: t.duration,
        genre: t.genre,
        language: t.language,
        streams: t.playCount || 1500000,
        like_count: 45000,
        artistId: artistId,
        artist: {
          id: artistId,
          name: primaryArtist.name || 'Artist',
          imageUrl: primaryArtist.imageUrl || t.coverUrl,
        },
        album: t.albumId ? {
          id: t.albumId.startsWith('saavn-album-') ? t.albumId : `saavn-album-${t.albumId}`,
          title: t.albumTitle || t.title,
          coverUrl: t.coverUrl,
        } : undefined,
      };
    };

    // Helper to format artist (Hides any artist without valid ID and valid image)
    const formatArtist = (a: { id: string; name: string; imageUrl?: string; followerCount?: number }) => {
      const hasValidImage = a.imageUrl &&
        !a.imageUrl.includes('placeholder') &&
        !a.imageUrl.includes('ui-avatars.com') &&
        a.imageUrl.startsWith('http');

      const validId = a.id;
      if (!validId || !hasValidImage || !a.name || a.name.toLowerCase() === 'unknown artist') {
        return null;
      }

      const artistId = a.id.startsWith('saavn-artist-') ? a.id : `saavn-artist-${a.id}`;

      return {
        id: artistId,
        providerId: a.id.replace(/^saavn-artist-/, ''),
        name: a.name,
        imageUrl: a.imageUrl,
        follower_count: a.followerCount || 500000,
        verified: true,
        isArtist: true,
      };
    };

    // ── Section 1: Jump back in (recently played) ──
    let jumpBackInItems: any[] = [];
    if (userId && affinities.recentTrackIds.length > 0) {
      const historyRows = await prisma.history.findMany({
        where: { userId },
        orderBy: { playedAt: 'desc' },
        take: 30,
        include: {
          track: {
            include: {
              artist: true,
              album: true,
            }
          }
        }
      });

      for (const h of historyRows) {
        if (!h.track || seenTrackIds.has(h.track.id)) continue;
        seenTrackIds.add(h.track.id);
        jumpBackInItems.push({
          id: h.track.id,
          providerId: h.track.providerId,
          title: h.track.title,
          coverUrl: h.track.coverUrl,
          audioUrl: h.track.audioUrl,
          duration: h.track.duration,
          genre: h.track.genre,
          language: h.track.language,
          artistId: h.track.artistId,
          artist: {
            id: h.track.artist?.id || '',
            name: h.track.artist?.name || 'Artist',
            imageUrl: h.track.artist?.imageUrl || h.track.coverUrl,
          },
          album: h.track.album ? {
            id: h.track.album.id,
            title: h.track.album.title,
            coverUrl: h.track.album.coverUrl,
          } : undefined,
        });
        if (jumpBackInItems.length >= 12) break;
      }
    }

    // ── Section 4: Trending now (per selected language, interleaved) ──
    const trendingByLang: Record<string, NormalizedTrack[]> = {};
    await Promise.all(
      resolvedLanguages.map(async (lang) => {
        try {
          const list = await jiosaavnCatalog.getTrending(lang, 'in', 15);
          trendingByLang[lang] = list || [];
        } catch {
          trendingByLang[lang] = [];
        }
      })
    );

    // Round-robin interleave across selected languages
    const trendingInterleaved: any[] = [];
    let maxLen = Math.max(...resolvedLanguages.map(l => (trendingByLang[l] || []).length), 0);
    for (let i = 0; i < maxLen && trendingInterleaved.length < 24; i++) {
      for (const lang of resolvedLanguages) {
        const item = trendingByLang[lang]?.[i];
        if (item && !seenTrackIds.has(item.id)) {
          seenTrackIds.add(item.id);
          trendingInterleaved.push(formatTrack(item));
        }
      }
    }

    // ── Section 5: New releases (per selected language, interleaved) ──
    const newReleasesByLang: Record<string, NormalizedTrack[]> = {};
    await Promise.all(
      resolvedLanguages.map(async (lang) => {
        try {
          const list = await jiosaavnCatalog.getNewReleases(lang, 'in', 15);
          newReleasesByLang[lang] = list || [];
        } catch {
          newReleasesByLang[lang] = [];
        }
      })
    );

    const newReleasesInterleaved: any[] = [];
    maxLen = Math.max(...resolvedLanguages.map(l => (newReleasesByLang[l] || []).length), 0);
    for (let i = 0; i < maxLen && newReleasesInterleaved.length < 24; i++) {
      for (const lang of resolvedLanguages) {
        const item = newReleasesByLang[lang]?.[i];
        if (item && !seenTrackIds.has(item.id)) {
          seenTrackIds.add(item.id);
          newReleasesInterleaved.push(formatTrack(item));
        }
      }
    }

    // ── Section 2: Recommended for you (Candidate generation & re-ranking) ──
    let recommendedItems: any[] = [];
    const candidateTracks: NormalizedTrack[] = [];

    // Candidate Source A: Artist radio for top user affinity artists
    if (affinities.topArtistIds.length > 0) {
      await Promise.all(
        affinities.topArtistIds.slice(0, 3).map(async ({ id: artistId }) => {
          try {
            const cleanProviderId = artistId.replace(/^(saavn-artist-|artist-)/, '');
            const radioTracks = await jiosaavnCatalog.getArtistRadio(cleanProviderId, 10);
            if (radioTracks) candidateTracks.push(...radioTracks);
          } catch {}
        })
      );
    }

    // Candidate Source B: Song suggestions from recent listened tracks
    if (affinities.recentTrackIds.length > 0) {
      const topSeedTrack = affinities.recentTrackIds[0].replace(/^(saavn-|track-)/, '');
      try {
        const suggestions = await jiosaavnCatalog.getSongSuggestions(topSeedTrack, 10);
        if (suggestions) candidateTracks.push(...suggestions);
      } catch {}
    }

    // Candidate Source C: High engagement tracks in user's selected languages
    for (const lang of resolvedLanguages) {
      const trendingSlice = (trendingByLang[lang] || []).slice(0, 8);
      candidateTracks.push(...trendingSlice);
    }

    // Re-rank candidates locally:
    // score = langWeight * 40 + artistAffinityScore * 30 + recencyScore * 15 + popularityScore * 15
    const scoredCandidates: Array<{ track: NormalizedTrack; score: number }> = [];
    const artistCounts = new Map<string, number>();

    for (const c of candidateTracks) {
      if (seenTrackIds.has(c.id)) continue;

      // Filter: strictly within user's selected languages
      const cLang = c.language ? normalizeCatalogLanguage(c.language) : null;
      if (cLang && !resolvedLanguages.includes(cLang)) {
        continue;
      }

      const langWeight = cLang ? (affinities.languageWeights[cLang] || 0.2) : 0.2;
      const primaryArtist = c.primaryArtist || c.artists?.[0];
      const artistId = primaryArtist?.id || '';
      const artistMatch = affinities.topArtistIds.find(a => a.id === artistId);
      const artistScore = artistMatch ? Math.min(artistMatch.score, 5) / 5 : 0;

      // Exploration ratio jitter (15%)
      const explorationJitter = (Math.random() * PERSONALIZATION_CONFIG.EXPLORATION_RATIO);

      const finalScore = (langWeight * 40) + (artistScore * 30) + (explorationJitter * 30);
      scoredCandidates.push({ track: c, score: finalScore });
    }

    // Sort descending by score
    scoredCandidates.sort((a, b) => b.score - a.score);

    for (const sc of scoredCandidates) {
      const pArtist = sc.track.primaryArtist || sc.track.artists?.[0];
      const aId = pArtist?.id || 'unknown';
      const count = artistCounts.get(aId) || 0;
      if (count >= PERSONALIZATION_CONFIG.MAX_TRACKS_PER_ARTIST_ROW) continue;

      artistCounts.set(aId, count + 1);
      seenTrackIds.add(sc.track.id);
      recommendedItems.push(formatTrack(sc.track));

      if (recommendedItems.length >= 18) break;
    }

    // ── Section 3: Artists you may like (valid id and valid image only) ──
    const artistsYouMayLike: any[] = [];
    const seenArtistIds = new Set<string>();

    // Collect artists from top affinity and trending
    for (const t of [...candidateTracks, ...trendingInterleaved, ...newReleasesInterleaved]) {
      const art = t.primaryArtist || t.artists?.[0];
      if (!art) continue;
      const rawId = art.id;
      if (!rawId || seenArtistIds.has(rawId)) continue;

      const formatted = formatArtist(art);
      if (formatted) {
        seenArtistIds.add(rawId);
        artistsYouMayLike.push(formatted);
      }
      if (artistsYouMayLike.length >= 14) break;
    }

    // ── Section 6: Top charts & Top playlists ──
    const chartItems: any[] = [];
    for (const lang of resolvedLanguages) {
      chartItems.push({
        id: `chart-top-${lang}`,
        title: `Top 50: ${lang.charAt(0).toUpperCase() + lang.slice(1)}`,
        subtitle: 'Official Weekly Chart',
        coverUrl: `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80`,
        isPlaylist: true,
        type: 'playlist',
        language: lang,
      });
    }

    // ── Section 7: Albums for you ──
    const albumsForYou: any[] = [];
    const seenAlbumIds = new Set<string>();
    for (const t of [...newReleasesInterleaved, ...trendingInterleaved]) {
      if (!t.albumId || seenAlbumIds.has(t.albumId)) continue;
      seenAlbumIds.add(t.albumId);
      const albumArtist = t.primaryArtist || t.artists?.[0];
      albumsForYou.push({
        id: t.albumId.startsWith('saavn-album-') ? t.albumId : `saavn-album-${t.albumId}`,
        providerId: t.albumId,
        title: t.albumTitle || t.title,
        coverUrl: t.coverUrl,
        artistName: albumArtist?.name || 'Various Artists',
        isAlbum: true,
        type: 'album',
      });
      if (albumsForYou.length >= 12) break;
    }

    // ── Section 8: Radio & mood or vibe rows ("Because you listened to X") ──
    let vibeSection: FeedSection | null = null;
    if (affinities.topArtistIds.length > 0 && candidateTracks.length > 0) {
      const topArtistRef = candidateTracks.find(t => {
        const a = t.primaryArtist || t.artists?.[0];
        return a?.id === affinities.topArtistIds[0]?.id;
      });
      const topArtist = topArtistRef?.primaryArtist || topArtistRef?.artists?.[0];
      if (topArtist && topArtist.name) {
        const radioTracks = candidateTracks
          .filter(t => {
            const a = t.primaryArtist || t.artists?.[0];
            return a?.id === affinities.topArtistIds[0]?.id;
          })
          .slice(0, 10)
          .map(formatTrack);

        if (radioTracks.length >= 3) {
          vibeSection = {
            id: 'because-you-listened',
            title: `Because You Listened to ${topArtist.name}`,
            subtitle: 'RECOMMENDED RADIO & SIMILAR RELEASES',
            type: 'tracks',
            items: radioTracks,
          };
        }
      }
    }

    // ── Assemble Final Sections in Order ──
    const sections: FeedSection[] = [];

    if (affinities.isColdStart) {
      // Cold start: Trending, New releases, Top charts, Artists, Albums
      if (trendingInterleaved.length > 0) {
        sections.push({
          id: 'trending-now',
          title: 'Trending Now',
          subtitle: `TOP CHARTS IN ${resolvedLanguages.map(l => l.toUpperCase()).join(' & ')}`,
          type: 'tracks',
          items: trendingInterleaved,
        });
      }

      if (newReleasesInterleaved.length > 0) {
        sections.push({
          id: 'new-releases',
          title: 'New Releases',
          subtitle: 'FRESH TRACKS FROM SELECTED LANGUAGES',
          type: 'tracks',
          items: newReleasesInterleaved,
        });
      }

      if (artistsYouMayLike.length > 0) {
        sections.push({
          id: 'artists-you-may-like',
          title: 'Artists You May Like',
          subtitle: 'EXPLORE VOICES ACROSS YOUR LANGUAGES',
          type: 'artists',
          items: artistsYouMayLike,
        });
      }

      if (chartItems.length > 0) {
        sections.push({
          id: 'top-charts',
          title: 'Top Charts & Playlists',
          subtitle: 'CURATED SELECTIONS',
          type: 'playlists',
          items: chartItems,
        });
      }

      if (albumsForYou.length > 0) {
        sections.push({
          id: 'albums-for-you',
          title: 'Albums for You',
          subtitle: 'FEATURED DISCOGRAPHIES',
          type: 'albums',
          items: albumsForYou,
        });
      }
    } else {
      // History >= 15 listens: Personal rows lead!
      // 1. Jump back in
      if (jumpBackInItems.length > 0) {
        sections.push({
          id: 'jump-back-in',
          title: 'Jump Back In',
          subtitle: 'RECENTLY PLAYED',
          type: 'tracks',
          items: jumpBackInItems,
        });
      }

      // 2. Recommended for you
      if (recommendedItems.length > 0) {
        sections.push({
          id: 'recommended-for-you',
          title: 'Recommended for You',
          subtitle: 'TUNED TO YOUR TASTE AND SELECTED LANGUAGES',
          type: 'tracks',
          items: recommendedItems,
        });
      }

      // 3. Artists you may like
      if (artistsYouMayLike.length > 0) {
        sections.push({
          id: 'artists-you-may-like',
          title: 'Artists You May Like',
          subtitle: 'DISCOVER SIMILAR SOUNDS',
          type: 'artists',
          items: artistsYouMayLike,
        });
      }

      // 4. Trending now
      if (trendingInterleaved.length > 0) {
        sections.push({
          id: 'trending-now',
          title: 'Trending Now',
          subtitle: `TOP TRACKS IN ${resolvedLanguages.map(l => l.toUpperCase()).join(' & ')}`,
          type: 'tracks',
          items: trendingInterleaved,
        });
      }

      // 5. New releases
      if (newReleasesInterleaved.length > 0) {
        sections.push({
          id: 'new-releases',
          title: 'New Releases',
          subtitle: 'LATEST SINGLES AND ALBUMS',
          type: 'tracks',
          items: newReleasesInterleaved,
        });
      }

      // 6. Top charts
      if (chartItems.length > 0) {
        sections.push({
          id: 'top-charts',
          title: 'Top Charts & Playlists',
          subtitle: 'COMMUNITY FAVORITES',
          type: 'playlists',
          items: chartItems,
        });
      }

      // 7. Albums for you
      if (albumsForYou.length > 0) {
        sections.push({
          id: 'albums-for-you',
          title: 'Albums for You',
          subtitle: 'FEATURED EXTENDED RELEASES',
          type: 'albums',
          items: albumsForYou,
        });
      }

      // 8. Radio & vibe rows
      if (vibeSection && vibeSection.items.length > 0) {
        sections.push(vibeSection);
      }
    }

    const payload = {
      sections,
      coldStart: affinities.isColdStart,
      languages: resolvedLanguages,
    };

    // Cache with TTL = 10 minutes
    await setCacheVal(cacheKey, payload, 600);

    return payload;
  }

  /**
   * Clear user's listening history (Privacy control)
   */
  static async clearListeningHistory(userId: string) {
    if (!userId) return { success: false };

    try {
      await Promise.all([
        prisma.listenEvent.deleteMany({ where: { userId } }),
        prisma.listeningEvent.deleteMany({ where: { userId } }),
        prisma.listeningEventArtist.deleteMany({ where: { userId } }),
        prisma.userArtistStat.deleteMany({ where: { userId } }),
        prisma.userHourlyStat.deleteMany({ where: { userId } }),
        prisma.history.deleteMany({ where: { userId } }),
        prisma.userTrackStat.deleteMany({ where: { userId } }),
        AffinityDecayService.clearAffinities(userId),
      ]);

      await this.invalidateUserFeedCache(userId);
      return { success: true, message: 'Listening history cleared successfully.' };
    } catch (err: any) {
      console.error('[PersonalizationEngine] Failed to clear history:', err.message);
      throw err;
    }
  }

  /**
   * Toggle personalization on or off (Privacy control)
   */
  static async setPersonalizationEnabled(userId: string, enabled: boolean) {
    if (!userId) return { success: false };

    try {
      const updated = await prisma.userPreferences.upsert({
        where: { userId },
        update: { personalizationEnabled: enabled },
        create: { userId, personalizationEnabled: enabled }
      });

      await this.invalidateUserFeedCache(userId);
      return { success: true, personalizationEnabled: updated.personalizationEnabled };
    } catch (err: any) {
      console.error('[PersonalizationEngine] Failed to toggle personalization:', err.message);
      throw err;
    }
  }
}
