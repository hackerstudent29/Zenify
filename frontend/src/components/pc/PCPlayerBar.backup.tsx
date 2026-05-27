"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Repeat1, ListMusic, Maximize2, Settings2, Download, Heart } from "lucide-react";
import { cn, getMediaUrl, cleanTitle, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export function PCPlayerBar() {
    const router = useRouter();
    const currentTrack = usePlayerStore(state => state.currentTrack);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const togglePlay = usePlayerStore(state => state.togglePlay);
    const playNext = usePlayerStore(state => state.playNext);
    const playPrev = usePlayerStore(state => state.playPrev);
    const volume = usePlayerStore(state => state.volume);
    const setVolume = usePlayerStore(state => state.setVolume);
    const isShuffled = usePlayerStore(state => state.isShuffled);
    const toggleShuffle = usePlayerStore(state => state.toggleShuffle);
    const repeatMode = usePlayerStore(state => state.repeatMode);
    const toggleRepeat = usePlayerStore(state => state.toggleRepeat);
    const currentTime = usePlayerStore(state => state.currentTime);
    const duration = usePlayerStore(state => state.duration);
    const setCurrentTime = usePlayerStore(state => state.setCurrentTime);

    const {
        isPlayerMinimized,
        setPlayerMinimized,
        setFullScreenPlayerOpen,
        openDownloadModal,
        isAudioFxOpen,
        setAudioFxOpen,
        isQueueOpen,
        setIsQueueOpen
    } = useUIStore();
    const { user } = useAuthStore();
    const queryClient = useQueryClient();

    // Like state for the current track
    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('tracks/liked');
            return (res.data as Track[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
    });
    const isCurrentTrackLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;
    const toggleLikeMutation = useMutation({
        mutationFn: async () => {
            if (!currentTrack) return;
            await api.post(`tracks/${currentTrack.id}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const handleHidePlayer = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const interactive = target.closest('button') || 
                          target.closest('[role="slider"]') || 
                          target.closest('a') ||
                          target.closest('.slider-root'); // Add explicit class for sliders
        if (interactive) return;
        setPlayerMinimized(true);
    };

    const handleSeek = (val: number[]) => {
        audioEngine.resume();
        const audio = audioEngine.getActiveAudioElement();
        if (audio) {
            audio.currentTime = val[0];
            setCurrentTime(val[0]);
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (!currentTrack) return null;

    return (
        <AnimatePresence>
            <motion.div
                key="pc-player-bar"
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: "spring", stiffness: 350, damping: 32, mass: 0.8 }}
                onClick={handleHidePlayer}
                className={cn(
                    "w-full h-full px-4 md:px-6 flex items-center justify-between transition-all duration-300 relative select-none",
                    user?.preferences?.globalPlayerStyle === "glassmorphism"
                        ? "bg-transparent border-none"
                        : "bg-black/95 backdrop-blur-xl border-t border-white/5"
                )}
            >
                {/* Track Info (Left) */}
                <div className="flex items-center gap-4 w-[30%] min-w-0 h-full" onClick={(e) => e.stopPropagation()}>
                    <motion.button
                        layoutId="album-art"
                        transition={{ type: "spring", stiffness: 350, damping: 32, mass: 0.8 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setFullScreenPlayerOpen(true);
                            setPlayerMinimized(false);
                        }}
                        className="relative h-11 w-11 group flex-shrink-0 cursor-pointer overflow-hidden rounded-lg shadow-2xl transition-all active:scale-95 hover:scale-105 border-none bg-transparent p-0"
                    >
                        <img
                            src={getTrackCover(currentTrack)}
                            alt="Cover"
                            className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <Maximize2 size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </motion.button>
                    <div
                        className="flex flex-col min-w-0 flex-1 text-left"
                        onClick={(e) => e.stopPropagation()} // Keep info area safe but refine children
                    >
                        <div className="flex items-center gap-2 max-w-full">
                            <h4
                                onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/track/${currentTrack.id}`);
                                }}
                                className="text-[13px] md:text-[14px] font-bold text-foreground truncate leading-normal tracking-tight hover:text-brand transition-colors cursor-pointer"
                            >
                                {formatDisplayTitle(cleanTitle(currentTrack.title))}
                            </h4>
                            <button
                                onClick={(e) => { e.stopPropagation(); openDownloadModal(currentTrack); }}
                                className="p-1 text-white/50 hover:text-brand transition-colors flex-shrink-0"
                            >
                                <Download size={14} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleLikeMutation.mutate(); }}
                                className={cn("p-1 transition-colors flex-shrink-0", isCurrentTrackLiked ? "text-brand" : "text-white/50 hover:text-brand")}
                            >
                                <Heart size={16} className={cn(isCurrentTrackLiked && "fill-current")} />
                            </button>
                        </div>
                        {currentTrack.artist?.id ? (
                            <Link
                                href={`/artist/${currentTrack.artist.id}`}
                                className="text-[11px] md:text-[12px] text-zinc-500 font-medium truncate mt-0.5 hover:text-white/60 transition-colors inline-block w-fit"
                            >
                                {formatDisplayTitle(currentTrack.artist?.name) || 'Unknown Artist'}
                            </Link>
                        ) : (
                            <p className="text-[11px] md:text-[12px] text-zinc-500 font-medium truncate mt-0.5">
                                {formatDisplayTitle(currentTrack.artist?.name) || 'Unknown Artist'}
                            </p>
                        )}
                    </div>
                </div>

                {/* Main Controls (Center) */}
                <div className="flex flex-col items-center justify-center flex-1 max-w-[45%] h-full">
                    {/* Top Row: Buttons */}
                    <div className="flex items-center justify-center gap-6 md:gap-8 mb-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleShuffle(); }}
                            className={cn(
                                "p-1 transition-all duration-200 active:scale-90 outline-none",
                                isShuffled ? "text-brand" : "text-zinc-500 hover:text-brand"
                            )}
                            title={`Shuffle: ${isShuffled ? 'On' : 'Off'}`}
                        >
                            <Shuffle size={14} strokeWidth={isShuffled ? 3 : 2} />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); playPrev(); }}
                            className="p-1 text-white/80 hover:text-brand transition-all active:scale-90"
                        >
                            <SkipBack size={18} fill="currentColor" strokeWidth={0} />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            className="flex items-center justify-center text-brand transition-all active:scale-95"
                        >
                            {isPlaying ? (
                                <Pause size={24} fill="currentColor" strokeWidth={0} />
                            ) : (
                                <Play size={24} fill="currentColor" strokeWidth={0} className="ml-0.5" />
                            )}
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); playNext(true); }}
                            className="p-1 text-white/80 hover:text-brand transition-all active:scale-90"
                        >
                            <SkipForward size={18} fill="currentColor" strokeWidth={0} />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); toggleRepeat(); }}
                            className={cn(
                                "relative p-1 transition-all duration-200 active:scale-90 flex items-center justify-center outline-none",
                                repeatMode !== 'off' ? "text-brand" : "text-zinc-500 hover:text-brand"
                            )}
                            title={`Repeat: ${repeatMode}`}
                        >
                            <Repeat size={16} strokeWidth={repeatMode !== 'off' ? 3 : 2} />
                            {repeatMode !== 'off' && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-[7px] font-black mt-0.5">
                                        {repeatMode === "one" ? "1" : repeatMode === "two" ? "2" : "∞"}
                                    </span>
                                </div>
                            )}
                        </button>
                    </div>

                    {/* Bottom Row: Scrubber */}
                    <div className="flex w-full items-center gap-4 text-[11px] font-bold text-zinc-600 tabular-nums select-none" onClick={(e) => e.stopPropagation()}>
                        <span className="w-10 text-right">{formatTime(currentTime)}</span>
                        <Slider.Root
                            className="relative flex items-center select-none touch-none w-full h-3 group/slider cursor-pointer slider-root"
                            value={[currentTime]}
                            max={duration || 100}
                            step={0.1}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onValueChange={handleSeek}
                        >
                            <Slider.Track className="bg-white/5 relative grow rounded-full h-[3px] group-hover/slider:h-[4px] transition-all">
                                <Slider.Range className="absolute bg-white/40 group-hover/slider:bg-brand rounded-full h-full transition-colors shadow-[0_0_8px_255,255,255,0.1)]" />
                            </Slider.Track>
                            <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full shadow-lg outline-none opacity-0 group-hover/slider:opacity-100 transition-opacity" />
                        </Slider.Root>
                        <span className="w-10 text-left">{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Volume (Right) */}
                <div className="flex items-center justify-end gap-5 w-[30%] h-full">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsQueueOpen(!isQueueOpen);
                        }}
                        className={cn(
                            "p-1.5 transition-colors outline-none focus:ring-0",
                            isQueueOpen ? "text-brand" : "text-zinc-500 hover:text-brand"
                        )}
                        title="Queue"
                    >
                        <ListMusic size={20} />
                    </button>

                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAudioFxOpen(!isAudioFxOpen);
                        }}
                        className={cn(
                            "p-1.5 transition-colors outline-none focus:ring-0",
                            isAudioFxOpen ? "text-brand" : "text-zinc-500 hover:text-brand"
                        )}
                        title="Studio FX"
                    >
                        <Settings2 size={20} className={cn(isAudioFxOpen && "animate-pulse")} />
                    </button>

                    <div className="flex items-center gap-2 w-28 lg:w-36 group">
                        <button
                            onClick={(e) => { e.stopPropagation(); setVolume(volume === 0 ? 0.8 : 0); }}
                            className="text-zinc-500 hover:text-brand transition-colors"
                        >
                            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} className={cn(volume > 0 && "text-brand")} />}
                        </button>
                        <Slider.Root
                            className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer slider-root"
                            value={[volume * 100]}
                            max={100}
                            step={1}
                            onValueChange={([val]) => setVolume(val / 100)}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Slider.Track className="bg-white/10 relative grow rounded-full h-[3px]">
                                <Slider.Range className="absolute bg-brand rounded-full h-full" />
                            </Slider.Track>
                            <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-lg outline-none cursor-pointer transition-transform hover:scale-110 active:scale-95" />
                        </Slider.Root>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
