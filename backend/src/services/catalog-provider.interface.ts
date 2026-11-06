export type ArtistRole = 'primary' | 'featured' | 'music' | 'singer' | 'lyricist' | 'starring';

export interface NormalizedArtistRef {
  id: string; // Canonical provider ID, e.g. "455663"
  name: string;
  role?: ArtistRole;
  imageUrl?: string;
}

export interface NormalizedTrack {
  id: string; // Canonical provider track ID, e.g. "AgeRwxTb"
  provider: string; // e.g. "jiosaavn"
  title: string;
  duration: number; // in seconds
  albumId?: string; // Canonical provider album ID, e.g. "34735026"
  albumTitle?: string;
  coverUrl: string;
  audioUrl?: string; // Pristine 320kbps CDN stream URL
  artists: NormalizedArtistRef[];
  primaryArtist: NormalizedArtistRef;
  language?: string;
  year?: number;
  releaseDate?: Date;
  copyright?: string;
  label?: string;
  playCount?: number;
  hasLyrics?: boolean;
  lyrics?: string;
  syncedLyrics?: any[];
  trackNumber?: number;
  genre?: string;
}

export interface NormalizedAlbum {
  id: string; // Canonical provider album ID, e.g. "34735026"
  provider: string; // e.g. "jiosaavn"
  title: string;
  coverUrl: string;
  releaseDate?: Date;
  year?: number;
  language?: string;
  genre?: string;
  copyright?: string;
  label?: string;
  trackCount?: number;
  songCount?: number;
  isSingle?: boolean;
  type?: string;
  subtitle?: string;
  description?: string;
  primaryArtist: NormalizedArtistRef;
  artists: NormalizedArtistRef[];
  tracks: NormalizedTrack[];
}

export interface NormalizedArtist {
  id: string; // Canonical provider artist ID, e.g. "455663"
  provider: string; // e.g. "jiosaavn"
  name: string;
  imageUrl?: string;
  coverUrl?: string;
  bio?: string;
  followerCount?: number;
  fanCount?: number;
  isVerified?: boolean;
  dob?: string;
  fb?: string;
  twitter?: string;
  wiki?: string;
  topSongs: NormalizedTrack[];
  albums: NormalizedAlbum[];
  singles: NormalizedAlbum[];
  dedicatedPlaylists?: any[];
  featuredInPlaylists?: any[];
  latestReleases?: any[];
  relatedArtists: NormalizedArtistRef[];
}

export interface ICatalogProvider {
  name: string;
  isAvailable(): boolean;
  getTrack(providerTrackId: string): Promise<NormalizedTrack | null>;
  getAlbum(providerAlbumId: string): Promise<NormalizedAlbum | null>;
  getArtist(providerArtistId: string): Promise<NormalizedArtist | null>;
  search(query: string, storefront?: string, limit?: number): Promise<{
    tracks: NormalizedTrack[];
    artists: NormalizedArtist[];
    albums: NormalizedAlbum[];
  }>;
  getTrending(language?: string, storefront?: string, limit?: number): Promise<NormalizedTrack[]>;
  getNewReleases(language?: string, storefront?: string, limit?: number): Promise<NormalizedTrack[]>;
  getArtistRadio(providerArtistId: string, limit?: number): Promise<NormalizedTrack[]>;
  getSongSuggestions(providerTrackId: string, limit?: number): Promise<NormalizedTrack[]>;
  getSearchHints?(query: string, storefront?: string): Promise<string[]>;
}

