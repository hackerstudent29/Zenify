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

    // Track state sync (Time & Duration)
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

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
    }, [currentTrack]); // Reset listeners if track changes

    // Handle play/pause and track changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !currentTrack) return;

        const targetSrc = getMediaUrl(currentTrack.audioUrl);

        if (audio.src !== targetSrc && targetSrc) {
            audio.src = targetSrc;
            audio.load();
        } else if (audio.src === targetSrc && usePlayerStore.getState().currentTime === 0) {
            audio.currentTime = 0;
        }

        if (isPlaying) {
            audioEngine.resume();
            audio.play().catch(err => {
                console.warn("Autoplay / Play failed:", err);
            });
        } else {
            audio.pause();
        }
    }, [currentTrack, isPlaying]);

    return (
        <div className="hidden pointer-events-none" aria-hidden="true">
            <audio ref={audioRef} crossOrigin="anonymous" />
        </div>
    );
}
