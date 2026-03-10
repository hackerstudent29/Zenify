"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getArtist } from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, Pause, Disc3, Music2, Heart, Share, BadgeCheck, Plus, X, Search, CheckCircle2 } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";

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
            const res = await fetch(`${API_URL}/tracks?limit=500`);
            const data = await res.json();
            setAllTracks(data.items || data || []);
        } catch { }
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

    // Play/pause handlers — use setTrack with contextTracks (atomic, no race condition)
    const isArtistActive = artist.topTracks?.some((t: any) => t.id === currentTrack?.id);

    const handlePlayTopTracks = () => {
        if (!artist.topTracks?.length) return;
        if (isArtistActive) {
            togglePlay(); // same artist — toggle
        } else {
            setTrack(artist.topTracks[0], artist.topTracks); // new artist — atomic play
            setPlayerMinimized(false);
        }
    };

    const handlePlayTrack = (track: any) => {
        if (currentTrack?.id === track.id) {
            togglePlay();
        } else {
            setTrack(track, artist.topTracks);
            setPlayerMinimized(false);
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

    const filteredTracks = allTracks.filter(t =>
        t.title?.toLowerCase().includes(trackSearch.toLowerCase()) ||
        (t.artist?.name || t.artistName || '').toLowerCase().includes(trackSearch.toLowerCase())
    );

    return (
        <div className="pb-44 min-h-screen w-full bg-background overflow-x-hidden">
            <div className="w-full">

                {/* ── HERO BANNER (image only, no overflow-hidden on content) ──────── */}
                <div className="relative h-[36vh] md:h-[44vh] w-full bg-zinc-900">
                    {bannerUrl ? (
                        <img
                            src={bannerUrl}
                            onError={(e) => {
                                const el = e.target as HTMLImageElement;
                                if (!el.src.includes('proxy-image')) el.src = proxy(bannerUrl);
                            }}
                            alt=""
                            className="w-full h-full object-cover object-top"
                        />
                    ) : (
                        <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #1a0a12 0%, #0d0d0d 50%, #0a0a1a 100%)' }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background/30 via-transparent to-transparent hidden md:block" />
                </div>

                {/* ── HERO TEXT (outside overflow-hidden so nothing clips) ────────── */}
                <div className="px-6 md:px-12 -mt-16 md:-mt-24 relative z-10">
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-left">

                        {artist.verified && (
                            <div className="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20">
                                <BadgeCheck size={12} style={{ color: '#fb7185' }} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">Verified Artist</span>
                            </div>
                        )}

                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-brand tracking-tighter text-white leading-none mb-2 drop-shadow-2xl whitespace-nowrap overflow-hidden text-ellipsis">
                            {artist.name}
                        </h1>

                        {artist.role && (
                            <p className="text-sm font-bold text-brand uppercase tracking-[0.12em] mb-4 opacity-90">
                                {artist.role}
                            </p>
                        )}

                        <div className="flex flex-wrap items-end gap-6 mb-5">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-0.5">Monthly Listeners</span>
                                <span className="text-lg font-brand text-white">{artist.monthlyListeners?.toLocaleString() || "0"}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-0.5">Followers</span>
                                <span className="text-lg font-brand text-white">{artist.follower_count?.toLocaleString() || "0"}</span>
                            </div>
                            <div className="hidden sm:flex flex-col">
                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-0.5">Total Streams</span>
                                <span className="text-lg font-brand text-white">{artist.totalStreams?.toLocaleString() || "0"}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mb-10">
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
                        </div>
                    </motion.div>
                </div>

                {/* ── MAIN CONTENT ─────────────────────────────────── */}
                <div className="px-6 md:px-12 space-y-14">

                    {/* TOP TRACKS */}
                    {artist.topTracks && artist.topTracks.length > 0 && (
                        <section className="space-y-5">
                            <h2 className="text-2xl font-brand text-white tracking-tight italic">Popular</h2>
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
                                            className={cn(
                                                "group flex items-center gap-4 px-4 py-3 rounded-2xl transition-all cursor-pointer active:scale-[0.98]",
                                                isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                                            )}
                                        >
                                            <div className="w-5 text-center text-xs font-medium text-white/20 group-hover:text-brand transition-colors shrink-0">
                                                {index + 1}
                                            </div>
                                            <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-800 border border-white/5 relative flex-shrink-0">
                                                {trackCover ? (
                                                    <img
                                                        src={trackCover}
                                                        onError={(e) => {
                                                            const el = e.target as HTMLImageElement;
                                                            if (!el.src.includes('proxy-image')) el.src = proxy(trackCover);
                                                        }}
                                                        className="w-full h-full object-cover"
                                                        alt=""
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                                                        <Music2 size={14} className="text-zinc-600" />
                                                    </div>
                                                )}
                                                {isTrackPlaying && (
                                                    <div className="absolute inset-0 bg-brand/30 flex items-center justify-center">
                                                        <Pause size={14} fill="white" strokeWidth={0} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-1 flex-col min-w-0">
                                                <span className={cn("text-sm font-medium truncate", isActive ? "text-brand" : "text-white")}>
                                                    {track.title}
                                                </span>
                                                <span className="text-[10px] text-white/30 mt-0.5">
                                                    {(track.plays || 0).toLocaleString()} plays
                                                </span>
                                            </div>
                                            <span className="text-xs text-white/20 tabular-nums hidden sm:block shrink-0">
                                                {durationStr}
                                            </span>
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
                                <h2 className="text-2xl font-brand text-white tracking-tight italic">Discography</h2>
                                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20">{artist.albums.length} releases</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-5">
                                {artist.albums.map((album: any, idx: number) => (
                                    <motion.div
                                        key={album.id}
                                        initial={{ opacity: 0, scale: 0.92 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: idx * 0.03 }}
                                        whileHover={{ y: -6 }}
                                        className="group"
                                    >
                                        <Link href={`/album/${album.id}`} className="block">
                                            <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-800 border border-white/5 shadow-lg relative group-hover:border-brand/30 transition-all duration-300">
                                                {album.coverUrl ? (
                                                    <img
                                                        src={album.coverUrl}
                                                        onError={(e) => {
                                                            const el = e.target as HTMLImageElement;
                                                            if (!el.src.includes('proxy-image')) el.src = proxy(album.coverUrl);
                                                        }}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        alt={album.title}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Disc3 size={24} className="text-zinc-600" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Play size={20} fill="white" strokeWidth={0} />
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
                <div className="mt-16 px-6 md:px-12 pb-16">
                    <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] overflow-hidden">
                        <div className="px-6 md:px-8 py-8">

                            {/* Top: avatar + name + bio */}
                            <div className="flex flex-col sm:flex-row sm:items-start gap-6">

                                {/* Avatar with "+" button */}
                                <div className="flex items-start gap-4 shrink-0">
                                    <div className="relative">
                                        <div className="w-20 h-20 rounded-full overflow-hidden border border-white/10 bg-zinc-800">
                                            {imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    onError={(e) => {
                                                        const el = e.target as HTMLImageElement;
                                                        if (!el.src.includes('proxy-image')) el.src = proxy(imageUrl);
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
                                        {/* + button to assign tracks */}
                                        <button
                                            onClick={openTrackPicker}
                                            title="Add tracks to this artist"
                                            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand border-2 border-background flex items-center justify-center text-black hover:scale-110 active:scale-95 transition-transform shadow-lg"
                                        >
                                            <Plus size={14} strokeWidth={3} />
                                        </button>
                                    </div>

                                    <div className="pt-1">
                                        <p className="text-white font-semibold text-sm">{artist.name}</p>
                                        {artist.verified && (
                                            <div className="flex items-center gap-1 mt-1">
                                                <BadgeCheck size={11} style={{ color: '#fb7185' }} />
                                                <span className="text-[10px] text-rose-400">Verified Artist</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Vertical divider */}
                                <div className="hidden sm:block w-px self-stretch bg-white/[0.06]" />

                                {/* Bio */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-2">About</p>
                                    <p className="text-sm text-white/50 leading-relaxed">
                                        {artist.bio || "No biography recorded for this artist yet."}
                                    </p>
                                </div>
                            </div>

                            {/* Bottom: meta stats */}
                            {(formattedBirthDate || artist.role || artist.trackCount !== undefined) && (
                                <div className="mt-6 pt-6 border-t border-white/[0.06] flex flex-wrap gap-8">
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
                                    <div className="flex items-center justify-center py-12 text-white/20 text-sm">
                                        No tracks found
                                    </div>
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
                                                    isCurrentArtist
                                                        ? "opacity-40 cursor-default"
                                                        : "hover:bg-white/[0.05] active:scale-[0.98] cursor-pointer"
                                                )}
                                            >
                                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                                    {cover ? (
                                                        <img src={cover} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Music2 size={12} className="text-zinc-600" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{track.title}</p>
                                                    <p className="text-[10px] text-white/30 truncate">
                                                        {track.artist?.name || track.artistName || 'Unknown'}
                                                    </p>
                                                </div>
                                                <div className="shrink-0">
                                                    {isJustDone ? (
                                                        <CheckCircle2 size={16} className="text-green-400" />
                                                    ) : isBusy ? (
                                                        <ZenLoading size="sm" />
                                                    ) : isCurrentArtist ? (
                                                        <span className="text-[9px] text-white/20 font-black uppercase tracking-wider">Added</span>
                                                    ) : (
                                                        <Plus size={14} className="text-white/20" />
                                                    )}
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
