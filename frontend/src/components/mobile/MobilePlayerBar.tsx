"use client";

/**
 * MobilePlayerBar — Dedicated mobile-only player UI.
 * This replaces the full desktop PlayerBar on small screens.
 * Desktop PlayerBar is untouched.
 */

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import { getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { useEffect, useRef } from "react";

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
    const { setPlayerMinimized } = useUIStore();

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
                        {/* Progress bar at top */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5">
                            <div
                                className="h-full bg-rose-500 transition-all duration-300 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        <div className="flex items-center gap-3 p-3 pt-4">
                            {/* Album Art */}
                            <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-lg">
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
                                <button
                                    onClick={playPrev}
                                    className="w-9 h-9 flex items-center justify-center text-white/50 active:text-white transition-colors"
                                >
                                    <SkipBack size={18} />
                                </button>

                                <button
                                    onClick={togglePlay}
                                    className="w-11 h-11 rounded-full bg-rose-500 flex items-center justify-center shadow-[0_0_16px_rgba(244,63,94,0.4)] active:scale-95 transition-transform"
                                >
                                    {isPlaying
                                        ? <Pause size={18} fill="white" className="text-white" />
                                        : <Play size={18} fill="white" className="text-white ml-0.5" />
                                    }
                                </button>

                                <button
                                    onClick={playNext}
                                    className="w-9 h-9 flex items-center justify-center text-white/50 active:text-white transition-colors"
                                >
                                    <SkipForward size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Time row */}
                        <div className="flex items-center justify-between px-4 pb-3">
                            <span className="text-[9px] text-white/20 font-bold tabular-nums">{formatTime(currentTime)}</span>
                            <span className="text-[9px] text-white/20 font-bold tabular-nums">{formatTime(duration)}</span>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
