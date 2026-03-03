"use client";

import { usePlayerStore, Track } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, Settings2, X, Heart, Shuffle, Repeat, Repeat1, Sparkles } from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { useState, useCallback, useRef } from "react";
import { AudioFxMenu } from "@/components/player/audio-fx-menu";
import { useUIStore } from "@/store/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { audioEngine } from "@/lib/audio-engine";

function formatTime(t: number) {
    if (!t || isNaN(t)) return "0:00";
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}


export function MobilePlayerBar() {
    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const togglePlay = usePlayerStore(s => s.togglePlay);
    const playNext = usePlayerStore(s => s.playNext);
    const playPrev = usePlayerStore(s => s.playPrev);
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const setCurrentTime = usePlayerStore(s => s.setCurrentTime);
    const isShuffled = usePlayerStore(s => s.isShuffled);
    const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
    const repeatMode = usePlayerStore(s => s.repeatMode);
    const toggleRepeat = usePlayerStore(s => s.toggleRepeat);
    const { isAudioFxOpen, setAudioFxOpen, setFullScreenPlayerOpen } = useUIStore();
    const queryClient = useQueryClient();

    const handleSeek = useCallback((val: number[]) => {
        const newTime = val[0];
        audioEngine.resume();
        const audio = audioEngine.getActiveAudioElement();
        if (audio) {
            audio.currentTime = newTime;
        }
        setCurrentTime(newTime);
    }, [setCurrentTime]);

    // Like logic
    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as Track[]).map(t => t.id);
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
        }
    });

    if (!currentTrack) return null;

    return (
        <>
            <AnimatePresence>
                {currentTrack && (
                    <motion.div
                        initial={{ y: 60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 60, opacity: 0 }}
                        className="w-full px-3 pb-2"
                    >
                        <div className="bg-[#111114]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                            {/* Interactive Seek Bar at top */}
                            <div className="relative h-1.5 w-full bg-white/5 overflow-visible group/slider transition-all hover:h-2" onClick={(e) => e.stopPropagation()}>
                                <Slider.Root
                                    className="relative flex items-center select-none touch-none w-full h-full cursor-pointer z-10"
                                    value={[currentTime]}
                                    max={duration || 100}
                                    step={0.1}
                                    onValueChange={handleSeek}
                                >
                                    <Slider.Track className="bg-transparent relative grow h-full">
                                        <Slider.Range className="absolute bg-brand h-full shadow-[0_0_12px_rgba(var(--accent-brand-rgb),0.6)]" />
                                    </Slider.Track>
                                    <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-xl shadow-black/50 opacity-0 group-hover/slider:opacity-100 transition-opacity focus:outline-none" />
                                </Slider.Root>
                            </div>

                            <div className="flex items-center gap-3 p-3">
                                {/* Artwork */}
                                <motion.div
                                    layoutId={`artwork-${currentTrack.id}`}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                    onClick={() => setFullScreenPlayerOpen(true)}
                                    className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-lg active:scale-95 transition-transform cursor-pointer"
                                >
                                    <img
                                        src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                        className="w-full h-full object-cover"
                                        alt=""
                                    />
                                </motion.div>

                                {/* Track Info */}
                                <div className="flex-1 min-w-0" onClick={() => setFullScreenPlayerOpen(true)}>
                                    <p className="text-[14px] font-bold text-white truncate leading-tight">{currentTrack.title}</p>
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <p className="text-[11px] text-white/40 font-medium truncate mt-0.5">{currentTrack.artist?.name}</p>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleLikeMutation.mutate(); }}
                                            className={cn("transition-all active:scale-90 shrink-0", isLiked ? "text-brand" : "text-white/20")}
                                        >
                                            <Heart size={14} className={cn(isLiked && "fill-current")} />
                                        </button>
                                    </div>
                                </div>

                                {/* Controls cluster */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={toggleShuffle}
                                        className={cn("p-1.5 transition-all active:scale-90", isShuffled ? "text-brand" : "text-white/20")}
                                    >
                                        <Shuffle size={14} strokeWidth={2.5} />
                                    </button>
                                    <button
                                        onClick={playPrev}
                                        className="p-1.5 text-white/40 active:text-white active:scale-90 transition-all"
                                    >
                                        <SkipBack size={18} fill="currentColor" strokeWidth={0} />
                                    </button>
                                    <button
                                        onClick={togglePlay}
                                        className="w-10 h-10 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand active:scale-90 transition-all shrink-0 mx-1 shadow-sm"
                                    >
                                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                                    </button>
                                    <button
                                        onClick={() => playNext(true)}
                                        className="p-1.5 text-white/40 active:text-white active:scale-90 transition-all"
                                    >
                                        <SkipForward size={18} fill="currentColor" strokeWidth={0} />
                                    </button>
                                    <button
                                        onClick={toggleRepeat}
                                        className={cn("relative p-1.5 transition-all active:scale-90 flex items-center justify-center", repeatMode !== 'off' ? "text-brand" : "text-white/20")}
                                    >
                                        {repeatMode === 'one' ? (
                                            <Repeat1 size={16} strokeWidth={2.5} />
                                        ) : (
                                            <Repeat size={16} strokeWidth={2.5} />
                                        )}
                                        {repeatMode !== 'off' && (
                                            <motion.div
                                                layoutId="repeat-dot-mini"
                                                className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.6)]"
                                            />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setAudioFxOpen(true)}
                                        className={cn("p-1.5 transition-all active:scale-90", isAudioFxOpen ? "text-brand" : "text-white/20")}
                                    >
                                        <Sparkles size={16} strokeWidth={2.5} className={cn(isAudioFxOpen && "animate-pulse")} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Studio FX Bottom Sheet ──────────────────── */}
            <AnimatePresence>
                {isAudioFxOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]"
                            onClick={() => setAudioFxOpen(false)}
                        />

                        {/* Sheet */}
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", stiffness: 300, damping: 32 }}
                            className="fixed bottom-0 left-0 right-0 z-[310] rounded-t-3xl overflow-hidden"
                        >
                            {/* Handle */}
                            <div className="bg-[#111114] flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1 rounded-full bg-white/20" />
                            </div>

                            {/* Header */}
                            <div className="bg-[#111114] flex items-center justify-between px-5 pb-3 border-b border-white/5">
                                <span className="text-[11px] font-black uppercase tracking-widest text-brand">Studio Engine</span>
                                <button onClick={() => setAudioFxOpen(false)} className="text-white/30 active:text-white">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* FX Content — scrollable */}
                            <div className="bg-[#111114] max-h-[70vh] overflow-y-auto overscroll-contain pb-safe">
                                <AudioFxMenu />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
