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

 const audioRef = useRef<HTMLAudioElement>(null);
 const isSourceChanging = useRef(false);
 const lastUpdateTime = useRef(0);
 const accumulatedSecondsRef = useRef(0);
 const queryClient = useQueryClient();

 // Keep latest audioFx and volume in refs to prevent stale closure bugs in loadedmetadata/applyFx handlers
 const audioFxRef = useRef(audioFx);
 audioFxRef.current = audioFx;
 const volumeRef = useRef(volume);
 volumeRef.current = volume;

 // Initialize Audio Engine
 useEffect(() => {
 if (audioRef.current) {
 audioEngine.init(audioRef.current, audioRef.current);
 audioEngine.setVolume(volumeRef.current);
 }
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
 const audio = audioRef.current;
 if (!audio) return;

 const syncTrackDuration = (duration: number) => {
 const track = usePlayerStore.getState().currentTrack;
 if (!track || isNaN(duration) || duration <= 0) return;
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
 if (now - lastUpdateTime.current > 150) { // 150ms for performance, still smooth for UI
 setCurrentTime(audio.currentTime);
 lastUpdateTime.current = now;
 }
 if (audio.duration && !isNaN(audio.duration)) {
 setDuration(audio.duration);
 syncTrackDuration(audio.duration);
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

 const handleEnded = () => playNext(true);
 const handleLoadedMetadata = () => {
 audioEngine.resume(); 
 applyFx(); // Re-apply all effects to the new stream immediately
 if (audio.duration && !isNaN(audio.duration)) {
 setDuration(audio.duration);
 syncTrackDuration(audio.duration);
 }
 if (isPlaying) {
 audio.play().catch(err => {
 console.warn("Playback prevented or failed:", err);
 if (!isSourceChanging.current) setIsPlaying(false);
 });
 }
 };
 const handleAudioError = (e: any) => {
 // Suppress transient errors during intentional source switches
 if (isSourceChanging.current) return;
 
 const error = audio.error;
 // Code 4 = SRC_NOT_SUPPORTED (common on empty src), ignore it too
 // Code 0 = No error (sometimes reported by browsers)
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

 // Media Session Implementation (Fixes Dynamic Notification UI)
 useEffect(() => {
 if (!currentTrack || !('mediaSession' in navigator)) return;

 const setMediaSessionMetadata = async (track: any) => {
 const artworkUrl = getTrackCover(track);
 
 // Preload to ensure notification panel shows high-res image immediately
 const img = new Image();
 img.src = artworkUrl;
 
 // Standardize metadata set
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
 if (details.seekTime !== undefined && audioRef.current) {
 audioRef.current.currentTime = details.seekTime;
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
 const audio = audioRef.current;
 if (!audio || !currentTrack) return;

 const targetSrc = getMediaUrl(currentTrack.audioUrl);
 if (targetSrc) {
 // Compare absolute URLs to avoid loops
 const normalizedCur = audio.src ? new URL(audio.src, window.location.origin).toString() : '';
 const normalizedNext = new URL(targetSrc, window.location.origin).toString();

 if (normalizedCur !== normalizedNext) {
 isSourceChanging.current = true;
 audio.src = targetSrc;
 audio.load();
 setTimeout(() => { isSourceChanging.current = false; }, 800);
 }
 }

  if (isPlaying) {
    // If a source change is in progress, skip the play() attempt here entirely.
    // handleLoadedMetadata will fire once the new stream is ready and start playback.
    // This prevents a failed play() race from calling setIsPlaying(false) prematurely.
    if (!isSourceChanging.current && audio.paused) {
      audio.play().catch(err => {
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
 }, [currentTrack, isPlaying, setIsPlaying]);

 // Analytics Reporting (Play Count)
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

 // Real-time Heartbeat (Accurate Tracking with Batched DB Writes)
 useEffect(() => {
 if (!currentTrack) return;

 const trackId = currentTrack.id;

 const flushHeartbeat = async (id: string, duration: number) => {
 if (duration <= 0) return;
 try {
 const api = (await import("@/lib/api")).default;
 const progress = audioRef.current?.currentTime || 0;
 await api.post(`tracks/${id}/heartbeat`, { duration, progress });
 } catch (err) {
 console.error("[Playback] Batched heartbeat failed:", err);
 }
 };

 if (!isPlaying) {
 // When playback pauses, flush any accumulated seconds immediately
 const leftOver = accumulatedSecondsRef.current;
 if (leftOver > 0) {
 flushHeartbeat(trackId, leftOver);
 accumulatedSecondsRef.current = 0;
 }
 return;
 }

 // Ticking every 1 second locally
 const localTick = setInterval(() => {
 accumulatedSecondsRef.current += 1;
 
 // Send batch to backend every 10 seconds
 if (accumulatedSecondsRef.current >= 10) {
 const toSend = accumulatedSecondsRef.current;
 accumulatedSecondsRef.current = 0;
 flushHeartbeat(trackId, toSend);
 }
 }, 1000);

 return () => {
 clearInterval(localTick);
 // On unmount/cleanup (track change or component unmount), flush whatever is left
 const leftOver = accumulatedSecondsRef.current;
 if (leftOver > 0) {
 flushHeartbeat(trackId, leftOver);
 accumulatedSecondsRef.current = 0;
 }
 };
 }, [currentTrack?.id, isPlaying]);


 return (
 <div className="hidden pointer-events-none" aria-hidden="true">
 <audio ref={audioRef} crossOrigin="anonymous" />
 </div>
 );
}
