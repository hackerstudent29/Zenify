"use client";

import { useParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ZenLoading } from "@/components/ui/ZenLoading";
import {
    Play, Pause, Heart, Download, Plus, Share2,
    User, Disc3, Check, X, Shuffle, MoreHorizontal
} from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { getMediaUrl, cn, formatDisplayTitle } from "@/lib/utils";
import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { useAlbumColor } from "@/hooks/useAlbumColor";
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

export default function TrackPage() {
    const params  = useParams();
    const router  = useRouter();
    const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying    = usePlayerStore(s => s.isPlaying);
    const setTrack     = usePlayerStore(s => s.setTrack);
    const togglePlay   = usePlayerStore(s => s.togglePlay);
    const isShuffled   = usePlayerStore(s => s.isShuffled);
    const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
    const queue        = usePlayerStore(s => s.queue);
    const addToQueue   = usePlayerStore(s => s.addToQueue);

    const { openDownloadModal, setPlayerMinimized } = useUIStore();
    const { user } = useAuthStore();
    const queryClient = useQueryClient();

    const isGlassmorphism = user?.preferences?.sidebarStyle === "glassmorphism";
    const showReactiveBg = user?.preferences?.trackPageReactiveBg !== false;
    const pathname = usePathname();
    const isFullScreenPlayerOpen = useUIStore(s => s.isFullScreenPlayerOpen);
    const isTrackPageActive = pathname === `/track/${id}` && !isFullScreenPlayerOpen;
    
    // Get colors for track cover
    const { data: trackRaw } = useQuery({
        queryKey: ["track-detail", id],
        queryFn: async () => (await api.get(`/tracks/${id}`)).data,
        enabled: !!id,
    });
    const colors = useAlbumColor(trackRaw?.coverUrl);

    // Auto-navigate when the player changes to a different track
    useEffect(() => {
        if (currentTrack?.id && currentTrack.id !== id) {
            router.replace(`/track/${currentTrack.id}`);
        }
    }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const showToast = (msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 2500);
    };

    const fmtTotalTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        return `${m} minute${m !== 1 ? "s" : ""}`;
    };
    const fmtReleaseDate = (d: string) => {
        try { return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }); }
        catch { return ""; }
    };

    /* ─── Queries ─── */
    const { data: track, isLoading } = useQuery({
        queryKey: ["track-detail", id],
        queryFn: async () => (await api.get(`/tracks/${id}`)).data,
        enabled: !!id,
    });

    const { data: playlists } = useQuery({
        queryKey: ["my-playlists"],
        queryFn: async () => {
            try { return (await api.get("/playlists/my")).data as { id: string; name: string }[]; }
            catch { return []; }
        },
    });

    const { data: likedTrackIds } = useQuery({
        queryKey: ["liked-track-ids"],
        queryFn: async () => (await api.get("/tracks/liked")).data.map((t: any) => t.id),
        staleTime: 1000 * 60 * 5,
    });

    /* ─── Mutations ─── */
    const addToPlaylistMutation = useMutation({
        mutationFn: (playlistId: string) =>
            api.post(`/playlists/${playlistId}/tracks`, { trackId: id }),
        onSuccess: () => showToast("Added to playlist!"),
        onError:   (err: any) => showToast(err.response?.data?.message || "Failed", "error"),
    });

    const isLiked = likedTrackIds?.includes(id);
    const toggleLikeMutation = useMutation({
        mutationFn: () => api.post(`/tracks/${id}/like`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });
            queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
            showToast(isLiked ? "Removed from library" : "Added to library");
        },
    });

    const handleShare = async () => {
        if (!track) return;
        const url = `${window.location.origin}/track/${id}`;
        if (navigator.share) {
            try { await navigator.share({ title: track.title, url }); }
            catch (e) { if ((e as Error).name !== "AbortError") showToast("Error sharing", "error"); }
        } else {
            try { await navigator.clipboard.writeText(url); showToast("Link copied!"); }
            catch { showToast("Failed to copy", "error"); }
        }
    };

    const isCurrentTrack        = currentTrack?.id === id;
    const isCurrentTrackPlaying = isCurrentTrack && isPlaying;

    /** Play/pause — does NOT bubble from dropdown items */
    const handlePlayTrack = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!track) return;
        if (isCurrentTrack) { togglePlay(); }
        else {
            // Fix: Don't wipe out the queue when playing a single track
            const existingIndex = queue.findIndex(t => t.id === track.id);
            if (existingIndex !== -1) {
                // If it's already in the queue, just set it and preserve the queue
                setTrack(track, queue);
            } else {
                // If it's not in the queue, we can just append it and play it
                // Actually, if we just want to play it immediately and keep the queue:
                const newQueue = [...queue, track];
                setTrack(track, newQueue);
            }
            if (!isPlaying) togglePlay();
            setPlayerMinimized(false);
        }
    };

    /* ─── Loading / not-found ─── */
    if (isLoading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <ZenLoading size="md" />
        </div>
    );

    if (!track) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Disc3 size={48} className="text-white/15" strokeWidth={1} />
            <p className="text-sm text-white/30">Song not found</p>
            <button onClick={() => router.back()}
                className="text-xs text-brand border border-brand/20 px-4 py-2 rounded-full hover:bg-brand/10 transition-all">
                Go Back
            </button>
        </div>
    );

    const coverUrl    = getMediaUrl(track.coverUrl) || "/logo.png";
    const totalMins   = Math.floor(track.duration / 60);
    const totalSecs   = track.duration % 60;
    const durationStr = `${totalMins}:${String(totalSecs).padStart(2, "0")}`;

    return (
        <div className="min-h-screen w-full text-foreground pb-40 relative overflow-hidden">

            {showReactiveBg && isTrackPageActive && (
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <AuroraBackground colors={colors} speed="fast" />
                </div>
            )}

            {/* ── Page content ── */}
            <div className="relative z-10 px-4 sm:px-10 lg:px-12">

                {/* ── Hero: cover + metadata ── */}
                <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-8 pt-10 pb-9"
                >
                    {/* Cover art */}
                    <div
                        className="shrink-0 rounded-lg shadow-xl overflow-hidden bg-zinc-900 border border-white/10 w-[42vw] sm:w-[180px] md:w-[210px] lg:w-[220px] xl:w-[230px] h-[42vw] sm:h-[180px] md:h-[210px] lg:h-[220px] xl:h-[230px] transition-all duration-300 hover:scale-[1.02]"
                    >
                        <img src={coverUrl} alt={track.title} className="w-full h-full object-cover" />
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-col justify-center items-center sm:items-start min-w-0 flex-1 pt-2">
                        <h1 className="font-brand text-2xl sm:text-4xl text-brand leading-tight mb-3 block">
                            {formatDisplayTitle(track.title)} - Single
                        </h1>

                        <Link
                            href={`/artist/${track.artistId}`}
                            className="text-lg sm:text-2xl font-normal text-white/90 hover:text-brand active:text-brand transition-colors mb-3 block w-fit"
                        >
                            {formatDisplayTitle(track.artist?.name)}
                        </Link>

                        <p className="text-sm sm:text-base text-muted/80 font-medium mb-8">
                            {track.genre || "Pop"} · {new Date(track.createdAt).getFullYear()}
                        </p>

                        {/* Action buttons: Play pill → shuffle → heart/check → share */}
                        <div className="flex items-center justify-center sm:justify-start gap-4 flex-wrap">

                            {/* Play / Pause pill */}
                            <button
                                onClick={handlePlayTrack}
                                className="flex items-center gap-2 px-6 py-3 rounded-full bg-brand text-white font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_4px_20px_rgba(225,29,72,0.4)] cursor-pointer"
                            >
                                {isCurrentTrackPlaying ? (
                                    <>
                                        <Pause size={18} fill="currentColor" strokeWidth={0} />
                                        <span>Pause</span>
                                    </>
                                ) : (
                                    <>
                                        <Play size={18} fill="currentColor" strokeWidth={0} className="ml-px" />
                                        <span>Play</span>
                                    </>
                                )}
                            </button>

                            {/* Shuffle */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleShuffle();
                                    if (!isCurrentTrack && track) {
                                        setTrack(track, [track]);
                                        if (!isPlaying) togglePlay();
                                        setPlayerMinimized(false);
                                    }
                                }}
                                className={cn(
                                    "w-11 h-11 rounded-full flex items-center justify-center border transition-all hover:bg-white/10 active:scale-90 cursor-pointer bg-black/40 backdrop-blur-md",
                                    isShuffled ? "border-brand text-brand bg-brand/20 shadow-[0_0_15px_rgba(225,29,72,0.2)]" : "border-white/10 text-white/80 hover:text-white"
                                )}
                                title="Shuffle"
                            >
                                <Shuffle size={20} strokeWidth={1.8} />
                            </button>
 
                            {/* Library toggle: ✓ when liked, ♡ when not */}
                            <button
                                onClick={() => toggleLikeMutation.mutate()}
                                className={cn(
                                    "w-11 h-11 rounded-full flex items-center justify-center border transition-all hover:bg-white/10 active:scale-90 cursor-pointer bg-black/40 backdrop-blur-md",
                                    isLiked ? "border-brand bg-brand/20 text-brand shadow-[0_0_15px_rgba(225,29,72,0.2)]" : "border-white/10 text-white/80 hover:text-white"
                                )}
                                title={isLiked ? "Remove from library" : "Add to library"}
                            >
                                {isLiked ? (
                                    <Heart size={20} fill="currentColor" strokeWidth={0} className="text-brand" />
                                ) : (
                                    <Heart size={20} strokeWidth={1.8} />
                                )}
                            </button>
 
                            {/* Share */}
                            <button
                                onClick={handleShare}
                                className="w-11 h-11 rounded-full flex items-center justify-center border border-white/10 text-white/80 bg-black/40 backdrop-blur-md hover:text-white transition-all hover:bg-white/10 active:scale-90 cursor-pointer"
                                title="Share"
                            >
                                <Share2 size={20} strokeWidth={1.8} />
                            </button>

                        </div>
                    </div>
                </motion.section>

                {/* ── Track list ── */}
                <motion.section
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.06, duration: 0.32 }}
                >
                    <div className="h-px bg-border" />

                    {/* Track row — only name/number are play triggers; dropdown is isolated */}
                    <div className="group flex items-center py-4 px-2 rounded-xl hover:bg-white/[0.05] transition-colors">

                        {/* Number / Visualizer — click to play */}
                        <div className="w-10 shrink-0 flex justify-center items-center">
                            {isCurrentTrackPlaying ? (
                                <div className="flex items-end gap-[1.5px] h-[12px] mb-0.5">
                                    {[0.1, 0.4, 0.2, 0.5].map((d, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: ["30%", "100%", "30%"] }}
                                            transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
                                            className="w-[2.5px] bg-red-500 rounded-full"
                                        />
                                    ))}
                                </div>
                            ) : (
                                <span className="text-[15px] font-bold text-white/20">1</span>
                            )}
                        </div>

                        {/* Name & Subtitle — click to play */}
                        <button
                            onClick={handlePlayTrack}
                            className="flex-1 text-left min-w-0 flex flex-col justify-center cursor-pointer"
                        >
                            <span
                                className={cn(
                                    "font-semibold text-[15px] truncate leading-snug hover:text-red-500 transition-colors block w-fit max-w-full",
                                    isCurrentTrack ? "text-red-500" : "text-foreground"
                                )}
                            >
                                {formatDisplayTitle(track.title)}
                            </span>
                            <span className="text-[12px] font-medium text-white/40 truncate mt-0.5 block">
                                {formatDisplayTitle(track.artist?.name)}
                            </span>
                        </button>

                        {/* Duration */}
                        <span className="text-[14px] text-muted tabular-nums shrink-0 mr-3">
                            {durationStr}
                        </span>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className={cn("p-2 transition-colors cursor-pointer", isGlassmorphism ? "text-white/80 hover:text-white" : "text-white/50 hover:text-white")}>
                                        <MoreHorizontal size={20} />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-52" align="end">
                                    <DropdownMenuItem onClick={() => router.push(`/artist/${track.artistId}`)}>
                                        <User size={13} className="mr-2 opacity-60" /> Go to Artist
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-border" />
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            <Plus size={13} className="mr-2 opacity-60" /> Add to Playlist
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuPortal>
                                            <DropdownMenuSubContent className="w-48 ml-1">
                                                {playlists?.map((p: any) => (
                                                    <DropdownMenuItem key={p.id} onClick={() => addToPlaylistMutation.mutate(p.id)}>
                                                        {p.name}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuSubContent>
                                        </DropdownMenuPortal>
                                    </DropdownMenuSub>
                                    <DropdownMenuItem onClick={() => openDownloadModal(track)}>
                                        <Download size={13} className="mr-2 opacity-60" /> Download
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    <div className="h-px bg-border" />
                </motion.section>

                {/* ── Footer metadata ── */}
                <motion.footer
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.32 }}
                    className="mt-8 space-y-[3px] text-[12px] text-muted leading-relaxed"
                >
                    <p>{fmtReleaseDate(track.createdAt)}</p>
                    <p>1 song, {fmtTotalTime(track.duration)}</p>
                    <p className="mt-1.5">
                        © {new Date(track.createdAt).getFullYear()} {track.artist?.name || "Zenify ULC"}, marketed by Republic Records, a division of UMG Recordings, Inc.
                    </p>
                </motion.footer>

            </div>

            {/* ── Toast ── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className={cn(
                            "fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl border backdrop-blur-xl text-sm font-medium whitespace-nowrap z-[9999]",
                            toast.type === "error"
                                ? "bg-red-500/10 border-red-500/20 text-red-400"
                                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        )}
                    >
                        {toast.type === "success" ? <Check size={14} /> : <X size={14} />}
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
