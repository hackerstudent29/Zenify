"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { Play, Trash2, Clock, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { TrackItem } from "@/components/track-item";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { getMediaUrl } from "@/lib/utils";

interface Playlist {
    id: string;
    name: string;
    description?: string;
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

    // params.id can be string or string[]
    const playlistId = Array.isArray(params.id) ? params.id[0] : params.id;

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
        <div className="pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-end gap-6 bg-gradient-to-b from-zinc-700/50 to-zinc-900/0 p-8">
                <div className="h-52 w-52 shadow-2xl bg-zinc-800 flex items-center justify-center rounded-xl overflow-hidden shadow-black/50 relative group">
                    {/* @ts-ignore */}
                    {playlist?.coverUrl ? (
                        /* @ts-ignore */
                        <img src={getMediaUrl(playlist.coverUrl)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
                    ) : (
                        <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900">
                            <Music className="h-24 w-24 text-zinc-500/50" />
                        </div>
                    )}
                </div>
                <div className="flex-1 space-y-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">Playlist</span>
                    <h1 className="text-4xl md:text-7xl font-bold text-white tracking-tight">{playlist.name}</h1>
                    <p className="text-zinc-400 text-sm mt-2">{playlist.description}</p>
                    <div className="flex items-center text-sm text-zinc-300 font-medium">
                        {playlist.user?.avatarUrl ? (
                            <img src={getMediaUrl(playlist.user.avatarUrl)} alt="" className="h-6 w-6 rounded-full mr-2 object-cover" />
                        ) : (
                            <div className="h-6 w-6 rounded-full bg-zinc-500 mr-2 flex-shrink-0" />
                        )}
                        <span>{playlist.user?.username || playlist.user?.name || "User"}</span>
                        <span className="mx-1">•</span>
                        <span>{playlist.tracks.length} songs</span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4 p-8">
                <Button
                    size="icon"
                    className="h-14 w-14 rounded-full bg-accent hover:bg-accent/90 text-black shadow-lg shadow-black/40 transition hover:scale-105"
                    onClick={handlePlayPlaylist}
                >
                    <Play className="h-6 w-6 fill-black ml-1" />
                </Button>

                {isOwner && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-zinc-400 hover:text-white"
                        onClick={() => {
                            if (confirm("Are you sure you want to delete this playlist?")) {
                                deletePlaylistMutation.mutate();
                            }
                        }}
                    >
                        <Trash2 className="h-6 w-6" />
                    </Button>
                )}
            </div>

            {/* Tracks List */}
            <div className="px-8">
                <div className="hidden md:grid grid-cols-[2.5rem_1fr_12rem] gap-4 px-4 pb-1.5 items-end border-b border-rose-500/10 text-[10px] font-black uppercase tracking-[0.25em] text-rose-500/70">
                    <div className="flex justify-center">#</div>
                    <div className="font-brand pl-[3.25rem]">Title</div>
                    <div className="text-right pr-4 tracking-normal opacity-70"><Clock size={11} className="inline-block" /></div>
                </div>

                <div className="space-y-2">
                    {playlist.tracks.map((item, index) => (
                        <div
                            key={`${item.track.id}-${index}`}
                            className="group flex items-center p-2 rounded-lg hover:bg-white/5 transition cursor-pointer"
                            onClick={() => handlePlayTrack(item.track)}
                        >
                            <span className="w-8 text-center text-muted font-bold text-xs group-hover:text-white mr-4">
                                {index + 1}
                            </span>

                            <div className="flex-1 min-w-0">
                                <TrackItem track={item.track} index={index} contextTracks={playlist.tracks.map(t => t.track)} />
                            </div>

                            {isOwner && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity px-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm("Remove from playlist?")) {
                                                removeTrackMutation.mutate(item.track.id)
                                            }
                                        }}
                                        className="text-muted hover:text-red-500 p-2"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    {playlist.tracks.length === 0 && (
                        <div className="text-zinc-500 text-center py-12">
                            This playlist is empty. Go find some songs!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
