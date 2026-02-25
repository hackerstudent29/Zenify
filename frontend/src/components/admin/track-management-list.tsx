"use client";
import React, { useState } from 'react';
import { format } from 'date-fns';
import { getMediaUrl, cn } from '@/lib/utils';
import { Edit2, Trash2, MoreVertical, Play, ExternalLink, Pause, Volume2, X as CloseIcon, Music, Trash, AlertCircle } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from 'framer-motion';

interface TrackManagementListProps {
    tracks: any[];
    onEdit: (track: any) => void;
}

export function TrackManagementList({ tracks, onEdit }: TrackManagementListProps) {
    const queryClient = useQueryClient();
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
    const [previewTrack, setPreviewTrack] = useState<any>(null);
    const [trackToDelete, setTrackToDelete] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = React.useRef<HTMLAudioElement | null>(null);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/tracks/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-tracks'] });
            showToast("Track deleted permanently", "success");
            setTrackToDelete(null);
        },
        onError: () => {
            showToast("Failed to delete track", "error");
        }
    });

    if (!tracks || tracks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Play className="text-zinc-600 w-6 h-6" />
                </div>
                <h3 className="text-white font-medium">No tracks found</h3>
                <p className="text-zinc-500 text-sm mt-1">Upload your first frequency to get started.</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                <div className="col-span-1 text-center font-mono">#</div>
                <div className="col-span-5">Track Details</div>
                <div className="col-span-2">Genre</div>
                <div className="col-span-2">Statistics</div>
                <div className="col-span-2 text-right">Actions</div>
            </div>

            <div className="divide-y divide-white/5">
                {tracks.map((track, i) => (
                    <div key={track.id} className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-white/[0.02] transition-all group">
                        <div className="col-span-1 text-center text-zinc-600 font-mono text-xs">{i + 1}</div>

                        <div className="col-span-5 flex items-center gap-4 min-w-0">
                            <div className="relative w-12 h-12 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                                <img
                                    src={getMediaUrl(track.coverUrl)}
                                    alt={track.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="min-w-0 flex flex-col gap-0.5">
                                <div className="font-bold text-white truncate text-[13px]">{track.title}</div>
                                <div className="text-[11px] text-zinc-500 truncate font-medium">{track.artist?.name || track.artistName}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    {track.releaseStatus === 'DRAFT' && (
                                        <span className="text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">Draft</span>
                                    )}
                                    {track.isUnlisted && (
                                        <span className="text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">Unlisted</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="col-span-2">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/5 text-zinc-400 border border-white/5 uppercase tracking-wider">
                                {track.genre || "Pop"}
                            </span>
                        </div>

                        <div className="col-span-2 space-y-1">
                            <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                                <span className="text-zinc-200 font-bold">{track.plays || 0}</span> PLAYS
                            </div>
                            <div className="text-[11px] text-zinc-600 font-mono">
                                {format(new Date(track.createdAt), 'MMM dd, yyyy')}
                            </div>
                        </div>

                        <div className="col-span-2 flex items-center justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onEdit(track)}
                                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <Edit2 size={14} />
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all">
                                        <MoreVertical size={14} />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-[#1c1c1e] border-white/10 text-white min-w-[160px] rounded-xl p-1.5 shadow-2xl">
                                    <DropdownMenuItem onClick={() => setPreviewTrack(track)} className="rounded-lg gap-2 text-xs font-medium cursor-pointer focus:bg-rose-500/10 focus:text-rose-400">
                                        <Play size={14} className="text-rose-500" /> Preview Stream
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setTrackToDelete(track)}
                                        className="rounded-lg gap-2 text-xs font-medium text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                                    >
                                        <Trash2 size={14} /> Delete Track
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                ))}
            </div>

            {/* Premium Preview Terminal - Apple Music Inspired */}
            <Dialog open={!!previewTrack} onOpenChange={(open) => {
                if (!open) {
                    setPreviewTrack(null);
                    setIsPlaying(false);
                }
            }}>
                <DialogContent className="bg-[#0f0f13] border-white/5 text-white max-w-md rounded-[32px] p-0 overflow-hidden shadow-2xl backdrop-blur-xl">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Sonic Preview</DialogTitle>
                        <DialogDescription>Registry Verification</DialogDescription>
                    </DialogHeader>
                    <AnimatePresence>
                        {previewTrack && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                                className="relative p-8 pt-8"
                            >
                                {/* Header - Integrated close button removed to avoid duplicates */}
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                        <Music className="text-white/40 w-4 h-4" />
                                    </div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Registry Verification</h3>
                                </div>

                                {/* Center Artwork */}
                                <div className="mx-auto w-56 h-56 rounded-[24px] overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-white/5">
                                    <img
                                        src={getMediaUrl(previewTrack?.coverUrl)}
                                        alt={previewTrack?.title || "Track Preview"}
                                        className="w-full h-full object-cover"
                                    />
                                </div>

                                {/* Metadata */}
                                <div className="text-center mt-6">
                                    <h2 className="text-[18px] font-semibold text-[#f5f5f7] tracking-tight leading-tight">
                                        {previewTrack?.title}
                                    </h2>
                                    <p className="text-[14px] text-[#8e8e93] font-medium mt-4">
                                        {previewTrack?.artist?.name || previewTrack?.artistName}
                                    </p>
                                </div>

                                {/* Timeline & Controls */}
                                <div className="mt-6">
                                    {/* Progress Bar */}
                                    <div className="space-y-3">
                                        <div className="relative w-full h-1 group">
                                            <div className="absolute inset-0 bg-[#2a2a2a] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-white transition-all duration-100"
                                                    style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                                                />
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max={duration || 0}
                                                step="0.1"
                                                value={currentTime}
                                                onChange={(e) => {
                                                    const time = parseFloat(e.target.value);
                                                    if (audioRef.current) {
                                                        audioRef.current.currentTime = time;
                                                        setCurrentTime(time);
                                                    }
                                                }}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:opacity-0 group-hover:[&::-webkit-slider-thumb]:opacity-100 [&::-webkit-slider-thumb]:transition-opacity"
                                            />
                                        </div>
                                        <div className="flex justify-between text-[11px] font-medium tabular-nums text-white/20">
                                            <span>{formatTime(currentTime)}</span>
                                            <span>{formatTime(duration)}</span>
                                        </div>
                                    </div>

                                    {/* Play Controls */}
                                    <div className="flex items-center justify-center gap-10 mt-8">
                                        <button className="text-white/20 hover:text-white transition-colors">
                                            <Music size={20} className="rotate-[-10deg]" />
                                        </button>

                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={togglePlay}
                                            className="w-[60px] h-[60px] rounded-full bg-white flex items-center justify-center text-black shadow-xl"
                                        >
                                            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                                        </motion.button>

                                        <button className="text-white/20 hover:text-white transition-colors">
                                            <Volume2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <audio
                        ref={audioRef}
                        src={getMediaUrl(previewTrack?.audioUrl)}
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                        onEnded={() => setIsPlaying(false)}
                        className="hidden"
                    />
                </DialogContent>
            </Dialog>

            {/* Apple-Style Delete Terminal */}
            <Dialog open={!!trackToDelete} onOpenChange={(open) => !open && setTrackToDelete(null)}>
                <DialogContent className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-transparent border-none shadow-none max-w-none w-full h-full">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Delete Track Confirmation</DialogTitle>
                        <DialogDescription>Are you sure you want to delete this track?</DialogDescription>
                    </DialogHeader>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setTrackToDelete(null)}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                        className="relative w-full max-w-[320px] bg-[#1c1c1e] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                    >
                        <div className="p-4 space-y-4">
                            {/* Horizontal Header */}
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-14 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0">
                                    <img
                                        src={getMediaUrl(trackToDelete?.coverUrl)}
                                        className="w-full h-full object-cover"
                                        alt={trackToDelete?.title}
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-sm font-bold text-white tracking-tight truncate leading-tight">
                                        Delete Track?
                                    </h2>
                                    <div className="flex flex-col gap-0.5">
                                        <p className="text-[12px] font-semibold text-white/70 truncate">
                                            {trackToDelete?.title}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[10px] font-black text-rose-500/40 uppercase tracking-tighter">
                                                Registry Erase
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-white/10" />
                                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-tight truncate">
                                                Permanent
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Action Area */}
                            <div className="grid grid-cols-2 gap-2 pb-1">
                                <button
                                    onClick={() => setTrackToDelete(null)}
                                    className="py-2.5 text-[10px] font-bold text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors bg-white/5 rounded-lg border border-white/5"
                                >
                                    Cancel
                                </button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => {
                                        deleteMutation.mutate(trackToDelete.id);
                                    }}
                                    disabled={deleteMutation.isPending}
                                    className="py-2.5 bg-rose-500 hover:bg-rose-400 text-white rounded-lg flex items-center justify-center gap-2 font-bold text-[10px] tracking-widest uppercase transition-colors"
                                >
                                    {deleteMutation.isPending ? "Erasing..." : "Delete"}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </DialogContent>
            </Dialog>

            {
                toast && (
                    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[100] transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${toast.type === 'error'
                        ? 'bg-red-500/10 border-red-500/20 text-red-400'
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        }`}>
                        <span className="text-[13px] font-semibold tracking-tight">{toast.msg}</span>
                    </div>
                )
            }
        </div >
    );
}
