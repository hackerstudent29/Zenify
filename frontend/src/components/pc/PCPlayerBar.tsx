"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Repeat1, ListMusic, Maximize2, Settings2, Download, Heart, Mic2 } from "lucide-react";
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
import { MarqueeText } from "@/components/shared/MarqueeText";
import { PCPlayerBarScrubber } from "./../player/PlayerProgress";

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
    const duration = usePlayerStore(state => state.duration);

    const {
        isPlayerMinimized,
        setPlayerMinimized,
        setFullScreenPlayerOpen,
        openDownloadModal,
        isAudioFxOpen,
        setAudioFxOpen,
        isQueueOpen,
        setIsQueueOpen,
        isLyricsOpen,
        setIsLyricsOpen
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
        onMutate: async () => {
            if (!currentTrack) return;
            await queryClient.cancelQueries({ queryKey: ['liked-track-ids'] });
            const previousLikedIds = queryClient.getQueryData<string[]>(['liked-track-ids']);
            const newLikedIds = previousLikedIds ? (
                previousLikedIds.includes(currentTrack.id)
                    ? previousLikedIds.filter(id => id !== currentTrack.id)
                    : [...previousLikedIds, currentTrack.id]
            ) : [currentTrack.id];
            queryClient.setQueryData(['liked-track-ids'], newLikedIds);
            return { previousLikedIds };
        },
        onError: (err, newTodo, context) => {
            if (context?.previousLikedIds) {
                queryClient.setQueryData(['liked-track-ids'], context.previousLikedIds);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const queue = usePlayerStore(state => state.queue);
    
    // Track direction logic
    const prevTrackRef = useRef(currentTrack?.id);
    const directionRef = useRef(0);

    if (currentTrack?.id !== prevTrackRef.current) {
        if (!prevTrackRef.current) {
            directionRef.current = 0;
        } else {
            const prevIdx = queue.findIndex(t => t.id === prevTrackRef.current);
            const currIdx = queue.findIndex(t => t.id === currentTrack?.id);
            if (prevIdx !== -1 && currIdx !== -1) {
                // Handle queue wrap around (e.g. next track from last -> index 0)
                if (prevIdx === queue.length - 1 && currIdx === 0) directionRef.current = 1;
                else if (prevIdx === 0 && currIdx === queue.length - 1) directionRef.current = -1;
                else directionRef.current = currIdx > prevIdx ? 1 : -1;
            } else {
                directionRef.current = 1;
            }
        }
        prevTrackRef.current = currentTrack?.id;
    }
    const direction = directionRef.current;

    const handleHidePlayer = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const interactive = target.closest('button') || 
                          target.closest('[role="slider"]') || 
                          target.closest('a') ||
                          target.closest('.slider-root'); // Add explicit class for sliders
        if (interactive) return;
        setPlayerMinimized(true);
    };

    if (!currentTrack) return null;

    const isGlass = user?.preferences?.globalPlayerStyle === "glassmorphism";
    const inactiveBtn = isGlass ? "text-white/70 hover:text-white drop-shadow-md" : "text-zinc-500 hover:text-brand";
    const activeBtn = isGlass ? "text-brand drop-shadow-md" : "text-brand";
    const whiteBtn = isGlass ? "text-white hover:text-white/80 drop-shadow-md" : "text-white/80 hover:text-brand";

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
                    isGlass
                        ? "bg-transparent border-none"
                        : "bg-black/95 backdrop-blur-xl border-t border-white/5"
                )}
            >
                {/* Track Info (Left) */}
                <AnimatePresence mode="popLayout" custom={direction}>
                    <motion.div 
                        key={currentTrack.id}
                        custom={direction}
                        variants={{
                            initial: (dir: number) => ({
                                opacity: 0,
                                y: dir === 0 ? 30 : 0,
                                x: dir === 0 ? 0 : dir > 0 ? 50 : -50,
                                scale: dir === 0 ? 0.95 : 1
                            }),
                            animate: { opacity: 1, y: 0, x: 0, scale: 1 },
                            exit: (dir: number) => ({
                                opacity: 0,
                                y: dir === 0 ? -30 : 0,
                                x: dir === 0 ? 0 : dir > 0 ? -50 : 50,
                                scale: 0.95
                            })
                        }}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
                        className="flex items-center gap-4 flex-1 basis-0 min-w-0 h-full justify-start" 
                        onClick={(e) => e.stopPropagation()}
                    >
                    <motion.button
                        layoutId={`pc-album-art-container-${currentTrack.id}`}
                        animate={{ 
                            scale: isPlaying ? 1 : 0.82
                        }}
                        transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.9 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setFullScreenPlayerOpen(true);
                            setPlayerMinimized(false);
                        }}
                        className="relative h-11 w-11 group flex-shrink-0 cursor-pointer overflow-hidden rounded-lg shadow-2xl transition-all active:scale-95 hover:scale-105 border-none bg-transparent p-0"
                    >
                        <motion.img
                            key={currentTrack.id}
                            layoutId={`pc-album-art-${currentTrack.id}`}
                            src={getTrackCover(currentTrack)}
                            alt="Cover"
                            className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <Maximize2 size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </motion.button>
                    <div
                        className="flex flex-col min-w-0 flex-1 text-left justify-center pr-2"
                        onClick={(e) => e.stopPropagation()} 
                    >
                        <div className="min-w-0 w-full mb-0.5">
                             <MarqueeText className="text-[14px] md:text-[15px] text-foreground leading-none tracking-wide hover:text-brand transition-colors cursor-pointer pr-2">
                                <span 
                                    className="font-sans font-medium"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/track/${currentTrack.id}`);
                                    }}
                                >
                                    {formatDisplayTitle(cleanTitle(currentTrack.title))}
                                </span>
                            </MarqueeText>
                        </div>
                        
                        <div className="flex items-center justify-between w-full gap-3 leading-none mt-1">
                            <div className="min-w-0 flex-1">
                                <MarqueeText className="w-full">
                                    {currentTrack.artist?.id ? (
                                        <Link
                                            href={`/artist/${currentTrack.artist.id}`}
                                            className={cn("text-[14px] md:text-[15px] font-medium transition-colors block w-full truncate", isGlass ? "text-white/70 hover:text-white drop-shadow-sm" : "text-zinc-500 hover:text-white/60")}
                                        >
                                            {formatDisplayTitle(currentTrack.artist?.name) || 'Unknown Artist'}
                                        </Link>
                                    ) : (
                                        <span className={cn("text-[14px] md:text-[15px] font-medium block w-full truncate", isGlass ? "text-white/70 drop-shadow-sm" : "text-zinc-500")}>
                                            {formatDisplayTitle(currentTrack.artist?.name) || 'Unknown Artist'}
                                        </span>
                                    )}
                                </MarqueeText>
                            </div>
                            
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={(e) => { e.stopPropagation(); openDownloadModal(currentTrack); }}
                                    className="p-1 text-white/50 hover:text-brand transition-colors"
                                >
                                    <Download size={14} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleLikeMutation.mutate(); }}
                                    className="p-1 outline-none bg-transparent"
                                >
                                    <motion.div
                                        whileTap={{ scale: 0.7 }}
                                        animate={{ scale: isCurrentTrackLiked ? [1, 1.4, 1] : 1 }}
                                        transition={{ duration: 0.35, ease: "easeOut" }}
                                        className={cn(isCurrentTrackLiked ? "text-brand" : "text-white/50 hover:text-brand")}
                                    >
                                        <Heart size={16} className={cn(isCurrentTrackLiked && "fill-current")} />
                                    </motion.div>
                                </button>
                            </div>
                        </div>
                    </div>
                    </motion.div>
                </AnimatePresence>

                {/* Main Controls (Center - Pure Flexbox for perfect responsiveness) */}
                <div className="flex flex-col items-center justify-center w-full max-w-[400px] h-full pointer-events-auto px-4 shrink-0">
                    {/* Top Row: Buttons */}
                    <div className="flex items-center justify-center gap-6 md:gap-8 mb-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleShuffle(); }}
                            className={cn(
                                "p-1 transition-all duration-200 active:scale-90 outline-none",
                                isShuffled ? activeBtn : inactiveBtn
                            )}
                            title={`Shuffle: ${isShuffled ? 'On' : 'Off'}`}
                        >
                            <Shuffle size={14} strokeWidth={isShuffled ? 3 : 2} />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); playPrev(); }}
                            className={cn("p-1 transition-all active:scale-90", whiteBtn)}
                        >
                            <SkipBack size={18} fill="currentColor" strokeWidth={0} />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            className={cn("flex items-center justify-center transition-all active:scale-95", activeBtn)}
                        >
                            {isPlaying ? (
                                <Pause size={24} fill="currentColor" strokeWidth={0} />
                            ) : (
                                <Play size={24} fill="currentColor" strokeWidth={0} className="ml-0.5" />
                            )}
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); playNext(true); }}
                            className={cn("p-1 transition-all active:scale-90", whiteBtn)}
                        >
                            <SkipForward size={18} fill="currentColor" strokeWidth={0} />
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); toggleRepeat(); }}
                            className={cn(
                                "relative p-1 transition-all duration-200 active:scale-90 flex items-center justify-center outline-none",
                                repeatMode !== 'off' ? activeBtn : inactiveBtn
                            )}
                            title={`Repeat: ${repeatMode}`}
                        >
                            <Repeat size={16} strokeWidth={repeatMode !== 'off' ? 3 : 2} />
                            {repeatMode !== 'off' && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className={cn("text-[7px] font-black mt-0.5", isGlass && "drop-shadow-md")}>
                                        {repeatMode === "one" ? "1" : repeatMode === "two" ? "2" : "∞"}
                                    </span>
                                </div>
                            )}
                        </button>
                    </div>

                    {/* Bottom Row: Scrubber */}
                    <div className={cn("flex w-full items-center justify-center select-none", isGlass ? "text-white/80 drop-shadow-sm" : "text-zinc-600")} onClick={(e) => e.stopPropagation()}>
                        <PCPlayerBarScrubber />
                    </div>
                </div>

                {/* Volume & Right Controls */}
                <div className="flex items-center justify-end gap-4 flex-1 basis-0 min-w-0 h-full">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsLyricsOpen(!isLyricsOpen);
                        }}
                        className={cn(
                            "p-1.5 transition-colors outline-none focus:ring-0",
                            isLyricsOpen ? activeBtn : inactiveBtn
                        )}
                        title="Lyrics"
                    >
                        <Mic2 size={18} />
                    </button>

                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsQueueOpen(!isQueueOpen);
                        }}
                        className={cn(
                            "p-1.5 transition-colors outline-none focus:ring-0",
                            isQueueOpen ? activeBtn : inactiveBtn
                        )}
                        title="Queue"
                    >
                        <ListMusic size={18} />
                    </button>

                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAudioFxOpen(!isAudioFxOpen);
                        }}
                        className={cn(
                            "p-1.5 transition-colors outline-none focus:ring-0",
                            isAudioFxOpen ? activeBtn : inactiveBtn
                        )}
                        title="Studio FX"
                    >
                        <Settings2 size={20} className={cn(isAudioFxOpen && "animate-pulse")} />
                    </button>

                    <div className="flex items-center gap-2 w-28 lg:w-36 group">
                        <button
                            onClick={(e) => { e.stopPropagation(); setVolume(volume === 0 ? 0.8 : 0); }}
                            className={cn("transition-colors", inactiveBtn)}
                        >
                            {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} className={cn(volume > 0 && activeBtn)} />}
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
