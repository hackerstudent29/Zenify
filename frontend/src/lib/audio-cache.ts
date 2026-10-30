/**
 * Zenify Client-Side Audio Cache (Decentralized Local Storage)
 * 
 * Inspired by Echo Music's ChunkingDataSource and ExoPlayer SimpleCache:
 * - Caches full song audio chunks locally on the user's device via native Web CacheStorage API.
 * - Serves repeat plays, loops, and skips with 0ms start latency and ZERO network requests.
 * - Automatically limits local disk footprint via LRU eviction (max 50 tracks ~ 250MB).
 */

const CACHE_NAME = 'zenify-audio-v1';
const MAX_CACHED_TRACKS = 50;
const LRU_STORAGE_KEY = 'zenify_audio_lru_v1';

// In-memory registry of active Blob object URLs to prevent leaks
const activeBlobUrls = new Map<string, string>();

function getLruList(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LRU_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function updateLruList(trackId: string): void {
  if (typeof window === 'undefined') return;
  try {
    let list = getLruList().filter(id => id !== trackId);
    list.unshift(trackId); // most recent at front
    if (list.length > MAX_CACHED_TRACKS * 1.5) {
      list = list.slice(0, MAX_CACHED_TRACKS);
    }
    localStorage.setItem(LRU_STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * Synchronously checks if an active Blob URL is already registered in-memory for this track.
 * Returns the Blob URL with 0ms start latency without breaking user gesture activation.
 */
export function getSyncCachedTrackBlobUrl(trackId: string): string | null {
  if (typeof window === 'undefined' || !trackId) return null;
  return activeBlobUrls.get(trackId) || null;
}

/**
 * Checks if a track's audio is already cached locally.
 * Returns an instant Blob URL if cached, or null if not yet cached.
 */
export async function getCachedTrackBlobUrl(trackId: string): Promise<string | null> {
  if (typeof window === 'undefined' || !('caches' in window) || !trackId) return null;

  try {
    // Return existing active Blob URL if still valid
    if (activeBlobUrls.has(trackId)) {
      return activeBlobUrls.get(trackId)!;
    }

    const cache = await caches.open(CACHE_NAME);
    const cacheKey = `https://zenify.cache/audio/${encodeURIComponent(trackId)}`;
    const match = await cache.match(cacheKey);

    if (!match) return null;

    const blob = await match.blob();
    // Validate that we have a real audio file (> 100 KB)
    if (!blob || blob.size < 100000) {
      await cache.delete(cacheKey);
      return null;
    }

    const blobUrl = URL.createObjectURL(blob);
    activeBlobUrls.set(trackId, blobUrl);
    updateLruList(trackId);
    return blobUrl;
  } catch (err) {
    console.debug('[AudioCache] Cache match error:', err);
    return null;
  }
}

/**
 * Proactively warm up recently played audio Blob URLs in memory on application startup.
 */
export async function warmupAudioCache(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const list = getLruList().slice(0, 5);
    if (!list.length) return;
    const cache = await caches.open(CACHE_NAME);
    for (const trackId of list) {
      if (activeBlobUrls.has(trackId)) continue;
      const cacheKey = `https://zenify.cache/audio/${encodeURIComponent(trackId)}`;
      const match = await cache.match(cacheKey);
      if (match) {
        const blob = await match.blob();
        if (blob && blob.size >= 100000) {
          activeBlobUrls.set(trackId, URL.createObjectURL(blob));
        }
      }
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  setTimeout(() => { warmupAudioCache().catch(() => {}); }, 2000);
}

/**
 * Asynchronously downloads and stores track audio in local CacheStorage.
 * Runs non-blockingly in the background while the user listens.
 */
export async function cacheTrackAudioInBackground(trackId: string, audioUrl: string): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window) || !trackId || !audioUrl) return;
  if (audioUrl.startsWith('blob:') || audioUrl.startsWith('data:')) return;
  if (audioUrl.includes('audio-ssl') || audioUrl.includes('mzstatic') || audioUrl.includes('itunes.apple.com')) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = `https://zenify.cache/audio/${encodeURIComponent(trackId)}`;

    // If already cached, don't download again
    const existing = await cache.match(cacheKey);
    if (existing) {
      updateLruList(trackId);
      return;
    }

    // Fetch the audio stream
    const res = await fetch(audioUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
    });

    if (!res.ok) return;

    const blob = await res.blob();
    if (blob.size < 100000) return; // Avoid caching error responses or incomplete fragments

    const contentType = blob.type || res.headers.get('content-type') || 'audio/mp4';
    const cacheResponse = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': blob.size.toString(),
        'x-zenify-cached-at': Date.now().toString(),
      }
    });

    await cache.put(cacheKey, cacheResponse);
    updateLruList(trackId);

    // Run eviction if cache is larger than MAX_CACHED_TRACKS
    await pruneCacheIfNeeded(cache);
  } catch (err) {
    // Background caching is opportunistic; quiet fail if offline or blocked
    console.debug('[AudioCache] Background caching skipped for track:', trackId, err);
  }
}

/**
 * Removes older tracks to keep local cache under storage limit
 */
async function pruneCacheIfNeeded(cache: Cache): Promise<void> {
  try {
    const lru = getLruList();
    if (lru.length <= MAX_CACHED_TRACKS) return;

    const toRemove = lru.slice(MAX_CACHED_TRACKS);
    const toKeep = lru.slice(0, MAX_CACHED_TRACKS);

    for (const id of toRemove) {
      const cacheKey = `https://zenify.cache/audio/${encodeURIComponent(id)}`;
      await cache.delete(cacheKey);
      if (activeBlobUrls.has(id)) {
        try {
          URL.revokeObjectURL(activeBlobUrls.get(id)!);
        } catch {}
        activeBlobUrls.delete(id);
      }
    }

    localStorage.setItem(LRU_STORAGE_KEY, JSON.stringify(toKeep));
  } catch {}
}

/**
 * Clears the entire local audio cache
 */
export async function clearAllAudioCache(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    for (const [, blobUrl] of activeBlobUrls) {
      try { URL.revokeObjectURL(blobUrl); } catch {}
    }
    activeBlobUrls.clear();
    await caches.delete(CACHE_NAME);
    localStorage.removeItem(LRU_STORAGE_KEY);
  } catch {}
}

