"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    MoreHorizontal,
    MessageSquare,
    X,
    Minimize2,
    Volume2,
    Shuffle,
    Repeat,
    Repeat1,
    Heart,
    Plus,
    Download,
    Sparkles,
    ListMusic,
    Mic2
} from "lucide-react";
import { getMediaUrl, cn, cleanTitle } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { DynamicBackground } from "../player/DynamicBackground";
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
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

import { LyricsView } from "../shared/LyricsView";

export function PCFullScreenPlayer() {
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
    const { isAuthenticated } = useAuthStore();
    const openDownloadModal = useUIStore(state => state.openDownloadModal);

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

    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

    const resetIdleTimer = useCallback(() => {
        setIsIdle(false);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (isLyricsOpen) {
            idleTimerRef.current = setTimeout(() => {
                setIsIdle(true);
            }, 5000);
        }
    }, [isLyricsOpen]);

    useEffect(() => {
        if (isLyricsOpen) {
            const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
            const handler = () => resetIdleTimer();
            events.forEach(e => window.addEventListener(e, handler));
            resetIdleTimer();
            return () => {
                events.forEach(e => window.removeEventListener(e, handler));
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            };
        } else {
            setIsIdle(false);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        }
    }, [isLyricsOpen, resetIdleTimer]);

    React.useEffect(() => {
        setIsLyricsOpen(false);
    }, [currentTrack?.id, setIsLyricsOpen]);


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

    const [loadedCover, setLoadedCover] = useState(currentTrack ? (getMediaUrl(currentTrack.coverUrl) || "/logo.png") : "/logo.png");

    useEffect(() => {
        if (!currentTrack) return;
        const nextCover = getMediaUrl(currentTrack.coverUrl) || "/logo.png";
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
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{
                duration: 0.35,
                ease: [0.32, 0.72, 0, 1]
            }}
            style={{ zIndex: 850 }}
            className={cn(
                "fixed inset-0 bg-black overflow-hidden font-[family-name:var(--font-plus-jakarta)] transition-all duration-700",
                isIdle && "focus-mode"
            )}
            onClick={() => setFullScreenPlayerOpen(false)}
        >
            <AnimatePresence mode="wait">
                <DynamicBackground 
                    key={currentTrack.id}
                    coverUrl={loadedCover} 
                />
            </AnimatePresence>



            {/* Top Right Controls */}
            <div className={cn(
                "absolute top-8 right-10 z-50 flex items-center gap-4 transition-opacity duration-500",
                isIdle && "opacity-0 pointer-events-none"
            )}>
                {/* Double Arrow (Minimize): Go to Global Player (keeps playing) */}
                <button
                    onClick={() => {
                        setFullScreenPlayerOpen(false);
                        // No need to clear track, global player continues
                    }}
                    className="p-2 text-white/40 hover:text-white transition-all transform hover:scale-110 active:scale-90"
                    title="Minimize to Global Player"
                >
                    <Minimize2 size={20} strokeWidth={1.5} />
                </button>
                {/* X (Close): Close all players (stops playback) */}
                <button
                    onClick={() => {
                        setFullScreenPlayerOpen(false);
                        usePlayerStore.setState({ currentTrack: null, isPlaying: false });
                        const audio = document.querySelector('audio');
                        if (audio) {
                            audio.pause();
                            audio.src = '';
                        }
                    }}
                    className="p-2 text-white/40 hover:text-white transition-all transform hover:scale-110 active:scale-90"
                    title="Close All Players"
                >
                    <X size={24} strokeWidth={1.5} />
                </button>
            </div>

            {/* Main Content (Centered Layout) */}
            <div className="relative z-10 flex h-full items-center justify-center px-6 pt-12" onClick={(e) => e.stopPropagation()}>
                <div className={cn(
                    "w-full max-w-sm flex flex-col items-center gap-6 transition-all duration-500",
                    isIdle && "opacity-0 pointer-events-none translate-y-8"
                )}>

                    {/* Artwork & Lyrics Container - 3D Flip System */}
                    <div className="relative w-[260px] h-[260px] lg:w-[300px] lg:h-[300px] shrink-0 [perspective:1200px]">
                        <motion.div
                            animate={{ rotateY: isLyricsOpen ? 180 : 0 }}
                            transition={{ duration: 0.8, ease: PREMIUM_EASE }}
                            className="relative w-full h-full [transform-style:preserve-3d]"
                        >
                            {/* Front: Artwork */}
                            <motion.div 
                                className="absolute inset-0 [backface-visibility:hidden] rounded-3xl overflow-hidden border border-white/10"
                                animate={{ 
                                    opacity: isLyricsOpen ? 0 : 1,
                                    boxShadow: isLyricsOpen 
                                        ? "0 0px 0px rgba(0,0,0,0)" 
                                        : "0 30px 90px rgba(0,0,0,0.8)"
                                }}
                                transition={{ duration: 0.3 }}
                            >
                                <motion.img
                                    key={currentTrack.id}
                                    layoutId={!isPlayerMinimized ? `artwork-${currentTrack.id}` : undefined}
                                    src={loadedCover}
                                    className="w-full h-full object-cover pointer-events-none"
                                    alt={currentTrack.title}
                                />
                                {/* Hidden Toggle to re-enable flipping on tap */}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsLyricsOpen(true); }}
                                    className="absolute inset-0 w-full h-full bg-transparent cursor-pointer"
                                />
                            </motion.div>

                            {/* Back: Mini Lyrics / Quick View */}
                            <motion.div 
                                className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-3xl overflow-hidden bg-white/5 backdrop-blur-3xl border border-white/10 relative z-10"
                                animate={{ opacity: isLyricsOpen ? 1 : 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                <LyricsView
                                    trackId={currentTrack.id}
                                    title={cleanTitle(currentTrack.title)}
                                    artist={cleanTitle(currentTrack.artist?.name)}
                                    rawLyrics={currentTrack.lyrics}
                                    currentTime={currentTime}
                                    isLyricsOpen={isLyricsOpen}
                                    isMobile={false}
                                    duration={duration}
                                />
                                {/* Back Toggle Button */}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setIsLyricsOpen(false); }}
                                    className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </motion.div>
                        </motion.div>
                    </div>

                    <div className="w-full max-w-2xl pt-2 space-y-6 text-center">
                        <div className="text-center w-full px-4">
                            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-brand mb-1 leading-relaxed py-1">
                                {cleanTitle(currentTrack.title)}
                            </h2>
                            <div className="flex justify-center">
                                {currentTrack.artist?.id ? (
                                    <Link
                                        href={`/artist/${currentTrack.artist.id}`}
                                        onClick={() => setFullScreenPlayerOpen(false)}
                                        className="text-sm text-white/40 font-bold hover:text-brand transition-all cursor-pointer inline-block tracking-widest uppercase"
                                    >
                                        {currentTrack.artist?.name || 'Unknown Artist'}
                                    </Link>
                                ) : (
                                    <p className="text-sm text-white/40 font-bold tracking-widest uppercase">
                                        {currentTrack.artist?.name || 'Unknown Artist'}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {/* Progress Slider */}
                            <div>
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
                                    <Slider.Track className="bg-white/5 relative grow rounded-full h-[3px] overflow-hidden">
                                        <Slider.Range className="absolute bg-brand rounded-full h-full shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.3)]" />
                                    </Slider.Track>
                                    <Slider.Thumb className="hidden" />
                                </Slider.Root>
                                <div className="flex justify-between text-[9px] font-bold text-white/10 tabular-nums mt-1 tracking-wider">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>{formatRemainingTime(currentTime, duration)}</span>
                                </div>
                            </div>

                            {/* Controls — single flat centered row */}                            <div className="flex items-center justify-center gap-x-12 py-6 w-full">
                                {/* Left Support Group (Shuffle, Repeat, Heart) */}
                                <div className="flex items-center gap-8">
                                    <button
                                        onClick={toggleShuffle}
                                        className={cn(
                                            "transition-all active:scale-95",
                                            isShuffled ? "text-brand" : "text-white/30 hover:text-white"
                                        )}
                                        title="Shuffle"
                                    >
                                        <Shuffle size={18} strokeWidth={2} />
                                    </button>

                                    <button
                                        onClick={toggleRepeat}
                                        className={cn(
                                            "relative transition-all active:scale-95",
                                            repeatMode !== "off" ? "text-brand" : "text-white/30 hover:text-white"
                                        )}
                                        title={`Repeat: ${repeatMode}`}
                                    >
                                        <Repeat size={18} strokeWidth={repeatMode !== 'off' ? 2.5 : 2} />
                                        {repeatMode !== "off" && (
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                                                <span className="text-[7px] font-black mt-0.5">
                                                    {repeatMode === "one" ? "1" : repeatMode === "two" ? "2" : "∞"}
                                                </span>
                                            </div>
                                        )}
                                    </button>

                                    <button 
                                        onClick={() => toggleLikeMutation.mutate()}
                                        className={cn(
                                            "transition-all active:scale-95",
                                            isLiked ? "text-brand" : "text-white/30 hover:text-white"
                                        )}
                                        title={isLiked ? "Unlike" : "Like"}
                                    >
                                        <Heart size={18} fill={isLiked ? "currentColor" : "none"} strokeWidth={2.5} />
                                    </button>
                                </div>

                                {/* Core Playback Center (Compact) */}
                                <div className="flex items-center gap-8">
                                    <button onClick={() => playPrev()} className="text-white/60 hover:text-white transition-all active:scale-85">
                                        <SkipBack size={24} fill="currentColor" strokeWidth={1.5} />
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            togglePlay();
                                        }}
                                        className="w-16 h-16 rounded-full flex items-center justify-center text-brand ring-[3px] ring-brand/10 bg-brand/5 hover:bg-brand/10 transition-all active:scale-90 shadow-xl shadow-brand/10"
                                    >
                                        {isPlaying ? (
                                            <Pause size={34} fill="currentColor" strokeWidth={0} />
                                        ) : (
                                            <Play size={34} fill="currentColor" strokeWidth={0} className="ml-1" />
                                        )}
                                    </button>

                                    <button onClick={() => playNext(true)} className="text-white/60 hover:text-white transition-all active:scale-85">
                                        <SkipForward size={24} fill="currentColor" strokeWidth={1.5} />
                                    </button>
                                </div>

                                {/* Right Actions Group (FX, Lyrics, Queue) */}
                                <div className="flex items-center gap-8">
                                    <button 
                                        onClick={() => setAudioFxOpen(true)}
                                        className="transition-all text-white/30 hover:text-white active:scale-95"
                                        title="StudioFX Engine"
                                    >
                                        <Sparkles size={18} strokeWidth={2} />
                                    </button>

                                    <button 
                                        onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                                        className={cn(
                                            "transition-all active:scale-95",
                                            isLyricsOpen ? "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]" : "text-white/30 hover:text-white"
                                        )}
                                        title="Lyrics"
                                    >
                                        <Mic2 size={18} strokeWidth={2} />
                                    </button>

                                    <button 
                                        onClick={() => setIsQueueOpen(!isQueueOpen)}
                                        className={cn(
                                            "transition-all active:scale-95",
                                            isQueueOpen ? "text-brand" : "text-white/30 hover:text-white"
                                        )}
                                        title="Queue"
                                    >
                                        <ListMusic size={18} strokeWidth={2} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Lossless Indicator at very bottom */}
                    <div className="flex justify-center pt-10 opacity-20">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                            <div className="flex gap-[1px] items-center">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="w-[1px] h-1.5 bg-white rounded-full" />
                                ))}
                            </div>
                            <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white">Lossless</span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
