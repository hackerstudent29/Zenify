"use client";

import React from "react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    MoreHorizontal,
    MessageSquare,
    ChevronDown,
    X,
    Download,
    Share2,
    Heart,
    Shuffle,
    Repeat,
    Repeat1,
    Quote,
    ListMusic,
    Music,
    Sparkles,
    Settings,
    Plus,
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { AudioFxMenu } from "./audio-fx-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
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

export function FullScreenPlayer() {
    const [showLyrics, setShowLyrics] = React.useState(false);
    const {
        isFullScreenPlayerOpen,
        setFullScreenPlayerOpen,
        openDownloadModal,
        isAudioFxOpen,
        setAudioFxOpen
    } = useUIStore();
    const {
        currentTrack,
        isPlaying,
        togglePlay,
        playNext,
        playPrev,
        currentTime,
        duration,
        volume,
        setVolume,
        isShuffled,
        toggleShuffle,
        repeatMode,
        toggleRepeat,
        queue: fullQueue
    } = usePlayerStore();

    // Loop logic helper
    const handleRepeatCycle = () => {
        toggleRepeat();
    };

    const queryClient = useQueryClient();

    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as any[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
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
        }
    });

    const addToPlaylistMutation = useMutation({
        mutationFn: async (playlistId: string) => {
            if (!currentTrack) return;
            await api.post(`/playlists/${playlistId}/tracks`, { trackId: currentTrack.id });
        },
        onSuccess: (_, playlistId) => {
            queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
            useUIStore.getState().openConfirmModal({
                title: "Sonic Fusion Success",
                message: `"${currentTrack?.title}" has been added to your playlist.`,
                onConfirm: () => { },
                confirmText: "Perfect",
                type: "info"
            });
        },
        onError: (error: any) => {
            const message = error.response?.data?.message || "Something went wrong";
            const isConflict = error.response?.status === 409;

            useUIStore.getState().openConfirmModal({
                title: isConflict ? "Already Harmonized" : "Connection Error",
                message: isConflict ? "This song is already in your playlist." : message,
                onConfirm: () => { },
                confirmText: "Got it",
                type: isConflict ? "info" : "danger"
            });
        }
    });

    if (!currentTrack) return null;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <AnimatePresence>
            {isFullScreenPlayerOpen && (
                <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    className="fixed inset-0 z-[600] bg-black overflow-hidden flex flex-col"
                >
                    {/* Immersive Background */}
                    <div className="absolute inset-0 z-0">
                        <img
                            src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                            alt=""
                            className="w-full h-full object-cover scale-150 blur-[120px] opacity-40"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" />
                    </div>

                    {/* Header */}
                    <div className="relative z-10 flex items-center justify-between p-6">
                        <button
                            onClick={() => setFullScreenPlayerOpen(false)}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/60 active:scale-95 transition-all"
                        >
                            <ChevronDown size={24} />
                        </button>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Playing from</span>
                            <span className="text-[12px] font-bold text-white/80 line-clamp-1 max-w-[150px]">
                                {currentTrack.album?.title || "Latest Arrivals"}
                            </span>
                        </div>
                        <button
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/60 active:scale-95 transition-all"
                        >
                            <MoreHorizontal size={20} />
                        </button>
                    </div>

                    {/* Main Content */}
                    <div className="relative z-10 flex-1 flex flex-col px-8 pb-10 justify-between">
                        {/* Artwork */}
                        <div className="flex-1 flex items-center justify-center py-6">
                            <motion.div
                                layoutId={`artwork-${currentTrack.id}`}
                                className="w-full aspect-square max-w-[320px] rounded-[2.5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/10"
                            >
                                <img
                                    src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                    alt={currentTrack.title}
                                    className="w-full h-full object-cover"
                                />
                            </motion.div>
                        </div>

                        {/* Info & Basic Actions */}
                        <div className="flex items-end justify-between gap-4 mb-4">
                            <div className="flex-1 min-w-0">
                                <motion.h1
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="text-2xl font-black text-white tracking-tight leading-tight mb-1"
                                >
                                    {currentTrack.title}
                                </motion.h1>
                                <motion.p
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-[17px] text-white/50 font-medium truncate"
                                >
                                    {currentTrack.artist.name}
                                </motion.p>
                            </div>
                            <button
                                onClick={() => toggleLikeMutation.mutate()}
                                className={cn("p-2 transition-all active:scale-90", isLiked ? "text-brand" : "text-white/20")}
                            >
                                <Heart size={28} className={cn(isLiked && "fill-current")} />
                            </button>
                        </div>

                        {/* Scrubber */}
                        <div className="mb-6">
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-5 group cursor-pointer mb-2"
                                value={[currentTime]}
                                max={duration || 100}
                                step={0.1}
                                onValueChange={(val) => {
                                    audioEngine.resume();
                                    const audio = document.querySelector('audio');
                                    if (audio) audio.currentTime = val[0];
                                    usePlayerStore.getState().setCurrentTime(val[0]);
                                }}
                            >
                                <Slider.Track className="bg-white/10 relative grow rounded-full h-[4px]">
                                    <Slider.Range className="absolute bg-white/80 rounded-full h-full" />
                                </Slider.Track>
                                <Slider.Thumb className="block w-3 h-3 bg-white rounded-full focus:outline-none" />
                            </Slider.Root>
                            <div className="flex justify-between text-[11px] font-bold text-white/30 tabular-nums">
                                <span>{formatTime(currentTime)}</span>
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>

                        {/* Primary Controls */}
                        <div className="flex items-center justify-between mb-8">
                            <button
                                onClick={toggleShuffle}
                                className={cn("p-2 transition-all active:scale-90", isShuffled ? "text-brand" : "text-white/20")}
                            >
                                <Shuffle size={22} strokeWidth={2.5} />
                            </button>
                            <button
                                onClick={playPrev}
                                className="p-3 text-white active:scale-90 transition-all"
                            >
                                <SkipBack size={36} fill="white" strokeWidth={0} />
                            </button>
                            <button
                                onClick={togglePlay}
                                className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-black active:scale-90 transition-all shadow-2xl"
                            >
                                {isPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="black" className="ml-1.5" />}
                            </button>
                            <button
                                onClick={() => playNext(true)}
                                className="p-3 text-white active:scale-90 transition-all"
                            >
                                <SkipForward size={36} fill="white" strokeWidth={0} />
                            </button>
                            <button
                                onClick={toggleRepeat}
                                className={cn("p-2 transition-all active:scale-90", repeatMode !== 'off' ? "text-brand" : "text-white/20")}
                            >
                                <div className="relative">
                                    <Repeat size={22} strokeWidth={2.5} />
                                    {repeatMode !== 'off' && (
                                        <span className="absolute -top-1 -right-1 flex items-center justify-center bg-brand text-white text-[8px] w-3.5 h-3.5 rounded-full font-black">
                                            {repeatMode === 'one' ? '1' : 'A'}
                                        </span>
                                    )}
                                </div>
                            </button>
                        </div>

                        {/* Extra Controls Footer */}
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                            <button
                                onClick={() => setAudioFxOpen(true)}
                                className={cn("flex flex-col items-center gap-1 transition-all", isAudioFxOpen ? "text-brand" : "text-white/40")}
                            >
                                <Sparkles size={20} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Studio</span>
                            </button>
                            <button
                                onClick={() => { setShowLyrics(!showLyrics); }}
                                className={cn("flex flex-col items-center gap-1 transition-all", showLyrics ? "text-white" : "text-white/40")}
                            >
                                <MessageSquare size={20} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Lyrics</span>
                            </button>
                            <button
                                onClick={() => openDownloadModal(currentTrack)}
                                className="flex flex-col items-center gap-1 text-white/40 active:text-white transition-all"
                            >
                                <Download size={20} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Offline</span>
                            </button>
                            <button
                                className="flex flex-col items-center gap-1 text-white/40 active:text-white transition-all"
                            >
                                <ListMusic size={20} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Queue</span>
                            </button>
                        </div>
                    </div>

                </motion.div>
            )}
        </AnimatePresence>
    );
}
