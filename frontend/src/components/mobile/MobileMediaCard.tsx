"use client";

import React from "react";
import { Play, Pause, Heart, MoreHorizontal, ShoppingCart, Plus, Download } from "lucide-react";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { UniversalMediaCover } from "../shared/UniversalMediaCover";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Track, usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    const router = useRouter();
    const currentTrack = usePlayerStore(state => state.currentTrack);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const setTrack = usePlayerStore(state => state.setTrack);
    const togglePlay = usePlayerStore(state => state.togglePlay);

    const isPlayerMinimized = useUIStore(state => state.isPlayerMinimized);
    const openDownloadModal = useUIStore(state => state.openDownloadModal);
    const setFullScreenPlayerOpen = useUIStore(state => state.setFullScreenPlayerOpen);
    const setPlayerMinimized = useUIStore(state => state.setPlayerMinimized);
    const queryClient = useQueryClient();
    const isArtist = (track as any).isArtist;
    const isAlbum = (track as any).isAlbum;
    const isLink = isArtist || isAlbum || (track as any).isMood || (track as any).isPlaylist;
    const isCurrent = !isLink && currentTrack?.id === track.id;
    const isActuallyPlaying = isCurrent && isPlaying;

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
        enabled: !isLink
    });

    const isLiked = !isLink && likedTrackIds?.includes(track.id);

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
        },
        enabled: !isLink
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
            <div
                className={cn(
                    "group relative flex flex-col gap-3 rounded-lg transition-all duration-300 hover:bg-white/5 cursor-pointer font-sans",
                    className
                )}
                onClick={() => {
                    if (isLink) {
                        router.push((track as any).href);
                        return;
                    }
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
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                        "group/art relative aspect-square w-full overflow-hidden bg-zinc-900 shadow-2xl transition-all active:scale-95 duration-500",
                        isArtist ? "rounded-full" : "rounded-lg"
                    )}
                >
                    <UniversalMediaCover
                        track={track}
                        className={cn(
                            "w-full h-full object-cover transition-transform duration-700",
                            isArtist ? "rounded-full" : "group-hover:scale-110 rounded-lg"
                        )}
                    />
                    
                    <div className={cn(
                        "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                        isArtist ? "rounded-full" : "rounded-lg"
                    )} />

                    {(track as any).resumeProgress && track.duration && (
                        <div className={cn(
                            "absolute bottom-0 left-0 right-0 h-1 bg-black/50 overflow-hidden z-10",
                            isArtist ? "rounded-b-full" : "rounded-b-lg"
                        )}>
                            <div 
                                className="h-full bg-brand" 
                                style={{ width: `${((track as any).resumeProgress / track.duration) * 100}%` }}
                            />
                        </div>
                    )}

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

                <div className="flex flex-col min-w-0 px-1 mt-1">
                    <h3 
                        onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/track/${track.id}`);
                        }}
                        className={cn(
                            "font-sans text-[13px] font-bold line-clamp-2 transition-colors leading-snug mb-0.5 hover:text-brand cursor-pointer", 
                            isCurrent ? "text-brand" : "text-white/90"
                        )}
                    >
                        {formatDisplayTitle(track.title)}
                    </h3>
                    
                    <p className="text-[11px] text-white/40 font-medium truncate tracking-tight font-sans">
                        {formatDisplayTitle(track.artist?.name || 'Unknown Artist')}
                    </p>
                </div>
            </div>

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
