"use client";

import React from "react";
import { Play, Pause, Heart, MoreHorizontal, ShoppingCart, Plus, Download } from "lucide-react";
import { cn, getMediaUrl, getTrackCover } from "@/lib/utils";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Track, usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
    contextTracks?: Track[];
}

export function MobileMediaCard({ track, className, index = 0, contextTracks }: MediaCardProps) {
    const pathname = usePathname();
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const { isPlayerMinimized, openDownloadModal, setFullScreenPlayerOpen, setPlayerMinimized } = useUIStore();
    const queryClient = useQueryClient();
    const isCurrent = currentTrack?.id === track.id;
    const isActuallyPlaying = isCurrent && isPlaying;

    const ref = useRef(null);
    const inView = useInView(ref, { amount: 0.1, once: true });
    const [toast, setToast] = React.useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 2500);
    };

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
            showToast("Added to playlist!", "success");
        },
        onError: (err: any) => {
            showToast(err.response?.data?.message || "Failed to add to playlist", "error");
        }
    });

    return (
        <>
            <motion.div
                ref={ref}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
                transition={{
                    duration: 0.5,
                    ease: [0.23, 1, 0.32, 1],
                    delay: Math.min(index * 0.04, 0.2)
                }}
                className={cn(
                    "group relative flex flex-col gap-3 p-2 rounded-md transition-all duration-300 hover:bg-white/5 cursor-pointer",
                    className
                )}
                onClick={() => {
                    if (isCurrent) {
                        setFullScreenPlayerOpen(true);
                    } else {
                        setTrack(track, contextTracks);
                        setPlayerMinimized(false);
                    }
                }}
            >
                {/* Mobile Artwork Container */}
                <motion.div
                    layoutId={isCurrent && isPlayerMinimized ? `artwork-${track.id}` : undefined}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="group/art relative aspect-square w-full rounded-md overflow-hidden bg-zinc-900 shadow-2xl transition-transform active:scale-95 duration-500"
                >
                    <img
                        src={getTrackCover(track)}
                        alt={track.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <AnimatePresence>
                        {isActuallyPlaying && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="absolute bottom-3 left-3 flex items-center justify-center pointer-events-none z-20 bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/10"
                            >
                                <div className="flex items-end gap-[2px] h-[10px]">
                                    {[0.2, 0.4, 0.1, 0.5].map((delay, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: ["35%", "100%", "35%"] }}
                                            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                            className="w-[2px] bg-brand rounded-full shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.5)]"
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Mobile Info */}
                <div className="flex flex-col min-w-0 px-1 mt-1">
                    <h3 className={cn(
                        "text-[15px] font-bold truncate transition-colors leading-tight mb-0.5", 
                        isCurrent ? "text-brand" : "text-white/90"
                    )}>
                        {track.title}
                    </h3>
                    
                    <p className="text-[12px] text-white/40 font-medium truncate tracking-tight">
                        {track.artist?.name || 'Unknown Artist'}
                    </p>
                </div>
            </motion.div>

            {/* Inline Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl border backdrop-blur-2xl shadow-xl z-[9999] ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}
                    >
                        <span className="text-[12px] font-medium">{toast.msg}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
