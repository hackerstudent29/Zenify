"use client";

import React, { useEffect, useRef } from "react";
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
        if (!s || isNaN(s)) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const remaining = (duration || 0) - (currentTime || 0);

    if (!currentTrack) return null;

    // CSS-driven slide — no Framer Motion on the container so nothing fights the background
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                backgroundColor: '#111111',
                display: 'flex',
                flexDirection: 'column',
                transform: isFullScreenPlayerOpen ? 'translateY(0)' : 'translateY(100%)',
                transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
                willChange: 'transform',
                overflow: 'hidden',
            }}
        >
            {/* Blurred album art background */}
            {currentTrack.coverUrl && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                    <img
                        src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                        alt=""
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            filter: 'blur(50px) saturate(180%)',
                            transform: 'scale(1.3)',
                            opacity: 0.25,
                        }}
                    />
                </div>
            )}
            {/* Dark overlay */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%)', pointerEvents: 'none' }} />

            {/* All content is z-index 2 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flex: 1, paddingTop: 'max(env(safe-area-inset-top), 40px)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-2 pb-2">
                    <button
                        onClick={() => setFullScreenPlayerOpen(false)}
                        className="w-10 h-10 flex items-center justify-center text-white/60 active:text-white"
                    >
                        <ChevronDown size={28} />
                    </button>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40">Now Playing</p>
                    <button className="w-10 h-10 flex items-center justify-center text-white/60 active:text-white">
                        <MoreVertical size={22} />
                    </button>
                </div>

                {/* Album Art */}
                <div className="flex items-center justify-center px-8 py-4 flex-1">
                    <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)]" style={{ maxWidth: 320 }}>
                        <img
                            src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                            alt={currentTrack.title}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = "/logo.png"; }}
                        />
                    </div>
                </div>

                {/* Track Info */}
                <div className="px-8 mb-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-[18px] font-bold text-white truncate leading-tight">{currentTrack.title}</h2>
                            <p className="text-[14px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                {currentTrack.artist?.name || "Unknown Artist"}
                            </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => toggleLikeMutation.mutate()}
                                className={cn("w-10 h-10 flex items-center justify-center active:scale-90 transition-all", isLiked ? "text-brand" : "text-white/50")}
                            >
                                <Heart size={22} className={cn(isLiked && "fill-current")} />
                            </button>
                            <button className="w-10 h-10 flex items-center justify-center text-white/50 active:text-white">
                                <MoreVertical size={22} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="px-8 mb-4">
                    <Slider.Root
                        className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer group"
                        value={[currentTime || 0]}
                        max={duration || 100}
                        step={0.5}
                        onValueChange={(val) => {
                            const audio = audioEngine.getActiveAudioElement();
                            if (audio) audio.currentTime = val[0];
                            usePlayerStore.getState().setCurrentTime(val[0]);
                        }}
                    >
                        <Slider.Track className="relative grow rounded-full h-[3px]" style={{ background: 'rgba(255,255,255,0.2)' }}>
                            <Slider.Range className="absolute rounded-full h-full" style={{ background: 'white' }} />
                        </Slider.Track>
                        <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-md focus:outline-none" />
                    </Slider.Root>
                    <div className="flex justify-between mt-1.5 tabular-nums" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                        <span>{formatTime(currentTime)}</span>
                        <span>-{formatTime(remaining > 0 ? remaining : 0)}</span>
                    </div>
                </div>

                {/* Playback Controls */}
                <div className="flex items-center justify-between px-10 mb-6">
                    <button
                        onClick={() => playPrev()}
                        className="p-3 text-white active:opacity-50 transition-opacity"
                    >
                        <SkipBack size={32} fill="currentColor" strokeWidth={0} />
                    </button>

                    <button
                        onClick={() => { audioEngine.resume(); togglePlay(); }}
                        className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-black active:scale-95 transition-transform shadow-2xl"
                    >
                        {isPlaying
                            ? <Pause size={28} fill="currentColor" />
                            : <Play size={28} fill="currentColor" className="ml-1" />
                        }
                    </button>

                    <button
                        onClick={() => playNext(true)}
                        className="p-3 text-white active:opacity-50 transition-opacity"
                    >
                        <SkipForward size={32} fill="currentColor" strokeWidth={0} />
                    </button>
                </div>

                {/* Footer */}
                <div
                    className="flex items-center justify-around px-8 border-t"
                    style={{
                        borderColor: 'rgba(255,255,255,0.1)',
                        paddingTop: 16,
                        paddingBottom: `calc(max(env(safe-area-inset-bottom), 16px) + 16px)`,
                    }}
                >
                    <button
                        onClick={() => setAudioFxOpen(true)}
                        className="flex flex-col items-center gap-1.5 active:text-brand transition-colors"
                        style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                        <Sparkles size={22} />
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>FX</span>
                    </button>
                    <button
                        className="flex flex-col items-center gap-1.5 transition-colors"
                        style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                        <MessageSquare size={22} />
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Lyrics</span>
                    </button>
                    <button
                        onClick={() => setIsQueueOpen(!isQueueOpen)}
                        className={cn("flex flex-col items-center gap-1.5 transition-colors", isQueueOpen ? "text-brand" : "")}
                        style={!isQueueOpen ? { color: 'rgba(255,255,255,0.4)' } : {}}
                    >
                        <ListMusic size={22} />
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Queue</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
