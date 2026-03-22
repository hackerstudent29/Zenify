"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
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
    DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { DynamicBackground } from "../player/DynamicBackground";
import { LyricsView } from "../shared/LyricsView";

// ------------------------------------------------------------------
// Image Cache — pre-resolved URLs so the artwork is NEVER reloaded
// ------------------------------------------------------------------
const imageCache = new Set<string>();
function preloadImage(url: string): void {
    if (!url || imageCache.has(url)) return;
    imageCache.add(url);
    const img = new Image();
    img.src = url;
}

// ------------------------------------------------------------------
// HorizontalSwipeArea — purely horizontal, blocks parent vertical drags
// ------------------------------------------------------------------
interface SwipeAreaProps {
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    children: React.ReactNode;
    className?: string;
    enabled?: boolean;
}

function HorizontalSwipeArea({ onSwipeLeft, onSwipeRight, children, className, enabled = true }: SwipeAreaProps) {
    const startX = useRef(0);
    const startY = useRef(0);
    const isDeterminate = useRef(false);
    const isHorizontal = useRef(false);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        isDeterminate.current = false;
        isHorizontal.current = false;
    }, []);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (!enabled) return;
        const dx = Math.abs(e.touches[0].clientX - startX.current);
        const dy = Math.abs(e.touches[0].clientY - startY.current);
        if (!isDeterminate.current && (dx > 8 || dy > 8)) {
            isDeterminate.current = true;
            isHorizontal.current = dx > dy;
        }
        // If we locked to horizontal, stop the vertical (parent) drag from firing
        if (isHorizontal.current) {
            e.stopPropagation();
        }
    }, [enabled]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (!enabled || !isDeterminate.current || !isHorizontal.current) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        e.stopPropagation();
        if (dx < -60) onSwipeLeft();
        else if (dx > 60) onSwipeRight();
    }, [enabled, onSwipeLeft, onSwipeRight]);

    return (
        <div
            className={className}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {children}
        </div>
    );
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------
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

    // ── Image state: single persistent URL that only changes after preload ──
    const [stablecover, setStableCover] = useState(() => getTrackCover(currentTrack));
    
    useEffect(() => {
        if (!currentTrack) return;
        const nextUrl = getTrackCover(currentTrack);
        // Preload first, then update stable URL atomically
        preloadImage(nextUrl);
        if (imageCache.has(nextUrl)) {
            setStableCover(nextUrl);
        } else {
            const img = new Image();
            img.src = nextUrl;
            img.onload = () => setStableCover(nextUrl);
        }
    }, [currentTrack?.id]);

    // ── Vertical drag for open/close only ──────────────────────────────────
    // Critical: drag is ONLY vertical. Horizontal swipes are handled separately.
    const dragY = useMotionValue(0);
    const [isAnimating, setIsAnimating] = useState(false);

    const springCfg = useMemo(() => ({
        type: "spring" as const,
        stiffness: 340,
        damping: 38,
        mass: 0.9,
    }), []);

    // Derived animation values from dragY
    const openProgress = useTransform(
        dragY,
        isFullScreenPlayerOpen ? [0, window?.innerHeight ?? 800] : [-(window?.innerHeight ?? 800), 0],
        isFullScreenPlayerOpen ? [1, 0] : [0, 1]
    );
    const controlsYOffset = useTransform(openProgress, [0, 1], [32, 0]);
    const uiOpacity = useTransform(openProgress, [0, 1], [0, 1]);

    // ── Idle mode (auto-hide controls in lyrics view) ──────────────────────
    const [isLyricsOpen, setIsLyricsOpen] = useState(false);
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
    const idleOpacity = useMotionValue(1);
    const idleYOffset = useMotionValue(0);

    useEffect(() => {
        animate(idleOpacity, isIdle ? 0 : 1, { duration: isIdle ? 0.8 : 0.2 });
        animate(idleYOffset, isIdle ? 40 : 0, { duration: isIdle ? 0.8 : 0.2 });
    }, [isIdle, idleOpacity, idleYOffset]);

    const resetIdleTimer = useCallback(() => {
        setIsIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (isLyricsOpen) {
            idleTimerRef.current = setTimeout(() => setIsIdle(true), 5000);
        }
    }, [isLyricsOpen]);

    useEffect(() => {
        if (isFullScreenPlayerOpen && isLyricsOpen) {
            const events = ['touchstart', 'touchmove', 'mousedown', 'click'];
            const handler = () => resetIdleTimer();
            events.forEach(e => window.addEventListener(e, handler, { passive: true }));
            resetIdleTimer();
            return () => {
                events.forEach(e => window.removeEventListener(e, handler));
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            };
        } else {
            setIsIdle(false);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        }
    }, [isFullScreenPlayerOpen, isLyricsOpen, resetIdleTimer]);

    // ── Native back button support ─────────────────────────────────────────
    useEffect(() => {
        const handlePopState = () => {
            if (isFullScreenPlayerOpen) setFullScreenPlayerOpen(false);
        };
        if (isFullScreenPlayerOpen) {
            window.history.pushState({ isMobilePlayerOpen: true }, '');
            window.addEventListener('popstate', handlePopState);
        }
        return () => {
            window.removeEventListener('popstate', handlePopState);
            if (isFullScreenPlayerOpen && window.history.state?.isMobilePlayerOpen) {
                window.history.back();
            }
        };
    }, [isFullScreenPlayerOpen, setFullScreenPlayerOpen]);

    // ── Reset lyrics on track change ───────────────────────────────────────
    useEffect(() => {
        setIsLyricsOpen(false);
    }, [currentTrack?.id]);

    // ── Progress tracking ──────────────────────────────────────────────────
    const [localTime, setLocalTime] = useState(currentTime);
    useEffect(() => { setLocalTime(currentTime); }, [currentTime]);

    const formatTime = (s: number) => {
        if (!s || isNaN(s)) return "0:00";
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const remaining = (duration || 0) - localTime;

    if (!currentTrack) return null;

    // ── Drag handlers ──────────────────────────────────────────────────────
    const handleDragEnd = useCallback((_: any, info: any) => {
        const { offset, velocity } = info;
        if (isFullScreenPlayerOpen) {
            if (offset.y > 100 || velocity.y > 500) {
                setFullScreenPlayerOpen(false);
            }
        } else {
            if (offset.y < -100 || velocity.y < -500) {
                setFullScreenPlayerOpen(true);
            }
        }
        // Always snap back - do not let dragY stay mid-animation
        animate(dragY, 0, { ...springCfg, bounce: 0 });
    }, [isFullScreenPlayerOpen, dragY, springCfg, setFullScreenPlayerOpen]);

    const containerClass = cn(
        "fixed left-0 right-0 z-[999] overflow-hidden select-none",
        isFullScreenPlayerOpen
            ? "top-0 bottom-0 h-auto"
            : "top-auto bottom-[calc(64px+env(safe-area-inset-bottom,0px))] h-[64px] bg-[#1c1c1e]/95 backdrop-blur-xl border-t border-white/[0.05] shadow-2xl"
    );

    const isLiked = likedTrackIds?.includes(currentTrack.id) ?? false;

    // Combined opacity for controls: ui open progress * idle
    const finalControlsOpacity = useTransform(
        [uiOpacity, idleOpacity],
        ([u, i]) => (u as number) * (i as number)
    );
    const finalControlsY = useTransform(
        [controlsYOffset, idleYOffset],
        ([c, id]) => (c as number) + (id as number)
    );

    return (
        <motion.div
            key="player-sheet"
            className={containerClass}
            style={{ y: dragY, willChange: "transform" }}
            animate={{
                borderRadius: isFullScreenPlayerOpen ? 28 : 0,
            }}
            transition={springCfg}
            drag={isFullScreenPlayerOpen ? "y" : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.02, bottom: isFullScreenPlayerOpen ? 0.25 : 0.02 }}
            dragDirectionLock={true}
            onDragEnd={handleDragEnd}
        >
            {/* ── Background (only rendered in full view) ─────────────── */}
            <div className="absolute inset-0 z-0 overflow-hidden bg-black">
                {isFullScreenPlayerOpen && (
                    <AnimatePresence mode="wait">
                        <DynamicBackground
                            key={currentTrack.id}
                            coverUrl={stablecover}
                        />
                    </AnimatePresence>
                )}
            </div>

            {/* ── Drag pill ───────────────────────────────────────────── */}
            {isFullScreenPlayerOpen && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/25 rounded-full z-[100]" />
            )}

            {/* ── Mini progress bar ────────────────────────────────────── */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5 z-20">
                <motion.div
                    className="h-full bg-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]"
                    animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    transition={{ duration: 1.1, ease: "linear" }}
                />
            </div>

            {/* ── Main content ─────────────────────────────────────────── */}
            <div className="relative z-10 flex flex-col h-full w-full overflow-hidden">

                {/* Header (Back btn + Now Playing badge) */}
                <motion.div
                    style={{ opacity: uiOpacity }}
                    className={cn(
                        "flex items-center justify-start shrink-0 overflow-hidden h-0",
                        isFullScreenPlayerOpen && "px-5 pt-[calc(env(safe-area-inset-top,20px)+28px)] mb-2 h-auto"
                    )}
                >
                    <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            setFullScreenPlayerOpen(false);
                            animate(dragY, 0, { duration: 0 });
                        }}
                        className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all outline-none"
                    >
                        <ChevronDown size={30} strokeWidth={2.5} />
                    </button>

                    {isFullScreenPlayerOpen && (
                        <div className="absolute left-1/2 -translate-x-1/2 flex flex-row items-center justify-center gap-1.5 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 20px) + 34px)' }}>
                            {isPlaying && (
                                <div className="flex items-end gap-[2px] h-[10px]">
                                    {[0.3, 0.7, 0.4, 0.9].map((d, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: ["30%", "100%", "30%"] }}
                                            transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
                                            className="w-[2.5px] bg-brand rounded-full origin-bottom"
                                        />
                                    ))}
                                </div>
                            )}
                            <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase">Now Playing</span>
                        </div>
                    )}
                </motion.div>

                {/* Body */}
                <div
                    className={cn(
                        "flex flex-1 min-h-0 w-full relative",
                        isFullScreenPlayerOpen ? "flex-col items-center px-8 pb-2" : "flex-row items-center px-2.5 h-[64px]"
                    )}
                    onClick={() => { if (!isFullScreenPlayerOpen) setFullScreenPlayerOpen(true); }}
                >
                    {/* ── Artwork area ─────────────────────────────────── */}
                    <div className={cn(
                        "relative",
                        isFullScreenPlayerOpen ? "w-full aspect-square px-4 [perspective:1000px] mt-4" : "w-12 h-12"
                    )}>
                        <motion.div
                            animate={isFullScreenPlayerOpen ? { rotateY: isLyricsOpen ? 180 : 0 } : { rotateY: 0 }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                            className="relative w-full h-full [transform-style:preserve-3d]"
                        >
                            {/* Front Side: Artwork */}
                            <motion.div
                                className={cn(
                                    "absolute inset-0 [backface-visibility:hidden] overflow-hidden shadow-2xl shrink-0",
                                    isFullScreenPlayerOpen ? "rounded-[28px]" : "rounded-[10px] ring-1 ring-white/5"
                                )}
                                animate={{ opacity: (isFullScreenPlayerOpen && isLyricsOpen) ? 0 : 1 }}
                            >
                                <HorizontalSwipeArea
                                    enabled={isFullScreenPlayerOpen && !isLyricsOpen}
                                    onSwipeLeft={() => playNext(true)}
                                    onSwipeRight={() => playPrev()}
                                    className="w-full h-full"
                                >
                                    <AnimatePresence mode="popLayout" initial={false}>
                                        <motion.img
                                            key={currentTrack.id}
                                            src={stablecover}
                                            className="w-full h-full object-cover"
                                            animate={{ scale: (isFullScreenPlayerOpen && !isPlaying) ? 0.9 : 1 }}
                                            transition={{ type: "spring", stiffness: 260, damping: 28 }}
                                        />
                                    </AnimatePresence>
                                </HorizontalSwipeArea>
                            </motion.div>

                            {/* Back Side: Lyrics */}
                            {isFullScreenPlayerOpen && (
                                <motion.div
                                    className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-3xl overflow-hidden bg-black/40 backdrop-blur-2xl border border-white/10 relative"
                                    animate={{ opacity: isLyricsOpen ? 1 : 0 }}
                                >
                                    <LyricsView
                                        trackId={currentTrack.id}
                                        title={currentTrack.title}
                                        artist={currentTrack.artist?.name}
                                        rawLyrics={currentTrack.lyrics}
                                        currentTime={localTime}
                                        isLyricsOpen={isLyricsOpen}
                                        isMobile={true}
                                        duration={duration}
                                    />
                                </motion.div>
                            )}
                        </motion.div>
                    </div>

                    {/* ── Mini player text + buttons ───────────────────── */}
                    {!isFullScreenPlayerOpen && (
                        <HorizontalSwipeArea
                            enabled={true}
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
                                <button
                                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                                    className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-all"
                                >
                                    {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); playNext(true); }}
                                    className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-all"
                                >
                                    <SkipForward size={26} fill="currentColor" />
                                </button>
                            </div>
                        </HorizontalSwipeArea>
                    )}
                </div>

                {/* ── Full View Controls ─────────────────────────────────── */}
                <motion.div
                    style={{ opacity: finalControlsOpacity, y: finalControlsY }}
                    className={cn(
                        "w-full flex-col px-8 z-10",
                        !isFullScreenPlayerOpen ? "hidden" : "flex flex-1"
                    )}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {/* Title + Artist + Menu */}
                    <div className="flex flex-row items-center justify-between w-full mt-8 mb-5 px-1 shrink-0">
                        <div className="flex flex-col items-start min-w-0 flex-1 mr-4">
                            <h2 className={cn(
                                "font-bold text-white tracking-tight line-clamp-1 truncate w-full",
                                currentTrack.title.length > 25 ? "text-[18px]" : "text-[22px]"
                            )}>
                                {currentTrack.title}
                            </h2>
                            <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (currentTrack.artist?.id) {
                                        setFullScreenPlayerOpen(false);
                                        setTimeout(() => router.push(`/artist/${currentTrack.artist.id}`), 50);
                                    }
                                }}
                                className="text-white/50 text-[15px] font-medium line-clamp-1 w-full mt-1 text-left hover:text-white/70 active:text-white transition-colors outline-none"
                            >
                                {currentTrack.artist?.name || "Unknown Artist"}
                            </button>
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-10 h-10 flex items-center justify-center text-white/50 active:text-white transition-all outline-none"
                                >
                                    <MoreVertical size={22} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuContent align="end" className="w-56 bg-zinc-900/95 border-white/10 backdrop-blur-xl rounded-2xl p-2 z-[1100]">
                                    <DropdownMenuItem
                                        className="flex items-center gap-3 px-3 py-3 rounded-xl focus:bg-white/10 text-white/90 focus:text-white transition-all cursor-pointer"
                                        onSelect={(e) => {
                                            e.preventDefault();
                                            if (currentTrack.artist?.id) {
                                                setFullScreenPlayerOpen(false);
                                                setTimeout(() => router.push(`/artist/${currentTrack.artist.id}`), 50);
                                            }
                                        }}
                                    >
                                        <User size={18} className="text-white/40" />
                                        <span className="text-sm font-bold">Go to Artist</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="flex items-center gap-3 px-3 py-3 rounded-xl focus:bg-white/10 text-white/90 focus:text-white transition-all cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); openDownloadModal(currentTrack); }}
                                    >
                                        <Bookmark size={18} className="text-white/40" />
                                        <span className="text-sm font-bold">Save to Library</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="flex items-center gap-3 px-3 py-3 rounded-xl focus:bg-white/10 text-white/90 focus:text-white transition-all cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
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
                                        onClick={(e) => { e.stopPropagation(); openDownloadModal(currentTrack); }}
                                    >
                                        <PlusCircle size={18} />
                                        <span className="text-sm font-bold">Add to Playlist</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenuPortal>
                        </DropdownMenu>
                    </div>

                    {/* Scrubber */}
                    <div className="mb-8 w-full px-2">
                        <Slider.Root
                            className="relative flex items-center select-none touch-none w-full h-6 cursor-pointer"
                            value={[localTime]}
                            max={duration || 100}
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
                            <Slider.Track className="relative grow rounded-full h-[3.5px] bg-white/10 overflow-hidden">
                                <Slider.Range className="absolute rounded-full h-full bg-brand shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]" />
                            </Slider.Track>
                            <Slider.Thumb className="hidden" />
                        </Slider.Root>
                        <div className="flex justify-between mt-2 tabular-nums text-[11px] font-bold text-white/25 tracking-wider">
                            <span>{formatTime(localTime)}</span>
                            <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                        </div>
                    </div>

                    {/* Main Playback Controls */}
                    <div className="flex items-center justify-center gap-10 mb-8 text-white">
                        <button
                            onClick={(e) => { e.stopPropagation(); playPrev(); }}
                            className="w-14 h-14 flex items-center justify-center active:scale-75 active:text-brand transition-all outline-none"
                        >
                            <SkipBack size={32} fill="currentColor" strokeWidth={0} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            className={cn(
                                "w-20 h-20 flex items-center justify-center active:scale-90 outline-none transition-colors",
                                !isPlaying ? "text-brand" : "text-white"
                            )}
                        >
                            {isPlaying 
                                ? <Pause size={52} fill="currentColor" strokeWidth={0} />
                                : <Play size={52} fill="currentColor" strokeWidth={0} className="ml-2" />
                            }
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); playNext(true); }}
                            className="w-14 h-14 flex items-center justify-center active:scale-75 active:text-brand transition-all outline-none"
                        >
                            <SkipForward size={32} fill="currentColor" strokeWidth={0} />
                        </button>
                    </div>

                    {/* Secondary Actions */}
                    <div className="flex items-center justify-between mb-6 px-2 w-full max-w-[340px] mx-auto">
                        <button
                            onClick={() => toggleLikeMutation.mutate(currentTrack.id)}
                            className={cn("w-11 h-11 flex items-center justify-center transition-all", isLiked ? "text-brand" : "text-white/50 active:text-brand")}
                        >
                            <Heart size={22} className={cn("stroke-[2.5px]", isLiked && "fill-current")} />
                        </button>
                        <button
                            onClick={() => setAudioFxOpen(true)}
                            className="w-11 h-11 flex items-center justify-center text-white/50 active:text-brand transition-all"
                        >
                            <Sparkles size={22} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsLyricsOpen(l => !l); }}
                            className={cn("w-11 h-11 flex items-center justify-center transition-all", isLyricsOpen ? "text-brand" : "text-white/50 active:text-brand")}
                        >
                            <Mic2 size={24} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsQueueOpen(!isQueueOpen); }}
                            className={cn("w-11 h-11 flex items-center justify-center transition-all", isQueueOpen ? "text-brand" : "text-white/50 active:text-brand")}
                        >
                            <ListMusic size={24} />
                        </button>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
