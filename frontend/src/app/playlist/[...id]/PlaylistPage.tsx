"use client";


import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { Play, Trash2, Clock, Music, Plus, MoreHorizontal, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { getMediaUrl, cn } from "@/lib/utils";

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
    }

    if (isLoading) return <div className="p-8 text-white">Loading playlist...</div>;
    if (error || !playlist) return <div className="p-8 text-white">Playlist not found</div>;

    const isOwner = user?.id === playlist.user?.id;

    return (
        <div className="pb-44 min-h-screen">
            {/* Header */}
            <div className="relative px-6 pt-12 pb-8 md:px-10 md:pt-16 md:pb-12 overflow-hidden">
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-700/30 to-background" />
                    {playlist?.coverUrl && (
                        <img src={getMediaUrl(playlist.coverUrl)} className="w-full h-full object-cover blur-[100px] opacity-20 scale-150" alt="" />
                    )}
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end gap-8">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="h-56 w-56 md:h-64 md:w-64 shadow-[0_32px_80px_rgba(0,0,0,0.7)] bg-zinc-800 flex items-center justify-center rounded-3xl overflow-hidden relative group border border-white/10"
                    >
                        {playlist?.coverUrl ? (
                            <img src={getMediaUrl(playlist.coverUrl)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                        ) : (
                            <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-zinc-500">
                                <Music size={64} strokeWidth={1.5} />
                            </div>
                        )}
                    </motion.div>

                    <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-brand mb-2">Playlist Collection</span>
                        <h1 className="text-4xl md:text-7xl font-black text-white tracking-tighter leading-[0.9] mb-4 drop-shadow-2xl">{playlist.name}</h1>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm font-bold text-white/50 mb-6">
                            <div className="flex items-center">
                                {playlist.user?.avatarUrl ? (
                                    <img src={getMediaUrl(playlist.user.avatarUrl)} alt="" className="h-5 w-5 rounded-full mr-2 object-cover" />
                                ) : (
                                    <div className="h-5 w-5 rounded-full bg-white/10 mr-2 flex-shrink-0" />
                                )}
                                <span className="text-white">{playlist.user?.username || playlist.user?.name || "User"}</span>
                            </div>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span>{playlist.tracks.length} tracks</span>
                            {playlist.description && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                    <span className="line-clamp-1 max-w-[200px]">{playlist.description}</span>
                                </>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            <button
                                onClick={handlePlayPlaylist}
                                disabled={playlist.tracks.length === 0}
                                className="px-8 py-3.5 rounded-full bg-brand text-white font-black text-[11px] tracking-[0.2em] shadow-lg shadow-brand/20 active:scale-95 transition-all flex items-center gap-3"
                            >
                                <Play size={18} fill="currentColor" />
                                PLAY SHUFFLE
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
                                    className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-red-400 active:scale-90 transition-all"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tracks List */}
            <div className="px-4 md:px-10">
                <div className="hidden md:grid grid-cols-[3rem_1fr_12rem] gap-4 px-6 pb-4 items-end border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-white/30">
                    <div className="flex justify-center">#</div>
                    <div>Title</div>
                    <div className="text-right pr-4"><Clock size={12} className="inline-block" /></div>
                </div>

                <div className="flex flex-col mt-4 space-y-1">
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
                                transition={{ delay: index * 0.05 }}
                                onClick={() => handlePlayTrack(track)}
                                className={cn(
                                    "group flex items-center gap-4 px-4 py-3 rounded-2xl transition-all cursor-pointer active:scale-[0.98] md:grid md:grid-cols-[3rem_1fr_12rem]",
                                    isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                                )}
                            >
                                <div className="hidden md:flex items-center justify-center font-bold text-xs text-white/20 group-hover:text-white">
                                    {isTrackPlaying ? (
                                        <div className="flex items-end gap-[1.5px] h-[12px]">
                                            {[0.1, 0.4, 0.2].map((d, i) => (
                                                <motion.div key={i} animate={{ height: ["30%", "100%", "30%"] }} transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }} className="w-[2px] bg-brand rounded-full" />
                                            ))}
                                        </div>
                                    ) : index + 1}
                                </div>

                                <div className="flex flex-1 items-center gap-4 overflow-hidden">
                                    <div className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-zinc-800 border border-white/5 relative shadow-lg">
                                        <img src={getMediaUrl(track.coverUrl)} className="w-full h-full object-cover" alt="" />
                                        {isTrackPlaying && (
                                            <div className="absolute inset-0 bg-brand/30 backdrop-blur-[1px] flex items-center justify-center">
                                                <Pause size={14} fill="white" className="text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className={cn("text-[14px] font-bold truncate tracking-tight", isActive ? "text-brand" : "text-white")}>
                                            {track.title}
                                        </span>
                                        <span className="text-[11px] font-medium text-white/40 truncate">
                                            {track.artist?.name || "Unknown Artist"}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-1 md:gap-4 pr-1">
                                    {isOwner && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                useUIStore.getState().openConfirmModal({
                                                    title: "Remove from Playlist?",
                                                    message: `Remove "${track.title}" from this collection?`,
                                                    confirmText: "Remove",
                                                    type: "danger",
                                                    onConfirm: () => removeTrackMutation.mutate(track.id)
                                                });
                                            }}
                                            className="p-2 text-white/10 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                    <div className="p-2 text-white/10 group-hover:text-white/40 transition-colors">
                                        <MoreHorizontal size={18} />
                                    </div>
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
                                className="bg-brand text-white font-bold tracking-wide text-xs px-8 h-12 rounded-full shadow-glow"
                            >
                                <Plus size={16} className="mr-2" /> Add songs
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
