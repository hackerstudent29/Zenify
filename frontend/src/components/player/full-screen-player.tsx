"use client";

import React from "react";
import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    MoreHorizontal,
    MessageSquare,
    ChevronDown,
    X,
    Download,
    Share2,
    Heart,
    Shuffle,
    Repeat,
    Repeat1,
    Quote,
    ListMusic,
    Music,
    Sparkles,
    Settings,
    Plus,
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { audioEngine } from "@/lib/audio-engine";
import { AudioFxMenu } from "./audio-fx-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
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

export function FullScreenPlayer() {
    const [showLyrics, setShowLyrics] = React.useState(false);
    const [showAudioFx, setShowAudioFx] = React.useState(false);
    const { isFullScreenPlayerOpen, setFullScreenPlayerOpen, openDownloadModal } = useUIStore();
    const {
        currentTrack,
        isPlaying,
        togglePlay,
        playNext,
        playPrev,
        currentTime,
        duration,
        volume,
        setVolume,
        isShuffled,
        toggleShuffle,
        repeatMode,
        toggleRepeat,
        queue: fullQueue
    } = usePlayerStore();

    // Loop logic helper
    const handleRepeatCycle = () => {
        toggleRepeat();
    };

    const queryClient = useQueryClient();

    const { data: likedTrackIds } = useQuery({
        queryKey: ['liked-track-ids'],
        queryFn: async () => {
            const res = await api.get('/tracks/liked');
            return (res.data as any[]).map(t => t.id);
        },
        staleTime: 1000 * 60 * 5,
    });

    const isLiked = currentTrack ? likedTrackIds?.includes(currentTrack.id) : false;

    const toggleLikeMutation = useMutation({
        mutationFn: async () => {
            if (!currentTrack) return;
            await api.post(`/tracks/${currentTrack.id}/like`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
            queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
        }
    });

    const { data: playlists } = useQuery({
        queryKey: ['my-playlists'],
        queryFn: async () => {
            try {
                const res = await api.get('/playlists/my');
                return res.data as { id: string, name: string }[];
            } catch (e) { return []; }
        }
    });

    const addToPlaylistMutation = useMutation({
        mutationFn: async (playlistId: string) => {
            if (!currentTrack) return;
            await api.post(`/playlists/${playlistId}/tracks`, { trackId: currentTrack.id });
        },
        onSuccess: (_, playlistId) => {
            queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
            // Should probably show toast here, but currently avoiding full UI disruption
        }
    });

    if (!currentTrack) return null;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <AnimatePresence>
            {isFullScreenPlayerOpen && (
                <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed inset-0 z-[500] bg-black overflow-hidden flex flex-col"
                >
                    {/* Immersive Background */}
                    <div className="absolute inset-0 z-0">
                        <img
                            src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                            alt=""
                            className="w-full h-full object-cover scale-150 blur-[100px] opacity-50"
                        />
                        <div className="absolute inset-0 bg-black/40" />
                    </div>

                    {/* Top Header */}
                    <div className="relative z-10 flex items-center justify-end p-6 md:p-10 gap-4">
                        <button
                            onClick={() => setFullScreenPlayerOpen(false)}
                            className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-all"
                        >
                            <div className="w-5 h-5 flex items-center justify-center">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="m14 10 7-7" /><path d="M9 21H3v-6" /><path d="m10 14-7 7" /></svg>
                            </div>
                        </button>
                        <button
                            onClick={() => setFullScreenPlayerOpen(false)}
                            className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-all"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Main Content Area */}
                    <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 w-full min-h-0">
                        {/* Entire Player Container */}
                        <div className="w-full max-w-xl lg:max-w-2xl flex flex-col items-center justify-center gap-6 md:gap-8 min-h-0 h-full py-8">

                            {/* Artwork Section */}
                            <motion.div
                                className={cn(
                                    "flex items-center justify-center shrink min-h-0 w-full transition-all duration-1000 ease-in-out",
                                    showLyrics ? "h-[120px] md:h-[200px] opacity-20 grayscale blur-[10px]" : "h-[45vh] lg:h-[50vh] xl:h-[55vh] max-h-[500px]"
                                )}
                            >
                                <div className={cn(
                                    "h-full aspect-square bg-zinc-900 overflow-hidden border border-white/10 transition-all duration-700",
                                    showLyrics ? "rounded-[24px]" : "rounded-2xl md:rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
                                )}>
                                    <img
                                        src={getMediaUrl(currentTrack.coverUrl) || "/logo.png"}
                                        alt={currentTrack.title}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            </motion.div>

                            {/* Lyrics View (Overlay/Centered) */}
                            {showLyrics && (
                                <motion.div
                                    initial={{ opacity: 0, y: 40 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 py-8 pointer-events-none z-20"
                                >
                                    <div className="w-full max-w-2xl overflow-y-auto no-scrollbar pointer-events-auto max-h-full py-10">
                                        <div className="space-y-6 md:space-y-10">
                                            {currentTrack.lyrics ? currentTrack.lyrics.split('\n').map((line, i) => (
                                                <p key={i} className="text-xl md:text-3xl lg:text-4xl font-bold text-white/40 hover:text-white transition-all cursor-default duration-500 hover:scale-105">
                                                    {line}
                                                </p>
                                            )) : (
                                                <div className="py-20 flex flex-col items-center gap-4 opacity-20">
                                                    <Music className="w-12 h-12" />
                                                    <p className="text-xl font-bold uppercase tracking-widest">Instrumental Section</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Metadata & Controls Block */}
                            <div className="w-full flex flex-col gap-6 shrink-0 relative z-30 pt-4">
                                {/* Metadata */}
                                <div className={cn(
                                    "flex flex-col items-center text-center space-y-1 transition-all duration-700",
                                    showLyrics ? "opacity-0 scale-90 pointer-events-none translate-y-4" : "opacity-100"
                                )}>
                                    <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight px-4 line-clamp-1">
                                        {currentTrack.title}
                                    </h1>
                                    <p className="text-sm md:text-base text-white/50 font-medium truncate px-6">
                                        {currentTrack.artist.name} — {currentTrack.album?.title || "Single"}
                                    </p>

                                    <div className="flex items-center justify-center pt-2">
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest text-white/40">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="opacity-70"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" /></svg>
                                            Lossless
                                        </div>
                                    </div>
                                </div>

                                {/* Progress Pipeline */}
                                <div className="w-full max-w-[500px] mx-auto px-4 md:px-0 mt-2">
                                    <div className="flex justify-between items-center text-[12px] font-medium text-white/50 tabular-nums">
                                        <span className="w-10 text-left">{formatTime(currentTime)}</span>
                                        <Slider.Root
                                            className="relative flex items-center select-none touch-none flex-1 h-5 group cursor-pointer mx-4"
                                            value={[currentTime]}
                                            max={duration || 100}
                                            step={0.1}
                                            onValueChange={(val) => {
                                                audioEngine.resume();
                                                const activeAudio = audioEngine.getActiveAudioElement();
                                                if (activeAudio) activeAudio.currentTime = val[0];
                                            }}
                                        >
                                            <Slider.Track className="bg-white/10 relative grow rounded-full h-[5px]">
                                                <Slider.Range className="absolute bg-white/40 group-hover:bg-white/60 rounded-full h-full transition-colors" />
                                            </Slider.Track>
                                        </Slider.Root>
                                        <span className="w-10 text-right">-{formatTime(duration - currentTime)}</span>
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="w-full max-w-[600px] mx-auto px-4 md:px-0 relative mb-6">
                                    {/* Audio FX Popover - positioned relative to the container */}
                                    <AnimatePresence>
                                        {showAudioFx && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                                className="absolute bottom-full left-4 mb-6 z-50 pointer-events-auto"
                                            >
                                                <AudioFxMenu />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="flex items-center justify-between w-full">
                                        {/* Left controls: Volume & Studio FX */}
                                        <div className="flex-1 flex items-center gap-4 md:gap-6 text-white/50">
                                            <button
                                                onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                                                className="hover:text-white transition-colors"
                                            >
                                                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                            </button>
                                            <button
                                                onClick={() => { setShowAudioFx(!showAudioFx); setShowLyrics(false); }}
                                                className={cn("transition-colors hover:text-white", showAudioFx && "text-white")}
                                            >
                                                <Sparkles size={18} />
                                            </button>
                                        </div>

                                        {/* Main Playback: Shuffle, Prev, Play, Next, Repeat */}
                                        <div className="flex-shrink-0 flex items-center gap-6 md:gap-8 lg:gap-10 text-white mx-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); audioEngine.resume(); toggleShuffle(); }}
                                                className={cn(
                                                    "transition-all duration-200 active:scale-90",
                                                    isShuffled ? "text-brand" : "text-white/20 hover:text-white/60"
                                                )}
                                            >
                                                <Shuffle size={18} strokeWidth={2.5} />
                                            </button>

                                            <button onClick={() => { audioEngine.resume(); playPrev(); }} className="hover:text-white/70 active:scale-95 transition-all text-white/90">
                                                <SkipBack size={28} fill="currentColor" strokeWidth={0} />
                                            </button>

                                            <button onClick={() => { audioEngine.resume(); togglePlay(); }} className="active:scale-95 transition-all hover:scale-110">
                                                {isPlaying ? (
                                                    <div className="w-14 h-14 flex items-center justify-center bg-white text-black rounded-full shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                                                        <Pause size={28} fill="currentColor" strokeWidth={0} />
                                                    </div>
                                                ) : (
                                                    <div className="w-14 h-14 flex items-center justify-center bg-white text-black rounded-full shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                                                        <Play size={28} fill="currentColor" strokeWidth={0} className="ml-1" />
                                                    </div>
                                                )}
                                            </button>

                                            <button onClick={() => { audioEngine.resume(); playNext(); }} className="hover:text-white/70 active:scale-95 transition-all text-white/90">
                                                <SkipForward size={28} fill="currentColor" strokeWidth={0} />
                                            </button>

                                            <button
                                                onClick={(e) => { e.stopPropagation(); audioEngine.resume(); handleRepeatCycle(); }}
                                                className={cn(
                                                    "relative flex items-center justify-center transition-all duration-200 active:scale-90",
                                                    repeatMode !== 'off' ? "text-brand" : "text-white/20 hover:text-white/60"
                                                )}
                                            >
                                                {repeatMode === 'one' || repeatMode === 'two' ? <Repeat1 size={18} strokeWidth={2.5} /> : <Repeat size={18} strokeWidth={2.5} />}
                                                {(repeatMode !== 'off') && (
                                                    <span className="absolute -top-1 -right-1 text-[8px] font-black bg-brand text-white w-3 h-3 flex items-center justify-center rounded-full scale-75">
                                                        {repeatMode === 'all' ? '∞' : repeatMode === 'one' ? '1' : '2'}
                                                    </span>
                                                )}
                                            </button>
                                        </div>

                                        {/* Right controls: Lyrics & Heart & More */}
                                        <div className="flex-1 flex items-center gap-4 md:gap-6 text-white/50 justify-end">
                                            <button
                                                onClick={() => toggleLikeMutation.mutate()}
                                                className={cn("transition-colors", isLiked ? "text-brand" : "hover:text-brand")}
                                            >
                                                <Heart size={20} className={cn(isLiked && "fill-current")} />
                                            </button>
                                            <button
                                                onClick={() => { setShowLyrics(!showLyrics); setShowAudioFx(false); }}
                                                className={cn("transition-colors hover:text-white", showLyrics && "text-white")}
                                            >
                                                <MessageSquare size={18} />
                                            </button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className="hover:text-white transition-colors">
                                                        <MoreHorizontal size={18} />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent className="w-52 mb-2 z-[600]" align="end" side="top">
                                                    <DropdownMenuItem
                                                        className="cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(`${window.location.origin}/track/${currentTrack.id}`);
                                                            useUIStore.getState().openConfirmModal({
                                                                title: "Link Copied",
                                                                message: `A sonic gateway to "${currentTrack.title}" has been added to your clipboard.`,
                                                                confirmText: "Verified",
                                                                type: "info",
                                                                onConfirm: () => { }
                                                            });
                                                        }}
                                                    >
                                                        <Share2 size={16} className="mr-2" /> Share
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openDownloadModal(currentTrack);
                                                        }}
                                                    >
                                                        <Download size={16} className="mr-2" /> Download
                                                    </DropdownMenuItem>

                                                    <DropdownMenuSeparator />

                                                    <DropdownMenuSub>
                                                        <DropdownMenuSubTrigger className="cursor-pointer">
                                                            <Plus size={16} className="mr-2 opacity-70" />
                                                            <span>Add to Playlist</span>
                                                        </DropdownMenuSubTrigger>
                                                        <DropdownMenuPortal>
                                                            <DropdownMenuSubContent className="w-48 ml-1 mb-2 z-[600]">
                                                                {playlists && playlists.length > 0 ? playlists.map((p: any) => (
                                                                    <DropdownMenuItem
                                                                        key={p.id}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            addToPlaylistMutation.mutate(p.id);
                                                                        }}
                                                                        className="cursor-pointer"
                                                                    >
                                                                        {p.name}
                                                                    </DropdownMenuItem>
                                                                )) : (
                                                                    <DropdownMenuItem disabled className="opacity-50">
                                                                        No playlists found
                                                                    </DropdownMenuItem>
                                                                )}
                                                            </DropdownMenuSubContent>
                                                        </DropdownMenuPortal>
                                                    </DropdownMenuSub>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
