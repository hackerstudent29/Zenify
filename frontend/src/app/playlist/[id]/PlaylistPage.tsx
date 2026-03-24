"use client";


import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { Play, Trash2, Clock, Music, Plus, MoreHorizontal, Pause, Shuffle, User, Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
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

import { motion } from "framer-motion";

interface Playlist {
    id: string;
    name: string;
    description?: string;
    coverUrl?: string;
    isPublic: boolean;
    tracks: { track: Track, addedAt: string }[];
    user?: { id: string, email: string, name?: string, username?: string, avatarUrl?: string };
}

export default function PlaylistDetailPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { setQueue, setTrack } = usePlayerStore();
    const { user, isAuthenticated } = useAuthStore();
    const { openDownloadModal } = useUIStore();

    const playlistId = params?.id ? (Array.isArray(params.id) ? params.id[0] : params.id) : '';

    const { data: playlist, isLoading, error } = useQuery({
        queryKey: ['playlist', playlistId],
        queryFn: async () => {
            const res = await api.get(`/playlists/${playlistId}`);
            return res.data as Playlist;
        },
        enabled: !!playlistId && isAuthenticated
    });

    const deletePlaylistMutation = useMutation({
        mutationFn: async () => {
            await api.delete(`/playlists/${playlistId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
            router.push('/library');
        }
    });

    const removeTrackMutation = useMutation({
        mutationFn: async (trackId: string) => {
            await api.delete(`/playlists/${playlistId}/tracks/${trackId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
        }
    });

    const handlePlayPlaylist = () => {
        if (!playlist || playlist.tracks.length === 0) return;
        const tracks = playlist.tracks.map(t => t.track);
        // Set queue and play first
        useUIStore.getState().setPlayerMinimized(false);
        setQueue(tracks);
        setTrack(tracks[0]);
    };

    const handlePlayTrack = (track: Track) => {
        if (!playlist) return;
        const tracks = playlist.tracks.map(t => t.track);
        useUIStore.getState().setPlayerMinimized(false);
        setTrack(track, tracks);
        const { isPlaying, togglePlay } = usePlayerStore.getState();
        if (!isPlaying) togglePlay();
    }

    if (isLoading) return <div className="p-8 text-white">Loading playlist...</div>;
    if (error || !playlist) return <div className="p-8 text-white">Playlist not found</div>;

    const isOwner = user?.id === playlist.user?.id;

    return (
        <div className="pb-44 min-h-screen w-full bg-black overflow-x-hidden text-white relative">
            {/* Grain/Noise Overlay (Inline SVG to avoid 403 error) */}
            <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />
            {/* ── MOBILE NAVBAR ─────────────────────────────────── */}
            <div className="md:hidden sticky top-0 z-[100] flex items-center justify-between px-4 h-16 bg-black/60 backdrop-blur-xl border-b border-white/5">
                <button onClick={() => router.back()} className="p-2 -ml-2 text-red-500 active:scale-90 transition-transform">
                    <ArrowLeft size={24} />
                </button>
                <div className="flex items-center gap-1">
                    <button className="p-2 text-red-500 active:scale-90 transition-transform">
                        <Plus size={22} />
                    </button>
                    <button className="p-2 text-red-500 active:scale-90 transition-transform">
                        <MoreHorizontal size={22} />
                    </button>
                </div>
            </div>

            <div className="w-full">
                {/* ── HEADER SECTION ─────────────────────────────────── */}
                <div className="relative px-6 pt-10 pb-8 md:px-10 md:pt-12 md:pb-12 text-center md:text-left flex flex-col items-center md:items-end md:flex-row gap-8">
                    {/* Cover Art */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="shrink-0 w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-zinc-900 border border-white/10"
                    >
                        {playlist?.coverUrl ? (
                            <img src={getMediaUrl(playlist.coverUrl)} alt={playlist.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white/10">
                                <Music size={80} />
                            </div>
                        )}
                    </motion.div>

                    {/* Info */}
                    <div className="flex flex-col flex-1">
                        <span className="text-[11px] font-black uppercase tracking-[0.4em] text-red-500 mb-2">Playlist Collection</span>
                        <h1 className="text-3xl md:text-6xl font-black text-white leading-tight mb-2 tracking-tight">
                            {formatDisplayTitle(playlist.name)}
                        </h1>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-lg font-bold text-white/40 mb-6">
                            <div className="flex items-center">
                                {playlist.user?.avatarUrl ? (
                                    <img src={getMediaUrl(playlist.user.avatarUrl)} alt="" className="h-5 w-5 rounded-full mr-2 object-cover" />
                                ) : (
                                    <div className="h-5 w-5 rounded-full bg-white/10 mr-2 flex-shrink-0" />
                                )}
                                <span className="text-white/80">{playlist.user?.username || playlist.user?.name || "User"}</span>
                            </div>
                            <span>•</span>
                            <span>{playlist.tracks.length} tracks</span>
                        </div>

                        <div className="flex items-center justify-center md:justify-start gap-4">
                            <button
                                onClick={handlePlayPlaylist}
                                disabled={playlist.tracks.length === 0}
                                className="flex-1 md:flex-initial flex items-center justify-center gap-3 bg-red-600 hover:bg-red-500 text-white h-12 px-12 rounded-xl font-bold text-[15px] active:scale-95 transition-all shadow-[0_8px_30px_rgba(220,38,38,0.3)]"
                            >
                                <Play size={18} fill="white" stroke="white" />
                                Play
                            </button>

                            <button
                                onClick={handlePlayPlaylist}
                                disabled={playlist.tracks.length === 0}
                                className="flex-1 md:flex-initial flex items-center justify-center gap-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white h-12 px-12 rounded-xl font-bold text-[15px] active:scale-95 transition-all border border-white/5"
                            >
                                <Shuffle size={18} className="text-red-600" fill="currentColor" />
                                Shuffle
                            </button>

                            {isOwner && (
                                <button
                                    onClick={() => {
                                        useUIStore.getState().openConfirmModal({
                                            title: "Delete Playlist?",
                                            message: `This will permanently remove "${playlist.name}" from your library.`,
                                            confirmText: "Erase Playlist",
                                            type: "danger",
                                            onConfirm: () => deletePlaylistMutation.mutate()
                                        });
                                    }}
                                    className="w-12 h-12 rounded-xl bg-[#1c1c1e] text-red-500 flex items-center justify-center hover:bg-red-500/10 active:scale-90 transition-all border border-white/5"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── TRACK LIST ────────────────────────────────────── */}
                <div className="w-full px-4 md:px-10 mt-6">
                    <div className="flex flex-col space-y-0.5">
                        {playlist.tracks.map((item, index) => {
                            const track = item.track;
                            const isTrackPlaying = usePlayerStore.getState().currentTrack?.id === track.id && usePlayerStore.getState().isPlaying;
                            const isActive = usePlayerStore.getState().currentTrack?.id === track.id;

                            return (
                                <motion.div
                                    key={`${track.id}-${index}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.03 }}
                                    onClick={() => handlePlayTrack(track)}
                                    className={cn(
                                        "group flex items-center gap-4 px-3 py-3 rounded-xl transition-all cursor-pointer active:bg-white/[0.05]",
                                        isActive ? "bg-white/[0.03]" : ""
                                    )}
                                >
                                    {/* Index / Visualizer */}
                                    <div className="w-6 flex items-center justify-center shrink-0">
                                        {isTrackPlaying ? (
                                            <div className="flex items-end gap-[1.5px] h-[12px] mb-0.5">
                                                {[0.1, 0.4, 0.2].map((d, i) => (
                                                    <motion.div key={i} animate={{ height: ["30%", "100%", "30%"] }} transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }} className="w-[2.5px] bg-red-500 rounded-full" />
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-sm font-bold text-white/20 group-hover:text-white/40">{index + 1}</span>
                                        )}
                                    </div>

                                    {/* Track info */}
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <div className={cn("text-[15px] font-bold truncate leading-snug", isActive ? "text-red-500" : "text-white")}>
                                            {formatDisplayTitle(track.title)}
                                        </div>
                                        <div className="text-[12px] font-medium text-white/40 truncate">
                                            {formatDisplayTitle(track.artist?.name || "Unknown Artist")}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <button className="p-2 text-white/20 hover:text-white transition-colors">
                                                    <MoreHorizontal size={20} />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="w-56" align="end">
                                                {track.artistId && (
                                                    <DropdownMenuItem onClick={() => router.push(`/artist/${track.artistId}`)}>
                                                        <User size={14} className="mr-2" /> Go to Artist
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onClick={() => openDownloadModal(track)}>
                                                    <Download size={14} className="mr-2" /> Download
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator className="bg-white/5" />
                                                {isOwner && (
                                                    <DropdownMenuItem 
                                                        className="text-red-400 focus:text-red-400 focus:bg-red-400/10"
                                                        onClick={() => removeTrackMutation.mutate(track.id)}
                                                    >
                                                        <Trash2 size={14} className="mr-2" /> Remove from Playlist
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </motion.div>
                            );
                        })}
                        {playlist.tracks.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <Music size={48} className="text-zinc-700 mb-4 opacity-20" />
                                <h3 className="text-lg font-bold text-white mb-2">This playlist is empty</h3>
                                <p className="text-sm text-zinc-500 max-w-xs mb-8">Go find some songs to add to your collection!</p>
                                <Button
                                    onClick={() => router.push('/search')}
                                    className="bg-red-600 text-white font-bold tracking-wide text-xs px-8 h-12 rounded-full shadow-glow"
                                >
                                    <Plus size={16} className="mr-2" /> Add songs
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
