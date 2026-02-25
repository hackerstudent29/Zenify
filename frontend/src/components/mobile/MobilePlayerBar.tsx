"use client";

import { usePlayerStore } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, Settings2, X } from "lucide-react";
import { getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { useState, useCallback } from "react";
import { AudioFxMenu } from "@/components/player/audio-fx-menu";

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
    const [showFx, setShowFx] = useState(false);

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
                        <div className="bg-[#111114]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.6)] overflow-hidden">

                            {/* ── Seek Slider ─────────────────────────────── */}
                            <div className="px-4 pt-3 pb-1">
                                <Slider.Root
                                    className="relative flex items-center select-none w-full h-5 cursor-pointer touch-none"
                                    value={[currentTime]}
                                    max={duration || 1}
                                    step={0.5}
                                    onValueChange={handleSeek}
                                >
                                    <Slider.Track className="relative grow rounded-full h-[3px] bg-white/10">
                                        <Slider.Range className="absolute h-full rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
                                    </Slider.Track>
                                    <Slider.Thumb className="block w-4 h-4 rounded-full bg-white shadow-[0_0_8px_rgba(244,63,94,0.6)] border-2 border-rose-500 focus:outline-none" />
                                </Slider.Root>

                                {/* Time labels */}
                                <div className="flex justify-between mt-0.5">
                                    <span className="text-[9px] text-white/30 font-bold tabular-nums">{formatTime(currentTime)}</span>
                                    <span className="text-[9px] text-white/30 font-bold tabular-nums">{formatTime(duration)}</span>
                                </div>
                            </div>

                            {/* ── Main Row ─────────────────────────────────── */}
                            <div className="flex items-center gap-2 px-3 pb-3">
                                {/* Album Art */}
                                <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-lg">
                                    <img
                                        src={getMediaUrl(currentTrack.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200"}
                                        className="w-full h-full object-cover"
                                        alt=""
                                    />
                                    {isPlaying && (
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <div className="flex items-end gap-[2px] h-3">
                                                {[0.2, 0.4, 0.1, 0.3].map((delay, i) => (
                                                    <motion.div
                                                        key={i}
                                                        animate={{ scaleY: [0.3, 1, 0.3] }}
                                                        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                                        style={{ originY: 1 }}
                                                        className="w-[2px] h-full bg-rose-500 rounded-full"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Track Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-bold text-white truncate leading-tight">{currentTrack.title}</p>
                                    <p className="text-[10px] text-white/40 truncate mt-0.5">{currentTrack.artist?.name}</p>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button onClick={playPrev} className="w-8 h-8 flex items-center justify-center text-white/40 active:text-white">
                                        <SkipBack size={16} />
                                    </button>
                                    <button
                                        onClick={togglePlay}
                                        className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.4)] active:scale-95 transition-transform"
                                    >
                                        {isPlaying
                                            ? <Pause size={16} fill="white" className="text-white" />
                                            : <Play size={16} fill="white" className="text-white ml-0.5" />
                                        }
                                    </button>
                                    <button onClick={playNext} className="w-8 h-8 flex items-center justify-center text-white/40 active:text-white">
                                        <SkipForward size={16} />
                                    </button>

                                    {/* Studio FX */}
                                    <button
                                        onClick={() => setShowFx(true)}
                                        className="w-8 h-8 flex items-center justify-center text-white/40 active:text-rose-500 transition-colors"
                                    >
                                        <Settings2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Studio FX Bottom Sheet ──────────────────── */}
            <AnimatePresence>
                {showFx && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]"
                            onClick={() => setShowFx(false)}
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
                                <span className="text-[11px] font-black uppercase tracking-widest text-rose-500">Studio Engine</span>
                                <button onClick={() => setShowFx(false)} className="text-white/30 active:text-white">
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
