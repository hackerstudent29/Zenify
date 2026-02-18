"use client";

import { Play, Pause, Heart, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Track, usePlayerStore } from "@/store/player";
import { motion, AnimatePresence } from "framer-motion";

interface MediaCardProps {
    track: Track;
    className?: string;
}

export function MediaCard({ track, className }: MediaCardProps) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const isCurrent = currentTrack?.id === track.id;
    const isActuallyPlaying = isCurrent && isPlaying;

    const handlePlayClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCurrent) {
            togglePlay();
        } else {
            setTrack(track);
        }
    };

    return (
        <div
            className={cn(
                "group relative flex flex-col gap-3 p-2 rounded-xl transition-all duration-300 hover:bg-white/5 cursor-pointer",
                className
            )}
            onClick={() => setTrack(track)}
        >
            {/* Image Container with 1:1 Ratio */}
            <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-hover shadow-xl">
                <img
                    src={track.coverUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${track.id}`}
                    alt={track.title}
                    className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105"
                />

                {/* Smooth Play Overlay */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                    <button
                        onClick={handlePlayClick}
                        className="w-11 h-11 bg-white text-black rounded-full flex items-center justify-center shadow-2xl scale-95 group-hover:scale-100 transition-all hover:bg-accent hover:text-white"
                    >
                        {isActuallyPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="ml-1" fill="currentColor" />}
                    </button>

                    {/* Perspective shadow for premium feel */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Active Indicator Bar */}
                {isCurrent && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-accent shadow-[0_-2px_8px_var(--accent-glow)]" />
                )}
            </div>

            {/* Info Section - High density */}
            <div className="flex flex-col min-w-0 px-1">
                <h3 className={cn(
                    "text-[13px] font-bold truncate leading-snug",
                    isCurrent ? "text-accent" : "text-foreground"
                )}>
                    {track.title}
                </h3>
                <p className="text-[11px] text-muted font-medium truncate mt-0.5 group-hover:text-muted/80 transition-colors">
                    {track.artist.name}
                </p>
                {track.album && (
                    <p className="text-[10px] text-muted-dark truncate mt-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        {track.album.title}
                    </p>
                )}
            </div>

            {/* Micro-Interaction Actions */}
            <button
                onClick={(e) => { e.stopPropagation(); }}
                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 p-2 bg-black/40 backdrop-blur-md rounded-full text-white/70 hover:text-[#EF4444]"
            >
                <Heart size={14} />
            </button>
        </div>
    );
}
