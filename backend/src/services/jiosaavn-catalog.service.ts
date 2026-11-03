import axios from 'axios';
import {
  ICatalogProvider,
  NormalizedTrack,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedArtistRef,
  ArtistRole
} from './catalog-provider.interface.js';
import { ProviderCacheService } from './provider-cache.service.js';
import { CleanCdnAudioService } from './clean-cdn-audio.service.js';

export class JioSaavnCatalogService implements ICatalogProvider {
  name = 'jiosaavn';
  private baseUrl = 'https://www.jiosaavn.com/api.php';
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  isAvailable(): boolean {
    return true;
  }

  private cleanString(str?: string | null): string {
    if (!str) return '';
    return str
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  private cleanImage(url?: string | null): string {
    if (!url) return '';
    if (url.includes('share-image') || url.includes('default-artist') || url.includes('default_artist') || url.includes('_i/')) {
      return '';
    }
    return url.replace('150x150', '500x500').replace('50x50', '500x500');
  }

  private parseBio(rawBio: any): string {
    if (!rawBio) return '';
    try {
      const parsed = typeof rawBio === 'string' ? JSON.parse(rawBio) : rawBio;
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => p.text || p).join(' ').trim();
      }
      if (typeof parsed === 'string') return parsed.trim();
    } catch {
      if (typeof rawBio === 'string') return rawBio.trim();
    }
    return '';
  }

  /**
   * Normalizes a raw JioSaavn track object into the canonical NormalizedTrack structure.
   */
  normalizeTrack(raw: any): NormalizedTrack | null {
    if (!raw || (!raw.id && !raw.song && !raw.title)) return null;

    const id = String(raw.id || '').trim();
    const title = this.cleanString(raw.title || raw.song);
    if (!id || !title) return null;

    const moreInfo = raw.more_info || {};
    const albumId = moreInfo.album_id || raw.albumid || raw.album_id ? String(moreInfo.album_id || raw.albumid || raw.album_id).trim() : undefined;
    const albumTitle = this.cleanString(moreInfo.album || raw.album || 'Single');
    const coverUrl = this.cleanImage(raw.image || moreInfo.image);
    const duration = parseInt(moreInfo.duration || raw.duration || '180', 10) || 180;
    const year = parseInt(raw.year || moreInfo.release_date?.slice(0, 4) || '0', 10) || undefined;
    const playCount = parseInt(raw.play_count || moreInfo.play_count || '0', 10) || 0;
    const hasLyrics = moreInfo.has_lyrics === 'true' || Boolean(moreInfo.lyrics_id);

    // Audio stream URL resolution (Pristine 320kbps CDN)
    const encMedia = moreInfo.encrypted_media_url || raw.encrypted_media_url;
    let audioUrl: string | undefined;
    if (encMedia) {
      audioUrl = CleanCdnAudioService.decryptSaavnMediaUrl(encMedia, '320') ||
                 CleanCdnAudioService.decryptSaavnMediaUrl(encMedia, '160') ||
                 undefined;
    }

    // Artist mapping with canonical provider IDs and roles
    const artists: NormalizedArtistRef[] = [];
    const artistMap = moreInfo.artistMap || {};
    const rawAllArtists = Array.isArray(artistMap.artists) ? artistMap.artists : [];
    const rawPrimaryArtists = Array.isArray(artistMap.primary_artists) ? artistMap.primary_artists : [];

    const seenArtists = new Set<string>();

    // Process primary artists first
    for (const pa of rawPrimaryArtists) {
      if (!pa.id) continue;
      const aId = String(pa.id).trim();
      const aName = this.cleanString(pa.name);
      if (!aName) continue;

      if (!seenArtists.has(`${aId}:primary`)) {
        seenArtists.add(`${aId}:primary`);
        artists.push({
          id: aId,
          name: aName,
          role: 'primary',
          imageUrl: this.cleanImage(pa.image)
        });
      }
    }

    // Process all related artists (music composers, singers, lyricists)
    for (const a of rawAllArtists) {
      if (!a.id) continue;
      const aId = String(a.id).trim();
      const aName = this.cleanString(a.name);
      if (!aName) continue;

      let role: ArtistRole = 'primary';
      const rawRole = (a.role || '').toLowerCase();
      if (rawRole.includes('music') || rawRole.includes('composer')) role = 'music';
      else if (rawRole.includes('singer')) role = 'singer';
      else if (rawRole.includes('lyric')) role = 'lyricist';
      else if (rawRole.includes('starring')) role = 'starring';
      else if (rawRole.includes('featured')) role = 'featured';

      const key = `${aId}:${role}`;
      if (!seenArtists.has(key)) {
        seenArtists.add(key);
        artists.push({
          id: aId,
          name: aName,
          role,
          imageUrl: this.cleanImage(a.image)
        });
      }
    }

    // Fallback if artistMap was missing or empty: parse primary_artists string
    if (artists.length === 0) {
      const rawString = this.cleanString(raw.primary_artists || moreInfo.singers || 'Unknown Artist');
      const names = rawString.split(/,\s*/).filter(Boolean);
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        artists.push({
          id: `unknown-${encodeURIComponent(name.toLowerCase())}`,
          name,
          role: i === 0 ? 'primary' : 'featured'
        });
      }
    }

    const primaryArtist = artists.find(a => a.role === 'primary') || artists[0] || {
      id: 'unknown-artist',
      name: 'Unknown Artist',
      role: 'primary'
    };

    return {
      id,
      provider: 'jiosaavn',
      title,
      duration,
      albumId,
      albumTitle,
      coverUrl,
      audioUrl: audioUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(`${primaryArtist.name} - ${title}`)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(primaryArtist.name)}&trackId=saavn-${id}`,
      artists,
      primaryArtist,
      language: raw.language ? this.cleanString(raw.language).toLowerCase() : undefined,
      year,
      playCount,
      hasLyrics,
      genre: moreInfo.label ? `${this.cleanString(moreInfo.label)}` : undefined
    };
  }

  /**
   * Fetches full track metadata by canonical provider track ID.
   */
  async getTrack(providerTrackId: string): Promise<NormalizedTrack | null> {
    const cleanId = String(providerTrackId).replace(/^saavn-/, '').trim();
    if (!cleanId) return null;

    const cacheKey = `jiosaavn:track:${cleanId}`;
    const cached = await ProviderCacheService.get<NormalizedTrack>(cacheKey);
    if (cached) return cached;

    try {
      const res = await axios.get(this.baseUrl, {
        params: {
          __call: 'song.getDetails',
          pids: cleanId,
          _format: 'json',
          _marker: '0',
          api_version: '4',
          ctx: 'web6dot0'
        },
        headers: { 'User-Agent': this.userAgent },
        timeout: 4500
      });

      const songs = res.data?.songs || (Array.isArray(res.data) ? res.data : []);
      const raw = songs[0] || res.data?.[cleanId] || (res.data && typeof res.data === 'object' && Object.values(res.data)[0]);
      if (!raw) return null;

      const track = this.normalizeTrack(raw);
      if (track) {
        await ProviderCacheService.set(cacheKey, track, 604800, 'jiosaavn'); // 7 days TTL
      }
      return track;
    } catch (err: any) {
      console.warn(`[JioSaavnCatalog] getTrack failed for "${cleanId}":`, err.message);
      return null;
    }
  }

  /**
   * Fetches full album metadata and its complete tracklist by canonical provider album ID.
   */
  async getAlbum(providerAlbumId: string): Promise<NormalizedAlbum | null> {
    const cleanId = String(providerAlbumId).replace(/^saavn-album-/, '').replace(/^saavn-/, '').trim();
    if (!cleanId) return null;

    const cacheKey = `jiosaavn:album:${cleanId}`;
    const cached = await ProviderCacheService.get<NormalizedAlbum>(cacheKey);
    if (cached) return cached;

    try {
      const res = await axios.get(this.baseUrl, {
        params: {
          __call: 'content.getAlbumDetails',
          albumid: cleanId,
          _format: 'json',
          _marker: '0',
          api_version: '4',
          ctx: 'web6dot0'
        },
        headers: { 'User-Agent': this.userAgent },
        timeout: 4500
      });

      const data = res.data;
      if (!data || (!data.title && !data.name)) return null;

      const title = this.cleanString(data.title || data.name);
      const coverUrl = this.cleanImage(data.image);
      const year = parseInt(data.year || (data.release_date ? data.release_date.slice(0, 4) : '0'), 10) || undefined;
      const releaseDate = data.release_date ? new Date(data.release_date) : (year ? new Date(`${year}-01-01`) : undefined);
      const language = data.language ? this.cleanString(data.language).toLowerCase() : undefined;

      const rawSongs = data.list || data.songs || [];
      const tracks: NormalizedTrack[] = [];
      const albumArtistsMap = new Map<string, NormalizedArtistRef>();

      for (let i = 0; i < rawSongs.length; i++) {
        const t = this.normalizeTrack(rawSongs[i]);
        if (t) {
          t.trackNumber = i + 1;
          t.albumId = cleanId;
          t.albumTitle = title;
          tracks.push(t);

          for (const a of t.artists) {
            if (a.id && !albumArtistsMap.has(a.id)) {
              albumArtistsMap.set(a.id, a);
            }
          }
        }
      }

      const primaryArtist = tracks[0]?.primaryArtist || {
        id: `unknown-${cleanId}`,
        name: this.cleanString(data.primary_artists || 'Various Artists'),
        role: 'primary'
      };

      const album: NormalizedAlbum = {
        id: cleanId,
        provider: 'jiosaavn',
        title,
        coverUrl,
        releaseDate,
        year,
        language,
        genre: language ? `${language.charAt(0).toUpperCase() + language.slice(1)} Soundtrack` : 'Soundtrack',
        primaryArtist,
        artists: Array.from(albumArtistsMap.values()),
        tracks
      };

      await ProviderCacheService.set(cacheKey, album, 604800, 'jiosaavn'); // 7 days TTL
      return album;
    } catch (err: any) {
      console.warn(`[JioSaavnCatalog] getAlbum failed for "${cleanId}":`, err.message);
      return null;
    }
  }

  /**
   * Fetches full artist details by canonical provider artist ID.
   */
  async getArtist(providerArtistId: string): Promise<NormalizedArtist | null> {
    const cleanId = String(providerArtistId).replace(/^saavn-artist-/, '').replace(/^artist-/, '').trim();
    if (!cleanId) return null;

    const cacheKey = `jiosaavn:artist:${cleanId}`;
    const cached = await ProviderCacheService.get<NormalizedArtist>(cacheKey);
    if (cached) return cached;

    try {
      const res = await axios.get(this.baseUrl, {
        params: {
          __call: 'artist.getArtistPageDetails',
          artistId: cleanId,
          _format: 'json',
          _marker: '0',
          api_version: '4',
          ctx: 'web6dot0',
          n_song: 50,
          n_album: 50
        },
        headers: { 'User-Agent': this.userAgent },
        timeout: 5000
      });

      const data = res.data;
      if (!data || !data.name) return null;

      const name = this.cleanString(data.name);
      const imageUrl = this.cleanImage(data.image);
      const bio = this.parseBio(data.bio);
      const followerCount = parseInt(data.follower_count || '0', 10) || 0;

      // Parse top songs
      const rawTopSongs = data.topSongs || [];
      const topSongs: NormalizedTrack[] = [];
      for (const s of rawTopSongs) {
        const t = this.normalizeTrack(s);
        if (t) topSongs.push(t);
      }

      // Parse albums
      const rawAlbums = data.topAlbums || [];
      const albums: NormalizedAlbum[] = [];
      for (const alb of rawAlbums) {
        if (!alb.id) continue;
        const albTitle = this.cleanString(alb.title || alb.name);
        if (!albTitle) continue;
        const albCover = this.cleanImage(alb.image);
        const albYear = parseInt(alb.year || '0', 10) || undefined;
        albums.push({
          id: String(alb.id),
          provider: 'jiosaavn',
          title: albTitle,
          coverUrl: albCover,
          year: albYear,
          releaseDate: albYear ? new Date(`${albYear}-01-01`) : undefined,
          primaryArtist: { id: cleanId, name, imageUrl },
          artists: [{ id: cleanId, name, imageUrl }],
          tracks: []
        });
      }

      // Parse singles
      const rawSingles = data.singles || [];
      const singles: NormalizedTrack[] = [];
      for (const s of rawSingles) {
        const t = this.normalizeTrack(s);
        if (t) singles.push(t);
      }

      // Parse similar / related artists
      const rawSimilar = data.similarArtists || [];
      const relatedArtists: NormalizedArtistRef[] = [];
      for (const sim of rawSimilar) {
        if (!sim.id || !sim.name) continue;
        const simPic = this.cleanImage(sim.image_url || sim.image);
        if (simPic) {
          relatedArtists.push({
            id: String(sim.id),
            name: this.cleanString(sim.name),
            imageUrl: simPic,
            role: 'primary'
          });
        }
      }

      const artist: NormalizedArtist = {
        id: cleanId,
        provider: 'jiosaavn',
        name,
        imageUrl,
        bio,
        followerCount,
        topSongs,
        albums,
        singles,
        relatedArtists
      };

      await ProviderCacheService.set(cacheKey, artist, 86400, 'jiosaavn'); // 24 hours TTL
      return artist;
    } catch (err: any) {
      console.warn(`[JioSaavnCatalog] getArtist failed for "${cleanId}":`, err.message);
      return null;
    }
  }

  /**
   * Search catalog for tracks, artists, and albums.
   */
  async search(query: string, storefront = 'in', limit = 15): Promise<{
    tracks: NormalizedTrack[];
    artists: NormalizedArtist[];
    albums: NormalizedAlbum[];
  }> {
    const cleanQ = query.trim();
    if (!cleanQ) return { tracks: [], artists: [], albums: [] };

    const cacheKey = `jiosaavn:search:${encodeURIComponent(cleanQ.toLowerCase())}:${limit}`;
    const cached = await ProviderCacheService.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const [songsRes, artistsRes, albumsRes] = await Promise.all([
        axios.get(this.baseUrl, {
          params: { __call: 'search.getResults', q: cleanQ, p: 1, n: limit, _format: 'json', _marker: '0', api_version: '4', ctx: 'web6dot0' },
          headers: { 'User-Agent': this.userAgent },
          timeout: 4000
        }).catch(() => ({ data: { results: [] } })),
        axios.get(this.baseUrl, {
          params: { __call: 'search.getArtistResults', q: cleanQ, p: 1, n: Math.min(limit, 8), _format: 'json', _marker: '0', api_version: '4', ctx: 'web6dot0' },
          headers: { 'User-Agent': this.userAgent },
          timeout: 4000
        }).catch(() => ({ data: { results: [] } })),
        axios.get(this.baseUrl, {
          params: { __call: 'search.getAlbumResults', q: cleanQ, p: 1, n: Math.min(limit, 8), _format: 'json', _marker: '0', api_version: '4', ctx: 'web6dot0' },
          headers: { 'User-Agent': this.userAgent },
          timeout: 4000
        }).catch(() => ({ data: { results: [] } }))
      ]);

      const tracks: NormalizedTrack[] = [];
      for (const raw of songsRes.data?.results || []) {
        const t = this.normalizeTrack(raw);
        if (t) tracks.push(t);
      }

      const artists: NormalizedArtist[] = [];
      for (const a of artistsRes.data?.results || []) {
        if (!a.id || !a.name) continue;
        const pic = this.cleanImage(a.image);
        // Requirement: Hide any artist without a valid ID and image from home cards and lists
        if (!pic) continue;
        artists.push({
          id: String(a.id),
          provider: 'jiosaavn',
          name: this.cleanString(a.name),
          imageUrl: pic,
          topSongs: [],
          albums: [],
          singles: [],
          relatedArtists: []
        });
      }

      const albums: NormalizedAlbum[] = [];
      for (const alb of albumsRes.data?.results || []) {
        if (!alb.id) continue;
        const albTitle = this.cleanString(alb.title || alb.name);
        const albCover = this.cleanImage(alb.image);
        if (!albTitle || !albCover) continue;
        albums.push({
          id: String(alb.id),
          provider: 'jiosaavn',
          title: albTitle,
          coverUrl: albCover,
          primaryArtist: {
            id: String(alb.more_info?.artist_id || '0'),
            name: this.cleanString(alb.more_info?.primary_artists || 'Various Artists')
          },
          artists: [],
          tracks: []
        });
      }

      const result = { tracks: tracks.slice(0, limit), artists: artists.slice(0, 8), albums: albums.slice(0, 8) };
      await ProviderCacheService.set(cacheKey, result, 3600, 'jiosaavn'); // 1 hour TTL
      return result;
    } catch (err: any) {
      console.warn(`[JioSaavnCatalog] search failed for "${cleanQ}":`, err.message);
      return { tracks: [], artists: [], albums: [] };
    }
  }

  /**
   * Fetches trending tracks, optionally targeted by language.
   */
  async getTrending(language?: string, storefront = 'in', limit = 25): Promise<NormalizedTrack[]> {
    const lang = (language || '').toLowerCase().trim();
    const cacheKey = `jiosaavn:trending:${lang || 'all'}:${limit}`;
    const cached = await ProviderCacheService.get<NormalizedTrack[]>(cacheKey);
    if (cached) return cached;

    try {
      const q = lang ? `Trending ${lang}` : 'Trending Hits';
      const searchRes = await this.search(q, storefront, limit);
      if (searchRes.tracks.length > 0) {
        await ProviderCacheService.set(cacheKey, searchRes.tracks, 3600, 'jiosaavn'); // 1 hour TTL
        return searchRes.tracks;
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Fetches latest new release tracks, optionally targeted by language.
   */
  async getNewReleases(language?: string, storefront = 'in', limit = 25): Promise<NormalizedTrack[]> {
    const lang = (language || '').toLowerCase().trim();
    const cacheKey = `jiosaavn:new_releases:${lang || 'all'}:${limit}`;
    const cached = await ProviderCacheService.get<NormalizedTrack[]>(cacheKey);
    if (cached) return cached;

    try {
      const q = lang ? `Latest ${lang} Hits` : 'Latest Hits';
      const searchRes = await this.search(q, storefront, limit);
      if (searchRes.tracks.length > 0) {
        await ProviderCacheService.set(cacheKey, searchRes.tracks, 3600, 'jiosaavn'); // 1 hour TTL
        return searchRes.tracks;
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Artist Radio / Similar track pool.
   */
  async getArtistRadio(providerArtistId: string, limit = 20): Promise<NormalizedTrack[]> {
    const artist = await this.getArtist(providerArtistId);
    if (!artist) return [];

    const radioPool = [...artist.topSongs];
    // Gather songs from related artists if needed
    for (const rel of artist.relatedArtists.slice(0, 3)) {
      if (radioPool.length >= limit) break;
      const relArtist = await this.getArtist(rel.id);
      if (relArtist?.topSongs) {
        radioPool.push(...relArtist.topSongs.slice(0, 5));
      }
    }
    return radioPool.slice(0, limit);
  }

  /**
   * Track suggestions based on song / album context.
   */
  async getSongSuggestions(providerTrackId: string, limit = 15): Promise<NormalizedTrack[]> {
    const track = await this.getTrack(providerTrackId);
    if (!track) return [];

    if (track.albumId) {
      const album = await this.getAlbum(track.albumId);
      if (album?.tracks?.length) {
        const others = album.tracks.filter(t => t.id !== track.id);
        if (others.length >= limit) return others.slice(0, limit);
      }
    }

    if (track.primaryArtist?.id && !track.primaryArtist.id.startsWith('unknown')) {
      const artist = await this.getArtist(track.primaryArtist.id);
      if (artist?.topSongs) {
        return artist.topSongs.filter(t => t.id !== track.id).slice(0, limit);
      }
    }

    return [];
  }

  /**
   * Fast autocomplete search hints
   */
  async getSearchHints(query: string, storefront = 'in'): Promise<string[]> {
    const cleanQ = query.trim();
    if (!cleanQ) return [];

    try {
      const res = await axios.get(this.baseUrl, {
        params: {
          __call: 'autocomplete.get',
          query: cleanQ,
          _format: 'json',
          _marker: '0',
          api_version: '4',
          ctx: 'web6dot0'
        },
        headers: { 'User-Agent': this.userAgent },
        timeout: 2500
      });

      const top = res.data?.topquery?.data || [];
      const songs = res.data?.songs?.data || [];
      return [...top, ...songs].map((x: any) => this.cleanString(x.title || x.song)).filter(Boolean).slice(0, 8);
    } catch {
      return [];
    }
  }
}

export const jiosaavnCatalog = new JioSaavnCatalogService();

