"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Play, Pause, Square, SkipBack, SkipForward, Mic, Music2,
    Save, Download, RotateCcw, Trash2, CheckCircle2, Clock,
    ChevronLeft, ChevronRight, Zap, Loader2, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';

interface SyncedLine {
    time: number | null;
    text: string;
    synced: boolean;
}

interface LyricSyncStudioProps {
    track: {
        id: string;
        title: string;
        artistName?: string;
        artist?: { name: string };
        audioUrl: string;
        coverUrl?: string;
        duration?: number;
        lyrics?: string;
        synced_lyrics?: Array<{ time: number; text: string }>;
    };
    onClose: () => void;
    onSaved?: () => void;
}

export function LyricSyncStudio({ track, onClose, onSaved }: LyricSyncStudioProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const lyricsContainerRef = useRef<HTMLDivElement>(null);

    // audio state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(track.duration || 0);
    const [playbackRate, setPlaybackRate] = useState(1);

    // sync state
    const [isSyncing, setIsSyncing] = useState(false);
    const [currentLineIndex, setCurrentLineIndex] = useState(0);
    const [lines, setLines] = useState<SyncedLine[]>([]);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [rawLyricsInput, setRawLyricsInput] = useState('');
    const [showLyricsEditor, setShowLyricsEditor] = useState(false);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Initialize lines from track data
    useEffect(() => {
        const existingSynced = track.synced_lyrics;
        const rawLyrics = track.lyrics || '';

        if (existingSynced && existingSynced.length > 0) {
            setLines(existingSynced.map(l => ({ time: l.time, text: l.text, synced: true })));
            setRawLyricsInput(existingSynced.map(l => l.text).join('\n'));
        } else if (rawLyrics) {
            const parsed = rawLyrics.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.startsWith('['));
            setLines(parsed.map(text => ({ time: null, text, synced: false })));
            setRawLyricsInput(rawLyrics);
        }
    }, [track]);

    // ── Audio controls ─────────────────────────────────────────────────────────
    const togglePlay = useCallback(() => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(p => !p);
    }, [isPlaying]);

    const seek = useCallback((seconds: number) => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = Math.max(0, Math.min(seconds, duration));
    }, [duration]);

    const skipBack = () => seek(currentTime - 5);
    const skipForward = () => seek(currentTime + 5);

    const changeRate = (rate: number) => {
        if (audioRef.current) audioRef.current.playbackRate = rate;
        setPlaybackRate(rate);
    };

    // ── Sync logic ─────────────────────────────────────────────────────────────
    const startSync = () => {
        if (lines.length === 0) {
            showToast('Paste your lyrics first', 'error');
            return;
        }
        setIsSyncing(true);
        setCurrentLineIndex(0);
        // Reset all synced state
        setLines(prev => prev.map(l => ({ ...l, synced: false, time: null })));
        if (!isPlaying && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
            setIsPlaying(true);
        }
        showToast('Sync started — tap each line as it plays!');
    };

    const stopSync = () => {
        setIsSyncing(false);
        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        }
    };

    // Stamp current line with current timestamp
    const stampCurrentLine = useCallback(() => {
        if (!isSyncing) return;
        const time = audioRef.current?.currentTime ?? currentTime;

        setLines(prev => {
            const updated = [...prev];
            updated[currentLineIndex] = { ...updated[currentLineIndex], time, synced: true };
            return updated;
        });

        const nextIdx = currentLineIndex + 1;
        if (nextIdx < lines.length) {
            setCurrentLineIndex(nextIdx);
            // Auto-scroll
            const container = lyricsContainerRef.current;
            if (container) {
                const el = container.children[nextIdx] as HTMLElement;
                el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        } else {
            // All lines synced
            setIsSyncing(false);
            if (audioRef.current) audioRef.current.pause();
            setIsPlaying(false);
            showToast(`✅ All ${lines.length} lines synced! Hit Save.`);
        }
    }, [isSyncing, currentLineIndex, lines.length, currentTime]);

    // Keyboard shortcut: Space to stamp
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!isSyncing) return;
            if (e.code === 'Space' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault();
                stampCurrentLine();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isSyncing, stampCurrentLine]);

    // Manually clear a line's timestamp
    const clearLineStamp = (idx: number) => {
        setLines(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], time: null, synced: false };
            return updated;
        });
    };

    // Manually click a line to jump audio + mark it
    const clickLine = (idx: number) => {
        if (isSyncing) {
            // If a prior line was clicked, jump back to that line
            setCurrentLineIndex(idx);
            stampCurrentLine();
        } else {
            // Just seek audio if line has a timestamp
            if (lines[idx].time !== null) {
                seek(lines[idx].time!);
            }
        }
    };

    // Apply raw lyrics from textarea
    const applyRawLyrics = () => {
        const parsed = rawLyricsInput.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('['));
        setLines(parsed.map(text => ({ time: null, text, synced: false })));
        setShowLyricsEditor(false);
        showToast(`${parsed.length} lyric lines loaded`);
    };

    // ── Save to backend ─────────────────────────────────────────────────────────
    const saveMutation = useMutation({
        mutationFn: async () => {
            const syncedTokens = lines
                .filter(l => l.time !== null)
                .map(l => ({ time: l.time!, text: l.text }))
                .sort((a, b) => a.time - b.time);

            if (syncedTokens.length === 0) throw new Error('No synced lines to save');

            const res = await api.patch('/metadata/save-synced-lyrics', {
                trackId: track.id,
                syncedTokens,
            });
            return res.data;
        },
        onSuccess: (data) => {
            showToast(`✅ ${data.message}`);
            onSaved?.();
        },
        onError: (err: any) => {
            showToast(err.response?.data?.message || 'Failed to save', 'error');
        }
    });

    // ── Download LRC ────────────────────────────────────────────────────────────
    const downloadLrc = () => {
        const syncedLines = lines.filter(l => l.time !== null).sort((a, b) => a.time! - b.time!);
        if (syncedLines.length === 0) { showToast('No synced lines to export', 'error'); return; }

        const lrc = syncedLines.map(l => {
            const mins = Math.floor(l.time! / 60);
            const secs = Math.floor(l.time! % 60);
            const ms = Math.round((l.time! % 1) * 100);
            return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${l.text}`;
        }).join('\n');

        const blob = new Blob([lrc], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${track.title.replace(/\s+/g, '_')}.lrc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const syncedCount = lines.filter(l => l.synced).length;
    const progress = lines.length > 0 ? (syncedCount / lines.length) * 100 : 0;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-xl p-0 md:p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className="w-full max-w-4xl h-full max-h-screen md:max-h-[95vh] flex flex-col rounded-none md:rounded-[28px] overflow-hidden border border-white/10 shadow-[0_32px_80px_rgba(0,0,0,0.8)]"
                style={{ background: 'linear-gradient(135deg, #0a0a0b 0%, #121214 50%, #08080a 100%)' }}
            >
                {/* ── Header ─────────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-white/[0.07] bg-white/[0.02] backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand to-[#be123c] flex items-center justify-center shadow-[0_0_12px_rgba(var(--accent-brand-rgb),0.4)] animate-pulse">
                            <Mic className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-[13px] font-black uppercase tracking-[0.15em] text-white/90">Lyric Sync Studio</h2>
                            <p className="text-[10px] text-zinc-500 font-medium truncate max-w-[150px] md:max-w-none">{track.title} · {track.artist?.name || track.artistName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Progress pill */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ opacity: syncedCount > 0 ? 1 : 0.3 }} />
                            <span className="text-[11px] font-bold text-zinc-300 tabular-nums">{syncedCount}/{lines.length}</span>
                        </div>
                        <Button onClick={onClose} variant="ghost" size="icon"
                            className="w-8 h-8 rounded-full text-zinc-500 hover:text-white hover:bg-white/10">
                            ✕
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                    {/* ── Left: Audio Player + Controls ─────────────────────── */}
                    <div className="w-full md:w-72 flex-shrink-0 flex flex-col p-4 md:p-5 gap-3 md:gap-4 border-b md:border-b-0 md:border-r border-white/[0.07] bg-black/20 overflow-y-auto max-h-[40vh] md:max-h-none">
                        {/* Cover art */}
                        <div className="relative mx-auto w-24 h-24 md:w-36 md:h-36 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10 flex-shrink-0">
                            {track.coverUrl ? (
                                <img src={getMediaUrl(track.coverUrl)} alt={track.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                    <Music2 className="w-10 h-10 text-zinc-600" />
                                </div>
                            )}
                            {isPlaying && (
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1.5px] flex items-end justify-center pb-3 md:pb-6">
                                    <div className="flex items-end gap-1 h-8 md:h-12">
                                        {[1, 2, 3, 4, 5, 6, 7].map(i => (
                                            <motion.div key={i} className="w-1 rounded-full bg-brand shadow-[0_0_8px_rgba(var(--accent-brand-rgb),0.8)]"
                                                animate={{ height: [4, 18, 8, 24, 10, 16, 4][(i * 2) % 7] }}
                                                transition={{ repeat: Infinity, duration: 0.6 + i * 0.12, ease: 'easeInOut' }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Timeline */}
                        <div className="space-y-1">
                            <input
                                type="range" min="0" max={duration || 1} step="0.1" value={currentTime}
                                onChange={e => seek(parseFloat(e.target.value))}
                                className="w-full h-1 appearance-none rounded-full cursor-pointer accent-rose-600 bg-white/10"
                            />
                            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                                <span>{formatTime(currentTime)}</span>
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>

                        {/* Play controls */}
                        <div className="flex items-center justify-center gap-3">
                            <button onClick={skipBack} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                                <SkipBack size={16} />
                            </button>
                            <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={togglePlay}
                                className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-brand to-[#be123c] shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.4)] text-white"
                            >
                                {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" className="ml-0.5" />}
                            </motion.button>
                            <button onClick={skipForward} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
                                <SkipForward size={16} />
                            </button>
                        </div>

                        {/* Playback rate */}
                        <div className="flex gap-1 justify-center">
                            {[0.5, 0.75, 1, 1.25].map(rate => (
                                <button key={rate} onClick={() => changeRate(rate)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${playbackRate === rate
                                        ? 'bg-brand/20 border-brand/45 text-brand'
                                        : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}>
                                    {rate}×
                                </button>
                            ))}
                        </div>

                        {/* Sync controls */}
                        <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                            {!isSyncing ? (
                                <motion.button
                                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                                    onClick={startSync}
                                    disabled={lines.length === 0}
                                    className="w-full py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    style={{ background: 'linear-gradient(135deg, var(--accent-brand), #be123c)', boxShadow: '0 4px 20px rgba(var(--accent-brand-rgb), 0.35)' }}
                                >
                                    <Zap size={15} />
                                    Start Sync
                                </motion.button>
                            ) : (
                                <button onClick={stopSync}
                                    className="w-full py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all">
                                    <Square size={14} />
                                    Stop Sync
                                </button>
                            )}

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
                                    whileTap={{ scale: 0.96 }}
                                    onClick={stampCurrentLine}
                                    className="w-full py-4 rounded-xl font-black text-[14px] flex items-center justify-center gap-2 border-2 border-dashed border-emerald-500/50 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all"
                                >
                                    <Clock size={15} />
                                    Stamp Line (Space)
                                </motion.button>
                            )}

                            <button onClick={() => setShowLyricsEditor(e => !e)}
                                className="w-full py-2 rounded-xl text-[11px] font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all">
                                {showLyricsEditor ? 'Hide Editor' : 'Edit Lyrics'}
                            </button>
                        </div>

                        {/* Lyrics editor panel */}
                        <AnimatePresence>
                            {showLyricsEditor && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                    <textarea
                                        value={rawLyricsInput}
                                        onChange={e => setRawLyricsInput(e.target.value)}
                                        placeholder="Paste lyrics here, one line per lyric..."
                                        className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] text-zinc-300 resize-none focus:outline-none focus:border-brand/50 font-mono"
                                    />
                                    <button onClick={applyRawLyrics}
                                        className="w-full py-2 mt-1 rounded-xl bg-brand/20 text-brand text-[11px] font-bold border border-brand/30 hover:bg-brand/30 transition-all">
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
                                        animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
                                </div>
                                <p className="text-[10px] text-zinc-600 text-center font-mono">{Math.round(progress)}% synced</p>
                            </div>
                        )}
                    </div>

                    {/* ── Right: Lyrics List ─────────────────────────────────── */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Instruction bar */}
                        <div className="px-5 py-3 border-b border-white/[0.07] bg-white/[0.02]">
                            {isSyncing ? (
                                <div className="flex items-center gap-2">
                                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}
                                        className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <span className="text-[11px] text-emerald-300 font-bold">
                                        SYNCING — Tap line or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px]">Space</kbd> when each line starts
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[11px] text-zinc-500">
                                    {syncedCount > 0
                                        ? `${syncedCount} lines synced — click any line to seek audio`
                                        : 'Hit "Start Sync" then tap each line as it plays in the audio'}
                                </span>
                            )}
                        </div>

                        {/* Lines list */}
                        <div ref={lyricsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
                            {lines.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    <Music2 className="w-10 h-10 text-zinc-700 mb-3" />
                                    <p className="text-zinc-500 text-sm font-medium">No lyrics loaded</p>
                                    <p className="text-zinc-600 text-xs mt-1">Click "Edit Lyrics" to paste your lyrics</p>
                                </div>
                            ) : (
                                lines.map((line, idx) => {
                                    const isCurrentSync = isSyncing && idx === currentLineIndex;
                                    const isSynced = line.synced && line.time !== null;

                                    return (
                                        <motion.div
                                            key={idx}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={isCurrentSync ? {
                                                opacity: 1,
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
                                            } : { opacity: 1 }}
                                            transition={isCurrentSync ? { repeat: Infinity, duration: 2, ease: 'easeInOut' } : {}}
                                            className={`group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-150 border ${isCurrentSync
                                                    ? 'bg-brand/12'
                                                    : isSynced
                                                        ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                                                        : 'border-transparent hover:bg-white/[0.04]'}`}
                                            onClick={() => clickLine(idx)}
                                        >
                                            {/* Index */}
                                            <span className="text-[10px] font-mono text-zinc-700 w-6 text-right flex-shrink-0">{idx + 1}</span>

                                            {/* Status indicator */}
                                            <div className="w-5 flex-shrink-0 flex items-center justify-center">
                                                {isCurrentSync ? (
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

                                            {/* Lyric text */}
                                            <span className={`flex-1 text-[13px] leading-relaxed ${isCurrentSync
                                                    ? 'text-white font-bold'
                                                    : isSynced
                                                        ? 'text-zinc-300'
                                                        : 'text-zinc-500'}`}>
                                                {line.text}
                                            </span>

                                            {/* Timestamp badge */}
                                            {line.time !== null && (
                                                <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 group-hover:text-zinc-400 transition-colors">
                                                    {formatTime(line.time)}
                                                </span>
                                            )}

                                            {/* Clear button */}
                                            {isSynced && !isSyncing && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); clearLineStamp(idx); }}
                                                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition-all"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            )}
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>

                        {/* ── Bottom action bar ──────────────────────────────── */}
                        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.07] bg-black/20 gap-3">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setLines(prev => prev.map(l => ({ ...l, time: null, synced: false })))}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-zinc-500 hover:text-white hover:bg-white/5 transition-all">
                                    <RotateCcw size={12} /> Reset All
                                </button>
                                <button onClick={downloadLrc}
                                    disabled={syncedCount === 0}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-zinc-500 hover:text-brand hover:bg-brand/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                    <Download size={12} /> Export LRC
                                </button>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={() => saveMutation.mutate()}
                                disabled={syncedCount === 0 || saveMutation.isPending}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                style={{ background: syncedCount > 0 ? 'linear-gradient(135deg, var(--accent-brand), #be123c)' : '#333', boxShadow: syncedCount > 0 ? '0 4px 20px rgba(var(--accent-brand-rgb), 0.35)' : 'none' }}
                            >
                                {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {saveMutation.isPending ? 'Saving…' : `Save to Zenify (${syncedCount})`}
                            </motion.button>
                        </div>
                    </div>
                </div>

                {/* Hidden audio element */}
                <audio
                    ref={audioRef}
                    src={getMediaUrl(track.audioUrl)}
                    crossOrigin="anonymous"
                    preload="metadata"
                    onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
                    onEnded={() => { setIsPlaying(false); setIsSyncing(false); }}
                    className="hidden"
                />
            </motion.div>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-2xl text-[13px] font-bold shadow-2xl border backdrop-blur-xl ${toast.type === 'error'
                            ? 'bg-red-500/10 border-red-500/20 text-red-300'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'}`}>
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
