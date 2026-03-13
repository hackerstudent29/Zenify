"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "@/store/player";
import { audioEngine } from "@/lib/audio-engine";
import { getMediaUrl } from "@/lib/utils";

export function GlobalAudio() {
    const currentTrack = usePlayerStore(state => state.currentTrack);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const playNext = usePlayerStore(state => state.playNext);
    const volume = usePlayerStore(state => state.volume);
    const audioFx = usePlayerStore(state => state.audioFx);
    const setCurrentTime = usePlayerStore(state => state.setCurrentTime);
    const setDuration = usePlayerStore(state => state.setDuration);

    const audioRef = useRef<HTMLAudioElement>(null);

    // Initialize Audio Engine
    useEffect(() => {
        if (audioRef.current) {
            // Initializing with same ref twice is safe in ZenAudioEngine
            audioEngine.init(audioRef.current, audioRef.current);
            applyFx();
        }
    }, []);

    const applyFx = () => {
        audioEngine.setVolume(volume);
        audioEngine.setEq(0, audioFx.eq[0]);
        audioEngine.setEq(1, audioFx.eq[1]);
        audioEngine.setEq(2, audioFx.eq[2]);
        audioEngine.toggle8D(audioFx.is8D, audioFx.direction8D);
        audioEngine.setPlaybackSpeed(audioFx.speed, audioFx.pitch === 1);
        audioEngine.setReverb(audioFx.reverb);
        audioEngine.setReverbMix(audioFx.reverb === 'none' ? 0 : 0.6);
    };

    // Keep FX in sync
    useEffect(() => {
        applyFx();
    }, [volume, audioFx]);

    // MediaSession and Event Listeners
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
            if (audio.duration && !isNaN(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const handleEnded = () => {
            console.log("Track Ended, moving to next...");
            playNext(false);
        };

        const handleLoadedMetadata = () => {
            if (audio.duration && !isNaN(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const handlePlayEvent = () => {
            console.log("🎵 Native Play Event");
            if (!usePlayerStore.getState().isPlaying) {
                usePlayerStore.getState().setIsPlaying(true);
            }
        };

        const handlePauseEvent = () => {
            console.log("🎵 Native Pause Event");
            if (usePlayerStore.getState().isPlaying) {
                usePlayerStore.getState().setIsPlaying(false);
            }
        };

        const handleAudioError = (e: any) => {
            console.error("❌ Audio Engine Error:", e, audio.error);
            // Some mobile browsers need a re-load on error
            if (audio.error && audio.error.code === 4) { // SRC NOT SUPPORTED or CORS
                 console.warn("Retrying source load...");
                 const currentSrc = audio.src;
                 audio.src = '';
                 audio.load();
                 audio.src = currentSrc;
            }
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('play', handlePlayEvent);
        audio.addEventListener('pause', handlePauseEvent);
        audio.addEventListener('error', handleAudioError);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('play', handlePlayEvent);
            audio.removeEventListener('pause', handlePauseEvent);
            audio.removeEventListener('error', handleAudioError);
        };
    }, []); // Run once on mount

    // Sync Media Metadata
    useEffect(() => {
        if (!currentTrack || !('mediaSession' in navigator)) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentTrack.title,
            artist: currentTrack.artist?.name || 'Unknown Artist',
            album: currentTrack.album?.title || 'Zenify Single',
            artwork: [
                { src: getMediaUrl(currentTrack.coverUrl) || '/logo.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        // Add action handlers
        navigator.mediaSession.setActionHandler('play', () => {
            usePlayerStore.getState().setIsPlaying(true);
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            usePlayerStore.getState().setIsPlaying(false);
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            usePlayerStore.getState().playPrev();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            usePlayerStore.getState().playNext(true);
        });
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
    }, [currentTrack]);

    // Handle play/pause state synchronization
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !currentTrack) return;

        // Sync Audio Src
        const targetSrc = getMediaUrl(currentTrack.audioUrl);
        if (audio.src !== targetSrc && targetSrc) {
            audio.src = targetSrc;
            audio.load();
        }

        // Sync playback state
        if (isPlaying) {
            audioEngine.resume();
            if (audio.paused) {
                audio.play().catch(err => {
                    console.warn("Autoplay / Play failed:", err);
                    usePlayerStore.getState().setIsPlaying(false);
                });
            }
        } else {
            if (!audio.paused) {
                audio.pause();
            }
        }

        // Sync MediaSession playback state
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }
    }, [currentTrack, isPlaying]);

    // Report playback to backend
    useEffect(() => {
        if (!currentTrack || !isPlaying) return;

        // Debounce reporting: only report if track is played for more than 5 seconds
        const reportTimeout = setTimeout(async () => {
            try {
                const api = (await import("@/lib/api")).default;
                await api.post(`/tracks/${currentTrack.id}/play`);
                console.log(`[Playback] Reported play for ${currentTrack.title}`);
            } catch (err) {
                console.error("[Playback] Failed to report play:", err);
            }
        }, 5000);

        return () => clearTimeout(reportTimeout);
    }, [currentTrack?.id, isPlaying]);

    return (
        <div className="hidden pointer-events-none" aria-hidden="true">
            <audio ref={audioRef} crossOrigin="anonymous" />
        </div>
    );
}
