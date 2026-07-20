"use client";

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
 ChevronLeft, Mic, Search, Music2, Filter, 
 CheckCheck, AlertCircle, Sparkles, Loader2, Play
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { getMediaUrl } from '@/lib/utils';
import { LyricSyncStudio } from '@/components/admin/LyricSyncStudio';
import { MarqueeText } from '@/components/shared/MarqueeText';

function formatTime(seconds: number): string {
 if (isNaN(seconds) || seconds === null) return '0:00';
 const mins = Math.floor(seconds / 60);
 const secs = Math.floor(seconds % 60);
 return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function LyricSyncPage() {
 const router = useRouter();
 const searchParams = useSearchParams();
 const preselectedId = searchParams?.get('trackId');

 const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
 const [filterMode, setFilterMode] = useState<'all' | 'no-lyrics' | 'unsynced' | 'synced'>('all');


 /* ── Fetch all tracks ───────────────────────────────────── */
 const { data: tracks = [], isLoading } = useQuery({
 queryKey: ['admin-tracks'],
 queryFn: async () => {
 const res = await api.get('/tracks?limit=1000');
 return res.data.items as any[];
 }
 });

 /* ── Fetch full track details when selected ──────────────── */
 const { data: selectedTrack, isLoading: isFetchingTrack } = useQuery({
 queryKey: ['track-detail', selectedTrackId],
 queryFn: async () => {
 const res = await api.get(`/tracks/${selectedTrackId}`);
 return res.data;
 },
 enabled: !!selectedTrackId
 });

 /* Auto-select if ?trackId= is in URL */
 useEffect(() => {
 if (preselectedId && tracks.length > 0 && !selectedTrackId) {
 const found = tracks.find((t: any) => t.id === preselectedId);
 if (found) setSelectedTrackId(found.id);
 }
 }, [preselectedId, tracks, selectedTrackId]);

 const filtered = tracks.filter((t: any) => {
 const matchSearch =
 t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 (t.artist?.name || t.artistName || '').toLowerCase().includes(searchQuery.toLowerCase());
 
 // Status calculations
 const hasLyrics = !!t.lyrics;
 const hasSynced = t.synced_lyrics && (t.synced_lyrics as any[]).length > 0;

 if (filterMode === 'no-lyrics') return matchSearch && !hasLyrics;
 if (filterMode === 'unsynced') return matchSearch && hasLyrics && !hasSynced;
 if (filterMode === 'synced') return matchSearch && hasSynced;
 return matchSearch;
 });

 /* ── Track Selector ─────────────────────────────────────── */
 if (!selectedTrackId) {
 return (
 <div className="min-h-screen pb-32 pt-[100px] md:pt-[calc(var(--header-height)+2.5rem)] bg-[#0a0a0b] text-white">
 <div className="max-w-5xl mx-auto px-4 md:px-6">

 {/* Header */}
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
 <div className="flex items-center gap-4">
 <Button 
 variant="ghost" 
 size="icon" 
 onClick={() => router.push('/admin/tracks')}
 className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl shrink-0"
 >
 <ChevronLeft size={20} />
 </Button>
 <div>
 <div className="flex items-center gap-2.5 mb-1">
 <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-rose-500 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(244,63,94,0.3)]">
 <Mic className="w-4 h-4 text-white" />
 </div>
 <h1 className="text-2xl md:text-3xl font-brand font-bold tracking-tight zenify-logo">Lyric Sync Studio</h1>
 </div>
 <p className="text-white/30 text-[10px] tracking-[0.2em] uppercase font-bold">Zenify DAW Workspace</p>
 </div>
 </div>
 </div>

 {/* Filters & Search - Glassmorphic Sticky Panel */}
 <div className="sticky top-4 z-40 bg-[#0a0a0b]/80 backdrop-blur-xl border border-white/10 p-4 rounded-3xl mb-8 flex flex-col md:flex-row gap-4 shadow-xl">
 {/* Search Input */}
 <div className="relative flex-1">
 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
 <Input
 placeholder="Search by track name or artist..."
 value={searchQuery}
 onChange={e => setSearchQuery(e.target.value)}
 className="w-full pl-11 h-10 bg-white/5 border-white/10 rounded-xl text-xs text-white focus:border-brand/60 focus:ring-1 focus:ring-brand/30 transition-all font-sans"
 />
 </div>

 {/* Filter Tabs */}
 <div className="flex bg-black/40 border border-white/5 p-1 rounded-2xl gap-1 shrink-0 overflow-x-auto no-scrollbar">
 {[
 { id: 'all', label: 'All' },
 { id: 'no-lyrics', label: 'No Lyrics' },
 { id: 'unsynced', label: 'Unsynced' },
 { id: 'synced', label: 'Synced' }
 ].map(tab => {
 const isActive = filterMode === tab.id;
 return (
 <button
 key={tab.id}
 onClick={() => setFilterMode(tab.id as any)}
 className={`px-4 py-1.5 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap ${
 isActive 
 ? 'bg-rose-500/10 border border-rose-500/20 text-brand shadow-md' 
 : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
 }`}
 >
 {tab.label}
 </button>
 );
 })}
 </div>
 </div>

 {/* Stats pill */}
 {!isLoading && (
 <div className="flex items-center justify-between mb-4 px-1">
 <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
 {filtered.length} of {tracks.length} tracks listed
 </p>
 <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-bold">
 {tracks.filter((t: any) => t.synced_lyrics && (t.synced_lyrics as any[]).length > 0).length} Synced
 </span>
 </div>
 )}

 {/* Track Selection Card (Full-width Glass Grid) */}
 <div className="rounded-[2rem] border border-white/10 bg-white/[0.02] backdrop-blur-xl overflow-hidden shadow-2xl">
 {isLoading ? (
 <div className="flex flex-col items-center justify-center py-32 gap-4">
 <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
 <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Loading tracks...</p>
 </div>
 ) : filtered.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-24 text-center">
 <Music2 className="w-12 h-12 text-zinc-700 mb-3" />
 <p className="text-zinc-500 text-sm font-semibold">No tracks match your selection</p>
 </div>
 ) : (
 <motion.div 
 initial="hidden"
 animate="visible"
 variants={{
 hidden: { opacity: 0 },
 visible: {
 opacity: 1,
 transition: { staggerChildren: 0.03 }
 }
 }}
 className="divide-y divide-white/[0.05]"
 >
 {filtered.map((track: any) => {
 const hasLyrics = !!track.lyrics;
 const syncedList = track.synced_lyrics || [];
 const hasSynced = syncedList.length > 0;
 const isKaraoke = hasSynced && syncedList.some((l: any) => l.words && l.words.length > 0);

 return (
 <motion.div
 key={track.id}
 variants={{
 hidden: { opacity: 0, y: 10 },
 visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
 }}
 whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
 onClick={() => setSelectedTrackId(track.id)}
 className="flex items-center gap-4 px-5 py-4 cursor-pointer group transition-all"
 >
 {/* Art Thumbnail */}
 <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10 shadow-lg relative">
 {track.coverUrl ? (
 <img src={getMediaUrl(track.coverUrl)} alt={track.title} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <Music2 size={18} className="text-zinc-600" />
 </div>
 )}
 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
 <Play size={14} className="text-white fill-current" />
 </div>
 </div>

 {/* Track Details */}
 <div className="flex-1 min-w-0 pr-2">
 <div className="w-full">
 <MarqueeText className="font-bold text-[14px] text-white leading-normal hover:text-brand transition-colors font-sans">
 {track.title}
 </MarqueeText>
 </div>
 <div className="text-[12px] text-zinc-500 truncate mt-0.5">
 {track.artist?.name || track.artistName}
 </div>
 </div>

 {/* Sync Status Badge */}
 <div className="flex-shrink-0 mr-2">
 {isKaraoke ? (
 <span className="bg-gradient-to-r from-rose-500 to-purple-600 border border-rose-500/20 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.3)]">
 🎤 Karaoke Ready
 </span>
 ) : hasSynced ? (
 <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
 <CheckCheck size={11} />
 Synced
 </span>
 ) : hasLyrics ? (
 <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold">
 <AlertCircle size={11} />
 Plain Text
 </span>
 ) : (
 <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold">
 <AlertCircle size={11} />
 No Lyrics
 </span>
 )}
 </div>

 {/* Duration label */}
 {track.duration && (
 <div className="text-[11px] font-mono text-zinc-600 shrink-0">
 {formatTime(track.duration)}
 </div>
 )}
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
 if (selectedTrackId) {
 if (isFetchingTrack || !selectedTrack) {
 return (
 <div className="min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-center text-white gap-4">
 <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
 <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em]">Loading track studio...</p>
 </div>
 );
 }
 return (
 <LyricSyncStudio
 track={selectedTrack}
 onClose={() => setSelectedTrackId(null)}
 />
 );
 }
}
