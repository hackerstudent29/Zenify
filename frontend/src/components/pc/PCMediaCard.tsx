"use client";

import React from "react";
import { Play, Pause, Heart, MoreHorizontal, ShoppingCart, Plus, Download, Maximize2, User, ArrowRight, Mic } from "lucide-react";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { UniversalMediaCover } from "../shared/MediaCard";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Track, usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
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

export function PCMediaCard({ track, className, index = 0, contextTracks }: MediaCardProps) {
    const pathname = usePathname();
    const router = useRouter();
    const currentTrack = usePlayerStore(state => state.currentTrack);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const setTrack = usePlayerStore(state => state.setTrack);
    const togglePlay = usePlayerStore(state => state.togglePlay);

    const isPlayerMinimized = useUIStore(state => state.isPlayerMinimized);
    const setFullScreenPlayerOpen = useUIStore(state => state.setFullScreenPlayerOpen);
    const setPlayerMinimized = useUIStore(state => state.setPlayerMinimized);
    const openDownloadModal = useUIStore(state => state.openDownloadModal);
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
            const res = await api.get('tracks/liked');
            return (res.data as Track[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
        enabled: !isLink
    });

    const isLiked = !isLink && likedTrackIds?.includes(track.id);

    const toggleLikeMutation = useMutation({
        mutationFn: async () => {
            await api.post(`tracks/${track.id}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const { user, isAuthenticated } = useAuthStore();
    const { data: playlists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('playlists/my');
                return res.data as { id: string, name: string }[];
            } catch (e) { return []; }
        },
        enabled: isAuthenticated && !isLink
    });

    const addToPlaylistMutation = useMutation({
        mutationFn: async (playlistId: string) => {
            await api.post(`playlists/${playlistId}/tracks`, { trackId: track.id });
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
                    "group relative flex flex-col gap-1 p-1 rounded-lg transition-all duration-500 cursor-pointer",
                    !isArtist && "hover:bg-white/[0.03]",
                    className
                )}
                onClick={(e) => {
                    e.stopPropagation();
                    if (isLink) {
                        router.push((track as any).href);
                        return;
                    }
                    if (isCurrent) {
                        togglePlay();
                    } else {
                        setTrack(track, contextTracks);
                        setPlayerMinimized(false);
                    }
                }}
            >
                {/* PC Artwork Container */}
                <motion.div
                    layoutId={isCurrent && isPlayerMinimized ? `artwork-${track.id}` : undefined}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                        "group/art relative aspect-square w-full overflow-hidden bg-surface-hover shadow-xl transition-all duration-500",
                        isArtist ? "rounded-full" : "rounded-lg"
                    )}
                >
                    <UniversalMediaCover
                        track={track}
                        className={cn(
                            "w-full h-full object-cover transition-transform duration-700 ease-out"
                        )}
                    />

                    {/* Desktop Hover Overlay Removed as requested */}

                    {/* Micro-Interaction Actions */}
                    {!isArtist && (
                        <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-[-10px] group-hover:translate-y-0 z-40">
                            {!isAlbum && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLikeMutation.mutate();
                                    }}
                                    className={cn(
                                        "p-1",
                                        isLiked
                                            ? "text-brand"
                                            : "text-white/60 hover:text-brand"
                                    )}
                                >
                                    {toggleLikeMutation.isPending ? (
                                        <ZenLoading size="xs" />
                                    ) : (
                                        <Heart size={18} className={cn(isLiked && "fill-current")} />
                                    )}
                                </button>
                            )}

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 text-white/60 hover:text-rose-500 transition-colors outline-none bg-transparent"
                                    >
                                        <MoreHorizontal size={18} />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    className="w-56 bg-[#0E0E10]/95 backdrop-blur-xl border-white/10 z-[100] pointer-events-auto"
                                    align="end"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {!isAlbum && (
                                        <DropdownMenuItem
                                            className="gap-3 py-2.5 focus:bg-white/5 cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleLikeMutation.mutate();
                                            }}
                                        >
                                            <Heart size={16} className={isLiked ? "fill-current text-[#EF4444]" : "opacity-70"} />
                                            <span className="font-medium">{isLiked ? "Saved to Library" : "Save to Library"}</span>
                                        </DropdownMenuItem>
                                    )}

                                    {track.artist?.id && (
                                        <DropdownMenuItem
                                            className="gap-3 py-2.5 focus:bg-white/5 cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.location.href = `/artist/${track.artist.id}`;
                                            }}
                                        >
                                            <User size={16} className="opacity-70" />
                                            <span className="font-medium">Go to Artist</span>
                                        </DropdownMenuItem>
                                    )}

                                    {!isAlbum && (
                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger className="gap-3 py-2.5 focus:bg-white/5 cursor-pointer">
                                                <Plus size={16} className="opacity-70" /> <span className="font-medium">Add to Playlist</span>
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuPortal>
                                                <DropdownMenuSubContent className="w-56 bg-[#0E0E10]/95 backdrop-blur-xl border-white/10 ml-2">
                                                    {playlists?.map((p: any) => (
                                                        <DropdownMenuItem
                                                            key={p.id}
                                                            className="py-2.5 focus:bg-white/5 cursor-pointer"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                addToPlaylistMutation.mutate(p.id);
                                                            }}
                                                        >
                                                            {p.name}
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuPortal>
                                        </DropdownMenuSub>
                                    )}

                                    {user?.role === 'ADMIN' && !isAlbum && (
                                        <DropdownMenuItem
                                            className="gap-3 py-2.5 focus:bg-violet-500/10 text-violet-400 focus:text-violet-300 cursor-pointer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/admin/lyric-sync?trackId=${track.id}`);
                                            }}
                                        >
                                            <Mic size={16} className="opacity-70 text-violet-400" />
                                            <span className="font-bold">Sync Lyrics</span>
                                        </DropdownMenuItem>
                                    )}

                                    <DropdownMenuSeparator className="bg-white/5" />

                                    <DropdownMenuItem
                                        className="gap-3 py-2.5 focus:bg-brand/10 text-brand focus:text-brand cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isAlbum) {
                                                window.location.href = (track as any).href;
                                            } else {
                                                openDownloadModal(track);
                                            }
                                        }}
                                    >
                                        {isAlbum ? <ArrowRight size={16} /> : <Download size={16} />}
                                        <span className="font-bold">{isAlbum ? "View Album" : "Download Hi-Res"}</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}

                    {/* Playing Indicator */}
                    <AnimatePresence>
                        {isActuallyPlaying && (
                            <div className="absolute bottom-3 left-3 pointer-events-none z-20">
                                <div className="flex items-end gap-[2px] h-[14px]">
                                    {[0.2, 0.4, 0.1, 0.5].map((delay, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: ["35%", "100%", "35%"] }}
                                            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                            className="w-[3px] bg-brand rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* PC Info Section */}
                <div className="flex flex-col min-w-0 flex-1 px-1 gap-1 mt-3">
                    <h3 
                        onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/track/${track.id}`);
                        }}
                        className={cn("font-sans text-[15px] font-medium truncate transition-colors text-white tracking-tight leading-snug hover:text-brand cursor-pointer", isCurrent && "text-brand")}
                    >
                        {formatDisplayTitle(track.title)}
                    </h3>
                    
                    <div className="flex items-center justify-between gap-2 overflow-hidden h-4">
                        {(pathname !== '/' && track.artist?.id) ? (
                            <Link
                                href={`/artist/${track.artist.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[12px] text-zinc-500 font-medium truncate group-hover:text-white transition-colors hover:text-brand tracking-tight flex-1 font-sans"
                            >
                                {formatDisplayTitle(track.artist?.name) || 'Unknown Artist'}
                            </Link>
                        ) : (
                            <p className="text-[12px] text-zinc-500 font-medium truncate group-hover:text-white/40 tracking-tight transition-colors flex-1 font-sans">
                                {formatDisplayTitle(track.artist?.name) || 'Unknown Artist'}
                            </p>
                        )}

                        {/* Hover Duration in Rose (Hidden for Artists) */}
                        {!isArtist && (
                            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[11px] font-bold text-red-500 tabular-nums">
                                    {(() => {
                                        const m = Math.floor((track.duration || 0) / 60);
                                        const s = (track.duration || 0) % 60;
                                        return `${m}:${s.toString().padStart(2, '0')}`;
                                    })()}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Inline Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl border backdrop-blur-2xl shadow-2xl z-[9999] ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}
                    >
                        <span className="text-[14px] font-bold text-white">{toast.msg}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
