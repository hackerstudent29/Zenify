"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { useAuthStore } from "@/store/auth";
import { Play, Pause, Clock, Trash2, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Track {
    id: string;
    title: string;
    artist: string;
    duration: number;
    audioUrl: string;
}

interface PlaylistTrack {
    addedAt: string;
    track: Track;
}

interface Playlist {
    id: string;
    name: string;
    description?: string;
    userId: string;
    user: {
        id: string;
        email: string;
    };
    tracks: PlaylistTrack[];
}

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();
    const { currentTrack, isPlaying, setTrack, setQueue, togglePlay } = usePlayerStore();

    useEffect(() => {
        fetchPlaylist();
    }, [id]);

    const fetchPlaylist = async () => {
        try {
            const res = await api.get(`/playlists/${id}`);
            setPlaylist(res.data);
        } catch (error) {
            console.error("Failed to fetch playlist:", error);
        } finally {
            setLoading(false);
        }
    };

    const handlePlay = (track: Track, index: number) => {
        if (currentTrack?.id === track.id) {
            togglePlay();
        } else {
            setTrack(track);
            // Set context queue
            const queueTracks = playlist?.tracks.map(pt => pt.track) || [];
            setQueue(queueTracks);
        }
    };

    const handlePlayAll = () => {
        if (!playlist?.tracks.length) return;
        const firstTrack = playlist.tracks[0].track;
        setTrack(firstTrack);
        setQueue(playlist.tracks.map(pt => pt.track));
    };

    const verifyOwner = () => {
        return user?.id === playlist?.userId;
    };

    const handleRemoveTrack = async (trackId: string) => {
        if (!confirm("Remove this track from playlist?")) return;
        try {
            await api.delete(`/playlists/${id}/tracks/${trackId}`);
            fetchPlaylist(); // Refresh
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 pt-6">
                <div className="flex gap-6 items-end">
                    <Skeleton className="w-52 h-52 shadow-lg rounded-md" />
                    <div className="space-y-4">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-12 w-64" />
                        <Skeleton className="h-4 w-40" />
                    </div>
                </div>
            </div>
        );
    }

    if (!playlist) return <div className="p-12 text-center text-muted-foreground">Playlist not found</div>;

    return (
        <div className="space-y-6 -mx-6 -mt-6">
            {/* Header with Gradient */}
            <div className="bg-gradient-to-b from-zinc-700/50 to-background p-8 pb-6 flex flex-col md:flex-row gap-6 items-end">
                <div className="w-52 h-52 bg-gradient-to-br from-zinc-800 to-black shadow-2xl rounded-md flex items-center justify-center shrink-0">
                    <div className="text-6xl">🎵</div>
                </div>
                <div className="flex-1 space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Playlist</span>
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-4 line-clamp-1">{playlist.name}</h1>
                    <div className="flex items-center text-sm font-medium text-zinc-300 gap-1">
                        <span className="text-white hover:underline cursor-pointer">{playlist.user.email.split('@')[0]}</span>
                        <span>•</span>
                        <span>{playlist.tracks.length} songs</span>
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="px-8 flex items-center gap-4 bg-background/50 sticky top-0 py-4 backdrop-blur-md z-10">
                <Button
                    size="icon"
                    className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-black shadow-lg hover:scale-105 transition-transform"
                    onClick={handlePlayAll}
                    disabled={!playlist.tracks.length}
                >
                    {isPlaying && playlist.tracks.some(t => t.track.id === currentTrack?.id) ? (
                        <Pause className="w-6 h-6 fill-current" />
                    ) : (
                        <Play className="w-6 h-6 fill-current translate-x-0.5" />
                    )}
                </Button>
            </div>

            {/* Tracks List */}
            <div className="px-8 pb-12">
                {/* Table Header */}
                <div className="grid grid-cols-[16px_4fr_3fr_minmax(120px,1fr)] gap-4 px-4 py-2 border-b border-white/10 text-zinc-400 text-sm mb-4 sticky top-[88px] bg-background">
                    <span>#</span>
                    <span>Title</span>
                    <span>Album</span>
                    <div className="flex justify-end"><Clock className="w-4 h-4" /></div>
                </div>

                <div className="space-y-1">
                    {playlist.tracks.map(({ track, addedAt }, index) => {
                        const isCurrent = currentTrack?.id === track.id;
                        return (
                            <div
                                key={track.id}
                                className={cn(
                                    "group grid grid-cols-[16px_4fr_3fr_minmax(120px,1fr)] gap-4 px-4 py-2 rounded-md hover:bg-white/10 transition-colors cursor-default items-center text-sm text-zinc-400",
                                    isCurrent && "text-primary"
                                )}
                                onDoubleClick={() => handlePlay(track, index)}
                            >
                                <div className="flex items-center justify-center w-4 relative">
                                    <span className={cn("group-hover:hidden", isCurrent && "text-primary")}>{index + 1}</span>
                                    <Play
                                        className={cn("w-3 h-3 absolute hidden group-hover:block cursor-pointer text-white", isCurrent && "hidden")}
                                        onClick={() => handlePlay(track, index)}
                                    />
                                    {isCurrent && isPlaying && (
                                        <img src="https://open.spotifycdn.com/cdn/images/equaliser-animated-green.f93a2ef4.gif" className="w-3 h-3 absolute" alt="playing" />
                                    )}
                                </div>
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="flex flex-col truncate">
                                        <span className={cn("text-base font-medium truncate text-white", isCurrent && "text-primary")}>{track.title}</span>
                                        <span className="text-zinc-400 group-hover:text-white transition-colors cursor-pointer hover:underline">{track.artist}</span>
                                    </div>
                                </div>
                                <div className="truncate group-hover:text-white transition-colors">
                                    {/* Placeholder for Album */}
                                    Single
                                </div>
                                <div className="flex items-center justify-end gap-4">
                                    {verifyOwner() && (
                                        <Trash2
                                            className="w-4 h-4 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-red-500 transition-all"
                                            onClick={() => handleRemoveTrack(track.id)}
                                        />
                                    )}
                                    <span className="font-mono">
                                        {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
