"use client";

import { usePlayerStore } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, Settings2, X } from "lucide-react";
import { getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { useState, useCallback } from "react";
import { AudioFxMenu } from "@/components/player/audio-fx-menu";
import { useUIStore } from "@/store/ui";

function formatTime(t: number) {
    if (!t || isNaN(t)) return "0:00";
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

/** Find and seek the active <audio> element in the DOM (rendered by desktop PlayerBar, always in DOM) */
function seekAudio(newTime: number) {
    const audios = Array.from(document.querySelectorAll("audio")) as HTMLAudioElement[];
    // Find the one that's playing or has audio data
    const active = audios.find(a => !a.paused) ?? audios.find(a => a.readyState >= 2) ?? audios[0];
    if (active) active.currentTime = newTime;
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
    const { isAudioFxOpen, setAudioFxOpen, setFullScreenPlayerOpen } = useUIStore();

    const handleSeek = useCallback((val: number[]) => {
        const newTime = val[0];
        seekAudio(newTime);
        setCurrentTime(newTime);
    }, [setCurrentTime]);

    if (!currentTrack) return null;

    return (
        <>
            <AnimatePresence>
                {currentTrack && (
                    <motion.div
                        initial={{ y: 60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 60, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="w-full px-3 pb-1 pt-1"
                    >
                        <div className="bg-[#111114]/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_-12px_48px_rgba(0,0,0,0.8)] overflow-hidden">

                            {/* ── Seek Slider ─────────────────────────────── */}
                            <div className="px-5 pt-4 pb-1 group/slider">
                                <Slider.Root
                                    className="relative flex items-center select-none w-full h-5 cursor-pointer touch-none"
                                    value={[currentTime]}
                                    max={duration || 1}
                                    step={0.5}
                                    onValueChange={handleSeek}
                                >
                                    <Slider.Track className="relative grow rounded-full h-[3px] bg-white/10">
                                        <Slider.Range className="absolute h-full rounded-full bg-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]" />
                                    </Slider.Track>
                                    <Slider.Thumb className="block w-4 h-4 rounded-full bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 border-rose-500 focus:outline-none opacity-0 group-hover/slider:opacity-100 transition-opacity" />
                                </Slider.Root>

                                {/* Time labels */}
                                <div className="flex justify-between mt-0.5 px-0.5">
                                    <span className="text-[9px] text-white/20 font-black tabular-nums">{formatTime(currentTime)}</span>
                                    <span className="text-[9px] text-white/20 font-black tabular-nums">{formatTime(duration)}</span>
                                </div>
                            </div>

                            {/* ── Main Row ─────────────────────────────────── */}
                            <div className="flex items-center gap-3 px-4 pb-4">
                                {/* Album Art */}
                                <div
                                    onClick={() => setFullScreenPlayerOpen(true)}
                                    className="relative w-11 h-11 rounded-2xl overflow-hidden shrink-0 shadow-2xl active:scale-90 transition-transform cursor-pointer group"
                                >
                                    <img
                                        src={getMediaUrl(currentTrack.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200"}
                                        className="w-full h-full object-cover"
                                        alt=""
                                    />
                                    {isPlaying && (
                                        <div className="absolute inset-0 bg-brand/30 flex items-center justify-center backdrop-blur-[1px]">
                                            <div className="flex items-end gap-[2.5px] h-4">
                                                {[0.2, 0.4, 0.1, 0.3].map((delay, i) => (
                                                    <motion.div
                                                        key={i}
                                                        animate={{ height: ["30%", "100%", "30%"] }}
                                                        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                                        className="w-[2.5px] bg-white rounded-full shadow-sm"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Track Info */}
                                <div className="flex-1 min-w-0" onClick={() => setFullScreenPlayerOpen(true)}>
                                    <p className="text-[14px] font-bold text-white truncate tracking-tight">{currentTrack.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[11px] text-white/40 font-medium truncate">{currentTrack.artist?.name}</p>
                                        <div className="w-1 h-1 rounded-full bg-brand/50" />
                                        <span className="text-[9px] text-brand/80 font-black uppercase tracking-widest">Hi-Fi</span>
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-1 shrink-0 bg-white/[0.03] p-1.5 rounded-full border border-white/5">
                                    <button onClick={playPrev} className="w-9 h-9 flex items-center justify-center text-white/40 active:text-white active:scale-90 transition-all">
                                        <SkipBack size={18} fill="currentColor" className="stroke-0" />
                                    </button>
                                    <button
                                        onClick={togglePlay}
                                        className="w-10 h-10 rounded-full bg-brand flex items-center justify-center shadow-[0_4px_16px_rgba(var(--accent-brand-rgb),0.5)] active:scale-90 transition-all group"
                                    >
                                        {isPlaying
                                            ? <Pause size={18} fill="white" className="text-white group-active:scale-110 transition-transform" />
                                            : <Play size={18} fill="white" className="text-white ml-0.5 group-active:scale-110 transition-transform" />
                                        }
                                    </button>
                                    <button onClick={playNext} className="w-9 h-9 flex items-center justify-center text-white/40 active:text-white active:scale-90 transition-all">
                                        <SkipForward size={18} fill="currentColor" className="stroke-0" />
                                    </button>
                                    <div className="w-[1px] h-4 bg-white/10 mx-1" />
                                    <button
                                        onClick={() => setAudioFxOpen(true)}
                                        className="w-9 h-9 flex items-center justify-center text-white/40 active:text-brand hover:text-brand/80 transition-all"
                                    >
                                        <Settings2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Studio FX Bottom Sheet ──────────────────── */}
            <AnimatePresence>
                {isAudioFxOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]"
                            onClick={() => setAudioFxOpen(false)}
                        />

                        {/* Sheet */}
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", stiffness: 300, damping: 32 }}
                            className="fixed bottom-0 left-0 right-0 z-[310] rounded-t-3xl overflow-hidden"
                        >
                            {/* Handle */}
                            <div className="bg-[#111114] flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1 rounded-full bg-white/20" />
                            </div>

                            {/* Header */}
                            <div className="bg-[#111114] flex items-center justify-between px-5 pb-3 border-b border-white/5">
                                <span className="text-[11px] font-black uppercase tracking-widest text-brand">Studio Engine</span>
                                <button onClick={() => setAudioFxOpen(false)} className="text-white/30 active:text-white">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* FX Content — scrollable */}
                            <div className="bg-[#111114] max-h-[70vh] overflow-y-auto overscroll-contain pb-safe">
                                <AudioFxMenu />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
