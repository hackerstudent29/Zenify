"use client";

import { Play, Pause, Heart, MoreHorizontal, ShoppingCart, Loader2, Plus, Download } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";
import { Track, usePlayerStore } from "@/store/player";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useRef } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuPortal,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface MediaCardProps {
    track: Track;
    className?: string;
    index?: number;
}

export function MediaCard({ track, className, index = 0 }: MediaCardProps) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const queryClient = useQueryClient();
    const isCurrent = currentTrack?.id === track.id;
    const isActuallyPlaying = isCurrent && isPlaying;

    const ref = useRef(null);
    const inView = useInView(ref, { amount: 0.1, once: true });

    // Liked status sync
    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as Track[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
    });

    const isLiked = likedTrackIds?.includes(track.id);

    const toggleLikeMutation = useMutation({
        mutationFn: async () => {
            await api.post(`/tracks/${track.id}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const { data: playlists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('/playlists/my');
                return res.data as { id: string, name: string }[];
            } catch (e) { return []; }
        }
    });

    const addToPlaylistMutation = useMutation({
        mutationFn: async (playlistId: string) => {
            await api.post(`/playlists/${playlistId}/tracks`, { trackId: track.id });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
        }
    });

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
                amount: track.price || 99
            });
            if (res.data.paymentUrl) {
                window.location.href = res.data.paymentUrl;
            }
        } catch (error) {
            console.error("Purchase failed", error);
        }
    };

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 15 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
            transition={{
                duration: 0.5,
                ease: [0.33, 1, 0.68, 1],
                delay: Math.min(index * 0.04, 0.4)
            }}
            className={cn(
                "group relative flex flex-col gap-3 p-2 rounded-xl transition-all duration-300 hover:bg-white/5 cursor-pointer",
                className
            )}
            onClick={() => setTrack(track)}
        >
            {/* Image Container */}
            <div className="group/art relative aspect-square w-full rounded-lg overflow-hidden bg-surface-hover shadow-xl">
                <img
                    src={getMediaUrl(track.coverUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${track.id}`}
                    alt={track.title}
                    className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105"
                />

                {/* PLAY OVERLAY */}
                <div className={cn(
                    "absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/art:opacity-100 transition-opacity duration-300",
                    isActuallyPlaying && "opacity-100 bg-accent/20"
                )}>
                    {isActuallyPlaying ? (
                        <div className="flex gap-1 items-end h-6">
                            <motion.div animate={{ height: [4, 16, 8, 12, 4] }} transition={{ duration: 0.8, repeat: Infinity }} className="w-1 bg-white rounded-full" />
                            <motion.div animate={{ height: [8, 12, 16, 4, 8] }} transition={{ duration: 0.6, repeat: Infinity }} className="w-1 bg-white rounded-full" />
                            <motion.div animate={{ height: [12, 4, 8, 16, 12] }} transition={{ duration: 1.0, repeat: Infinity }} className="w-1 bg-white rounded-full" />
                        </div>
                    ) : (
                        <button
                            onClick={handlePlayClick}
                            className="bg-white text-black p-3 rounded-full scale-90 group-hover/art:scale-100 transition-transform shadow-xl"
                        >
                            <Play fill="currentColor" size={20} className="translate-x-0.5" />
                        </button>
                    )}
                </div>

                {/* Micro-Interaction Actions */}
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover/art:opacity-100 transition-all duration-300 translate-y-2 group-hover/art:translate-y-0 z-30">
                    {track.price !== undefined && track.price > 0 && !track.isPurchased && (
                        <button
                            onClick={handlePurchase}
                            className="p-1.5 rounded-full bg-black/40 backdrop-blur-md text-white/60 hover:text-white transition-all shadow-xl"
                            title={`Purchase for $${(track.price / 100).toFixed(2)}`}
                        >
                            <ShoppingCart size={16} />
                        </button>
                    )}

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleLikeMutation.mutate();
                        }}
                        className={cn(
                            "p-1.5 rounded-full bg-black/40 backdrop-blur-md transition-all",
                            isLiked ? "text-[#EF4444]" : "text-white/40 hover:text-white"
                        )}
                    >
                        {toggleLikeMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Heart size={16} className={cn(isLiked && "fill-current")} />
                        )}
                    </button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="p-1.5 rounded-full bg-black/40 backdrop-blur-md text-white/40 hover:text-white transition-all"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MoreHorizontal size={16} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-52" align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleLikeMutation.mutate(); }}>
                                <Heart size={14} className={isLiked ? "fill-current text-[#EF4444]" : "opacity-70"} />
                                <span>{isLiked ? "Liked" : "Add to Favorites"}</span>
                            </DropdownMenuItem>

                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                                    <Plus size={14} className="opacity-70" /> <span>Add to Playlist</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent className="w-48 ml-1">
                                        {playlists?.map((p: any) => (
                                            <DropdownMenuItem key={p.id} onClick={(e) => { e.stopPropagation(); addToPlaylistMutation.mutate(p.id); }}>
                                                {p.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>

                            <DropdownMenuSeparator className="bg-white/10" />

                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(track.audioUrl, '_blank'); }}>
                                <Download size={14} className="opacity-70" /> <span>Download Track</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Info Section */}
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
        </motion.div>
    );
}
