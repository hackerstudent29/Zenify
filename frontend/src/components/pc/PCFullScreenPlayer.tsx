"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    X,
    Minimize2,
    Shuffle,
    Repeat,
    Heart,
    Sparkles,
    ListMusic,
    Mic2,
    MoreHorizontal,
} from "lucide-react";
import { getMediaUrl, cn, cleanTitle, getTrackCover } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ReactiveAudioBackground } from "../player/ReactiveAudioBackground";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuPortal,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { LyricsView } from "../shared/LyricsView";

const SPRING = { type: "spring", stiffness: 180, damping: 26, mass: 0.9 } as const;
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

export function PCFullScreenPlayer() {
    const router = useRouter();
    const {
        setFullScreenPlayerOpen,
        setPlayerMinimized,
        isPlayerMinimized,
        isLyricsOpen,
        setIsLyricsOpen,
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
        isShuffled,
        toggleShuffle,
        repeatMode,
        toggleRepeat,
    } = usePlayerStore();
    const queryClient = useQueryClient();
    const { isAuthenticated, user } = useAuthStore();
    const openDownloadModal = useUIStore(state => state.openDownloadModal);
    const showReactiveBg = user?.preferences?.fullviewReactiveBg !== false;

    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            if (!isAuthenticated) return [];
            const res = await api.get('/tracks/liked');
            return (res.data as any[]).map(t => t.id);
        },
        enabled: isAuthenticated
    });

    const isLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;

    const toggleLikeMutation = useMutation({
        mutationFn: async () => {
            if (!currentTrack) return;
            await api.post(`/tracks/${currentTrack.id}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const { data: playlists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('/playlists/my');
                return res.data as { id: string, name: string }[];
            } catch (e) { return []; }
        },
        enabled: !!queryClient.getQueryData(['auth-token']) || isAuthenticated
    });

    const addToPlaylistMutation = useMutation({
        mutationFn: async (playlistId: string) => {
            if (!currentTrack) return;
            await api.post(`/playlists/${playlistId}/tracks`, { trackId: currentTrack.id });
        },
        onSuccess: (_, playlistId) => {
            queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
        }
    });

    // --- Universal 5-second idle timer (always active in full-screen) ---
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

    const resetIdleTimer = useCallback(() => {
        setIsIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            setIsIdle(true);
        }, 5000);
    }, []);

    useEffect(() => {
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        const handler = () => resetIdleTimer();
        events.forEach(e => window.addEventListener(e, handler));
        resetIdleTimer();
        return () => {
            events.forEach(e => window.removeEventListener(e, handler));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [resetIdleTimer]);

    const [swipeDirection, setSwipeDirection] = useState(1);

    const handleNext = useCallback(() => {
        setSwipeDirection(1);
        playNext(true);
    }, [playNext]);

    const handlePrev = useCallback(() => {
        setSwipeDirection(-1);
        playPrev();
    }, [playPrev]);



    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatRemainingTime = (seconds: number, total: number) => {
        if (isNaN(seconds) || isNaN(total)) return "-0:00";
        const remaining = total - seconds;
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        return `-${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const [loadedCover, setLoadedCover] = useState(currentTrack ? getTrackCover(currentTrack) : "/logo.png");

    useEffect(() => {
        if (!currentTrack) return;
        const nextCover = getTrackCover(currentTrack);
        if (nextCover === loadedCover) return;

        const img = new Image();
        img.src = nextCover;
        img.onload = () => {
            setLoadedCover(nextCover);
        };
    }, [currentTrack?.id]);

    if (!currentTrack) return null;

    return (
        <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
                mass: 0.8
            }}
            style={{ zIndex: 850 }}
            className="fixed inset-0 bg-black overflow-hidden font-[family-name:var(--font-plus-jakarta)]"
            onClick={() => setFullScreenPlayerOpen(false)}
        >
            {/* Reactive Background */}
            {showReactiveBg ? (
                <ReactiveAudioBackground
                    coverUrl={loadedCover}
                    track={currentTrack}
                    className="opacity-100"
                />
            ) : (
                <div className="absolute inset-0 bg-black pointer-events-none" />
            )}

            {/* Top-right controls — fade on idle */}
            <motion.div
                className="absolute top-8 right-10 z-50 flex items-center gap-4"
                animate={{ opacity: isIdle ? 0 : 1, pointerEvents: isIdle ? 'none' : 'auto' }}
                transition={{ duration: 0.5 }}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); setFullScreenPlayerOpen(false); }}
                    className="p-2 text-white/40 hover:text-white transition-all transform hover:scale-110 active:scale-90"
                    title="Minimize to Global Player"
                >
                    <Minimize2 size={20} strokeWidth={1.5} />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setFullScreenPlayerOpen(false);
                        usePlayerStore.setState({ currentTrack: null, isPlaying: false });
                        const audio = document.querySelector('audio');
                        if (audio) { audio.pause(); audio.src = ''; }
                    }}
                    className="p-2 text-white/40 hover:text-white transition-all transform hover:scale-110 active:scale-90"
                    title="Close All Players"
                >
                    <X size={22} strokeWidth={2} />
                </button>
            </motion.div>

            {/* ============================================================
                MAIN LAYOUT: Flex row, split-screen when lyrics open
            ============================================================ */}
            <motion.div
                layout
                transition={SPRING}
                className={cn(
                    "relative z-10 flex h-full items-center justify-center pt-12 pb-6 gap-16",
                    isLyricsOpen ? "pl-16 pr-6" : "px-6"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* LEFT PANEL: Artwork + Controls */}
                <motion.div
                    layout
                    transition={SPRING}
                    className={cn(
                        "flex flex-col items-center gap-6 shrink-0",
                        isLyricsOpen ? "w-[340px] lg:w-[360px] -translate-x-10" : "w-full max-w-md"
                    )}
                >
                    {/* Artwork - ALWAYS visible */}
                    <motion.div
                        layout
                        transition={SPRING}
                        className={cn(
                            "relative shrink-0 rounded-lg overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.8)]",
                            isLyricsOpen
                                ? "w-[280px] h-[280px] lg:w-[320px] lg:h-[320px]"
                                : "w-[240px] h-[240px] lg:w-[280px] lg:h-[280px]"
                        )}
                    >
                        <AnimatePresence mode="wait">
                            <motion.img
                                key={currentTrack.id}
                                layout
                                layoutId="album-art"
                                src={loadedCover}
                                className="w-full h-full object-cover pointer-events-none"
                                initial={{ opacity: 0, x: swipeDirection > 0 ? 200 : -200 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: swipeDirection > 0 ? -200 : 200 }}
                                transition={{ type: "spring", stiffness: 350, damping: 32 }}
                                alt={currentTrack.title}
                            />
                        </AnimatePresence>
                        {/* Tap to open lyrics */}
                        {!isLyricsOpen && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsLyricsOpen(true); }}
                                className="absolute inset-0 w-full h-full bg-transparent cursor-pointer"
                            />
                        )}
                    </motion.div>

                    {/* Track Details & Controls Container */}
                    <div className="w-full space-y-5">
                        {/* Track Info (Title/Artist) - Hides on Idle */}
                        <motion.div
                            layout
                            transition={SPRING}
                            className="w-full text-center"
                            animate={{ opacity: isIdle ? 0 : 1, y: isIdle ? -20 : 0, pointerEvents: isIdle ? 'none' : 'auto' }}
                        >
                            <h2 
                                onClick={() => {
                                    setFullScreenPlayerOpen(false);
                                    router.push(`/track/${currentTrack.id}`);
                                }}
                                className="text-xl md:text-2xl font-bold tracking-tight text-white font-brand mb-1 leading-normal pt-1.5 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] truncate cursor-pointer hover:text-brand transition-colors hover:underline"
                            >
                                {cleanTitle(currentTrack.title)}
                            </h2>
                            <div className="flex justify-center">
                                {currentTrack.artist?.id ? (
                                    <Link
                                        href={`/artist/${currentTrack.artist.id}`}
                                        onClick={() => setFullScreenPlayerOpen(false)}
                                        className="text-[11px] text-white/60 font-bold hover:text-brand transition-all cursor-pointer inline-block tracking-widest uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                                    >
                                        {currentTrack.artist?.name || 'Unknown Artist'}
                                    </Link>
                                ) : (
                                    <p className="text-[11px] text-white/60 font-bold tracking-widest uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                                        {currentTrack.artist?.name || 'Unknown Artist'}
                                    </p>
                                )}
                            </div>
                        </motion.div>

                        {/* Progress Slider (Playbar) - ALWAYS visible */}
                        <div className="w-full max-w-[280px] lg:max-w-[320px] mx-auto">
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-3 group cursor-pointer"
                                value={[currentTime]}
                                max={duration || 100}
                                step={0.1}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onValueChange={(val) => {
                                    audioEngine.resume();
                                    const audio = document.querySelector('audio');
                                    if (audio) audio.currentTime = val[0];
                                    usePlayerStore.getState().setCurrentTime(val[0]);
                                }}
                            >
                                <Slider.Track className="bg-white/10 relative grow rounded-full h-[3px] overflow-hidden">
                                    <Slider.Range className="absolute bg-brand rounded-full h-full shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.3)]" />
                                </Slider.Track>
                                <Slider.Thumb className="hidden" />
                            </Slider.Root>
                            <div className="flex justify-between text-[10px] font-bold text-white/55 tabular-nums mt-2 tracking-wider">
                                <span>{formatTime(currentTime)}</span>
                                <span>{formatRemainingTime(currentTime, duration)}</span>
                            </div>
                        </div>

                        {/* Playback Controls Row - Hides on Idle */}
                        <motion.div
                            layout
                            transition={SPRING}
                            className={cn(
                                "flex items-center justify-center w-full h-14",
                                isLyricsOpen ? "gap-3.5" : "gap-6"
                            )}
                            animate={{ opacity: isIdle ? 0 : 1, y: isIdle ? 30 : 0, pointerEvents: isIdle ? 'none' : 'auto' }}
                        >
                            <button
                                onClick={toggleShuffle}
                                className={cn(
                                    "transition-all active:scale-90",
                                    isShuffled ? "text-brand" : "text-white/50 hover:text-white"
                                )}
                                title="Shuffle"
                            >
                                <Shuffle size={16} strokeWidth={2.5} />
                            </button>

                            <button
                                onClick={toggleRepeat}
                                className={cn(
                                    "relative transition-all active:scale-90",
                                    repeatMode !== "off" ? "text-brand" : "text-white/50 hover:text-white"
                                )}
                                title={`Repeat: ${repeatMode}`}
                            >
                                <Repeat size={16} strokeWidth={repeatMode !== 'off' ? 2.5 : 2} />
                                {repeatMode !== "off" && (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                                        <span className="text-[6px] font-black mt-0.5">
                                            {repeatMode === "one" ? "1" : repeatMode === "two" ? "2" : "∞"}
                                        </span>
                                    </div>
                                )}
                            </button>

                            <button
                                onClick={() => toggleLikeMutation.mutate()}
                                className={cn(
                                    "transition-all active:scale-90",
                                    isLiked ? "text-brand" : "text-white/50 hover:text-white"
                                )}
                                title={isLiked ? "Unlike" : "Like"}
                            >
                                <Heart size={16} fill={isLiked ? "currentColor" : "none"} strokeWidth={2.5} />
                            </button>

                            <button onClick={handlePrev} className="text-white/60 hover:text-white transition-all active:scale-85">
                                <SkipBack size={22} fill="currentColor" strokeWidth={1.5} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                                className="flex items-center justify-center text-brand transition-all active:scale-90 drop-shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.25)]"
                            >
                                {isPlaying ? (
                                    <Pause size={48} fill="currentColor" strokeWidth={0} />
                                ) : (
                                    <Play size={48} fill="currentColor" strokeWidth={0} className="ml-1.5" />
                                )}
                            </button>

                            <button onClick={() => handleNext()} className="text-white/60 hover:text-white transition-all active:scale-85">
                                <SkipForward size={22} fill="currentColor" strokeWidth={1.5} />
                            </button>

                            <button
                                onClick={() => setAudioFxOpen(true)}
                                className="text-white/50 hover:text-white transition-all active:scale-90"
                                title="StudioFX Engine"
                            >
                                <Sparkles size={16} strokeWidth={2} />
                            </button>

                            <button
                                onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                                className={cn(
                                    "transition-all active:scale-90",
                                    isLyricsOpen ? "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]" : "text-white/50 hover:text-white"
                                )}
                                title="Lyrics"
                            >
                                <Mic2 size={16} strokeWidth={2} />
                            </button>

                            <button
                                onClick={() => setIsQueueOpen(!isQueueOpen)}
                                className={cn(
                                    "transition-all active:scale-90",
                                    isQueueOpen ? "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]" : "text-white/50 hover:text-white"
                                )}
                                title="Queue"
                            >
                                <ListMusic size={16} strokeWidth={2} />
                            </button>
                        </motion.div>

                        {/* Lossless Indicator - Hides on Idle */}
                        <motion.div
                            layout
                            transition={SPRING}
                            className="flex justify-center pt-1"
                            animate={{ opacity: isIdle ? 0 : 0.2, y: isIdle ? 10 : 0, pointerEvents: isIdle ? 'none' : 'auto' }}
                        >
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                                <div className="flex gap-[1px] items-center">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="w-[1px] h-1.5 bg-white rounded-full" />
                                    ))}
                                </div>
                                <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white">Lossless</span>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>

                {/* RIGHT PANEL: Full Lyrics — only when isLyricsOpen */}
                <AnimatePresence>
                    {isLyricsOpen && (
                        <motion.div
                            key="lyrics-panel"
                            initial={{ opacity: 0, x: 60, filter: "blur(12px)" }}
                            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, x: 60, filter: "blur(12px)" }}
                            transition={{ type: "spring", stiffness: 280, damping: 28, mass: 0.6 }}
                            className="flex-1 h-[calc(100vh-120px)] max-w-xl relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Close button */}
                            <button
                                onClick={() => setIsLyricsOpen(false)}
                                className="absolute top-2 right-4 z-20 text-white/30 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>

                            <LyricsView
                                trackId={currentTrack.id}
                                title={cleanTitle(currentTrack.title)}
                                artist={cleanTitle(currentTrack.artist?.name)}
                                rawLyrics={currentTrack.lyrics}
                                currentTime={currentTime}
                                isLyricsOpen={isLyricsOpen}
                                isMobile={false}
                                duration={duration}
                                isFullscreen={true}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}
