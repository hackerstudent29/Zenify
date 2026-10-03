"use client";

import { get, set, del } from "idb-keyval";
import { LocalAudioMetadata, cleanWebTags, cleanSongTitle, splitArtists } from "@/lib/id3Parser";
import { Track } from "@/store/player";
import { getApiBaseUrl } from "@/lib/utils";

const STORE_KEY_TRACKS = "zenify_local_library_tracks";
const STORE_KEY_FOLDERS = "zenify_local_library_folders";

/**
 * Parallel Worker Pool Executor
 * Executes `taskFn` on items in `items` with controlled concurrency limit `concurrency`.
 * Reports real-time progress via `onProgress(completedCount, totalCount, activeWorkers)`.
 */
export async function runParallelWorkerPool<T, R>(
  items: T[],
  taskFn: (item: T, index: number) => Promise<R>,
  concurrency = 12,
  onProgress?: (completedCount: number, totalCount: number, activeWorkers: number) => void
): Promise<R[]> {
  if (!items || items.length === 0) return [];
  
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completedCount = 0;
  let activeWorkers = 0;

  return new Promise((resolve) => {
    const worker = async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        activeWorkers++;
        try {
          results[currentIndex] = await taskFn(items[currentIndex], currentIndex);
        } catch (err) {
          console.warn(`Worker task failed at index ${currentIndex}:`, err);
        } finally {
          activeWorkers--;
          completedCount++;
          if (onProgress) {
            onProgress(completedCount, items.length, activeWorkers);
          }
        }
      }
    };

    const poolSize = Math.min(concurrency, items.length);
    const workerPromises = Array.from({ length: poolSize }, () => worker());

    Promise.all(workerPromises).then(() => resolve(results));
  });
}

export interface LocalFolderGroup {
  path: string;
  name: string;
  trackCount: number;
  totalDuration: number;
  coverUrl?: string;
  artists: string[];
}

/**
 * Storage Optimizer: Dynamic Audio Blob URL Registry & Revoker
 * Prevents memory leaks by tracking active object URLs and revoking old ones
 */
const activeAudioObjectUrls = new Map<string, string>();

export function getOrCreateAudioUrl(file: File | Blob): string {
  if (!file) return "";
  const name = (file as File).name || "local-audio-blob";
  const size = file.size || 0;
  const lastModified = (file as File).lastModified || 0;
  const fileKey = `${name}-${size}-${lastModified}`;
  
  let existing = activeAudioObjectUrls.get(fileKey);
  if (!existing) {
    existing = URL.createObjectURL(file);
    activeAudioObjectUrls.set(fileKey, existing);
  }
  return existing;
}

export function revokeAudioUrl(fileKey: string): void {
  const existing = activeAudioObjectUrls.get(fileKey);
  if (existing) {
    URL.revokeObjectURL(existing);
    activeAudioObjectUrls.delete(fileKey);
  }
}

/**
 * 100% Sureshot Duplicate Detector
 * Checks if a track already exists in Zenify local library by comparing:
 * 1. Exact file ID (file name + size + lastModified)
 * 2. Normalized Title + Duration (within ±3s) or Title + Artist match
 */
export function isDuplicateTrack(existingTracks: LocalAudioMetadata[], newTrack: LocalAudioMetadata): { isDuplicate: boolean; matchedTrack?: LocalAudioMetadata } {
  const newCleanTitle = cleanWebTags(newTrack.title).toLowerCase().trim();
  const newCleanArtist = cleanWebTags(newTrack.artist).toLowerCase().trim();
  const newDuration = Math.round(newTrack.duration || 0);

  for (const existing of existingTracks) {
    // 1. Exact ID match
    if (existing.id === newTrack.id) {
      return { isDuplicate: true, matchedTrack: existing };
    }

    // 2. Cloud Track ID match
    if (newTrack.cloudTrackId && existing.cloudTrackId === newTrack.cloudTrackId) {
      return { isDuplicate: true, matchedTrack: existing };
    }

    const existingCleanTitle = cleanWebTags(existing.title).toLowerCase().trim();
    const existingDuration = Math.round(existing.duration || 0);
    const durationDiff = Math.abs(existingDuration - newDuration);

    // 3. Normalized Title + Duration (within 3 seconds) or Title + Artist
    if (newCleanTitle.length > 2 && existingCleanTitle === newCleanTitle) {
      const existingCleanArtist = cleanWebTags(existing.artist).toLowerCase().trim();
      const sameArtist = (newCleanArtist !== "local artist" && existingCleanArtist === newCleanArtist);
      if (durationDiff <= 3 || sameArtist) {
        return { isDuplicate: true, matchedTrack: existing };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Connects local track with online catalog (iTunes / Zenify API) for HD artwork, lyrics & artist info
 * Multi-Stage Fallback Strategy: Title + Primary Artist -> Title + Clean Artist -> Title Only -> Stripped Title
 */
export async function enrichLocalTrackWithCatalog(track: LocalAudioMetadata): Promise<LocalAudioMetadata> {
  const userCleanTitle = cleanSongTitle(track.title);
  const cleanArtist = cleanWebTags(track.artist);
  const localDuration = Math.round(track.duration || 0);

  if (track.isMatched) {
    return {
      ...track,
      title: userCleanTitle
    };
  }

  try {
    const primaryArtist = splitArtists(cleanArtist)[0];

    const queriesToTry: string[] = [];

    if (primaryArtist && primaryArtist !== "Local Artist") {
      queriesToTry.push(`${userCleanTitle} ${primaryArtist}`);
    }
    if (cleanArtist && cleanArtist !== "Local Artist" && cleanArtist !== primaryArtist) {
      queriesToTry.push(`${userCleanTitle} ${cleanArtist}`);
    }
    if (userCleanTitle) {
      queriesToTry.push(userCleanTitle);
    }

    let match: any = null;

    for (const term of queriesToTry) {
      if (!term || term.length < 2) continue;
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        // STRICT Duration Verification (+-6 seconds)
        const validMatch = data.results.find((item: any) => {
          if (!item.trackTimeMillis) return false;
          const itunesDurationSec = item.trackTimeMillis / 1000;
          const durationDiff = Math.abs(localDuration - itunesDurationSec);

          if (localDuration > 0 && durationDiff > 6) {
            return false;
          }

          const itemTitle = item.trackName?.toLowerCase() || "";
          const searchTitle = userCleanTitle.toLowerCase();
          return itemTitle.includes(searchTitle) || searchTitle.includes(itemTitle);
        });

        if (validMatch) {
          match = validMatch;
          break;
        }
      }
    }

    if (match) {
      const hdCover = match.artworkUrl100 ? match.artworkUrl100.replace('100x100bb', '600x600bb') : undefined;
      const pureArtist = match.artistName || cleanArtist;
      const pureAlbum = match.collectionName || track.album;
      return {
        ...track,
        title: userCleanTitle, // NEVER OVERWRITE USER SONG TITLE!
        artist: pureArtist,
        album: pureAlbum,
        matchedCoverUrl: hdCover,
        matchedArtistName: match.artistName,
        matchedAlbumName: match.collectionName,
        matchedGenre: match.primaryGenreName,
        matchedPreviewUrl: match.previewUrl,
        isMatched: true,
        coverUrl: hdCover || track.coverUrl
      };
    }
  } catch (e) {
    // Return original track on network error
  }
  return {
    ...track,
    title: userCleanTitle,
    artist: cleanArtist
  };
}

/**
 * Saves/registers an imported or catalog-matched local track into Zenify Cloud DB
 * Upgrades cover art to HD (600x600), fetches synced lyrics, and preserves local device audio track.
 */
export async function saveTrackToCloudDB(track: LocalAudioMetadata): Promise<LocalAudioMetadata> {
  // 0. If track is already saved to Cloud DB with valid cloudTrackId, return directly
  if (track.isSavedToCloud && track.cloudTrackId) {
    return track;
  }

  const userCleanTitle = cleanSongTitle(track.title);
  const pureArtist = track.matchedArtistName || cleanWebTags(track.artist) || "Local Artist";
  const pureAlbum = track.matchedAlbumName || track.album || "Local Album";
  const localDuration = Math.round(track.duration || 0);
  let coverUrl = track.matchedCoverUrl || track.coverUrl;

  try {
    const api = (await import("@/lib/api")).default;

    // 1. Upgrade cover art to HD 600x600 if missing or low resolution, verifying duration (+-6s)
    if (!coverUrl || coverUrl.includes('100x100bb') || coverUrl.includes('logo.png')) {
      try {
        const query = `${userCleanTitle} ${pureArtist === "Local Artist" ? "" : pureArtist}`.trim();
        const searchRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=3`);
        const searchData = await searchRes.json();
        if (searchData.results && searchData.results.length > 0) {
          const matchedResult = searchData.results.find((item: any) => {
            if (!item.trackTimeMillis || !localDuration) return false;
            return Math.abs(localDuration - item.trackTimeMillis / 1000) <= 6;
          });

          if (matchedResult && matchedResult.artworkUrl100) {
            coverUrl = matchedResult.artworkUrl100.replace('100x100bb', '600x600bb');
          }
        }
      } catch (e) {
        // Fallback to existing cover
      }
    }

    let cloudTrackId: string | undefined = undefined;
    let finalCoverUrl = coverUrl || track.coverUrl;

    if (track.file) {
      console.log(`[CloudDBSync] Uploading full local audio binary for "${userCleanTitle}" to Zenify Cloud DB / R2...`);
      const formData = new FormData();
      formData.append('audio', track.file);
      formData.append('title', userCleanTitle);
      formData.append('artistName', pureArtist);
      formData.append('albumTitle', pureAlbum);
      if (finalCoverUrl) formData.append('coverUrl', finalCoverUrl);
      formData.append('duration', String(localDuration));
      formData.append('importedBy', track.importedBy || "Zenify User");
      formData.append('importedAt', track.importedAt || new Date().toISOString());

      const res = await api.post('/tracks/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      cloudTrackId = res.data?.id;
      if (res.data?.coverUrl) finalCoverUrl = res.data.coverUrl;
    } else {
      const payload = {
        title: userCleanTitle,
        artistName: pureArtist,
        albumTitle: pureAlbum,
        coverUrl: finalCoverUrl,
        duration: localDuration,
        audioUrl: track.audioUrl,
        importedBy: track.importedBy || "Zenify User",
        importedAt: track.importedAt || new Date().toISOString(),
      };

      const res = await api.post('/tracks/import-instant', payload);
      cloudTrackId = res.data?.id;
      if (res.data?.coverUrl) finalCoverUrl = res.data.coverUrl;
    }

    if (cloudTrackId) {
      // 2. Automatically fetch synced lyrics for songs missing lyrics in Cloud DB
      api.post('/metadata/sync-lyrics', {
        trackId: cloudTrackId,
        title: userCleanTitle,
        artist: pureArtist,
        duration: localDuration
      }).catch((err) => console.warn("[AutoLyrics] Background lyrics fetch deferred:", err));

      return {
        ...track,
        title: userCleanTitle, // ALWAYS PRESERVE USER SONG TITLE
        artist: pureArtist,
        album: pureAlbum,
        cloudTrackId,
        isSavedToCloud: true,
        coverUrl: finalCoverUrl || track.coverUrl,
        matchedCoverUrl: finalCoverUrl || track.coverUrl,
        matchedArtistName: pureArtist,
        matchedAlbumName: pureAlbum,
        isMatched: true
      };
    }
  } catch (err) {
    console.warn("[CloudDBSync] Failed to save track to Zenify cloud DB:", userCleanTitle, err);
  }
  return {
    ...track,
    title: userCleanTitle,
    artist: pureArtist
  };
}

/**
 * Storage Optimizer: Saves lightweight serialized metadata into IDB
 * Preserves local File handle for offline local playback while stripping expired transient session URLs
 */
export async function saveLocalLibrary(tracks: LocalAudioMetadata[]): Promise<void> {
  const serializableTracks = tracks.map(t => ({
    id: t.id,
    cloudTrackId: t.cloudTrackId,
    isSavedToCloud: t.isSavedToCloud,
    title: t.title,
    artist: t.artist,
    album: t.album,
    folderPath: t.folderPath,
    folderName: t.folderName,
    duration: t.duration,
    coverUrl: t.coverUrl || t.matchedCoverUrl,
    sizeBytes: t.sizeBytes,
    lastModified: t.lastModified,
    importedBy: t.importedBy || "Zenify User",
    importedAt: t.importedAt || new Date().toISOString(),
    importedTimings: t.importedTimings || {
      timestamp: Date.now(),
      isoDate: new Date().toISOString(),
      durationSeconds: t.duration || 0
    },
    importedUserDetails: t.importedUserDetails,
    matchedCoverUrl: t.matchedCoverUrl,
    matchedArtistName: t.matchedArtistName,
    matchedAlbumName: t.matchedAlbumName,
    matchedGenre: t.matchedGenre,
    matchedPreviewUrl: t.matchedPreviewUrl,
    isMatched: t.isMatched,
    file: t.file // Persist local File handle in IDB for instant playback
  }));

  await set(STORE_KEY_TRACKS, serializableTracks);

  // Derive Folder Groups
  const folderMap = new Map<string, LocalFolderGroup>();

  tracks.forEach(t => {
    const existing = folderMap.get(t.folderPath) || {
      path: t.folderPath,
      name: t.folderName,
      trackCount: 0,
      totalDuration: 0,
      coverUrl: t.matchedCoverUrl || t.coverUrl,
      artists: []
    };

    existing.trackCount += 1;
    existing.totalDuration += t.duration;
    if (!existing.coverUrl && (t.matchedCoverUrl || t.coverUrl)) {
      existing.coverUrl = t.matchedCoverUrl || t.coverUrl;
    }
    const artistName = t.matchedArtistName || t.artist;
    if (artistName && !existing.artists.includes(artistName)) {
      existing.artists.push(artistName);
    }

    folderMap.set(t.folderPath, existing);
  });

  await set(STORE_KEY_FOLDERS, Array.from(folderMap.values()));
}

export async function getSavedLocalTracks(): Promise<any[]> {
  const tracks = await get(STORE_KEY_TRACKS);
  return tracks || [];
}

export async function getSavedLocalFolders(): Promise<LocalFolderGroup[]> {
  const folders = await get(STORE_KEY_FOLDERS);
  return folders || [];
}

export async function clearSavedLocalLibrary(): Promise<void> {
  await del(STORE_KEY_TRACKS);
  await del(STORE_KEY_FOLDERS);
  // Clear active object URLs
  activeAudioObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeAudioObjectUrls.clear();
}

/**
 * Converts local audio track to standard Zenify Track for PlayerStore
 * Dynamically resolves audio URL on demand with 0ms local file playback priority
 */
export function convertLocalToZenifyTrack(t: LocalAudioMetadata): Track {
  const displayArtist = t.matchedArtistName || t.artist || "Local Artist";
  const displayAlbum = t.matchedAlbumName || t.album || t.folderName;
  const displayCover = t.matchedCoverUrl || t.coverUrl || "https://res.cloudinary.com/dzqcuxchc/image/upload/v1779805544/zenify/brand/zenify_logo_purple_pink.png";

  const artistIdSlug = `artist-${encodeURIComponent(displayArtist.toLowerCase().replace(/[^a-z0-9]/g, "-"))}`;

  let resolvedAudioUrl = "";

  // 1. If we have a local File or Blob handle, ALWAYS get/create a fresh live object URL for current window session
  if (t.file) {
    try {
      resolvedAudioUrl = getOrCreateAudioUrl(t.file);
    } catch (e) {
      console.warn("Failed to generate object URL from file handle:", e);
    }
  }

  // 2. If t.audioUrl is a valid HTTP URL (e.g. cloud CDN, proxy) and no file handle, use t.audioUrl
  if (!resolvedAudioUrl && t.audioUrl && t.audioUrl.startsWith("http")) {
    resolvedAudioUrl = t.audioUrl;
  }

  // 3. Fallback to backend ytdl stream for full 100% audio
  if (!resolvedAudioUrl) {
    const searchTerms = `${displayArtist === "Local Artist" ? "" : displayArtist} ${t.title}`.trim();
    const apiBase = getApiBaseUrl();
    resolvedAudioUrl = `${apiBase}/utils/stream-youtube?url=${encodeURIComponent(searchTerms)}`;
  }

  return {
    id: t.id,
    title: t.title,
    artistId: artistIdSlug,
    artist: {
      id: artistIdSlug,
      name: displayArtist,
      bio: t.isMatched ? "Zenify Matched Local Audio Track" : "Local Device Audio File"
    },
    artistName: displayArtist,
    album: {
      id: `album-${encodeURIComponent(displayAlbum.toLowerCase().replace(/[^a-z0-9]/g, "-"))}`,
      title: displayAlbum,
      coverUrl: displayCover,
      artistId: artistIdSlug
    },
    coverUrl: displayCover,
    audioUrl: resolvedAudioUrl,
    duration: t.duration,
    genre: t.matchedGenre || "Local Music"
  };
}
