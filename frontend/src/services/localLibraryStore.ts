"use client";

import { get, set, del } from "idb-keyval";
import { LocalAudioMetadata, cleanWebTags, compressCoverBlob } from "@/lib/id3Parser";
import { Track } from "@/store/player";

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

export function getOrCreateAudioUrl(file: File): string {
  const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
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
 * Connects local track with online catalog (iTunes / Zenify API) for HD artwork, lyrics & artist info
 */
export async function enrichLocalTrackWithCatalog(track: LocalAudioMetadata): Promise<LocalAudioMetadata> {
  if (track.isMatched) return track;
  try {
    const cleanTitle = cleanWebTags(track.title);
    const cleanArtist = cleanWebTags(track.artist);
    const query = `${cleanTitle} ${cleanArtist === "Local Artist" ? "" : cleanArtist}`.trim();
    if (!query) return track;

    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const match = data.results[0];
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
 * Storage Optimizer: Saves lightweight serialized metadata into IDB (~0.5KB per track)
 * Eliminates storing raw audio file bytes or huge 5MB image blobs in browser storage
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
    matchedCoverUrl: t.matchedCoverUrl,
    matchedArtistName: t.matchedArtistName,
    matchedAlbumName: t.matchedAlbumName,
    matchedGenre: t.matchedGenre,
    isMatched: t.isMatched
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
 * Dynamically resolves audio URL on demand and connects with online catalog
 */
export function convertLocalToZenifyTrack(t: LocalAudioMetadata): Track {
  const displayArtist = t.matchedArtistName || t.artist || "Local Artist";
  const displayAlbum = t.matchedAlbumName || t.album || t.folderName;
  const displayCover = t.matchedCoverUrl || t.coverUrl || "https://res.cloudinary.com/dzqcuxchc/image/upload/v1779805544/zenify/brand/zenify_logo_purple_pink.png";

  const artistIdSlug = `artist-${encodeURIComponent(displayArtist.toLowerCase().replace(/[^a-z0-9]/g, "-"))}`;

  // Resolve dynamic transient audio URL from file handle if present
  let resolvedAudioUrl = t.audioUrl;
  if (t.file && (!resolvedAudioUrl || resolvedAudioUrl === "")) {
    resolvedAudioUrl = getOrCreateAudioUrl(t.file);
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
