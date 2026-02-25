"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { TrackItem } from "@/components/track-item";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Play, Pause, Disc3, Clock } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { getMediaUrl } from "@/lib/utils";
import { motion } from "framer-motion";

export default function AlbumPage() {
    const params = useParams();
    const id = params?.id as string;
    const { setTrack, setQueue, currentTrack, isPlaying, togglePlay } = usePlayerStore();

    const { data: album, isLoading } = useQuery({
        queryKey: ['album', id],
        queryFn: async () => {
            const res = await api.get(`/albums/${id}`);
            return res.data;
        },
        enabled: !!id,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <ZenLoading size="lg" showText text="loading archive" />
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

    const isAlbumCurrentlyPlaying =
        album.tracks?.some((t: any) => t.id === currentTrack?.id) && isPlaying;

    const handlePlayAlbum = () => {
        if (isAlbumCurrentlyPlaying) {
            togglePlay();
        } else if (album.tracks?.length > 0) {
            setQueue(album.tracks);
            setTrack(album.tracks[0]);
        }
    };

    const coverUrl = getMediaUrl(album.coverUrl)
        || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800";

    const totalDuration = album.tracks?.reduce(
        (acc: number, t: any) => acc + (t.duration || 0), 0
    );
    const durationMins = Math.floor(totalDuration / 60);

    return (
        <div className="pb-40 min-h-screen w-full overflow-x-hidden">
            {/* ── HERO HEADER ─────────────────────────────────── */}
            <div className="relative overflow-hidden w-full">
                {/* Blurred wallpaper */}
                <div className="absolute inset-0 z-0">
                    <img
                        src={coverUrl}
                        alt=""
                        className="w-full h-full object-cover scale-110 blur-[60px] opacity-25"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-background/80 to-background" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end gap-8 px-6 md:px-10 pt-12 pb-10 w-full">
                    {/* Album Art */}
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="mx-auto md:mx-0 shrink-0 w-36 h-36 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
                    >
                        <img src={coverUrl} alt={album.title} className="w-full h-full object-cover" />
                    </motion.div>

                    {/* Meta */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="flex-1 space-y-5 text-center md:text-left"
                    >
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500">Album</p>
                            <h1 className="text-2xl sm:text-3xl md:text-4xl font-brand tracking-tight text-white leading-tight text-wrap line-clamp-3 md:truncate md:whitespace-nowrap pt-2 pb-1">
                                {album.title}
                            </h1>
                            <p className="text-base font-semibold text-white/50">{album.artist?.name}</p>
                        </div>

                        {/* Stats Row */}
                        <div className="flex items-center justify-center md:justify-start gap-3 text-white/30">
                            <span className="text-[11px] font-bold uppercase tracking-widest">
                                {album.tracks?.length || 0} {album.tracks?.length === 1 ? 'song' : 'songs'}
                            </span>
                            {durationMins > 0 && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                    <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1">
                                        <Clock size={10} />
                                        {durationMins} min
                                    </span>
                                </>
                            )}
                            {album.genre && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                    <span className="text-[11px] font-bold uppercase tracking-widest">
                                        {album.genre}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Play Button */}
                        <button
                            onClick={handlePlayAlbum}
                            disabled={!album.tracks?.length}
                            className="inline-flex items-center gap-3 h-12 px-8 rounded-full bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white font-black uppercase tracking-[0.15em] text-[11px] transition-all hover:scale-105 active:scale-95 shadow-[0_8px_32px_rgba(244,63,94,0.35)]"
                        >
                            {isAlbumCurrentlyPlaying
                                ? <><Pause size={18} fill="white" /> Pause</>
                                : <><Play size={18} fill="white" /> Play album</>
                            }
                        </button>
                    </motion.div>
                </div>
            </div>

            {/* ── TRACK LIST ────────────────────────────────────── */}
            <div className="px-2 md:px-10 mt-6 w-full max-w-7xl mx-auto">
                {/* Header row */}
                <div className="hidden md:grid grid-cols-[2rem_1fr_auto] gap-4 px-4 pb-3 border-b border-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                    <span>#</span>
                    <span className="font-brand">Title</span>
                    <span className="flex items-center"><Clock size={12} /></span>
                </div>

                <div className="divide-y divide-white/5">
                    {album.tracks?.map((track: any, index: number) => (
                        <motion.div
                            key={track.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.03, duration: 0.3 }}
                        >
                            <TrackItem track={track} contextTracks={album.tracks} hideThumbOnMobile={true} />
                        </motion.div>
                    ))}
                </div>

                {(!album.tracks || album.tracks.length === 0) && (
                    <div className="py-24 text-center opacity-20 flex flex-col items-center gap-4">
                        <Disc3 size={48} strokeWidth={1} />
                        <p className="text-sm font-bold uppercase tracking-widest">No tracks in this archive yet</p>
                    </div>
                )}
            </div>
        </div>
    );
}
