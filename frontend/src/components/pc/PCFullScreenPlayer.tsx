"use client";

import React, { useEffect } from "react";
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

export function PCFullScreenPlayer() {
    const {
        setFullScreenPlayerOpen,
        setPlayerMinimized,
        isPlayerMinimized,
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
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{
                type: "spring",
                damping: 35,
                stiffness: 150,
                opacity: { duration: 0.3 }
            }}
            style={{ zIndex: 2147483647 }}
            className="fixed inset-0 bg-black overflow-hidden font-[family-name:var(--font-plus-jakarta)]"
            onClick={() => setFullScreenPlayerOpen(false)}
        >
            <DynamicBackground coverUrl={currentTrack.coverUrl} />


            {/* Top Right Controls */}
            <div className="absolute top-8 right-10 z-50 flex items-center gap-4">
                <button
                    onClick={() => {
                        setFullScreenPlayerOpen(false);
                        setPlayerMinimized(true);
                    }}
                    className="p-2 text-white/40 hover:text-white transition-all transform hover:scale-110 active:scale-90"
                >
                    <Minimize2 size={20} strokeWidth={1.5} />
                </button>
                <button
                    onClick={() => setFullScreenPlayerOpen(false)}
                    className="p-2 text-white/40 hover:text-white transition-all transform hover:scale-110 active:scale-90"
                >
                    <X size={24} strokeWidth={1.5} />
                </button>
            </div>

            {/* Main Content (Centered Layout) */}
            <div className="relative z-10 flex h-full items-center justify-center px-6 pt-12" onClick={(e) => e.stopPropagation()}>
                <div className="w-full max-w-sm flex flex-col items-center gap-6">

                    {/* Album Art */}
                    <div className="w-full aspect-square max-w-[280px]">
                        <motion.div
                            layoutId={!isPlayerMinimized ? `artwork-${currentTrack.id}` : undefined}
                            className="aspect-square w-full rounded-[2rem] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.8)] border border-white/10 bg-zinc-900"
                        >
                            <img
                                src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                className="w-full h-full object-cover"
                                alt={currentTrack.title}
                            />
                        </motion.div>
                    </div>

                    <div className="w-full space-y-5">
                        <div className="text-center w-full px-4">
                            <h2 className="text-2xl font-bold tracking-tight text-white font-brand mb-1 leading-relaxed py-1">
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

                                <button className="text-white/40 hover:text-brand transition-all active:scale-95">
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
