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
                                <h1 className="text-3xl md:text-4xl font-brand text-white leading-none">Lyric Sync Studio</h1>
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
        <SyncStudio
            track={selectedTrack}
            onBack={() => setSelectedTrack(null)}
        />
    );
}

/* ════════════════════════════════════════════════════════════════
   SYNC STUDIO
════════════════════════════════════════════════════════════════ */
function SyncStudio({ track, onBack }: { track: any; onBack: () => void }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const lyricsRef = useRef<HTMLDivElement>(null);

    /* audio state */
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(track.duration || 0);
    const [playbackRate, setPlaybackRate] = useState(1);

    /* sync state */
    const [isSyncing, setIsSyncing] = useState(false);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [lines, setLines] = useState<SyncedLine[]>([]);
    const [rawInput, setRawInput] = useState('');
    const [showEditor, setShowEditor] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    /* Init lines */
    useEffect(() => {
        const existing = track.synced_lyrics as any[];
        const rawLyrics = track.lyrics || '';
        if (existing && existing.length > 0) {
            setLines(existing.map((l: any) => ({ time: l.time, text: l.text, synced: true })));
            setRawInput(existing.map((l: any) => l.text).join('\n'));
        } else if (rawLyrics) {
            const parsed = rawLyrics.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('['));
            setLines(parsed.map((text: string) => ({ time: null, text, synced: false })));
            setRawInput(rawLyrics);
        }
    }, [track]);

    /* Audio controls */
    const togglePlay = useCallback(() => {
        if (!audioRef.current) return;
        isPlaying ? audioRef.current.pause() : audioRef.current.play();
        setIsPlaying(p => !p);
    }, [isPlaying]);

    const seek = useCallback((t: number) => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = Math.max(0, Math.min(t, duration));
    }, [duration]);

    const changeRate = (r: number) => {
        if (audioRef.current) audioRef.current.playbackRate = r;
        setPlaybackRate(r);
    };

    /* Sync controls */
    const startSync = () => {
        if (lines.length === 0) { showToast('Paste lyrics first', 'error'); return; }
        setLines(prev => prev.map(l => ({ ...l, synced: false, time: null })));
        setCurrentIdx(0);
        setIsSyncing(true);
        if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); setIsPlaying(true); }
        showToast('Sync started — press Space to stamp each line!');
    };

    const stopSync = () => {
        setIsSyncing(false);
        audioRef.current?.pause();
        setIsPlaying(false);
    };

    const stampLine = useCallback(() => {
        if (!isSyncing) return;
        const time = audioRef.current?.currentTime ?? currentTime;
        const currentLineNum = currentIdx + 1;
        setLines(prev => {
            const updated = [...prev];
            updated[currentIdx] = { ...updated[currentIdx], time, synced: true };
            return updated;
        });
        const next = currentIdx + 1;
        if (next < lines.length) {
            setCurrentIdx(next);
            const container = lyricsRef.current;
            if (container) {
                const el = container.children[next] as HTMLElement;
                el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            showToast(`Line ${currentLineNum} stamped successfully`, 'success');
        } else {
            setIsSyncing(false);
            audioRef.current?.pause();
            setIsPlaying(false);
            showToast(`✅ All ${lines.length} lines synced! Hit Save.`);
        }
    }, [isSyncing, currentIdx, lines.length, currentTime]);

    /* Space key */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!isSyncing) return;
            if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((document.activeElement as any)?.tagName || '')) {
                e.preventDefault();
                stampLine();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isSyncing, stampLine]);

    const applyLyrics = () => {
        const parsed = rawInput.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('['));
        setLines(parsed.map(text => ({ time: null, text, synced: false })));
        setShowEditor(false);
        showToast(`${parsed.length} lines loaded`);
    };

    const clearLine = (idx: number) => {
        setLines(prev => { const u = [...prev]; u[idx] = { ...u[idx], time: null, synced: false }; return u; });
    };

    /* Save */
    const saveMutation = useMutation({
        mutationFn: async () => {
            const syncedTokens = lines.filter(l => l.time !== null).map(l => ({ time: l.time!, text: l.text })).sort((a, b) => a.time - b.time);
            if (!syncedTokens.length) throw new Error('Nothing to save');
            const res = await api.patch('/metadata/save-synced-lyrics', { trackId: track.id, syncedTokens });
            return res.data;
        },
        onSuccess: d => showToast(`✅ ${d.message}`),
        onError: (e: any) => showToast(e.response?.data?.message || 'Failed to save', 'error')
    });

    /* LRC export */
    const downloadLrc = () => {
        const synced = lines.filter(l => l.time !== null).sort((a, b) => a.time! - b.time!);
        if (!synced.length) { showToast('No synced lines', 'error'); return; }
        const lrc = synced.map(l => `${formatTimestamp(l.time!)}${l.text}`).join('\n');
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([lrc], { type: 'text/plain' })),
            download: `${track.title.replace(/\s+/g, '_')}.lrc`
        });
        a.click();
    };

    const syncedCount = lines.filter(l => l.synced).length;
    const progressPct = lines.length > 0 ? (syncedCount / lines.length) * 100 : 0;

    return (
        <div className="min-h-screen flex flex-col">
            {/* ── Top bar ──────────────────────────────────────────── */}
            <div className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/[0.06] bg-zinc-950/90 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onBack}
                        className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl shrink-0 w-9 h-9">
                        <ChevronLeft size={18} />
                    </Button>
                    <div className="w-8 h-8 rounded-xl bg-brand flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.3)]">
                        <Mic className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-[15px] font-black text-white leading-tight">{track.title}</h1>
                        <p className="text-[10px] text-zinc-500">{track.artist?.name || track.artistName} · Lyric Sync Studio</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Progress pill */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                        <div className={`w-1.5 h-1.5 rounded-full ${syncedCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                        <span className="text-[11px] font-bold text-zinc-300 tabular-nums">{syncedCount}/{lines.length} synced</span>
                    </div>

                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        onClick={() => saveMutation.mutate()}
                        disabled={syncedCount === 0 || saveMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-black disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ 
                            background: syncedCount > 0 ? 'linear-gradient(135deg, var(--accent-brand), #be123c)' : '#222', 
                            boxShadow: syncedCount > 0 ? '0 4px 16px rgba(var(--accent-brand-rgb), 0.4)' : 'none' 
                        }}
                    >
                        {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {saveMutation.isPending ? 'Saving…' : `Save (${syncedCount})`}
                    </motion.button>
                </div>
            </div>

            {/* ── Main layout ──────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>

                {/* ── Left sidebar: player + controls ────────────────── */}
                <div className="w-full md:w-72 flex-shrink-0 flex flex-col gap-3 md:gap-4 p-4 md:p-5 border-b md:border-b-0 md:border-r border-white/[0.06] bg-black/20 overflow-y-auto max-h-[40vh] md:max-h-none">

                    {/* Album art */}
                    <div className="relative mx-auto w-24 h-24 md:w-44 md:h-44 rounded-2xl overflow-hidden border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] shrink-0">
                        {track.coverUrl ? (
                            <img src={getMediaUrl(track.coverUrl)} alt={track.title} className="w-full h-full object-cover animate-fade-in" />
                        ) : (
                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                <Music2 className="w-12 h-12 text-zinc-700" />
                            </div>
                        )}
                        {isPlaying && (
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1.5px] flex items-end justify-center pb-3 md:pb-6">
                                <div className="flex items-end gap-1 h-8 md:h-12">
                                    {[1, 2, 3, 4, 5, 6, 7].map(i => (
                                        <motion.div key={i} className="w-1 rounded-full bg-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.8)]"
                                            animate={{ height: [4, 18, 8, 24, 10, 16, 4][(i * 2) % 7] }}
                                            transition={{ repeat: Infinity, duration: 0.6 + i * 0.12, ease: 'easeInOut' }} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Timeline scrubber */}
                    <div className="space-y-1">
                        <input type="range" min="0" max={duration || 1} step="0.1" value={currentTime}
                            onChange={e => seek(parseFloat(e.target.value))}
                            className="w-full h-1 rounded-full cursor-pointer accent-rose-600 bg-white/10 appearance-none" />
                        <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Play controls */}
                    <div className="flex items-center justify-center gap-4">
                        <button onClick={() => seek(currentTime - 5)} className="p-2 text-zinc-500 hover:text-white transition-all rounded-lg hover:bg-white/10">
                            <SkipBack size={17} />
                        </button>
                        <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={togglePlay}
                            className="w-13 h-13 w-[52px] h-[52px] rounded-full flex items-center justify-center text-white"
                            style={{ 
                                background: 'linear-gradient(135deg, var(--accent-brand), #be123c)', 
                                boxShadow: '0 0 24px rgba(var(--accent-brand-rgb), 0.45)' 
                            }}>
                            {isPlaying ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" className="ml-0.5" />}
                        </motion.button>
                        <button onClick={() => seek(currentTime + 5)} className="p-2 text-zinc-500 hover:text-white transition-all rounded-lg hover:bg-white/10">
                            <SkipForward size={17} />
                        </button>
                    </div>

                    {/* Speed pills */}
                    <div className="flex gap-1 justify-center flex-wrap">
                        {[0.5, 0.75, 1, 1.25].map(r => (
                            <button key={r} onClick={() => changeRate(r)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${playbackRate === r
                                    ? 'bg-brand/20 border-brand/45 text-brand'
                                    : 'border-transparent text-zinc-600 hover:text-white hover:bg-white/5'}`}>
                                {r}×
                            </button>
                        ))}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-white/[0.06]" />

                    {/* Sync controls */}
                    {!isSyncing ? (
                        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                            onClick={startSync} disabled={lines.length === 0}
                            className="w-full py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 disabled:opacity-40"
                            style={{ 
                                background: 'linear-gradient(135deg, var(--accent-brand), #be123c)', 
                                boxShadow: '0 4px 20px rgba(var(--accent-brand-rgb), 0.35)' 
                            }}>
                            <Zap size={15} /> Start Sync
                        </motion.button>
                    ) : (
                        <button onClick={stopSync}
                            className="w-full py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-all">
                            <Square size={13} /> Stop Sync
                        </button>
                    )}

                    <AnimatePresence>
                        {isSyncing && (
                            <motion.button
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ 
                                    opacity: 1, 
                                    y: 0,
                                    boxShadow: [
                                        '0 0 10px rgba(52,211,153,0.15)',
                                        '0 0 25px rgba(52,211,153,0.45)',
                                        '0 0 10px rgba(52,211,153,0.15)'
                                    ]
                                }}
                                transition={{
                                    y: { duration: 0.2 },
                                    boxShadow: { repeat: Infinity, duration: 2, ease: 'easeInOut' }
                                }}
                                exit={{ opacity: 0, y: 8 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={stampLine}
                                className="w-full py-4 rounded-xl font-black text-[14px] flex items-center justify-center gap-2 border-2 border-dashed border-emerald-500/50 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all"
                            >
                                <Clock size={16} />
                                Stamp Line
                                <kbd className="ml-1 px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-[10px] font-black">Space</kbd>
                            </motion.button>
                        )}
                    </AnimatePresence>

                    <button onClick={() => setShowEditor(e => !e)}
                        className="w-full py-2 rounded-xl text-[11px] font-bold text-zinc-500 hover:text-white hover:bg-white/5 transition-all border border-white/5">
                        {showEditor ? '↑ Hide Lyrics Editor' : '✎ Edit / Paste Lyrics'}
                    </button>

                    <AnimatePresence>
                        {showEditor && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-2">
                                <textarea value={rawInput} onChange={e => setRawInput(e.target.value)}
                                    placeholder="Paste lyrics here — one line per lyric..."
                                    className="w-full h-36 bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] text-zinc-300 resize-none focus:outline-none focus:border-brand/50 font-mono" />
                                <button onClick={applyLyrics}
                                    className="w-full py-2 rounded-xl bg-brand/20 text-brand text-[11px] font-bold border border-brand/30 hover:bg-brand/30 transition-all">
                                    Apply Lyrics →
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Progress bar */}
                    {lines.length > 0 && (
                        <div className="space-y-1">
                            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                <motion.div className="h-full rounded-full bg-gradient-to-r from-brand to-emerald-400"
                                    animate={{ width: `${progressPct}%` }} transition={{ duration: 0.3 }} />
                            </div>
                            <p className="text-[10px] text-zinc-600 text-center font-mono">{Math.round(progressPct)}% synced</p>
                        </div>
                    )}

                    {/* Bottom actions */}
                    <div className="flex flex-col gap-1.5 mt-auto pt-2 border-t border-white/[0.06]">
                        <button onClick={downloadLrc} disabled={syncedCount === 0}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold text-zinc-500 hover:text-brand hover:bg-brand/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-transparent hover:border-brand/20">
                            <Download size={12} /> Export LRC
                        </button>
                        <button onClick={() => setLines(prev => prev.map(l => ({ ...l, time: null, synced: false })))}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent">
                            <RotateCcw size={12} /> Reset All Timestamps
                        </button>
                    </div>
                </div>

                {/* ── Right: Lyrics list ────────────────────────────────── */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Instruction banner */}
                    <div className="px-6 py-3 border-b border-white/[0.05] bg-white/[0.015]">
                        {isSyncing ? (
                            <div className="flex items-center gap-2">
                                <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 0.9 }}
                                    className="w-2 h-2 rounded-full bg-emerald-400" />
                                <span className="text-[11px] text-emerald-300 font-bold">
                                    SYNCING — Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px]">Space</kbd> or click a line when it starts singing
                                </span>
                            </div>
                        ) : (
                            <span className="text-[11px] text-zinc-600 font-medium">
                                {syncedCount > 0
                                    ? `${syncedCount} of ${lines.length} lines synced — click any timestamped line to seek audio`
                                    : 'Click "Start Sync" on the left, then press Space for each lyric line as it plays'}
                            </span>
                        )}
                    </div>

                    {/* Lyrics */}
                    <div ref={lyricsRef} className="flex-1 overflow-y-auto p-5 space-y-1 custom-scrollbar">
                        {lines.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <Music2 className="w-7 h-7 text-zinc-600" />
                                </div>
                                <div>
                                    <p className="text-zinc-400 font-bold text-sm">No lyrics loaded</p>
                                    <p className="text-zinc-600 text-xs mt-1">Click "Edit / Paste Lyrics" on the left panel to add lyrics</p>
                                </div>
                            </div>
                        ) : (
                            lines.map((line, idx) => {
                                const isActive = isSyncing && idx === currentIdx;
                                const isSynced = line.synced && line.time !== null;

                                return (
                                    <motion.div key={idx} layout
                                        animate={isActive ? {
                                            boxShadow: [
                                                '0 0 12px rgba(var(--accent-brand-rgb), 0.05)',
                                                '0 0 24px rgba(var(--accent-brand-rgb), 0.22)',
                                                '0 0 12px rgba(var(--accent-brand-rgb), 0.05)'
                                            ],
                                            borderColor: [
                                                'rgba(var(--accent-brand-rgb), 0.25)',
                                                'rgba(var(--accent-brand-rgb), 0.55)',
                                                'rgba(var(--accent-brand-rgb), 0.25)'
                                            ]
                                        } : {}}
                                        transition={isActive ? { repeat: Infinity, duration: 2, ease: 'easeInOut' } : {}}
                                        className={`group flex items-center gap-3 px-5 py-3.5 rounded-xl cursor-pointer transition-all duration-150 border ${isActive
                                                ? 'bg-brand/12'
                                                : isSynced
                                                    ? 'bg-emerald-500/5 border-emerald-500/15 hover:bg-emerald-500/10'
                                                    : 'border-transparent hover:bg-white/[0.03]'}`}
                                        onClick={() => {
                                            if (isSyncing) { setCurrentIdx(idx); stampLine(); }
                                            else if (line.time !== null) seek(line.time);
                                        }}
                                    >
                                        {/* Line number */}
                                        <span className="text-[10px] font-mono text-zinc-700 w-7 text-right flex-shrink-0">{idx + 1}</span>

                                        {/* Status dot */}
                                        <div className="w-5 flex items-center justify-center flex-shrink-0">
                                            {isActive ? (
                                                <motion.div 
                                                    animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }} 
                                                    transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                                                    className="w-2.5 h-2.5 rounded-full bg-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.8)]" 
                                                />
                                            ) : isSynced ? (
                                                <CheckCircle2 size={14} className="text-emerald-400" />
                                            ) : (
                                                <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                                            )}
                                        </div>

                                        {/* Text */}
                                        <span className={`flex-1 text-[13.5px] leading-relaxed font-medium ${isActive ? 'text-white font-bold' : isSynced ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                            {line.text}
                                        </span>

                                        {/* Timestamp */}
                                        {line.time !== null && (
                                            <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 group-hover:text-zinc-400 transition-colors tabular-nums">
                                                {formatTime(line.time)}
                                            </span>
                                        )}

                                        {/* Clear */}
                                        {isSynced && !isSyncing && (
                                            <button onClick={e => { e.stopPropagation(); clearLine(idx); }}
                                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-700 hover:text-red-400 transition-all">
                                                <Trash2 size={11} />
                                            </button>
                                        )}
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Audio */}
            <audio ref={audioRef} src={getMediaUrl(track.audioUrl)} crossOrigin="anonymous" preload="metadata"
                onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
                onEnded={() => { setIsPlaying(false); setIsSyncing(false); }}
                className="hidden" />

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-[13px] font-bold shadow-2xl border backdrop-blur-xl ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'}`}>
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
