"use client";

import { get, set, del } from "idb-keyval";
import { LocalAudioMetadata, cleanWebTags, splitArtists } from "@/lib/id3Parser";
import { Track } from "@/store/player";
import { getApiBaseUrl } from "@/lib/utils";

const STORE_KEY_TRACKS = "zenify_local_library_tracks";
const STORE_KEY_FOLDERS = "zenify_local_library_folders";

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

    const existingCleanTitle = cleanWebTags(existing.title).toLowerCase().trim();
    const existingDuration = Math.round(existing.duration || 0);
    const durationDiff = Math.abs(existingDuration - newDuration);

    // 2. Normalized Title + Duration (within 3 seconds) or Title + Artist
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
  if (track.isMatched) return track;
  try {
    const cleanTitle = cleanWebTags(track.title);
    const cleanArtist = cleanWebTags(track.artist);
    const primaryArtist = splitArtists(cleanArtist)[0];

    const queriesToTry: string[] = [];

    if (primaryArtist && primaryArtist !== "Local Artist") {
      queriesToTry.push(`${cleanTitle} ${primaryArtist}`);
    }
    if (cleanArtist && cleanArtist !== "Local Artist" && cleanArtist !== primaryArtist) {
      queriesToTry.push(`${cleanTitle} ${cleanArtist}`);
    }
    if (cleanTitle) {
      queriesToTry.push(cleanTitle);
    }
    const strippedTitle = cleanTitle.replace(/^(?:\d{1,3}[\.\-\_\s]+)+/, "").trim();
    if (strippedTitle && strippedTitle !== cleanTitle) {
      queriesToTry.push(strippedTitle);
    }

    let match: any = null;

    for (const term of queriesToTry) {
      if (!term || term.length < 2) continue;
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=3`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const found = data.results.find((item: any) => 
          item.trackName?.toLowerCase().includes(strippedTitle.toLowerCase()) ||
          strippedTitle.toLowerCase().includes(item.trackName?.toLowerCase())
        ) || data.results[0];
        match = found;
        break;
      }
    }

    if (match) {
      const hdCover = match.artworkUrl100 ? match.artworkUrl100.replace('100x100bb', '600x600bb') : undefined;
      return {
        ...track,
        title: track.title || match.trackName,
        artist: (track.artist === "Local Artist" || !track.artist) ? match.artistName : track.artist,
        album: (track.album === track.folderName || !track.album) ? match.collectionName : track.album,
        matchedCoverUrl: hdCover,
        matchedArtistName: match.artistName,
        matchedAlbumName: match.collectionName,
        matchedGenre: match.primaryGenreName,
        matchedPreviewUrl: match.previewUrl,
        isMatched: true,
        coverUrl: track.coverUrl || hdCover
      };
    }
  } catch (e) {
    // Return original track on network error
  }
  return track;
}

/**
 * Storage Optimizer: Saves lightweight serialized metadata into IDB
 * Preserves local File handle for offline local playback while stripping expired transient session URLs
 */
export async function saveLocalLibrary(tracks: LocalAudioMetadata[]): Promise<void> {
  const serializableTracks = tracks.map(t => ({
    id: t.id,
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

  // 3. Fallback to matched iTunes 256kbps audio preview
  if (!resolvedAudioUrl && t.matchedPreviewUrl) {
    resolvedAudioUrl = t.matchedPreviewUrl;
  }

  // 4. Ultimate Fallback to backend ytdl stream
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
