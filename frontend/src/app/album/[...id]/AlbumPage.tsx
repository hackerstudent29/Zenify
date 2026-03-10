"use client";


import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, Pause, Disc3, Clock, MoreHorizontal, Shuffle, Music2, AudioLines, Heart, Download, Plus, Share } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { getMediaUrl, cn } from "@/lib/utils";
import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/ui";
import { Check, X } from "lucide-react";
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

export default function AlbumPage() {
    const params = useParams();
    const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);
    const { setTrack, setQueue, currentTrack, isPlaying, togglePlay, isShuffled, toggleShuffle } = usePlayerStore();
    const { openDownloadModal, setFullScreenPlayerOpen, setPlayerMinimized } = useUIStore();
    const queryClient = useQueryClient();
    const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 2500);
    };

    const { data: album, isLoading } = useQuery({
        queryKey: ['album', id],
        queryFn: async () => {
            const res = await api.get(`/albums/${id}`);
            return res.data;
        },
        enabled: !!id,
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
        mutationFn: async ({ playlistId, trackId }: { playlistId: string, trackId: string }) => {
            await api.post(`/playlists/${playlistId}/tracks`, { trackId });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['playlist', variables.playlistId] });
            showToast("Added to playlist!", "success");
        },
        onError: (err: any) => {
            showToast(err.response?.data?.message || "Failed to add to playlist", "error");
        }
    });

    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as any[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
    });

    const toggleLikeMutation = useMutation({
        mutationFn: async (trackId: string) => {
            await api.post(`/tracks/${trackId}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const handleShare = async (item: any, type: 'album' | 'track' = 'album') => {
        const url = type === 'album'
            ? `${window.location.origin}/album/${id}`
            : `${window.location.origin}/album/${id}?track=${item.id}`;

        const title = type === 'album' ? album.title : item.title;
        const text = type === 'album' ? `Check out this album: ${album.title}` : `Listen to ${item.title} by ${album.artist?.name}`;

        if (navigator.share) {
            try {
                await navigator.share({ title, text, url });
            } catch (err) {
                if ((err as Error).name !== 'AbortError') showToast('Error sharing', 'error');
            }
        } else {
            try {
                await navigator.clipboard.writeText(url);
                showToast('Link copied to clipboard!');
            } catch (err) {
                showToast('Failed to copy link', 'error');
            }
        }
    };

    // Global Spacebar listener for Play/Pause
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Only trigger if not typing in an input/textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [togglePlay]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <ZenLoading size="md" />
            </div>
        );
    }

    if (!album) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-30">
                <Disc3 size={64} strokeWidth={1} />
                <p className="text-sm font-bold tracking-tight text-white/40">Album not found</p>
            </div>
        );
    }

    const isAlbumActive = album.tracks?.some((t: any) => t.id === currentTrack?.id);
    const isAlbumCurrentlyPlaying = isAlbumActive && isPlaying;

    const handlePlayAlbum = () => {
        if (isAlbumActive) {
            togglePlay();
        } else if (album.tracks?.length > 0) {
            setQueue(album.tracks);
            setTrack(album.tracks[0]);
            if (!isPlaying) togglePlay();
            setPlayerMinimized(false);
        }
    };

    const handleShufflePlay = () => {
        if (album.tracks?.length > 0) {
            // Force shuffle to ON 
            if (!isShuffled) toggleShuffle();

            // Start a random track
            const randomIndex = Math.floor(Math.random() * album.tracks.length);
            setTrack(album.tracks[randomIndex], album.tracks);
            if (!isPlaying) togglePlay();
            setPlayerMinimized(false);
        }
    };

    const handlePlayTrack = (track: any) => {
        if (currentTrack?.id === track.id) {
            togglePlay();
        } else {
            setQueue(album.tracks);
            setTrack(track);
            setPlayerMinimized(false);
        }
    };

    const coverUrl = getMediaUrl(album.coverUrl)
        || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800";

    const releaseYear = album.releaseDate ? new Date(album.releaseDate).getFullYear() : new Date(album.createdAt).getFullYear();
    const trackCount = album.tracks?.length || 0;

    const totalSeconds = album.tracks?.reduce((acc: number, t: any) => acc + (t.duration || 0), 0) || 0;
    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMins = Math.floor((totalSeconds % 3600) / 60);
    const totalDurationStr = totalHours > 0
        ? `${totalHours} hr ${totalMins} min`
        : `${totalMins} min ${totalSeconds % 60} sec`;

    return (
        <div className="pb-44 min-h-screen w-full bg-background overflow-x-hidden">
            <div className="w-full">

                {/* ── HEADER SECTION ─────────────────────────────────── */}
                <div className="relative px-6 pt-10 pb-8 md:px-10 md:pt-12 md:pb-12 overflow-hidden">
                    {/* Blurred Background Accent */}
                    <div className="absolute inset-0 z-0">
                        <img src={coverUrl} alt="" className="w-full h-full object-cover blur-[100px] opacity-20 scale-150" />
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
                    </div>

                    <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-end">
                        {/* Album Artwork */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="shrink-0 w-56 h-56 md:w-64 md:h-64 rounded-3xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.8)] ring-1 ring-white/10 bg-zinc-900"
                        >
                            <img src={coverUrl} alt={album.title} className="w-full h-full object-cover" />
                        </motion.div>

                        {/* Info */}
                        <div className="flex flex-col flex-1 text-center md:text-left">
                            <h1 className="text-4xl md:text-8xl font-brand tracking-tight text-white leading-[0.85] mb-4 drop-shadow-2xl">
                                {album.title}
                            </h1>

                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-8">
                                <Link
                                    href={`/search?type=artist&q=${encodeURIComponent(album.artist?.name || '')}`}
                                    className="text-xl md:text-2xl font-bold text-brand hover:underline transition-all"
                                >
                                    {album.artist?.name}
                                </Link>
                                <span className="w-1 h-1 rounded-full bg-white/20 hidden md:block" />
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-[11px] font-black text-white/40 uppercase tracking-[0.2em]">
                                    <span>{album.genre || 'Album'}</span>
                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                    <span>{releaseYear}</span>
                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                    <span>{trackCount} songs, {totalDurationStr}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-center md:justify-start gap-4">
                                <button
                                    onClick={handlePlayAlbum}
                                    disabled={trackCount === 0}
                                    className="px-8 py-3.5 rounded-full border border-brand/20 bg-brand/5 text-brand font-black text-[10px] tracking-[0.2em] shadow-lg shadow-brand/5 active:scale-95 hover:bg-brand/10 hover:border-brand/40 transition-all flex items-center justify-center gap-3 backdrop-blur-md min-w-[140px]"
                                >
                                    {isAlbumCurrentlyPlaying ? <Pause size={16} fill="currentColor" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} />}
                                    {isAlbumCurrentlyPlaying ? 'PAUSE' : 'PLAY'}
                                </button>

                                <button
                                    onClick={handleShufflePlay}
                                    disabled={trackCount === 0}
                                    className="px-8 py-3.5 rounded-full border border-brand/20 bg-brand/5 text-brand font-black text-[10px] tracking-[0.2em] shadow-lg shadow-brand/5 active:scale-95 hover:bg-brand/10 hover:border-brand/40 transition-all flex items-center justify-center gap-3 backdrop-blur-md min-w-[140px]"
                                >
                                    <Shuffle size={16} strokeWidth={2.5} />
                                    SHUFFLE
                                </button>

                                <button
                                    onClick={() => handleShare(album, 'album')}
                                    className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white active:scale-90 transition-all"
                                >
                                    <Share size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── TRACK LIST SECTION ────────────────────────────────────── */}
                <div className="w-full px-4 md:px-10">
                    {/* Desktop Headers */}
                    <div className="hidden md:grid grid-cols-[3rem_1fr_12rem] gap-4 px-6 pb-4 items-end border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-white/30">
                        <div className="flex justify-center">#</div>
                        <div>Title</div>
                        <div className="text-right pr-4"><Clock size={12} className="inline-block" /></div>
                    </div>

                    {/* Tracks */}
                    <div className="flex flex-col mt-4 space-y-1">
                        {album.tracks?.map((track: any, index: number) => {
                            const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                            const isActive = currentTrack?.id === track.id;

                            const mins = Math.floor((track.duration || 0) / 60);
                            const secs = (track.duration || 0) % 60;
                            const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;

                            return (
                                <motion.div
                                    key={track.id}
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
                                    {/* Desktop Index / Mobile Play Icon */}
                                    <div className="hidden md:flex items-center justify-center font-bold text-xs text-white/20 group-hover:text-white">
                                        {isTrackPlaying ? (
                                            <div className="flex items-end gap-[2px] h-[14px] w-5 justify-center">
                                                {[0.1, 0.4, 0.2, 0.5, 0.3].map((d, i) => (
                                                    <motion.div
                                                        key={i}
                                                        animate={{ height: ["30%", "100%", "30%"] }}
                                                        transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
                                                        className="w-[3px] bg-brand rounded-full"
                                                    />
                                                ))}
                                            </div>
                                        ) : index + 1}
                                    </div>

                                    {/* Track Meta */}
                                    <div className="flex flex-1 items-center gap-4 overflow-hidden">
                                        <div className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-zinc-800 border border-white/5 relative shadow-lg">
                                            <img src={getMediaUrl(track.coverUrl) || coverUrl} className="w-full h-full object-cover" alt="" />
                                            {isTrackPlaying && (
                                                <div className="absolute inset-0 bg-brand/20 backdrop-blur-[1px]" />
                                            )}
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className={cn("text-[14px] font-bold truncate tracking-tight", isActive ? "text-brand" : "text-white")}>
                                                {track.title}
                                            </span>
                                            {track.artistId ? (
                                                <Link
                                                    href={`/artist/${track.artistId}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-[11px] font-medium text-white/40 truncate hover:text-brand transition-colors w-fit"
                                                >
                                                    {track.artist?.name || album.artist?.name}
                                                </Link>
                                            ) : (
                                                <span className="text-[11px] font-medium text-white/40 truncate">
                                                    {track.artist?.name || album.artist?.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions & More */}
                                    <div className="flex items-center justify-end gap-1 md:gap-4 pr-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleLikeMutation.mutate(track.id);
                                            }}
                                            className={cn("p-2 transition-all", likedTrackIds?.includes(track.id) ? "text-brand" : "text-white/10 group-hover:text-white/40")}
                                        >
                                            <Heart size={16} className={cn(likedTrackIds?.includes(track.id) && "fill-current")} />
                                        </button>

                                        <div className="hidden md:block text-[11px] font-bold text-white/20 w-10 text-right tabular-nums">
                                            {durationStr}
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <button className="p-2 text-white/20 group-hover:text-white/60 transition-colors">
                                                    <MoreHorizontal size={18} />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="w-56" align="end">
                                                <DropdownMenuSub>
                                                    <DropdownMenuSubTrigger>
                                                        <Plus size={14} className="mr-2" /> Add to Playlist
                                                    </DropdownMenuSubTrigger>
                                                    <DropdownMenuPortal>
                                                        <DropdownMenuSubContent className="w-48 ml-1">
                                                            {playlists?.map((p: any) => (
                                                                <DropdownMenuItem key={p.id} onClick={() => addToPlaylistMutation.mutate({ playlistId: p.id, trackId: track.id })}>
                                                                    {p.name}
                                                                </DropdownMenuItem>
                                                            ))}
                                                        </DropdownMenuSubContent>
                                                    </DropdownMenuPortal>
                                                </DropdownMenuSub>
                                                <DropdownMenuItem onClick={() => openDownloadModal({ ...track, artist: album.artist })}>
                                                    <Download size={14} className="mr-2" /> Download
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator className="bg-white/5" />
                                                <DropdownMenuItem onClick={() => handleShare(track, 'track')}>
                                                    <Share size={14} className="mr-2" /> Share
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {(!album.tracks || album.tracks.length === 0) && (
                        <div className="py-32 text-center flex flex-col items-center gap-4">
                            <Music2 size={40} className="text-white/10" />
                            <p className="text-xs font-bold text-white/20 tracking-widest uppercase">Sonic Archive Empty</p>
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className={`fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[9999] ${toast.type === 'error'
                            ? 'bg-red-500/10 border-red-500/20 text-red-400'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            }`}
                    >
                        {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        <span className="text-[13px] font-semibold tracking-tight">{toast.msg}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

