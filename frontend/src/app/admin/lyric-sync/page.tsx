"use client";
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, Mic, Search, Music2, Play, Pause,
    SkipBack, SkipForward, Zap, Square, Clock, Save,
    Download, RotateCcw, Trash2, CheckCircle2, Loader2,
    Filter, CheckCheck, AlertCircle
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/utils';
import { LyricSyncStudio } from '@/components/admin/LyricSyncStudio';

/* ─── Types ─────────────────────────────────────────────────── */
interface SyncedLine {
    time: number | null;
    text: string;
    synced: boolean;
}

/* ─── Helpers ────────────────────────────────────────────────── */
function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatTimestamp(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 100);
    return `[${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;
}

/* ════════════════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════════════════ */
export default function LyricSyncPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const preselectedId = searchParams.get('trackId');

    const [selectedTrack, setSelectedTrack] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterNoLyrics, setFilterNoLyrics] = useState(false);

    /* ── Fetch all tracks ───────────────────────────────────── */
    const { data: tracks = [], isLoading } = useQuery({
        queryKey: ['admin-tracks'],
        queryFn: async () => {
            const res = await api.get('/tracks?limit=1000');
            return res.data.items as any[];
        }
    });

    /* Auto-select if ?trackId= is in URL */
    useEffect(() => {
        if (preselectedId && tracks.length > 0 && !selectedTrack) {
            const found = tracks.find((t: any) => t.id === preselectedId);
            if (found) setSelectedTrack(found);
        }
    }, [preselectedId, tracks, selectedTrack]);

    const filtered = tracks.filter((t: any) => {
        const matchSearch =
            t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.artist?.name || t.artistName || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchFilter = !filterNoLyrics || (!t.synced_lyrics || (t.synced_lyrics as any[]).length === 0);
        return matchSearch && matchFilter;
    });

    /* ── Track Selector ─────────────────────────────────────── */
    if (!selectedTrack) {
        return (
            <div className="min-h-screen pb-32 pt-6 md:pt-10 bg-[#0a0a0b]">
                <div className="max-w-4xl mx-auto px-4 md:px-6">

                    {/* Header */}
                    <div className="flex items-center gap-4 mb-8">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/tracks')}
                            className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl shrink-0">
                            <ChevronLeft size={20} />
                        </Button>
                        <div>
                            <div className="flex items-center gap-2.5 mb-0.5">
                                <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.3)]">
                                    <Mic className="w-3.5 h-3.5 text-white" />
                                </div>
                                <h1 className="text-3xl md:text-4xl md:font-brand text-white leading-none">Lyric Sync Studio</h1>
                            </div>
                            <p className="text-white/30 text-[9px] tracking-[0.2em] font-medium">Select a track to start syncing</p>
                        </div>
                    </div>

                    {/* Search + Filter */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <Input
                                placeholder="Search by title or artist..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-11 h-11 bg-white/5 border-white/10 rounded-xl text-sm focus:border-brand/60 transition-all"
                            />
                        </div>
                        <button
                            onClick={() => setFilterNoLyrics(f => !f)}
                            className={`relative overflow-hidden flex items-center gap-2 px-4 h-11 rounded-xl text-xs font-bold border transition-all duration-300 ${filterNoLyrics
                                ? 'bg-brand/20 border-brand/40 text-brand shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.2)]'
                                : 'bg-white/5 border-white/10 text-zinc-500 hover:text-white hover:bg-white/8'}`}
                        >
                            {filterNoLyrics && (
                                <motion.span
                                    className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full"
                                    animate={{ x: ['100%', '-100%'] }}
                                    transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                                />
                            )}
                            <Filter size={13} className="relative z-10" />
                            <span className="relative z-10">No Lyrics Only</span>
                        </button>
                    </div>

                    {/* Stats pill */}
                    {!isLoading && (
                        <p className="text-[11px] text-zinc-600 font-bold mb-4 uppercase tracking-widest">
                            {filtered.length} tracks · {tracks.filter((t: any) => t.synced_lyrics && (t.synced_lyrics as any[]).length > 0).length} already synced
                        </p>
                    )}

                    {/* Track grid */}
                    <div className="premium-card border-white/5 bg-zinc-900/60 overflow-hidden">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-32 gap-4">
                                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Loading tracks...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <Music2 className="w-10 h-10 text-zinc-700 mb-3" />
                                <p className="text-zinc-500 text-sm">No tracks found</p>
                            </div>
                        ) : (
                            <motion.div 
                                initial="hidden"
                                animate="visible"
                                variants={{
                                    hidden: { opacity: 0 },
                                    visible: {
                                        opacity: 1,
                                        transition: {
                                            staggerChildren: 0.04
                                        }
                                    }
                                }}
                                className="divide-y divide-white/[0.04]"
                            >
                                {filtered.map((track: any) => {
                                    const hasSynced = track.synced_lyrics && (track.synced_lyrics as any[]).length > 0;
                                    return (
                                        <motion.div
                                            key={track.id}
                                            variants={{
                                                hidden: { opacity: 0, y: 8 },
                                                visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
                                            }}
                                            whileHover={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
                                            onClick={() => setSelectedTrack(track)}
                                            className="flex items-center gap-4 px-5 py-4 cursor-pointer group transition-all"
                                        >
                                            {/* Cover */}
                                            <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/5">
                                                {track.coverUrl ? (
                                                    <img src={getMediaUrl(track.coverUrl)} alt={track.title} className="w-full h-full object-cover animate-fade-in" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Music2 size={16} className="text-zinc-600" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-[13px] text-white truncate group-hover:text-brand transition-colors">
                                                    {track.title}
                                                </div>
                                                <div className="text-[11px] text-zinc-500 truncate">
                                                    {track.artist?.name || track.artistName}
                                                    {track.duration ? ` · ${formatTime(track.duration)}` : ''}
                                                </div>
                                            </div>

                                            {/* Sync status */}
                                            <div className="flex-shrink-0">
                                                {hasSynced ? (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                                                        <CheckCheck size={11} />
                                                        {(track.synced_lyrics as any[]).length} lines
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-500/10 border border-zinc-500/20 text-zinc-500 text-[10px] font-bold">
                                                        <AlertCircle size={11} />
                                                        No sync
                                                    </span>
                                                )}
                                            </div>

                                            {/* Arrow / Mic icon with hover glow */}
                                            <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-brand/0 group-hover:bg-brand/20 flex items-center justify-center transition-all group-hover:shadow-[0_0_12px_rgba(var(--accent-brand-rgb),0.4)] border border-transparent group-hover:border-brand/30">
                                                <Mic size={12} className="text-zinc-600 group-hover:text-brand transition-colors" />
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* ── Studio View (track selected) ──────────────────────── */
    return (
        <LyricSyncStudio
            track={selectedTrack}
            onClose={() => setSelectedTrack(null)}
        />
    );
}
