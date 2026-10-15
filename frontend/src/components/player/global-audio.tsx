"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/player";
import { useAuthStore } from "@/store/authStore";
import { audioEngine } from "@/lib/audio-engine";
import { getMediaUrl, getTrackCover } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/ui";

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
  const queue = usePlayerStore(state => state.queue);

  const playbackSessionIdRef = useRef(0);
  const isSwitchingTrackRef = useRef(false);
  const currentPlayingTrackIdRef = useRef<string | null>(null);
  const isSourceChanging = useRef(false);
  const currentTrackIdRef = useRef<string | null>(null);
  const currentTrackTitleRef = useRef<string | null>(null);
  const currentTrackArtistRef = useRef<string | null>(null);
  const importingTrackId = useRef<string | null>(null);
  const lastUpdateTime = useRef(0);
  const accumulatedSecondsRef = useRef(0);
  const isCrossfadingRef = useRef(false);
  const queryClient = useQueryClient();

  const audioFxRef = useRef(audioFx);
  audioFxRef.current = audioFx;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const prefetchedTrackIds = useRef<Set<string>>(new Set());
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioRecoveryAttempts = useRef<Record<string, number>>({});

  // Initialize Audio Engine & Background Resilience Listeners
  useEffect(() => {
    audioEngine.init();
    audioEngine.setVolume(volumeRef.current);

    const handleVisibilitySync = () => {
      audioEngine.resume();
      const audio = audioEngine.getActiveAudioElement();
      if (audio && usePlayerStore.getState().isPlaying && audio.paused) {
        audio.play().catch(err => {
          if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener('focus', handleVisibilitySync);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.removeEventListener('focus', handleVisibilitySync);
    };
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

        // Smooth Swaps (Crossfade) Handler
        const crossfadeActive = useAuthStore.getState().user?.preferences?.crossfade;
        if (crossfadeActive && audio.duration > 8) {
          const timeLeft = audio.duration - audio.currentTime;
          if (timeLeft <= 3.5 && timeLeft > 0.5 && !isCrossfadingRef.current) {
            isCrossfadingRef.current = true;
            audioEngine.fadeVolume(0.05, 3);
          } else if (timeLeft > 4.0 && isCrossfadingRef.current) {
            isCrossfadingRef.current = false;
            const targetVol = usePlayerStore.getState().volume ?? 1;
            audioEngine.setVolume(targetVol);
          }
        }

        // Intelligent Next-Track Prefetching (~15s before track end / around 2:50 on a 3-minute song)
        if (audio.duration >= 20) {
          const timeLeft = audio.duration - audio.currentTime;
          if (timeLeft <= 15 && timeLeft > 0.5) {
            const state = usePlayerStore.getState();
            const q = state.queue;
            const curr = state.currentTrack;
            if (curr && q.length > 0) {
              const idx = q.findIndex(t => t.id === curr.id);
              const nextTrack = idx !== -1 && idx < q.length - 1 ? q[idx + 1] : (state.repeatMode === 'all' ? q[0] : null);
              if (nextTrack && !prefetchedTrackIds.current.has(nextTrack.id)) {
                prefetchedTrackIds.current.add(nextTrack.id);

                // 1. Preload audio buffer so next song starts without latency gap
                if (nextTrack.audioUrl) {
                  try {
                    if (!preloadAudioRef.current) {
                      preloadAudioRef.current = new Audio();
                    }
                    preloadAudioRef.current.preload = "auto";
                    preloadAudioRef.current.src = getMediaUrl(nextTrack.audioUrl, 'audio', {
                      id: nextTrack.id,
                      title: nextTrack.title,
                      artist: nextTrack.artist?.name || (nextTrack as any).artistName || '',
                      language: (nextTrack as any).language
                    }) || '';
                    preloadAudioRef.current.load();
                  } catch (e) {}
                }

                // 2. Pre-fetch and cache lyrics for the next track
                import("@/lib/api").then(({ default: api }) => {
                  api.post('metadata/sync-lyrics', {
                    trackId: nextTrack.id,
                    title: nextTrack.title,
                    artist: nextTrack.artist?.name || nextTrack.artistName || '',
                    duration: nextTrack.duration
                  }).catch(() => {});
                });
              }
            }
          }
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

    const handleEnded = () => {
      if (isSwitchingTrackRef.current) return;
      playNext(false);
    };
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
      if (isPlaying && audio.paused) {
        audioEngine.resume();
        audio.play().catch(err => {
          if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
          console.warn("Playback prevented or failed:", err);
        });
      }
    };

    const handleAudioError = (e: any) => {
      if (isSwitchingTrackRef.current || isSourceChanging.current) return;
      const error = audio.error;
      if (!error || error.code === 0) return;

      // Guard: Ignore errors if audio.src is empty, "/", or pointing to the application website root
      const isAppPageUrl = typeof window !== 'undefined' && (
        !audio.src ||
        audio.src === window.location.href ||
        audio.src === window.location.origin ||
        audio.src === `${window.location.origin}/` ||
        audio.src.startsWith(`${window.location.origin}/?`)
      );

      if (isAppPageUrl) {
        console.warn("[GlobalAudio] Ignored audio error for invalid or empty source URL:", audio.src);
        audio.removeAttribute('src');
        setIsPlaying(false);
        return;
      }

      // Fallback: If audio failed while crossOrigin was active, retry without crossOrigin
      if (audio.crossOrigin && audio.src && !audio.src.includes('no-cors-retry=true')) {
        console.warn("[GlobalAudio] CORS blockage detected, retrying direct playback without crossOrigin...", audio.src);
        audio.removeAttribute('crossOrigin');
        const sep = audio.src.includes('?') ? '&' : '?';
        audio.src = `${audio.src}${sep}no-cors-retry=true`;
        audio.load();
        if (isPlaying) {
          audio.play().catch(err => {
            if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
            console.warn("[GlobalAudio] Fallback play failed:", err);
          });
        }
        return;
      }

      console.error("❌ Audio Engine Error:", {
        code: error.code,
        message: error.message,
        src: audio.src
      });

      const current = usePlayerStore.getState().currentTrack;
      if (!current) {
        setIsPlaying(false);
        return;
      }

      // Track failure count to prevent infinite recovery loops
      const trackId = current.id;
      const attemptCount = (audioRecoveryAttempts.current[trackId] || 0) + 1;
      audioRecoveryAttempts.current[trackId] = attemptCount;

      console.warn(`[GlobalAudio/Automator] Error detected for "${current.title}" (Attempt ${attemptCount}/3). Resolving alternative stream...`);

      if (attemptCount <= 2) {
        import('@/lib/api').then(({ default: api }) => {
          // 1. First attempt: call refetch-audio to resolve fresh verified stream
          api.post(`/tracks/${trackId}/refetch-audio`).then((res: any) => {
            const newUrl = res.data?.audioUrl || res.data?.track?.audioUrl;
            if (newUrl) {
              const fallbackMediaUrl = getMediaUrl(newUrl, 'audio', {
                id: current.id,
                title: current.title,
                artist: current.artist?.name || (current as any).artistName || '',
                language: (current as any).language
              });
              if (fallbackMediaUrl) {
                console.log("[GlobalAudio/Automator] Auto-recovered audio stream:", fallbackMediaUrl);
                usePlayerStore.setState(state => ({
                  currentTrack: state.currentTrack ? { ...state.currentTrack, audioUrl: fallbackMediaUrl } : null
                }));
                const sep = fallbackMediaUrl.includes('?') ? '&' : '?';
                audio.src = `${fallbackMediaUrl}${sep}auto-recovered=true&t=${Date.now()}`;
                audio.load();
                audio.play().catch((playErr) => {
                  if (playErr?.name === 'AbortError') return;
                  console.warn("[GlobalAudio/Automator] Secondary playback attempt failed:", playErr);
                  // Advance to next song if recovery stream also fails to play
                  setTimeout(() => {
                    useUIStore.getState().showToast(`Skipping unplayable track: "${current.title}"`, 'error');
                    playNext(true);
                  }, 300);
                });
                return;
              }
            }
            // If refetch returned no valid stream, advance to next track
            useUIStore.getState().showToast(`Skipping unplayable track: "${current.title}"`, 'error');
            playNext(true);
          }).catch((err) => {
            console.warn("[GlobalAudio/Automator] Refetch audio error:", err);
            useUIStore.getState().showToast(`Skipping unplayable track: "${current.title}"`, 'error');
            playNext(true);
          });
        }).catch(() => {
          playNext(true);
        });
      } else {
        // Attempt limit exceeded: smoothly advance to next song in queue
        console.warn(`[GlobalAudio/Automator] Audio recovery exhausted for "${current.title}". Advancing to next track.`);
        useUIStore.getState().showToast(`Audio unavailable for "${current.title}". Playing next song.`, 'error');
        playNext(true);
      }
    };

    const handleSeeked = () => {
      isCrossfadingRef.current = false;
      const targetVol = usePlayerStore.getState().volume ?? 1;
      audioEngine.setVolume(targetVol);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('error', handleAudioError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('seeked', handleSeeked);
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

    const handleMediaPause = () => {
      setIsPlaying(false);
      const audio = audioEngine.getActiveAudioElement();
      if (audio && !audio.paused) {
        audio.pause();
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    };

    const handleMediaPlay = () => {
      setIsPlaying(true);
      const audio = audioEngine.getActiveAudioElement();
      if (audio && audio.paused) {
        audioEngine.resume();
        audio.play().catch(err => {
          if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
          console.warn("[GlobalAudio] MediaSession play failed:", err);
        });
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    };

    navigator.mediaSession.setActionHandler('play', handleMediaPlay);
    navigator.mediaSession.setActionHandler('pause', handleMediaPause);
    navigator.mediaSession.setActionHandler('stop', handleMediaPause);
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
      navigator.mediaSession.setActionHandler('stop', null);
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
      currentPlayingTrackIdRef.current = null;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
      return;
    }

    const isNewTrack = currentPlayingTrackIdRef.current !== currentTrack.id;
    const sessionId = ++playbackSessionIdRef.current;

    const loadAudio = async () => {
      if (playbackSessionIdRef.current !== sessionId) return;

      const currentArtist = currentTrack.artist?.name || (currentTrack as any).artistName || '';
      const trackLang = (currentTrack as any).language || (currentTrack as any).vibeProfile?.language || '';
      const trackAlbum = (typeof currentTrack.album === 'string' ? currentTrack.album : currentTrack.album?.title) || (currentTrack as any)?.albumTitle || '';

      const trackContext = {
        id: currentTrack.id,
        title: currentTrack.title,
        artist: currentArtist,
        album: trackAlbum,
        language: trackLang
      };

      const isUnplayableWebPage = currentTrack.audioUrl ? (
        currentTrack.audioUrl.startsWith('spotify:') ||
        (currentTrack.audioUrl.includes('spotify.com') && !currentTrack.audioUrl.includes('.mp3'))
      ) : false;

      let targetSrc = isUnplayableWebPage ? undefined : getMediaUrl(currentTrack.audioUrl, 'audio', trackContext);
      if (typeof window !== 'undefined') {
        if (!targetSrc || targetSrc === '' || targetSrc === '/' || targetSrc === window.location.origin || targetSrc === `${window.location.origin}/` || targetSrc === window.location.href) {
          targetSrc = undefined;
        }
      }

      const is30sPreviewUrl = targetSrc ? (
        targetSrc.includes('audio-ssl') ||
        targetSrc.includes('mzstatic') ||
        targetSrc.includes('itunes.apple.com')
      ) : false;

      if (!targetSrc || is30sPreviewUrl) {
        const query = `${currentArtist} - ${currentTrack.title}${trackAlbum && !currentTrack.title.toLowerCase().includes(trackAlbum.toLowerCase()) ? ` (${trackAlbum})` : ''}`.trim();
        const streamParams = new URLSearchParams({
          url: query,
          trackId: currentTrack.id || '',
          title: currentTrack.title || '',
          artist: currentArtist || '',
          ...(trackAlbum ? { album: trackAlbum } : {}),
          ...(trackLang ? { language: trackLang } : {})
        });
        targetSrc = getMediaUrl(`/api/utils/stream-youtube?${streamParams.toString()}`, 'audio', trackContext);
      }

      if (targetSrc && targetSrc.includes('/stream-youtube')) {
        try {
          const u = new URL(targetSrc, window.location.origin);
          if (!u.searchParams.has('trackId') && currentTrack.id) u.searchParams.set('trackId', currentTrack.id);
          if (!u.searchParams.has('title') && currentTrack.title) u.searchParams.set('title', currentTrack.title);
          if (!u.searchParams.has('artist') && currentArtist) u.searchParams.set('artist', currentArtist);
          if (!u.searchParams.has('album') && trackAlbum) u.searchParams.set('album', trackAlbum);
          if (!u.searchParams.has('language') && trackLang) u.searchParams.set('language', trackLang);
          targetSrc = u.toString();
        } catch {}
      }

      if (playbackSessionIdRef.current !== sessionId) return;

      if (!targetSrc) {
        console.warn("[GlobalAudio] Track is unplayable. Skipping to next.");
        playNext(true);
        return;
      }

      // ── CASE 1: USER SELECTED A DIFFERENT TRACK ─────────────────────────
      if (isNewTrack) {
        currentPlayingTrackIdRef.current = currentTrack.id;
        currentTrackIdRef.current = currentTrack.id;
        currentTrackTitleRef.current = currentTrack.title;
        currentTrackArtistRef.current = currentArtist;

        isSwitchingTrackRef.current = true;
        isSourceChanging.current = true;
        isCrossfadingRef.current = false;
        prefetchedTrackIds.current.clear();

        // 1. If currently playing, we avoid audio.pause() or audio.load() to maintain continuous media session token in background tabs
        const wasActive = isPlaying && !audio.paused;

        // 2. Clear out old playback progress immediately
        audio.currentTime = 0;
        usePlayerStore.setState({ currentTime: 0, duration: currentTrack.duration || 0 });

        // 3. Set crossOrigin & assign the new audio source
        if (targetSrc.startsWith('blob:') || targetSrc.startsWith('data:')) {
          audio.removeAttribute('crossOrigin');
        } else {
          audio.crossOrigin = 'anonymous';
        }
        audio.src = targetSrc;
        if (!wasActive) {
          audio.load();
        }

        // 4. Begin playback of the newly clicked or next track immediately
        if (isPlaying) {
          audioEngine.resume();
          const crossfadeActive = useAuthStore.getState().user?.preferences?.crossfade;
          if (crossfadeActive) {
            audioEngine.fadeIn(volumeRef.current, 1.5);
          } else {
            audioEngine.setVolume(volumeRef.current);
          }
          audio.play().catch(err => {
            if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
            console.warn("[GlobalAudio] Play failed:", err);
          });
        }

        setTimeout(() => {
          if (playbackSessionIdRef.current === sessionId) {
            isSwitchingTrackRef.current = false;
            isSourceChanging.current = false;
          }
        }, 300);
      } 
      // ── CASE 2: SAME TRACK (PLAY / PAUSE TOGGLE OR RESUME) ──────────────
      else {
        currentTrackIdRef.current = currentTrack.id;
        currentTrackTitleRef.current = currentTrack.title;
        currentTrackArtistRef.current = currentArtist;

        if (isPlaying && audio.paused) {
          audioEngine.resume();
          audio.play().catch(err => {
            if (err?.name === 'AbortError' || err?.message?.includes('interrupted')) return;
            console.warn("[GlobalAudio] Sync Play failed:", err);
          });
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      }
    };

    loadAudio();
  }, [currentTrack?.id, currentTrack?.audioUrl, isPlaying, setIsPlaying, playNext]);

  // Pre-fetch Next Track in Queue for Instant Switch
  useEffect(() => {
    if (!currentTrack || queue.length <= 1) return;
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    if (currentIndex === -1 || currentIndex >= queue.length - 1) return;
    const nextTrack = queue[currentIndex + 1];
    if (!nextTrack || !nextTrack.audioUrl) return;

    const timer = setTimeout(() => {
      const targetSrc = getMediaUrl(nextTrack.audioUrl, 'audio');
      if (targetSrc && targetSrc.startsWith('http')) {
        const audioPreload = new Audio();
        audioPreload.preload = 'auto';
        audioPreload.src = targetSrc;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [currentTrack?.id, queue]);

  // Analytics Reporting: Only report play event if audio is verified actively playing (>2s)
  useEffect(() => {
    if (!currentTrack || !isPlaying) return;

    const reportTimeout = setTimeout(async () => {
      try {
        const audio = audioEngine.getActiveAudioElement();
        if (!audio || audio.paused || audio.error || audio.currentTime < 2) {
          return;
        }

        const api = (await import("@/lib/api")).default;
        await api.post(`tracks/${currentTrack.id}/play`);
        if (queryClient) {
          queryClient.invalidateQueries({ queryKey: ['artist', 'search-home', 'tracks'] });
          queryClient.invalidateQueries({ queryKey: ['home-continue-listening'] });
          queryClient.invalidateQueries({ queryKey: ['home-recently-played'] });
        }

        // Record User Activity Event for real-time recommendation updates
        api.post('/activity/event', {
          eventType: 'play',
          eventData: {
            trackId: currentTrack.id,
            artistId: (currentTrack as any).artistId || currentTrack.artist?.id,
            genre: currentTrack.genre,
            language: (currentTrack as any).language || (currentTrack as any).vibeProfile?.language,
            duration: currentTrack.duration
          },
          sourceType: (currentTrack as any).sourceType || 'recommendation',
          seedId: currentTrack.id
        }).catch(() => {});
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

    const isLocalTrack = (currentTrack as any).isLocal || 
      currentTrack.id.startsWith('local-') || 
      (currentTrack.audioUrl && (
        currentTrack.audioUrl.startsWith('blob:') || 
        currentTrack.audioUrl.startsWith('indexeddb:') || 
        currentTrack.audioUrl.startsWith('data:')
      ));

    if (isLocalTrack) return;
    
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
              if (audio && currentPlayingTrackIdRef.current === currentTrack.id) {
                const targetSrc = getMediaUrl(updated.audioUrl, 'audio');
                // Only hot-swap audio stream if playback has not significantly progressed to avoid killing listening experience
                if (targetSrc && (audio.currentTime < 1 || audio.paused || audio.error)) {
                  const wasPlaying = usePlayerStore.getState().isPlaying;
                  const currentTime = audio.currentTime;
                  
                  isSourceChanging.current = true;
                  audio.src = targetSrc;
                  audio.load();
                  
                  const onMetadata = () => {
                    audio.currentTime = currentTime;
                    if (wasPlaying) {
                      audioEngine.resume();
                      audio.play().catch(playErr => {
                        if (playErr?.name === 'AbortError' || playErr?.message?.includes('interrupted')) return;
                        console.warn("[GlobalAudio] Background audio swap play failed:", playErr);
                      });
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
