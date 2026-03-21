"use client";

import React, { useEffect, useState, useRef } from "react";
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
    Download
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

function LyricsView({ trackId, title, artist, currentTime, isLyricsOpen, rawLyrics }: any) {
    const { data, isLoading } = useQuery({
        queryKey: ['lyrics', trackId],
        queryFn: async () => {
            const res = await api.get(`metadata/sync-lyrics`, {
                params: { 
                    title, 
                    artist, 
                    audioUrl: usePlayerStore.getState().currentTrack?.audioUrl,
                    rawLyrics 
                }
            });
            return res.data?.syncedTokens || [];
        },
        enabled: isLyricsOpen && !!trackId,
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
        <div className="w-full h-full flex flex-col justify-center items-center gap-4 px-6">
            <div className="h-5 w-2/3 bg-white/10 rounded animate-pulse" />
            <div className="h-7 w-full bg-white/15 rounded animate-pulse" />
            <div className="h-5 w-1/2 bg-white/10 rounded animate-pulse" />
        </div>
    );

    if (!lines.length) return (
        <div className="w-full h-full flex items-center justify-center p-6 text-center">
            <p className="text-white/20 font-bold text-xs uppercase tracking-[0.2em]">Lyrics Unavailable</p>
        </div>
    );

    // Show only prev, current, next lines
    const visibleLines = [
        { index: activeIndex - 1, line: lines[activeIndex - 1] },
        { index: activeIndex,     line: lines[activeIndex] },
        { index: activeIndex + 1, line: lines[activeIndex + 1] },
    ].filter(({ line }) => !!line);

    return (
        <div
            className="w-full h-full flex flex-col items-center justify-center gap-6 px-10"
            onPointerDown={(e) => e.stopPropagation()}
        >
            <AnimatePresence mode="popLayout">
                {visibleLines.map(({ index, line }) => {
                    const isActive = index === activeIndex;
                    return (
                        <motion.p
                            key={index}
                            layout
                            initial={{ opacity: 0, y: 16 }}
                            animate={{
                                opacity: isActive ? 1 : 0.25,
                                scale: isActive ? 1.06 : 0.95,
                                y: 0
                            }}
                            exit={{ opacity: 0, y: -16 }}
                            transition={{ duration: 0.35 }}
                            onClick={() => {
                                const audio = document.querySelector('audio') as HTMLAudioElement;
                                if (audio) audio.currentTime = line.time;
                            }}
                            className={cn(
                                "text-[24px] md:text-[30px] font-medium leading-snug text-center font-cormorant italic tracking-tight cursor-pointer",
                                isActive
                                    ? "text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                    : "text-white/40"
                            )}
                        >
                            {line.text}
                        </motion.p>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

export function PCFullScreenPlayer() {
    const {
        setFullScreenPlayerOpen,
        setPlayerMinimized,
        isPlayerMinimized,
        isLyricsOpen,
        setIsLyricsOpen,
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
            style={{ zIndex: 2147483647 }}
            className="fixed inset-0 bg-black overflow-hidden font-[family-name:var(--font-plus-jakarta)]"
            onClick={() => setFullScreenPlayerOpen(false)}
        >
            <DynamicBackground coverUrl={currentTrack.coverUrl} />

            {/* Full-Screen Lyrics Overlay (properly sized, not inside artwork box) */}
            <AnimatePresence>
                {isLyricsOpen && (
                    <motion.div
                        initial={{ opacity: 0, filter: "blur(12px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, filter: "blur(12px)" }}
                        transition={{ duration: 0.45, ease: PREMIUM_EASE }}
                        className="absolute inset-x-0 top-0 bottom-[280px] z-20 flex items-center justify-center pointer-events-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-full max-w-2xl h-full pointer-events-auto">
                            <LyricsView
                                trackId={currentTrack.id}
                                title={currentTrack.title}
                                artist={currentTrack.artist?.name}
                                rawLyrics={currentTrack.lyrics}
                                currentTime={currentTime}
                                isLyricsOpen={true}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>


            {/* Top Right Controls */}
            <div className="absolute top-8 right-10 z-50 flex items-center gap-4">
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
                <div className="w-full max-w-sm flex flex-col items-center gap-6">

                    {/* Artwork - square card */}
                    <div className="relative w-[320px] h-[320px] shrink-0">
                        <motion.div 
                            animate={{ 
                                opacity: isLyricsOpen ? 0 : 1,
                                scale: isLyricsOpen ? 0.9 : 1,
                                pointerEvents: isLyricsOpen ? "none" : "auto"
                            }}
                            transition={{ duration: 0.4 }}
                            className="absolute inset-0 rounded-[2.5rem] overflow-hidden shadow-[0_42px_100px_rgba(0,0,0,0.9)] border border-white/5"
                        >
                            <motion.img
                                layoutId={!isPlayerMinimized ? `artwork-${currentTrack.id}` : undefined}
                                src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                className="w-full h-full object-cover"
                                alt={currentTrack.title}
                            />
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
                                    <Slider.Track className="bg-white/5 relative grow rounded-full h-[3px]">
                                        <Slider.Range className="absolute bg-white/30 rounded-full h-full" />
                                    </Slider.Track>
                                    <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Slider.Root>
                                <div className="flex justify-between text-[9px] font-bold text-white/10 tabular-nums mt-1 tracking-wider">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>{formatRemainingTime(currentTime, duration)}</span>
                                </div>
                            </div>

                            {/* Controls — single flat centered row */}
                            <div className="flex items-center justify-center gap-7 py-2">
                                <button
                                    onClick={toggleShuffle}
                                    className={cn(
                                        "transition-all active:scale-95",
                                        isShuffled ? "text-brand" : "text-white/40 hover:text-brand"
                                    )}
                                    title="Shuffle"
                                >
                                    <Shuffle size={18} strokeWidth={2} />
                                </button>

                                <button
                                    onClick={toggleRepeat}
                                    className={cn(
                                        "relative transition-all active:scale-95",
                                        repeatMode !== "off" ? "text-brand" : "text-white/40 hover:text-brand"
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

                                <button onClick={() => playPrev()} className="text-white/80 hover:text-brand transition-all active:scale-90">
                                    <SkipBack size={26} fill="currentColor" strokeWidth={0} />
                                </button>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        togglePlay();
                                    }}
                                    className="w-16 h-16 rounded-full flex items-center justify-center text-brand ring-2 ring-brand/30 transition-all active:scale-95"
                                >
                                    {isPlaying ? (
                                        <Pause size={36} fill="currentColor" strokeWidth={0} />
                                    ) : (
                                        <Play size={36} fill="currentColor" strokeWidth={0} className="ml-1" />
                                    )}
                                </button>

                                <button onClick={() => playNext(true)} className="text-white/80 hover:text-brand transition-all active:scale-90">
                                    <SkipForward size={26} fill="currentColor" strokeWidth={0} />
                                </button>

                                <button 
                                    onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                                    className={cn(
                                        "transition-all active:scale-95",
                                        isLyricsOpen ? "text-brand drop-shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]" : "text-white/40 hover:text-brand"
                                    )}
                                    title="Lyrics"
                                >
                                    <MessageSquare size={18} strokeWidth={2} />
                                </button>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="transition-all text-white/40 hover:text-brand outline-none active:scale-95">
                                            <MoreHorizontal size={18} strokeWidth={2} />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        className="w-52 z-[2147483647] pointer-events-auto"
                                        align="center"
                                        side="top"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <DropdownMenuItem onClick={() => toggleLikeMutation.mutate()}>
                                            <Heart size={14} className={isLiked ? "fill-current text-[#EF4444]" : "opacity-70"} />
                                            <span>{isLiked ? "Liked" : "Add to Favorites"}</span>
                                        </DropdownMenuItem>

                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger>
                                                <Plus size={14} className="opacity-70" /> <span>Add to Playlist</span>
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuPortal>
                                                <DropdownMenuSubContent className="w-48 ml-1 z-[10002]">
                                                    {playlists?.map((p: any) => (
                                                        <DropdownMenuItem
                                                            key={p.id}
                                                            onClick={() => addToPlaylistMutation.mutate(p.id)}
                                                        >
                                                            {p.name}
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuPortal>
                                        </DropdownMenuSub>

                                        <DropdownMenuSeparator className="bg-white/10" />

                                        <DropdownMenuItem onClick={() => openDownloadModal(currentTrack)}>
                                            <Download size={14} className="opacity-70" /> <span>Download Track</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
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
