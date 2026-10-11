import { prisma } from '../utils/prisma';
import { getCacheVal, setCacheVal } from '../utils/cache';

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
   * 1. Made For You
   * 75% user top languages, 25% discovery
   */
  static async getMadeForYou(userId?: string) {
    const key = `home:made_for_you:${userId || 'anon'}`;
    return this.getCachedOrFetch(key, async () => {
      const { languages, genres } = await this.getUserTaste(userId);

      // Top 75% songs in user's languages
      const targetLangs = languages.slice(0, 3);
      const [primaryTracks, discoveryTracks] = await Promise.all([
        prisma.track.findMany({
          where: {
            deletedAt: null,
            audioUrl: { not: '' },
            language: { in: targetLangs, mode: 'insensitive' }
          },
          orderBy: { streams: 'desc' },
          take: 15,
          include: { artist: true, album: true }
        }),
        prisma.track.findMany({
          where: {
            deletedAt: null,
            audioUrl: { not: '' },
            language: { notIn: targetLangs, mode: 'insensitive' }
          },
          orderBy: { streams: 'desc' },
          take: 5,
          include: { artist: true, album: true }
        })
      ]);

      const merged = [...primaryTracks.map(formatTrackItem), ...discoveryTracks.map(formatTrackItem)];
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
      const { languages } = await this.getUserTaste(userId);
      const tracks = await prisma.track.findMany({
        where: {
          deletedAt: null,
          audioUrl: { not: '' },
          language: { in: languages, mode: 'insensitive' }
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { artist: true, album: true }
      });

      return {
        title: 'New Releases in Your Languages',
        subtitle: 'FRESH DROPS IN YOUR FAVORITE FREQUENCIES',
        type: 'new_releases_lang',
        items: tracks.map(formatTrackItem)
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
      // Find artist in DB and retrieve their genuine tracks
      const artist = await prisma.artist.findFirst({
        where: { name: { equals: topArtistName, mode: 'insensitive' } },
        include: {
          tracks: {
            where: { deletedAt: null, audioUrl: { not: '' } },
            orderBy: { streams: 'desc' },
            take: 15,
            include: { artist: true, album: true }
          }
        }
      });

      let items = (artist?.tracks || []).map(formatTrackItem);

      // Prioritize user's preferred languages
      if (languages.length > 0) {
        items.sort((a, b) => {
          const aMatch = languages.includes(a.language?.toLowerCase() || '') ? 1 : 0;
          const bMatch = languages.includes(b.language?.toLowerCase() || '') ? 1 : 0;
          return bMatch - aMatch;
        });
      }

      if (items.length === 0) {
        return {
          title: '',
          subtitle: '',
          type: 'because_you_like',
          items: []
        };
      }

      return {
        title: `Because you like ${topArtistName}`,
        subtitle: `SONGS & RELEASES BY ${topArtistName.toUpperCase()}`,
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
      const { languages } = await this.getUserTaste(userId);

      const artists = await prisma.artist.findMany({
        where: {
          tracks: {
            some: {
              language: { in: languages, mode: 'insensitive' }
            }
          }
        },
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

      const items = artists.map(a => ({
        id: a.id,
        name: a.name,
        imageUrl: a.imageUrl || a.coverUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=18181b&color=e11d48&size=300`,
        isArtist: true,
        type: 'artist'
      }));

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

      const items = playlists.map(p => ({
        id: p.id,
        name: p.name,
        title: p.name,
        description: p.description,
        coverUrl: p.coverUrl,
        isPlaylist: true,
        type: 'playlist'
      }));

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
