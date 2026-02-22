"use client";

import { Track, usePlayerStore } from "@/store/player";
import { Play, MoreHorizontal, Heart, Plus, Pause, Volume2, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
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
import { cn, getMediaUrl } from "@/lib/utils";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface TrackItemProps {
    track: Track;
    index?: number;
    onClick?: () => void;
}

export function TrackItem({ track, index, ...props }: TrackItemProps) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const queryClient = useQueryClient();
    const ref = useRef(null);
    const inView = useInView(ref, { amount: 0.1, once: true });

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
        onSuccess: (_, playlistId) => {
            queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
            alert("Added to playlist!");
        },
        onError: (err: any) => {
            alert(err.response?.data?.message || "Failed to add to playlist");
        }
    });

    const isActive = currentTrack?.id === track.id;

    const handlePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isActive) {
            togglePlay();
        } else {
            setTrack(track);
        }
    };

    return (
        <motion.div
            ref={ref}
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={inView ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.8, opacity: 0, y: 20 }}
            transition={{
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1],
                delay: index ? Math.min(index * 0.03, 0.2) : 0
            }}
            className={cn(
                "group flex items-center p-2 rounded-lg transition-all duration-200 cursor-pointer",
                isActive ? "bg-accent/10" : "hover:bg-white/5"
            )}
            onClick={(e) => {
                if (props.onClick) props.onClick();
                else handlePlay(e);
            }}
        >
            {/* Play/Index State */}
            <div className="w-10 flex items-center justify-center shrink-0">
                {isActive ? (
                    isPlaying ? (
                        <Volume2 size={16} className="text-accent animate-pulse" />
                    ) : (
                        <Play size={14} className="text-accent fill-current" />
                    )
                ) : (
                    <>
                        <span className="text-[11px] font-bold text-muted-dark group-hover:hidden">{index !== undefined ? index + 1 : ""}</span>
                        <Play size={14} className="text-foreground fill-current hidden group-hover:block" />
                    </>
                )}
            </div>

            {/* Thumbnail */}
            <div className="w-10 h-10 rounded-md overflow-hidden bg-surface-hover mr-4 shrink-0 shadow-md">
                <img
                    src={getMediaUrl(track.coverUrl) || `https://api.dicebear.com/7.x/identicon/svg?seed=${track.id}`}
                    className="w-full h-full object-cover"
                    alt=""
                />
            </div>

            {/* Title & Artist */}
            <div className="flex-1 min-w-0">
                <h3 className={cn(
                    "text-[13px] font-bold truncate leading-tight tracking-tight",
                    isActive ? "text-accent" : "text-foreground"
                )}>
                    {track.title}
                </h3>
                <p className="text-[11px] text-muted font-medium truncate mt-0.5 group-hover:text-muted/80 transition-colors">
                    {track.artist.name}
                </p>
            </div>

            {/* Actions (Always visible for current track, hover for others) */}
            <div className={cn(
                "flex items-center gap-1 transition-all duration-300 px-2",
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0"
            )}>
                <button
                    className={cn(
                        "p-2 rounded-full transition-all",
                        isLiked ? "text-[#EF4444]" : "text-muted hover:text-foreground"
                    )}
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleLikeMutation.mutate();
                    }}
                >
                    <Heart size={14} className={cn(isLiked && "fill-current")} />
                </button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className="p-2 text-muted hover:text-foreground transition-all"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreHorizontal size={14} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-52"
                        align="end"
                    >
                        <DropdownMenuItem
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleLikeMutation.mutate();
                            }}
                        >
                            <Heart size={14} className={isLiked ? "fill-current text-[#EF4444]" : "opacity-70"} />
                            <span>{isLiked ? "Liked" : "Add to Favorites"}</span>
                        </DropdownMenuItem>

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Plus size={14} className="opacity-70" /> <span>Add to Playlist</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent className="w-48 ml-1">
                                    {playlists?.map((p: any) => (
                                        <DropdownMenuItem
                                            key={p.id}
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

                        <DropdownMenuSeparator className="bg-white/10" />

                        <DropdownMenuItem
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(track.audioUrl, '_blank');
                            }}
                        >
                            <Download size={14} className="opacity-70" /> <span>Download Track</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Duration */}
            <div className="w-12 text-right text-[11px] font-bold text-muted tabular-nums pr-2 group-hover:text-foreground/60 transition-colors">
                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
            </div>
        </motion.div>
    );
}
