"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { usePlayerStore } from "@/store/player";
import { Play, Pause, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getMediaUrl } from "@/lib/utils";
import { useRouter, useParams } from "next/navigation";
import { useUIStore } from "@/store/ui";

export default function ExploreSectionPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayerStore();

    const { data: allTracks, isLoading, isError } = useQuery({
        queryKey: ["tracks-explore"],
        queryFn: async () => {
            const res = await api.get("/tracks");
            return res.data.items as Track[];
        },
    });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#0A0A0C]">
                <div className="w-12 h-12 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
                <p className="text-white/20 font-bold text-[10px] tracking-widest uppercase">Fetching frequencies...</p>
            </div>
        );
    }

    if (isError || !allTracks) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#0A0A0C] px-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
                    <Play className="text-red-500/40 rotate-90" />
                </div>
                <h2 className="text-xl font-bold text-white">Oops! Signal Lost</h2>
                <p className="text-zinc-500 text-sm">We couldn't load the tracks for this section. Please try again later.</p>
                <button
                    onClick={() => router.back()}
                    className="mt-4 px-8 py-3 bg-white text-black rounded-xl font-bold text-xs uppercase tracking-widest"
                >
                    Go Back
                </button>
            </div>
        );
    }

    const tracksArray = (allTracks as Track[]) || [];
    let sectionTracks: Track[] = [];
    let title = "";

    switch (id) {
        case "deep-focus":
            sectionTracks = tracksArray.filter(t => t.genre?.toLowerCase() === 'lofi' || t.genre?.toLowerCase() === 'ambient').slice(0, 50);
            title = "Deep Focus";
            break;
        case "new-arrivals":
            sectionTracks = tracksArray.slice(0, 50);
            title = "New Arrivals";
            break;
        case "trending":
            sectionTracks = tracksArray.filter(t => t.isTrending).slice(0, 50);
            title = "Trending Now";
            break;
        case "made-for-you":
            sectionTracks = tracksArray.slice(Math.min(tracksArray.length - 20, 0), tracksArray.length).reverse();
            title = "Made for You";
            break;
        case "most-played":
            sectionTracks = tracksArray.slice().sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 50); // mock logic using price as popularity
            title = "Most Played";
            break;
        default:
            sectionTracks = tracksArray;
            title = "Explore Section";
    }

    return (
        <div className="min-h-screen bg-[#0A0A0C] pb-32">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#0A0A0C]/80 backdrop-blur-xl border-b border-white/5 px-4 py-4 flex items-center gap-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-full bg-white/5 active:scale-90 transition-all text-white/70 hover:text-white"
                >
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-xl font-brand font-bold text-white tracking-tight">{title}</h1>
            </div>

            {/* Grid */}
            <div className="p-5">
                <div className="grid grid-cols-2 gap-4 items-start">
                    {sectionTracks.map((track, i) => {
                        const isActive = currentTrack?.id === track.id;
                        const isActuallyPlaying = isActive && isPlaying;

                        return (
                            <motion.div
                                key={track.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: Math.min(i * 0.05, 0.5) }}
                                className="relative flex flex-col group active:scale-95 transition-transform"
                                onClick={() => {
                                    useUIStore.getState().setPlayerMinimized(false);
                                    if (isActive) togglePlay();
                                    else setTrack(track, sectionTracks);
                                }}
                            >
                                <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl mb-2 w-full">
                                    <img
                                        src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300"}
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
                    })}
                </div>
            </div>
        </div>
    );
}
