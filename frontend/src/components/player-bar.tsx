"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Repeat1, ListMusic, Maximize2, Settings2, Download, Heart } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { AudioFxMenu } from "./player/audio-fx-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";

export function PlayerBar() {
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
    const audioFx = usePlayerStore(state => state.audioFx);
    const currentTime = usePlayerStore(state => state.currentTime);
    const duration = usePlayerStore(state => state.duration);
    const setCurrentTime = usePlayerStore(state => state.setCurrentTime);
    const setDuration = usePlayerStore(state => state.setDuration);

    const {
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
            const res = await api.get('/tracks/liked');
            return (res.data as Track[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
    });
    const isCurrentTrackLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;
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

    const [showFx, setShowFx] = useState(false);
    const fxRef = useRef<HTMLDivElement>(null);

    const handleHidePlayer = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const interactive = target.closest('button') ||
            target.closest('[role="slider"]') ||
            target.closest('a');
        if (interactive) return;
        setPlayerMinimized(true);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (fxRef.current && !fxRef.current.contains(event.target as Node)) {
                setShowFx(false);
            }
        };
        if (showFx) document.addEventListener("mousedown", handleClickOutside);
        else document.removeEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showFx]);

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

    return (
        <AnimatePresence>
            {currentTrack && (
                <motion.div
                    key="premium-player-bar"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    onClick={handleHidePlayer}
                    className="w-full h-full px-4 md:px-6 flex items-center justify-between transition-all duration-300 relative select-none cursor-default bg-black/95 backdrop-blur-xl border-t border-white/5"
                >

                    {/* Track Info (Left) */}
                    <div className="flex items-center gap-4 w-[30%] min-w-0 h-full">
                        <div
                            className="relative h-12 w-12 md:h-14 md:w-14 flex-shrink-0 overflow-hidden rounded-lg shadow-2xl"
                        >
                            <img
                                src={getMediaUrl(currentTrack.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200"}
                                alt="Cover"
                                className="h-full w-full object-cover"
                            />
                        </div>
                        <div className="flex flex-col min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2">
                                <h4 className="text-[13px] md:text-[14px] font-bold text-foreground truncate leading-tight tracking-tight">
                                    {currentTrack.title}
                                </h4>
                                <button
                                    onClick={(e) => { e.stopPropagation(); openDownloadModal(currentTrack); }}
                                    className="p-1 rounded-full text-white/20 hover:text-brand transition-all"
                                >
                                    <Download size={14} />
                                </button>
                            </div>
                            <p className="text-[11px] md:text-[12px] text-zinc-500 font-medium truncate mt-0.5">
                                {currentTrack.artist.name}
                            </p>
                        </div>
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); toggleLikeMutation.mutate(); }}
                            className={cn("p-2 ml-2 transition-all block", isCurrentTrackLiked ? "text-brand" : "text-white/20 hover:text-brand")}
                        >
                            <Heart size={18} className={cn(isCurrentTrackLiked && "fill-current")} />
                        </button>
                    </div>

                    {/* Main Controls (Center) */}
                    <div className="flex flex-col items-center justify-center flex-1 max-w-[45%] h-full gap-1.5">
                        <div className="flex items-center justify-center gap-4 md:gap-7 mb-1">
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleShuffle(); }}
                                className={cn(
                                    "p-1.5 transition-all duration-200 active:scale-90",
                                    isShuffled ? "text-brand" : "text-zinc-500"
                                )}
                                title="Shuffle"
                            >
                                <Shuffle size={18} strokeWidth={2.5} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); playPrev(); }}
                                className="p-1.5 text-brand hover:scale-110 transition-all active:scale-90"
                            >
                                <SkipBack size={24} fill="currentColor" strokeWidth={0} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                                className="w-12 h-12 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand hover:scale-105 hover:bg-brand/20 transition-all active:scale-95 shadow-sm"
                            >
                                {isPlaying ? <Pause size={22} fill="currentColor" strokeWidth={0} /> : <Play size={22} fill="currentColor" strokeWidth={0} className="ml-1" />}
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); playNext(true); }}
                                className="p-1.5 text-brand hover:scale-110 transition-all active:scale-90"
                            >
                                <SkipForward size={24} fill="currentColor" strokeWidth={0} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); toggleRepeat(); }}
                                className={cn(
                                    "p-1.5 transition-all duration-200 active:scale-90 flex items-center justify-center",
                                    repeatMode !== 'off' ? "text-brand" : "text-zinc-500"
                                )}
                                title={`Repeat: ${repeatMode}`}
                            >
                                {repeatMode === 'one' ? (
                                    <Repeat1 size={18} strokeWidth={2.5} />
                                ) : (
                                    <Repeat size={18} strokeWidth={2.5} />
                                )}
                            </button>
                        </div>

                        <div className="flex w-full items-center gap-3 text-[11px] font-medium text-zinc-500 tabular-nums" onClick={(e) => e.stopPropagation()}>
                            <span className="w-9 text-right" onClick={(e) => e.stopPropagation()}>{formatTime(currentTime)}</span>
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-4 group/slider cursor-pointer"
                                value={[currentTime]}
                                max={duration || 100}
                                step={0.1}
                                onValueChange={handleSeek}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <Slider.Track className="bg-white/10 relative grow rounded-full h-[4px] group-hover/slider:h-[6px] transition-all duration-300">
                                    <Slider.Range className="absolute bg-brand rounded-full h-full shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]" />
                                </Slider.Track>
                                <Slider.Thumb className="block w-3.5 h-3.5 bg-white rounded-full shadow-lg outline-none cursor-pointer transition-all opacity-0 group-hover/slider:opacity-100 scale-75 group-hover/slider:scale-100" />
                            </Slider.Root>
                            <span className="w-9 text-left" onClick={(e) => e.stopPropagation()}>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Volume & User (Right) */}
                    <div className="flex items-center justify-end gap-5 w-[30%] h-full">
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsQueueOpen(!isQueueOpen);
                            }}
                            className={cn(
                                "p-1.5 transition-colors outline-none focus:ring-0",
                                isQueueOpen ? "text-brand" : "text-zinc-500 hover:text-white"
                            )}
                            title="Queue"
                        >
                            <ListMusic size={20} />
                        </button>

                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setAudioFxOpen(true);
                            }}
                            className={cn(
                                "p-1.5 transition-colors outline-none focus:ring-0",
                                isAudioFxOpen ? "text-brand" : "text-zinc-500 hover:text-white"
                            )}
                            title="Studio FX"
                        >
                            <Settings2 size={20} className={cn(isAudioFxOpen && "animate-pulse")} />
                        </button>

                        <div className="flex items-center gap-2 w-28 lg:w-36 group">
                            <button
                                onClick={(e) => { e.stopPropagation(); setVolume(volume === 0 ? 0.8 : 0); }}
                                className="text-white/40 hover:text-brand transition-colors"
                            >
                                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} className={cn(volume > 0 && "text-brand")} />}
                            </button>
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer"
                                value={[volume * 100]}
                                max={100}
                                step={1}
                                onValueChange={([val]) => setVolume(val / 100)}
                            >
                                <Slider.Track className="bg-white/10 relative grow rounded-full h-[3px]">
                                    <Slider.Range className="absolute bg-brand rounded-full h-full" />
                                </Slider.Track>
                                <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-lg outline-none cursor-pointer transition-transform hover:scale-110 active:scale-95" />
                            </Slider.Root>
                        </div>

                        <div className="flex items-center ml-2 border-l border-white/10 pl-5">
                            <Avatar className="h-8 w-8 md:h-9 md:w-9 border-2 border-white/5 shadow-xl hover:border-brand/40 transition-colors cursor-pointer">
                                <AvatarImage src={user?.avatarUrl} />
                                <AvatarFallback className="bg-zinc-800 text-white text-[10px] font-bold">
                                    {user?.name?.substring(0, 1).toUpperCase() || user?.username?.substring(0, 1).toUpperCase() || 'U'}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
