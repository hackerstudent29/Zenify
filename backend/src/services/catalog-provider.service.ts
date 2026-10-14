import axios from 'axios';
import { getCacheVal, setCacheVal } from '../utils/cache';
import jwt from 'jsonwebtoken';
import { splitArtistString } from '../utils/artist';

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG NORMALIZED TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogArtistRef {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface CatalogAlbumRef {
  id: string;
  title: string;
  coverUrl?: string;
}

export interface CatalogTrack {
  id: string; // Unique catalog ID e.g. "itunes-12345" | "apple-12345" | "rapid-12345"
  source: 'apple' | 'itunes' | 'rapidapi' | 'spotify';
  sourceId: string;
  isrc?: string;
  title: string;
  artists: CatalogArtistRef[];
  artist?: CatalogArtistRef;
  album?: CatalogAlbumRef;
  duration: number;
  artwork: string;
  coverUrl: string;
  audioUrl?: string;
  language?: string;
  genre?: string;
  storefront: string;
  fetchedAt: number;
  isVirtual: true;
  inLibrary?: boolean;
}

export interface CatalogAlbum {
  id: string;
  source: 'apple' | 'itunes' | 'rapidapi' | 'spotify';
  sourceId: string;
  title: string;
  artist: CatalogArtistRef;
  coverUrl: string;
  genre?: string;
  trackCount?: number;
  releaseDate?: string;
}

export interface CatalogArtist {
  id: string;
  source: 'apple' | 'itunes' | 'rapidapi' | 'spotify';
  sourceId: string;
  name: string;
  imageUrl?: string;
  genres?: string[];
}

export interface CatalogSearchResult {
  tracks: CatalogTrack[];
  artists: CatalogArtist[];
  albums: CatalogAlbum[];
  playlists?: any[];
}

export interface CatalogProvider {
  name: string;
  isAvailable(): boolean;
  search(query: string, storefront: string, limit?: number): Promise<CatalogSearchResult>;
  getSearchHints(query: string, storefront: string): Promise<string[]>;
  getCharts(storefront: string, limit?: number): Promise<CatalogTrack[]>;
  getNewReleases(storefront: string, languages?: string[], limit?: number): Promise<CatalogTrack[]>;
  getArtistTopSongs(artistName: string, storefront: string, limit?: number): Promise<CatalogTrack[]>;
  getArtistAlbums?(artistName: string, storefront: string, limit?: number): Promise<CatalogAlbum[]>;
  getTrending(storefront: string, languages?: string[], limit?: number): Promise<CatalogTrack[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING & TOKEN BUCKET PER PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRatePerSecond: number;

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRatePerSecond = refillRatePerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRatePerSecond);
    this.lastRefill = now;

    if (this.tokens < 1) {
      const waitTimeMs = Math.ceil(((1 - this.tokens) / this.refillRatePerSecond) * 1000);
      await new Promise(res => setTimeout(res, Math.min(waitTimeMs, 2000)));
      this.tokens = 0;
    } else {
      this.tokens -= 1;
    }
  }
}

class CircuitBreaker {
  private failureCount = 0;
  private disabledUntil = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 60000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  isOpen(): boolean {
    if (Date.now() < this.disabledUntil) return true;
    if (this.disabledUntil > 0 && Date.now() >= this.disabledUntil) {
      this.failureCount = 0;
      this.disabledUntil = 0;
    }
    return false;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.disabledUntil = 0;
  }

  recordFailure(isRateLimit = false): void {
    this.failureCount += 1;
    if (this.failureCount >= this.threshold || isRateLimit) {
      this.disabledUntil = Date.now() + (isRateLimit ? this.cooldownMs * 2 : this.cooldownMs);
      console.warn(`[CircuitBreaker] Provider tripped circuit. Cooldown until ${new Date(this.disabledUntil).toISOString()}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. APPLE MUSIC DEVELOPER API PROVIDER (Primary)
// ─────────────────────────────────────────────────────────────────────────────

export class AppleMusicProvider implements CatalogProvider {
  name = 'apple';
  private teamId = process.env.APPLE_MUSIC_TEAM_ID;
  private keyId = process.env.APPLE_MUSIC_KEY_ID;
  private privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private bucket = new TokenBucket(15, 5);
  private circuit = new CircuitBreaker(4, 60000);

  isAvailable(): boolean {
    return Boolean(this.teamId && this.keyId && this.privateKey && !this.circuit.isOpen());
  }

  private getDeveloperToken(): string {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 3600000) {
      return this.cachedToken;
    }

    if (!this.teamId || !this.keyId || !this.privateKey) {
      throw new Error('Apple Music developer credentials incomplete');
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 86400 * 180; // 180 days max token validity

    const formattedKey = this.privateKey.includes('-----BEGIN PRIVATE KEY-----')
      ? this.privateKey
      : `-----BEGIN PRIVATE KEY-----\n${this.privateKey}\n-----END PRIVATE KEY-----`;

    const token = jwt.sign({}, formattedKey, {
      algorithm: 'ES256',
      keyid: this.keyId,
      issuer: this.teamId,
      expiresIn: '180d'
    });

    this.cachedToken = token;
    this.tokenExpiresAt = expiresAt * 1000;
    return token;
  }

  private async request(url: string, params: Record<string, any> = {}) {
    if (this.circuit.isOpen()) throw new Error('Apple Music circuit breaker open');
    await this.bucket.acquire();

    try {
      const token = this.getDeveloperToken();
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        timeout: 5000
      });
      this.circuit.recordSuccess();
      return res.data;
    } catch (err: any) {
      const is429 = err.response?.status === 429;
      this.circuit.recordFailure(is429);
      throw err;
    }
  }

  async search(query: string, storefront: string, limit = 15): Promise<CatalogSearchResult> {
    const data = await this.request(`https://api.music.apple.com/v1/catalog/${storefront}/search`, {
      term: query,
      types: 'songs,artists,albums',
      limit
    });

    const songs = (data?.results?.songs?.data || []).map((s: any) => this.normalizeSong(s, storefront));
    const artists = (data?.results?.artists?.data || []).map((a: any) => this.normalizeArtist(a));
    const albums = (data?.results?.albums?.data || []).map((al: any) => this.normalizeAlbum(al));

    return { tracks: songs, artists, albums };
  }

  async getSearchHints(query: string, storefront: string): Promise<string[]> {
    const data = await this.request(`https://api.music.apple.com/v1/catalog/${storefront}/search/hints`, {
      term: query,
      limit: 7
    });
    return data?.results?.terms || [];
  }

  async getCharts(storefront: string, limit = 20): Promise<CatalogTrack[]> {
    const data = await this.request(`https://api.music.apple.com/v1/catalog/${storefront}/charts`, {
      types: 'songs',
      limit
    });
    const songs = data?.results?.songs?.[0]?.data || [];
    return songs.map((s: any) => this.normalizeSong(s, storefront));
  }

  async getNewReleases(storefront: string, languages?: string[], limit = 20): Promise<CatalogTrack[]> {
    const data = await this.request(`https://api.music.apple.com/v1/catalog/${storefront}/charts`, {
      types: 'albums,songs',
      limit
    });
    const songs = data?.results?.songs?.[0]?.data || [];
    return songs.map((s: any) => this.normalizeSong(s, storefront));
  }

  async getArtistTopSongs(artistName: string, storefront: string, limit = 15): Promise<CatalogTrack[]> {
    const searchRes = await this.search(artistName, storefront, 5);
    const artist = searchRes.artists[0];
    if (!artist) return searchRes.tracks;

    try {
      const data = await this.request(`https://api.music.apple.com/v1/catalog/${storefront}/artists/${artist.sourceId}/view/top-songs`, { limit });
      const songs = data?.data || [];
      return songs.map((s: any) => this.normalizeSong(s, storefront));
    } catch {
      return searchRes.tracks;
    }
  }

  async getTrending(storefront: string, languages?: string[], limit = 20): Promise<CatalogTrack[]> {
    return this.getCharts(storefront, limit);
  }

  private normalizeSong(s: any, storefront: string): CatalogTrack {
    const attr = s.attributes || {};
    const artworkUrl = attr.artwork?.url ? attr.artwork.url.replace('{w}x{h}', '600x600') : '';
    const artistName = attr.artistName || 'Unknown Artist';
    const previewUrl = attr.previews?.[0]?.url;

    const artistObj: CatalogArtistRef = {
      id: `apple-artist-${s.relationships?.artists?.data?.[0]?.id || encodeURIComponent(artistName)}`,
      name: artistName,
      imageUrl: artworkUrl
    };

    return {
      id: `apple-${s.id}`,
      source: 'apple',
      sourceId: s.id,
      isrc: attr.isrc,
      title: attr.name || 'Untitled Track',
      artists: [artistObj],
      artist: artistObj,
      album: attr.albumName ? {
        id: `apple-album-${s.relationships?.albums?.data?.[0]?.id || '0'}`,
        title: attr.albumName,
        coverUrl: artworkUrl
      } : undefined,
      duration: Math.round((attr.durationInMillis || 180000) / 1000),
      artwork: artworkUrl,
      coverUrl: artworkUrl,
      audioUrl: `/api/utils/stream-youtube?url=${encodeURIComponent(`${artistName} - ${attr.name || 'Song'}`)}`,
      genre: attr.genreNames?.[0] || 'Pop',
      storefront,
      fetchedAt: Date.now(),
      isVirtual: true
    };
  }

  private normalizeArtist(a: any): CatalogArtist {
    const attr = a.attributes || {};
    const img = attr.artwork?.url ? attr.artwork.url.replace('{w}x{h}', '400x400') : undefined;
    return {
      id: `apple-artist-${a.id}`,
      source: 'apple',
      sourceId: a.id,
      name: attr.name,
      imageUrl: img,
      genres: attr.genreNames || []
    };
  }

  private normalizeAlbum(al: any): CatalogAlbum {
    const attr = al.attributes || {};
    const img = attr.artwork?.url ? attr.artwork.url.replace('{w}x{h}', '500x500') : '';
    return {
      id: `apple-album-${al.id}`,
      source: 'apple',
      sourceId: al.id,
      title: attr.name,
      artist: {
        id: `apple-artist-${al.relationships?.artists?.data?.[0]?.id || '0'}`,
        name: attr.artistName || 'Unknown'
      },
      coverUrl: img,
      genre: attr.genreNames?.[0],
      trackCount: attr.trackCount,
      releaseDate: attr.releaseDate
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ITUNES SEARCH & RSS PROVIDER (Robust Universal Fallback & Primary)
// ─────────────────────────────────────────────────────────────────────────────

export class ITunesCatalogProvider implements CatalogProvider {
  name = 'itunes';
  private bucket = new TokenBucket(20, 10);
  private circuit = new CircuitBreaker(4, 30000);

  isAvailable(): boolean {
    return !this.circuit.isOpen();
  }

  async search(query: string, storefront: string, limit = 15): Promise<CatalogSearchResult> {
    await this.bucket.acquire();
    try {
      const res = await axios.get('https://itunes.apple.com/search', {
        params: {
          term: query,
          country: storefront || 'in',
          media: 'music',
          limit: Math.min(limit * 2, 50)
        },
        timeout: 4500
      });
      this.circuit.recordSuccess();

      const results = res.data?.results || [];
      const tracks: CatalogTrack[] = [];
      const artistsMap = new Map<string, CatalogArtist>();
      const albumsMap = new Map<string, CatalogAlbum>();

      for (const r of results) {
        if (r.wrapperType === 'track' && r.kind === 'song' && r.trackName) {
          const t = this.normalizeTrack(r, storefront);
          tracks.push(t);

          if (r.artistName) {
            const splitNames = splitArtistString(r.artistName);
            for (const name of splitNames) {
              const normKey = name.toLowerCase().trim();
              if (!artistsMap.has(normKey)) {
                artistsMap.set(normKey, {
                  id: `itunes-artist-${encodeURIComponent(normKey.replace(/[^a-z0-9]/g, '-'))}`,
                  source: 'itunes',
                  sourceId: String(r.artistId || normKey),
                  name,
                  imageUrl: t.artwork,
                  genres: r.primaryGenreName ? [r.primaryGenreName] : []
                });
              }
            }
          }

          if (r.collectionName && !albumsMap.has(r.collectionName.toLowerCase())) {
            albumsMap.set(r.collectionName.toLowerCase(), {
              id: `itunes-album-${r.collectionId || r.trackId}`,
              source: 'itunes',
              sourceId: String(r.collectionId || r.trackId),
              title: r.collectionName,
              artist: { id: `itunes-artist-${r.artistId}`, name: r.artistName },
              coverUrl: t.artwork,
              genre: r.primaryGenreName
            });
          }
        }
      }

      return {
        tracks: tracks.slice(0, limit),
        artists: Array.from(artistsMap.values()).slice(0, 8),
        albums: Array.from(albumsMap.values()).slice(0, 8)
      };
    } catch (err: any) {
      this.circuit.recordFailure(err.response?.status === 429);
      throw err;
    }
  }

  async getSearchHints(query: string, storefront: string): Promise<string[]> {
    try {
      const res = await axios.get('https://itunes.apple.com/search', {
        params: {
          term: query,
          country: storefront || 'in',
          media: 'music',
          entity: 'song',
          limit: 7
        },
        timeout: 3000
      });
      const items = res.data?.results || [];
      const hints = new Set<string>();
      for (const item of items) {
        if (item.trackName) hints.add(item.trackName);
        if (item.artistName) hints.add(item.artistName);
      }
      return Array.from(hints).slice(0, 6);
    } catch {
      return [];
    }
  }

  async getCharts(storefront: string, limit = 25): Promise<CatalogTrack[]> {
    await this.bucket.acquire();
    try {
      const res = await axios.get(`https://itunes.apple.com/${storefront || 'in'}/rss/topsongs/limit=${limit}/json`, {
        timeout: 4500
      });
      this.circuit.recordSuccess();

      const entries = res.data?.feed?.entry || [];
      const tracks: CatalogTrack[] = [];

      for (const e of entries) {
        const title = e['im:name']?.label;
        const artist = e['im:artist']?.label || 'Various Artists';
        const audioUrl = e.link?.find((l: any) => l.attributes?.type?.includes('audio'))?.attributes?.href || e.link?.[1]?.attributes?.href || '';
        let coverUrl = e['im:image']?.[2]?.label || e['im:image']?.[0]?.label || '';
        if (coverUrl) {
          coverUrl = coverUrl.replace(/\/\d+x\d+bb\./, '/600x600bb.');
        }
        const sourceId = e.id?.attributes?.['im:id'] || Math.random().toString(36).slice(2);

        if (title) {
          const artistObj: CatalogArtistRef = {
            id: `itunes-artist-${encodeURIComponent(artist.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
            name: artist,
            imageUrl: coverUrl
          };

          tracks.push({
            id: `itunes-${sourceId}`,
            source: 'itunes',
            sourceId,
            title,
            artists: [artistObj],
            artist: artistObj,
            album: {
              id: `itunes-album-${sourceId}`,
              title: e['im:collection']?.['im:name']?.label || `${title} - Single`,
              coverUrl
            },
            duration: 180,
            artwork: coverUrl,
            coverUrl,
            audioUrl,
            genre: e.category?.attributes?.label || 'Top Hits',
            storefront,
            fetchedAt: Date.now(),
            isVirtual: true
          });
        }
      }

      // If RSS returns 0 tracks (e.g. mainland China / CN storefront restrictions), fall back to seed artist charts
      if (tracks.length === 0) {
        const seedArtists = storefront === 'cn'
          ? ['Jay Chou', 'JJ Lin', 'Eason Chan', 'G.E.M.', 'Jolin Tsai', 'Mayday']
          : storefront === 'tw'
          ? ['Jay Chou', 'Jolin Tsai', 'Mayday', 'Eric Chou']
          : storefront === 'hk'
          ? ['Eason Chan', 'Leslie Cheung', 'Jacky Cheung', 'Beyond']
          : storefront === 'jp'
          ? ['YOASOBI', 'Kenshi Yonezu', 'Ado', 'Fujii Kaze']
          : storefront === 'kr'
          ? ['BTS', 'BLACKPINK', 'NewJeans', 'IU']
          : [`top ${storefront} hits`, `trending ${storefront}`];

        for (const artist of seedArtists) {
          try {
            const artistTracks = await this.getArtistTopSongs(artist, storefront, 4);
            tracks.push(...artistTracks);
            if (tracks.length >= limit) break;
          } catch {}
        }
      }

      return tracks;
    } catch (err: any) {
      this.circuit.recordFailure(err.response?.status === 429);
      throw err;
    }
  }

  async getNewReleases(storefront: string, languages?: string[], limit = 20): Promise<CatalogTrack[]> {
    return this.getCharts(storefront, limit);
  }

  async getArtistTopSongs(artistName: string, storefront: string, limit = 15): Promise<CatalogTrack[]> {
    await this.bucket.acquire();
    try {
      const res = await axios.get('https://itunes.apple.com/search', {
        params: {
          term: artistName,
          country: storefront || 'in',
          media: 'music',
          entity: 'song',
          limit: Math.min(limit * 2, 30)
        },
        timeout: 4000
      });
      this.circuit.recordSuccess();

      const results = (res.data?.results || [])
        .filter((r: any) => r.trackName)
        .map((r: any) => this.normalizeTrack(r, storefront));

      return results.slice(0, limit);
    } catch (err: any) {
      this.circuit.recordFailure(err.response?.status === 429);
      throw err;
    }
  }

  async getTrending(storefront: string, languages?: string[], limit = 20): Promise<CatalogTrack[]> {
    return this.getCharts(storefront, limit);
  }

  private normalizeTrack(r: any, storefront: string): CatalogTrack {
    let coverUrl = r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '600x600bb') : '';
    const rawArtistName = r.artistName || 'Unknown Artist';
    const splitNames = splitArtistString(rawArtistName);
    const primaryName = splitNames[0] || rawArtistName;
    const artists: CatalogArtistRef[] = splitNames.map(name => ({
      id: `itunes-artist-${encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
      name,
      imageUrl: coverUrl
    }));
    const artistObj: CatalogArtistRef = artists[0] || {
      id: `itunes-artist-${r.artistId || encodeURIComponent(primaryName.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
      name: primaryName,
      imageUrl: coverUrl
    };

    return {
      id: `itunes-${r.trackId}`,
      source: 'itunes',
      sourceId: String(r.trackId),
      isrc: r.isrc,
      title: r.trackName,
      artists,
      artist: artistObj,
      album: r.collectionName ? {
        id: `itunes-album-${r.collectionId || r.trackId}`,
        title: r.collectionName,
        coverUrl
      } : undefined,
      duration: Math.round((r.trackTimeMillis || 180000) / 1000),
      artwork: coverUrl,
      coverUrl,
      audioUrl: `/api/utils/stream-youtube?url=${encodeURIComponent(`${artistObj.name} - ${r.trackName}`)}`,
      genre: r.primaryGenreName || 'Pop',
      storefront,
      fetchedAt: Date.now(),
      isVirtual: true
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RAPIDAPI PROVIDER (YouTube Music & Spotify Supplement)
// ─────────────────────────────────────────────────────────────────────────────

export class RapidApiCatalogProvider implements CatalogProvider {
  name = 'rapidapi';
  private rapidApiKey = process.env.RAPIDAPI_KEY || '54aa86f9b2msh2700548ef9684acp19b05ajsn76cf3c333188';
  private bucket = new TokenBucket(10, 3);
  private circuit = new CircuitBreaker(4, 45000);

  isAvailable(): boolean {
    return Boolean(this.rapidApiKey && !this.circuit.isOpen());
  }

  async search(query: string, storefront: string, limit = 10): Promise<CatalogSearchResult> {
    await this.bucket.acquire();
    try {
      // Query Spotify/YouTube Music through RapidAPI
      const res = await axios.get('https://spotify23.p.rapidapi.com/search/', {
        params: { q: query, type: 'tracks,artists', limit: Math.min(limit, 10) },
        headers: {
          'x-rapidapi-key': this.rapidApiKey,
          'x-rapidapi-host': 'spotify23.p.rapidapi.com'
        },
        timeout: 4500
      });
      this.circuit.recordSuccess();

      const rawTracks = res.data?.tracks?.items || [];
      const tracks: CatalogTrack[] = rawTracks.map((item: any) => {
        const t = item.data || item;
        const artistName = t.artists?.items?.[0]?.profile?.name || t.artists?.[0]?.name || 'Unknown Artist';
        const cover = t.albumOfTrack?.coverArt?.sources?.[0]?.url || t.album?.images?.[0]?.url || '';
        const artistObj: CatalogArtistRef = {
          id: `rapid-artist-${encodeURIComponent(artistName)}`,
          name: artistName,
          imageUrl: cover
        };

        return {
          id: `rapid-${t.id}`,
          source: 'rapidapi',
          sourceId: t.id,
          title: t.name || 'Untitled',
          artists: [artistObj],
          artist: artistObj,
          album: t.albumOfTrack?.name ? {
            id: `rapid-album-${t.id}`,
            title: t.albumOfTrack.name,
            coverUrl: cover
          } : undefined,
          duration: Math.round((t.duration?.totalMilliseconds || 180000) / 1000),
          artwork: cover,
          coverUrl: cover,
          storefront,
          fetchedAt: Date.now(),
          isVirtual: true
        };
      });

      return { tracks, artists: [], albums: [] };
    } catch (err: any) {
      this.circuit.recordFailure(err.response?.status === 429);
      return { tracks: [], artists: [], albums: [] };
    }
  }

  async getSearchHints(query: string, storefront: string): Promise<string[]> {
    return [];
  }

  async getCharts(storefront: string, limit = 15): Promise<CatalogTrack[]> {
    return [];
  }

  async getNewReleases(storefront: string, languages?: string[], limit = 15): Promise<CatalogTrack[]> {
    return [];
  }

  async getArtistTopSongs(artistName: string, storefront: string, limit = 10): Promise<CatalogTrack[]> {
    const searchRes = await this.search(artistName, storefront, limit);
    return searchRes.tracks;
  }

  async getTrending(storefront: string, languages?: string[], limit = 15): Promise<CatalogTrack[]> {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. COMPOSITE CATALOG SERVICE (Auto Failover & Central Orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

export class CompositeCatalogService {
  private static appleProvider = new AppleMusicProvider();
  private static itunesProvider = new ITunesCatalogProvider();
  private static rapidProvider = new RapidApiCatalogProvider();

  private static getActiveProviders(): CatalogProvider[] {
    const list: CatalogProvider[] = [];
    if (this.appleProvider.isAvailable()) list.push(this.appleProvider);
    list.push(this.itunesProvider);
    if (this.rapidProvider.isAvailable()) list.push(this.rapidProvider);
    return list;
  }

  /**
   * Search external catalog with automatic failover and universal multi-engine coverage
   */
  static async search(query: string, storefront = 'in', limit = 15): Promise<CatalogSearchResult> {
    const clean = query.toLowerCase().trim();
    const cacheKey = `catalog:search:${storefront}:${clean}:${limit}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached as CatalogSearchResult;

    // Primary: Universal Multi-Engine Search (Local DB + JioSaavn + iTunes IN/US + YouTube Music)
    try {
      const { UniversalSearchService } = await import('./universal-search.service.js');
      const universalResult = await UniversalSearchService.searchCatalog(query, storefront, limit);
      if (universalResult.tracks.length > 0 || universalResult.artists.length > 0) {
        await setCacheVal(cacheKey, universalResult, 300); // 5 min TTL
        return universalResult;
      }
    } catch (err: any) {
      console.warn('[Catalog] UniversalSearchService primary search failed, trying fallback providers:', err.message);
    }

    for (const provider of this.getActiveProviders()) {
      try {
        const result = await provider.search(query, storefront, limit);
        if (result.tracks.length > 0 || result.artists.length > 0) {
          await setCacheVal(cacheKey, result, 300); // 5 min TTL
          return result;
        }
      } catch (err: any) {
        console.warn(`[Catalog] Provider ${provider.name} search failed:`, err.message);
      }
    }

    return { tracks: [], artists: [], albums: [] };
  }

  /**
   * Get search hints with fast debounce & failover
   */
  static async getSearchHints(query: string, storefront = 'in'): Promise<string[]> {
    const cacheKey = `catalog:hints:${storefront}:${query.toLowerCase().trim()}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached as string[];

    for (const provider of this.getActiveProviders()) {
      try {
        const hints = await provider.getSearchHints(query, storefront);
        if (hints.length > 0) {
          await setCacheVal(cacheKey, hints, 600);
          return hints;
        }
      } catch {}
    }
    return [];
  }

  /**
   * Shared Top Songs Charts per storefront (15 min TTL)
   */
  static async getCharts(storefront = 'in', limit = 25): Promise<CatalogTrack[]> {
    const cacheKey = `catalog:charts:${storefront}:${limit}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached as CatalogTrack[];

    for (const provider of this.getActiveProviders()) {
      try {
        const charts = await provider.getCharts(storefront, limit);
        if (charts.length > 0) {
          await setCacheVal(cacheKey, charts, 900); // 15 min TTL
          return charts;
        }
      } catch (err: any) {
        console.warn(`[Catalog] Provider ${provider.name} charts failed:`, err.message);
      }
    }
    return [];
  }

  /**
   * Shared Top Songs per artist (6 hour TTL)
   */
  static async getArtistTopSongs(artistName: string, storefront = 'in', limit = 15): Promise<CatalogTrack[]> {
    const clean = artistName.toLowerCase().trim();
    const cacheKey = `catalog:artist_top:${storefront}:${clean}:${limit}`;
    const cached = await getCacheVal(cacheKey);
    if (cached) return cached as CatalogTrack[];

    for (const provider of this.getActiveProviders()) {
      try {
        const tracks = await provider.getArtistTopSongs(artistName, storefront, limit);
        if (tracks.length > 0) {
          await setCacheVal(cacheKey, tracks, 21600); // 6 hours TTL
          return tracks;
        }
      } catch (err: any) {
        console.warn(`[Catalog] Provider ${provider.name} artist top songs failed for "${artistName}":`, err.message);
      }
    }
    return [];
  }
}
