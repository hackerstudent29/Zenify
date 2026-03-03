"use client";

import { usePlayerStore, Track } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, Settings2, X, Heart } from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { useState, useCallback, useRef } from "react";
import { AudioFxMenu } from "@/components/player/audio-fx-menu";
import { useUIStore } from "@/store/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

function formatTime(t: number) {
    if (!t || isNaN(t)) return "0:00";
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Find and seek the active <audio> element in the DOM (rendered by desktop PlayerBar, always in DOM) */
function seekAudio(newTime: number) {
    const audios = Array.from(document.querySelectorAll("audio")) as HTMLAudioElement[];
    // Find the one that's playing or has audio data
    const active = audios.find(a => !a.paused) ?? audios.find(a => a.readyState >= 2) ?? audios[0];
    if (active) active.currentTime = newTime;
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
    const { isAudioFxOpen, setAudioFxOpen, setFullScreenPlayerOpen } = useUIStore();
    const queryClient = useQueryClient();

    const handleSeek = useCallback((val: number[]) => {
        const newTime = val[0];
        seekAudio(newTime);
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
                            {/* Linear Progress at top */}
                            <div className="h-1 bg-white/5 w-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]"
                                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                                    transition={{ type: "spring", bounce: 0, duration: 0.1 }}
                                />
                            </div>

                            <div className="flex items-center gap-3 p-3">
                                {/* Artwork */}
                                <div
                                    onClick={() => setFullScreenPlayerOpen(true)}
                                    className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-lg active:scale-95 transition-transform cursor-pointer"
                                >
                                    <img
                                        src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                        className="w-full h-full object-cover"
                                        alt=""
                                    />
                                </div>

                                {/* Track Info */}
                                <div className="flex-1 min-w-0" onClick={() => setFullScreenPlayerOpen(true)}>
                                    <p className="text-[14px] font-bold text-white truncate leading-tight">{currentTrack.title}</p>
                                    <p className="text-[11px] text-white/40 font-medium truncate mt-0.5">{currentTrack.artist?.name}</p>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleLikeMutation.mutate()}
                                        className={cn("p-2 transition-all active:scale-90", isLiked ? "text-brand" : "text-white/20")}
                                    >
                                        <Heart size={20} className={cn(isLiked && "fill-current")} />
                                    </button>
                                    <button
                                        onClick={togglePlay}
                                        className="w-10 h-10 rounded-full bg-brand flex items-center justify-center shadow-lg active:scale-90 transition-all"
                                    >
                                        {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-0.5" />}
                                    </button>
                                    <button
                                        onClick={() => playNext(true)}
                                        className="p-2 text-white/40 active:text-white active:scale-90 transition-all"
                                    >
                                        <SkipForward size={20} fill="currentColor" strokeWidth={0} />
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
