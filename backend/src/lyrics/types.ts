export type SyncLevel = 'word' | 'line' | 'plain' | 'ai-word' | 'ai-line';

export interface LyricsWord {
  startMs: number;
  endMs: number;
  text: string;
}

export interface LyricsLine {
  startMs: number;
  endMs: number;
  text: string;
  words?: LyricsWord[];
  isBackground?: boolean;
  agent?: string;
}

export interface LyricsDoc {
  syncLevel: SyncLevel;
  language?: string;
  script?: string;
  instrumental: boolean;
  aiGenerated: boolean;
  aiSynced: boolean; // provider byModel
  providerId: string;
  providerRef?: string;
  lines: LyricsLine[];
}

export interface TrackMetadataQuery {
  trackId?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number; // in seconds
  isrc?: string;
  language?: string;
  providerId?: string;
}

export interface LyricsProvider {
  id: string;
  tier: 'W' | 'L' | 'P' | 'A';
  supports(track: TrackMetadataQuery): boolean;
  fetch(query: TrackMetadataQuery, signal?: AbortSignal): Promise<LyricsDoc | null>;
}

