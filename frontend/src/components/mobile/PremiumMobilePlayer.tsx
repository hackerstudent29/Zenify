"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { 
    Play, Pause, SkipBack, SkipForward, 
    Heart, MoreVertical, ChevronDown, User,
    ListMusic, Sparkles, Share2, Mic2, PlusCircle, Bookmark
} from "lucide-react";
import { useRouter } from "next/navigation";
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
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DynamicBackground } from "../player/DynamicBackground";

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
        openDownloadModal,
    } = useUIStore();
    
    const router = useRouter();
    const queryClient = useQueryClient();

    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            try {
                const res = await api.get('/tracks/liked');
                return (res.data as any[]).map((t: any) => t.id);
            } catch (e) {
                return [];
            }
        },
        staleTime: 1000 * 60 * 5,
    });

    const toggleLikeMutation = useMutation({
        mutationFn: async (trackId: string) => {
            await api.post(`/tracks/${trackId}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

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

    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

    const resetIdleTimer = useCallback(() => {
        setIsIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (isLyricsOpen) {
            idleTimerRef.current = setTimeout(() => {
                setIsIdle(true);
            }, 5000); // 5 seconds idle threshold
        }
    }, [isLyricsOpen]);

    useEffect(() => {
        if (isFullScreenPlayerOpen && isLyricsOpen) {
            const events = ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'click', 'keydown'];
            const handler = () => resetIdleTimer();
            
            events.forEach(e => window.addEventListener(e, handler));
            resetIdleTimer(); // Start timer

            return () => {
                events.forEach(e => window.removeEventListener(e, handler));
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            };
        } else {
            setIsIdle(false);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        }
    }, [isFullScreenPlayerOpen, isLyricsOpen, resetIdleTimer]);

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
                "fixed left-0 right-0 z-[999] overflow-hidden select-none touch-none transition-all duration-500",
                isFullScreenPlayerOpen 
                    ? "top-0 bottom-0 h-auto bg-black" 
                    // Mini player: solid dark gray matching MobileNav (#1c1c1e), NO blurred album art affecting color
                    : "top-auto bottom-[calc(64px+env(safe-area-inset-bottom,0px))] h-[64px] bg-[#1c1c1e]/95 backdrop-blur-xl border-t border-white/[0.07] shadow-2xl",
                isIdle && isLyricsOpen && "focus-mode"
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
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-black">
                {isFullScreenPlayerOpen && (
                    <DynamicBackground coverUrl={currentTrack.coverUrl} />
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
                        "flex items-center justify-start shrink-0 h-0 overflow-hidden z-50 relative transition-opacity duration-300",
                        isFullScreenPlayerOpen && "px-6 pt-[calc(env(safe-area-inset-top,20px)+32px)] mb-3 h-auto opacity-100",
                        isIdle && "opacity-0 pointer-events-none"
                    )}
                >
                    <button 
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            setFullScreenPlayerOpen(false);
                            dragY.set(0);
                        }} className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all outline-none z-10">
                        <ChevronDown size={30} strokeWidth={2.5} />
                    </button>

                    {isFullScreenPlayerOpen && (
                        <div className="absolute left-1/2 -translate-x-1/2 flex flex-row items-center justify-center gap-2 pointer-events-none top-[calc(env(safe-area-inset-top,20px)+32px)] pt-1">
                            {isPlaying ? (
                                <div className="flex items-end gap-[2px] h-[10px] justify-center opacity-80">
                                    {[0.3, 0.7, 0.4, 0.9].map((d, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: ["30%", "100%", "30%"] }}
                                            transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
                                            className="w-[2.5px] bg-brand rounded-full origin-bottom"
                                        />
                                    ))}
                                </div>
                            ) : <div className="h-[10px] opacity-0" />}
                            <span className="text-[10px] font-black text-white/50 tracking-[0.2em] uppercase">Now Playing</span>
                        </div>
                    )}
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
                            "relative flex items-center justify-center transition-all duration-500",
                            isFullScreenPlayerOpen ? "w-full shrink-0 pt-8" : "w-12 h-12",
                            isIdle && isLyricsOpen ? "h-full pt-0 scale-110" : ""
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
                                    initial={isFullScreenPlayerOpen ? { opacity: 0, scale: 0.92, y: 10 } : { x: 0 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={isFullScreenPlayerOpen ? { opacity: 0, scale: 0.95, y: -10 } : undefined}
                                    transition={{ 
                                        duration: 0.45, 
                                        ease: [0.22, 1, 0.36, 1] 
                                    }}
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
                                                        ? "w-[min(80vw,330px)] aspect-square rounded-2xl origin-center mb-12"
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

                {/* Full View Controls Content (Includes Title/Artist) */}
                <motion.div
                    style={{ opacity: progress, y: controlsY }}
                    className={cn(
                        "w-full flex-col px-8 z-10 transition-all duration-300", 
                        !isFullScreenPlayerOpen ? "hidden" : "flex flex-1",
                        isIdle && "opacity-0 pointer-events-none translate-y-10"
                    )}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {/* Text Area (Full) - Restored Title and Artist */}
                    <div className="flex flex-row items-center justify-between w-full mt-auto mb-6 px-2 lg:mb-10 shrink-0">
                        <div className="flex flex-col items-start min-w-0 flex-1 mr-4 justify-center">
                            <h2 className="font-bold text-white text-[24px] tracking-tight line-clamp-2 leading-tight w-full drop-shadow-sm">
                                {currentTrack.title}
                            </h2>
                            <h3 className="text-white/40 text-[16px] font-medium line-clamp-1 w-full tracking-wide mt-1">
                                {currentTrack.artist?.name || "Unknown Artist"}
                            </h3>
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="w-10 h-10 flex items-center justify-center text-white/60 active:text-white transition-all outline-none">
                                    <MoreVertical size={24} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-zinc-900/95 border-white/10 backdrop-blur-xl rounded-2xl p-2 z-[1000]">
                                <DropdownMenuItem 
                                    className="flex items-center gap-3 px-3 py-3 rounded-xl focus:bg-white/10 text-white/90 focus:text-white transition-all cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (currentTrack.artist?.id) {
                                            router.push(`/artist/${currentTrack.artist.id}`);
                                            setFullScreenPlayerOpen(false);
                                        }
                                    }}
                                >
                                    <User size={18} className="text-white/40" />
                                    <span className="text-sm font-bold">Go to Artist</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    className="flex items-center gap-3 px-3 py-3 rounded-xl focus:bg-white/10 text-white/90 focus:text-white transition-all cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openDownloadModal(currentTrack);
                                    }}
                                >
                                    <Bookmark size={18} className="text-white/40" />
                                    <span className="text-sm font-bold">Save to Library</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    className="flex items-center gap-3 px-3 py-3 rounded-xl focus:bg-white/10 text-white/90 focus:text-white transition-all cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Use global share if available
                                        if (navigator.share) {
                                            navigator.share({
                                                title: currentTrack.title,
                                                text: `Listening to ${currentTrack.title} by ${currentTrack.artist?.name} on Zenify`,
                                                url: window.location.origin + `/track/${currentTrack.id}`
                                            });
                                        }
                                    }}
                                >
                                    <Share2 size={18} className="text-white/40" />
                                    <span className="text-sm font-bold">Share</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-white/5 my-1" />
                                <DropdownMenuItem 
                                    className="flex items-center gap-3 px-3 py-3 rounded-xl focus:bg-rose-500/20 text-rose-400 focus:text-rose-300 transition-all cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openDownloadModal(currentTrack);
                                    }}
                                >
                                    <PlusCircle size={18} />
                                    <span className="text-sm font-bold">Add to Playlist</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    {/* Progress Slider (Remaining in its original controls container at bottom) */}

                    {/* Scrubber - Clean Progress Bar */}
                    <div className="mb-10 w-full px-2 group/slider">
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
                                <Slider.Range className="absolute rounded-full h-full bg-brand shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]" />
                            </Slider.Track>
                            <Slider.Thumb className="hidden" />
                        </Slider.Root>
                        <div className="flex justify-between mt-2 tabular-nums text-[11px] font-bold text-white/20 tracking-wider">
                            <span>{formatTime(localTime)}</span>
                            <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                        </div>
                    </div>

                    {/* Main Controls - Large Touch Friendly Buttons */}
                    <div className="flex items-center justify-center gap-10 mb-10 text-white">
                        <button onClick={(e) => { e.stopPropagation(); playPrev(); }} className="w-14 h-14 flex items-center justify-center active:scale-75 active:text-brand transition-all outline-none">
                            <SkipBack size={32} fill="currentColor" strokeWidth={0} />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            className={cn(
                                "w-20 h-20 flex items-center justify-center active:scale-90 outline-none transition-colors",
                                !isPlaying ? "text-rose-500" : "text-white"
                            )}
                        >
                            {isPlaying ? <Pause size={48} fill="currentColor" /> : <Play size={48} fill="currentColor" className="ml-2" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); playNext(true); }} className="w-14 h-14 flex items-center justify-center active:scale-75 active:text-brand transition-all outline-none">
                            <SkipForward size={32} fill="currentColor" strokeWidth={0} />
                        </button>
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-between mb-8 px-2 w-full max-w-[340px] mx-auto opacity-70">
                        <button 
                            onClick={() => toggleLikeMutation.mutate(currentTrack.id)}
                            className={cn("w-11 h-11 flex items-center justify-center transition-all", likedTrackIds?.includes(currentTrack.id) ? "text-brand" : "text-white/60 active:text-brand")}
                        >
                            <Heart size={22} className={cn("stroke-[2.5px]", likedTrackIds?.includes(currentTrack.id) && "fill-current scale-110")} />
                        </button>
                        <button onClick={() => setAudioFxOpen(true)} className="w-11 h-11 flex items-center justify-center text-white/60 active:text-brand transition-all">
                            <Sparkles size={22} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setIsLyricsOpen(!isLyricsOpen); }} className={cn("w-11 h-11 flex items-center justify-center transition-all", isLyricsOpen ? "text-brand" : "text-white/60 active:text-brand")}>
                            <Mic2 size={24} />
                        </button>
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                setIsQueueOpen(!isQueueOpen);
                            }} 
                            className={cn("w-11 h-11 flex items-center justify-center transition-all", isQueueOpen ? "text-brand" : "text-white/60 active:text-brand")}
                        >
                            <ListMusic size={24} />
                        </button>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
