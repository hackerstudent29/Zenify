import { useState } from 'react';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { usePlayerStore } from '@/store/player';
import { getMediaUrl } from '@/lib/utils';

export function useRefetchAudio() {
  const [isRefetching, setIsRefetching] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { currentTrack, setTrack } = usePlayerStore();

  const refetchTrackAudio = async (track: any, showToast?: (msg: string, type: 'success' | 'error') => void) => {
    if (!track?.id) return;
    if (isRefetching === track.id) return;

    setIsRefetching(track.id);
    if (showToast) {
      showToast(`Refetching verified audio for "${track.title}"...`, 'success');
    }

    try {
      // If it's a virtual external track not yet in DB, import it first
      let trackId = track.id;
      if (track.isVirtual || trackId.startsWith('itunes-') || trackId.startsWith('saavn-') || trackId.startsWith('sp-') || trackId.startsWith('yt-')) {
        const importRes = await api.post('/tracks/import-instant', {
          id: track.id,
          title: track.title,
          artistName: track.artist?.name || track.artistName || '',
          albumTitle: track.album?.title || '',
          duration: track.duration,
          coverUrl: track.coverUrl
        });
        if (importRes.data?.id) {
          trackId = importRes.data.id;
        }
      }

      const res = await api.post(`/tracks/${trackId}/refetch-audio`);
      if (res.data?.success && res.data.track) {
        const updated = res.data.track;

        // Invalidate queries so all lists and views update immediately
        queryClient.invalidateQueries({ queryKey: ['track', track.id] });
        queryClient.invalidateQueries({ queryKey: ['track', trackId] });
        queryClient.invalidateQueries({ queryKey: ['album'] });
        queryClient.invalidateQueries({ queryKey: ['playlist'] });
        queryClient.invalidateQueries({ queryKey: ['artist'] });

        // If the refetched track is currently playing, update audio seamlessly
        if (currentTrack?.id === track.id || currentTrack?.id === trackId) {
          const audioElement = document.querySelector('audio') as HTMLAudioElement | null;
          if (audioElement && updated.audioUrl) {
            const nextSrc = getMediaUrl(updated.audioUrl, 'audio');
            const wasPlaying = !audioElement.paused;
            const curTime = audioElement.currentTime;
            audioElement.src = nextSrc;
            audioElement.currentTime = curTime;
            if (wasPlaying) {
              audioElement.play().catch(() => {});
            }
          }
        }

        if (showToast) {
          showToast(`Full audio verified & refreshed! (${res.data.verified ? 'Verified Official' : 'Updated'})`, 'success');
        }
        return { success: true, track: updated };
      } else {
        throw new Error(res.data?.error || 'Could not verify replacement audio');
      }
    } catch (err: any) {
      console.error('[useRefetchAudio] Refetch error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to refetch audio';
      if (showToast) {
        showToast(errMsg, 'error');
      }
      return { success: false, error: errMsg };
    } finally {
      setIsRefetching(null);
    }
  };

  return {
    refetchTrackAudio,
    isRefetching
  };
}
