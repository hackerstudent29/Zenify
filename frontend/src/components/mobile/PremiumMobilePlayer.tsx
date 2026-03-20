"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { 
    Play, Pause, SkipBack, SkipForward, 
    Heart, MoreVertical, ChevronDown, User,
    ListMusic, Sparkles, Share2, Volume2
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

export function PremiumMobilePlayer() {
    const { 
        isFullScreenPlayerOpen, 
        setFullScreenPlayerOpen, 
        isQueueOpen, 
        setIsQueueOpen,
        setAudioFxOpen,
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
        isFullScreenPlayerOpen ? [0, 400] : [0, -400], 
        isFullScreenPlayerOpen ? [1, 0] : [0, 1]
    );

    const reversedProgress = useTransform(progress, [0, 1], [1, 0]);
    const bgOpacity = useTransform(progress, [0, 1], [0, 0.9]);
    const controlsY = useTransform(progress, [0, 1], [40, 0]);
    const headerY = useTransform(progress, [0, 1], [-20, 0]);
    
    const artworkScale = useTransform(progress, [0, 1], [0.85, 1]); 

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

    const springTransition = {
        type: "spring",
        stiffness: 300,
        damping: 35,
        mass: 1,
    } as const;

    return (
        <motion.div
            key="player-sheet"
            initial={false}
            animate={{ 
                y: 0,
                borderRadius: isFullScreenPlayerOpen ? 40 : 0,
            }}
            style={{ 
                y: dragY,
                willChange: "transform"
            }}
            className={cn(
                "fixed left-0 right-0 z-[999] overflow-hidden select-none touch-none",
                isFullScreenPlayerOpen 
                    ? "top-0 bottom-0 h-auto bg-black" 
                    : "top-auto bottom-[calc(64px+env(safe-area-inset-bottom,0px))] h-[64px] bg-[#1c1c1e]/98 border-t border-white/5 shadow-2xl"
            )}
            transition={springTransition}
            drag="y"
            dragConstraints={{ top: 0, bottom: 800 }}
            dragElastic={0.05}
            onDragEnd={(_, info) => {
                const velocity = info.velocity.y;
                const offset = info.offset.y;
                if (isFullScreenPlayerOpen) {
                    if (offset > 120 || velocity > 400) {
                        setFullScreenPlayerOpen(false);
                    }
                    animate(dragY, 0, { ...springTransition, bounce: 0 });
                } else {
                    if (offset < -120 || velocity < -400) {
                        setFullScreenPlayerOpen(true);
                    }
                    animate(dragY, 0, { ...springTransition, bounce: 0 });
                }
            }}
        >
            {/* ── Dynamic Background ────────────────────────────────────────── */}
            <motion.div
                style={{ opacity: bgOpacity }}
                className="absolute inset-0 z-0 pointer-events-none"
            >
                <img 
                    src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"} 
                    alt=""
                    className="w-full h-full object-cover scale-[1.2] blur-[20px] opacity-40 will-change-transform"
                />
                <div className="absolute inset-0 bg-black/70 z-[1]" />
            </motion.div>

            {/* ── Drag Handle ───────────────────────────── */}
            {isFullScreenPlayerOpen && (
                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-9 h-1 bg-white/20 rounded-full z-[100]" />
            )}

            {/* ── Mini Progress ───────────────────────────────────────────── */}
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/5 z-20">
                <motion.div 
                    className="h-full bg-white/40"
                    animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    transition={{ duration: 1.1, ease: "linear" }}
                />
            </div>

            {/* ── Main Content Container ───────────────────────────────────── */}
            <div className="relative z-10 flex flex-col h-full w-full">
                
                {/* Header */}
                <motion.div 
                    style={{ opacity: progress, y: headerY }}
                    className={cn(
                        "flex items-center justify-between shrink-0 h-0 overflow-hidden",
                        isFullScreenPlayerOpen && "px-6 pt-[calc(env(safe-area-inset-top,20px)+12px)] mb-6 h-auto opacity-100"
                    )}
                >
                    <button onClick={() => {
                        animate(dragY, document.documentElement.clientHeight || 800, { ...springTransition, bounce: 0 }).then(() => {
                            setFullScreenPlayerOpen(false);
                            dragY.set(0);
                        });
                    }} className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all">
                        <ChevronDown size={30} strokeWidth={2.5} />
                    </button>
                    
                    <div className="px-5 py-2 rounded-full bg-white/5 backdrop-blur-3xl ring-1 ring-white/10 flex flex-col items-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Now Playing</span>
                        <span className="text-[13px] font-bold text-white/95 truncate max-w-[180px] mt-0.5">{currentTrack.album?.title || "Single"}</span>
                    </div>

                    <div className="w-10 h-10" />
                </motion.div>

                {/* Body */}
                <div 
                    className={cn(
                        "flex flex-1 min-h-0 w-full",
                        isFullScreenPlayerOpen ? "flex-col items-center px-10 h-full" : "flex-row items-center px-4 h-full"
                    )}
                    onClick={() => {
                        if (!isFullScreenPlayerOpen) {
                            setFullScreenPlayerOpen(true);
                        }
                    }}
                >
                    {/* Artwork */}
                    <motion.div 
                        style={{ scale: artworkScale }}
                        className={cn(
                            "shrink-0 shadow-[0_40px_100px_rgba(0,0,0,0.6)]",
                            isFullScreenPlayerOpen 
                                ? "w-[min(90vw,400px)] aspect-square rounded-xl mb-6 shadow-2xl" 
                                : "w-[50px] h-[50px] rounded-[10px] ring-1 ring-white/5"
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

                    {/* Text Area (Mini) */}
                    {!isFullScreenPlayerOpen && (
                        <div className="flex flex-1 items-center ml-3 min-w-0">
                            <div className="flex flex-col min-w-0 flex-1 justify-center">
                                <h2 className="font-bold text-white text-[15px] truncate">
                                    {currentTrack.title}
                                </h2>
                                <p className="text-white/40 text-[13px] truncate">
                                    {currentTrack.artist?.name || "Unknown Artist"}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 pr-1">
                                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-11 h-11 flex items-center justify-center text-white active:scale-90">
                                    {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="w-11 h-11 flex items-center justify-center text-white active:scale-90">
                                    <SkipForward size={28} fill="currentColor" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Full View Controls */}
                <motion.div 
                    style={{ opacity: progress, y: controlsY }}
                    className={cn("w-full flex-col px-6 mt-2", !isFullScreenPlayerOpen ? "hidden" : "flex")}
                >
                    {/* Text Area (Full) */}
                    <div className="flex items-center justify-between w-full mb-8 px-0">
                        <div className="flex flex-col items-start w-full min-w-0 pr-4">
                            <h2 className="font-bold text-white text-[24px] sm:text-[28px] tracking-tight truncate leading-tight w-full text-left">
                                {currentTrack.title}
                            </h2>
                            <p className="text-white/60 text-[16px] sm:text-[18px] font-medium truncate w-full mt-1 text-left">
                                {currentTrack.artist?.name || "Unknown Artist"}
                            </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            <button className="shrink-0 w-10 h-10 flex items-center justify-center bg-white/10 rounded-full text-white active:scale-90 transition-all">
                                <Heart size={20} strokeWidth={2} />
                            </button>
                            {currentTrack.artist?.id ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="shrink-0 w-10 h-10 flex items-center justify-center bg-white/10 rounded-full text-white active:scale-90 transition-all">
                                            <MoreVertical size={20} strokeWidth={2} />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-48 bg-[#1c1c1e]/95 backdrop-blur-2xl border-white/10" align="end">
                                        <DropdownMenuItem onClick={() => {
                                            animate(dragY, document.documentElement.clientHeight || 800, { type: "tween", duration: 0.3 }).then(() => {
                                                setFullScreenPlayerOpen(false);
                                                dragY.set(0);
                                                window.location.href = `/artist/${currentTrack.artist?.id}`;
                                            });
                                        }}>
                                            <User size={16} className="opacity-70 mr-2" />
                                            <span>Go to Artist</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <button className="shrink-0 w-10 h-10 flex items-center justify-center bg-white/10 rounded-full text-white active:scale-90 transition-all">
                                    <MoreVertical size={20} strokeWidth={2} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Scrubber */}
                    <div className="mb-8 w-full">
                        <Slider.Root 
                            className="relative flex items-center select-none touch-none w-full h-8 cursor-pointer"
                            value={[localTime]} max={duration || 100} 
                            onValueChange={(val) => setLocalTime(val[0])}
                            onValueCommit={(val) => {
                                const audio = audioEngine.getActiveAudioElement();
                                if (audio) {
                                    audio.currentTime = val[0];
                                    setCurrentTime(val[0]);
                                    setLocalTime(val[0]);
                                }
                            }}
                        >
                            <Slider.Track className="relative grow rounded-full h-[5px] bg-white/10 overflow-hidden">
                                <Slider.Range className="absolute rounded-full h-full bg-white/60" />
                            </Slider.Track>
                            <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-2xl focus:outline-none transition-transform active:scale-150" />
                        </Slider.Root>
                        <div className="flex justify-between mt-1 tabular-nums text-[12px] font-bold text-white/20">
                            <span>{formatTime(localTime)}</span>
                            <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                        </div>
                    </div>

                    {/* Main Controls */}
                    <div className="flex items-center justify-center gap-8 mb-8">
                        <button onClick={(e) => { e.stopPropagation(); playPrev(); }} className="p-3 text-white active:scale-75 transition-all">
                            <SkipBack size={36} fill="currentColor" strokeWidth={0} />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            className="p-3 text-white active:scale-95 transition-transform"
                        >
                            {isPlaying ? <Pause size={56} fill="currentColor" /> : <Play size={56} fill="currentColor" className="ml-1.5" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="p-3 text-white active:scale-75 transition-all">
                            <SkipForward size={36} fill="currentColor" strokeWidth={0} />
                        </button>
                    </div>

                    {/* Utility Row */}
                    <div className="flex items-center justify-around pb-12 w-full">
                        <button onClick={() => setAudioFxOpen(true)} className="w-12 h-12 flex items-center justify-center text-white/30 active:text-white active:scale-75 transition-all">
                            <Sparkles size={22} />
                        </button>
                        <button className="w-12 h-12 flex items-center justify-center text-white/30 active:text-white active:scale-75 transition-all">
                            <Share2 size={22} />
                        </button>
                        <button onClick={() => setIsQueueOpen(!isQueueOpen)} className={cn("w-12 h-12 flex items-center justify-center transition-all active:scale-75", isQueueOpen ? "text-brand" : "text-white/30")}>
                            <ListMusic size={24} />
                        </button>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
