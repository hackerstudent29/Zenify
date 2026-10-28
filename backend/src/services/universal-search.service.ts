import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { splitArtistString } from '../utils/artist.js';
import { CleanCdnAudioService } from './clean-cdn-audio.service.js';
import { CatalogTrack, CatalogArtist, CatalogAlbum, CatalogSearchResult, CatalogArtistRef } from './catalog-provider.service.js';

export interface UniversalTrackItem {
  id: string;
  name: string;
  trackName: string;
  artistName: string;
  artists: { items: { profile: { name: string } }[] };
  albumId?: string | number;
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
  streams?: number;
  playCount?: number;
  year?: number;
}

const memoryCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function cleanEntity(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&copy;/g, '')
    .trim();
}

export function getBaseTitle(title: string): string {
  return (title || '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .split(/[-–—]/)[0]
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

export function extractSequelTag(text: string): string | null {
  if (!text) return null;
  const s = text.toLowerCase();
  const match = s.match(/\b(part|pt|chapter|vol|volume)\s*([0-9]+|[ivx]+)\b/i) ||
                s.match(/\b([2-9])\.0\b/) ||
                s.match(/\b([2-9])\b/) ||
                s.match(/\b(ii|iii|iv|v)\b/i);
  if (match) {
    let val = match[2] || match[1];
    if (val === 'ii') return '2';
    if (val === 'iii') return '3';
    if (val === 'iv') return '4';
    if (val === 'v') return '5';
    return val.toLowerCase();
  }
  return null;
}

export function isCompilationOrPlaylist(title: string, durationSec = 0): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  if (durationSec > 650) return true; // >10.8 minutes is likely a jukebox/compilation
  return /\b(hits\s*(20\d\d)?|top\s*(songs|tracks|hits)|best of|compilation|jukebox|collection|playlist|all time hits|party songs|mashup|mega mix|audio jukebox|full album|theme mashup)\b/i.test(lower);
}

export function cleanArtistNames(rawArtist: string, rawMusicDirector?: string): string {
  if (!rawArtist && !rawMusicDirector) return 'Unknown Artist';
  
  let cleaned = (rawArtist || '')
    .replace(/^[\s,;&/|•·\-–—]+|[\s,;&/|•·\-–—]+$/g, '')
    .replace(/·.*$/g, '')
    .replace(/\b\d+\s*Songs\b/gi, '')
    .replace(/\bSaavn\s*Editor\b/gi, '')
    .trim();

  const seen = new Set<string>();
  const finalNames: string[] = [];

  if (rawMusicDirector) {
    const mdParts = splitArtistString(rawMusicDirector);
    for (const m of mdParts) {
      const norm = m.toLowerCase().trim();
      if (norm && !seen.has(norm) && finalNames.length < 3) {
        seen.add(norm);
        finalNames.push(m.trim());
      }
    }
  }

  const parts = splitArtistString(cleaned);
  for (const p of parts) {
    const norm = p.toLowerCase().trim();
    if (norm && !seen.has(norm) && finalNames.length < 3) {
      seen.add(norm);
      finalNames.push(p.trim());
    }
  }

  return finalNames.length > 0 ? finalNames.join(', ') : (cleaned || 'Unknown Artist');
}

export function scoreTrack(
  title: string,
  artist: string,
  query: string,
  source: string,
  album?: string,
  playCount = 0,
  year = 0
): number {
  const norm = (s = '') =>
    s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
     .replace(/\(.*?\)|\[.*?\]/g, ' ')
     .replace(/[^a-z0-9\u0900-\u0D7F\s]/g, ' ')
     .replace(/\s+/g, ' ').trim();

  const t = (title || '').toLowerCase().trim();
  const baseT = getBaseTitle(t).toLowerCase().trim();
  const a = (artist || '').toLowerCase().trim();
  const q = query.toLowerCase().trim();
  const qNorm = norm(query);
  const tNorm = norm(title);
  let score = 0;

  // Tiering by title match (Exact title match lands in tier 0)
  if (tNorm === qNorm || t === q || baseT === q) {
    score += 350; // Exact title match
  } else if (tNorm.startsWith(qNorm + ' ') || t.startsWith(q) || baseT.startsWith(q)) {
    score += 240; // Prefix / sequel match
  } else if (tNorm.includes(qNorm) || t.includes(q)) {
    score += 130; // Substring match
  }

  if (a === q) score += 170;
  else if (a.startsWith(q)) score += 120;
  else if (a.includes(q)) score += 75;

  // Major boost if track's album/movie matches query only when track title is not already an exact match (e.g. 'Hukum' or 'Kaavaalaa' in album 'Jailer')
  if (album && tNorm !== qNorm && t !== q) {
    const albLower = album.toLowerCase().trim();
    if (albLower === q || albLower === `${q} (original motion picture soundtrack)`) score += 250;
    else if (albLower.startsWith(q) || q.startsWith(albLower)) score += 180;
    else if (albLower.includes(q)) score += 120;
  }

  // Streaming popularity weighting (Spotify / JioSaavn authentic scale)
  if (playCount > 0) {
    // Logarithmic scale: 50M -> ~345, 10M -> ~315, 1M -> ~270, 100k -> ~225, 10k -> ~180, 1k -> ~135
    score += Math.min(Math.round(Math.log10(Math.max(playCount, 1)) * 45), 340);
  } else {
    // Penalize obscure 0-play noise so it never beats real songs
    score -= 140;
  }

  // Recency bonus ONLY for tracks that have genuine listener engagement (preventing 0-play fakes)
  if (playCount >= 5000) {
    if (year >= 2025) score += 30;
    else if (year >= 2024) score += 20;
    else if (year >= 2022) score += 10;
  }

  // Source preference boosts
  if (source === 'zenify') score += 60; // Verified local track
  else if (source === 'jiosaavn') score += 180; // Primary source: instant 320kbps Akamai CDN stream
  else if (source === 'itunes') score += 10;

  // Strict Sequel / Part matching:
  const querySequel = extractSequelTag(query);
  const candSequel = extractSequelTag(`${title} ${album || ''}`);

  if (querySequel) {
    if (candSequel === querySequel) {
      score += 150; // Exact sequel match (e.g. Jailer 2 with Jailer 2)
    } else {
      score -= 300; // Hard penalty for sequel mismatch (e.g. Jailer 1 when asked for Jailer 2)
    }
  } else {
    // User did not ask for a sequel: penalize sequel candidates so original is played
    if (candSequel && candSequel !== '1') {
      score -= 220;
    }
  }

  // Penalize karaoke / instrumental / cover unless user explicitly typed it or it's an authentic theme/bgm/ost
  const isThemeOrBgm = /\b(theme|bgm|score|soundtrack|ost)\b/i.test(t);
  const isDerivative = /\b(karaoke|instrumental|acoustic|cover|covers|backing track|tribute|remix|lofi|slowed|reverb|carnatic mix|remake|in the style of|originally performed by|made famous by|ringtone|bass boosted|sped up|chipmunk|8d audio|mashup|nightcore|piano version)\b/i.test(`${t} ${a} ${album ? album.toLowerCase() : ''}`);
  const wantsDerivative = /\b(karaoke|instrumental|acoustic|cover|covers|backing track|tribute|remix|lofi|theme|bgm|score|soundtrack|ost)\b/i.test(q);
  if (isDerivative && !wantsDerivative && !isThemeOrBgm) {
    score -= 420;
  }

  return score;
}

export class UniversalSearchService {
  /**
   * High-speed, comprehensive track search across Zenify DB, JioSaavn 320k CDN, iTunes IN/US, and YouTube Music.
   * Guarantees zero missing songs for both Western and regional tracks.
   */
  static async searchTracks(query: string, options: { country?: string; limit?: number; language?: string } = {}): Promise<UniversalTrackItem[]> {
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
          select: {
            id: true,
            title: true,
            coverUrl: true,
            duration: true,
            audioUrl: true,
            albumId: true,
            artist: { select: { id: true, name: true } },
            album: { select: { id: true, title: true, coverUrl: true } }
          },
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
            albumId: t.album?.id || t.albumId,
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
        const [p1, p2, p3, autoRes] = await Promise.all([
          axios.get('https://www.jiosaavn.com/api.php', {
            params: { __call: 'search.getResults', q: cleanQ, p: 1, n: 40, _format: 'json', ctx: 'web6dot0' },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 3800
          }).catch(() => null),
          axios.get('https://www.jiosaavn.com/api.php', {
            params: { __call: 'search.getResults', q: cleanQ, p: 2, n: 40, _format: 'json', ctx: 'web6dot0' },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 3800
          }).catch(() => null),
          axios.get('https://www.jiosaavn.com/api.php', {
            params: { __call: 'search.getResults', q: cleanQ, p: 3, n: 40, _format: 'json', ctx: 'web6dot0' },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 3800
          }).catch(() => null),
          axios.get('https://www.jiosaavn.com/api.php', {
            params: { __call: 'autocomplete.get', query: cleanQ, _format: 'json', ctx: 'web6dot0' },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 2500
          }).catch(() => null)
        ]);

        const rawList = [
          ...(p1?.data?.results || []),
          ...(p2?.data?.results || []),
          ...(p3?.data?.results || []),
          ...(autoRes?.data?.songs?.data || [])
        ];

        const seenIds = new Set<string>();
        const dedupedList = rawList.filter(s => {
          const sid = s?.id || s?.perma_url;
          if (sid && !seenIds.has(sid)) {
            seenIds.add(sid);
            return true;
          }
          return false;
        });

        for (const s of dedupedList) {
          const title = cleanEntity(s.song || s.title);
          const dur = parseInt(s.duration || s.more_info?.duration, 10) || 180;
          
          // Strict: Compilations and playlists belong in playlists, not songs
          if (isCompilationOrPlaylist(title, dur)) continue;

          const rawSingers = cleanEntity(s.more_info?.singers || s.singers || s.primary_artists || s.more_info?.primary_artists);
          const rawMusic = cleanEntity(s.more_info?.music || s.music);
          const artist = cleanArtistNames(rawSingers, rawMusic);
          const album = cleanEntity(s.album || s.more_info?.album || 'Single');
          if (!title || !artist) continue;

          const playCount = parseInt(s.play_count || s.more_info?.play_count || '0', 10);
          const year = parseInt(s.year || s.more_info?.year || s.release_date?.slice(0, 4) || '0', 10);

          const key = dedupeKey(title, artist);
          let cover = s.image || s.more_info?.image || '';
          cover = cover.replace('150x150', '500x500').replace('50x50', '500x500');
          const candLang = (s.language || s.more_info?.language || '').toLowerCase().trim();
          let score = scoreTrack(title, artist, cleanQ, 'jiosaavn', album, playCount, year);
          const preferredLang = (options.language || '').toLowerCase().trim();
          if (preferredLang) {
            if (candLang === preferredLang) score += 200;
            else if (candLang && candLang !== 'unknown') score -= 150;
          }

          const existing = resultMap.get(key);
          if (existing) {
            if (score > (existing.score || 0)) {
              existing.score = score;
              existing.playCount = playCount;
              existing.streams = playCount || 0;
              existing.year = year;
              if (cover) {
                existing.coverUrl = cover;
                existing.artworkUrl100 = cover;
              }
              if (s.id) {
                (existing as any).id = `saavn-${s.id}`;
                const encMedia = s.encrypted_media_url || s.more_info?.encrypted_media_url;
                if (encMedia) {
                  existing.audioUrl = CleanCdnAudioService.decryptSaavnMediaUrl(encMedia, '320') || CleanCdnAudioService.decryptSaavnMediaUrl(encMedia, '160') || existing.audioUrl;
                }
              }
            }
            continue;
          }

          const encMedia = s.encrypted_media_url || s.more_info?.encrypted_media_url;
          const directAudio = encMedia ? (CleanCdnAudioService.decryptSaavnMediaUrl(encMedia, '320') || CleanCdnAudioService.decryptSaavnMediaUrl(encMedia, '160') || undefined) : undefined;
          const fallbackAudio = directAudio || `/api/utils/stream-youtube?url=${encodeURIComponent(`${artist} - ${title}`)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&trackId=saavn-${s.id}`;

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
            audioUrl: directAudio || fallbackAudio,
            isZenify: false,
            isImported: false,
            source: 'jiosaavn',
            score,
            playCount,
            streams: playCount || 0,
            year
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
            const dur = Math.round((t.trackTimeMillis || 180000) / 1000);
            if (isCompilationOrPlaylist(t.trackName, dur)) continue;

            const cleanT = cleanEntity(t.trackName);
            const cleanA = cleanArtistNames(cleanEntity(t.artistName));
            const key = dedupeKey(cleanT, cleanA);
            const cover = t.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : '';
            const score = scoreTrack(cleanT, cleanA, cleanQ, 'itunes', t.collectionName);

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
              name: cleanT,
              trackName: cleanT,
              artistName: cleanA,
              artists: { items: [{ profile: { name: cleanA } }] },
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
      const candidateTitles = Array.from(resultMap.values()).map(item => item.name).filter(Boolean);
      const dbAll = candidateTitles.length === 0 ? [] : await prisma.track.findMany({
        where: {
          deletedAt: null,
          title: { in: candidateTitles, mode: 'insensitive' }
        },
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
  /**
   * Search external catalog returning normalized CatalogSearchResult
   * for CompositeCatalogService & Global /search routes.
   * Concurrently queries Tracks, dedicated Artists, and dedicated Albums from iTunes & JioSaavn.
   */
  static async searchCatalog(query: string, storefront = 'in', limit = 20): Promise<CatalogSearchResult> {
    const cleanQ = (query || '').trim();
    if (!cleanQ) return { tracks: [], artists: [], albums: [] };

    // Parallel multi-engine fetch: tracks + dedicated artist searches + dedicated album searches + playlists
    const [tracks, externalArtistsSettled, externalAlbumsSettled, externalPlaylistsSettled] = await Promise.all([
      this.searchTracks(cleanQ, { country: storefront, limit }),
      Promise.allSettled([
        // 1. JioSaavn Primary Artist Search (Authentic portraits, real official names, CTR popularity)
        axios.get('https://www.jiosaavn.com/api.php', {
          params: { __call: 'search.getArtistResults', q: cleanQ, p: 1, n: 10, _format: 'json', ctx: 'web6dot0' },
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 2800
        }).then(r => r.data?.results || []).catch(() => []),
        // 2. JioSaavn Artist Auto-Suggest & Top Query
        axios.get('https://www.jiosaavn.com/api.php', {
          params: { __call: 'autocomplete.get', query: cleanQ, _format: 'json', ctx: 'web6dot0' },
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 2800
        }).then(r => [
          ...(r.data?.topquery?.data?.filter((x: any) => x.type === 'artist') || []),
          ...(r.data?.artists?.data || [])
        ]).catch(() => []),
        // 3. iTunes Artist Lookup (Fallback for Western indie)
        axios.get('https://itunes.apple.com/search', {
          params: { term: cleanQ, entity: 'musicArtist', country: storefront, limit: 6 },
          timeout: 2800
        }).then(r => r.data?.results || []).catch(() => [])
      ]),
      Promise.allSettled([
        // 1. JioSaavn Album Search (Authentic regional posters & multi-language versions)
        axios.get('https://www.jiosaavn.com/api.php', {
          params: { __call: 'search.getAlbumResults', q: cleanQ, p: 1, n: 12, _format: 'json', ctx: 'web6dot0' },
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 2800
        }).then(r => r.data?.results || []).catch(() => []),
        // 2. iTunes Album Search
        axios.get('https://itunes.apple.com/search', {
          params: { term: cleanQ, entity: 'album', country: storefront, limit: 10 },
          timeout: 2800
        }).then(r => r.data?.results || []).catch(() => [])
      ]),
      Promise.allSettled([
        // JioSaavn Curated Playlists Search (For movies, OST collections & genres)
        axios.get('https://www.jiosaavn.com/api.php', {
          params: { __call: 'search.getPlaylistResults', q: cleanQ, p: 1, n: 10, _format: 'json', ctx: 'web6dot0' },
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 2800
        }).then(r => r.data?.results || []).catch(() => [])
      ])
    ]);

    const catalogTracks: CatalogTrack[] = [];
    const artistsMap = new Map<string, CatalogArtist>();
    const albumsMap = new Map<string, CatalogAlbum>();

    // 1. Ingest dedicated artists (JioSaavn artists FIRST with authentic 500x500 portraits and CTR)
    const saavnArtistResults = externalArtistsSettled[0].status === 'fulfilled' ? externalArtistsSettled[0].value : [];
    const saavnAutoArtists = externalArtistsSettled[1].status === 'fulfilled' ? externalArtistsSettled[1].value : [];
    const itunesArtists = externalArtistsSettled[2].status === 'fulfilled' ? externalArtistsSettled[2].value : [];

    for (const a of [...saavnArtistResults, ...saavnAutoArtists]) {
      const name = cleanEntity(a.name || a.title);
      const norm = name.toLowerCase().trim();
      if (!norm) continue;
      let img = (a.image || '').replace('50x50', '500x500').replace('150x150', '500x500');
      if (img.includes('artist-default')) img = '';
      const ctr = parseInt(a.ctr || '0', 10);

      if (!artistsMap.has(norm)) {
        artistsMap.set(norm, {
          id: `artist-${encodeURIComponent(norm.replace(/[^a-z0-9]/g, '-'))}`,
          source: 'jiosaavn',
          sourceId: String(a.id || norm),
          name,
          imageUrl: img || undefined,
          follower_count: ctr
        });
      } else if (img && !artistsMap.get(norm)!.imageUrl) {
        artistsMap.get(norm)!.imageUrl = img;
      }
    }

    for (const a of itunesArtists) {
      const name = cleanEntity(a.artistName);
      const norm = name.toLowerCase().trim();
      if (!norm || artistsMap.has(norm)) continue;
      artistsMap.set(norm, {
        id: `artist-${encodeURIComponent(norm.replace(/[^a-z0-9]/g, '-'))}`,
        source: 'itunes',
        sourceId: String(a.artistId || norm),
        name,
        imageUrl: undefined
      });
    }

    // 2. Ingest dedicated albums (JioSaavn albums FIRST with authentic high-res covers and saavn-album- IDs)
    const saavnAlbums = externalAlbumsSettled[0].status === 'fulfilled' ? externalAlbumsSettled[0].value : [];
    const itunesAlbums = externalAlbumsSettled[1].status === 'fulfilled' ? externalAlbumsSettled[1].value : [];

    for (const alb of saavnAlbums) {
      const title = cleanEntity(alb.title || alb.name);
      const rawMusic = cleanEntity(alb.music);
      const rawSingers = cleanEntity(alb.primary_artists || alb.more_info?.primary_artists);
      const artistName = cleanArtistNames(rawSingers, rawMusic);
      const albId = alb.albumid || alb.id;
      const normKey = `${title.toLowerCase().trim()}::${alb.language || ''}::${albId || ''}`;
      if (!title || albumsMap.has(normKey)) continue;

      let art = (alb.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
      albumsMap.set(normKey, {
        id: `saavn-album-${albId}`,
        source: 'jiosaavn',
        sourceId: String(albId),
        title: alb.language ? `${title} (${alb.language.charAt(0).toUpperCase() + alb.language.slice(1)})` : title,
        artist: {
          id: `artist-${encodeURIComponent(artistName.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
          name: artistName,
          imageUrl: art
        },
        coverUrl: art,
        genre: alb.language ? `${alb.language} Soundtrack` : 'Soundtrack',
        releaseDate: alb.year ? `${alb.year}-01-01` : undefined,
        year: alb.year || undefined,
        trackCount: parseInt(alb.more_info?.song_count || alb.song_count || (alb.more_info?.song_pids ? alb.more_info.song_pids.split(',').length : 0) || alb.numsongs || 1, 10) || 1
      });
    }

    for (const alb of itunesAlbums) {
      const title = cleanEntity(alb.collectionName);
      const artistName = cleanEntity(alb.artistName || 'Various Artists');
      const normKey = `${title.toLowerCase().trim()}::${alb.collectionId || ''}`;
      if (!title || albumsMap.has(normKey)) continue;

      const art = alb.artworkUrl100 ? alb.artworkUrl100.replace('100x100bb', '600x600bb') : '';
      albumsMap.set(normKey, {
        id: `itunes-album-${alb.collectionId}`,
        source: 'itunes',
        sourceId: String(alb.collectionId),
        title,
        artist: {
          id: `artist-${encodeURIComponent(artistName.toLowerCase().replace(/[^a-z0-9]/g, '-'))}`,
          name: artistName,
          imageUrl: art
        },
        coverUrl: art,
        genre: alb.primaryGenreName,
        releaseDate: alb.releaseDate ? String(alb.releaseDate) : undefined,
        year: alb.releaseDate ? String(alb.releaseDate).slice(0, 4) : undefined,
        trackCount: alb.trackCount || 1
      });
    }

    // Ingest songs from top matching movie albums so full soundtracks & BGMs appear under tracks
    let topMovieAlbums: any[] = [];
    try {
      topMovieAlbums = saavnAlbums.filter((a: any) => {
        const at = cleanEntity(a.title || a.name).toLowerCase().trim();
        const ql = cleanQ.toLowerCase();
        return at === ql || at.startsWith(ql) || ql.startsWith(at) || at.includes(ql);
      }).slice(0, 3);

      if (topMovieAlbums.length > 0) {
        const albSongResults = await Promise.allSettled(
          topMovieAlbums.map((a: any) => {
            const albId = a.albumid || a.id;
            if (!albId) return Promise.resolve(null);
            return axios.get('https://www.jiosaavn.com/api.php', {
              params: { __call: 'content.getAlbumDetails', albumid: albId, _format: 'json', ctx: 'web6dot0' },
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              timeout: 2500
            }).then(r => ({ album: a, songs: r.data?.songs || [] })).catch(() => null);
          })
        );

        for (const res of albSongResults) {
          if (res.status === 'fulfilled' && res.value?.songs?.length) {
            const alb = res.value.album;
            const albTitle = cleanEntity(alb.title || alb.name);
            for (const s of res.value.songs) {
              const sTitle = cleanEntity(s.song || s.title);
              const sDur = parseInt(s.duration || s.more_info?.duration, 10) || 180;
              const sSingers = cleanEntity(s.more_info?.singers || s.singers || s.primary_artists || s.more_info?.primary_artists);
              const sMusic = cleanEntity(s.more_info?.music || s.music);
              const sArtist = cleanArtistNames(sSingers, sMusic);
              if (!sTitle || !sArtist) continue;

              const sKey = dedupeKey(sTitle, sArtist);
              if (tracks.some(tr => dedupeKey(tr.name, tr.artistName) === sKey)) continue;

              let sCover = (s.image || s.more_info?.image || alb.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
              const sScore = scoreTrack(sTitle, sArtist, cleanQ, 'jiosaavn', albTitle);

              tracks.push({
                id: `saavn-${s.id}`,
                name: sTitle,
                trackName: sTitle,
                artistName: sArtist,
                artists: { items: [{ profile: { name: sArtist } }] },
                collectionName: albTitle,
                albumOfTrack: {
                  name: albTitle,
                  coverArt: { sources: [{ url: sCover, width: 500 }] }
                },
                artworkUrl100: sCover,
                coverUrl: sCover,
                duration: { totalMilliseconds: sDur * 1000 },
                duration_ms: sDur * 1000,
                trackTimeMillis: sDur * 1000,
                audioUrl: (s.encrypted_media_url || s.more_info?.encrypted_media_url) ? (CleanCdnAudioService.decryptSaavnMediaUrl(s.encrypted_media_url || s.more_info?.encrypted_media_url) || undefined) : undefined,
                isZenify: false,
                isImported: false,
                source: 'jiosaavn',
                score: sScore
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[UniversalSearch] Album songs ingestion warning:', err.message);
    }

    // Sort all tracks by calculated relevance score so movie OST tracks and BGMs rank at the top
    tracks.sort((a, b) => (b.score || 0) - (a.score || 0));

    // 3. Map tracks and extract remaining secondary artists/albums
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
        audioUrl: t.audioUrl || `/api/utils/stream-youtube?url=${encodeURIComponent(`${primaryArtistName} - ${t.name}`)}&title=${encodeURIComponent(t.name)}&artist=${encodeURIComponent(primaryArtistName)}`,
        storefront,
        fetchedAt: Date.now(),
        isVirtual: true,
        inLibrary: t.isZenify,
        streams: (t as any).playCount || (t as any).streams || 0,
        playCount: (t as any).playCount || 0,
        year: (t as any).year
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
        } else if (!artistsMap.get(norm)!.imageUrl && t.coverUrl) {
          artistsMap.get(norm)!.imageUrl = t.coverUrl;
        }
      }

      // Collect deduplicated albums from tracks
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

        // Extract curated playlists
    const saavnPlaylists = (externalPlaylistsSettled && externalPlaylistsSettled[0]?.status === 'fulfilled')
      ? externalPlaylistsSettled[0].value
      : [];
    const playlistsMap = new Map<string, any>();
    for (const p of saavnPlaylists) {
      const pName = cleanEntity(p.listname || p.title || p.name);
      if (!pName) continue;
      const norm = pName.toLowerCase().trim();
      if (playlistsMap.has(norm)) continue;
      const pCover = (p.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
      playlistsMap.set(norm, {
        id: `saavn-playlist-${p.listid || p.id}`,
        name: pName,
        title: pName,
        coverUrl: pCover,
        description: `${p.count || '50'} songs • ${cleanEntity(p.firstname || '')} ${cleanEntity(p.lastname || '')}`.trim(),
        trackCount: parseInt(p.count || '50', 10) || 50,
        creator: `${cleanEntity(p.firstname || '')} ${cleanEntity(p.lastname || '')}`.trim() || p.username || 'Curator',
        isPlaylist: true,
        type: 'playlist',
        isLocal: false
      });
    }

    // Surface movie soundtrack playlist for top movie albums
    for (const alb of topMovieAlbums) {
      const albTitle = cleanEntity(alb.title || alb.name);
      const albId = alb.albumid || alb.id;
      if (!albId) continue;
      const pCover = (alb.image || '').replace('150x150', '500x500').replace('50x50', '500x500');
      const norm = `${albTitle.toLowerCase().trim()} ost`;
      if (!playlistsMap.has(norm)) {
        playlistsMap.set(norm, {
          id: `saavn-playlist-album-${albId}`,
          name: `${albTitle} - OST & Soundtracks`,
          title: `${albTitle} - OST & Soundtracks`,
          coverUrl: pCover,
          description: `Official Soundtrack & Instrumental BGMs • ${cleanEntity(alb.music || 'Original Motion Picture Soundtrack')}`,
          trackCount: parseInt(alb.more_info?.song_pids ? alb.more_info.song_pids.split(',').length : 10, 10) || 10,
          creator: cleanEntity(alb.music || 'Soundtrack Curator'),
          isPlaylist: true,
          type: 'playlist',
          isLocal: false
        });
      }
    }

    return {
      tracks: catalogTracks,
      artists: Array.from(artistsMap.values()).slice(0, 10),
      albums: Array.from(albumsMap.values()).slice(0, 10),
      playlists: Array.from(playlistsMap.values()).slice(0, 10)
    };
  }
}
