"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate, LayoutGroup } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { 
    Play, Pause, SkipBack, SkipForward, 
    Heart, MoreVertical, ChevronDown, User,
    ListMusic, Sparkles, Mic2, PlusCircle, Bookmark
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn, getTrackCover } from "@/lib/utils";
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
import { ReactiveAudioBackground } from "../player/ReactiveAudioBackground";
import { LyricsView } from "../shared/LyricsView";

// ------------------------------------------------------------------
// Image Cache
// ------------------------------------------------------------------
const imageCache = new Set<string>();
function preloadImage(url: string): void {
    if (!url || imageCache.has(url)) return;
    imageCache.add(url);
    const img = new Image();
    img.src = url;
}

// ------------------------------------------------------------------
// HorizontalSwipeArea
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
        const dx = e.touches[0].clientX - startX.current;
        const dy = e.touches[0].clientY - startY.current;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        if (!isDeterminate.current && (adx > 2 || ady > 2)) {
            isDeterminate.current = true;
            isHorizontal.current = adx > ady;
        }

        if (isHorizontal.current) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
        }
    }, [enabled]);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        if (!enabled || !isDeterminate.current || !isHorizontal.current) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        if (isHorizontal.current) {
            e.stopPropagation();
            if (dx < -30) onSwipeLeft();
            else if (dx > 30) onSwipeRight();
        }
    }, [enabled, onSwipeLeft, onSwipeRight]);

    return (
        <div
            className={cn(className, "touch-pan-y")}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={() => { isDeterminate.current = false; }}
        >
            {children}
        </div>
    );
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------
// 🟢 Vercel Trigger: Deploying audio-reactive version (1a0bf5b)
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
    const { user } = useAuthStore();
    const isGlassmorphism = user?.preferences?.globalPlayerStyle === "glassmorphism";

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

    // ── Queries & Mutations ──────────────────────────────────────────────
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

    const isLiked = likedTrackIds?.includes(currentTrack?.id || "") ?? false;

    // ── Local State ──────────────────────────────────────────────────────
    const [stablecover, setStableCover] = useState(getTrackCover(currentTrack));
    const [swipeDirection, setSwipeDirection] = useState(1); // 1 = next, -1 = prev

    const handleNext = useCallback(() => {
        setSwipeDirection(1);
        playNext(true);
    }, [playNext]);

    const handlePrev = useCallback(() => {
        setSwipeDirection(-1);
        playPrev();
    }, [playPrev]);
    const [isLyricsOpen, setIsLyricsOpen] = useState(false);
    const [localTime, setLocalTime] = useState(currentTime);
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

    // ── Sync localTime with store ────────────────────────────────────────
    useEffect(() => { setLocalTime(currentTime); }, [currentTime]);

    // ── Image preloading ─────────────────────────────────────────────────
    useEffect(() => {
        if (!currentTrack) return;
        const nextUrl = getTrackCover(currentTrack);
        preloadImage(nextUrl);
        if (imageCache.has(nextUrl)) {
            setStableCover(nextUrl);
        } else {
            const img = new Image();
            img.src = nextUrl;
            img.onload = () => setStableCover(nextUrl);
        }
    }, [currentTrack?.id]);

    // ── Idle Timer ───────────────────────────────────────────────────────
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
        }
    }, [isFullScreenPlayerOpen, isLyricsOpen, resetIdleTimer]);

    // ── Animation Logic & Transforms ─────────────────────────────────────
    const closingSpring = useMemo(() => ({
        type: "spring" as const,
        stiffness: 350,
        damping: 32,
        mass: 0.8,
    }), []);

    const dragY = useMotionValue(0);
    const dragScale = useTransform(dragY, [0, 400], [1, 0.9]);
    const dragOpacity = useTransform(dragY, [0, 400], [1, 0.4]);
    const dragRadius = useTransform(dragY, [0, 200], ["0px", "28px"]);

    // ── Helpers ──────────────────────────────────────────────────────────
    const formatTime = (s: number) => {
        if (!s || isNaN(s)) return "0:00";
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const remaining = (duration || 0) - localTime;

    if (!currentTrack) return null;

    return (
        <LayoutGroup id="mobile-player-group">
            <AnimatePresence mode="popLayout" initial={false}>
                {!isFullScreenPlayerOpen ? (
                    /* MINI PLAYER VIEW */
                    <motion.div
                        key="mini-player"
                        layoutId="player-shell"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={closingSpring}
                        className={cn("fixed z-[300] pointer-events-auto transition-all duration-300", isGlassmorphism ? "px-3" : "left-0 right-0")}
                        style={{ 
                            bottom: isGlassmorphism 
                                ? "calc(76px + env(safe-area-inset-bottom, 0px))"
                                : "calc(64px + env(safe-area-inset-bottom, 0px))",
                            left: isGlassmorphism ? "12px" : "0px",
                            right: isGlassmorphism ? "12px" : "0px",
                            height: "64px",
                            willChange: "transform"
                        }}
                    >
                        {/* Mini Pod Background */}
                        <motion.div 
                            layoutId="mini-pod-bg"
                            className={cn(
                                "absolute inset-0 transition-all duration-300",
                                isGlassmorphism 
                                    ? "rounded-2xl border border-white/10 bg-black/40 backdrop-blur-[32px] ring-1 ring-white/5 shadow-[0_15px_35px_rgba(0,0,0,0.6)]" 
                                    : "bg-[#161616]/95 backdrop-blur-3xl border-t border-white/5 rounded-none shadow-[0_-12px_45px_rgba(0,0,0,0.6)]"
                            )}
                            transition={closingSpring}
                        />

                        {/* Progress Line */}
                        <div className={cn(
                            "absolute top-0 left-0 right-0 h-[2px] overflow-hidden z-[11] transition-all",
                            isGlassmorphism ? "rounded-t-2xl mx-[1px] mt-[1px]" : ""
                        )}>
                            <motion.div
                                className="h-full bg-brand"
                                animate={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                                transition={{ duration: 1, ease: "linear" }}
                            />
                        </div>

                        <HorizontalSwipeArea
                            enabled={true}
                            onSwipeLeft={handleNext}
                            onSwipeRight={handlePrev}
                            className="relative h-full flex items-center px-4 cursor-pointer"
                        >
                            <div className="flex-1 flex items-center min-w-0 h-full" onClick={() => setFullScreenPlayerOpen(true)}>
                                <motion.div 
                                    layoutId="album-art-container"
                                    className="w-11 h-11 rounded-[4px] overflow-hidden shadow-lg relative shrink-0 ring-1 ring-white/10 bg-zinc-900"
                                    transition={closingSpring}
                                >
                                    <AnimatePresence mode="popLayout" initial={false}>
                                        <motion.img
                                            key={currentTrack.id}
                                            layoutId="album-art"
                                            src={stablecover}
                                            className="w-full h-full object-cover"
                                            initial={{ opacity: 0, x: swipeDirection > 0 ? 40 : -40 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: swipeDirection > 0 ? -40 : 40 }}
                                            transition={closingSpring}
                                        />
                                    </AnimatePresence>
                                </motion.div>

                                <div className="flex flex-col min-w-0 flex-1 pl-3">
                                    <motion.h4 
                                        layoutId="track-title"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/track/${currentTrack.id}`);
                                        }}
                                        className="text-[13px] font-bold text-white truncate leading-normal cursor-pointer hover:text-[#ff2d55] hover:underline transition-colors"
                                    >
                                        {currentTrack.title}
                                    </motion.h4>
                                    <motion.p 
                                        layoutId="track-artist"
                                        className="text-[11px] text-white/40 font-medium truncate mt-0.5"
                                    >
                                        {currentTrack.artist?.name || 'Unknown Artist'}
                                    </motion.p>
                                </div>
                            </div>

                            <motion.div 
                                className="flex items-center gap-2 shrink-0 pr-0.5 relative z-50" 
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                                    className="w-10 h-10 flex items-center justify-center text-white"
                                >
                                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                    className="w-10 h-10 flex items-center justify-center text-white"
                                >
                                    <SkipForward size={24} fill="currentColor" />
                                </button>
                            </motion.div>
                        </HorizontalSwipeArea>
                    </motion.div>
                ) : (
                    /* FULL SCREEN PLAYER VIEW */
                    <motion.div
                        key="full-player-shell"
                        layoutId="player-shell"
                        style={{ 
                            y: dragY, 
                            scale: dragScale,
                            opacity: dragOpacity,
                            borderRadius: dragRadius,
                        }}
                        initial={{ borderRadius: 0 }}
                        animate={{ borderRadius: 0 }}
                        exit={{ borderRadius: 28, opacity: 0 }}
                        transition={closingSpring}
                        className="fixed inset-0 z-[1100] bg-black overflow-hidden flex flex-col pointer-events-auto"
                        drag="y"
                        dragConstraints={{ top: 0 }}
                        dragElastic={0.05}
                        onDragEnd={(_, info) => {
                            if (info.velocity.y > 500 || info.offset.y > 150) {
                                setFullScreenPlayerOpen(false);
                            } else {
                                animate(dragY, 0, closingSpring);
                            }
                        }}
                    >
                        {/* Background */}
                        <div className="absolute inset-0 z-0 overflow-hidden bg-black">
                            <ReactiveAudioBackground coverUrl={stablecover} track={currentTrack} className="opacity-100" />
                        </div>

                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full z-10" />

                        {/* Top Bar */}
                        <motion.div className="relative z-10 flex items-center px-5 pt-[calc(env(safe-area-inset-top,20px)+24px)] mb-1">
                            <button onClick={() => setFullScreenPlayerOpen(false)} className="w-10 h-10 flex items-center justify-center text-white active:scale-75 transition-all">
                                <ChevronDown size={32} strokeWidth={2.5} />
                            </button>
                            <div className="absolute left-1/2 -translate-x-1/2 flex flex-row items-center justify-center gap-1.5" style={{ top: 'calc(env(safe-area-inset-top, 20px) + 30px)' }}>
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
                        </motion.div>

                        {/* Central Area: Art or full-height scrolling lyrics */}
                        <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 relative z-10 w-full">
                            <AnimatePresence mode="wait">
                                {!isLyricsOpen ? (
                                    /* ART MODE */
                                    <motion.div
                                        key="art-mode"
                                        initial={{ opacity: 0, scale: 0.92 }}
                                        animate={{ opacity: 1, scale: isPlaying ? 1 : 0.95 }}
                                        exit={{ opacity: 0, scale: 0.92 }}
                                        transition={closingSpring}
                                        className="mobile-artwork-container shadow-[0_32px_64px_rgba(0,0,0,0.65)] rounded-2xl overflow-hidden cursor-pointer"
                                        onClick={() => setIsLyricsOpen(true)}
                                    >
                                        <HorizontalSwipeArea
                                            enabled={true}
                                            onSwipeLeft={handleNext}
                                            onSwipeRight={handlePrev}
                                            className="w-full h-full"
                                        >
                                            <AnimatePresence mode="popLayout" initial={false}>
                                                <motion.img
                                                    key={currentTrack.id}
                                                    src={stablecover}
                                                    className="w-full h-full object-cover pointer-events-none"
                                                    initial={{ opacity: 0, x: swipeDirection > 0 ? 300 : -300 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: swipeDirection > 0 ? -300 : 300 }}
                                                    transition={closingSpring}
                                                />
                                            </AnimatePresence>
                                        </HorizontalSwipeArea>
                                    </motion.div>
                                ) : (
                                    /* LYRICS MODE (Full vertical space, dynamic height scaling) */
                                    <motion.div
                                        key="lyrics-mode"
                                        initial={{ opacity: 0, y: 15 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 15 }}
                                        transition={closingSpring}
                                        className="w-full h-full max-h-[440px] short:max-h-[300px] cursor-pointer"
                                        onClick={() => setIsLyricsOpen(false)}
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
                            </AnimatePresence>
                        </div>

                        {/* Player Controls */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2, ...closingSpring }}
                            className="w-full flex flex-col px-8 pb-[calc(env(safe-area-inset-bottom,20px)+32px)] z-10 shrink-0"
                        >
                            {/* Meta */}
                            <motion.div layoutId="track-meta" className="flex flex-row items-center justify-between w-full mt-2 mb-6 px-1 mobile-controls-meta">
                                <div className="flex flex-col items-start min-w-0 flex-1 mr-4">
                                    <h2 
                                        onClick={() => {
                                            setFullScreenPlayerOpen(false);
                                            setTimeout(() => router.push(`/track/${currentTrack.id}`), 50);
                                        }}
                                        className={cn(
                                            "font-bold text-white tracking-tight truncate w-full py-0.5 cursor-pointer hover:text-[#ff2d55] hover:underline transition-all",
                                            currentTrack.title.length > 25 ? "text-[20px] leading-snug" : "text-[24px] leading-snug"
                                        )}
                                    >
                                        {currentTrack.title}
                                    </h2>
                                    <button
                                        onClick={() => {
                                            if (currentTrack.artist?.id) {
                                                setFullScreenPlayerOpen(false);
                                                setTimeout(() => router.push(`/artist/${currentTrack.artist.id}`), 50);
                                            }
                                        }}
                                        className="text-white/50 text-[16px] font-medium truncate w-full mt-0.5 text-left active:text-white"
                                    >
                                        {currentTrack.artist?.name || "Unknown Artist"}
                                    </button>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="w-10 h-10 flex items-center justify-center text-white/50"><MoreVertical size={26} /></button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuContent align="end" className="w-56 bg-zinc-900/95 border-white/10 backdrop-blur-xl rounded-2xl p-2 z-[1200]">
                                            <DropdownMenuItem onSelect={() => {
                                                if (currentTrack.artist?.id) {
                                                    setFullScreenPlayerOpen(false);
                                                    setTimeout(() => router.push(`/artist/${currentTrack.artist.id}`), 50);
                                                }
                                            }}>
                                                <User size={18} className="mr-3 opacity-40" />
                                                <span className="font-bold">Go to Artist</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenuPortal>
                                </DropdownMenu>
                            </motion.div>

                            {/* Scrubber */}
                            <div className="mb-8 w-full px-1 mobile-controls-scrubber">
                                <Slider.Root
                                    className="relative flex items-center select-none touch-none w-full h-8 cursor-pointer"
                                    value={[localTime]}
                                    max={duration || 100}
                                    onValueChange={(val) => setLocalTime(val[0])}
                                    onValueCommit={(val) => {
                                        const audio = audioEngine.getActiveAudioElement();
                                        if (audio) { audio.currentTime = val[0]; setCurrentTime(val[0]); }
                                    }}
                                >
                                    <Slider.Track className="relative grow rounded-full h-[4px] bg-white/10 overflow-hidden">
                                        <Slider.Range className="absolute rounded-full h-full bg-brand shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]" />
                                    </Slider.Track>
                                    <Slider.Thumb className="hidden" />
                                </Slider.Root>
                                <div className="flex justify-between mt-2 tabular-nums text-[12px] font-bold text-white/55 tracking-wider">
                                    <span>{formatTime(localTime)}</span>
                                    <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                                </div>
                            </div>

                            {/* Playback */}
                            <div className="flex items-center justify-center gap-10 mb-10 text-white mobile-controls-playback">
                                <button onClick={handlePrev} className="w-14 h-14 flex items-center justify-center active:scale-75 transition-all mobile-btn-secondary">
                                    <SkipBack size={36} className="mobile-icon-secondary" fill="currentColor" strokeWidth={0} />
                                </button>
                                <button onClick={() => togglePlay()} className={cn("w-20 h-20 flex items-center justify-center active:scale-90 transition-transform mobile-btn-primary", !isPlaying ? "text-brand" : "")}>
                                    {isPlaying ? (
                                        <Pause size={56} className="mobile-icon-primary" fill="currentColor" strokeWidth={0} />
                                    ) : (
                                        <Play size={56} className="mobile-icon-primary ml-2" fill="currentColor" strokeWidth={0} />
                                    )}
                                </button>
                                <button onClick={handleNext} className="w-14 h-14 flex items-center justify-center active:scale-75 transition-all mobile-btn-secondary">
                                    <SkipForward size={36} className="mobile-icon-secondary" fill="currentColor" strokeWidth={0} />
                                </button>
                            </div>

                            {/* Actions Bar */}
                            <div className="flex items-center justify-between px-2 w-full max-w-[340px] mx-auto">
                                <button onClick={() => toggleLikeMutation.mutate(currentTrack.id)} className={cn("w-11 h-11 flex items-center justify-center transition-all", isLiked ? "text-brand opacity-100" : "text-white")}>
                                    <Heart size={24} className={isLiked ? "fill-current" : ""} />
                                </button>
                                <button onClick={() => setAudioFxOpen(true)} className="w-11 h-11 flex items-center justify-center text-white"><Sparkles size={24} /></button>
                                <button onClick={() => setIsLyricsOpen(!isLyricsOpen)} className={cn("w-11 h-11 flex items-center justify-center transition-all", isLyricsOpen ? "text-brand opacity-100" : "text-white")}>
                                    <Mic2 size={26} />
                                </button>
                                <button onClick={() => setIsQueueOpen(!isQueueOpen)} className={cn("w-11 h-11 flex items-center justify-center transition-all", isQueueOpen ? "text-brand opacity-100" : "text-white")}>
                                    <ListMusic size={26} />
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </LayoutGroup>
    );
}
