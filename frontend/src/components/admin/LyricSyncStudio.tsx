"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
 Play, Pause, Square, SkipBack, SkipForward, Mic, Music2,
 Save, Download, RotateCcw, Trash2, CheckCircle2, Clock,
 ChevronLeft, Zap, Loader2, AlertCircle, Sparkles, Undo2, Redo2,
 FileText, Layers, Sliders, ClipboardCopy, Plus, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { KaraokePainterView } from './KaraokePainterView';
import { MarqueeText } from '../shared/MarqueeText';
import * as Slider from "@radix-ui/react-slider";

export interface SyncedWord {
 word: string;
 time: number;
 endTime?: number;
}

export interface SyncedLine {
 time: number | null;
 endTime?: number;
 text: string;
 synced: boolean;
 words?: SyncedWord[];
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

 // Audio state
 const [isPlaying, setIsPlaying] = useState(false);
 const [currentTime, setCurrentTime] = useState(0);
 const [duration, setDuration] = useState(track.duration || 0);
 const [playbackRate, setPlaybackRate] = useState(1);
 const [volume, setVolume] = useState(0.8);

 // Redesign Layout States
 const [viewMode, setViewMode] = useState<'list' | 'karaoke'>('list');
 const [isMobile, setIsMobile] = useState(false);
 const [showMobileSettings, setShowMobileSettings] = useState(false);
 const [isEditMode, setIsEditMode] = useState(false);

 const lyricVersions = Array.isArray(track.lyric_versions) ? track.lyric_versions : [];
 const [activeLang, setActiveLang] = useState<string>(
     lyricVersions.length > 0 ? lyricVersions[0].language : 'English'
 );

 // Sync State
 const [lines, _setLines] = useState<SyncedLine[]>([]);
 const [past, setPast] = useState<SyncedLine[][]>([]);
 const [future, setFuture] = useState<SyncedLine[][]>([]);
 const [selectedLineIdx, setSelectedLineIdx] = useState<number | null>(null);

 const setLines = useCallback((value: React.SetStateAction<SyncedLine[]>) => {
 _setLines(value);
 }, []);

 // ── History & Undo/Redo Stacks ──
 const commitHistory = useCallback(() => {
 setPast(p => {
 const newPast = [...p, lines];
 if (newPast.length > 50) return newPast.slice(newPast.length - 50);
 return newPast;
 });
 setFuture([]);
 }, [lines]);

 const undo = useCallback(() => {
 if (past.length === 0) return;
 const previous = past[past.length - 1];
 setPast(p => p.slice(0, -1));
 setFuture(f => [lines, ...f]);
 _setLines(previous);
 }, [past, lines]);

 const redo = useCallback(() => {
 if (future.length === 0) return;
 const next = future[0];
 setFuture(f => f.slice(1));
 setPast(p => [...p, lines]);
 _setLines(next);
 }, [future, lines]);

 const [isSyncing, setIsSyncing] = useState(false);
 const [currentLineIndex, setCurrentLineIndex] = useState(0);
 const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
 const [rawLyricsInput, setRawLyricsInput] = useState('');
 const [showLyricsEditor, setShowLyricsEditor] = useState(false);
 const [shiftOffset, setShiftOffset] = useState(0);
 const [lyricsImportUrl, setLyricsImportUrl] = useState('');
 const [isImportingLyrics, setIsImportingLyrics] = useState(false);
 const [importStatusStep, setImportStatusStep] = useState<string | null>(null);
 const isSpaceDownRef = useRef(false);

 // Detect responsive viewport
 useEffect(() => {
 const checkMobile = () => setIsMobile(window.innerWidth < 768);
 checkMobile();
 window.addEventListener('resize', checkMobile);
 return () => window.removeEventListener('resize', checkMobile);
 }, []);

 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type });
 setTimeout(() => setToast(null), 3000);
 };

 // Initialize lines
 useEffect(() => {
  let existingSynced = track.synced_lyrics as any;
  let rawLyrics = track.lyrics || '';

  if (lyricVersions.length > 0) {
      const version = lyricVersions.find((v: any) => v.language === activeLang);
      if (version) {
          existingSynced = version.syncedLyrics;
          rawLyrics = version.plainLyrics || '';
      }
  }

  if (typeof existingSynced === 'string') {
    try {
      existingSynced = JSON.parse(existingSynced);
    } catch (e) {
      console.error("Failed to parse synced_lyrics:", e);
      existingSynced = null;
    }
  }

  if (existingSynced && Array.isArray(existingSynced) && existingSynced.length > 0) {
    setLines(existingSynced.map((l: any) => ({ 
      time: l.time ?? null, 
      endTime: l.endTime,
      text: l.text, 
      synced: l.time !== null,
      words: l.words
    })));
    setRawLyricsInput(existingSynced.map(l => {
      if (l.time !== null && l.time !== undefined) {
        const mins = Math.floor(l.time / 60);
        const secs = Math.floor(l.time % 60);
        const ms = Math.round((l.time % 1) * 100);
        return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${l.text}`;
      }
      return l.text;
    }).join('\n'));
  } else if (rawLyrics) {
    const parsed = rawLyrics.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const parsedLines = parsed.map(line => {
      const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if (match) {
        const mins = parseInt(match[1]);
        const secs = parseFloat(match[2]);
        const text = match[3].trim();
        const time = mins * 60 + secs;
        return { time, text, synced: true };
      }
      if (line.startsWith('[') && line.includes(':') && line.endsWith(']')) {
        return null; // Skip metadata tags
      }
      return { time: null, text: line, synced: false };
    }).filter(Boolean) as SyncedLine[];

    setLines(parsedLines);
    setRawLyricsInput(rawLyrics);
  } else {
    setLines([]);
    setRawLyricsInput('');
  }
  }, [track, activeLang]);

 // Handle Volume Changes
 useEffect(() => {
 if (audioRef.current) {
 audioRef.current.volume = volume;
 }
 }, [volume]);

 // Audio playback toggle
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (!track.audioUrl) {
        showToast("No audio stream is available.", "error");
        return;
      }
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.error("LyricSync playback failed:", err);
            setIsPlaying(false);
            showToast("Could not play the audio stream.", "error");
          });
      } else {
        setIsPlaying(true);
      }
    }
  }, [isPlaying, track.audioUrl]);

 const seek = useCallback((seconds: number) => {
 if (!audioRef.current) return;
 audioRef.current.currentTime = Math.max(0, Math.min(seconds, duration));
 }, [duration]);

 // ── Rewind / Forward Jump Timers ──
 const handleSkip = (dir: 'back' | 'forward', seconds: number) => {
 const delta = dir === 'back' ? -seconds : seconds;
 seek(currentTime + delta);
 };

 // Long press skipping emulation via simple timeout triggers
 const skipTimer = useRef<NodeJS.Timeout | null>(null);
 const triggerLongPressSkip = (dir: 'back' | 'forward') => {
 handleSkip(dir, 10);
 showToast(dir === 'back' ? "↩ Jumped back 10s" : "↪ Jumped forward 10s");
 };

 const cyclePlaybackSpeed = () => {
 const speeds = [1, 0.75, 0.5, 0.25];
 const currentIdx = speeds.indexOf(playbackRate);
 const nextIdx = (currentIdx + 1) % speeds.length;
 const nextSpeed = speeds[nextIdx];
 if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
 setPlaybackRate(nextSpeed);
 };

 const copyTimeTextToClipboard = () => {
 const mins = Math.floor(currentTime / 60);
 const secs = Math.floor(currentTime % 60);
 const text = `${mins}:${String(secs).padStart(2, '0')}`;
 navigator.clipboard.writeText(text);
 showToast("Timestamp copied to clipboard!");
 };

 // ── Stamping Logic ──
 const handleStampStart = useCallback(() => {
   if (!isSyncing || !isPlaying) return;
   const time = audioRef.current?.currentTime ?? currentTime;
   commitHistory();
   setLines(prev => {
     const updated = [...prev];
     updated[currentLineIndex] = {
       ...updated[currentLineIndex],
       time: time,
       synced: false
     };
     return updated;
   });
 }, [isSyncing, isPlaying, currentLineIndex, currentTime, commitHistory]);

 const handleStampEnd = useCallback(() => {
   if (!isSyncing || !isPlaying) return;
   const time = audioRef.current?.currentTime ?? currentTime;
   
   setLines(prev => {
     const updated = [...prev];
     const currentLine = updated[currentLineIndex];
     const startTime = currentLine.time !== null ? currentLine.time : Math.max(0, time - 0.5);
     updated[currentLineIndex] = {
       ...currentLine,
       time: startTime,
       endTime: time,
       synced: true
     };
     return updated;
   });

   const nextIdx = currentLineIndex + 1;
   if (nextIdx < lines.length) {
     setCurrentLineIndex(nextIdx);
     // Smooth focus scroll
     const container = lyricsContainerRef.current;
     if (container) {
       const el = container.children[nextIdx] as HTMLElement;
       el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
     }
   } else {
     setIsSyncing(false);
     if (audioRef.current) audioRef.current.pause();
     setIsPlaying(false);
     showToast(`✅ Synced all ${lines.length} lines! Ready to save.`);
   }
 }, [isSyncing, isPlaying, currentLineIndex, lines.length, currentTime]);

 // Keyboard Spacebar Stamping
 useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isSyncing) return;
    if (e.code === 'Space' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      if (!isPlaying) {
        togglePlay();
        return;
      }
      if (!isSpaceDownRef.current) {
        isSpaceDownRef.current = true;
        handleStampStart();
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (!isSyncing) return;
    if (e.code === 'Space' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      if (isSpaceDownRef.current) {
        isSpaceDownRef.current = false;
        handleStampEnd();
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
 }, [isSyncing, isPlaying, handleStampStart, handleStampEnd, togglePlay]);

 const startSync = () => {
 if (lines.length === 0) {
 showToast('No lyrics found to sync', 'error');
 return;
 }
 setIsSyncing(true);
 setCurrentLineIndex(0);
 commitHistory();
 setLines(prev => prev.map(l => ({ ...l, synced: false, time: null })));
    if (!isPlaying && audioRef.current) {
      audioRef.current.currentTime = 0;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.error("LyricSync startSync playback failed:", err);
            setIsPlaying(false);
            showToast("Could not play the audio stream to start sync.", "error");
          });
      } else {
        setIsPlaying(true);
      }
    }
 showToast('Sync started — press and hold SPACE to stamp lines!');
 };

 const stopSync = () => {
 setIsSyncing(false);
 if (audioRef.current) {
 audioRef.current.pause();
 setIsPlaying(false);
 }
 };

 const clearLineStamp = (idx: number) => {
 commitHistory();
 setLines(prev => {
 const updated = [...prev];
 updated[idx] = { ...updated[idx], time: null, endTime: undefined, words: [], synced: false };
 return updated;
 });
 if (idx < currentLineIndex) {
 setCurrentLineIndex(idx);
 }
 };

  const clickLine = (idx: number) => {
  if (isSyncing) {
    // Stamping is handled by pointerdown/pointerup
  } else if (isEditMode) {
    const time = audioRef.current?.currentTime ?? currentTime;
    commitHistory();
    setLines(prev => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        time: time,
        synced: true
      };
      return updated;
    });
    showToast(`Stamped line ${idx + 1} at ${formatProgressTime(time)}`);
  } else {
    setSelectedLineIdx(idx);
    if (lines[idx].time !== null) {
      seek(lines[idx].time!);
    }
  }
  };

 const nudgeTime = (type: 'start' | 'end', delta: number) => {
   if (selectedLineIdx === null) return;
   commitHistory();
   setLines(prev => {
     const updated = [...prev];
     const line = updated[selectedLineIdx];
     if (type === 'start') {
       const currentVal = line.time ?? 0;
       updated[selectedLineIdx] = {
         ...line,
         time: Math.max(0, Number((currentVal + delta).toFixed(3)))
       };
     } else {
       const currentVal = line.endTime ?? line.time ?? 0;
       updated[selectedLineIdx] = {
         ...line,
         endTime: Math.max(0, Number((currentVal + delta).toFixed(3)))
       };
     }
     return updated;
   });
 };

  const applyRawLyrics = () => {
    commitHistory();
    const parsed = rawLyricsInput.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const newLines = parsed.map(line => {
      const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if (match) {
        const mins = parseInt(match[1]);
        const secs = parseFloat(match[2]);
        const text = match[3].trim();
        const time = mins * 60 + secs;
        return { time, text, synced: true };
      }
      if (line.startsWith('[') && line.includes(':') && line.endsWith(']')) {
        return null; // Skip metadata tags like [ar: Artist]
      }
      return { time: null, text: line, synced: false };
    }).filter(Boolean) as SyncedLine[];

    setLines(newLines);
    setShowLyricsEditor(false);
    showToast(`${newLines.length} lyric lines loaded`);
  };

 // ── Save to Backend ──
 const saveMutation = useMutation({
 mutationFn: async () => {
  const syncedTokens = lines.map(l => ({ 
    time: l.time, 
    endTime: l.endTime,
    text: l.text,
    words: l.words,
    synced: l.time !== null
  }));

  if (lines.length === 0) throw new Error('Add at least one line of lyrics before saving');

  const res = await api.patch('/metadata/save-synced-lyrics', {
    trackId: track.id,
    syncedTokens,
    language: activeLang,
  });
  return res.data;
 },
 onSuccess: (data) => {
 showToast(`Saved ${lines.length} synced lyric lines successfully!`);
 onSaved?.();
 },
 onError: (err: any) => {
 showToast(err.message || 'Failed to save', 'error');
 }
 });

 // LRC Export
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

 // JSON Export
 const downloadJson = () => {
 const blob = new Blob([JSON.stringify(lines, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `${track.title.replace(/\s+/g, '_')}.json`;
 a.click();
 URL.revokeObjectURL(url);
 };

 // Auto Import / Search
 const handleImportLyrics = async () => {
 const trimmed = lyricsImportUrl.trim();
 if (!trimmed) { showToast('Enter URL to import', 'error'); return; }

 setIsImportingLyrics(true);
 setImportStatusStep("Importing from custom URL...");
 try {
 const res = await api.post('/metadata/import-lyrics', {
 url: trimmed,
 title: track.title,
 artist: track.artist?.name || track.artistName,
 duration: duration
 });

 const data = res.data;
 if (data.success) {
 commitHistory();
 if (data.syncedLyrics && data.syncedLyrics.length > 0) {
 setLines(data.syncedLyrics.map((l: any) => ({ time: l.time, text: l.text, synced: true })));
 showToast("Synced lyrics imported successfully!");
 } else if (data.plainLyrics) {
 const parsed = data.plainLyrics.split('\n')
 .map((l: any) => l.trim())
 .filter((l: any) => l.length > 0 && !l.startsWith('['));
 setLines(parsed.map((text: string) => ({ time: null, text, synced: false })));
 setRawLyricsInput(data.plainLyrics);
 showToast("Plain lyrics imported successfully!");
 }
 setLyricsImportUrl('');
 }
 } catch (err: any) {
 showToast('Failed to import lyrics', 'error');
 } finally {
 setIsImportingLyrics(false);
 setImportStatusStep(null);
 }
 };

 const handleAutoSearchLyrics = async () => {
 setIsImportingLyrics(true);
 setImportStatusStep("Searching synced APIs...");
 try {
 const res = await api.post('/metadata/import-lyrics', {
 title: track.title,
 artist: track.artist?.name || track.artistName,
 duration: duration
 });

 const data = res.data;
 if (data.success) {
 commitHistory();
 if (data.syncedLyrics && data.syncedLyrics.length > 0) {
 setLines(data.syncedLyrics.map((l: any) => ({ time: l.time, text: l.text, synced: true })));
 showToast("Synced lyrics loaded!");
 } else if (data.plainLyrics) {
 const parsed = data.plainLyrics.split('\n')
 .map((l: any) => l.trim())
 .filter((l: any) => l.length > 0 && !l.startsWith('['));
 setLines(parsed.map((text: string) => ({ time: null, text, synced: false })));
 setRawLyricsInput(data.plainLyrics);
 showToast("Found plain lyrics online!");
 }
 }
 } catch (err) {
 showToast('No lyrics found online', 'error');
 } finally {
 setIsImportingLyrics(false);
 setImportStatusStep(null);
 }
 };

  const autoDistributeSync = () => {
    if (lines.length === 0) {
      showToast('No lines to sync. Paste lyrics first.', 'error');
      return;
    }
    
    const startOffset = duration * 0.05;
    const endOffset = duration * 0.95;
    const singingDuration = endOffset - startOffset;
    
    const totalChars = lines.reduce((acc, line) => acc + line.text.length, 0);
    
    if (totalChars === 0) return;
    
    commitHistory();
    let currentTimeAccumulator = startOffset;
    
    const newLines = lines.map(line => {
      if (line.text.trim() === '') {
        return { ...line, time: currentTimeAccumulator, synced: true };
      }
      const lineDuration = (line.text.length / totalChars) * singingDuration;
      const assignedTime = currentTimeAccumulator;
      currentTimeAccumulator += lineDuration;
      return {
        ...line,
        time: Number(assignedTime.toFixed(3)),
        synced: true
      };
    });
    
    setLines(newLines);
    showToast('✨ Auto-distributed timestamps based on text length!');
  };

  const applyGlobalShiftOffset = (offset: number) => {
  if (offset === 0) return;
  commitHistory();
  setLines(prev => prev.map(l => {
    const shiftTime = (t: number | null | undefined) => 
      t != null ? Math.max(0, Number((t + offset).toFixed(3))) : t;
    
    return {
      ...l,
      time: shiftTime(l.time) as number | null,
      endTime: shiftTime(l.endTime) as number | undefined,
      words: l.words?.map(w => ({
        ...w,
        time: shiftTime(w.time) as number,
        endTime: shiftTime(w.endTime) as number | undefined
      }))
    };
  }));
  showToast(`Shifted all timestamps by ${offset > 0 ? '+' : ''}${offset}s`);
  };

 const formatProgressTime = (s: number) => {
 const m = Math.floor(s / 60);
 const sec = Math.floor(s % 60);
 return `${m}:${String(sec).padStart(2, '0')}`;
 };

 const formatRemainingTime = (s: number) => {
 const remaining = (duration || 0) - s;
 const m = Math.floor(remaining / 60);
 const sec = Math.floor(remaining % 60);
 return `-${m}:${String(sec).padStart(2, '0')}`;
 };

 const syncedCount = lines.filter(l => l.synced).length;
 const progress = lines.length > 0 ? (syncedCount / lines.length) * 100 : 0;

 return (
 <div className="fixed inset-0 z-[1200] flex flex-col bg-black text-white overflow-hidden select-none font-sans pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0">
 
 {/* ─── SECTION 1: TOP HEADER BAR ─── */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5 backdrop-blur-xl shrink-0 z-50">
 {/* PC/Mobile Back Header */}
 <div className="flex items-center gap-2">
 <button 
 onClick={onClose}
 className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95"
 >
 <ChevronLeft size={20} />
 </button>
 {!isMobile && (
  <span className="font-brand font-bold text-lg zenify-logo pl-2">Lyric Sync Studio</span>
 )}
 </div>

 {/* Centered Mode Pill & Sync Readout */}
 <div className="flex items-center gap-4">
 <div className="flex bg-black/40 border border-white/10 rounded-full p-1 max-w-xs w-full sm:w-auto">
 <button 
 onClick={() => setViewMode('list')}
 className={`flex-1 sm:flex-none px-4 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-all ${viewMode === 'list' ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
 >
 List Mode
 </button>
 <button 
 onClick={() => setViewMode('karaoke')}
 className={`flex-1 sm:flex-none px-4 py-1.5 rounded-full text-[11px] font-bold tracking-tight transition-all ${viewMode === 'karaoke' ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
 >
 Karaoke Painter
 </button>
 </div>
 {isSyncing && (
   <div className="hidden lg:flex flex-col items-start gap-1 w-32 shrink-0">
     <div className="flex justify-between items-center w-full text-[9px] font-bold text-rose-400 tracking-wider uppercase">
       <span>Sync Active</span>
       <span>{currentLineIndex + 1} / {lines.length}</span>
     </div>
     <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
       <div 
         className="h-full bg-gradient-to-r from-rose-500 to-purple-600 rounded-full"
         style={{ width: `${(currentLineIndex / Math.max(1, lines.length)) * 100}%` }}
       />
     </div>
   </div>
 )}
 </div>

 {/* Language Selector */}
 <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-black/40 border border-white/10 rounded-full">
    <span className="text-[10px] text-zinc-400 font-bold uppercase">Lang:</span>
    <select 
        value={activeLang}
        onChange={(e) => setActiveLang(e.target.value)}
        className="bg-transparent text-xs text-white outline-none font-bold cursor-pointer"
    >
        {lyricVersions.map((v: any) => (
            <option key={v.language} value={v.language} className="bg-zinc-900 text-white">{v.language}</option>
        ))}
        {!lyricVersions.find((v: any) => v.language === 'English') && <option value="English" className="bg-zinc-900 text-white">English</option>}
        {!lyricVersions.find((v: any) => v.language === 'Tamil') && <option value="Tamil" className="bg-zinc-900 text-white">Tamil</option>}
        {!lyricVersions.find((v: any) => v.language === 'Tanglish') && <option value="Tanglish" className="bg-zinc-900 text-white">Tanglish</option>}
    </select>
 </div>

 {/* PC Action Buttons / Mobile Settings Link */}
 <div className="flex items-center gap-2">
 {!isMobile ? (
 <>
 <button 
 onClick={undo} 
 disabled={past.length === 0}
 className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-90"
 title={`Undo (${past.length})`}
 >
 <Undo2 size={16} />
 </button>
 <button 
 onClick={redo} 
 disabled={future.length === 0}
 className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-90"
 title={`Redo (${future.length})`}
 >
 <Redo2 size={16} />
 </button>
 {isSyncing ? (
   <button 
     onClick={stopSync}
     className="px-5 py-2 rounded-full font-bold text-[12px] flex items-center gap-2 bg-red-600 text-white shadow-lg animate-pulse"
   >
     <Square size={13} fill="white" /> Stop Sync
   </button>
 ) : (
   <button 
     onClick={startSync}
     className="px-5 py-2 rounded-full font-bold text-[12px] flex items-center gap-2 bg-zinc-900 border border-zinc-700 text-rose-400 hover:text-rose-300 shadow-lg"
   >
     <Play size={13} fill="currentColor" /> Start Sync
   </button>
 )}
 <motion.button 
 whileTap={{ scale: 0.95 }}
 onClick={() => saveMutation.mutate()}
 disabled={saveMutation.isPending || syncedCount === 0}
 className="px-5 py-2 rounded-full font-bold text-[12px] flex items-center gap-2 disabled:opacity-40 shadow-lg"
 style={{ background: 'linear-gradient(to right, #f43f5e, #be123c)' }}
 >
 {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
 Save Studio
 </motion.button>
 </>
 ) : (
 <div className="flex items-center gap-1">
 <button 
 onClick={() => setShowMobileSettings(true)}
 className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white active:scale-95"
 >
 <Sliders size={18} />
 </button>
 {isSyncing ? (
   <button
     onClick={stopSync}
     className="h-10 px-4 rounded-xl font-bold text-[11px] flex items-center gap-1.5 bg-red-600 text-white animate-pulse"
   >
     <Square size={11} fill="white" /> Stop
   </button>
 ) : (
   <button
     onClick={startSync}
     className="h-10 px-4 rounded-xl font-bold text-[11px] flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 text-rose-400"
   >
     <Play size={11} fill="currentColor" /> Sync
   </button>
 )}
 <motion.button 
 whileTap={{ scale: 0.95 }}
 onClick={() => saveMutation.mutate()}
 disabled={saveMutation.isPending || syncedCount === 0}
 className="h-10 px-4 rounded-xl font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-40"
 style={{ background: 'linear-gradient(to right, #f43f5e, #be123c)' }}
 >
 {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
 Save
 </motion.button>
 </div>
 )}
 </div>
 </div>

 {/* ─── WORKSPACE LAYOUT (Three column / Stacked) ─── */}
 <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
 
 {/* ── PC LEFT PANEL / MOBILE HEADER CARD ── */}
 {!isMobile ? (
 /* PC Left Panel */
 <div className="w-[280px] border-r border-white/10 bg-white/[0.01] p-5 flex flex-col gap-6 shrink-0 overflow-y-auto">
 {/* Album Cover Art */}
 <div className="relative aspect-square w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 group bg-zinc-950">
 {track.coverUrl ? (
 <img src={getMediaUrl(track.coverUrl)} alt="Album Art" className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <Music2 className="w-12 h-12 text-zinc-600" />
 </div>
 )}
 </div>

 {/* Text Metadata */}
 <div className="flex flex-col gap-1 text-left">
 <MarqueeText className="font-brand font-bold text-lg text-rose-400">
  {track.title}
 </MarqueeText>
 <MarqueeText className="text-sm text-zinc-400">
  {track.artist?.name || track.artistName || 'Unknown Artist'}
 </MarqueeText>
 </div>

 {/* Live Sync Progress */}
 <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
 <div className="flex justify-between items-center text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
 <span>Progress</span>
 <span>{syncedCount} / {lines.length} lines</span>
 </div>
 <div className="h-2 bg-black/40 rounded-full overflow-hidden">
 <motion.div 
 className="h-full bg-gradient-to-r from-rose-500 to-purple-600 rounded-full"
 animate={{ width: `${progress}%` }}
 />
 </div>
 </div>

 {/* Left Panel Waveform Strip */}
 <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
   <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-left">Audio Waveform</span>
   <div className="h-10 bg-black/40 rounded-xl px-3 flex items-center justify-between gap-[2px]">
     {Array.from({ length: 45 }).map((_, i) => {
       const heightPct = Math.abs(Math.sin(i * 0.15) * 50 + Math.sin(i * 0.5) * 30 + 20);
       const ratio = i / 45;
       const playbackRatio = currentTime / (duration || 1);
       const isPassed = ratio <= playbackRatio;

       return (
         <div
           key={i}
           className="w-[3px] rounded-full transition-all duration-150"
           style={{
             height: `${heightPct}%`,
             background: isPassed 
               ? 'linear-gradient(to top, #f43f5e, #be123c)'
               : 'rgba(255, 255, 255, 0.1)'
           }}
         />
       );
     })}
   </div>
 </div>
 </div>
 ) : (
 /* Mobile Header Card */
 <div className="w-full bg-white/5 border-b border-white/10 p-3 flex items-center gap-3 shrink-0">
 <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-zinc-950 border border-white/10">
 {track.coverUrl ? (
 <img src={getMediaUrl(track.coverUrl)} alt="Art" className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <Music2 size={16} className="text-zinc-600" />
 </div>
 )}
 </div>
 <div className="flex-1 min-w-0 text-left">
 <MarqueeText className="font-brand font-bold text-[13px] text-white">
  {track.title}
 </MarqueeText>
 <MarqueeText className="text-[11px] text-zinc-500">
  {track.artist?.name || track.artistName || 'Unknown Artist'}
 </MarqueeText>
 </div>
 {/* Compact Visualizer */}
 {isPlaying && (
 <div className="flex items-end gap-[2px] h-[10px] shrink-0 px-2">
 {[0.2, 0.7, 0.4].map((v, i) => (
 <motion.div 
 key={i}
 className="w-[2px] bg-brand rounded-full"
 animate={{ height: ["30%", "100%", "30%"] }}
 transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: 'easeInOut', delay: v }}
 />
 ))}
 </div>
 )}
 </div>
 )}

 {/* ── CENTER PANEL: LYRICS LIST ── */}
 <div className="flex-1 flex flex-col overflow-hidden relative">
 {viewMode === 'karaoke' ? (
 <KaraokePainterView 
 lines={lines}
 setLines={setLines}
 isPlaying={isPlaying}
 currentTime={currentTime}
 audioRef={audioRef}
 duration={duration}
 commitHistory={commitHistory}
 undo={undo}
 redo={redo}
 canUndo={past.length > 0}
 canRedo={future.length > 0}
 />
 ) : (
 <div className="flex-1 flex flex-col overflow-hidden">
 {/* Sync Status Overlay Header */}
 <div className="px-5 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between text-xs text-zinc-400">
 <span>Double click a line to edit text</span>
 <button 
 onClick={() => setIsEditMode(!isEditMode)}
 className={`px-3 py-1 rounded-xl text-[10px] font-bold border transition-all ${isEditMode ? 'bg-brand/20 border-brand/30 text-brand' : 'bg-white/5 border-white/10 text-white'}`}
 >
 {isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
 </button>
 </div>

 {/* Vertically Scrollable List */}
 <div 
 ref={lyricsContainerRef}
 className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar"
 >
 {lines.length === 0 ? (
 <div className="flex flex-col items-center justify-center h-full text-center">
 <FileText className="w-12 h-12 text-zinc-700 mb-2" />
 <p className="text-zinc-500 text-sm font-semibold">No lyrics available</p>
 <button onClick={() => setShowLyricsEditor(true)} className="mt-3 text-xs text-brand underline font-bold">Paste Raw Lyrics</button>
 </div>
 ) : (
 lines.map((line, idx) => {
 const isCurrentLine = isSyncing && idx === currentLineIndex;
 const isLineSynced = line.synced && line.time !== null;
 const isLineSelectedForFineTune = selectedLineIdx === idx;

 return (
 <motion.div 
 key={idx}
 layout
 initial={{ opacity: 0 }}
 animate={isCurrentLine ? {
 scale: 1.02,
 borderColor: 'rgba(244,63,94,0.5)',
 boxShadow: '0 0 15px rgba(244,63,94,0.15)',
 opacity: 1
 } : { scale: 1, opacity: 1 }}
 className={`flex items-center gap-3 border transition-all group ${
 isCurrentLine 
 ? 'bg-rose-500/[0.03] border-rose-500/30 px-5 py-4 rounded-2xl shadow-[0_0_20px_rgba(244,63,94,0.1)]' 
 : isLineSynced 
   ? 'bg-emerald-500/[0.01] border-emerald-500/10 px-4 py-2 rounded-xl text-zinc-400 hover:bg-white/[0.02]' 
   : isLineSelectedForFineTune
     ? 'bg-brand/10 border-brand/30 px-4 py-3 rounded-2xl'
     : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] px-4 py-3 rounded-2xl'
 }`}
 onPointerDown={(e) => {
   if (isSyncing && isPlaying && idx === currentLineIndex) {
     handleStampStart();
   }
 }}
 onPointerUp={(e) => {
   if (isSyncing && isPlaying && idx === currentLineIndex) {
     handleStampEnd();
   }
 }}
 onClick={() => clickLine(idx)}
 onDoubleClick={(e) => {
   e.stopPropagation();
   setIsEditMode(true);
 }}
 >
 {/* Timestamp Pill */}
 <div 
 onClick={(e) => {
 e.stopPropagation();
 if (isLineSynced) seek(line.time!);
 }}
 className={`relative px-3.5 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wider shrink-0 cursor-pointer transition-all ${
 isCurrentLine 
   ? 'bg-rose-500 text-white scale-110 shadow-[0_0_12px_rgba(244,63,94,0.4)] border border-rose-400/30' 
   : isLineSynced 
     ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' 
     : 'bg-white/5 text-zinc-500 border border-transparent'
 }`}
 >
 {isCurrentLine && (
   <span className="absolute inset-0 rounded-xl border-2 border-white/30 animate-pulse pointer-events-none" />
 )}
 {isLineSynced ? formatProgressTime(line.time!) : '[ -- : -- ]'}
 </div>

 {/* Text Input / Span */}
 {isEditMode ? (
 <input 
 value={line.text}
 onChange={e => {
 const newText = e.target.value;
 setLines(prev => {
 const copy = [...prev];
 copy[idx] = { ...copy[idx], text: newText };
 return copy;
 });
 }}
 onFocus={(e) => {
   e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
 }}
 className="flex-1 bg-transparent border-b border-white/10 focus:border-brand py-0.5 text-xs text-white focus:outline-none"
 onClick={e => e.stopPropagation()}
 />
 ) : (
 <span className={`flex-1 text-[13px] leading-relaxed transition-all ${isCurrentLine ? 'text-white font-bold' : isLineSynced ? 'text-zinc-200' : 'text-zinc-500'}`}>
 {line.text}
 </span>
 )}

 {/* Action Pins / Clear */}
 <div className="flex items-center gap-1">
 {isEditMode && (
 <button 
 onClick={(e) => {
   e.stopPropagation();
   commitHistory();
   setLines(prev => {
     const updated = [...prev];
     updated.splice(idx + 1, 0, { time: null, text: 'New Lyric Line', synced: false });
     return updated;
   });
 }}
 className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-emerald-400 transition-all border border-white/10 shadow-md"
 title="Insert new line below"
 >
 <Plus size={12} />
 </button>
 )}
 {isLineSynced && (
 <button 
 onClick={(e) => { e.stopPropagation(); clearLineStamp(idx); }}
 className="w-7 h-7 flex items-center justify-center rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all border border-red-500/20 shadow-md"
 title="Clear timestamp"
 >
 ✕
 </button>
 )}
 {isCurrentLine && (
 <button 
 onClick={(e) => {
   e.stopPropagation();
   clearLineStamp(idx);
 }}
 className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 transition-all border border-white/20 mr-1"
 title="Redo this line"
 >
 <RotateCcw size={12} />
 </button>
 )}
 <button 
 onClick={(e) => {
   e.stopPropagation();
   commitHistory();
   setLines(prev => prev.filter((_, i) => i !== idx));
   showToast(`Deleted line ${idx + 1}`);
 }}
 className={`w-7 h-7 flex items-center justify-center rounded-xl transition-all ${
   isCurrentLine || isEditMode
     ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 opacity-100 shadow-md'
     : isMobile
       ? 'bg-white/5 border border-white/10 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 opacity-60'
       : 'bg-white/5 border border-white/10 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100'
 }`}
 title="Delete line"
 >
 <Trash2 size={12} />
 </button>
 </div>
 </motion.div>
 );
 })
 )}

 {isEditMode && (
 <button 
 onClick={() => {
 commitHistory();
 setLines(prev => [...prev, { time: null, text: 'New Lyric Line', synced: false }]);
 }}
 className="w-full py-3 rounded-2xl border-2 border-dashed border-white/10 hover:border-white/20 text-[11px] font-bold text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2"
 >
 <Plus size={14} /> Add Line
 </button>
 )}
 </div>
 </div>
 )}
 </div>

 {/* ── PC RIGHT PANEL / SETTINGS ── */}
 {!isMobile && (
 <div className="w-[300px] border-l border-white/10 bg-white/[0.01] p-5 flex flex-col gap-6 shrink-0 overflow-y-auto">
 <SettingsPanelContent 
 lyricsImportUrl={lyricsImportUrl}
 setLyricsImportUrl={setLyricsImportUrl}
 handleImportLyrics={handleImportLyrics}
 isImportingLyrics={isImportingLyrics}
 handleAutoSearchLyrics={handleAutoSearchLyrics}
 shiftOffset={shiftOffset}
 setShiftOffset={setShiftOffset}
 applyGlobalShiftOffset={applyGlobalShiftOffset}
 downloadLrc={downloadLrc}
 downloadJson={downloadJson}
 rawLyricsInput={rawLyricsInput}
 setRawLyricsInput={setRawLyricsInput}
 applyRawLyrics={applyRawLyrics}
 showLyricsEditor={showLyricsEditor}
 setShowLyricsEditor={setShowLyricsEditor}
 importStatusStep={importStatusStep}
 selectedLineIdx={selectedLineIdx}
 nudgeTime={nudgeTime}
 lines={lines}
 autoDistributeSync={autoDistributeSync}
 />
 </div>
 )}
 </div>

 {/* ─── STAMP FLOATING ACTION BUTTON (Mobile Only) ─── */}
 {isMobile && isSyncing && (
 <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
 <motion.button 
 whileTap={{ scale: 0.9 }}
 onTouchStart={(e) => { e.preventDefault(); handleStampStart(); }}
 onTouchEnd={(e) => { e.preventDefault(); handleStampEnd(); }}
 onPointerDown={(e) => {
   if (e.pointerType === 'mouse') handleStampStart();
 }}
 onPointerUp={(e) => {
   if (e.pointerType === 'mouse') handleStampEnd();
 }}
 className="w-16 h-16 rounded-full flex flex-col items-center justify-center text-white shadow-[0_0_25px_rgba(244,63,94,0.5)] border border-rose-400/20"
 style={{ background: 'linear-gradient(to right, #f43f5e, #be123c)' }}
 >
 <Clock size={20} className="mb-0.5" />
 <span className="text-[9px] font-bold uppercase tracking-tight">Stamp</span>
 </motion.button>
 </div>
 )}

 {/* ─── MOBILE SETTINGS SHEET ─── */}
 {isMobile && (
 <AnimatePresence>
 {showMobileSettings && (
 <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-black/60 backdrop-blur-sm">
 <motion.div 
 initial={{ y: "100%" }}
 animate={{ y: 0 }}
 exit={{ y: "100%" }}
 transition={{ type: "spring", stiffness: 300, damping: 30 }}
 className="w-full max-h-[80vh] overflow-y-auto bg-[#0a0a0b] border-t border-white/10 rounded-t-[2rem] p-6 text-left"
 >
 <div className="flex justify-between items-center mb-6">
 <h3 className="font-brand font-bold text-lg text-white">Daw Workspace Settings</h3>
 <button 
 onClick={() => setShowMobileSettings(false)}
 className="text-zinc-500 hover:text-white font-bold"
 >
 Close
 </button>
 </div>
 
 {/* Mobile Undo/Redo tools in bottom sheet */}
 <div className="flex gap-2 mb-6">
 <button 
 onClick={() => { undo(); setShowMobileSettings(false); }} 
 disabled={past.length === 0}
 className="flex-1 h-12 flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 text-white disabled:opacity-30"
 >
 <Undo2 size={16} /> Undo ({past.length})
 </button>
 <button 
 onClick={() => { redo(); setShowMobileSettings(false); }} 
 disabled={future.length === 0}
 className="flex-1 h-12 flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 text-white disabled:opacity-30"
 >
 <Redo2 size={16} /> Redo ({future.length})
 </button>
 </div>

 <SettingsPanelContent 
 lyricsImportUrl={lyricsImportUrl}
 setLyricsImportUrl={setLyricsImportUrl}
 handleImportLyrics={handleImportLyrics}
 isImportingLyrics={isImportingLyrics}
 handleAutoSearchLyrics={handleAutoSearchLyrics}
 shiftOffset={shiftOffset}
 setShiftOffset={setShiftOffset}
 applyGlobalShiftOffset={applyGlobalShiftOffset}
 downloadLrc={downloadLrc}
 downloadJson={downloadJson}
 rawLyricsInput={rawLyricsInput}
 setRawLyricsInput={setRawLyricsInput}
 applyRawLyrics={applyRawLyrics}
 showLyricsEditor={showLyricsEditor}
 setShowLyricsEditor={setShowLyricsEditor}
 importStatusStep={importStatusStep}
 selectedLineIdx={selectedLineIdx}
 nudgeTime={nudgeTime}
 lines={lines}
 autoDistributeSync={autoDistributeSync}
 />
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 )}

 {/* ─── SECTION 3: BOTTOM AUDIO PLAYER BAR ─── */}
 <div className="mt-auto px-4 py-4 border-t border-white/10 bg-white/5 backdrop-blur-xl shrink-0 z-40 flex flex-col gap-2.5">
 {/* Seekbar and timestamp timers */}
 <div className="flex items-center gap-3 w-full">
 <span 
 onClick={copyTimeTextToClipboard}
 className="text-[11px] font-mono text-zinc-400 cursor-pointer hover:text-white shrink-0"
 >
 {formatProgressTime(currentTime)}
 </span>

 {/* Radix Scrubber / Seekbar - first touch seeking via onPointerDown */}
 <Slider.Root
 className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer"
 value={[currentTime]}
 max={duration || 100}
 step={0.1}
 onPointerDown={(e) => {
 e.stopPropagation();
 // Fix mobile seek jump bug instantly
 }}
 onValueChange={([val]) => seek(val)}
 >
 <Slider.Track className="bg-white/10 relative grow rounded-full h-[4px]">
 <Slider.Range className="absolute bg-rose-500 rounded-full h-full shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
 {lines.map((line, i) => {
   if (line.time !== null && duration > 0) {
     const pct = (line.time / duration) * 100;
     return (
       <div 
         key={i} 
         className="absolute w-[2px] h-[4px] bg-white/60 rounded-full top-0" 
         style={{ left: `${pct}%`, transform: 'translateX(-50%)' }} 
       />
     );
   }
   return null;
 })}
 </Slider.Track>
 <Slider.Thumb className="block w-3.5 h-3.5 bg-rose-500 border border-white/30 rounded-full shadow-lg outline-none cursor-pointer" />
 </Slider.Root>

 <span className="text-[11px] font-mono text-zinc-400 shrink-0">
 {formatRemainingTime(currentTime)}
 </span>
 </div>

 {/* Control Panel Buttons */}
 <div className="flex items-center justify-between w-full">
 {/* Left: Speed selector */}
 <button 
 onClick={cyclePlaybackSpeed}
 className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono font-bold text-zinc-300 hover:text-white transition-all active:scale-95"
 >
 {playbackRate}x speed
 </button>

 {/* Center: Rewind / Play / Forward Jumps */}
 <div className="flex items-center gap-4">
 <button 
 onPointerDown={() => handleSkip('back', 5)}
 className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-zinc-300 hover:text-white transition-all active:scale-90"
 title="Back 5s"
 >
 <SkipBack size={15} />
 </button>
 <button 
 onClick={togglePlay}
 className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xl active:scale-95"
 style={{ background: 'linear-gradient(to right, #f43f5e, #be123c)' }}
 >
 {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-0.5" />}
 </button>
 <button 
 onPointerDown={() => handleSkip('forward', 5)}
 className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-zinc-300 hover:text-white transition-all active:scale-90"
 title="Forward 5s"
 >
 <SkipForward size={15} />
 </button>
 </div>

 {/* Right: Vol Slider (PC) / Spacer (Mobile) */}
 {!isMobile ? (
 <div className="flex items-center gap-2 w-28">
 <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Vol</span>
 <Slider.Root
 className="relative flex items-center select-none touch-none w-full h-4 cursor-pointer"
 value={[volume * 100]}
 max={100}
 onValueChange={([val]) => setVolume(val / 100)}
 >
 <Slider.Track className="bg-white/10 relative grow rounded-full h-[3px]">
 <Slider.Range className="absolute bg-white/40 rounded-full h-full" />
 </Slider.Track>
 <Slider.Thumb className="block w-2.5 h-2.5 bg-white rounded-full outline-none cursor-pointer" />
 </Slider.Root>
 </div>
 ) : (
 <div className="w-[80px]" /> /* Spacer to match layout */
 )}
 </div>
 </div>

  {/* Hidden Audio Player DOM element */}
  <audio 
  ref={audioRef}
  src={getMediaUrl(track.audioUrl)}
  preload="auto"
  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
  onPlay={() => setIsPlaying(true)}
  onPause={() => setIsPlaying(false)}
  onEnded={() => { setIsPlaying(false); setIsSyncing(false); }}
  className="sr-only"
  />

 {/* Staggered progress overlays / toast */}
 <AnimatePresence>
 {toast && (
 <motion.div 
 initial={{ opacity: 0, y: 30 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 20 }}
 className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-[2000] px-5 py-3 rounded-2xl text-[12px] font-bold shadow-2xl border backdrop-blur-xl ${
 toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
 }`}
 >
 {toast.msg}
 </motion.div>
 )}
 </AnimatePresence>
 <AnimatePresence>
 {importStatusStep && (
 <motion.div 
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-md"
 >
 <div className="bg-zinc-900 border border-white/10 px-8 py-6 rounded-3xl flex flex-col items-center gap-4 text-center max-w-xs">
 <Loader2 size={24} className="text-brand animate-spin" />
 <p className="text-zinc-300 text-xs font-semibold">{importStatusStep}</p>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}

// ─── HELPER SUB-COMPONENT: SETTINGS SIDEBAR CONTENT ───
function SettingsPanelContent({
 lyricsImportUrl,
 setLyricsImportUrl,
 handleImportLyrics,
 isImportingLyrics,
 handleAutoSearchLyrics,
 shiftOffset,
 setShiftOffset,
 applyGlobalShiftOffset,
 downloadLrc,
 downloadJson,
 rawLyricsInput,
 setRawLyricsInput,
 applyRawLyrics,
 showLyricsEditor,
 setShowLyricsEditor,
 importStatusStep,
 selectedLineIdx,
 nudgeTime,
 lines,
 autoDistributeSync
}: any) {
 return (
 <div className="flex flex-col gap-6 text-left">
 
 {/* Import Block */}
 <div className="flex flex-col gap-3">
 <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Import Lyrics</span>
 <div className="flex gap-2">
 <input 
 type="text"
 placeholder="YouTube, Genius or Spotify link..."
 value={lyricsImportUrl}
 onChange={e => setLyricsImportUrl(e.target.value)}
 className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand/60 font-sans"
 />
 <button 
 onClick={handleImportLyrics}
 disabled={isImportingLyrics}
 className="px-4 py-2 rounded-xl bg-zinc-900 text-brand text-xs font-bold shadow-lg"
 >
 {isImportingLyrics ? <Loader2 size={13} className="animate-spin" /> : 'Get'}
 </button>
 </div>
 <button 
 onClick={handleAutoSearchLyrics}
 className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5"
 >
 <Sparkles size={13} className="text-brand" /> Auto Search Lyrics
 </button>
 <button 
 onClick={() => setShowLyricsEditor(!showLyricsEditor)}
 className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-bold"
 >
 {showLyricsEditor ? 'Hide Manual Editor' : 'Manual Paste Lyrics'}
 </button>
 {showLyricsEditor && (
 <div className="flex flex-col gap-2 mt-1">
 <textarea 
 value={rawLyricsInput}
 onChange={e => setRawLyricsInput(e.target.value)}
 placeholder="Paste text here, one line per lyric..."
 className="w-full h-28 bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] text-zinc-300 resize-none focus:outline-none font-mono"
 />
 <button 
 onClick={applyRawLyrics}
 className="w-full py-2 rounded-xl bg-brand/20 border border-brand/35 text-brand text-[11px] font-bold"
 >
 Apply Text
 </button>
 <button 
 onClick={autoDistributeSync}
 className="w-full py-2 mt-1 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-md"
 >
 <Sparkles size={13} /> Magic Auto-Sync (Rough)
 </button>
 </div>
 )}
 </div>

 {/* Time Shift Block */}
 <div className="flex flex-col gap-3">
 <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Systematic Offset</span>
 <div className="grid grid-cols-3 gap-2">
    {[-1, -0.5, -0.1, 0.1, 0.5, 1].map(val => (
      <button
        key={val}
        onClick={() => applyGlobalShiftOffset(val)}
        className="py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10px] font-bold"
      >
        {val > 0 ? '+' : ''}{val}s
      </button>
    ))}
 </div>
 <div className="flex items-center gap-2 mt-1">
   <input
     type="number"
     step="0.1"
     placeholder="e.g. 1.5 or -0.2"
     value={shiftOffset || ''}
     onChange={e => setShiftOffset(parseFloat(e.target.value))}
     className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand/60 font-mono"
   />
   <button 
     onClick={() => {
       if (shiftOffset && !isNaN(shiftOffset)) {
         applyGlobalShiftOffset(shiftOffset);
       }
     }}
     className="px-4 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-brand text-[11px] font-bold border border-rose-500/20 transition-all shrink-0"
   >
     Apply
   </button>
 </div>
 </div>

 {/* Fine-Tune Block */}
 <div className="flex flex-col gap-3 border-t border-white/5 pt-4">
   <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Fine-Tune Pass</span>
   {selectedLineIdx !== null ? (
     <div className="flex flex-col gap-3">
       <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
         <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Active Line {selectedLineIdx + 1}</div>
         <div className="text-xs text-white line-clamp-2 italic font-serif">"{lines[selectedLineIdx]?.text}"</div>
       </div>
       
       {/* Nudge Start Time */}
       <div className="flex flex-col gap-1.5">
         <div className="flex justify-between items-center text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
           <span>Start Time: <span className="font-mono text-rose-400 font-bold">{lines[selectedLineIdx]?.time !== null ? `${lines[selectedLineIdx].time!.toFixed(2)}s` : '--'}</span></span>
         </div>
         <div className="flex gap-2">
           <button 
             onClick={() => nudgeTime('start', -0.1)}
             disabled={lines[selectedLineIdx]?.time === null}
             className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10px] font-bold disabled:opacity-30"
           >
             -100ms
           </button>
           <button 
             onClick={() => nudgeTime('start', 0.1)}
             disabled={lines[selectedLineIdx]?.time === null}
             className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10px] font-bold disabled:opacity-30"
           >
             +100ms
           </button>
         </div>
       </div>

       {/* Nudge End Time */}
       <div className="flex flex-col gap-1.5">
         <div className="flex justify-between items-center text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
           <span>End Time: <span className="font-mono text-purple-400 font-bold">{lines[selectedLineIdx]?.endTime !== undefined ? `${lines[selectedLineIdx].endTime!.toFixed(2)}s` : '--'}</span></span>
         </div>
         <div className="flex gap-2">
           <button 
             onClick={() => nudgeTime('end', -0.1)}
             disabled={lines[selectedLineIdx]?.time === null}
             className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10px] font-bold disabled:opacity-30"
           >
             -100ms
           </button>
           <button 
             onClick={() => nudgeTime('end', 0.1)}
             disabled={lines[selectedLineIdx]?.time === null}
             className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10px] font-bold disabled:opacity-30"
           >
             +100ms
           </button>
         </div>
       </div>
     </div>
   ) : (
     <div className="text-[11px] text-zinc-500 italic p-3 bg-white/[0.02] border border-dashed border-white/10 rounded-xl text-center">
       Select a line in the editor to fine-tune its timestamps
     </div>
   )}
 </div>

 {/* Export Block */}
 <div className="flex flex-col gap-3">
 <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Export Output</span>
 <button 
 onClick={downloadLrc}
 className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5"
 >
 <Download size={13} /> Export LRC Output
 </button>
 <button 
 onClick={downloadJson}
 className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5"
 >
 <Layers size={13} /> Export Synced JSON
 </button>
 </div>
 </div>
 );
}
