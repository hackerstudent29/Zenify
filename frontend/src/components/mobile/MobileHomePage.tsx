"use client";

/**
 * MobileHomePage — Separate mobile-only layout for the Home page.
 * Desktop layout is untouched in app/page.tsx.
 */

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { Play, Pause, ChevronRight, Download, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getMediaUrl } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";

function MiniTrackCard({ track, index }: { track: Track; index: number }) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const isActive = currentTrack?.id === track.id;
    const isActuallyPlaying = isActive && isPlaying;

    const handlePlay = () => {
        useUIStore.getState().setPlayerMinimized(false);
        if (isActive) togglePlay();
        else setTrack(track);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="flex items-center gap-3 p-2.5 rounded-2xl active:bg-white/10 transition-colors cursor-pointer"
            onClick={handlePlay}
        >
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-lg">
                <img
                    src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200"}
                    className="w-full h-full object-cover"
                    alt=""
                />
                {isActuallyPlaying && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex items-end gap-[2px] h-4">
                            {[0.2, 0.4, 0.1, 0.5].map((delay, i) => (
                                <motion.div
                                    key={i}
                                    animate={{ height: ["30%", "100%", "30%"] }}
                                    transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                    className="w-[3px] bg-rose-500 rounded-full"
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-bold truncate leading-tight ${isActive ? "text-rose-500" : "text-white"}`}>
                    {track.title}
                </p>
                <p className="text-[11px] text-white/40 font-medium truncate mt-0.5">
                    {track.artist?.name}
                </p>
            </div>

            <button
                onClick={(e) => { e.stopPropagation(); handlePlay(); }}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${isActuallyPlaying ? "bg-rose-500 text-white" : "bg-white/10 text-white"}`}
            >
                {isActuallyPlaying ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
            </button>
        </motion.div>
    );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
    return (
        <div className="flex items-center justify-between mb-3 px-4">
            <h2 className="text-base font-brand text-white">{title}</h2>
            {href && (
                <Link href={href} className="text-[10px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1">
                    See all <ChevronRight size={10} />
                </Link>
            )}
        </div>
    );
}

function HorizontalScrollCards({ tracks }: { tracks: Track[] }) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();

    return (
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1">
            {tracks.map((track, i) => {
                const isActive = currentTrack?.id === track.id;
                const isActuallyPlaying = isActive && isPlaying;

                return (
                    <motion.div
                        key={track.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="shrink-0 w-36 cursor-pointer"
                        onClick={() => {
                            useUIStore.getState().setPlayerMinimized(false);
                            if (isActive) togglePlay();
                            else setTrack(track);
                        }}
                    >
                        <div className="relative w-36 h-36 rounded-2xl overflow-hidden shadow-xl mb-2">
                            <img
                                src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300"}
                                className="w-full h-full object-cover"
                                alt=""
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            {isActuallyPlaying && (
                                <div className="absolute bottom-2.5 left-2.5 flex items-end gap-[2px] h-3">
                                    {[0.2, 0.4, 0.1, 0.5].map((delay, j) => (
                                        <motion.div
                                            key={j}
                                            animate={{ height: ["30%", "100%", "30%"] }}
                                            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                            className="w-[3px] bg-rose-500 rounded-full"
                                        />
                                    ))}
                                </div>
                            )}
                            {!isActuallyPlaying && (
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
                                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                        <Play size={16} fill="white" className="text-white ml-0.5" />
                                    </div>
                                </div>
                            )}
                        </div>
                        <p className={`text-[12px] font-bold truncate leading-tight ${isActive ? "text-rose-500" : "text-white"}`}>
                            {track.title}
                        </p>
                        <p className="text-[10px] text-white/40 font-medium truncate mt-0.5">
                            {track.artist?.name}
                        </p>
                    </motion.div>
                );
            })}
        </div>
    );
}

export function MobileHomePage() {
    const router = useRouter();
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const openDownloadModal = useUIStore(s => s.openDownloadModal);

    const { data: featuredTracks } = useQuery({
        queryKey: ['tracks-featured-v2'],
        queryFn: async () => {
            const res = await api.get('/tracks/featured');
            return res.data as Track[];
        },
        staleTime: 1000 * 60 * 30,
    });

    const { data: trendingTracks } = useQuery({
        queryKey: ['tracks-trending-v2'],
        queryFn: async () => {
            const res = await api.get('/tracks/trending');
            return res.data as Track[];
        },
        staleTime: 1000 * 60 * 30,
    });

    const { data: allTracks } = useQuery({
        queryKey: ['tracks-all-v2'],
        queryFn: async () => {
            const res = await api.get('/tracks');
            return res.data.items as Track[];
        },
        staleTime: 1000 * 60 * 10,
    });

    const heroTrack = currentTrack || featuredTracks?.[0] || allTracks?.[0];
    const newReleases = allTracks?.slice(0, 10) || [];
    const madeForYou = allTracks?.slice(8, 18) || [];
    const recentlyAdded = allTracks?.slice(0, 6) || [];

    const isHeroPlaying = currentTrack?.id === heroTrack?.id && isPlaying;

    return (
        <div className="pb-40 pt-2 space-y-8">
            {/* ── HERO CARD ─────────────────────────────── */}
            {heroTrack && (
                <div className="px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative h-56 rounded-3xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
                        onClick={() => {
                            useUIStore.getState().setPlayerMinimized(false);
                            if (currentTrack?.id === heroTrack?.id) togglePlay();
                            else setTrack(heroTrack!);
                        }}
                    >
                        {/* Background Art */}
                        <AnimatePresence>
                            <motion.img
                                key={heroTrack.id}
                                initial={{ opacity: 0, scale: 1.05 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.8 }}
                                src={getMediaUrl(heroTrack.coverUrl) || "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800"}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        </AnimatePresence>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                        {/* Content */}
                        <div className="absolute inset-0 flex flex-col justify-end p-4">
                            {/* Label */}
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 mb-1">
                                {isHeroPlaying ? "Now Playing" : "Featured"}
                            </p>

                            {/* Title */}
                            <h1 className="text-xl font-brand text-white truncate leading-tight">
                                {heroTrack.title}
                            </h1>

                            {/* Artist · Genre/Visualizer */}
                            <div className="flex items-center gap-2 mt-0.5 mb-4">
                                <p className="text-[12px] text-white/50 font-medium truncate">
                                    {heroTrack.artist?.name}
                                </p>
                                <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                                {isHeroPlaying ? (
                                    <div className="flex items-end gap-[2px] h-3">
                                        {[0.2, 0.4, 0.1, 0.5].map((delay, i) => (
                                            <motion.div
                                                key={i}
                                                animate={{ height: ["30%", "100%", "30%"] }}
                                                transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                                className="w-[3px] bg-rose-500 rounded-full"
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest truncate">
                                        {heroTrack.genre || "Music"}
                                    </span>
                                )}
                            </div>

                            {/* Action Buttons Row */}
                            <div className="flex items-center gap-3">
                                {/* Play / Pause */}
                                <button
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/25 text-white font-black text-[11px] tracking-widest active:bg-white active:text-black transition-all"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        useUIStore.getState().setPlayerMinimized(false);
                                        if (currentTrack?.id === heroTrack?.id) togglePlay();
                                        else setTrack(heroTrack!);
                                    }}
                                >
                                    {isHeroPlaying
                                        ? <><Pause size={14} fill="white" /> PAUSE</>
                                        : <><Play size={14} fill="white" className="ml-0.5" /> PLAY</>
                                    }
                                </button>

                                {/* Download */}
                                <button
                                    className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-500 active:bg-rose-500 active:text-white transition-all"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (heroTrack) openDownloadModal(heroTrack);
                                    }}
                                >
                                    <Download size={15} />
                                </button>

                                {/* Add to playlist */}
                                <button
                                    className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white active:bg-white active:text-black transition-all"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Plus size={15} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* ── FEATURED (Horizontal scroll) ─────────── */}
            {(featuredTracks?.length || 0) > 0 && (
                <div>
                    <SectionHeader title="Featured now" />
                    <HorizontalScrollCards tracks={featuredTracks || []} />
                </div>
            )}

            {/* ── TRENDING (Horizontal scroll) ─────────── */}
            {(trendingTracks?.length || 0) > 0 && (
                <div>
                    <SectionHeader title="Trending sounds" />
                    <HorizontalScrollCards tracks={trendingTracks || []} />
                </div>
            )}

            {/* ── MADE FOR YOU (Horizontal scroll) ─────── */}
            {madeForYou.length > 0 && (
                <div>
                    <SectionHeader title="Made for you" />
                    <HorizontalScrollCards tracks={madeForYou} />
                </div>
            )}

            {/* ── NEW RELEASES (Horizontal scroll) ─────── */}
            {newReleases.length > 0 && (
                <div>
                    <SectionHeader title="New arrivals" />
                    <HorizontalScrollCards tracks={newReleases} />
                </div>
            )}
        </div>
    );
}
