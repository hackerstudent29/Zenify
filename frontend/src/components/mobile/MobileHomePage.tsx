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
import { Play, Pause, ChevronRight, Download, Plus, Heart, Sparkles, TrendingUp, Music2, Shuffle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { getMediaUrl, cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";

function MiniTrackCard({ track, index, layout = "list" }: { track: Track; index: number; layout?: "list" | "grid" }) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const isActive = currentTrack?.id === track.id;
    const isActuallyPlaying = isActive && isPlaying;

    const handlePlay = () => {
        if (isActive) {
            useUIStore.getState().setFullScreenPlayerOpen(true);
        } else {
            useUIStore.getState().setPlayerMinimized(false);
            setTrack(track, (window as any).__allTracks || []);
        }
    };

    if (layout === "grid") {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="shrink-0 w-36 group"
                onClick={handlePlay}
            >
                <div className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-2xl mb-2 group-active:scale-95 transition-transform duration-300">
                    <img
                        src={getMediaUrl(track.coverUrl) || "/logo.png"}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        alt=""
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60" />

                    {isActuallyPlaying && (
                        <div className="absolute bottom-2 left-2 flex items-center justify-center pointer-events-none z-20 bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/10">
                            <div className="flex items-end gap-[3px] h-3">
                                {[0.1, 0.4, 0.2, 0.3].map((delay, j) => (
                                    <motion.div
                                        key={j}
                                        animate={{ height: ["20%", "100%", "20%"] }}
                                        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                        className="w-[3px] bg-brand rounded-full shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]"
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {!isActuallyPlaying && (
                        <div className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                            <Play size={14} fill="white" className="ml-0.5 text-white" />
                        </div>
                    )}
                </div>
                <div className="px-1">
                    <p className={`text-[12px] font-bold truncate leading-tight ${isActive ? "text-brand" : "text-white/90"}`}>
                        {track.title}
                    </p>
                    <p className="text-[10px] text-white/40 font-semibold truncate mt-0.5">
                        {track.artist?.name}
                    </p>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: (index % 5) * 0.05 }}
            className={`flex items-center gap-3.5 p-3 rounded-2xl active:bg-white/[0.08] transition-all cursor-pointer border border-transparent hover:border-white/5 mx-1 mb-1 ${isActive ? "bg-white/[0.05]" : ""}`}
            onClick={handlePlay}
        >
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-lg">
                <img
                    src={getMediaUrl(track.coverUrl) || "/logo.png"}
                    className="w-full h-full object-cover"
                    alt=""
                />
                <AnimatePresence>
                    {isActuallyPlaying && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-brand/30 backdrop-blur-[1px] flex items-center justify-center"
                        >
                            <div className="flex items-end gap-[2px] h-3.5">
                                {[0.2, 0.4, 0.1, 0.3].map((delay, i) => (
                                    <motion.div
                                        key={i}
                                        animate={{ height: ["25%", "100%", "25%"] }}
                                        transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay }}
                                        className="w-[2px] bg-white rounded-full shadow-sm"
                                    />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex-1 min-w-0">
                <p className={`text-[13.5px] font-bold truncate tracking-tight leading-tight ${isActive ? "text-brand" : "text-white/95"}`}>
                    {track.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-[11px] text-white/40 font-medium truncate">
                        {track.artist?.name}
                    </p>
                    {track.genre && (
                        <>
                            <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
                            <span className="text-[10px] text-white/20 uppercase font-black tracking-widest">{track.genre}</span>
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 pr-1">
                {isActive && isPlaying ? (
                    <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-white shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.4)]">
                        <Pause size={14} fill="currentColor" />
                    </div>
                ) : (
                    <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${isActive ? "border-brand/40 bg-brand/10 text-brand" : "border-white/10 text-white/40 group-active:text-white"}`}>
                        <Play size={12} fill="currentColor" className="ml-0.5" />
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function SectionHeader({ title, href, icon: Icon }: { title: string; href?: string; icon?: any }) {
    return (
        <div className="flex items-center justify-between mb-4 px-5">
            <div className="flex items-center gap-2.5">
                {Icon && <Icon size={18} className="text-white/40" />}
                <h2 className="text-lg font-brand text-white/95 tracking-tight">{title}</h2>
            </div>
            {href && (
                <Link href={href} className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30 hover:text-brand flex items-center gap-1 transition-colors">
                    View all <ChevronRight size={12} className="mt-[1px]" />
                </Link>
            )}
        </div>
    );
}

function HorizontalScrollCards({ tracks }: { tracks: Track[] }) {
    return (
        <div className="flex items-start gap-4 overflow-x-auto no-scrollbar px-5 pb-2 -mx-1">
            {tracks.map((track, i) => (
                <MiniTrackCard key={track.id} track={track} index={i} layout="grid" />
            ))}
        </div>
    );
}

export function MobileHomePage() {
    const router = useRouter();
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const openDownloadModal = useUIStore(s => s.openDownloadModal);

    const { data: homepageData } = useQuery({
        queryKey: ['homepage-sections-mobile-v1'],
        queryFn: async () => {
            const res = await api.get('/homepage');
            return res.data;
        },
        staleTime: 1000 * 60 * 5,
    });

    // Extract all tracks for playback context (flattened from all sections)
    const tracksArray = (homepageData?.sections?.flatMap((s: any) => s.items) || []) as Track[];

    // De-duplicate tracks for the global queue
    const uniqueTracks = Array.from(new Map(tracksArray.map(t => [t.id, t])).values());

    useEffect(() => {
        if (typeof window !== "undefined" && uniqueTracks.length > 0) {
            (window as any).__allTracks = uniqueTracks;
        }
    }, [uniqueTracks]);

    if (!homepageData) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
                <p className="text-white/20 font-bold text-[10px] tracking-widest uppercase animate-pulse">Zenifying your stream...</p>
            </div>
        );
    }

    const heroSection = homepageData.sections?.[0]; // Most Played usually
    const heroTrack = currentTrack || heroSection?.items?.[0] || uniqueTracks?.[0];
    const isHeroPlaying = currentTrack?.id === heroTrack?.id && isPlaying;

    return (
        <div className="pb-44 pt-5 space-y-12">
            {/* ── REFINED HERO SECTION ────────────────────────── */}
            {heroTrack && (
                <div className="px-5 pt-2">
                    <div className="relative w-full h-[52vh] min-h-[400px] overflow-hidden rounded-[2.5rem] border border-white/10 shadow-2xl">
                        {/* Background Layer */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={heroTrack.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.8 }}
                                className="absolute inset-0"
                            >
                                <img
                                    src={getMediaUrl(heroTrack.coverUrl) || "/logo.png"}
                                    className="w-full h-full object-cover"
                                    alt=""
                                />
                                {/* Sophisticated Overlays */}
                                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/90" />
                                <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
                            </motion.div>
                        </AnimatePresence>

                        {/* Content Overlay */}
                        <div className="absolute inset-0 flex flex-col justify-end px-6 pb-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="px-2 py-0.5 rounded-full bg-brand/20 border border-brand/30 text-[8px] font-black tracking-[0.2em] text-brand uppercase">
                                        {isHeroPlaying ? "Playing Now" : "Editor's Choice"}
                                    </span>
                                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{heroTrack.genre || "Zen Wave"}</span>
                                </div>

                                <h1 className="text-3xl font-brand text-white leading-tight mb-2 drop-shadow-xl line-clamp-2">
                                    {cleanTitle(heroTrack.title)}
                                </h1>

                                <p className="text-sm text-white/60 font-medium mb-6">
                                    BY <span className="text-white font-bold">{heroTrack.artist?.name}</span>
                                </p>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            useUIStore.getState().setPlayerMinimized(false);
                                            if (currentTrack?.id === heroTrack.id) {
                                                togglePlay();
                                            } else {
                                                setTrack(heroTrack, uniqueTracks);
                                            }
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 bg-brand text-white h-12 rounded-2xl font-black text-[11px] tracking-[0.15em] active:scale-[0.97] transition-all shadow-[0_10px_20px_rgba(var(--accent-brand-rgb),0.3)]"
                                    >
                                        {isHeroPlaying ? (
                                            <><Pause size={18} fill="currentColor" /> PAUSE</>
                                        ) : (
                                            <><Play size={18} fill="currentColor" className="ml-1" /> PLAY NOW</>
                                        )}
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openDownloadModal(heroTrack);
                                        }}
                                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/10 border border-white/10 text-white backdrop-blur-xl active:scale-95 transition-all"
                                    >
                                        <Download size={18} />
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SECTIONS ─────────────────────────────── */}
            <div className="space-y-12 pb-10">
                {homepageData.sections?.map((section: any, idx: number) => {
                    const icons: any = {
                        most_played: TrendingUp,
                        new: Music2,
                        trending: Sparkles,
                        personalized: Heart,
                        similar: Music2
                    };
                    return (
                        section.items && section.items.length > 0 && (
                            <motion.div
                                key={section.type + idx}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1 }}
                            >
                                <SectionHeader title={section.title} icon={icons[section.type] || Music2} />
                                <HorizontalScrollCards tracks={section.items} />
                            </motion.div>
                        )
                    );
                })}
            </div>
        </div>
    );
}

function cleanTitle(title: string) {
    return title.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim();
}
