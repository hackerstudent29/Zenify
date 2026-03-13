"use client";

import React, { useState } from "react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Heart,
    MoreVertical,
    MessageSquare,
    ListMusic,
    Sparkles,
    ChevronDown,
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function MobileFullScreenPlayer() {
    const {
        isFullScreenPlayerOpen,
        setFullScreenPlayerOpen,
        setAudioFxOpen,
        isQueueOpen,
        setIsQueueOpen,
    } = useUIStore();

    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const togglePlay = usePlayerStore(s => s.togglePlay);
    const playNext = usePlayerStore(s => s.playNext);
    const playPrev = usePlayerStore(s => s.playPrev);
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);

    const queryClient = useQueryClient();
    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            if (!Array.isArray(res.data)) return [];
            return (res.data as any[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
        enabled: !!currentTrack
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

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const remaining = duration - currentTime;

    if (!currentTrack) return null;

    return (
        <AnimatePresence>
            {isFullScreenPlayerOpen && (
                <motion.div
                    key="mobile-fullscreen"
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
                    className="fixed inset-0 z-[900] flex flex-col overflow-hidden"
                    style={{ background: "linear-gradient(180deg, #2a2020 0%, #1a1414 40%, #111 100%)" }}
                >
                    {/* Dynamic blurred album art background */}
                    <div className="absolute inset-0 z-0 opacity-30 pointer-events-none">
                        <img
                            src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                            alt=""
                            className="w-full h-full object-cover"
                            style={{ filter: "blur(40px) saturate(180%)", transform: "scale(1.2)" }}
                        />
                    </div>
                    <div className="absolute inset-0 z-0 bg-black/50 pointer-events-none" />

                    {/* Content */}
                    <div className="relative z-10 flex flex-col flex-1 pt-[env(safe-area-inset-top,40px)]">

                        {/* Top: Drag handle + close */}
                        <div className="flex items-center justify-between px-5 pt-2 pb-2">
                            <button
                                onClick={() => setFullScreenPlayerOpen(false)}
                                className="w-10 h-10 flex items-center justify-center text-white/60 active:text-white transition-colors"
                            >
                                <ChevronDown size={28} />
                            </button>
                            <div className="flex-1 text-center">
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Now Playing</p>
                            </div>
                            <button className="w-10 h-10 flex items-center justify-center text-white/60 active:text-white transition-colors">
                                <MoreVertical size={22} />
                            </button>
                        </div>

                        {/* Album Art */}
                        <div className="flex items-center justify-center px-8 py-4 flex-1">
                            <div className="w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
                                <img
                                    src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                    alt={currentTrack.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).src = "/logo.png"; }}
                                />
                            </div>
                        </div>

                        {/* Track Info + Like + More */}
                        <div className="px-8 mb-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-[18px] font-bold text-white truncate leading-tight">{currentTrack.title}</h2>
                                    <p className="text-[14px] text-white/50 truncate mt-0.5">
                                        {currentTrack.artist?.name || "Unknown Artist"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => toggleLikeMutation.mutate()}
                                        className={cn("w-10 h-10 flex items-center justify-center transition-all active:scale-90", isLiked ? "text-brand" : "text-white/50")}
                                    >
                                        <Heart size={22} className={cn(isLiked && "fill-current")} />
                                    </button>
                                    <button className="w-10 h-10 flex items-center justify-center text-white/50 active:text-white transition-all">
                                        <MoreVertical size={22} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="px-8 mb-4">
                            <Slider.Root
                                className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer group"
                                value={[currentTime]}
                                max={duration || 100}
                                step={0.5}
                                onValueChange={(val) => {
                                    const audio = audioEngine.getActiveAudioElement();
                                    if (audio) audio.currentTime = val[0];
                                    usePlayerStore.getState().setCurrentTime(val[0]);
                                }}
                            >
                                <Slider.Track className="relative grow rounded-full h-[3px] bg-white/20">
                                    <Slider.Range className="absolute bg-white rounded-full h-full" />
                                </Slider.Track>
                                <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-md focus:outline-none opacity-0 group-active:opacity-100 group-hover:opacity-100 transition-opacity" />
                            </Slider.Root>
                            <div className="flex justify-between mt-1.5 text-[11px] font-medium text-white/30 tabular-nums">
                                <span>{formatTime(currentTime)}</span>
                                <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                            </div>
                        </div>

                        {/* Playback Controls */}
                        <div className="flex items-center justify-between px-10 mb-6">
                            <button
                                onClick={() => playPrev()}
                                className="p-3 text-white active:scale-90 transition-all active:text-white/60"
                            >
                                <SkipBack size={32} fill="currentColor" strokeWidth={0} />
                            </button>

                            <button
                                onClick={() => { audioEngine.resume(); togglePlay(); }}
                                className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-black active:scale-95 transition-all shadow-2xl"
                            >
                                {isPlaying
                                    ? <Pause size={28} fill="currentColor" />
                                    : <Play size={28} fill="currentColor" className="ml-1" />
                                }
                            </button>

                            <button
                                onClick={() => playNext(true)}
                                className="p-3 text-white active:scale-90 transition-all active:text-white/60"
                            >
                                <SkipForward size={32} fill="currentColor" strokeWidth={0} />
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-around px-8 pt-4 pb-[calc(env(safe-area-inset-bottom,16px)+16px)] border-t border-white/10">
                            <button
                                onClick={() => { setAudioFxOpen(true); }}
                                className="flex flex-col items-center gap-1.5 text-white/40 active:text-brand transition-colors"
                            >
                                <Sparkles size={22} />
                                <span className="text-[9px] font-black uppercase tracking-widest">FX</span>
                            </button>
                            <button className="flex flex-col items-center gap-1.5 text-white/40 active:text-white transition-colors">
                                <MessageSquare size={22} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Lyrics</span>
                            </button>
                            <button
                                onClick={() => setIsQueueOpen(!isQueueOpen)}
                                className={cn("flex flex-col items-center gap-1.5 transition-colors", isQueueOpen ? "text-brand" : "text-white/40")}
                            >
                                <ListMusic size={22} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Queue</span>
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
