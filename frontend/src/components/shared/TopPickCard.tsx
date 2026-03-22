"use client";

import { motion } from "framer-motion";
import { Play, Pause, Download, Plus, Heart } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { getMediaUrl, cn } from "@/lib/utils";

interface TopPickCardProps {
    track: any;
    index: number;
    allTracks?: any[];
}

export function TopPickCard({ track, index, allTracks }: TopPickCardProps) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const { openDownloadModal } = useUIStore();
    const isThisTrackPlaying = currentTrack?.id === track.id && isPlaying;
    const isActive = currentTrack?.id === track.id;

    const handlePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isActive) {
            togglePlay();
        } else {
            setTrack(track, allTracks || []);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="group relative flex-shrink-0 w-[240px] md:w-[280px] bg-[#1c1c1e] rounded-2xl md:rounded-[2rem] overflow-hidden border border-white/5 active:scale-95 transition-all duration-300"
        >
            {/* Image Area */}
            <div className="relative aspect-square overflow-hidden group-hover:brightness-90 transition-all duration-500">
                <img
                    src={getMediaUrl(track.coverUrl)}
                    alt={track.title}
                    className="w-full h-full object-cover transition-transform duration-700"
                />

                {/* Play Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <button
                        onClick={handlePlay}
                        className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-300"
                    >
                        {isThisTrackPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>
                </div>

                {/* Visualizer (if playing) */}
                {isThisTrackPlaying && (
                    <div className="absolute bottom-4 left-4 flex items-end gap-[3px] h-6 bg-black/40 backdrop-blur-md px-3 py-2 rounded-full border border-white/10">
                        {[0.1, 0.4, 0.2].map((delay, i) => (
                            <motion.div
                                key={i}
                                animate={{ height: ["30%", "100%", "30%"] }}
                                transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay }}
                                className="w-[3px] bg-red-500 rounded-full"
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Info Area */}
            <div className="p-4 md:p-5 flex flex-col gap-1">
                <div className="flex items-start justify-between">
                    <div className="min-w-0 pr-2">
                        <h3 className={cn(
                            "text-[15px] md:text-[17px] font-black tracking-tight truncate leading-tight",
                            isActive ? "text-red-500" : "text-white"
                        )}>
                            {track.title}
                        </h3>
                        <p className="text-[11px] md:text-[13px] font-bold text-white/40 truncate">
                            {track.artist?.name || "Zenify Resident"}
                        </p>
                    </div>
                    <span className="text-[9px] md:text-[10px] font-black bg-white/5 border border-white/10 text-white/40 px-2 py-0.5 rounded-md uppercase tracking-[0.1em] shrink-0">
                        {new Date(track.createdAt || Date.now()).getFullYear()}
                    </span>
                </div>

                <div className="flex items-center justify-between mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center gap-1">
                        <button className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-red-500 transition-colors">
                            <Heart size={16} />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); openDownloadModal(track); }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-white transition-colors"
                        >
                            <Download size={16} />
                        </button>
                    </div>
                    <button className="w-8 h-8 rounded-full flex items-center justify-center text-white/20 hover:text-white transition-colors">
                        <Plus size={16} />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
