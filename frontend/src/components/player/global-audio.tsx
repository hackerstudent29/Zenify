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

    // Initialize Audio Engine
    useEffect(() => {
        if (audioRef.current) {
            audioEngine.init(audioRef.current, audioRef.current);
            audioEngine.setVolume(volume);
        }
    }, []);

    // FX & Volume Sync
    useEffect(() => {
        audioEngine.setVolume(volume);
        audioEngine.setEq(0, audioFx.eq[0]);
        audioEngine.setEq(1, audioFx.eq[1]);
        audioEngine.setEq(2, audioFx.eq[2]);
        audioEngine.toggle8D(audioFx.is8D, audioFx.direction8D);
        audioEngine.setPlaybackSpeed(audioFx.speed, audioFx.pitch === 1);
        audioEngine.setReverb(audioFx.reverb);
        audioEngine.setReverbMix(audioFx.reverb === 'none' ? 0 : 0.6);
    }, [volume, audioFx]);

    // Handle Events
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            const now = Date.now();
            if (now - lastUpdateTime.current > 1000) {
                setCurrentTime(audio.currentTime);
                lastUpdateTime.current = now;
            }
            if (audio.duration && !isNaN(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const handleEnded = () => playNext(true);
        const handleLoadedMetadata = () => {
             if (audio.duration) setDuration(audio.duration);
             if (isPlaying) {
                 audio.play().catch(err => {
                    console.warn("Playback prevented or failed:", err);
                    if (!isSourceChanging.current) setIsPlaying(false);
                 });
             }
        };
        const handleAudioError = (e: any) => {
            console.error("Audio error:", e);
            if (!isSourceChanging.current) setIsPlaying(false);
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
    }, [playNext, isPlaying, setIsPlaying, setCurrentTime, setDuration]);

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
            // browser might require user interaction
            if (audio.paused) {
                audio.play().catch(err => {
                    console.warn("Sync Play failed:", err);
                    if (!isSourceChanging.current) setIsPlaying(false);
                });
            }
        } else {
            if (!audio.paused && !isSourceChanging.current) audio.pause();
        }

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }
    }, [currentTrack, isPlaying, setIsPlaying]);

    // Analytics Reporting
    const queryClient = useQueryClient();
    useEffect(() => {
        if (!currentTrack || !isPlaying) return;

        const reportTimeout = setTimeout(async () => {
            try {
                const api = (await import("@/lib/api")).default;
                await api.post(`/tracks/${currentTrack.id}/play`);
                if (queryClient) queryClient.invalidateQueries({ queryKey: ['artist', 'search-home', 'tracks'] });
            } catch (err) {
                console.error("[Playback] Failed to report play:", err);
            }
        }, 5000);

        return () => clearTimeout(reportTimeout);
    }, [currentTrack?.id, isPlaying, queryClient]);

    return (
        <div className="hidden pointer-events-none" aria-hidden="true">
            <audio ref={audioRef} crossOrigin="anonymous" />
        </div>
    );
}
