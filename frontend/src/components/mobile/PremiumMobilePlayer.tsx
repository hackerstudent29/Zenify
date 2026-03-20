"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { 
    Play, Pause, SkipBack, SkipForward, 
    Heart, MoreVertical, ChevronDown,
    ListMusic, Sparkles, Share2, Volume2
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

export function PremiumMobilePlayer() {
    const { 
        isFullScreenPlayerOpen, 
        setFullScreenPlayerOpen, 
        isQueueOpen, 
        setIsQueueOpen,
        setAudioFxOpen 
    } = useUIStore();
    
    const { 
        currentTrack, 
        isPlaying, 
        togglePlay, 
        playNext, 
        playPrev, 
        currentTime, 
        duration,
        setCurrentTime 
    } = usePlayerStore();

    // ── Gesture Animation State ──────────────────────────────────────────
    const dragY = useMotionValue(0);
    
    // Smooth progress map
    const progress = useTransform(
        dragY, 
        isFullScreenPlayerOpen ? [0, 500] : [0, -500], 
        isFullScreenPlayerOpen ? [1, 0] : [0, 1]
    );

    const reversedProgress = useTransform(progress, [0, 1], [1, 0]);
    const bgOpacity = useTransform(progress, [0, 1], [0, 0.9]);
    const controlsY = useTransform(progress, [0, 1], [60, 0]);
    const headerY = useTransform(progress, [0, 1], [-20, 0]);
    const imageScale = useTransform(progress, [0, 1], [1, 1]); // Base scale

    useEffect(() => {
        dragY.set(0);
    }, [isFullScreenPlayerOpen, dragY]);

    const [localTime, setLocalTime] = useState(currentTime);
    useEffect(() => {
        setLocalTime(currentTime);
    }, [currentTime]);

    const formatTime = (s: number) => {
        if (!s || isNaN(s)) return "0:00";
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const remaining = (duration || 0) - localTime;

    if (!currentTrack) return null;

    // High-quality spring config (Motion.dev standard)
    const springTransition = {
        type: "spring",
        stiffness: 260,
        damping: 28,
        mass: 1,
    } as const;

    return (
        <AnimatePresence mode="wait">
            {currentTrack && (
                <motion.div
                    key="player-sheet"
                    layout
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    style={{ 
                        y: dragY,
                        backfaceVisibility: "hidden",
                        willChange: "transform, border-radius"
                    }}
                    className={cn(
                        "fixed left-0 right-0 z-[999] overflow-hidden select-none touch-none",
                        isFullScreenPlayerOpen 
                            ? "inset-0 bg-[#050505]" 
                            : "bottom-[calc(64px+env(safe-area-inset-bottom,0px))] h-[64px] bg-[#1c1c1e]/98 backdrop-blur-2xl border-t border-white/5 shadow-2xl"
                    )}
                    transition={springTransition}
                    drag="y"
                    dragConstraints={isFullScreenPlayerOpen ? { top: 0, bottom: 900 } : { top: -900, bottom: 0 }}
                    dragElastic={0.12}
                    onDragEnd={(_, info) => {
                        const velocity = info.velocity.y;
                        const offset = info.offset.y;
                        if (isFullScreenPlayerOpen) {
                            if (offset > 150 || velocity > 500) setFullScreenPlayerOpen(false);
                            else dragY.set(0);
                        } else {
                            if (offset < -150 || velocity < -500) setFullScreenPlayerOpen(true);
                            else dragY.set(0);
                        }
                    }}
                >
                {/* ── Dynamic Background ────────────────────────────────────────── */}
                <motion.div
                    style={{ opacity: bgOpacity }}
                    className="absolute inset-0 z-0 pointer-events-none"
                    initial={false}
                >
                    <img 
                        src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"} 
                        alt=""
                        className="w-full h-full object-cover scale-[2.5] blur-[100px] saturate-[180%] opacity-40"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/20 via-[#050505]/60 to-[#050505] z-[1]" />
                </motion.div>

                {/* ── Drag Handle (Dynamic Indicator) ─────────────────────────── */}
                {isFullScreenPlayerOpen && (
                    <motion.div 
                        style={{ opacity: progress }}
                        className="absolute top-2.5 left-1/2 -translate-x-1/2 w-9 h-1 bg-white/10 rounded-full z-[100]"
                    />
                )}

                {/* ── Mini Progress ───────────────────────────────────────────── */}
                <motion.div 
                    style={{ opacity: reversedProgress }}
                    className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/5 z-20"
                >
                    <motion.div 
                        className="h-full bg-white/30"
                        animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                        transition={{ type: "spring", bounce: 0, duration: 0.2 }}
                    />
                </motion.div>

                {/* ── Main Content Container ───────────────────────────────────── */}
                <div className="relative z-10 flex flex-col h-full w-full">
                    
                    {/* Header Group: Staggered Fade */}
                    <motion.div 
                        style={{ opacity: progress, y: headerY, height: isFullScreenPlayerOpen ? "auto" : 0 }}
                        className="flex items-center justify-between px-6 pt-[calc(env(safe-area-inset-top,20px)+12px)] mb-6 shrink-0 overflow-hidden"
                    >
                        <button onClick={() => setFullScreenPlayerOpen(false)} className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all">
                            <ChevronDown size={30} strokeWidth={2.5} />
                        </button>
                        
                        <div className="px-5 py-2 rounded-full bg-white/5 backdrop-blur-3xl ring-1 ring-white/10 flex flex-col items-center">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Now Playing</span>
                            <span className="text-[13px] font-bold text-white/95 truncate max-w-[180px] mt-0.5">{currentTrack.album?.title || "Single"}</span>
                        </div>

                        <button className="w-10 h-10 flex items-center justify-center text-white/50">
                            <MoreVertical size={22} strokeWidth={2.5} />
                        </button>
                    </motion.div>

                    {/* Shared Transition Body */}
                    <div 
                        className={cn(
                            "flex flex-1 min-h-0 transition-[padding] duration-500",
                            isFullScreenPlayerOpen ? "flex-col items-center px-10" : "flex-row items-center px-4"
                        )}
                        onClick={() => !isFullScreenPlayerOpen && setFullScreenPlayerOpen(true)}
                    >
                        {/* Artwork: Physical Spring */}
                        <motion.div 
                            layout
                            className={cn(
                                "shrink-0 shadow-2xl transition-all duration-500",
                                isFullScreenPlayerOpen 
                                    ? "w-full max-w-[340px] aspect-square rounded-[32px] mb-8 ring-1 ring-white/10" 
                                    : "w-11 h-11 rounded-[10px] ring-1 ring-white/5"
                            )}
                            transition={springTransition}
                        >
                            <motion.img
                                layoutId="player-artwork-img"
                                src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                className="w-full h-full object-cover rounded-[inherit]"
                                alt=""
                            />
                        </motion.div>

                        {/* Text Group */}
                        <div className={cn(
                            "flex flex-1 min-w-0 transition-all duration-500",
                            isFullScreenPlayerOpen ? "w-full items-center justify-between mb-8" : "ml-4 flex-col"
                        )}>
                            <div className="flex flex-col min-w-0 flex-1">
                                <motion.h2 
                                    layoutId="player-title"
                                    className={cn(
                                        "font-bold text-white leading-tight truncate",
                                        isFullScreenPlayerOpen ? "text-[26px] tracking-tight" : "text-[15px]"
                                    )}
                                    transition={springTransition}
                                >
                                    {currentTrack.title}
                                </motion.h2>
                                <motion.p 
                                    layoutId="player-artist"
                                    className={cn(
                                        "text-white/40 truncate",
                                        isFullScreenPlayerOpen ? "text-[20px] mt-1" : "text-[13px] mt-0.5"
                                    )}
                                    transition={springTransition}
                                >
                                    {currentTrack.artist?.name || "Unknown Artist"}
                                </motion.p>
                            </div>

                            {/* Full View Heart */}
                            <motion.button 
                                style={{ opacity: progress }}
                                className={cn("shrink-0 ml-4", !isFullScreenPlayerOpen && "hidden")}
                            >
                                <div className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-full text-white active:scale-90 transition-all">
                                    <Heart size={26} strokeWidth={2.5} />
                                </div>
                            </motion.button>

                            {/* Mini View Controls */}
                            <motion.div 
                                style={{ opacity: reversedProgress }}
                                className={cn("flex items-center gap-1 shrink-0", isFullScreenPlayerOpen && "hidden")}
                            >
                                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-11 h-11 flex items-center justify-center text-white active:scale-90">
                                    {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="w-11 h-11 flex items-center justify-center text-white active:scale-90">
                                    <SkipForward size={28} fill="currentColor" />
                                </button>
                            </motion.div>
                        </div>

                        {/* Full View Controls: Staggered Slide-Up */}
                        <motion.div 
                            style={{ opacity: progress, y: controlsY }}
                            className={cn("w-full flex-col", !isFullScreenPlayerOpen ? "hidden" : "flex")}
                        >
                            {/* Scrubber */}
                            <div className="mb-10 w-full">
                                <Slider.Root 
                                    className="relative flex items-center select-none touch-none w-full h-8 cursor-pointer"
                                    value={[localTime]} max={duration || 100} 
                                    onValueChange={(val) => setLocalTime(val[0])}
                                    onValueCommit={(val) => {
                                        const audio = audioEngine.getActiveAudioElement();
                                        if (audio) audio.currentTime = val[0];
                                        setCurrentTime(val[0]);
                                    }}
                                >
                                    <Slider.Track className="relative grow rounded-full h-[6px] bg-white/10 overflow-hidden">
                                        <Slider.Range className="absolute rounded-full h-full bg-white/60" />
                                    </Slider.Track>
                                    <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow-2xl ring-4 ring-white/5 focus:outline-none transition-transform active:scale-125" />
                                </Slider.Root>
                                <div className="flex justify-between mt-1 tabular-nums text-[12px] font-bold text-white/20">
                                    <span>{formatTime(localTime)}</span>
                                    <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                                </div>
                            </div>

                            {/* Center Controls */}
                            <div className="flex items-center justify-between px-4 mb-14">
                                <button onClick={(e) => { e.stopPropagation(); playPrev(); }} className="p-3 text-white active:scale-75 transition-all">
                                    <SkipBack size={48} fill="currentColor" strokeWidth={0} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                                    className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-black active:scale-95 transition-transform shadow-[0_30px_60px_rgba(255,255,255,0.1)]"
                                >
                                    {isPlaying ? <Pause size={42} fill="currentColor" /> : <Play size={42} fill="currentColor" className="ml-1.5" />}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="p-3 text-white active:scale-75 transition-all">
                                    <SkipForward size={48} fill="currentColor" strokeWidth={0} />
                                </button>
                            </div>

                            {/* Utility Bar */}
                            <div className="flex items-center justify-around pb-12">
                                <button onClick={() => setAudioFxOpen(true)} className="w-12 h-12 flex items-center justify-center text-white/40 active:text-white transition-colors">
                                    <Sparkles size={22} />
                                </button>
                                <button className="w-12 h-12 flex items-center justify-center text-white/40 active:text-white transition-colors">
                                    <Share2 size={22} />
                                </button>
                                <button onClick={() => setIsQueueOpen(!isQueueOpen)} className={cn("w-12 h-12 flex items-center justify-center transition-colors", isQueueOpen ? "text-brand" : "text-white/40")}>
                                    <ListMusic size={24} />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
