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

    const queryClient = useQueryClient();

    // Sync current time manually for smooth slider response
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

    // Premium Transition Configuration
    const transition = {
        type: "spring",
        stiffness: 260,
        damping: 32,
        mass: 1,
        ease: PREMIUM_EASE,
    } as const;

    return (
        <AnimatePresence>
            <motion.div
                key="player-sheet"
                layout
                initial={false}
                className={cn(
                    "fixed left-0 right-0 z-[999] overflow-hidden select-none touch-none",
                    isFullScreenPlayerOpen 
                        ? "inset-0 bg-[#0a0a0b]" 
                        : "bottom-[calc(64px+env(safe-area-inset-bottom,0px)+12px)] mx-3 h-[64px] rounded-[24px] bg-[#1c1c1e]/90 backdrop-blur-3xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
                )}
                transition={transition}
                drag="y"
                dragConstraints={isFullScreenPlayerOpen ? { top: 0, bottom: 0 } : { top: -10, bottom: 0 }}
                dragElastic={isFullScreenPlayerOpen ? 0.08 : 0.05}
                onDragEnd={(_, info) => {
                    // Drag Down to Close
                    if (isFullScreenPlayerOpen) {
                        if (info.offset.y > 100 || info.velocity.y > 600) {
                            setFullScreenPlayerOpen(false);
                        }
                    } 
                    // Drag Up to Open
                    else {
                        if (info.offset.y < -50 || info.velocity.y < -300) {
                            setFullScreenPlayerOpen(true);
                        }
                    }
                }}
            >
                {/* ── Dynamic Background ────────────────────────────────────────── */}
                <AnimatePresence>
                    {isFullScreenPlayerOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
                            transition={{ duration: 0.8 }}
                        >
                            <img 
                                src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"} 
                                alt=""
                                className="w-full h-full object-cover scale-[1.8] blur-[120px] saturate-[200%] opacity-30"
                            />
                            {/* Layered gradients for that premium Apple Music mesh look */}
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0b]/40 to-[#0a0a0b] z-[1]" />
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05)_0%,transparent_50%)] z-[2]" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Mini Progress Line ────────────────────────────────────────── */}
                {!isFullScreenPlayerOpen && (
                    <div className="absolute top-0 left-[20px] right-[20px] h-[1px] bg-white/5 z-20">
                        <motion.div 
                            className="h-full bg-white/30"
                            initial={false}
                            animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                        />
                    </div>
                )}

                {/* ── Container Content ─────────────────────────────────────────── */}
                <div 
                    className={cn(
                        "relative z-10 flex h-full w-full",
                        isFullScreenPlayerOpen ? "flex-col pt-[calc(max(env(safe-area-inset-top),40px)+12px)]" : "items-center px-4"
                    )}
                    onClick={() => !isFullScreenPlayerOpen && setFullScreenPlayerOpen(true)}
                >
                    {/* Full Screen Header Controls */}
                    {isFullScreenPlayerOpen && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ delay: 0.1, duration: 0.4 }}
                            className="flex items-center justify-between px-6 mb-12 w-full"
                        >
                            <button 
                                onClick={(e) => { e.stopPropagation(); setFullScreenPlayerOpen(false); }}
                                className="w-10 h-10 flex items-center justify-center text-white/50 active:scale-90 active:text-white transition-all"
                            >
                                <ChevronDown size={32} />
                            </button>
                            <div className="flex flex-col items-center">
                                <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/25">Now Playing</span>
                                <span className="text-[13px] font-bold text-white/90 truncate max-w-[180px] mt-0.5">{currentTrack.album?.title || "Single"}</span>
                            </div>
                            <button className="w-10 h-10 flex items-center justify-center text-white/50">
                                <MoreVertical size={22} strokeWidth={2.5} />
                            </button>
                        </motion.div>
                    )}

                    {/* Artwork Container (The main shared element) */}
                    <motion.div 
                        layout
                        className={cn(
                            "flex shrink-0 transition-all duration-700",
                            isFullScreenPlayerOpen ? "flex-1 justify-center px-10 pb-12" : "w-11 h-11"
                        )}
                    >
                        <motion.div
                            layoutId="player-artwork-wrap"
                            className={cn(
                                "relative overflow-hidden shadow-2xl transition-all duration-500",
                                isFullScreenPlayerOpen 
                                    ? "w-full max-w-[340px] aspect-square rounded-[28px] shadow-[0_40px_80px_rgba(0,0,0,0.9)] scale-100" 
                                    : "w-11 h-11 rounded-[10px] ring-1 ring-white/5"
                            )}
                            transition={transition}
                        >
                            <motion.img
                                layoutId="player-artwork-img"
                                src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                className="w-full h-full object-cover"
                                alt=""
                            />
                        </motion.div>
                    </motion.div>

                    {/* Track Details Layer */}
                    <div 
                        className={cn(
                            "flex",
                            isFullScreenPlayerOpen ? "flex-col px-10 mb-10 w-full" : "flex-1 min-w-0 ml-4 h-full items-center"
                        )}
                    >
                        <motion.div layout className="flex flex-col flex-1 min-w-0">
                            <motion.h2 
                                layoutId="player-title"
                                className={cn(
                                    "font-bold text-white leading-tight truncate",
                                    isFullScreenPlayerOpen ? "text-[26px] tracking-tight" : "text-[15px]"
                                )}
                                transition={transition}
                            >
                                {currentTrack.title}
                            </motion.h2>
                            <motion.p 
                                layoutId="player-artist"
                                className={cn(
                                    "text-white/50 truncate",
                                    isFullScreenPlayerOpen ? "text-[20px] mt-1.5" : "text-[13px] mt-0.5"
                                )}
                                transition={transition}
                            >
                                {currentTrack.artist?.name || "Unknown Artist"}
                            </motion.p>
                        </motion.div>

                        {/* Extra buttons for full screen (Like, Shuffle) */}
                        {isFullScreenPlayerOpen && (
                            <motion.div 
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 }}
                                className="absolute right-10 top-[2px] flex flex-col gap-4"
                            >
                                <button className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-full text-white active:scale-90 transition-transform">
                                    <Heart size={24} strokeWidth={2.5} />
                                </button>
                            </motion.div>
                        )}
                    </div>

                    {/* Full Screen Progressive Controls */}
                    {isFullScreenPlayerOpen && (
                        <div className="px-10 mb-10 w-full">
                            {/* Scrubber */}
                            <motion.div 
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.35, duration: 0.5, ease: PREMIUM_EASE }}
                                className="mb-12"
                            >
                                <Slider.Root 
                                    className="relative flex items-center select-none touch-none w-full h-6 cursor-pointer"
                                    value={[localTime]} 
                                    max={duration || 100} 
                                    step={1}
                                    onValueChange={(val) => setLocalTime(val[0])}
                                    onValueCommit={(val) => {
                                        const audio = audioEngine.getActiveAudioElement();
                                        if (audio) audio.currentTime = val[0];
                                        setCurrentTime(val[0]);
                                    }}
                                >
                                    <Slider.Track className="relative grow rounded-full h-[5px] bg-white/10 overflow-hidden">
                                        <Slider.Range className="absolute rounded-full h-full bg-white/60" />
                                    </Slider.Track>
                                    <Slider.Thumb className="block w-4 h-4 bg-white/90 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.4)] focus:outline-none focus:scale-150 transition-transform" />
                                </Slider.Root>
                                <div className="flex justify-between mt-3 tabular-nums text-[12px] font-bold text-white/30 tracking-tight">
                                    <span>{formatTime(localTime)}</span>
                                    <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                                </div>
                            </motion.div>

                            {/* Center Controls */}
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.45, duration: 0.6, type: "spring", damping: 18, stiffness: 120 }}
                                className="flex items-center justify-between px-2 mb-12"
                            >
                                <button 
                                    onClick={(e) => { e.stopPropagation(); playPrev(); }}
                                    className="p-4 text-white hover:text-white/80 active:scale-75 transition-all"
                                >
                                    <SkipBack size={42} fill="currentColor" strokeWidth={0} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); audioEngine.resume(); togglePlay(); }}
                                    className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-black active:scale-90 transition-transform shadow-[0_20px_50px_rgba(255,255,255,0.1)]"
                                >
                                    {isPlaying 
                                        ? <Pause size={38} fill="currentColor" /> 
                                        : <Play size={38} fill="currentColor" className="ml-1.5" />
                                    }
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); playNext(true); }}
                                    className="p-4 text-white hover:text-white/80 active:scale-75 transition-all"
                                >
                                    <SkipForward size={42} fill="currentColor" strokeWidth={0} />
                                </button>
                            </motion.div>

                            {/* Utility Bar */}
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6, duration: 0.5 }}
                                className="flex items-center justify-around pb-12 pt-6"
                            >
                                <button onClick={() => setAudioFxOpen(true)} className="flex flex-col items-center gap-2 group">
                                    <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-white/40 group-active:bg-white group-active:text-black transition-all">
                                        <Sparkles size={20} />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/20 group-active:text-white">Effect</span>
                                </button>
                                <button className="flex flex-col items-center gap-2 group">
                                    <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-white/40 group-active:bg-white group-active:text-black transition-all">
                                        <Volume2 size={20} />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/20 group-active:text-white">Volume</span>
                                </button>
                                <button onClick={() => setIsQueueOpen(!isQueueOpen)} className={cn("flex flex-col items-center gap-2 group", isQueueOpen && "text-brand")}>
                                    <div className={cn("w-10 h-10 flex items-center justify-center rounded-xl transition-all", isQueueOpen ? "bg-brand/20 text-brand" : "bg-white/5 text-white/40 group-active:bg-white group-active:text-black")}>
                                        <ListMusic size={20} />
                                    </div>
                                    <span className={cn("text-[10px] font-bold uppercase tracking-[0.15em] transition-all", isQueueOpen ? "text-brand" : "text-white/20 group-active:text-white")}>Queue</span>
                                </button>
                            </motion.div>
                        </div>
                    )}

                    {/* Mini Player Sticky Controls */}
                    {!isFullScreenPlayerOpen && (
                        <div className="flex items-center gap-1 ml-auto shrink-0">
                            <button
                                onClick={(e) => { e.stopPropagation(); audioEngine.resume(); togglePlay(); }}
                                className="w-11 h-11 flex items-center justify-center text-white active:scale-90 transition-all"
                            >
                                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); playNext(true); }}
                                className="w-11 h-11 flex items-center justify-center text-white active:scale-90 transition-all"
                            >
                                <SkipForward size={24} fill="currentColor" />
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
