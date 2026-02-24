"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useRef, useCallback } from "react";

function formatTime(t: number) {
    if (!t || isNaN(t)) return "0:00";
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

export function MobilePlayerBar() {
    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const togglePlay = usePlayerStore(s => s.togglePlay);
    const playNext = usePlayerStore(s => s.playNext);
    const playPrev = usePlayerStore(s => s.playPrev);
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const setCurrentTime = usePlayerStore(s => s.setCurrentTime);
    const progressBarRef = useRef<HTMLDivElement>(null);

    // Seek by tapping/dragging the progress bar
    const handleSeek = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (!progressBarRef.current || !duration) return;
        const rect = progressBarRef.current.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newTime = ratio * duration;

        // Seek the actual audio element
        const audio = document.querySelector("audio") as HTMLAudioElement | null;
        if (audio) audio.currentTime = newTime;
        setCurrentTime(newTime);
    }, [duration, setCurrentTime]);

    if (!currentTrack) return null;

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <AnimatePresence>
            {currentTrack && (
                <motion.div
                    initial={{ y: 60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 60, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="w-full px-3 pb-1 pt-1"
                >
                    <div className="relative bg-[#111114]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.6)] overflow-hidden">

                        {/* ── Interactive Seek Bar ──────────────────── */}
                        <div
                            ref={progressBarRef}
                            className="absolute top-0 left-0 right-0 h-[6px] bg-white/5 cursor-pointer touch-none"
                            onTouchStart={handleSeek}
                            onTouchMove={handleSeek}
                            onClick={handleSeek}
                        >
                            <div
                                className="h-full bg-rose-500 transition-none shadow-[0_0_8px_rgba(244,63,94,0.5)] relative"
                                style={{ width: `${progress}%` }}
                            >
                                {/* Thumb dot */}
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 pt-5">
                            {/* Album Art */}
                            <div className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 shadow-lg">
                                <img
                                    src={getMediaUrl(currentTrack.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200"}
                                    className="w-full h-full object-cover"
                                    alt=""
                                />
                                {isPlaying && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <div className="flex items-end gap-[2px] h-4">
                                            {[0.2, 0.4, 0.1, 0.5].map((delay, i) => (
                                                <motion.div
                                                    key={i}
                                                    animate={{ height: ["30%", "100%", "30%"] }}
                                                    transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                                    className="w-[3px] bg-rose-500 rounded-full"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Track Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-white truncate leading-tight">
                                    {currentTrack.title}
                                </p>
                                <p className="text-[11px] text-white/40 font-medium truncate mt-0.5">
                                    {currentTrack.artist?.name}
                                </p>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={playPrev} className="w-9 h-9 flex items-center justify-center text-white/50 active:text-white transition-colors">
                                    <SkipBack size={18} />
                                </button>
                                <button
                                    onClick={togglePlay}
                                    className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center shadow-[0_0_16px_rgba(244,63,94,0.4)] active:scale-95 transition-transform"
                                >
                                    {isPlaying
                                        ? <Pause size={17} fill="white" className="text-white" />
                                        : <Play size={17} fill="white" className="text-white ml-0.5" />
                                    }
                                </button>
                                <button onClick={playNext} className="w-9 h-9 flex items-center justify-center text-white/50 active:text-white transition-colors">
                                    <SkipForward size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Time row */}
                        <div className="flex items-center justify-between px-4 pb-2.5">
                            <span className="text-[9px] text-white/30 font-bold tabular-nums">{formatTime(currentTime)}</span>
                            <span className="text-[9px] text-white/30 font-bold tabular-nums">{formatTime(duration)}</span>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
