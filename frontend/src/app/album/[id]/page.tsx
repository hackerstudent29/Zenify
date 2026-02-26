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
    const id = params?.id as string;
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
                <p className="text-sm font-bold uppercase tracking-widest">Album not found</p>
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
            setPlayerMinimized(false);
        }
    };

    const handleShuffleAlbum = () => {
        if (album.tracks?.length > 0) {
            // If already playing this album, just toggle the shuffle state
            if (isAlbumActive) {
                toggleShuffle();
            } else {
                // Force shuffle to ON if it's off
                if (!isShuffled) toggleShuffle();

                // Start a random track
                const randomIndex = Math.floor(Math.random() * album.tracks.length);
                setTrack(album.tracks[randomIndex], album.tracks);
                setPlayerMinimized(false);
            }
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

    return (
        <div className="pb-40 min-h-screen w-full bg-background overflow-x-hidden pt-8">
            <div className="w-full px-6 md:px-10">

                {/* ── HEADER SECTION ─────────────────────────────────── */}
                <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
                    {/* Left: Album Artwork */}
                    <div className="shrink-0 w-48 h-48 md:w-64 md:h-64 rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.8)] ring-1 ring-white/10 bg-zinc-900">
                        <img src={coverUrl} alt={album.title} className="w-full h-full object-cover" />
                    </div>

                    {/* Right: Album Info */}
                    <div className="flex flex-col flex-1 text-left md:h-64">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 mb-1">Album</p>
                        <h1 className="text-2xl sm:text-3xl md:text-5xl font-brand tracking-tight text-white leading-tight text-wrap pt-1 pb-2">
                            {album.title}
                        </h1>
                        <Link href={`/search?type=artist&q=${encodeURIComponent(album.artist?.name || '')}`} className="text-base font-semibold text-white/50 hover:text-white transition-colors mb-4 inline-block w-max">
                            {album.artist?.name}
                        </Link>

                        <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-white/30 mb-4">
                            {album.genre && (
                                <>
                                    <span>{album.genre}</span>
                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                </>
                            )}
                            <span>{releaseYear}</span>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="bg-white/10 px-2 py-0.5 rounded tracking-widest text-white/70">
                                LOSSLESS
                            </span>
                        </div>

                        <p className="text-sm font-semibold text-white/30 mb-8 max-w-2xl line-clamp-3 leading-relaxed">
                            {album.tracks && album.tracks.length > 0 ? `A ${trackCount} track collection by ${album.artist?.name}, featuring songs like "${album.tracks[0].title}".` : 'No metadata available for this release.'}
                        </p>

                        <div className="flex items-center gap-4 mt-auto">
                            <button
                                onClick={handlePlayAlbum}
                                disabled={trackCount === 0}
                                className="w-12 h-12 inline-flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-rose-500 disabled:opacity-20 translate-x-[-8px]"
                                title={isAlbumCurrentlyPlaying ? "Pause" : "Play"}
                            >
                                {isAlbumCurrentlyPlaying ? <Pause size={38} className="fill-current" /> : <Play size={38} className="fill-current" />}
                            </button>
                            <button
                                onClick={handleShuffleAlbum}
                                disabled={trackCount === 0}
                                className={cn(
                                    "w-12 h-12 inline-flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-20",
                                    isShuffled ? "text-rose-500" : "text-white/50 hover:text-white"
                                )}
                                title="Shuffle"
                            >
                                <Shuffle size={28} strokeWidth={2.5} />
                            </button>

                            <button
                                onClick={() => handleShare(album, 'album')}
                                className="w-12 h-12 inline-flex items-center justify-center transition-all hover:scale-110 active:scale-95 text-rose-500"
                                title="Share Album"
                            >
                                <Share size={30} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── TRACK LIST SECTION ────────────────────────────────────── */}
                <div className="w-full">
                    {/* List Header */}
                    <div className="hidden md:grid grid-cols-[2.5rem_1fr_12rem] gap-4 px-4 pb-1.5 items-end border-b border-rose-500/10 text-[10px] font-black uppercase tracking-[0.25em] text-rose-500/70">
                        <div className="flex justify-center">#</div>
                        <div className="font-brand pl-[3.25rem]">Title</div>
                        <div className="text-right pr-4 tracking-normal opacity-70"><Clock size={11} className="inline-block" /></div>
                    </div>

                    {/* Tracks */}
                    <div className="flex flex-col mt-2">
                        {album.tracks?.map((track: any, index: number) => {
                            const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                            const isHovered = hoveredTrackId === track.id;

                            const mins = Math.floor((track.duration || 0) / 60);
                            const secs = (track.duration || 0) % 60;
                            const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;

                            return (
                                <div
                                    key={track.id}
                                    onMouseEnter={() => setHoveredTrackId(track.id)}
                                    onMouseLeave={() => setHoveredTrackId(null)}
                                    onDoubleClick={() => handlePlayTrack(track)}
                                    onClick={(e) => { e.currentTarget.blur(); handlePlayTrack(track); }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handlePlayTrack(track);
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`Play ${track.title}`}
                                    className="group grid grid-cols-[2.5rem_1fr_12rem] gap-4 px-4 py-2.5 items-center rounded-lg hover:bg-white/5 focus-visible:bg-white/10 focus:outline-none transition-colors cursor-pointer border-b border-white/5 last:border-b-0"
                                >
                                    {/* Number / Play Icon */}
                                    <div className="flex items-center justify-center w-full min-h-[1.5rem]">
                                        {(isHovered || isTrackPlaying) ? (
                                            <button
                                                onClick={() => handlePlayTrack(track)}
                                                className="text-white hover:text-rose-500 focus:outline-none flex items-center justify-center"
                                            >
                                                {isTrackPlaying && !isHovered ? (
                                                    <div className="flex items-end gap-[1.5px] h-[14px]">
                                                        {[...Array(4)].map((_, i) => (
                                                            <motion.div
                                                                key={i}
                                                                animate={{
                                                                    height: [
                                                                        `${30 + (i % 3) * 20}%`,
                                                                        `${90 - (i % 2) * 30}%`,
                                                                        `${30 + (i % 3) * 20}%`
                                                                    ]
                                                                }}
                                                                transition={{
                                                                    duration: 0.6 + (i % 3) * 0.1,
                                                                    repeat: Infinity,
                                                                    ease: "easeInOut",
                                                                    delay: i * 0.05
                                                                }}
                                                                className="w-[2.5px] bg-rose-500 rounded-full shadow-[0_0_6px_rgba(244,63,94,0.5)]"
                                                            />
                                                        ))}
                                                    </div>
                                                ) : isTrackPlaying && isHovered ? (
                                                    <Pause size={14} className="fill-current text-white" />
                                                ) : (
                                                    <Play size={14} className="fill-current text-white" />
                                                )}
                                            </button>
                                        ) : (
                                            <span className="text-[13px] font-medium text-muted">{index + 1}</span>
                                        )}
                                    </div>

                                    {/* Track Info & Thumbnail */}
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (track.id !== currentTrack?.id) handlePlayTrack(track);
                                                setFullScreenPlayerOpen(true);
                                            }}
                                            className="shrink-0 w-10 h-10 rounded border border-white/10 overflow-hidden bg-zinc-800 hover:scale-105 transition-transform active:scale-95"
                                        >
                                            <img src={getMediaUrl(track.coverUrl) || coverUrl} alt="" className="w-full h-full object-cover" />
                                        </button>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className={`text-[14px] font-bold truncate transition-colors ${isTrackPlaying ? 'text-rose-500' : 'text-foreground'}`}>
                                                {track.title}
                                            </span>
                                            <span className="text-[12px] font-medium text-muted truncate">
                                                {track.artist?.name || album.artist?.name}
                                                {track.featuredArtists ? `, ${track.featuredArtists}` : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions & Duration (Right Section) */}
                                    <div className="flex items-center justify-end gap-2 pr-2" onClick={(e) => e.stopPropagation()}>

                                        {/* Heart Icon (Hover only) */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleLikeMutation.mutate(track.id);
                                            }}
                                            className={cn(
                                                "opacity-0 group-hover:opacity-100 p-2 transition-all focus:outline-none",
                                                likedTrackIds?.includes(track.id) ? "text-rose-500 opacity-100" : "text-muted hover:text-rose-500"
                                            )}
                                        >
                                            <Heart size={16} fill={likedTrackIds?.includes(track.id) ? "currentColor" : "none"} />
                                        </button>

                                        {/* Add to Playlist Icon (Hover only) - Note: Dropdown handle below handles this specifically */}
                                        <button
                                            onClick={(e) => e.stopPropagation()}
                                            className="opacity-0 group-hover:opacity-100 p-2 text-muted hover:text-white transition-all focus:outline-none"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-list-music"><path d="M21 15V6" /><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path d="M12 12H3" /><path d="M16 6H3" /><path d="M12 18H3" /></svg>
                                        </button>

                                        {/* Duration (Always visible) */}
                                        <div className="text-right text-[13px] font-medium text-muted w-10">
                                            {durationStr}
                                        </div>

                                        {/* 3 Dots Option Menu (Hover only) */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <button className="opacity-0 group-hover:opacity-100 p-2 text-muted hover:text-white transition-all focus:outline-none mr-[-8px]">
                                                    <MoreHorizontal size={16} />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="w-56" align="end">
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
                                                                        addToPlaylistMutation.mutate({ playlistId: p.id, trackId: track.id });
                                                                    }}
                                                                >
                                                                    {p.name}
                                                                </DropdownMenuItem>
                                                            ))}
                                                        </DropdownMenuSubContent>
                                                    </DropdownMenuPortal>
                                                </DropdownMenuSub>

                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDownloadModal({ ...track, artist: album.artist });
                                                    }}
                                                >
                                                    <Download size={14} className="opacity-70" /> <span>Download Track</span>
                                                </DropdownMenuItem>

                                                <DropdownMenuSeparator className="bg-white/10" />

                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleShare(track, 'track');
                                                    }}
                                                >
                                                    <Share size={14} className="opacity-70" /> <span>Share Track</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {(!album.tracks || album.tracks.length === 0) && (
                        <div className="py-24 text-center opacity-40 flex flex-col items-center gap-4">
                            <Music2 size={32} />
                            <p className="text-sm font-bold">No tracks available</p>
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

