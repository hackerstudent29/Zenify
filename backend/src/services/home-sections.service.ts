import axios from 'axios';
import { prisma } from '../utils/prisma';
import { getCacheVal, setCacheVal } from '../utils/cache';
import { PreferencesService } from './preferences.service';

const TTL_SECONDS = 600; // 10 minutes cache

// Helper to format track for frontend PlayerStore & ContentRow
function formatTrackItem(t: any) {
  return {
    id: t.id,
    title: t.title,
    coverUrl: t.coverUrl,
    audioUrl: t.audioUrl,
    duration: t.duration,
    genre: t.genre,
    language: t.language,
    streams: t.streams,
    like_count: t.like_count,
    palette: t.palette,
    artistId: t.artist?.id,
    artist: {
      id: t.artist?.id || '',
      name: t.artist?.name || 'Unknown Artist',
      imageUrl: t.artist?.imageUrl || t.artist?.coverUrl
    },
    album: t.album ? {
      id: t.album.id,
      title: t.album.title,
      coverUrl: t.album.coverUrl,
      palette: t.album.palette
    } : undefined
  };
}

export class HomeSectionsService {
  // In-flight promise map for request deduplication
  private static inFlightRequests = new Map<string, Promise<any>>();

  private static async getCachedOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = await getCacheVal(key);
    if (cached) return cached as T;

    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key) as Promise<T>;
    }

    const fetchPromise = (async () => {
      try {
        const result = await fetcher();
        if (result) {
          await setCacheVal(key, result, TTL_SECONDS);
        }
        return result;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Helper to retrieve user profile or fallback onboarding preferences
   * Computes recency-weighted artist affinities without hardcoded fallbacks
   */
  private static async getUserTaste(userId?: string) {
    if (!userId) {
      return {
        languages: [] as string[],
        genres: [] as string[],
        topArtistName: null as string | null,
        topArtists: [] as string[]
      };
    }

    const [profile, preferences, recentLikes, recentHistory] = await Promise.all([
      prisma.userInterestProfile.findUnique({ where: { userId } }),
      prisma.userPreferences.findUnique({ where: { userId } }),
      prisma.like.findMany({
        where: { userId },
        include: { track: { select: { artist: { select: { name: true } }, genre: true, language: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30
      }),
      prisma.history.findMany({
        where: { userId },
        include: { track: { select: { artist: { select: { name: true } }, genre: true, language: true } } },
        orderBy: { playedAt: 'desc' },
        take: 50
      })
    ]);

    let languages: string[] = [];
    let genres: string[] = [];

    if (profile?.languageWeights && Object.keys(profile.languageWeights as any).length > 0) {
      languages = Object.keys(profile.languageWeights as any);
    } else if (preferences?.languages && preferences.languages.length > 0) {
      languages = preferences.languages;
    }

    if (profile?.genreWeights && Object.keys(profile.genreWeights as any).length > 0) {
      genres = Object.keys(profile.genreWeights as any);
    } else if (preferences?.preferredGenres && preferences.preferredGenres.length > 0) {
      genres = preferences.preferredGenres;
    }

    // Recency-weighted artist ranking:
    // - Onboarding / Account favorite artists: +25 base points
    // - Liked tracks: <= 7 days (+12 pts), <= 30 days (+6 pts), older (+3 pts)
    // - Listening history plays: <= 24 hrs (+10 pts), <= 7 days (+5 pts), older (+2 pts)
    const artistScores = new Map<string, number>();
    const now = Date.now();

    if (preferences?.favoriteArtists && Array.isArray(preferences.favoriteArtists)) {
      for (const fav of preferences.favoriteArtists as any[]) {
        const name = fav?.name?.trim();
        if (name) {
          artistScores.set(name, (artistScores.get(name) || 0) + 25);
        }
      }
    }

    for (const like of recentLikes) {
      const artistName = like.track?.artist?.name?.trim();
      if (artistName) {
        const ageDays = (now - new Date(like.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const weight = ageDays <= 7 ? 12 : ageDays <= 30 ? 6 : 3;
        artistScores.set(artistName, (artistScores.get(artistName) || 0) + weight);
      }
    }

    for (const hist of recentHistory) {
      const artistName = hist.track?.artist?.name?.trim();
      if (artistName) {
        const ageDays = (now - new Date(hist.playedAt).getTime()) / (1000 * 60 * 60 * 24);
        const weight = ageDays <= 1 ? 10 : ageDays <= 7 ? 5 : 2;
        artistScores.set(artistName, (artistScores.get(artistName) || 0) + weight);
      }
    }

    const sortedArtists = Array.from(artistScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    const topArtists = sortedArtists.slice(0, 3);
    const topArtistName = topArtists[0] || null;

    return { languages, genres, topArtistName, topArtists };
  }

  /**
   * Helper: Resolves genuine tracks for an artist from DB, falling back to external catalog (iTunes Search API)
   */
  private static async fetchTracksForArtist(artistName: string, limit: number = 15): Promise<any[]> {
    if (!artistName || !artistName.trim()) return [];
    const cleanName = artistName.trim();

    // 1. Check DB first
    const dbTracks = await prisma.track.findMany({
      where: {
        deletedAt: null,
        audioUrl: { not: '' },
        artist: { name: { equals: cleanName, mode: 'insensitive' } }
      },
      take: limit,
      orderBy: { streams: 'desc' },
      include: { artist: true, album: true }
    });

    if (dbTracks.length >= Math.min(limit, 8)) {
      return dbTracks.map(formatTrackItem);
    }

    // 2. Query authorized external catalog (iTunes Search API)
    try {
      const res = await axios.get('https://itunes.apple.com/search', {
        params: {
          term: cleanName,
          media: 'music',
          entity: 'song',
          limit: 15
        },
        timeout: 4000
      });

      const itunesTracks = (res.data?.results || [])
        .filter((r: any) => r.previewUrl && r.trackName)
        .map((r: any) => ({
          id: `itunes-${r.trackId}`,
          title: r.trackName,
          coverUrl: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '600x600bb') : '',
          audioUrl: r.previewUrl,
          duration: Math.round((r.trackTimeMillis || 30000) / 1000),
          genre: r.primaryGenreName || 'Pop',
          language: r.country || 'Global',
          streams: 1500000,
          like_count: 75000,
          isVirtual: true,
          artist: {
            id: `itunes-artist-${r.artistId || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            name: r.artistName || cleanName,
            imageUrl: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '600x600bb') : undefined
          },
          album: r.collectionName ? {
            id: `itunes-album-${r.collectionId || '0'}`,
            title: r.collectionName,
            coverUrl: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '600x600bb') : undefined
          } : undefined
        }));

      // Deduplicate by title
      const existingTitles = new Set(dbTracks.map(t => t.title.toLowerCase().trim()));
      const merged = [...dbTracks.map(formatTrackItem)];

      for (const t of itunesTracks) {
        const lower = t.title.toLowerCase().trim();
        if (!existingTitles.has(lower)) {
          existingTitles.add(lower);
          merged.push(t);
          if (merged.length >= limit) break;
        }
      }

      return merged;
    } catch (err: any) {
      console.warn(`[HomeSectionsService] Failed to fetch external tracks for ${cleanName}:`, err.message);
      return dbTracks.map(formatTrackItem);
    }
  }

  /**
   * 1. Made For You
   * Personalised track mix matching user's selected artists, preferred genres, and languages
   */
  static async getMadeForYou(userId?: string) {
    if (!userId) {
      return this.getTrendingNow();
    }

    const key = `home:made_for_you:${userId}`;
    return this.getCachedOrFetch(key, async () => {
      const { languages, genres, topArtists } = await this.getUserTaste(userId);

      // 1. Fetch tracks from user's top favorite artists
      const favoriteArtistTrackPromises = topArtists.slice(0, 3).map(artist =>
        this.fetchTracksForArtist(artist, 5)
      );
      const artistTracksGroups = await Promise.all(favoriteArtistTrackPromises);
      const artistTracks = artistTracksGroups.flat();

      // 2. Query database tracks matching user's preferred languages or genres
      const targetLangs = languages.slice(0, 3);
      const dbTracks = await prisma.track.findMany({
        where: {
          deletedAt: null,
          audioUrl: { not: '' },
          OR: [
            ...(targetLangs.length > 0 ? [{ language: { in: targetLangs, mode: 'insensitive' as const } }] : []),
            ...(genres.length > 0 ? [{ genre: { in: genres, mode: 'insensitive' as const } }] : [])
          ]
        },
        orderBy: { streams: 'desc' },
        take: 12,
        include: { artist: true, album: true }
      });

      const existingTitles = new Set<string>();
      const merged: any[] = [];

      // Interleave artist tracks and matching DB tracks
      const maxLen = Math.max(artistTracks.length, dbTracks.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < artistTracks.length) {
          const item = artistTracks[i];
          const lower = item.title.toLowerCase().trim();
          if (!existingTitles.has(lower)) {
            existingTitles.add(lower);
            merged.push(item);
          }
        }
        if (i < dbTracks.length) {
          const item = formatTrackItem(dbTracks[i]);
          const lower = item.title.toLowerCase().trim();
          if (!existingTitles.has(lower)) {
            existingTitles.add(lower);
            merged.push(item);
          }
        }
        if (merged.length >= 15) break;
      }

      // Fallback if still under 6: fill with trending tracks
      if (merged.length < 6) {
        const extra = await prisma.track.findMany({
          where: { deletedAt: null, audioUrl: { not: '' } },
          orderBy: { streams: 'desc' },
          take: 10,
          include: { artist: true, album: true }
        });
        for (const t of extra) {
          const item = formatTrackItem(t);
          const lower = item.title.toLowerCase().trim();
          if (!existingTitles.has(lower)) {
            existingTitles.add(lower);
            merged.push(item);
            if (merged.length >= 15) break;
          }
        }
      }

      return {
        title: 'Made For You',
        subtitle: 'TAILORED TO YOUR MUSIC TASTE',
        type: 'made_for_you',
        items: merged
      };
    });
  }

  /**
   * 2. Top Songs in Your Country
   */
  static async getTopSongsInCountry(userId?: string, countryCode?: string) {
    let country = countryCode;
    if (!country && userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
      country = user?.country || 'India';
    }
    if (!country) country = 'India';

    const key = `home:country_top:${country.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    return this.getCachedOrFetch(key, async () => {
      const tracks = await prisma.track.findMany({
        where: {
          deletedAt: null,
          audioUrl: { not: '' },
          OR: [
            { region: { equals: country, mode: 'insensitive' } },
            { region: 'Global' }
          ]
        },
        orderBy: { streams: 'desc' },
        take: 15,
        include: { artist: true, album: true }
      });

      return {
        title: `Top Songs in ${country}`,
        subtitle: `WHAT'S BIG IN YOUR REGION`,
        type: 'top_country',
        items: tracks.map(formatTrackItem)
      };
    });
  }

  /**
   * 3. New Releases in Your Languages
   */
  static async getNewReleasesInLanguages(userId?: string) {
    const key = `home:new_releases_lang:${userId || 'anon'}`;
    return this.getCachedOrFetch(key, async () => {
      const { languages, topArtists } = await this.getUserTaste(userId);
      const dbTracks = await prisma.track.findMany({
        where: {
          deletedAt: null,
          audioUrl: { not: '' },
          language: { in: languages, mode: 'insensitive' }
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { artist: true, album: true }
      });

      let items = dbTracks.map(formatTrackItem);

      // If DB has few tracks for user languages, supplement with top tracks from user's favorite artists
      if (items.length < 8 && topArtists.length > 0) {
        const extraTracks = await this.fetchTracksForArtist(topArtists[0], 8);
        const existingTitles = new Set(items.map(t => t.title.toLowerCase().trim()));
        for (const t of extraTracks) {
          const lower = t.title.toLowerCase().trim();
          if (!existingTitles.has(lower)) {
            existingTitles.add(lower);
            items.push(t);
            if (items.length >= 15) break;
          }
        }
      }

      return {
        title: 'New Releases in Your Languages',
        subtitle: 'FRESH DROPS IN YOUR FAVORITE FREQUENCIES',
        type: 'new_releases_lang',
        items
      };
    });
  }

  /**
   * 4. Trending Now
   */
  static async getTrendingNow() {
    const key = 'home:trending_now';
    return this.getCachedOrFetch(key, async () => {
      const tracks = await prisma.track.findMany({
        where: {
          deletedAt: null,
          audioUrl: { not: '' }
        },
        orderBy: [
          { trendingScore: 'desc' },
          { streams: 'desc' }
        ],
        take: 15,
        include: { artist: true, album: true }
      });

      return {
        title: 'Trending Now',
        subtitle: 'THE MOST PLAYED TRACKS RIGHT NOW',
        type: 'trending_now',
        items: tracks.map(formatTrackItem)
      };
    });
  }

  /**
   * 5. Because You Like [Real Artist]
   * Generates a shelf for the user's top qualifying artist based on recency-weighted preference
   */
  static async getBecauseYouLike(userId?: string) {
    if (!userId) {
      return {
        title: '',
        subtitle: '',
        type: 'because_you_like',
        items: []
      };
    }

    const { topArtistName, languages } = await this.getUserTaste(userId);
    if (!topArtistName) {
      return {
        title: '',
        subtitle: '',
        type: 'because_you_like',
        items: []
      };
    }

    const key = `home:because_like:${userId}:${encodeURIComponent(topArtistName)}`;

    return this.getCachedOrFetch(key, async () => {
      // Find artist tracks via DB or authorized catalog
      const items = await this.fetchTracksForArtist(topArtistName, 15);

      if (items.length === 0) {
        return {
          title: '',
          subtitle: '',
          type: 'because_you_like',
          items: []
        };
      }

      return {
        title: `Because You Like ${topArtistName}`,
        subtitle: `MORE VIBES & TOP HITS BY ${topArtistName.toUpperCase()}`,
        type: 'because_you_like',
        items
      };
    });
  }

  /**
   * 6. Popular Artists in Your Languages
   */
  static async getPopularArtistsInLanguages(userId?: string) {
    const key = `home:artists_lang:${userId || 'anon'}`;
    return this.getCachedOrFetch(key, async () => {
      const { languages, topArtists } = await this.getUserTaste(userId);

      const artists = await prisma.artist.findMany({
        where: languages.length > 0 ? {
          tracks: {
            some: {
              language: { in: languages, mode: 'insensitive' }
            }
          }
        } : undefined,
        orderBy: { monthlyListeners: 'desc' },
        take: 12,
        select: {
          id: true,
          name: true,
          imageUrl: true,
          coverUrl: true,
          monthlyListeners: true
        }
      });

      const items: any[] = artists.map(a => ({
        id: a.id,
        name: a.name,
        imageUrl: a.imageUrl || a.coverUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=18181b&color=e11d48&size=300`,
        isArtist: true,
        type: 'artist'
      }));

      const seenNames = new Set(items.map(a => a.name.toLowerCase().trim()));

      // Include user's favorite artists if not already in DB list
      for (const artistName of topArtists) {
        const lower = artistName.toLowerCase().trim();
        if (!seenNames.has(lower)) {
          seenNames.add(lower);
          const image = await PreferencesService.resolveArtistImage(artistName);
          items.push({
            id: `artist-${artistName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            name: artistName,
            imageUrl: image || `https://ui-avatars.com/api/?name=${encodeURIComponent(artistName)}&background=18181b&color=e11d48&size=300`,
            isArtist: true,
            type: 'artist'
          });
        }
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
   * 7. Top Genre Playlists
   */
  static async getTopGenrePlaylists(userId?: string) {
    const key = `home:genre_playlists:${userId || 'anon'}`;
    return this.getCachedOrFetch(key, async () => {
      const { genres } = await this.getUserTaste(userId);

      const playlists = await prisma.playlist.findMany({
        where: {
          isPublic: true,
          OR: [
            ...genres.map(g => ({ name: { contains: g, mode: 'insensitive' as const } })),
            { follower_count: { gt: 0 } }
          ]
        },
        orderBy: { follower_count: 'desc' },
        take: 12,
        select: {
          id: true,
          name: true,
          description: true,
          coverUrl: true,
          follower_count: true
        }
      });

      const items: any[] = playlists.map(p => ({
        id: p.id,
        name: p.name,
        title: p.name,
        description: p.description,
        coverUrl: p.coverUrl,
        isPlaylist: true,
        type: 'playlist'
      }));

      // If DB has few playlists, create curated mixes for user's selected genres
      if (items.length < 4 && genres.length > 0) {
        for (const genre of genres.slice(0, 4)) {
          const mixName = `${genre} Mix`;
          if (!items.some(p => p.name.toLowerCase() === mixName.toLowerCase())) {
            items.push({
              id: `genre-mix-${genre.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
              name: mixName,
              title: mixName,
              description: `The best of ${genre} curated for your sonic universe`,
              coverUrl: `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60`,
              isPlaylist: true,
              type: 'playlist'
            });
          }
        }
      }

      return {
        title: 'Top Genre Playlists',
        subtitle: 'CURATED SOUNDSCAPES FOR YOUR TASTE',
        type: 'genre_playlists',
        items
      };
    });
  }

  /**
   * 8. Recently Played
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
    return this.getCachedOrFetch(key, async () => {
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
