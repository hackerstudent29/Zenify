"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { getArtist } from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, Pause, Disc3, Music2, Heart, Share, BadgeCheck, Plus, X, Search, CheckCircle2 } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { audioEngine } from "@/lib/audio-engine";
import { cn, getMediaUrl, getTrackCover } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";

// Animated audio visualizer — 4 bars bouncing
function Visualizer() {
    return (
        <div className="flex items-end gap-[2px] h-[10px] w-5 justify-center mb-0.5">
            {[0.6, 1.0, 0.4, 0.8].map((initialH, i) => (
                <motion.span
                    key={i}
                    className="w-[4px] bg-brand rounded-full"
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
    const id = params?.id as string;
    const queryClient = useQueryClient();
    const { setTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();
    const { setPlayerMinimized } = useUIStore();

    const { data: artist, isLoading } = useQuery({
        queryKey: ['artist', id],
        queryFn: async () => {
            const res = await getArtist(id);
            return res.data;
        },
        enabled: !!id,
    });

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
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
            <div className="flex items-center justify-center min-h-[60vh]">
                <ZenLoading size="md" />
            </div>
        );
    }

    if (!artist) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-30">
                <Disc3 size={64} strokeWidth={1} />
                <p className="text-sm font-bold tracking-tight text-white/40">Artist not found</p>
            </div>
        );
    }

    const isArtistActive = artist.topTracks?.some((t: any) => t.id === currentTrack?.id);

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

    const handlePlayAlbum = async (e: React.MouseEvent, albumId: string) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            const res = await api.get(`/albums/${albumId}`);
            const data = res.data;
            
            if (data?.tracks && data.tracks.length > 0) {
                setTrack(data.tracks[0], data.tracks);
                setPlayerMinimized(false);
            }
        } catch (err) {
            console.error('Failed to play album:', err);
        }
    };

    const bannerUrl = artist.coverUrl || artist.imageUrl || null;
    const imageUrl = artist.imageUrl || null;

    const formattedBirthDate = artist.birthDate
        ? new Date(artist.birthDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    const calculateAge = (dobString: string) => {
        const dob = new Date(dobString);
        return Math.abs(new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970);
    };
    const age = artist.birthDate ? calculateAge(artist.birthDate) : null;

    const filteredTracks = Array.isArray(allTracks) ? allTracks.filter(t =>
        t.title?.toLowerCase().includes(trackSearch.toLowerCase()) ||
        (t.artist?.name || t.artistName || '').toLowerCase().includes(trackSearch.toLowerCase())
    ) : [];

    return (
        <div className="pb-28 min-h-screen w-full bg-background overflow-x-hidden">
            <div className="w-full">

                <div className="relative h-[40vh] md:h-[55vh] w-full mt-6 md:mt-8 px-4 md:px-8">
                    <div className="relative h-full w-full overflow-hidden rounded-[2rem] md:rounded-[3rem] bg-zinc-900 border border-white/5 shadow-2xl group/banner">
                        {/* Background image with hover effect */}
                        {bannerUrl ? (
                            <img
                                src={getMediaUrl(bannerUrl) || undefined}
                                onError={(e) => {
                                    const el = e.target as HTMLImageElement;
                                    if (!el.src.includes('proxy-image')) el.src = proxy(bannerUrl || '');
                                }}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-1000 group-hover/banner:scale-110"
                            />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a12] via-[#0d0d0d] to-[#0a0a1a]" />
                        )}

                    {/* Gradient overlays */}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-transparent hidden md:block" />

                        <div className="absolute inset-0 flex flex-col justify-end px-6 pb-8 md:px-12 md:pb-12">
                            <motion.div 
                                initial={{ opacity: 0, y: 30 }} 
                                animate={{ opacity: 1, y: 0 }} 
                                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                className="text-left"
                            >


                                 <div className="w-full">
                                     <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-brand tracking-tighter text-white leading-[0.9] mb-6 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] whitespace-nowrap overflow-hidden text-ellipsis">
                                         {artist.name}
                                     </h1>
                                 </div>

                            {artist.role && (
                                <p className="text-sm font-bold text-brand uppercase tracking-[0.12em] mb-3 opacity-90">
                                    {artist.role}
                                </p>
                            )}

                            {/* Stats — left-aligned, consistent column widths */}
                            <div className="flex items-start gap-8 mb-4">
                                <div className="flex flex-col min-w-[80px]">
                                    <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] mb-1.5">Monthly Listeners</span>
                                    <span className="text-lg font-brand text-white drop-shadow">{artist.monthlyListeners?.toLocaleString() || "0"}</span>
                                </div>
                                <div className="flex flex-col min-w-[60px]">
                                    <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] mb-1.5">Followers</span>
                                    <span className="text-lg font-brand text-white drop-shadow">{artist.follower_count?.toLocaleString() || "0"}</span>
                                </div>
                                <div className="hidden sm:flex flex-col min-w-[80px]">
                                    <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em] mb-1.5">Total Streams</span>
                                    <span className="text-lg font-brand text-white drop-shadow">{Number(artist.totalStreams || 0).toLocaleString()}</span>
                                 </div>
                             </div>
                             
                             {/* Action buttons */}
                             <div className="flex items-center gap-3">
                                 <button
                                     onClick={handlePlayTopTracks}
                                     className="px-7 py-3 rounded-full bg-brand text-black font-black text-xs tracking-[0.15em] shadow-xl shadow-brand/30 active:scale-95 hover:scale-105 transition-all flex items-center gap-2"
                                 >
                                     {isPlaying && isArtistActive
                                         ? <Pause size={13} fill="black" strokeWidth={0} />
                                         : <Play size={13} fill="black" strokeWidth={0} />}
                                     {isPlaying && isArtistActive ? 'PAUSE' : 'PLAY'}
                                 </button>
                                 <button className="p-3 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all">
                                     <Heart size={15} />
                                 </button>
                                 <button className="p-3 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all">
                                     <Share size={15} />
                                 </button>
                                 {/* + button to assign tracks — lives in the action bar */}
                                 <button
                                     onClick={openTrackPicker}
                                     title="Add tracks to this artist"
                                     className="p-3 rounded-full bg-white/5 border border-white/10 text-white hover:bg-brand hover:border-brand hover:text-black transition-all"
                                 >
                                     <Plus size={15} />
                                 </button>
                             </div>
                             </motion.div>
                         </div>

                         {/* 🌟 USER REQUEST: Artist Pic on Right Side Bottom of Banner */}
                         <motion.div 
                            initial={{ opacity: 0, scale: 0.8, x: 20 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className="absolute bottom-10 right-10 hidden lg:block"
                         >
                            <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-zinc-900 group-hover/banner:scale-105 transition-transform duration-700">
                                {imageUrl ? (
                                    <img
                                        src={getMediaUrl(imageUrl)}
                                        onError={(e: any) => {
                                            const el = e.target as HTMLImageElement;
                                            // Tier 1 recovery: Try proxying via our backend
                                            if (!el.src.includes('proxy-image') && imageUrl) {
                                                el.src = proxy(imageUrl);
                                            } else {
                                                // Tier 2 recovery: UI-avatars
                                                const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(artist.name)}&background=random&color=fff&size=512`;
                                                if (el.src !== fallback) el.src = fallback;
                                            }
                                        }}
                                        className="w-full h-full object-cover"
                                        alt={artist.name}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/40 font-bold text-4xl">
                                        {artist.name?.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                         </motion.div>
                     </div>
                 </div>
 
                 {/* ── MAIN CONTENT ─────────────────────────────────── */}
                 <div className="px-6 md:px-12 mt-10 space-y-14">
 
                     {/* TOP TRACKS */}
                     {artist.topTracks && artist.topTracks.length > 0 && (
                         <section className="space-y-3">
                             <h2 className="text-2xl font-brand text-white tracking-tight">Popular</h2>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                 {artist.topTracks.map((track: any, index: number) => {
                                     const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                                     const isActive = currentTrack?.id === track.id;
                                     const mins = Math.floor((track.duration || 0) / 60);
                                     const secs = (track.duration || 0) % 60;
                                     const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                                     const trackCover = track.coverUrl || track.album?.coverUrl;
 
                                     return (
                                         <motion.div
                                             key={track.id}
                                             initial={{ opacity: 0, x: -16 }}
                                             whileInView={{ opacity: 1, x: 0 }}
                                             viewport={{ once: true }}
                                             transition={{ delay: index * 0.03 }}
                                             onClick={() => handlePlayTrack(track)}
                                             // No grey bg when active — clean look
                                             className="group flex items-center gap-4 px-4 py-3 rounded-2xl transition-all cursor-pointer hover:bg-white/[0.04] active:scale-[0.98]"
                                         >
                                             {/* Track number or visualizer — no grey, just the icon */}
                                             <div className="w-5 flex items-center justify-center shrink-0">
                                                 {isTrackPlaying ? (
                                                     <Visualizer />
                                                 ) : (
                                                     <span className={cn(
                                                         "text-xs font-medium transition-colors",
                                                         isActive ? "text-brand" : "text-white/25 group-hover:text-brand"
                                                     )}>
                                                         {index + 1}
                                                     </span>
                                                 )}
                                             </div>
 
                                             <div className="flex flex-1 flex-col min-w-0">
                                                 <span className={cn(
                                                     "text-sm font-bold tracking-tight",
                                                     isActive ? "text-brand" : "text-white group-hover:text-brand transition-colors"
                                                 )}>
                                                     {track.title}
                                                 </span>
                                                 <span className="text-[10px] text-white/30 font-medium mt-0.5">
                                                     {artist.name} • {(track.streams || 0).toLocaleString()} streams
                                                 </span>
                                             </div>
 
                                             <div className={cn(
                                                 "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300",
                                                 isActive && "opacity-100"
                                             )}>
                                                 <button className="p-2 text-white/30 hover:text-brand transition-colors">
                                                     <Heart size={14} />
                                                 </button>
                                                 <button className="p-2 text-white/30 hover:text-white transition-colors">
                                                     <Plus size={14} />
                                                 </button>
                                                 <span className="w-12 text-right text-[11px] font-bold text-white/20 tabular-nums pr-2 group-hover:text-white/40 transition-colors">
                                                     {durationStr}
                                                 </span>
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
                                <h2 className="text-2xl font-brand text-white tracking-tight">Discography</h2>
                                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20">{artist.albums.length} releases</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                {artist.albums.map((album: any, idx: number) => (
                                    <motion.div
                                        key={album.id}
                                        initial={{ opacity: 0, scale: 0.92 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: idx * 0.03 }}
                                        className="group"
                                    >
                                        <Link href={`/album/${album.id}`} className="block">
                                            <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-800 border border-white/5 shadow-lg relative group-hover:border-brand/30 transition-all duration-300">
                                                {album.coverUrl ? (
                                                    <img
                                                        src={getMediaUrl(album.coverUrl)}
                                                        onError={(e) => {
                                                            const el = e.target as HTMLImageElement;
                                                            if (!el.src.includes('proxy-image')) el.src = proxy(album.coverUrl);
                                                        }}
                                                        className="w-full h-full object-cover transition-transform duration-500"
                                                        alt={album.title}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Disc3 size={24} className="text-zinc-600" />
                                                    </div>
                                                )}
                                                
                                                {/* Grey overlay on hover */}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                                <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-10">
                                                    <button 
                                                        onClick={(e) => handlePlayAlbum(e, album.id)}
                                                        className="w-11 h-11 rounded-full bg-transparent flex items-center justify-center text-red-500 hover:scale-105 active:scale-95 transition-all"
                                                    >
                                                        <Play size={24} fill="currentColor" strokeWidth={0} className="ml-1 drop-shadow-2xl" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-2.5 px-0.5">
                                                <p className="text-xs font-medium text-white truncate group-hover:text-brand transition-colors">{album.title}</p>
                                                <p className="text-[10px] text-white/30 mt-0.5">
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
                                        <p className="text-white font-semibold text-sm leading-tight">{artist.name}</p>
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
                                                    <p className="text-sm font-medium text-white truncate">{track.title}</p>
                                                    <p className="text-[10px] text-white/30 truncate">{track.artist?.name || track.artistName || 'Unknown'}</p>
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
