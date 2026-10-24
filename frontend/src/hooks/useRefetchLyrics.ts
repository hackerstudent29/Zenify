import { useState } from 'react';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { usePlayerStore } from '@/store/player';

export type LyricsProvider =
  | 'auto'
  | 'deepgram'
  | 'lrclib'
  | 'spotify'
  | 'musixmatch'
  | 'genius'
  | 'azlyrics'
  | 'youtube'
  | 'ai_align';

export interface LyricsProviderOption {
  id: LyricsProvider;
  label: string;
  icon: string;
  description: string;
}

export const LYRICS_PROVIDERS: LyricsProviderOption[] = [
  { id: 'auto', label: 'Auto (Best Quality)', icon: '⚡', description: 'Automatically probe best provider' },
  { id: 'deepgram', label: 'Deepgram (AI Sync)', icon: '🎙️', description: 'Real-time AI word-level timestamp alignment' },
  { id: 'lrclib', label: 'LRCLIB (LRC Community)', icon: '🎵', description: 'High-precision community synced LRC' },
  { id: 'spotify', label: 'Spotify (Official)', icon: '🟢', description: 'Official synced lines & timings' },
  { id: 'musixmatch', label: 'Musixmatch (RichSync)', icon: '🎶', description: 'RichSync & karaoke line timestamps' },
  { id: 'genius', label: 'Genius (Annotated)', icon: '📜', description: 'Verified official original lyrics' },
  { id: 'azlyrics', label: 'AZLyrics (Archived)', icon: '🌐', description: 'Clean formatted plain text stanzas' },
  { id: 'youtube', label: 'YouTube Captions', icon: '📺', description: 'Auto-generated & official video subtitles' },
  { id: 'ai_align', label: 'AI Acoustic Aligner', icon: '✨', description: 'Audio-to-text boundary synchronization' },
];

export function useRefetchLyrics() {
  const [isRefetching, setIsRefetching] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { currentTrack } = usePlayerStore();

  const refetchTrackLyrics = async (
    track: any,
    provider: LyricsProvider = 'auto',
    showToast?: (msg: string, type: 'success' | 'error') => void
  ) => {
    if (!track?.id) return;
    if (isRefetching === track.id) return;

    setIsRefetching(track.id);
    const providerObj = LYRICS_PROVIDERS.find(p => p.id === provider) || LYRICS_PROVIDERS[0];
    if (showToast) {
      showToast(`Fetching lyrics via ${providerObj.label} for "${track.title}"...`, 'success');
    }

    try {
      let trackId = track.id;
      if (track.isVirtual || trackId.startsWith('jiosaavn-') || trackId.startsWith('saavn-') || trackId.startsWith('itunes-') || trackId.startsWith('sp-') || trackId.startsWith('yt-')) {
        const artistName = track.artist?.name || (typeof track.artist === 'string' ? track.artist : '') || track.artistName || '';
        const albumTitle = track.album?.title || (typeof track.album === 'string' ? track.album : '') || '';
        const importRes = await api.post('/tracks/import-instant', {
          id: track.id,
          title: track.title,
          artistName,
          albumTitle,
          duration: track.duration,
          coverUrl: track.coverUrl
        });
        if (importRes.data?.id) {
          trackId = importRes.data.id;
        }
      }

      const res = await api.post(`/tracks/${trackId}/refetch-lyrics`, { provider });
      if (res.data?.success && res.data.track) {
        const updated = res.data.track;

        // Invalidate lyrics and track queries across TanStack query cache
        queryClient.invalidateQueries({ queryKey: ['lyrics'] });
        queryClient.invalidateQueries({ queryKey: ['track', track.id] });
        queryClient.invalidateQueries({ queryKey: ['track', trackId] });

        // Update player store currentTrack if this track is currently active
        if (currentTrack?.id === track.id || currentTrack?.id === trackId) {
          usePlayerStore.setState((state) => {
            if (!state.currentTrack) return state;
            return {
              currentTrack: {
                ...state.currentTrack,
                lyrics: updated.lyrics || state.currentTrack.lyrics,
                synced_lyrics: updated.synced_lyrics || state.currentTrack.synced_lyrics,
                raw_lrc: updated.raw_lrc || state.currentTrack.raw_lrc,
                romanizedLyrics: updated.romanizedLyrics || null,
                romanizedSyncedLyrics: updated.romanizedSyncedLyrics || null,
                romanizedLang: updated.romanizedLang || null,
              }
            };
          });
        }

        if (showToast) {
          showToast(`Lyrics successfully updated (${res.data.provider?.toUpperCase() || 'Verified'})!`, 'success');
        }
        return { success: true, track: updated };
      } else {
        throw new Error(res.data?.error || 'Could not fetch lyrics from provider');
      }
    } catch (err: any) {
      console.error('[useRefetchLyrics] Error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to refetch lyrics';
      if (showToast) {
        showToast(errMsg, 'error');
      }
      return { success: false, error: errMsg };
    } finally {
      setIsRefetching(null);
    }
  };

  return {
    refetchTrackLyrics,
    isRefetching,
    providers: LYRICS_PROVIDERS,
  };
}
