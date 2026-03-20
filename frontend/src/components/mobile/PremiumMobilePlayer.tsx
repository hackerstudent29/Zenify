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
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync current time with audio engine manually for smooth slider
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

    // Transition settings
    const transition = {
        duration: isFullScreenPlayerOpen ? 0.6 : 0.45,
        ease: PREMIUM_EASE,
    };

    return (
        <AnimatePresence mode="popLayout">
            <motion.div
                key="player-container"
                layout
                initial={false}
                className={cn(
                    "fixed left-0 right-0 z-[999] overflow-hidden select-none touch-none",
                    isFullScreenPlayerOpen 
                        ? "inset-0 bg-black" 
                        : "bottom-[calc(60px+env(safe-area-inset-bottom,0px)+12px)] mx-2 h-[64px] rounded-2xl bg-[#1c1c1e]/90 backdrop-blur-2xl border border-white/10 shadow-2xl"
                )}
                transition={transition}
                drag={isFullScreenPlayerOpen ? "y" : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.1}
                onDragEnd={(_, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 500) {
                        setFullScreenPlayerOpen(false);
                    }
                }}
            >
                {/* Background Blur (Full Screen Only) */}
                <AnimatePresence>
                    {isFullScreenPlayerOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-0 pointer-events-none"
                        >
                            <img 
                                src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"} 
                                alt=""
                                className="w-full h-full object-cover scale-150 blur-[80px] saturate-[180%] opacity-40"
                            />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/80 to-black" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Progress Mini Bar (Mini Player Only) */}
                {!isFullScreenPlayerOpen && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5 z-10">
                        <motion.div 
                            className="h-full bg-white/40"
                            initial={false}
                            animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                        />
                    </div>
                )}

                {/* Main Content Layout */}
                <div 
                    className={cn(
                        "relative z-10 flex h-full w-full",
                        isFullScreenPlayerOpen ? "flex-col pt-[max(env(safe-area-inset-top),40px)]" : "items-center px-3"
                    )}
                    onClick={() => !isFullScreenPlayerOpen && setFullScreenPlayerOpen(true)}
                >
                    {/* Full Screen Header */}
                    {isFullScreenPlayerOpen && (
                        <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-between px-6 mb-8"
                        >
                            <button 
                                onClick={(e) => { e.stopPropagation(); setFullScreenPlayerOpen(false); }}
                                className="w-10 h-10 flex items-center justify-center text-white/60 active:scale-90 transition-transform"
                            >
                                <ChevronDown size={28} />
                            </button>
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Now Playing</span>
                                <span className="text-[12px] font-medium text-white/80 truncate max-w-[200px]">{currentTrack.album?.title || "Zenify Single"}</span>
                            </div>
                            <button className="w-10 h-10 flex items-center justify-center text-white/60">
                                <MoreVertical size={20} />
                            </button>
                        </motion.div>
                    )}

                    {/* Album Art Section */}
                    <div 
                        className={cn(
                            "flex items-center shrink-0",
                            isFullScreenPlayerOpen 
                                ? "flex-1 justify-center px-10 pb-8" 
                                : "w-12 h-12"
                        )}
                    >
                        <motion.div
                            layout
                            layoutId="player-artwork"
                            className={cn(
                                "relative overflow-hidden shadow-2xl transition-shadow duration-500",
                                isFullScreenPlayerOpen 
                                    ? "w-full max-w-[340px] aspect-square rounded-2xl shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)]" 
                                    : "w-12 h-12 rounded-lg ring-1 ring-white/10"
                            )}
                            transition={transition}
                        >
                            <motion.img
                                layout
                                src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                className="w-full h-full object-cover"
                                alt=""
                            />
                        </motion.div>
                    </div>

                    {/* Track Info (Shared Layout) */}
                    <div 
                        className={cn(
                            "flex flex-col",
                            isFullScreenPlayerOpen 
                                ? "px-10 mb-8" 
                                : "flex-1 min-w-0 ml-3"
                        )}
                    >
                        <motion.div layout className="flex flex-col">
                            <motion.h2 
                                layoutId="player-title"
                                className={cn(
                                    "font-bold text-white leading-tight truncate",
                                    isFullScreenPlayerOpen ? "text-[24px]" : "text-[14px]"
                                )}
                                transition={transition}
                            >
                                {currentTrack.title}
                            </motion.h2>
                            <motion.p 
                                layoutId="player-artist"
                                className={cn(
                                    "text-white/60 truncate",
                                    isFullScreenPlayerOpen ? "text-[18px] mt-1" : "text-[12px]"
                                )}
                                transition={transition}
                            >
                                {currentTrack.artist?.name || "Unknown Artist"}
                            </motion.p>
                        </motion.div>
                    </div>

                    {/* Full Player Extras (Progress, Volume, etc.) */}
                    {isFullScreenPlayerOpen && (
                        <div className="px-10 mb-8 w-full">
                            {/* Progress Bar - Delayed Staggered entry */}
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25, duration: 0.5, ease: PREMIUM_EASE }}
                                className="mb-8"
                            >
                                <Slider.Root 
                                    className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer"
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
                                    <Slider.Track className="relative grow rounded-full h-[4px] bg-white/15">
                                        <Slider.Range className="absolute rounded-full h-full bg-white/90" />
                                    </Slider.Track>
                                    <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow-lg ring-4 ring-white/10 focus:outline-none focus:scale-125 transition-transform" />
                                </Slider.Root>
                                <div className="flex justify-between mt-2 tabular-nums text-[11px] font-medium text-white/30 uppercase tracking-widest">
                                    <span>{formatTime(localTime)}</span>
                                    <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                                </div>
                            </motion.div>

                            {/* Main Controls - Springy Staggered entry */}
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ delay: 0.35, duration: 0.6, type: "spring", damping: 15 }}
                                className="flex items-center justify-between px-2 mb-10"
                            >
                                <button 
                                    onClick={(e) => { e.stopPropagation(); playPrev(); }}
                                    className="p-3 text-white active:scale-90 transition-transform"
                                >
                                    <SkipBack size={36} fill="currentColor" strokeWidth={0} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); audioEngine.resume(); togglePlay(); }}
                                    className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-black active:scale-95 transition-transform shadow-2xl"
                                >
                                    {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); playNext(true); }}
                                    className="p-3 text-white active:scale-90 transition-transform"
                                >
                                    <SkipForward size={36} fill="currentColor" strokeWidth={0} />
                                </button>
                            </motion.div>

                            {/* Footer Controls - Simple Fade Staggered entry */}
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5, duration: 0.5 }}
                                className="flex items-center justify-around pb-8 pt-4 border-t border-white/5"
                            >
                                <button 
                                    onClick={() => setAudioFxOpen(true)}
                                    className="flex flex-col items-center gap-1.5 text-white/40 active:text-white transition-colors"
                                >
                                    <Sparkles size={22} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Audio FX</span>
                                </button>
                                <button className="flex flex-col items-center gap-1.5 text-white/40 active:text-white transition-colors">
                                    <Share2 size={22} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Share</span>
                                </button>
                                <button 
                                    onClick={() => setIsQueueOpen(!isQueueOpen)}
                                    className={cn("flex flex-col items-center gap-1.5 transition-colors", isQueueOpen ? "text-brand" : "text-white/40")}
                                >
                                    <ListMusic size={22} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Queue</span>
                                </button>
                            </motion.div>
                        </div>
                    )}

                    {/* Mini Player Controls */}
                    {!isFullScreenPlayerOpen && (
                        <div className="flex items-center gap-1 ml-auto">
                            <button
                                onClick={(e) => { e.stopPropagation(); audioEngine.resume(); togglePlay(); }}
                                className="w-12 h-12 flex items-center justify-center text-white active:scale-90 transition-all"
                            >
                                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); playNext(true); }}
                                className="w-12 h-12 flex items-center justify-center text-white active:scale-90 transition-all"
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
