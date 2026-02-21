"use client";

import { Play, Pause, Heart, MoreHorizontal, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Track, usePlayerStore } from "@/store/player";
import { motion, AnimatePresence, useInView } from "framer-motion";
import api from "@/lib/api";
import { useRef } from "react";

interface MediaCardProps {
    track: Track;
    className?: string;
    index?: number;
}

export function MediaCard({ track, className, index = 0 }: MediaCardProps) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const isCurrent = currentTrack?.id === track.id;
    const isActuallyPlaying = isCurrent && isPlaying;

    const ref = useRef(null);
    const inView = useInView(ref, { amount: 0.1, once: true });

    const handlePlayClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCurrent) {
            togglePlay();
        } else {
            setTrack(track);
        }
    };

    const handlePurchase = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await api.post("/billing/checkout", {
                type: 'TRACK_PURCHASE',
                trackId: track.id,
                amount: track.price || 99 // default to 0.99 if not set
            });
            if (res.data.paymentUrl) {
                window.location.href = res.data.paymentUrl;
            }
        } catch (error) {
            console.error("Purchase failed", error);
            alert("Failed to initiate purchase.");
        }
    };

    return (
        <motion.div
            ref={ref}
            initial={{ scale: 0.7, opacity: 0, y: 30 }}
            animate={inView ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.7, opacity: 0, y: 30 }}
            transition={{
                type: "spring",
                stiffness: 200,
                damping: 24,
                delay: Math.min(index * 0.05, 0.3)
            }}
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

                {/* Centered Music Visualizer Overlay */}
                <AnimatePresence>
                    {isActuallyPlaying && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none z-10"
                        >
                            <div className="flex items-center gap-1 h-8">
                                {[0.2, 0.4, 0.3, 0.5, 0.4].map((delay, i) => (
                                    <motion.div
                                        key={i}
                                        animate={{
                                            height: ["40%", "100%", "40%"],
                                        }}
                                        transition={{
                                            duration: 0.8,
                                            repeat: Infinity,
                                            ease: "easeInOut",
                                            delay: delay
                                        }}
                                        className="w-1.5 bg-accent rounded-full shadow-glow"
                                    />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Interaction Overlay (Purchases & Shadows) */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-2">
                    {track.price !== undefined && track.price > 0 && !track.isPurchased && (
                        <button
                            onClick={handlePurchase}
                            className="w-11 h-11 bg-accent text-white rounded-full flex items-center justify-center shadow-2xl scale-95 group-hover:scale-100 transition-all hover:bg-white hover:text-accent z-20"
                            title={`Purchase for $${(track.price / 100).toFixed(2)}`}
                        >
                            <ShoppingCart size={18} />
                        </button>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                </div>
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
            </div>

            {/* Micro-Interaction Actions */}
            <button
                onClick={(e) => { e.stopPropagation(); }}
                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 p-2 bg-black/40 backdrop-blur-md rounded-full text-white/70 hover:text-[#EF4444]"
            >
                <Heart size={14} />
            </button>
        </motion.div>
    );
}
