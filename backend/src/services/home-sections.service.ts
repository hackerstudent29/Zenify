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
   */
  private static async getUserTaste(userId?: string) {
    if (!userId) {
      return {
        languages: ['ta', 'en'],
        genres: ['Pop', 'Soundtrack'],
        topArtistName: 'Anirudh Ravichander'
      };
    }

    const [profile, preferences, topLike] = await Promise.all([
      prisma.userInterestProfile.findUnique({ where: { userId } }),
      prisma.userPreferences.findUnique({ where: { userId } }),
      prisma.like.findFirst({
        where: { userId },
        include: { track: { select: { artist: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    let languages: string[] = [];
    let genres: string[] = [];
    let topArtistName = topLike?.track?.artist?.name || null;

    if (profile?.languageWeights && Object.keys(profile.languageWeights as any).length > 0) {
      languages = Object.keys(profile.languageWeights as any);
    } else if (preferences?.languages && preferences.languages.length > 0) {
      languages = preferences.languages;
    } else {
      languages = ['ta', 'en'];
    }

    if (profile?.genreWeights && Object.keys(profile.genreWeights as any).length > 0) {
      genres = Object.keys(profile.genreWeights as any);
    } else if (preferences?.preferredGenres && preferences.preferredGenres.length > 0) {
      genres = preferences.preferredGenres;
    } else {
      genres = ['Pop', 'Soundtrack'];
    }

    if (!topArtistName && preferences?.favoriteArtists && Array.isArray(preferences.favoriteArtists)) {
      const first = (preferences.favoriteArtists as any[])[0];
      if (first?.name) topArtistName = first.name;
    }

    if (!topArtistName) topArtistName = 'Anirudh Ravichander';

    return { languages, genres, topArtistName };
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
   * 5. Because You Like [Artist]
   */
  static async getBecauseYouLike(userId?: string) {
    const { topArtistName } = await this.getUserTaste(userId);
    const key = `home:because_like:${encodeURIComponent(topArtistName || 'artist')}`;

    return this.getCachedOrFetch(key, async () => {
      // Find artist in DB or related tracks
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

      // If less than 10 tracks, supplement with tracks sharing the same genre
      if (items.length < 10 && items[0]?.genre) {
        const extra = await prisma.track.findMany({
          where: {
            deletedAt: null,
            audioUrl: { not: '' },
            genre: items[0].genre,
            id: { notIn: items.map(i => i.id) }
          },
          take: 10 - items.length,
          orderBy: { streams: 'desc' },
          include: { artist: true, album: true }
        });
        items = [...items, ...extra.map(formatTrackItem)];
      }

      return {
        title: `Because You Like ${topArtistName || 'Your Favorite Artist'}`,
        subtitle: `MORE VIBES FROM ${topArtistName?.toUpperCase() || 'TOP CREATORS'}`,
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
