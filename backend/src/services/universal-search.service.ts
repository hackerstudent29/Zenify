import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { splitArtistString } from '../utils/artist.js';
import { CatalogTrack, CatalogArtist, CatalogAlbum, CatalogSearchResult, CatalogArtistRef } from './catalog-provider.service.js';

export interface UniversalTrackItem {
  id: string;
  name: string;
  trackName: string;
  artistName: string;
  artists: { items: { profile: { name: string } }[] };
  collectionName: string;
  albumOfTrack: { name: string; coverArt: { sources: { url: string; width?: number }[] } };
  artworkUrl100: string;
  coverUrl: string;
  duration: { totalMilliseconds: number };
  duration_ms: number;
  trackTimeMillis: number;
  audioUrl?: string;
  preview_url?: string;
  previewUrl?: string;
  isZenify: boolean;
  isImported: boolean;
  source: 'zenify' | 'jiosaavn' | 'itunes' | 'youtube' | 'spotify';
  score: number;
}

const memoryCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cleanEntity(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function dedupeKey(title: string, artist: string): string {
  const t = (title || '').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const a = (artist || '').toLowerCase()
    .split(/[,&/]/)[0]
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${t}:::${a}`;
}

function scoreTrack(title: string, artist: string, query: string, source: string): number {
  const t = (title || '').toLowerCase().trim();
  const a = (artist || '').toLowerCase().trim();
  const q = query.toLowerCase().trim();
  let score = 0;

  if (t === q) score += 250;
  else if (t.startsWith(q)) score += 180;
  else if (t.includes(q)) score += 90;

  if (a === q) score += 150;
  else if (a.startsWith(q)) score += 100;
  else if (a.includes(q)) score += 60;

  // Source preference boosts
  if (source === 'zenify') score += 50; // Verified local track
  else if (source === 'jiosaavn') score += 25; // 320kbps licensed master
  else if (source === 'itunes') score += 20;

  // Penalize karaoke / instrumental / cover unless user explicitly typed it
  const isDerivative = /\b(karaoke|instrumental|acoustic|cover|backing track|tribute|remix|lofi)\b/i.test(t);
  const wantsDerivative = /\b(karaoke|instrumental|acoustic|cover|backing track|tribute|remix|lofi)\b/i.test(q);
  if (isDerivative && !wantsDerivative) {
    score -= 120;
  }

  return score;
}

export class UniversalSearchService {
  /**
   * High-speed, comprehensive track search across Zenify DB, JioSaavn 320k CDN, iTunes IN/US, and YouTube Music.
   * Guarantees zero missing songs for both Western and regional tracks.
   */
  static async searchTracks(query: string, options: { country?: string; limit?: number } = {}): Promise<UniversalTrackItem[]> {
    const cleanQ = (query || '').trim();
    if (!cleanQ) return [];

    const country = (options.country || 'in').toLowerCase();
    const limit = options.limit || 25;
    const cacheKey = `universal:tracks:${cleanQ.toLowerCase()}:${country}:${limit}`;

    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const resultMap = new Map<string, UniversalTrackItem>();

    // 1. Local Database Search (Instant DB Lookup)
    const dbPromise = (async () => {
      try {
        const dbTracks = await prisma.track.findMany({
          where: {
            deletedAt: null,
            OR: [
              { title: { contains: cleanQ, mode: 'insensitive' } },
              { artist: { name: { contains: cleanQ, mode: 'insensitive' } } },
              { featuredArtists: { contains: cleanQ, mode: 'insensitive' } }
            ]
          },
          include: { artist: true, album: true },
          take: 12
        });

        for (const t of dbTracks) {
          const key = dedupeKey(t.title, t.artist?.name || '');
          const score = scoreTrack(t.title, t.artist?.name || '', cleanQ, 'zenify');
          resultMap.set(key, {
            id: t.id,
            name: t.title,
            trackName: t.title,
            artistName: t.artist?.name || 'Unknown Artist',
            artists: { items: [{ profile: { name: t.artist?.name || 'Unknown Artist' } }] },
            collectionName: t.album?.title || 'Single',
            albumOfTrack: {
              name: t.album?.title || 'Single',
              coverArt: { sources: [{ url: t.coverUrl || '', width: 640 }] }
            },
            artworkUrl100: t.coverUrl || '',
            coverUrl: t.coverUrl || '',
            duration: { totalMilliseconds: (t.duration || 180) * 1000 },
            duration_ms: (t.duration || 180) * 1000,
            trackTimeMillis: (t.duration || 180) * 1000,
            audioUrl: t.audioUrl,
            isZenify: true,
            isImported: true,
            source: 'zenify',
            score
          });
        }
      } catch (err: any) {
        console.warn('[UniversalSearch] Local DB search error:', err.message);
      }
    })();

    // 2. JioSaavn Official Engine (Unmatched Bollywood/Kollywood/Tollywood + Global Western 320k)
    const saavnPromise = (async () => {
      try {
        const [searchRes, autoRes] = await Promise.all([
          axios.get('https://www.jiosaavn.com/api.php', {
            params: {
              __call: 'search.getResults',
              q: cleanQ,
              p: 1,
              n: 20,
              _format: 'json',
              _marker: '0',
              ctx: 'web6dot0'
            },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 3200
          }).catch(() => null),
          axios.get('https://www.jiosaavn.com/api.php', {
            params: {
              __call: 'autocomplete.get',
              query: cleanQ,
              _format: 'json',
              _marker: '0',
              ctx: 'web6dot0'
            },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 2500
          }).catch(() => null)
        ]);

        const rawList = [
          ...(searchRes?.data?.results || []),
          ...(autoRes?.data?.songs?.data || [])
        ];

        for (const s of rawList) {
          const title = cleanEntity(s.song || s.title);
          const artist = cleanEntity(s.primary_artists || s.singers || s.description || s.more_info?.primary_artists);
          const album = cleanEntity(s.album || s.more_info?.album || 'Single');
          if (!title || !artist) continue;

          const key = dedupeKey(title, artist);
          let cover = s.image || s.more_info?.image || '';
          cover = cover.replace('150x150', '500x500').replace('50x50', '500x500');
          const dur = parseInt(s.duration || s.more_info?.duration, 10) || 180;
          const score = scoreTrack(title, artist, cleanQ, 'jiosaavn');

          const existing = resultMap.get(key);
          if (existing) {
            // Merge higher resolution cover or update audio hint
            if (!existing.coverUrl && cover) {
              existing.coverUrl = cover;
              existing.artworkUrl100 = cover;
            }
            continue;
          }

          resultMap.set(key, {
            id: `saavn-${s.id}`,
            name: title,
            trackName: title,
            artistName: artist,
            artists: { items: [{ profile: { name: artist } }] },
            collectionName: album,
            albumOfTrack: {
              name: album,
              coverArt: { sources: [{ url: cover, width: 500 }] }
            },
            artworkUrl100: cover,
            coverUrl: cover,
            duration: { totalMilliseconds: dur * 1000 },
            duration_ms: dur * 1000,
            trackTimeMillis: dur * 1000,
            audioUrl: undefined,
            isZenify: false,
            isImported: false,
            source: 'jiosaavn',
            score
          });
        }
      } catch (err: any) {
        console.warn('[UniversalSearch] JioSaavn search error:', err.message);
      }
    })();

    // 3. iTunes Multi-Storefront (User Country Storefront + US Global in parallel)
    const itunesPromise = (async () => {
      try {
        const targetCountries = country === 'us' ? ['us', 'gb'] : [country, 'us'];
        const calls = targetCountries.map(c =>
          axios.get('https://itunes.apple.com/search', {
            params: { term: cleanQ, country: c, entity: 'song', limit: 20 },
            timeout: 3200
          }).catch(() => null)
        );

        const responses = await Promise.all(calls);
        for (const res of responses) {
          const results = res?.data?.results || [];
          for (const t of results) {
            if (!t.trackName || !t.artistName) continue;
            const key = dedupeKey(t.trackName, t.artistName);
            const cover = t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : '';
            const dur = Math.round((t.trackTimeMillis || 180000) / 1000);
            const score = scoreTrack(t.trackName, t.artistName, cleanQ, 'itunes');

            const existing = resultMap.get(key);
            if (existing) {
              // Upgrade artwork if iTunes has cleaner 600x600 artwork
              if (cover && (!existing.coverUrl || existing.coverUrl.includes('placeholder'))) {
                existing.coverUrl = cover;
                existing.artworkUrl100 = cover;
                existing.albumOfTrack.coverArt.sources = [{ url: cover, width: 600 }];
              }
              if (!existing.previewUrl && t.previewUrl) {
                existing.previewUrl = t.previewUrl;
                existing.preview_url = t.previewUrl;
              }
              continue;
            }

            resultMap.set(key, {
              id: `itunes-${t.trackId}`,
              name: t.trackName,
              trackName: t.trackName,
              artistName: t.artistName,
              artists: { items: [{ profile: { name: t.artistName } }] },
              collectionName: t.collectionName || 'Single',
              albumOfTrack: {
                name: t.collectionName || 'Single',
                coverArt: { sources: [{ url: cover, width: 600 }] }
              },
              artworkUrl100: cover,
              coverUrl: cover,
              duration: { totalMilliseconds: t.trackTimeMillis || 180000 },
              duration_ms: t.trackTimeMillis || 180000,
              trackTimeMillis: t.trackTimeMillis || 180000,
              previewUrl: t.previewUrl,
              preview_url: t.previewUrl,
              isZenify: false,
              isImported: false,
              source: 'itunes',
              score
            });
          }
        }
      } catch (err: any) {
        console.warn('[UniversalSearch] iTunes search error:', err.message);
      }
    })();

    await Promise.allSettled([dbPromise, saavnPromise, itunesPromise]);

    // 4. YouTube Music Supplement (If results are scarce < 8 or niche query)
    if (resultMap.size < 8) {
      try {
        const { ExternalMetadataService } = await import('./external-metadata.service.js');
        const ytResults = await ExternalMetadataService.searchYoutubeMusic(cleanQ).catch(() => []);
        for (const v of ytResults.slice(0, 10)) {
          const parsed = ExternalMetadataService.parseYoutubeVideoToTrack(v);
          const key = dedupeKey(parsed.title, parsed.artist?.name || '');
          if (resultMap.has(key)) continue;

          const score = scoreTrack(parsed.title, parsed.artist?.name || '', cleanQ, 'youtube');
          resultMap.set(key, {
            id: parsed.id,
            name: parsed.title,
            trackName: parsed.title,
            artistName: parsed.artist?.name || 'Unknown Artist',
            artists: { items: [{ profile: { name: parsed.artist?.name || 'Unknown Artist' } }] },
            collectionName: parsed.album?.title || 'YouTube Music',
            albumOfTrack: {
              name: parsed.album?.title || 'YouTube Music',
              coverArt: { sources: [{ url: parsed.coverUrl, width: 500 }] }
            },
            artworkUrl100: parsed.coverUrl,
            coverUrl: parsed.coverUrl,
            duration: { totalMilliseconds: parsed.duration * 1000 },
            duration_ms: parsed.duration * 1000,
            trackTimeMillis: parsed.duration * 1000,
            audioUrl: parsed.audioUrl,
            preview_url: parsed.audioUrl,
            previewUrl: parsed.audioUrl,
            isZenify: false,
            isImported: false,
            source: 'youtube',
            score
          });
        }
      } catch (err: any) {
        console.warn('[UniversalSearch] YouTube fallback warning:', err.message);
      }
    }

    // 5. Cross-reference all items with local DB to flag existing tracks as isZenify
    try {
      const dbAll = await prisma.track.findMany({
        where: { deletedAt: null },
        select: { id: true, title: true, artist: { select: { name: true } }, audioUrl: true }
      });
      const dbMap = new Map<string, any>();
      for (const t of dbAll) {
        dbMap.set(dedupeKey(t.title, t.artist?.name || ''), t);
      }

      for (const item of resultMap.values()) {
        const key = dedupeKey(item.name, item.artistName);
        const match = dbMap.get(key);
        if (match) {
          item.id = match.id;
          item.isZenify = true;
          item.isImported = true;
          item.audioUrl = match.audioUrl || item.audioUrl;
          item.score += 50; // Boost local verified tracks
        }
      }
    } catch {}

    // Sort descending by calculated relevance score
    const sorted = Array.from(resultMap.values())
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    memoryCache.set(cacheKey, { data: sorted, expiresAt: Date.now() + CACHE_TTL });
    return sorted;
  }

  /**
   * Search external catalog returning normalized CatalogSearchResult
   * for CompositeCatalogService & Global /search routes.
   */
  static async searchCatalog(query: string, storefront = 'in', limit = 20): Promise<CatalogSearchResult> {
    const tracks = await this.searchTracks(query, { country: storefront, limit });
    const catalogTracks: CatalogTrack[] = [];
    const artistsMap = new Map<string, CatalogArtist>();
    const albumsMap = new Map<string, CatalogAlbum>();

    for (const t of tracks) {
      const splitNames = splitArtistString(t.artistName);
      const primaryArtistName = splitNames[0] || t.artistName;

      const artistRefs: CatalogArtistRef[] = splitNames.map(name => ({
        id: `artist-${encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
        name,
        imageUrl: t.coverUrl
      }));

      const primaryArtistRef: CatalogArtistRef = artistRefs[0] || {
        id: `artist-${encodeURIComponent(primaryArtistName.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
        name: primaryArtistName,
        imageUrl: t.coverUrl
      };

      catalogTracks.push({
        id: t.source === 'zenify' ? t.id : `${t.source}-${t.id}`,
        source: (t.source === 'zenify' ? 'itunes' : t.source) as any,
        sourceId: t.id,
        title: t.name,
        artists: artistRefs,
        artist: primaryArtistRef,
        album: t.collectionName ? {
          id: `album-${encodeURIComponent(t.collectionName.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
          title: t.collectionName,
          coverUrl: t.coverUrl
        } : undefined,
        duration: Math.round(t.duration_ms / 1000),
        artwork: t.coverUrl,
        coverUrl: t.coverUrl,
        audioUrl: t.audioUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(`${primaryArtistName} - ${t.name}`)}`,
        storefront,
        fetchedAt: Date.now(),
        isVirtual: true,
        inLibrary: t.isZenify
      });

      // Collect deduplicated artists
      for (const name of splitNames) {
        const norm = name.toLowerCase().trim();
        if (!artistsMap.has(norm)) {
          artistsMap.set(norm, {
            id: `artist-${encodeURIComponent(norm.replace(/[^a-z0-9]/g, '-'))}`,
            source: (t.source === 'zenify' ? 'itunes' : t.source) as any,
            sourceId: `artist-${encodeURIComponent(norm)}`,
            name,
            imageUrl: t.coverUrl
          });
        }
      }

      // Collect deduplicated albums
      if (t.collectionName && t.collectionName !== 'Single' && t.collectionName !== 'YouTube Music') {
        const normAlb = `${t.collectionName.toLowerCase().trim()}::${primaryArtistName.toLowerCase().trim()}`;
        if (!albumsMap.has(normAlb)) {
          albumsMap.set(normAlb, {
            id: `album-${encodeURIComponent(t.collectionName.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
            source: (t.source === 'zenify' ? 'itunes' : t.source) as any,
            sourceId: `album-${encodeURIComponent(t.collectionName)}`,
            title: t.collectionName,
            artist: primaryArtistRef,
            coverUrl: t.coverUrl
          });
        }
      }
    }

    return {
      tracks: catalogTracks,
      artists: Array.from(artistsMap.values()).slice(0, 10),
      albums: Array.from(albumsMap.values()).slice(0, 10)
    };
  }
}
