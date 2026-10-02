"use client";

import { get, set, del, keys } from "idb-keyval";
import { LocalAudioMetadata } from "@/lib/id3Parser";
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

export async function saveLocalLibrary(tracks: LocalAudioMetadata[]): Promise<void> {
  const serializableTracks = tracks.map(t => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    folderPath: t.folderPath,
    folderName: t.folderName,
    duration: t.duration,
    coverUrl: t.coverUrl,
    sizeBytes: t.sizeBytes,
    lastModified: t.lastModified,
    fileName: t.file.name
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
      coverUrl: t.coverUrl,
      artists: []
    };

    existing.trackCount += 1;
    existing.totalDuration += t.duration;
    if (!existing.coverUrl && t.coverUrl) {
      existing.coverUrl = t.coverUrl;
    }
    if (t.artist && !existing.artists.includes(t.artist)) {
      existing.artists.push(t.artist);
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
}

/**
 * Convert LocalAudioMetadata to standard Zenify Track for PlayerStore
 */
export function convertLocalToZenifyTrack(t: LocalAudioMetadata): Track {
  return {
    id: t.id,
    title: t.title,
    artistId: `local-artist-${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
    artist: {
      id: `local-artist-${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      name: t.artist,
      bio: "Local Device Audio File"
    },
    artistName: t.artist,
    album: {
      id: `local-folder-${t.folderName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      title: t.folderName,
      artistId: `local-artist-${t.artist.toLowerCase().replace(/[^a-z0-9]/g, "-")}`
    },
    coverUrl: t.coverUrl || "https://res.cloudinary.com/dzqcuxchc/image/upload/v1779805544/zenify/brand/zenify_logo_purple_pink.png",
    audioUrl: t.audioUrl,
    duration: t.duration,
    genre: "Local Music"
  };
}
