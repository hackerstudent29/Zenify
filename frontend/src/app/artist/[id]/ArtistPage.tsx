"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { getArtist } from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, Pause, Disc3, Music2, Heart, Share, BadgeCheck, Plus, X, Search, CheckCircle2, Shuffle } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { audioEngine } from "@/lib/audio-engine";
import { cn, getMediaUrl, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { ResponsiveTrackList } from "@/components/shared/ResponsiveTrackList";
import { MarqueeText } from "@/components/shared/MarqueeText";
import { SoftPageBackground } from "@/components/shared/SoftPageBackground";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, MoreHorizontal, Download, Share2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
    DropdownMenuSubContent
} from "@/components/ui/dropdown-menu";

// Animated audio visualizer — 4 bars bouncing
function Visualizer() {
    return (
        <div className="flex items-end gap-[2px] h-[10px] w-5 justify-center mb-0.5">
            {[0.6, 1.0, 0.4, 0.8].map((initialH, i) => (
                <motion.span
                    key={i}
                    className="w-[3px] bg-red-500 rounded-full"
                    animate={{ scaleY: [initialH, 1.2, initialH * 0.5, 1, initialH] }}
                    transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
                    style={{ height: 10, transformOrigin: "bottom" }}
                />
            ))}
        </div>
    );
}

export default function ArtistPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;
    const queryClient = useQueryClient();
    const { setTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();
    const { setPlayerMinimized, openDownloadModal } = useUIStore();

    const { data: artist, isLoading } = useQuery({
        queryKey: ['artist', id],
        queryFn: async () => {
            const res = await getArtist(id);
            return res.data;
        },
        enabled: !!id,
    });

    const colors = useAlbumColor(artist?.imageUrl || artist?.coverUrl, artist?.aura_color);

    const { isAuthenticated } = useAuthStore();
    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('tracks/liked');
            return (res.data as any[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
        enabled: isAuthenticated
    });

    const { data: playlists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('playlists/my');
                return res.data;
            } catch (e) { return []; }
        },
        enabled: isAuthenticated
    });

    const toggleLike = async (trackId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.post(`tracks/${trackId}/like`);
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        } catch (err) {}
    };

    const addToPlaylist = async (trackId: string, playlistId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.post(`playlists/${playlistId}/tracks`, { trackId });
            queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
        } catch (err) {}
    };

    const shareTrack = (trackId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`${window.location.origin}/track/${trackId}`);
    };

    const API_URL = (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'https://zenify-production-08b4.up.railway.app/api';
    const proxy = (url: string) => `${API_URL}/utils/proxy-image?url=${encodeURIComponent(url)}`;

    // Track-picker state
    const [showTrackPicker, setShowTrackPicker] = useState(false);
    const [trackSearch, setTrackSearch] = useState('');
    const [allTracks, setAllTracks] = useState<any[]>([]);
    const [tracksLoading, setTracksLoading] = useState(false);
    const [assigning, setAssigning] = useState<string | null>(null);
    const [justAssigned, setJustAssigned] = useState<string | null>(null);

    const openTrackPicker = async () => {
        setShowTrackPicker(true);
        setTracksLoading(true);
        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`${API_URL}/tracks?limit=500`, { headers });
            if (!res.ok) {
                throw new Error(`Failed to fetch tracks: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            // Handle {items: [], total} or {data: []} or plain [] responses
            const tracks = Array.isArray(data)
                ? data
                : Array.isArray(data?.items)
                    ? data.items
                    : Array.isArray(data?.data)
                        ? data.data
                        : [];
            setAllTracks(tracks || []);
        } catch (err) {
            console.error('Failed to load tracks:', err);
        }
        setTracksLoading(false);
    };

    const assignTrack = async (trackId: string) => {
        if (!artist) return;
        setAssigning(trackId);
        try {
            await fetch(`${API_URL}/tracks/${trackId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ artistName: artist.name }),
            });
            setJustAssigned(trackId);
            setTimeout(() => setJustAssigned(null), 2000);
            queryClient.invalidateQueries({ queryKey: ['artist', id] });
        } catch { }
        setAssigning(null);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] bg-black">
                <ZenLoading size="md" />
            </div>
        );
    }

    if (!artist) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-30 bg-black">
                <Disc3 size={64} strokeWidth={1} />
                <p className="text-sm font-bold tracking-tight text-white/40">Artist not found</p>
            </div>
        );
    }

    const isArtistActive = artist.topTracks?.some((t: any) => t.id === currentTrack?.id);

    const imageUrl = artist.imageUrl;

    const birthDateObj = artist.birthDate ? new Date(artist.birthDate) : null;
    const isValidDate = birthDateObj && !isNaN(birthDateObj.getTime());

    const formattedBirthDate = isValidDate
        ? birthDateObj.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
          })
        : null;

    const age = isValidDate
        ? new Date().getFullYear() - birthDateObj.getFullYear()
        : null;

    const filteredTracks = (allTracks || []).filter(track => {
        const query = (trackSearch || "").toLowerCase();
        const titleMatch = track.title?.toLowerCase().includes(query);
        const artistMatch = (track.artist?.name || track.artistName || "").toLowerCase().includes(query);
        return titleMatch || artistMatch;
    });

    const handlePlayTopTracks = () => {
        if (!artist.topTracks?.length) return;
        if (isArtistActive) {
            togglePlay();
        } else {
            setTrack(artist.topTracks[0], artist.topTracks);
            setPlayerMinimized(false);
        }
    };

    const handlePlayTrack = (track: any) => {
        if (currentTrack?.id === track.id) {
            togglePlay();
        } else {
            setTrack(track, artist.topTracks);
            if (!isPlaying) togglePlay();
            setPlayerMinimized(false);
        }
    };

    const bannerUrl = artist.coverUrl || artist.imageUrl || null;

    return (
        <div className="pb-44 min-h-screen w-full bg-black overflow-x-hidden text-white relative">
            <SoftPageBackground colors={colors} />
            
            <div className="w-full relative z-10">
                <div className="relative h-[40vh] md:h-[55vh] w-full mt-4 md:mt-8 px-4 md:px-8">
                    <div className="relative h-full w-full overflow-hidden rounded-[1.5rem] md:rounded-[2.5rem] bg-transparent border border-white/5 shadow-2xl group/banner">
                        {/* Background image with hover effect */}
                        {bannerUrl ? (
                            <img
                                src={getMediaUrl(bannerUrl) || undefined}
                                onError={(e) => {
                                    const el = e.target as HTMLImageElement;
                                    if (!el.src.includes('proxy-image')) el.src = proxy(bannerUrl || '');
                                }}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-1000 group-hover/banner:scale-105"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-black/10" />
                        )}

                    {/* Gradient overlays */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

                        <div className="absolute inset-0 flex flex-col justify-end px-6 pb-8 md:px-12 md:pb-12">
                            <motion.div 
                                initial={{ opacity: 0, y: 30 }} 
                                animate={{ opacity: 1, y: 0 }} 
                                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                className="text-left w-full min-w-0 overflow-hidden"
                            >
                                <div className="w-full overflow-hidden min-w-0">
                                    <MarqueeText className="text-2xl md:text-5xl font-brand bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent tracking-tighter leading-tight mb-4 drop-shadow-lg pb-1">
                                        {formatDisplayTitle(artist.name)}
                                    </MarqueeText>
                                </div>

                                {artist.role && (
                                    <p className="text-sm font-bold text-red-500 uppercase tracking-widest mb-4 opacity-90">
                                        {artist.role}
                                    </p>
                                )}

                                {/* Action buttons */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handlePlayTopTracks}
                                        className="flex-1 md:flex-initial h-12 px-10 rounded-xl bg-[#1c1c1e] border border-white/5 text-white hover:bg-[#2c2c2e] transition-all flex items-center justify-center gap-2 font-bold text-[15px] active:scale-95"
                                    >
                                        {isPlaying && isArtistActive ? (
                                            <Pause size={18} className="text-red-500" fill="currentColor" />
                                        ) : (
                                            <Play size={18} className="text-red-500" fill="currentColor" />
                                        )}
                                        {isPlaying && isArtistActive ? 'Pause' : 'Play'}
                                    </button>

                                    <button 
                                        onClick={handlePlayTopTracks} // Add shuffle logic here if needed
                                        className="flex-1 md:flex-initial h-12 px-10 rounded-xl bg-[#1c1c1e] border border-white/5 text-white hover:bg-[#2c2c2e] transition-all flex items-center justify-center gap-2 font-bold text-[15px] active:scale-95"
                                    >
                                        <Shuffle size={18} className="text-red-500" fill="currentColor" />
                                        Shuffle
                                    </button>
                                    
                                    <button 
                                        onClick={openTrackPicker}
                                        className="hidden md:flex h-12 px-6 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all items-center gap-2 font-bold text-sm"
                                    >
                                        <Plus size={18} className="text-red-500" />
                                        Add
                                    </button>

                                    <button className="hidden md:flex w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all items-center justify-center">
                                        <Share size={18} />
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>

                {/* ── MAIN CONTENT ─────────────────────────────────── */}
                <div className="px-6 md:px-12 mt-12 space-y-16">

                    {/* POPULAR TRACKS */}
                    {artist.topTracks && artist.topTracks.length > 0 && (
                        <section className="space-y-4">
                            <h2 className="text-2xl font-black text-white tracking-tight">Popular</h2>
                            <div className="flex flex-col space-y-0.5">
                                {artist.topTracks.map((track: any, index: number) => {
                                    const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                                    const isActive = currentTrack?.id === track.id;

                                    return (
                                        <motion.div
                                            key={track.id}
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
                                            <div className="w-6 flex items-center justify-center shrink-0">
                                                {isTrackPlaying ? (
                                                    <Visualizer />
                                                ) : (
                                                    <span className={cn(
                                                        "text-sm font-bold transition-colors",
                                                        isActive ? "text-red-500" : "text-white/20 group-hover:text-white/40"
                                                    )}>
                                                        {index + 1}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-1 flex-col min-w-0">
                                                <div 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/track/${track.id}`);
                                                    }}
                                                    className={cn(
                                                        "text-[15px] font-bold truncate transition-colors leading-snug cursor-pointer hover:underline hover:text-brand",
                                                        isActive ? "text-red-500" : "text-white group-hover:text-red-500"
                                                    )}
                                                >
                                                    {formatDisplayTitle(track.title)}
                                                </div>
                                                <div className="text-[12px] text-white/40 font-medium">
                                                    {(track.streams || 0).toLocaleString()} streams
                                                </div>
                                            </div>

                                            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                                <button 
                                                    onClick={(e) => toggleLike(track.id, e)}
                                                    className={cn("p-2 transition-colors", likedTrackIds?.includes(track.id) ? "text-brand" : "text-white/20 hover:text-red-500")}
                                                >
                                                    <Heart size={18} className={likedTrackIds?.includes(track.id) ? "fill-current" : ""} />
                                                </button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="p-2 text-white/20 hover:text-white transition-colors outline-none bg-transparent">
                                                            <MoreHorizontal size={20} />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent className="w-56 bg-[#0E0E10]/95 backdrop-blur-xl border-white/10" align="end">
                                                        <DropdownMenuItem onClick={() => openDownloadModal(track)} className="cursor-pointer focus:bg-white/5 py-2.5">
                                                            <Download size={14} className="mr-2 opacity-70" /> Download
                                                        </DropdownMenuItem>

                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="cursor-pointer focus:bg-white/5 py-2.5">
                                                                <Plus size={14} className="mr-2 opacity-70" /> Add to Playlist
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuPortal>
                                                                <DropdownMenuSubContent className="bg-[#0E0E10]/95 backdrop-blur-xl border-white/10 w-48">
                                                                    {playlists?.map((p: any) => (
                                                                        <DropdownMenuItem 
                                                                            key={p.id} 
                                                                            className="cursor-pointer focus:bg-white/5 py-2"
                                                                            onClick={(e) => addToPlaylist(track.id, p.id, e)}
                                                                        >
                                                                            {p.name}
                                                                        </DropdownMenuItem>
                                                                    ))}
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuPortal>
                                                        </DropdownMenuSub>                                                        

                                                        <DropdownMenuSeparator className="bg-white/5" />
                                                        <DropdownMenuItem onClick={(e) => shareTrack(track.id, e)} className="cursor-pointer focus:bg-white/5 py-2.5">
                                                            <Share2 size={14} className="mr-2 opacity-70" /> Share Link
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* DISCOGRAPHY */}
                    {artist.albums && artist.albums.length > 0 && (
                        <section className="space-y-5">
                            <div className="flex items-center gap-4">
                                <h2 className="text-2xl md:font-brand text-white tracking-tight">Discography</h2>
                                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20">{artist.albums.length} releases</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                                {artist.albums.map((album: any, idx: number) => (
                                    <motion.div
                                        key={album.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: idx * 0.03 }}
                                        className="group"
                                    >
                                        <Link href={`/album/${album.id}`} className="block">
                                            <div className="aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-white/5 relative group-hover:border-red-500/30 transition-all duration-500 shadow-xl">
                                                {album.coverUrl ? (
                                                    <img
                                                        src={getMediaUrl(album.coverUrl)}
                                                        onError={(e) => {
                                                            const el = e.target as HTMLImageElement;
                                                            if (!el.src.includes('proxy-image')) el.src = proxy(album.coverUrl);
                                                        }}
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                        alt={album.title}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Disc3 size={24} className="text-zinc-700" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="mt-2.5">
                                                <p className="text-[13px] font-bold text-white truncate group-hover:text-red-500 transition-colors leading-tight">{formatDisplayTitle(album.title)}</p>
                                                <p className="text-[11px] font-medium text-white/30 mt-0.5">
                                                    {new Date(album.releaseDate || album.createdAt).getFullYear()}
                                                </p>
                                            </div>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* ── ABOUT FOOTER CARD ─────────────────────────────── */}
                <div className="mt-8 px-6 md:px-12 pb-6">
                    <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] overflow-hidden">
                        <div className="px-6 md:px-8 py-5">
                            <div className="flex flex-col sm:flex-row sm:items-start gap-6">

                                {/* Avatar + name stacked below it */}
                                <div className="shrink-0 flex flex-col items-center gap-2">
                                    <div className="w-36 h-36 rounded-full overflow-hidden border border-white/10 bg-zinc-800">
                                        {imageUrl ? (
                                            <img
                                                src={getMediaUrl(imageUrl)}
                                                onError={(e) => {
                                                    const el = e.target as HTMLImageElement;
                                                    if (!el.src.includes('proxy-image')) el.src = proxy(imageUrl || '');
                                                }}
                                                className="w-full h-full object-cover"
                                                alt={artist.name}
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-white/40 font-bold text-xl">
                                                {artist.name?.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    {/* Name + verified directly under avatar */}
                                    <div className="text-center">
                                        <p className="text-white font-semibold text-sm leading-tight">{formatDisplayTitle(artist.name)}</p>
                                        {artist.verified && (
                                            <div className="flex items-center justify-center gap-1 mt-0.5">
                                                <BadgeCheck size={11} style={{ color: '#fb7185' }} />
                                                <span className="text-[10px] text-rose-400">Verified Artist</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="hidden sm:block w-px self-stretch bg-white/[0.06]" />

                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-2">About</p>
                                    <p className="text-sm text-white/50 leading-relaxed mb-5">
                                        {artist.bio || "No biography recorded for this artist yet."}
                                    </p>
                                    {/* Born / Role / Tracks — right side, below bio */}
                                    {(formattedBirthDate || artist.role || artist.trackCount !== undefined) && (
                                        <div className="flex flex-wrap gap-6 pt-4 border-t border-white/[0.06]">
                                            {formattedBirthDate && (
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">Born</p>
                                                    <p className="text-sm font-medium text-white/60">{formattedBirthDate}</p>
                                                    {age && <p className="text-[10px] text-white/30 mt-0.5">{age} years old</p>}
                                                </div>
                                            )}
                                            {artist.role && (
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">Role</p>
                                                    <p className="text-sm font-medium text-white/60">{artist.role}</p>
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">Tracks</p>
                                                <p className="text-sm font-medium text-white/60">{artist.trackCount || 0}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── TRACK PICKER MODAL ─────────────────────────────── */}
            <AnimatePresence>
                {showTrackPicker && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
                            onClick={() => setShowTrackPicker(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[540px] z-50 bg-[#111] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                                <div>
                                    <p className="text-white font-semibold text-sm">Add Tracks to {artist.name}</p>
                                    <p className="text-[10px] text-white/30 mt-0.5">Click a track to assign it to this artist</p>
                                </div>
                                <button
                                    onClick={() => setShowTrackPicker(false)}
                                    className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white transition-all"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="px-5 py-3 border-b border-white/[0.06]">
                                <div className="relative">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Search tracks or artists..."
                                        value={trackSearch}
                                        onChange={(e) => setTrackSearch(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 outline-none focus:border-brand/50 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto py-2 px-2">
                                {tracksLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <ZenLoading size="sm" />
                                    </div>
                                ) : filteredTracks.length === 0 ? (
                                    <div className="flex items-center justify-center py-12 text-white/20 text-sm">No tracks found</div>
                                ) : (
                                    filteredTracks.map((track) => {
                                        const isCurrentArtist = (track.artist?.name || track.artistName) === artist.name;
                                        const isJustDone = justAssigned === track.id;
                                        const isBusy = assigning === track.id;
                                        const cover = track.coverUrl || track.album?.coverUrl;
                                        return (
                                            <button
                                                key={track.id}
                                                onClick={() => !isCurrentArtist && assignTrack(track.id)}
                                                disabled={isBusy || isCurrentArtist}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
                                                    isCurrentArtist ? "opacity-40 cursor-default" : "hover:bg-white/[0.05] active:scale-[0.98] cursor-pointer"
                                                )}
                                            >
                                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                                    {cover ? <img src={getMediaUrl(cover)} className="w-full h-full object-cover" alt="" /> : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Music2 size={12} className="text-zinc-600" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{formatDisplayTitle(track.title)}</p>
                                                    <p className="text-[10px] text-white/30 truncate">{formatDisplayTitle(track.artist?.name || track.artistName || 'Unknown')}</p>
                                                </div>
                                                <div className="shrink-0">
                                                    {isJustDone ? <CheckCircle2 size={16} className="text-green-400" />
                                                        : isBusy ? <ZenLoading size="sm" />
                                                            : isCurrentArtist ? <span className="text-[9px] text-white/20 font-black uppercase tracking-wider">Added</span>
                                                                : <Plus size={14} className="text-white/20" />}
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
