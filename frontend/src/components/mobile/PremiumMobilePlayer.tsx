"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { 
    Play, Pause, SkipBack, SkipForward, 
    Heart, MoreVertical, ChevronDown, User,
    ListMusic, Sparkles, Share2, Mic2
} from "lucide-react";
import { getMediaUrl, cn, getTrackCover } from "@/lib/utils";
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

function LyricsView({ trackId, title, artist, currentTime, isLyricsOpen, rawLyrics }: any) {
    const { data, isLoading } = useQuery({
        queryKey: ['lyrics', trackId],
        queryFn: async () => {
            const res = await api.get(`/metadata/sync-lyrics`, {
                params: { title, artist, rawLyrics }
            });
            return res.data?.syncedTokens || [];
        },
        enabled: isLyricsOpen && !!title,
        staleTime: 1000 * 60 * 60,
    });

    const lines = data || [];

    // Find active index
    let activeIndex = lines.length > 0 ? 0 : -1;
    for (let i = 0; i < lines.length; i++) {
        if (currentTime >= lines[i].time) activeIndex = i;
        else break;
    }

    if (!isLyricsOpen) return null;
    if (isLoading) return (
        <div className="flex items-center justify-center h-full">
            <div className="flex flex-col gap-4 w-full px-8 animate-pulse">
                <div className="h-6 w-2/3 bg-white/10 rounded-xl mx-auto" />
                <div className="h-8 w-full bg-white/20 rounded-xl mx-auto" />
                <div className="h-6 w-1/2 bg-white/10 rounded-xl mx-auto" />
            </div>
        </div>
    );
    if (!lines.length) return (
        <div className="h-full flex items-center justify-center text-white/20 text-xs font-bold uppercase tracking-widest text-center p-8">
            Lyrics Unavailable
        </div>
    );

    // Show only prev, current, next
    const visibleLines = [
        { index: activeIndex - 1, line: lines[activeIndex - 1] },
        { index: activeIndex,     line: lines[activeIndex] },
        { index: activeIndex + 1, line: lines[activeIndex + 1] },
    ].filter(({ line }) => !!line);

    return (
        <div className="h-full w-full flex flex-col items-center justify-center px-8 gap-5">
            <AnimatePresence mode="popLayout">
                {visibleLines.map(({ index, line }) => {
                    const isActive = index === activeIndex;
                    return (
                        <motion.p
                            key={index}
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{
                                opacity: isActive ? 1 : 0.25,
                                scale: isActive ? 1.05 : 0.95,
                                y: 0
                            }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.35 }}
                            onClick={() => {
                                const audio = document.querySelector('audio') as HTMLAudioElement;
                                if (audio) audio.currentTime = line.time;
                            }}
                            className={`text-[22px] font-bold leading-snug text-center tracking-tight cursor-pointer ${
                                isActive ? 'text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'text-white/40'
                            }`}
                        >
                            {line.text}
                        </motion.p>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

const SwipeArea = ({ onSwipeLeft, onSwipeRight, children, className }: any) => {
    return (
        <motion.div
            className={className}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0}  // No elastic effect — only song changes, no UI movement
            onDragEnd={(_, info) => {
                const threshold = 60;
                if (info.offset.x < -threshold) onSwipeLeft();
                else if (info.offset.x > threshold) onSwipeRight();
            }}
        >
            {children}
        </motion.div>
    );
};

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
    
    const artworkScale = useTransform(progress, [0, 1], [0.85, 1]); 

    const [isLyricsOpen, setIsLyricsOpen] = useState(false); 

    useEffect(() => {
        dragY.set(0);
    }, [isFullScreenPlayerOpen, dragY]);

    // ── Native Back Gesture Support ─────────────────────────────────────────
    useEffect(() => {
        const handlePopState = () => {
            if (isFullScreenPlayerOpen) {
                setFullScreenPlayerOpen(false);
            }
        };

        if (isFullScreenPlayerOpen) {
            window.history.pushState({ isMobilePlayerOpen: true }, '');
            window.addEventListener('popstate', handlePopState);
        }

        return () => {
            window.removeEventListener('popstate', handlePopState);
            // If the player closed via swiping/buttons, pop the dummy state we injected
            if (isFullScreenPlayerOpen && window.history.state?.isMobilePlayerOpen) {
                window.history.back();
            }
        };
    }, [isFullScreenPlayerOpen, setFullScreenPlayerOpen]);

    const [localTime, setLocalTime] = useState(currentTime);
    useEffect(() => {
        setLocalTime(currentTime);
    }, [currentTime]);

    // Reset Lyrics Mode on song change
    useEffect(() => {
        setIsLyricsOpen(false);
    }, [currentTrack?.id]);

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
                    // Mini player: solid dark gray matching navbar, NO blurred album art affecting color
                    : "top-auto bottom-[calc(64px+env(safe-area-inset-bottom,0px))] h-[64px] bg-[#111113] border-t border-white/[0.07] shadow-2xl"
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
            <div className="absolute inset-0 z-0 pointer-events-none">
                {isFullScreenPlayerOpen && (
                    <>
                        <img 
                            src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"} 
                            alt=""
                            className="w-full h-full object-cover scale-[1.2] blur-[40px] opacity-30 will-change-transform"
                        />
                        <div className="absolute inset-0 bg-black/80 z-[1]" />
                    </>
                )}
            </div>

            {/* ── Drag Handle ───────────────────────────── */}
            {isFullScreenPlayerOpen && (
                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-white/20 rounded-full z-[100]" />
            )}

            {/* ── Mini Progress ───────────────────────────────────────────── */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5 z-20">
                <motion.div 
                    className="h-full bg-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]"
                    animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    transition={{ duration: 1.1, ease: "linear" }}
                />
            </div>

            {/* ── Main Content Container ───────────────────────────────────── */}
            <div className="relative z-10 flex flex-col h-full w-full overflow-hidden">
                
                {/* Header */}
                <motion.div 
                    style={{ opacity: progress }}
                    className={cn(
                        "flex items-center justify-start shrink-0 h-0 overflow-hidden z-50",
                        isFullScreenPlayerOpen && "px-6 pt-[calc(env(safe-area-inset-top,20px)+32px)] mb-3 h-auto opacity-100"
                    )}
                >
                    <button 
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            setFullScreenPlayerOpen(false);
                            dragY.set(0);
                        }} className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all">
                        <ChevronDown size={30} strokeWidth={2.5} />
                    </button>
                </motion.div>

                {/* Body */}
                <motion.div
                    className={cn(
                        "flex flex-1 min-h-0 w-full relative",
                        isFullScreenPlayerOpen ? "flex-col items-center px-10 h-full" : "flex-row items-center px-2.5 h-[64px]"
                    )}
                    onClick={() => {
                        if (!isFullScreenPlayerOpen) {
                            setFullScreenPlayerOpen(true);
                        }
                    }}
                >
                    {/* Artwork Container */}
                    <div
                        className={cn(
                            "relative flex items-center justify-center pt-8",
                            isFullScreenPlayerOpen ? "w-full shrink-0" : "w-12 h-12"
                        )}
                        style={{ perspective: isFullScreenPlayerOpen ? 1200 : undefined }}
                        onClick={(e) => {
                            if (isFullScreenPlayerOpen) {
                                e.stopPropagation();
                                setIsLyricsOpen(!isLyricsOpen);
                            }
                        }}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            {isFullScreenPlayerOpen && isLyricsOpen ? (
                                <motion.div
                                    key="lyrics"
                                    initial={{ opacity: 0, rotateY: 90, scale: 0.9 }}
                                    animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                                    exit={{ opacity: 0, rotateY: -90, scale: 0.9 }}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                    className="w-full h-full flex items-center justify-center p-6"
                                >
                                    <LyricsView
                                        trackId={currentTrack.id}
                                        title={currentTrack.title}
                                        artist={currentTrack.artist?.name}
                                        rawLyrics={currentTrack.lyrics}
                                        currentTime={localTime}
                                        isLyricsOpen={isLyricsOpen}
                                    />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key={currentTrack.id}
                                    initial={isFullScreenPlayerOpen ? { opacity: 0, rotateY: -90, scale: 0.9 } : { x: 0 }}
                                    animate={{ opacity: 1, rotateY: 0, scale: 1, x: 0 }}
                                    exit={isFullScreenPlayerOpen ? { opacity: 0, rotateY: 90, scale: 0.9 } : undefined}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                    className="w-full h-full flex items-center justify-center"
                                >
                                    <SwipeArea
                                        onSwipeLeft={() => { if (isFullScreenPlayerOpen) playNext(true); }}
                                        onSwipeRight={() => { if (isFullScreenPlayerOpen) playPrev(); }}
                                        className="w-full h-full flex items-center justify-center"
                                    >
                                        <motion.div 
                                            style={{ scale: isFullScreenPlayerOpen ? artworkScale : 1 }}
                                            className="shrink-0 flex items-center justify-center px-6"
                                            transition={springTransition}
                                        >
                                            <motion.div
                                                animate={{ scale: isFullScreenPlayerOpen && !isPlaying ? 0.85 : 1 }}
                                                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                                className={cn(
                                                    "shadow-2xl overflow-hidden",
                                                    isFullScreenPlayerOpen
                                                        ? "w-[min(80vw,330px)] aspect-square rounded-2xl origin-center"
                                                        : "w-12 h-12 rounded-[10px] ring-1 ring-white/5"
                                                )}
                                            >
                                                <motion.img
                                                    layoutId="player-artwork-img"
                                                    src={getTrackCover(currentTrack)}
                                                    className="w-full h-full object-cover"
                                                    alt=""
                                                />
                                            </motion.div>
                                        </motion.div>
                                    </SwipeArea>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Text Area (Mini) */}
                    {!isFullScreenPlayerOpen && (
                        <SwipeArea
                            onSwipeLeft={() => playNext(true)}
                            onSwipeRight={() => playPrev()}
                            className="flex flex-1 items-center ml-2.5 min-w-0"
                        >
                            <div className="flex flex-col min-w-0 flex-1 justify-center">
                                <h2 className="font-bold text-white text-[14px] truncate tracking-tight">
                                    {currentTrack.title}
                                </h2>
                                <p className="text-white/40 text-[12.5px] truncate font-medium mt-0.5">
                                    {currentTrack.artist?.name || "Unknown Artist"}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 pr-0.5" onPointerDown={(e) => e.stopPropagation()}>
                                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-all">
                                    {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-all">
                                    <SkipForward size={26} fill="currentColor" />
                                </button>
                            </div>
                        </SwipeArea>
                    )}
                </motion.div>

                {/* Full View Controls Content (Includes Title/Artist moved back down) */}
                <motion.div
                    style={{ opacity: progress, y: controlsY }}
                    className={cn("w-full flex-col px-8 mt-auto z-10", !isFullScreenPlayerOpen ? "hidden" : "flex")}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {/* Progress Slider (Remaining in its original controls container at bottom) */}

                    {/* Scrubber - Clean Progress Bar */}
                    <div className="mb-10 w-full px-2">
                        <Slider.Root
                            className="relative flex items-center select-none touch-none w-full h-6 cursor-pointer"
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
                            <Slider.Track className="relative grow rounded-full h-[3.5px] bg-white/5 overflow-hidden">
                                <Slider.Range className="absolute rounded-full h-full bg-white/50 shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
                            </Slider.Track>
                            <Slider.Thumb className="block w-4 h-4 bg-white rounded-full shadow-2xl focus:outline-none transition-transform active:scale-125 border-2 border-transparent" />
                        </Slider.Root>
                        <div className="flex justify-between mt-2 tabular-nums text-[11px] font-bold text-white/20 tracking-wider">
                            <span>{formatTime(localTime)}</span>
                            <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                        </div>
                    </div>

                    {/* Main Controls - Large Touch Friendly Buttons */}
                    <div className="flex items-center justify-center gap-10 mb-10">
                        <button onClick={(e) => { e.stopPropagation(); playPrev(); }} className="w-14 h-14 flex items-center justify-center text-white/90 active:scale-75 transition-all outline-none">
                            <SkipBack size={32} fill="currentColor" strokeWidth={0} />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            className="w-20 h-20 flex items-center justify-center text-white active:scale-90 transition-transform bg-white/5 rounded-full outline-none"
                        >
                            {isPlaying ? <Pause size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" className="ml-2" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="w-14 h-14 flex items-center justify-center text-white/90 active:scale-75 transition-all outline-none">
                            <SkipForward size={32} fill="currentColor" strokeWidth={0} />
                        </button>
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-between mb-8 px-2 w-full max-w-[340px] mx-auto opacity-70">
                        <button className="w-11 h-11 flex items-center justify-center text-white/60 active:text-white transition-all">
                            <Heart size={22} className="stroke-[2.5px]" />
                        </button>
                        <button onClick={() => setAudioFxOpen(true)} className="w-11 h-11 flex items-center justify-center text-white/60 active:text-white transition-all">
                            <Sparkles size={22} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setIsLyricsOpen(!isLyricsOpen); }} className={cn("w-11 h-11 flex items-center justify-center transition-all", isLyricsOpen ? "text-brand" : "text-white/60")}>
                            <Mic2 size={24} />
                        </button>
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                setIsQueueOpen(!isQueueOpen);
                            }} 
                            className={cn("w-11 h-11 flex items-center justify-center transition-all", isQueueOpen ? "text-brand" : "text-white/60")}
                        >
                            <ListMusic size={24} />
                        </button>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
