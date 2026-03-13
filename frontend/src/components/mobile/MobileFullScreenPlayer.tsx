"use client";

import React, { useEffect, useState } from "react";
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
    Heart,
    Shuffle,
    Repeat,
    ListMusic,
    Sparkles,
    Music2,
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import { DynamicBackground } from "../player/DynamicBackground";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function MobileFullScreenPlayer() {
    const [showLyrics, setShowLyrics] = useState(false);
    const {
        isFullScreenPlayerOpen,
        setFullScreenPlayerOpen,
        isAudioFxOpen,
        setAudioFxOpen,
        isQueueOpen,
        setIsQueueOpen
    } = useUIStore();
    
    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const togglePlay = usePlayerStore(s => s.togglePlay);
    const playNext = usePlayerStore(s => s.playNext);
    const playPrev = usePlayerStore(s => s.playPrev);
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const isShuffled = usePlayerStore(s => s.isShuffled);
    const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
    const repeatMode = usePlayerStore(s => s.repeatMode);
    const toggleRepeat = usePlayerStore(s => s.toggleRepeat);

    const isReallyMobile = useIsMobile(768);

    useEffect(() => {
        if (!isReallyMobile) return;
        if (isFullScreenPlayerOpen) {
            window.history.pushState({ modal: 'fullscreen-player' }, '', window.location.pathname + window.location.search + '#player');
        } else {
            if (window.location.hash === '#player') {
                window.history.back();
            }
        }
    }, [isFullScreenPlayerOpen, isReallyMobile]);

    // Apple Music Interactive Drag Logic
    const translateY = useMotionValue(0);
    
    // Scale artwork from 0.8 to 1 based on drag position
    const artworkScale = useTransform(translateY, [400, 0], [0.8, 1]);
    
    // Fade content out as we drag down
    const contentOpacity = useTransform(translateY, [0, 300], [1, 0]);
    
    // Blur background based on drag
    const blurAmount = useTransform(translateY, [0, 600], [50, 10]);
    
    // Parallax background effect
    const bgY = useTransform(translateY, [0, 800], [0, 200]);

    const opacityTransform = useTransform(translateY, [0, 600], [1, 0.4]);
    const scaleTransform = useTransform(translateY, [0, 600], [1, 0.95]);
    const handleDragEnd = (_: any, info: { offset: { y: number }, velocity: { y: number } }) => {
        if (!isReallyMobile) return;
        if (info.offset.y > 60 || info.velocity.y > 300) {
            setFullScreenPlayerOpen(false);
        }
        translateY.set(0);
    };

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

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const dragControls = useDragControls();

    if (!currentTrack) return null;

    return (
        <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ 
                type: "spring", 
                stiffness: 220, 
                damping: 28, 
                mass: 0.8 
            }}
            className="fixed inset-0 z-[600] bg-black overflow-hidden flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
            drag="y"
            dragControls={dragControls}
            dragListener={false} // Only start drag from zones using dragControls
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.05}
            onDragEnd={handleDragEnd}
            style={{ y: translateY, opacity: opacityTransform, scale: scaleTransform }}
        >
            <motion.div style={{ y: bgY, filter: useTransform(blurAmount, (v) => `blur(${v}px)`) }} className="absolute inset-0 z-0 pointer-events-none">
                <DynamicBackground coverUrl={currentTrack.coverUrl} />
            </motion.div>

            {/* Header Drag Zone */}
            <motion.div 
                style={{ opacity: contentOpacity }}
                onPointerDown={(e) => dragControls.start(e)}
                className="relative z-10 flex flex-col items-center pt-2 cursor-grab active:cursor-grabbing"
            >
                <div className="w-10 h-1 bg-white/20 rounded-full mb-3" />
                <div className="w-full flex items-center justify-between px-6 py-2">
                    <button onClick={() => setFullScreenPlayerOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-white active:scale-95 transition-all z-20">
                        <X size={20} />
                    </button>
                    <div className="flex flex-col items-center text-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Now Playing</span>
                        <span className="text-[12px] font-bold text-white/80 line-clamp-1 max-w-[180px]">
                            {currentTrack?.album?.title || "Titan Resonance"}
                        </span>
                    </div>
                    <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-white active:scale-95 transition-all">
                        <MoreVertical size={20} />
                    </button>
                </div>
            </motion.div>

            {/* Content Container */}
            <div className="relative z-10 flex-1 flex flex-col px-8 pb-10">
                {/* Artwork (No longer a drag handle to fix 'center' alignment issue) */}
                <div className="flex-1 flex items-center justify-center py-4">
                    <motion.div
                        layoutId={`artwork-${currentTrack.id}`}
                        transition={{ 
                            type: "spring", 
                            stiffness: 220, 
                            damping: 28 
                        }}
                        style={{ scale: artworkScale }}
                        className="w-full aspect-square max-w-[320px] rounded-[2rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/5 cursor-grab active:cursor-grabbing"
                    >
                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center relative">
                            <img 
                                src={getMediaUrl(currentTrack?.coverUrl) || "/logo.png"} 
                                alt="" 
                                className="w-full h-full object-cover pointer-events-none" 
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = "/logo.png";
                                }}
                            />
                            {!currentTrack?.coverUrl && <Music2 size={64} className="absolute text-white/5" />}
                        </div>
                    </motion.div>
                </div>

                {/* Content Fade Wrapper */}
                <motion.div style={{ opacity: contentOpacity }} className="flex flex-col flex-1">
                    {/* Info & Like */}
                    <div className="flex items-center justify-between gap-4 mb-8">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-2xl font-black text-white tracking-tight leading-tight mb-0.5 truncate">{currentTrack.title}</h1>
                            <Link
                                href={`/artist/${currentTrack?.artist?.id || '#'}`}
                                onClick={() => setFullScreenPlayerOpen(false)}
                                className="text-[18px] text-white/50 font-medium truncate hover:text-white transition-colors block w-fit"
                            >
                                {currentTrack?.artist?.name || 'Unknown Titan'}
                            </Link>
                        </div>
                        <button onClick={() => toggleLikeMutation.mutate()} className={cn("p-2 transition-all active:scale-90", isLiked ? "text-brand" : "text-white/20")}>
                            <Heart size={28} className={cn(isLiked && "fill-current")} />
                        </button>
                    </div>

                    {/* Scrubber */}
                    <div className="mb-8">
                        <Slider.Root
                            className="relative flex items-center select-none touch-none w-full h-4 group cursor-pointer mb-2"
                            value={[currentTime]}
                            max={duration || 100}
                            step={0.1}
                            onValueChange={(val) => {
                                const audio = audioEngine.getActiveAudioElement();
                                if (audio) audio.currentTime = val[0];
                                usePlayerStore.getState().setCurrentTime(val[0]);
                            }}
                        >
                            <Slider.Track className="bg-white/10 relative grow rounded-full h-[4px]">
                                <Slider.Range className="absolute bg-brand rounded-full h-full" />
                            </Slider.Track>
                            <Slider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-lg focus:outline-none" />
                        </Slider.Root>
                        <div className="flex justify-between text-[11px] font-bold text-white/30 tabular-nums uppercase tracking-widest">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-between mb-10">
                        <button onClick={toggleShuffle} className={cn("p-2 transition-all active:scale-90", isShuffled ? "text-brand" : "text-white/40")}>
                            <Shuffle size={22} strokeWidth={isShuffled ? 3 : 2} />
                        </button>
                        <button onClick={playPrev} className="p-4 text-white hover:text-brand active:scale-90 transition-all">
                            <SkipBack size={36} fill="currentColor" strokeWidth={0} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                audioEngine.resume();
                                togglePlay();
                            }}
                            className="w-20 h-20 rounded-full bg-brand flex items-center justify-center text-black active:scale-95 transition-all shadow-2xl shadow-brand/20"
                        >
                            {isPlaying ? <Pause size={38} fill="currentColor" /> : <Play size={38} fill="currentColor" className="ml-1" />}
                        </button>
                        <button onClick={() => playNext(true)} className="p-4 text-white hover:text-brand active:scale-90 transition-all">
                            <SkipForward size={36} fill="currentColor" strokeWidth={0} />
                        </button>
                        <button onClick={toggleRepeat} className={cn("p-2 transition-all active:scale-90", repeatMode !== 'off' ? "text-brand" : "text-white/40")}>
                            <Repeat size={24} strokeWidth={repeatMode !== 'off' ? 3 : 2} />
                        </button>
                    </div>

                    {/* Footer Controls */}
                    <div className="flex items-center justify-between pt-6 border-t border-white/5 pb-[env(safe-area-inset-bottom,0px)] px-2">
                        {[
                            { icon: Sparkles, label: "FX", onClick: (e: any) => { e.stopPropagation(); setAudioFxOpen(true); }, active: isAudioFxOpen },
                            { icon: MessageSquare, label: "Lyrics", onClick: (e: any) => { e.stopPropagation(); setShowLyrics(!showLyrics); }, active: showLyrics },
                            { icon: ListMusic, label: "Queue", onClick: (e: any) => { e.stopPropagation(); setIsQueueOpen(!isQueueOpen); }, active: isQueueOpen }
                        ].map((btn, i) => (
                            <button key={i} onClick={btn.onClick} className={cn("flex flex-col items-center gap-1.5 transition-all active:scale-90 px-4 py-2", btn.active ? "text-brand" : "text-white/40")}>
                                <btn.icon size={20} />
                                <span className="text-[9px] font-black uppercase tracking-widest">{btn.label}</span>
                            </button>
                        ))}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}
