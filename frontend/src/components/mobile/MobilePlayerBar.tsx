"use client";

import { usePlayerStore, Track } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, X, Heart, Shuffle, Repeat, Repeat1, Sparkles } from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { useCallback } from "react";
import { useUIStore } from "@/store/ui";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { audioEngine } from "@/lib/audio-engine";
import { useMotionValue, useTransform, useDragControls } from "framer-motion";
import { useIsMobile } from "@/hooks/useIsMobile";

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
    const { setFullScreenPlayerOpen } = useUIStore();

    const isReallyMobile = useIsMobile(768);
    const dragY = useMotionValue(0);
    
    // Apple Music Style: Content fades out as we drag up
    const contentOpacity = useTransform(dragY, [-120, 0], [0, 1]);
    const artworkScale = useTransform(dragY, [-120, 0], [1.5, 1]);
    const artworkY = useTransform(dragY, [-120, 0], [-20, 0]);

    const handleDragEnd = (_: any, info: { offset: { y: number }, velocity: { y: number } }) => {
        if (info.offset.y < -120 || info.velocity.y < -500) {
            setFullScreenPlayerOpen(true);
        }
        dragY.set(0);
    };

    const handleSeek = useCallback((val: number[]) => {
        const newTime = val[0];
        audioEngine.resume();
        const audio = audioEngine.getActiveAudioElement();
        if (audio) {
            audio.currentTime = newTime;
        }
        setCurrentTime(newTime);
    }, [setCurrentTime]);

    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as Track[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
        enabled: !!currentTrack
    });

    const isLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;

    const toggleLikeMutation = useMutation({
        mutationFn: async () => {
            if (!currentTrack) return;
            await api.post(`/tracks/${currentTrack.id}/like`);
        }
    });

    const dragControls = useDragControls();

    if (!currentTrack) return null;

    return (
        <>
            <AnimatePresence>
                {currentTrack && (
                    <motion.div
                        initial={{ y: 0, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="w-full bg-[#1c1c1e]/95 backdrop-blur-xl border-t border-white/5 pointer-events-auto overflow-hidden safe-area-bottom"
                        drag="y"
                        dragControls={dragControls}
                        dragListener={false}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={0.2}
                        onDragEnd={handleDragEnd}
                        style={{ y: dragY }}
                    >
                        {/* Progressive Progress Bar */}
                        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/5 z-20">
                            <motion.div 
                                className="h-full bg-white/40"
                                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            />
                        </div>

                        <div 
                            className="flex items-center gap-3 px-4 h-[56px] relative cursor-pointer"
                            onPointerDown={(e) => {
                                const target = e.target as HTMLElement;
                                if (!target.closest('button')) {
                                    dragControls.start(e);
                                }
                            }}
                            onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (!target.closest('button')) {
                                    setFullScreenPlayerOpen(true);
                                }
                            }}
                        >
                            {/* Artwork */}
                            <motion.div
                                layoutId={`artwork-${currentTrack.id}`}
                                transition={{ 
                                    type: "spring",
                                    stiffness: 220,
                                    damping: 28,
                                    duration: 0.38
                                }}
                                style={{ 
                                    scale: artworkScale,
                                    y: artworkY
                                }}
                                className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 shadow-lg z-30 pointer-events-none"
                            >
                                <img
                                    src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                    className="w-full h-full object-cover"
                                    alt=""
                                />
                            </motion.div>
 
                            {/* Track Info */}
                            <motion.div 
                                style={{ opacity: contentOpacity }}
                                className="flex-1 min-w-0 pointer-events-none"
                            >
                                <p className="text-[14px] font-medium text-white/90 truncate leading-tight">{currentTrack.title}</p>
                            </motion.div>

                            {/* Quick Controls */}
                            <motion.div 
                                style={{ opacity: contentOpacity }}
                                className="flex items-center gap-1" 
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        audioEngine.resume();
                                        togglePlay();
                                    }}
                                    className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-all"
                                >
                                    {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                                </button>
                                <button
                                    onClick={() => playNext(true)}
                                    className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-all shrink-0"
                                >
                                    <SkipForward size={22} fill="currentColor" />
                                </button>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </>
    );
}
