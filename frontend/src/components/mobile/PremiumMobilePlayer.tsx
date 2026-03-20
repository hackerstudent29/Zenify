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
import { NativePlayerService } from "@/services/NativePlayerService";
import { Capacitor } from "@capacitor/core";

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

export function PremiumMobilePlayer() {
    const { 
        isFullScreenPlayerOpen, 
        setFullScreenPlayerOpen, 
        isQueueOpen, 
        setIsQueueOpen,
        setAudioFxOpen,
        isNativePlayerOpen,
        setNativePlayerOpen
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
    
    // SwiftUI-style non-linear scaling for the container and artwork
    const containerScale = useTransform(progress, [0, 1], [1, 1]); 
    const sheetRadius = useTransform(progress, [0, 1], [0, 48]); // Morph from square to rounded
    const artworkScale = useTransform(progress, [0, 1], [0.85, 1]); // Smoother, more linear growth

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

    // "Rubbery" SwiftUI Spring
    const springTransition = {
        type: "spring",
        stiffness: 450,
        damping: 42,
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
                        scale: containerScale,
                        borderRadius: isFullScreenPlayerOpen ? sheetRadius : "0",
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
                    dragElastic={0.08}
                    onDragEnd={(_, info) => {
                        const velocity = info.velocity.y;
                        const offset = info.offset.y;
                        if (isFullScreenPlayerOpen) {
                            if (offset > 180 || velocity > 600) setFullScreenPlayerOpen(false);
                            else dragY.set(0);
                        } else {
                            if (offset < -180 || velocity < -600) setFullScreenPlayerOpen(true);
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
                            className="w-full h-full object-cover scale-[1.5] blur-[64px] saturate-[180%] opacity-40 will-change-[opacity,transform]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/80 to-[#050505] z-[1]" />
                    </motion.div>

                    {/* ── Drag Handle (SwitfUI Style) ───────────────────────────── */}
                    {isFullScreenPlayerOpen && (
                        <motion.div 
                            style={{ opacity: progress }}
                            className="absolute top-2.5 left-1/2 -translate-x-1/2 w-9 h-1 bg-white/20 rounded-full z-[100]"
                        />
                    )}

                    {/* ── Mini Progress ───────────────────────────────────────────── */}
                    <motion.div 
                        style={{ opacity: reversedProgress }}
                        className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/5 z-20"
                    >
                        <motion.div 
                            className="h-full bg-white/40"
                            animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            transition={{ type: "spring", bounce: 0, duration: 0.2 }}
                        />
                    </motion.div>

                    {/* ── Main Content Container ───────────────────────────────────── */}
                    <motion.div layout className="relative z-10 flex flex-col h-full w-full">
                        
                        {/* Header: Dynamic Island Style with Slide */}
                        <motion.div 
                            style={{ opacity: progress, y: headerY }}
                            className={cn(
                                "flex items-center justify-between overflow-hidden shrink-0 h-[60px]",
                                isFullScreenPlayerOpen ? "px-6 pt-[12px] mb-6" : "hidden"
                            )}
                        >
                            <button onClick={() => setFullScreenPlayerOpen(false)} className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all">
                                <ChevronDown size={30} strokeWidth={2.5} />
                            </button>
                            
                            <div className="px-5 py-2 rounded-full bg-white/5 backdrop-blur-3xl ring-1 ring-white/10 flex flex-col items-center">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Now Playing</span>
                                <span className="text-[13px] font-bold text-white/95 truncate max-w-[180px] mt-0.5">{currentTrack.album?.title || "Single"}</span>
                            </div>

                            <button className="w-10 h-10 flex items-center justify-center text-white/50 active:scale-75 transition-all">
                                <MoreVertical size={22} strokeWidth={2.5} />
                            </button>
                        </motion.div>

                        {/* Shared Transition Body */}
                        <motion.div 
                            layout
                            className={cn(
                                "flex flex-1 min-h-0 w-full",
                                isFullScreenPlayerOpen ? "flex-col items-center px-10 h-full" : "flex-row items-center px-4 h-full"
                            )}
                            onClick={() => !isFullScreenPlayerOpen && setFullScreenPlayerOpen(true)}
                        >
                            {/* Artwork: High-Fidelity Matched Geometry */}
                            <motion.div 
                                layout
                                style={{ scale: artworkScale }}
                                className={cn(
                                    "shrink-0 shadow-[0_40px_100px_rgba(0,0,0,0.6)]",
                                    isFullScreenPlayerOpen 
                                        ? "w-full max-w-[345px] aspect-square rounded-[36px] mb-8 ring-1 ring-white/10" 
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

                            {/* Text Group */}
                            <div className={cn(
                                "flex flex-1 min-w-0 h-full",
                                isFullScreenPlayerOpen ? "w-full items-center justify-between mb-8" : "ml-3 items-center"
                            )}>
                                <div className="flex flex-col min-w-0 flex-1 justify-center">
                                    <motion.h2 
                                        layoutId="player-title"
                                        className={cn(
                                            "font-bold text-white leading-tight truncate",
                                            isFullScreenPlayerOpen ? "text-[27px] tracking-tight" : "text-[15px]"
                                        )}
                                        transition={springTransition}
                                    >
                                        {currentTrack.title}
                                    </motion.h2>
                                    <motion.p 
                                        layoutId="player-artist"
                                        className={cn(
                                            "text-white/40 truncate",
                                            isFullScreenPlayerOpen ? "text-[21px] mt-1" : "text-[13px] mt-0.5"
                                        )}
                                        transition={springTransition}
                                    >
                                        {currentTrack.artist?.name || "Unknown Artist"}
                                    </motion.p>
                                </div>

                                {/* Full View Favorite Heart */}
                                <motion.button 
                                    style={{ opacity: progress }}
                                    className={cn("shrink-0 ml-4 p-2", !isFullScreenPlayerOpen && "hidden")}
                                >
                                    <div className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-full text-white active:scale-90 transition-all">
                                        <Heart size={26} strokeWidth={2.5} />
                                    </div>
                                </motion.button>

                                {/* Mini View Controls */}
                                <motion.div 
                                    style={{ opacity: reversedProgress }}
                                    className={cn("flex items-center gap-2 shrink-0 pr-2", isFullScreenPlayerOpen && "hidden")}
                                >
                                    <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-11 h-11 flex items-center justify-center text-white active:scale-90">
                                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="w-11 h-11 flex items-center justify-center text-white active:scale-90">
                                        <SkipForward size={28} fill="currentColor" />
                                    </button>
                                </motion.div>
                            </div>
                        </motion.div>

                            {/* Full View Controls: Staggered Slide-Up */}
                            <motion.div 
                                style={{ opacity: progress, y: controlsY }}
                                className={cn("w-full flex-col", !isFullScreenPlayerOpen ? "hidden" : "flex")}
                            >
                                {/* Scrubber: SwiftUI Weighted Slider */}
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
                                        <Slider.Track className="relative grow rounded-full h-[7px] bg-white/10 overflow-hidden">
                                            <Slider.Range className="absolute rounded-full h-full bg-white/60" />
                                        </Slider.Track>
                                        <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow-2xl ring-6 ring-white/5 focus:outline-none transition-transform active:scale-150" />
                                    </Slider.Root>
                                    <div className="flex justify-between mt-1 tabular-nums text-[12px] font-bold text-white/20">
                                        <span>{formatTime(localTime)}</span>
                                        <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                                    </div>
                                </div>

                                {/* Main Controls */}
                                <div className="flex items-center justify-between px-2 mb-14">
                                    <button 
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            playPrev();
                                        }} 
                                        className="p-4 text-white active:scale-75 transition-all"
                                    >
                                        <SkipBack size={46} fill="currentColor" strokeWidth={0} />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                                        className="w-22 h-22 rounded-full bg-white flex items-center justify-center text-black active:scale-90 transition-transform shadow-[0_20px_50px_rgba(255,255,255,0.1)]"
                                    >
                                        {isPlaying ? <Pause size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" className="ml-1.5" />}
                                    </button>
                                    <button 
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            playNext(true);
                                        }} 
                                        className="p-4 text-white active:scale-75 transition-all"
                                    >
                                        <SkipForward size={46} fill="currentColor" strokeWidth={0} />
                                    </button>
                                </div>

                                {/* Utility Row */}
                                <div className="flex items-center justify-around pb-12">
                                    <button onClick={() => setAudioFxOpen(true)} className="w-12 h-12 flex items-center justify-center text-white/40 active:text-white active:scale-75 transition-all">
                                        <Sparkles size={22} />
                                    </button>
                                    <button className="w-12 h-12 flex items-center justify-center text-white/40 active:text-white active:scale-75 transition-all">
                                        <Share2 size={22} />
                                    </button>
                                    <button onClick={() => setIsQueueOpen(!isQueueOpen)} className={cn("w-12 h-12 flex items-center justify-center transition-all active:scale-75", isQueueOpen ? "text-[#ff2d55]" : "text-white/40")}>
                                        <ListMusic size={24} />
                                    </button>
                                </div>
                             </motion.div>
                         </motion.div>
                     </motion.div>
                 )}
             </AnimatePresence>
         );
     }
