"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/player";
import { audioEngine } from "@/lib/audio-engine";
import { getMediaUrl, getTrackCover } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function GlobalAudio() {
  const currentTrack = usePlayerStore(state => state.currentTrack);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const volume = usePlayerStore(state => state.volume);
  const audioFx = usePlayerStore(state => state.audioFx);
  const setCurrentTime = usePlayerStore(state => state.setCurrentTime);
  const setDuration = usePlayerStore(state => state.setDuration);
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying);
  const playNext = usePlayerStore(state => state.playNext);
  const playPrev = usePlayerStore(state => state.playPrev);

  const isSourceChanging = useRef(false);
  const importingTrackId = useRef<string | null>(null);
  const lastUpdateTime = useRef(0);
  const accumulatedSecondsRef = useRef(0);
  const queryClient = useQueryClient();

  const audioFxRef = useRef(audioFx);
  audioFxRef.current = audioFx;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // Initialize Audio Engine
  useEffect(() => {
    audioEngine.init();
    audioEngine.setVolume(volumeRef.current);
  }, []);

  // FX & Volume Sync
  useEffect(() => {
    audioEngine.resume(); // Ensure context is active on track change
    audioEngine.setVolume(volume);
    const eq = audioFx?.eq || [0, 0, 0];
    audioEngine.setEq(0, eq[0] ?? 0);
    audioEngine.setEq(1, eq[1] ?? 0);
    audioEngine.setEq(2, eq[2] ?? 0);
    audioEngine.toggle8D(audioFx?.is8D || false, audioFx?.direction8D || "clockwise", audioFx?.speed8D || 0.15);
    audioEngine.setPlaybackSpeed(audioFx?.speed || 1, audioFx?.pitch === 1);
    audioEngine.setReverb(audioFx?.reverb || "none");
    audioEngine.setReverbMix(audioFx?.reverb === 'none' || !audioFx?.reverb ? 0 : 0.6);
  }, [volume, audioFx, currentTrack?.id]);

  // Handle Events
  useEffect(() => {
    const audio = audioEngine.getActiveAudioElement();
    if (!audio) return;

    const syncTrackDuration = (duration: number) => {
      const track = usePlayerStore.getState().currentTrack;
      if (!track || isNaN(duration) || duration <= 0) return;
      
      const audioEl = audioEngine.getActiveAudioElement();
      if (!audioEl || isSourceChanging.current || audioEl.readyState === 0) return;
      if (audioEl.src && (audioEl.src.includes('apple.com') || audioEl.src.includes('itunes'))) return;

      const rounded = Math.round(duration);
      if (Math.abs((track.duration || 0) - rounded) > 1) {
        usePlayerStore.setState((state) => {
          const updatedCurrentTrack = state.currentTrack?.id === track.id
            ? { ...state.currentTrack, duration: rounded }
            : state.currentTrack;
          const updatedQueue = state.queue.map(t =>
            t.id === track.id ? { ...t, duration: rounded } : t
          );
          const updatedOriginalQueue = state.originalQueue.map(t =>
            t.id === track.id ? { ...t, duration: rounded } : t
          );
          return {
            currentTrack: updatedCurrentTrack,
            queue: updatedQueue,
            originalQueue: updatedOriginalQueue
          };
        });

        import("@/lib/api").then(({ default: api }) => {
          api.post(`tracks/${track.id}/update-duration`, { duration: rounded })
            .then(() => {
              if (queryClient) {
                queryClient.invalidateQueries({ queryKey: ['homepage-sections-v2'] });
                queryClient.invalidateQueries({ queryKey: ['homepage-sections-mobile-v2'] });
                queryClient.invalidateQueries({ queryKey: ['playlist'] });
                queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
                queryClient.invalidateQueries({ queryKey: ['library-overview'] });
                queryClient.invalidateQueries({ queryKey: ['search-live'] });
                queryClient.invalidateQueries({ queryKey: ['search-smart'] });
                queryClient.invalidateQueries({ queryKey: ['search-home'] });
                queryClient.invalidateQueries({ queryKey: ['tracks-explore'] });
                queryClient.invalidateQueries({ queryKey: ['track-detail'] });
              }
            })
            .catch((err) => console.warn("[DurationSync] Failed to correct track duration:", err));
        });
      }
    };

    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastUpdateTime.current > 150) {
        setCurrentTime(audio.currentTime);
        lastUpdateTime.current = now;
      }
      if (audio.duration && Number.isFinite(audio.duration)) {
        const isPreview = audio.src && (audio.src.includes('apple.com') || audio.src.includes('itunes'));
        if (!isPreview) {
          setDuration(audio.duration);
          syncTrackDuration(audio.duration);
        }
      }
    };

    const applyFx = () => {
      const currentFx = audioFxRef.current;
      const currentVol = volumeRef.current;
      audioEngine.resume();
      audioEngine.setVolume(currentVol);
      const eq = currentFx?.eq || [0, 0, 0];
      audioEngine.setEq(0, eq[0] ?? 0);
      audioEngine.setEq(1, eq[1] ?? 0);
      audioEngine.setEq(2, eq[2] ?? 0);
      audioEngine.toggle8D(currentFx?.is8D || false, currentFx?.direction8D || "clockwise", currentFx?.speed8D || 0.15);
      audioEngine.setPlaybackSpeed(currentFx?.speed || 1, currentFx?.pitch === 1);
      audioEngine.setReverb(currentFx?.reverb || "none");
      audioEngine.setReverbMix(currentFx?.reverb === 'none' || !currentFx?.reverb ? 0 : 0.6);
    };

    const handleEnded = () => playNext(false);
    const handleLoadedMetadata = () => {
      audioEngine.resume(); 
      applyFx();
      if (audio.duration && Number.isFinite(audio.duration)) {
        const isPreview = audio.src && (audio.src.includes('apple.com') || audio.src.includes('itunes'));
        if (!isPreview) {
          setDuration(audio.duration);
          syncTrackDuration(audio.duration);
        }
      }
      if (isPlaying) {
        audio.play().catch(err => {
          if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
          console.warn("Playback prevented or failed:", err);
          if (!isSourceChanging.current) setIsPlaying(false);
        });
      }
    };

    const handleAudioError = (e: any) => {
      if (isSourceChanging.current) return;
      const error = audio.error;
      if (!error || error.code === 0 || error.code === 4) return;
      console.error("❌ Audio Engine Error:", {
        code: error.code,
        message: error.message,
        src: audio.src
      });
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleAudioError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleAudioError);
    };
  }, [playNext, isPlaying, setIsPlaying, setCurrentTime, setDuration, queryClient]);

  // Media Session Implementation (Notification UI)
  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;

    const setMediaSessionMetadata = async (track: any) => {
      const artworkUrl = getTrackCover(track);
      const img = new Image();
      img.src = artworkUrl;
      
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist?.name || 'Unknown Artist',
        album: track.album?.title || 'Zenify Single',
        artwork: [
          { src: artworkUrl, sizes: '96x96', type: 'image/png' },
          { src: artworkUrl, sizes: '128x128', type: 'image/png' },
          { src: artworkUrl, sizes: '192x192', type: 'image/png' },
          { src: artworkUrl, sizes: '256x256', type: 'image/png' },
          { src: artworkUrl, sizes: '384x384', type: 'image/png' },
          { src: artworkUrl, sizes: '512x512', type: 'image/png' }
        ]
      });
    };

    setMediaSessionMetadata(currentTrack);

    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext(true));
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        const audio = audioEngine.getActiveAudioElement();
        if (audio) audio.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [currentTrack, setIsPlaying, playPrev, playNext, setCurrentTime]);

  // Source & Playback Sync
  useEffect(() => {
    const audio = audioEngine.getActiveAudioElement();
    if (!audio) return;
    
    if (!currentTrack) {
      if (!audio.paused) audio.pause();
      audio.src = '';
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
      return;
    }

    const loadAudio = async () => {
      const isPreviewOrSpotify = currentTrack.audioUrl ? (
        currentTrack.audioUrl.includes('itunes.apple.com') || 
        currentTrack.audioUrl.includes('mzstatic.com') || 
        currentTrack.audioUrl.startsWith('spotify:') ||
        currentTrack.audioUrl.includes('spotify.com')
      ) : false;

      let targetSrc = isPreviewOrSpotify ? undefined : getMediaUrl(currentTrack.audioUrl, 'audio');

      if (!targetSrc) {
        if (importingTrackId.current === currentTrack.id) return;
        importingTrackId.current = currentTrack.id;
        console.log(`[GlobalAudio] Track "${currentTrack.title}" has no audioUrl, resolving dynamically...`);
        
        try {
          const api = (await import("@/lib/api")).default;
          const payload = {
            title: currentTrack.title,
            artistName: currentTrack.artist?.name || 'Unknown Artist',
            albumTitle: currentTrack.album?.title,
            duration: currentTrack.duration,
          };
          const res = await api.post('/tracks/import-instant', payload);
          
          if (res.data && res.data.audioUrl) {
            targetSrc = getMediaUrl(res.data.audioUrl, 'audio');
            
            usePlayerStore.setState(state => ({
              currentTrack: state.currentTrack?.id === currentTrack.id ? { ...state.currentTrack, ...res.data } : state.currentTrack,
              queue: state.queue.map(t => t.id === currentTrack.id ? { ...t, ...res.data } : t),
              originalQueue: state.originalQueue.map(t => t.id === currentTrack.id ? { ...t, ...res.data } : t)
            }));
          }
        } catch (err) {
          console.error("[GlobalAudio] Failed to instantly import shell track:", err);
        } finally {
          if (importingTrackId.current === currentTrack.id) {
            importingTrackId.current = null;
          }
        }
      }

      if (targetSrc) {
        const normalizedCur = audio.src ? new URL(audio.src, window.location.origin).toString() : '';
        const normalizedNext = new URL(targetSrc, window.location.origin).toString();

        if (normalizedCur !== normalizedNext) {
          isSourceChanging.current = true;
          audio.src = targetSrc;
          audio.load();
          setTimeout(() => { isSourceChanging.current = false; }, 800);
        }
      } else {
        console.warn("[GlobalAudio] Track is unplayable. Skipping to next.");
        playNext(true);
        return;
      }

      if (isPlaying) {
        audioEngine.resume();
        if (!isSourceChanging.current && audio.paused) {
          audio.play().catch(err => {
            if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
            console.warn("Sync Play failed:", err);
            setIsPlaying(false);
          });
        }
      } else {
        if (!audio.paused && !isSourceChanging.current) audio.pause();
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      }
    };

    loadAudio();
  }, [currentTrack?.id, currentTrack?.audioUrl, isPlaying, setIsPlaying, playNext]);

  // Analytics Reporting
  useEffect(() => {
    if (!currentTrack || !isPlaying) return;

    const reportTimeout = setTimeout(async () => {
      try {
        const api = (await import("@/lib/api")).default;
        await api.post(`tracks/${currentTrack.id}/play`);
        if (queryClient) queryClient.invalidateQueries({ queryKey: ['artist', 'search-home', 'tracks'] });
      } catch (err) {
        console.error("[Playback] Failed to report play:", err);
      }
    }, 5000);

    return () => clearTimeout(reportTimeout);
  }, [currentTrack?.id, isPlaying, queryClient]);

  // Heartbeat Tracking
  useEffect(() => {
    if (!currentTrack) return;
    const trackId = currentTrack.id;

    const flushHeartbeat = async (id: string, duration: number) => {
      if (duration <= 0) return;
      try {
        const api = (await import("@/lib/api")).default;
        const progress = audioEngine.getActiveAudioElement()?.currentTime || 0;
        await api.post(`tracks/${id}/heartbeat`, { duration, progress });
      } catch (err) {
        console.error("[Playback] Batched heartbeat failed:", err);
      }
    };

    if (!isPlaying) {
      const leftOver = accumulatedSecondsRef.current;
      if (leftOver > 0) {
        flushHeartbeat(trackId, leftOver);
        accumulatedSecondsRef.current = 0;
      }
      return;
    }

    const localTick = setInterval(() => {
      accumulatedSecondsRef.current += 1;
      if (accumulatedSecondsRef.current >= 10) {
        const toSend = accumulatedSecondsRef.current;
        accumulatedSecondsRef.current = 0;
        flushHeartbeat(trackId, toSend);
      }
    }, 1000);

    return () => {
      clearInterval(localTick);
      const leftOver = accumulatedSecondsRef.current;
      if (leftOver > 0) {
        flushHeartbeat(trackId, leftOver);
        accumulatedSecondsRef.current = 0;
      }
    };
  }, [currentTrack?.id, isPlaying]);

  // Poll Background Import Swap
  useEffect(() => {
    if (!currentTrack || !currentTrack.id) return;
    
    const isR2OrCloudinary = currentTrack.audioUrl && (
      currentTrack.audioUrl.includes('r2.dev') ||
      currentTrack.audioUrl.includes('res.cloudinary.com') ||
      currentTrack.audioUrl.startsWith('uploads/') ||
      currentTrack.audioUrl.startsWith('/uploads')
    );
    
    const needsUpdate = !isR2OrCloudinary || !currentTrack.synced_lyrics;
    if (!needsUpdate) return;

    const interval = setInterval(async () => {
      try {
        const api = (await import("@/lib/api")).default;
        const res = await api.get(`/tracks/${currentTrack.id}`);
        if (res.data) {
          const updated = res.data;
          
          const gotR2 = updated.audioUrl && (
            updated.audioUrl.includes('r2.dev') ||
            updated.audioUrl.includes('res.cloudinary.com') ||
            updated.audioUrl.startsWith('uploads/') ||
            updated.audioUrl.startsWith('/uploads')
          );
          
          const hasNewLyrics = updated.synced_lyrics && !currentTrack.synced_lyrics;
          const hasNewAudio = gotR2 && (updated.audioUrl !== currentTrack.audioUrl);

          if (hasNewAudio || hasNewLyrics) {
            console.log(`[GlobalAudio] Detected background update for track "${currentTrack.title}". Updating player store...`);
            
            usePlayerStore.setState(state => {
              if (state.currentTrack?.id !== currentTrack.id) return {};
              
              const mergedTrack = { 
                ...state.currentTrack, 
                audioUrl: updated.audioUrl,
                synced_lyrics: updated.synced_lyrics || state.currentTrack.synced_lyrics,
                raw_lrc: updated.raw_lrc || state.currentTrack.raw_lrc,
                lyrics: updated.lyrics || state.currentTrack.lyrics,
              };

              return {
                currentTrack: mergedTrack,
                queue: state.queue.map(t => t.id === currentTrack.id ? { ...t, ...mergedTrack } : t),
                originalQueue: state.originalQueue.map(t => t.id === currentTrack.id ? { ...t, ...mergedTrack } : t)
              };
            });

            if (hasNewAudio) {
              const audio = audioEngine.getActiveAudioElement();
              if (audio) {
                const targetSrc = getMediaUrl(updated.audioUrl, 'audio');
                if (targetSrc) {
                  const wasPlaying = usePlayerStore.getState().isPlaying;
                  const currentTime = audio.currentTime;
                  
                  isSourceChanging.current = true;
                  audio.src = targetSrc;
                  audio.load();
                  
                  const onMetadata = () => {
                    audio.currentTime = currentTime;
                    if (wasPlaying) {
                      audio.play().catch(() => {});
                    }
                    audio.removeEventListener('loadedmetadata', onMetadata);
                  };
                  audio.addEventListener('loadedmetadata', onMetadata);
                  
                  setTimeout(() => { isSourceChanging.current = false; }, 800);
                }
              }
            }

            if (queryClient) {
              queryClient.invalidateQueries({ queryKey: ['lyrics', currentTrack.id] });
              queryClient.invalidateQueries({ queryKey: ['track-detail', currentTrack.id] });
            }
          }
          
          if (gotR2 && updated.synced_lyrics) {
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.warn("[GlobalAudio] Failed to poll track background update:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [currentTrack?.id, currentTrack?.audioUrl, !!currentTrack?.synced_lyrics, queryClient]);

  return null;
}
