"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { audioEngine } from "@/lib/audio-engine";
import { getTrackCover, formatArtists, formatDuration } from "@/lib/utils";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  ScrollText,
  Volume2,
  VolumeX,
} from "lucide-react";

export interface CarModeViewProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function CarModeView({ isOpen: propIsOpen, onClose: propOnClose }: CarModeViewProps = {}) {
  const storeIsOpen = useUIStore((s) => s.isCarModeOpen);
  const storeSetIsOpen = useUIStore((s) => s.setIsCarModeOpen);
  const isOpen = propIsOpen !== undefined ? propIsOpen : storeIsOpen;
  const onClose = propOnClose || (() => storeSetIsOpen(false));

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const [showLyrics, setShowLyrics] = useState(false);
  const wakeLockRef = useRef<any>(null);

  // Screen Wake Lock API integration to keep screen on while driving
  useEffect(() => {
    if (!isOpen) return;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch (err) {
        console.warn("[CarMode] Screen Wake Lock not supported or rejected:", err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isOpen) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const coverUrl = currentTrack ? getTrackCover(currentTrack) : "/images/placeholder.png";
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    const activeAudio = audioEngine.getActiveAudioElement();
    if (activeAudio) {
      activeAudio.currentTime = targetTime;
    }
    usePlayerStore.getState().setCurrentTime(targetTime);
  };

  return (
    <div className="fixed inset-0 z-[1500] bg-black text-white flex flex-col justify-between p-6 md:p-10 select-none overflow-hidden">
      {/* Top Bar: Exit button & Large Lyrics Toggle */}
      <header className="flex items-center justify-between z-10">
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
            onClose();
          }}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all cursor-pointer font-bold text-[16px] text-white"
        >
          <X className="w-6 h-6" />
          <span>Exit Car Mode</span>
        </button>

        <div className="flex items-center gap-3">
          {currentTrack?.lyrics && (
            <button
              type="button"
              onClick={() => setShowLyrics((v) => !v)}
              className={`p-3 rounded-full transition-all cursor-pointer ${
                showLyrics ? "bg-white text-black font-bold" : "bg-white/15 text-white"
              }`}
            >
              <ScrollText className="w-6 h-6" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="p-3 rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-95 transition-all cursor-pointer"
          >
            {volume > 0 ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 my-auto max-w-5xl mx-auto w-full">
        {/* Cover Art */}
        {!showLyrics ? (
          <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-[28px] overflow-hidden shadow-2xl shrink-0 border border-white/20">
            <img src={coverUrl} alt={currentTrack?.title || "Track"} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="flex-1 w-full max-h-[50vh] overflow-y-auto px-4 py-2 text-center">
            <p className="text-[28px] sm:text-[34px] font-bold leading-relaxed text-white">
              {currentTrack?.lyrics}
            </p>
          </div>
        )}

        {/* Track Info */}
        <div className="text-center md:text-left min-w-0 flex-1">
          <h1 className="text-[32px] sm:text-[44px] md:text-[52px] font-black tracking-tight leading-tight truncate">
            {currentTrack?.title || "No track playing"}
          </h1>
          <p className="text-[22px] sm:text-[28px] md:text-[32px] font-semibold text-white/70 tracking-normal truncate mt-1">
            {currentTrack ? formatArtists(currentTrack) : "Select a track to start"}
          </p>
          {currentTrack?.album?.title && (
            <p className="text-[16px] sm:text-[18px] text-white/40 truncate mt-1">
              {currentTrack.album.title}
            </p>
          )}
        </div>
      </main>

      {/* Bottom Area: Thick Scrubber + Giant 72px Controls */}
      <footer className="w-full max-w-4xl mx-auto flex flex-col gap-6 z-10 pb-4">
        {/* Scrubber Bar */}
        <div className="flex flex-col gap-2">
          <div
            onClick={handleSeek}
            className="w-full h-4 rounded-full bg-white/20 cursor-pointer overflow-hidden relative"
          >
            <div
              className="h-full bg-brand rounded-full transition-[width] duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[16px] font-bold text-white/60 tabular-nums px-1">
            <span>{formatDuration(Math.round(currentTime))}</span>
            <span>{formatDuration(Math.round(duration))}</span>
          </div>
        </div>

        {/* Giant 72px+ Controls */}
        <div className="flex items-center justify-center gap-10 sm:gap-16">
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
              playPrev();
            }}
            aria-label="Previous Track"
            className="w-20 h-20 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all flex items-center justify-center text-white cursor-pointer"
          >
            <SkipBack className="w-10 h-10" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
              togglePlay();
            }}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="w-24 h-24 rounded-full bg-white text-black active:scale-95 transition-all flex items-center justify-center shadow-xl cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-12 h-12 fill-black" />
            ) : (
              <Play className="w-12 h-12 fill-black ml-1.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
              playNext(true);
            }}
            aria-label="Next Track"
            className="w-20 h-20 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all flex items-center justify-center text-white cursor-pointer"
          >
            <SkipForward className="w-10 h-10" />
          </button>
        </div>
      </footer>
    </div>
  );
}

