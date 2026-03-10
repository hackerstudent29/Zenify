"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getArtist } from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, Pause, Disc3, Clock, MoreHorizontal, Music2, Heart, Share, Calendar, Info, BadgeCheck } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { getMediaUrl, cn } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";

export default function ArtistPage() {
    const params = useParams();
    const id = params?.id as string;
    const { setTrack, setQueue, currentTrack, isPlaying, togglePlay } = usePlayerStore();
    const { setPlayerMinimized } = useUIStore();
    const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);

    const { data: artist, isLoading } = useQuery({
        queryKey: ['artist', id],
        queryFn: async () => {
            const res = await getArtist(id);
            return res.data;
        },
        enabled: !!id,
    });

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

    const handlePlayTopTracks = () => {
        if (artist.topTracks?.length > 0) {
            setQueue(artist.topTracks);
            setTrack(artist.topTracks[0]);
            if (!isPlaying) togglePlay();
            setPlayerMinimized(false);
        }
    };

    const handlePlayTrack = (track: any) => {
        if (currentTrack?.id === track.id) {
            togglePlay();
        } else {
            setQueue(artist.topTracks);
            setTrack(track);
            setPlayerMinimized(false);
        }
    };

    const imageUrl = getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${artist.name}&size=512&background=random`;
    const bannerUrl = getMediaUrl(artist.coverUrl) || imageUrl;

    const formattedBirthDate = artist.birthDate
        ? new Date(artist.birthDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    const calculateAge = (dobString: string) => {
        const dob = new Date(dobString);
        const diff = Date.now() - dob.getTime();
        const ageDate = new Date(diff);
        return Math.abs(ageDate.getUTCFullYear() - 1970);
    };

    const age = artist.birthDate ? calculateAge(artist.birthDate) : null;

    return (
        <div className="pb-44 min-h-screen w-full bg-background overflow-x-hidden">
            <div className="w-full">
                {/* ── HERO BANNER ───────────────────────────────────── */}
                <div className="relative h-[50vh] md:h-[65vh] w-full overflow-hidden">
                    <img
                        src={bannerUrl}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-[10s] hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-transparent hidden md:block" />

                    <div className="absolute bottom-0 left-0 w-full px-6 pb-8 md:px-12 md:pb-16">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-4xl"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                {artist.verified && (
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 backdrop-blur-md border border-blue-500/30">
                                        <BadgeCheck size={14} className="text-blue-400 fill-blue-400" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">Verified Identity</span>
                                    </div>
                                )}
                                <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Legacy Titan</span>
                                </div>
                            </div>

                            <h1 className="text-6xl md:text-8xl lg:text-[10rem] font-brand tracking-tighter text-white leading-[0.85] mb-4 drop-shadow-2xl">
                                {artist.name}
                            </h1>

                            {artist.role && (
                                <p className="text-lg md:text-2xl font-bold text-brand uppercase tracking-[0.1em] mb-8 opacity-90">
                                    {artist.role}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-8 mb-10">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Monthly Listeners</span>
                                    <span className="text-2xl font-brand text-white">{artist.monthlyListeners?.toLocaleString() || "0"}</span>
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Followers</span>
                                    <span className="text-2xl font-brand text-white">{artist.follower_count?.toLocaleString() || "0"}</span>
                                </div>
                                <div className="w-px h-8 bg-white/10 hidden sm:block" />
                                <div className="flex flex-col hidden sm:flex">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Total Frequency</span>
                                    <span className="text-2xl font-brand text-white">{artist.totalStreams?.toLocaleString() || "0"}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handlePlayTopTracks}
                                    className="px-12 py-5 rounded-full bg-brand text-black font-black text-xs tracking-[0.15em] shadow-2xl shadow-brand/40 active:scale-95 hover:scale-105 transition-all flex items-center justify-center gap-3"
                                >
                                    <Play size={18} fill="black" strokeWidth={0} />
                                    INITIALIZE SIGNAL
                                </button>
                                <button className="p-5 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all backdrop-blur-xl">
                                    <Heart size={20} />
                                </button>
                                <button className="p-5 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all backdrop-blur-xl">
                                    <Share size={20} />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* ── CONTENT SECTION ────────────────────────────────── */}
                <div className="px-6 md:px-12 mt-16 grid grid-cols-1 lg:grid-cols-[2fr_1.1fr] gap-16">

                    {/* LEFT COLUMN: TOP TRACKS & SINGLES */}
                    <div className="space-y-16">
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-3xl font-brand text-white tracking-tight italic">Popular Resonances</h2>
                                <button className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-brand transition-colors">View Timeline</button>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                {artist.topTracks?.map((track: any, index: number) => {
                                    const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                                    const isActive = currentTrack?.id === track.id;
                                    const mins = Math.floor((track.duration || 0) / 60);
                                    const secs = (track.duration || 0) % 60;
                                    const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;

                                    return (
                                        <motion.div
                                            key={track.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            whileInView={{ opacity: 1, x: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: index * 0.05 }}
                                            onClick={() => handlePlayTrack(track)}
                                            className={cn(
                                                "group flex items-center gap-6 px-5 py-4 rounded-[1.5rem] transition-all cursor-pointer active:scale-[0.98]",
                                                isActive ? "bg-white/[0.08] shadow-2xl" : "hover:bg-white/[0.04]"
                                            )}
                                        >
                                            <div className="w-6 text-center text-[10px] font-black text-white/10 group-hover:text-brand transition-colors">
                                                {String(index + 1).padStart(2, '0')}
                                            </div>

                                            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 border border-white/5 relative flex-shrink-0 group-hover:scale-105 transition-transform">
                                                <img src={getMediaUrl(track.coverUrl)} className="w-full h-full object-cover" alt="" />
                                                {isTrackPlaying && (
                                                    <div className="absolute inset-0 bg-brand/30 backdrop-blur-[2px] flex items-center justify-center">
                                                        <Pause size={20} fill="white" strokeWidth={0} />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-1 flex-col min-w-0">
                                                <span className={cn("text-base font-bold truncate tracking-tight", isActive ? "text-brand" : "text-white group-hover:text-brand transition-colors")}>
                                                    {track.title}
                                                </span>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                                                        {track.plays?.toLocaleString() || "0"} Cycles
                                                    </span>
                                                    {track.albumTitle && (
                                                        <>
                                                            <div className="w-1 h-1 rounded-full bg-white/10" />
                                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest truncate max-w-[150px]">
                                                                {track.albumTitle}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="text-[11px] font-black text-white/20 tabular-nums hidden sm:block">
                                                {durationStr}
                                            </div>

                                            <button className="opacity-0 group-hover:opacity-100 p-2 text-white/40 hover:text-white transition-all transform group-hover:rotate-90">
                                                <MoreHorizontal size={20} />
                                            </button>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Recent Releases Section */}
                        {artist.albums && artist.albums.length > 0 && (
                            <section className="space-y-6">
                                <h2 className="text-3xl font-brand text-white tracking-tight italic">Evolving Artifacts</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {artist.albums.slice(0, 2).map((album: any) => (
                                        <Link key={album.id} href={`/album/${album.id}`} className="group relative aspect-[3/1] rounded-[2rem] overflow-hidden bg-white/5 border border-white/5 hover:border-brand/40 transition-all p-6 flex items-center gap-6">
                                            <div className="h-full aspect-square rounded-2xl overflow-hidden border border-white/10 group-hover:scale-105 transition-transform">
                                                <img src={getMediaUrl(album.coverUrl)} className="w-full h-full object-cover" alt={album.title} />
                                            </div>
                                            <div className="flex flex-col justify-center min-w-0">
                                                <span className="text-[10px] font-black text-brand uppercase tracking-[0.2em] mb-1">Latest Release</span>
                                                <h3 className="text-lg font-bold text-white truncate group-hover:text-brand transition-colors">{album.title}</h3>
                                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-1">
                                                    {new Date(album.releaseDate || album.createdAt).getFullYear()} • Album
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>

                    {/* RIGHT COLUMN: ABOUT & STATS */}
                    <div className="space-y-10">
                        {/* About Section - Visualized */}
                        <section className="premium-card rounded-[2.5rem] bg-zinc-900/40 border border-white/5 relative overflow-hidden group">
                            <div className="absolute inset-0 opacity-20 pointer-events-none">
                                <img src={imageUrl} alt="" className="w-full h-full object-cover blur-3xl grayscale" />
                            </div>

                            <div className="relative p-10 z-10">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                                        <Info size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Titan Dossier</h3>
                                        <p className="text-xl font-brand text-white">About the Artist</p>
                                    </div>
                                </div>

                                <p className="text-base text-white/70 leading-relaxed font-medium mb-12 italic">
                                    "{artist.bio || "This entity has yet to record its canonical history in the Zenify registry."}"
                                </p>

                                <div className="space-y-6">
                                    {formattedBirthDate && (
                                        <div className="flex items-center gap-5">
                                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-brand transition-colors">
                                                <Calendar size={22} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Materialization</p>
                                                <div className="flex items-center gap-3">
                                                    <p className="text-base font-bold text-white">{formattedBirthDate}</p>
                                                    {age && <span className="text-[9px] px-2 py-0.5 rounded-full bg-brand/10 text-brand font-black">{age} SOLAR UNITS</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-brand transition-colors">
                                            <Music2 size={22} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Registry Status</p>
                                            <p className="text-base font-bold text-white uppercase tracking-tight">
                                                {artist.verified ? "Canonical Artifact" : "Standard Entry"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Social/Collab Placeholder */}
                        <section className="premium-card p-10 rounded-[2.5rem] bg-brand/5 border border-brand/10 backdrop-blur-3xl group">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-brand/60 mb-8">Network Connections</h3>
                            <div className="flex flex-wrap gap-4">
                                {['EDM', 'Soulful', 'Cinematic', 'Electronic'].map((genre) => (
                                    <span key={genre} className="px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-brand hover:border-brand/40 transition-all cursor-default">
                                        {genre}
                                    </span>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* ── FULL WIDTH DISCOGRAPHY ────────────────────────── */}
                <div className="px-6 md:px-12 mt-32">
                    <div className="flex items-center justify-between mb-12">
                        <h2 className="text-4xl font-brand text-white tracking-tight italic">Complete Collections</h2>
                        <div className="h-[2px] flex-1 bg-gradient-to-r from-white/10 to-transparent mx-12 hidden md:block" />
                        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/20">{artist.albums?.length || 0} Artifacts</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8 pb-32">
                        {artist.albums?.map((album: any, idx: number) => (
                            <motion.div
                                key={album.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                whileHover={{ y: -12 }}
                                className="group"
                            >
                                <Link href={`/album/${album.id}`} className="block">
                                    <div className="aspect-square rounded-[2.5rem] overflow-hidden bg-zinc-900 border border-white/5 shadow-2xl transition-all duration-700 group-hover:shadow-brand/30 group-hover:border-brand/50 relative">
                                        <img src={getMediaUrl(album.coverUrl)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={album.title} />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Disc3 size={40} className="text-white animate-spin-slow" />
                                        </div>
                                    </div>
                                    <div className="mt-6 px-4 text-center md:text-left">
                                        <p className="text-base font-bold text-white truncate group-hover:text-brand transition-colors tracking-tight">{album.title}</p>
                                        <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em] mt-2">
                                            {new Date(album.releaseDate || album.createdAt).getFullYear()} • Phase Artifact
                                        </p>
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
