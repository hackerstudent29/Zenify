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
import { Play, Pause, ChevronRight, Download, Plus, Heart, Sparkles, TrendingUp, Music2, Shuffle, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { getMediaUrl, cn, getTrackCover, formatDisplayTitle } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TopPickCard } from "@/components/shared/TopPickCard";

function MiniTrackCard({ track, index, layout = "list" }: { track: any; index: number; layout?: "list" | "grid" }) {
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();
    const router = useRouter(); // Use router for navigation if it's an artist/album

    const isLink = track.isArtist || track.isAlbum;
    const isActive = !isLink && currentTrack?.id === track.id;
    const isActuallyPlaying = isActive && isPlaying;

    const handlePlay = () => {
        if (isLink) {
            router.push(track.href);
            return;
        }

        if (isActive) {
            useUIStore.getState().setFullScreenPlayerOpen(true);
        } else {
            useUIStore.getState().setPlayerMinimized(false);
            setTrack(track, (window as any).__allTracks || []);
        }
    };

    const isArtist = track.isArtist;
    const isAlbum = track.isAlbum;

    if (layout === "grid") {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="shrink-0 w-[calc((100vw-38px)/2.1)] group"
                onClick={handlePlay}
            >
                <div className={cn(
                    "relative aspect-square w-full overflow-hidden shadow-2xl mb-3 group-active:scale-95 transition-all duration-500 border border-white/5 bg-zinc-900",
                    isArtist ? "rounded-full" : "rounded-lg"
                )}>
                    <img
                        src={getTrackCover(track)} // Updated to handle common cover fetch logic
                        className={cn(
                            "w-full h-full object-cover transition-transform duration-700 group-hover:scale-110",
                            isArtist && "rounded-full"
                        )}
                        alt=""
                    />
                    <div className={cn(
                        "absolute inset-0 bg-gradient-to-t from-black/30 to-transparent",
                        isArtist ? "rounded-full" : "rounded-lg"
                    )} />

                    {isActuallyPlaying && (
                        <div className="absolute bottom-2 left-2 flex items-center justify-center pointer-events-none z-20 bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/10">
                            <div className="flex items-end gap-[3px] h-3">
                                {[0.1, 0.4, 0.2, 0.3].map((delay, j) => (
                                    <motion.div
                                        key={j}
                                        animate={{ height: ["20%", "100%", "20%"] }}
                                        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay }}
                                        className="w-[3px] bg-brand rounded-full"
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className={cn("px-1", isArtist ? "text-center" : "text-left")}>
                    <p className={cn("text-[13px] font-bold truncate leading-snug", isActive ? "text-brand" : "text-white/90")}>
                        {formatDisplayTitle(track.title)}
                    </p>
                    <p className="text-[11px] text-white/40 font-medium truncate mt-0.5 tracking-tight">
                        {isArtist ? "Artist" : (formatDisplayTitle(track.artist?.name) || 'Unknown Artist')}
                    </p>
                </div>
            </motion.div>
        );
    }
// ... [rest of the component remains similar, but using any for track]

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
                    src={getTrackCover(track)}
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
                <div className="flex items-center justify-between gap-2">
                    <p className={`text-[13.5px] font-bold truncate tracking-tight leading-snug flex-1 ${isActive ? "text-brand" : "text-white/95"}`}>
                        {formatDisplayTitle(track.title)}
                    </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-[11px] text-white/40 font-medium truncate">
                        {formatDisplayTitle(track.artist?.name) || 'Unknown Artist'}
                    </p>
                    {track.genre && !isLink && (
                        <>
                            <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
                            <span className="text-[10px] text-white/20 uppercase font-black tracking-widest">{track.genre}</span>
                        </>
                    )}
                </div>
            </div>

            {!isLink && (
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
            )}
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
        queryKey: ['homepage-sections-mobile-v2'],
        queryFn: async () => {
            const res = await api.get('/homepage');
            return res.data;
        },
        staleTime: 1000 * 60 * 5,
    });

    // Extract all tracks for playback context (flattened from all sections)
    const tracksArray = (homepageData?.sections?.flatMap((s: any) => s.items || []) || []) as Track[];

    // De-duplicate tracks for the global queue, strictly excluding non-playable links (artists/albums)
    const uniqueTracks = Array.from(new Map(tracksArray.filter(t => t && t.id && !(t as any).isArtist && !(t as any).isAlbum).map(t => [t.id, t])).values()) as Track[];

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
        <div className="pb-44 pt-2 space-y-12 overflow-x-hidden">
            {/* ── TOP PICKS SECTION (Cards) ────────────────────────── */}
            {uniqueTracks.length > 0 && (
                <div className="pt-2">
                    <div className="flex items-center justify-between mb-4 px-5">
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-xl font-brand text-white/95 tracking-tight">Top Picks for You</h2>
                        </div>
                    </div>
                    
                    {/* Horizontal Snapping Scroll View */}
                    <div className="flex items-start gap-4 overflow-x-auto no-scrollbar px-5 pb-6 snap-x snap-mandatory hide-scroll">
                        {uniqueTracks.slice(0, 8).map((track, i) => (
                            <TopPickCard key={track.id} track={track} index={i} allTracks={uniqueTracks} />
                        ))}
                        {/* Fake invisible card for right padding */}
                        <div className="shrink-0 w-2 h-10" />
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
                        similar: Music2,
                        top_artists: User,
                        top_albums: Music2
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
    if (!title) return "";
    return title.replace(/\[.*?\]/g, "").replace(/\(.*?\)/g, "").trim();
}
