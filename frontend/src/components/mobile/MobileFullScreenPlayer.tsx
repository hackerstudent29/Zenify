"use client";

import React, { useEffect } from "react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    MoreVertical,
    MessageSquare,
    X,
    Download,
    Heart,
    Shuffle,
    Repeat,
    Repeat1,
    ListMusic,
    Sparkles,
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function MobileFullScreenPlayer() {
    const [showLyrics, setShowLyrics] = React.useState(false);
    const {
        isFullScreenPlayerOpen,
        setFullScreenPlayerOpen,
        openDownloadModal,
        isAudioFxOpen,
        setAudioFxOpen,
        isQueueOpen,
        setIsQueueOpen
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

    const isMobile = useIsMobile();

    useEffect(() => {
        if (!isMobile) return;
        if (isFullScreenPlayerOpen) {
            window.history.pushState({ modal: 'fullscreen-player' }, '', window.location.pathname + window.location.search + '#player');
        } else {
            if (window.location.hash === '#player') {
                window.history.back();
            }
        }

        const handlePopState = () => {
            if (isFullScreenPlayerOpen && window.location.hash !== '#player') {
                setFullScreenPlayerOpen(false);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isFullScreenPlayerOpen, setFullScreenPlayerOpen, isMobile]);

    // Swipe to Close Logic (Vertical)
    const translateY = useMotionValue(0);
    const opacity = useTransform(translateY, [0, 500], [1, 0]);
    const scale = useTransform(translateY, [0, 500], [1, 0.9]);
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragEnd = (event: any, info: any) => {
        if (info.offset.y > 150 || info.velocity.y > 500) {
            setFullScreenPlayerOpen(false);
        }
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
            await api.post(`/ tracks / ${currentTrack.id}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    if (!currentTrack) return null;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.5 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            style={{ y: translateY, opacity, scale }}
            className="fixed inset-0 z-[600] bg-black overflow-hidden flex flex-col touch-none"
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
            <div className="relative z-10 flex flex-col items-center pt-2">
                <div className="w-12 h-1 bg-white/20 rounded-full mb-4" />
                <div className="w-full flex items-center justify-between px-6">
                    <button
                        onClick={() => setFullScreenPlayerOpen(false)}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/60 active:scale-95 transition-all"
                    >
                        <X size={20} />
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Playing from</span>
                        <span className="text-[12px] font-bold text-white/80 line-clamp-1 max-w-[150px]">
                            {currentTrack.album?.title || "Latest Arrivals"}
                        </span>
                    </div>
                    <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/60 active:scale-95 transition-all">
                        <MoreVertical size={20} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 flex-1 flex flex-col px-8 pb-10 justify-between">
                {/* Artwork */}
                <div className="flex-1 flex items-center justify-center py-6">
                    <motion.div
                        className="w-full aspect-square max-w-[320px] rounded-[2.5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/10"
                    >
                        <img src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"} alt={currentTrack.title} className="w-full h-full object-cover" />
                    </motion.div>
                </div>

                {/* Info & Basic Actions */}
                <div className="flex items-end justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-black text-white tracking-tight leading-tight mb-1 truncate">{currentTrack.title}</h1>
                        {currentTrack.artist?.id ? (
                            <Link
                                href={`/artist/${currentTrack.artist.id}`}
                                onClick={() => setFullScreenPlayerOpen(false)}
                                className="text-[17px] text-white/50 font-medium truncate hover:text-white transition-colors block w-fit"
                            >
                                {currentTrack.artist?.name || 'Unknown Artist'}
                            </Link>
                        ) : (
                            <p className="text-[17px] text-white/50 font-medium truncate">{currentTrack.artist?.name || 'Unknown Artist'}</p>
                        )}
                    </div>
                    <button onClick={() => toggleLikeMutation.mutate()} className={cn("p-2 transition-all active:scale-90", isLiked ? "text-brand" : "text-white/20")}>
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
                            <Slider.Range className="absolute bg-brand/80 rounded-full h-full" />
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
                        onClick={(e) => { e.stopPropagation(); toggleShuffle(); }}
                        className={cn("p-2 transition-all active:scale-90", isShuffled ? "text-brand" : "text-white/60")}
                        title={`Shuffle: ${isShuffled ? 'On' : 'Off'}`}
                    >
                        <Shuffle size={22} strokeWidth={isShuffled ? 3 : 2} />
                    </button>
                    <button onClick={playPrev} className="p-3 text-brand active:scale-90 transition-all">
                        <SkipBack size={30} fill="currentColor" strokeWidth={0} />
                    </button>
                    <button
                        onClick={togglePlay}
                        className="w-16 h-16 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand active:scale-90 transition-all shadow-lg"
                    >
                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>
                    <button onClick={() => playNext(true)} className="p-3 text-brand active:scale-90 transition-all">
                        <SkipForward size={30} fill="currentColor" strokeWidth={0} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleRepeat(); }}
                        className={cn("relative p-2 transition-all active:scale-90 flex items-center justify-center", repeatMode !== 'off' ? "text-brand" : "text-white/60")}
                        title={`Repeat: ${repeatMode}`}
                    >
                        <Repeat size={24} strokeWidth={repeatMode !== 'off' ? 3 : 2} />
                        {repeatMode !== 'off' && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-[7px] font-black mt-0.5 text-white">
                                    {repeatMode === "one" ? "1" : repeatMode === "two" ? "2" : "∞"}
                                </span>
                            </div>
                        )}
                        {repeatMode !== 'off' && (
                            <motion.div
                                layoutId="repeat-dot-mobile"
                                className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.6)]"
                            />
                        )}
                    </button>
                </div>

                {/* Extra Controls Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <button onClick={() => setAudioFxOpen(true)} className={cn("flex flex-col items-center gap-1 transition-all", isAudioFxOpen ? "text-brand" : "text-white/40")}>
                        <Sparkles size={20} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Studio</span>
                    </button>
                    <button onClick={() => setShowLyrics(!showLyrics)} className={cn("flex flex-col items-center gap-1 transition-all", showLyrics ? "text-white" : "text-white/40")}>
                        <MessageSquare size={20} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Lyrics</span>
                    </button>
                    <button onClick={() => openDownloadModal(currentTrack)} className="flex flex-col items-center gap-1 text-white/40 active:text-white transition-all">
                        <Download size={20} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Offline</span>
                    </button>
                    <button onClick={() => setIsQueueOpen(!isQueueOpen)} className={cn("flex flex-col items-center gap-1 transition-all", isQueueOpen ? "text-brand" : "text-white/40")}>
                        <ListMusic size={20} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Queue</span>
                    </button>
                </div>
            </div>
        </motion.div >
    );
}
