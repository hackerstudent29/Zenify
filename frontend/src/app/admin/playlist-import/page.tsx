"use client";

import React, { useState, useEffect, useRef } from "react";
import {
 Music,
 Link as LinkIcon,
 Search,
 ChevronLeft,
 Play,
 Pause,
 CheckCircle2,
 AlertCircle,
 Sparkles,
 Check,
 Download,
 X,
 Pencil,
 RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, getMediaUrl } from "@/lib/utils";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { useImportStore } from "@/store/importStore";

// ─── Mini audio slider per track ─────────────────────────────────────────────
function MiniSlider({ getAudioEl, isPlaying }: { getAudioEl: () => HTMLAudioElement | null; isPlaying: boolean }) {
 const [cur, setCur] = useState(0);
 const [dur, setDur] = useState(0);
 const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

 useEffect(() => {
 // Wait a tick for the ref to be populated
 const setup = () => {
 const el = getAudioEl();
 if (!el) return;
 setAudioEl(el);
 if (el.duration && el.duration > 0 && el.duration !== Infinity) setDur(el.duration);

 const onTime = () => {
 setCur(el.currentTime);
 if (el.duration && el.duration > 0 && el.duration !== Infinity) setDur(el.duration);
 };
 const onMeta = () => {
 if (el.duration && el.duration > 0 && el.duration !== Infinity) setDur(el.duration);
 };
 el.addEventListener('timeupdate', onTime);
 el.addEventListener('loadedmetadata', onMeta);
 return () => { el.removeEventListener('timeupdate', onTime); el.removeEventListener('loadedmetadata', onMeta); };
 };
 const timer = setTimeout(setup, 50);
 return () => clearTimeout(timer);
 }, [isPlaying]);

 const pct = dur > 0 ? (cur / dur) * 100 : 0;
 const fmt = (s: number) => {
 if (!s || isNaN(s) || s === Infinity) return "0:00";
 return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
 };
 return (
 <div className="flex items-center gap-2 mt-2">
 <span className="text-[9px] text-white/20 font-mono w-7">{fmt(cur)}</span>
 <div className="flex-1 h-[12px] flex items-center cursor-pointer group" onClick={e => {
 if (!audioEl || !dur || dur === Infinity) return;
 const rect = e.currentTarget.getBoundingClientRect();
 audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * dur;
 }}>
 <div className="w-full h-[3px] bg-white/10 rounded-full overflow-hidden">
 <div className="h-full bg-brand rounded-full transition-all duration-75" style={{ width: `${pct}%` }} />
 </div>
 </div>
 <span className="text-[9px] text-white/20 font-mono w-7 text-right">{fmt(dur)}</span>
 </div>
 );
}

// ─── Per-track override state type ───────────────────────────────────────────
interface TrackOverride {
 customUrl: string;
 previewUrl: string | null;
 isPlaying: boolean;
 isFetching: boolean;
 audioError?: string | null;
 customImage?: string;
}

export default function PlaylistImportPage() {
 const router = useRouter();
 const [url, setUrl] = useState("");
 const [isFetching, setIsFetching] = useState(false);
 const [collection, setCollection] = useState<any>(null);
 const { isBatchImporting, startBatchImport } = useImportStore();
 const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());

 // Editable album meta
 const [albumName, setAlbumName] = useState("");
 const [isEditingAlbum, setIsEditingAlbum] = useState(false);
 const [artistName, setArtistName] = useState("");
 const [labelName, setLabelName] = useState("Zenify");
 const [genre, setGenre] = useState("Cinema");

 // Per-track overrides
 const [trackOverrides, setTrackOverrides] = useState<Record<number, TrackOverride>>({});
 const [bulkImage, setBulkImage] = useState("");
 const audioRefs = useRef<Record<number, HTMLAudioElement | null>>({});

 const [isBulkDropdownOpen, setIsBulkDropdownOpen] = useState(false);

 const setTrackField = (idx: number, field: keyof TrackOverride, value: any) => {
 setTrackOverrides(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }));
 };

 const pauseAllExcept = (exceptIdx: number) => {
 Object.entries(audioRefs.current).forEach(([k, el]) => {
 if (+k !== exceptIdx && el) { el.pause(); setTrackField(+k, 'isPlaying', false); }
 });
 };

  const handleTogglePlay = (idx: number) => {
    const el = audioRefs.current[idx];
    if (!el) return;
    if (trackOverrides[idx]?.isPlaying) { 
      el.pause(); 
      setTrackField(idx, 'isPlaying', false); 
    } else { 
      const previewUrl = trackOverrides[idx]?.previewUrl;
      if (!previewUrl) {
        showAlert('error', 'Playback Blocked', 'No audio preview stream is available for this track.');
        return;
      }
      pauseAllExcept(idx); 
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setTrackField(idx, 'isPlaying', true);
          })
          .catch((err) => {
            console.error("Playlist import track playback failed:", err);
            setTrackField(idx, 'isPlaying', false);
            showAlert('error', 'Playback Failed', 'Could not play the track preview.');
          });
      } else {
        setTrackField(idx, 'isPlaying', true);
      }
    }
  };

 const handleFetchPreview = async (idx: number, track: any, customUrlOverride?: string, quiet = false) => {
 setTrackField(idx, 'isFetching', true);

 const linkToUse = (customUrlOverride ?? trackOverrides[idx]?.customUrl)?.trim();
 if (!quiet) {
 showAlert('warning', 'Fetching Audio...', `Synchronizing sonic data for "${track.title}" from ${linkToUse ? 'custom link' : 'search pool'}...`);
 // Stop all audio immediately
 pauseAllExcept(-1);
 }

 try {
 const query = linkToUse || `${track.artist || collection?.artist} - ${track.title}`;
 const mode = linkToUse ? '' : '&mode=search';
 const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(query)}&fetchAudio=true${mode}`);
 const audioUrl = res.data?.previewUrl || res.data?.audioUrl || null;
 if (audioUrl) {
 setTrackField(idx, 'previewUrl', audioUrl);
 setTrackField(idx, 'audioError', null);
 if (res.data?.audioUrl) {
 setTrackField(idx, 'customUrl', res.data.audioUrl);
 }
 if (res.data?.duration && (!track.duration || track.duration <= 0)) {
 setCollection(prev => {
 if (!prev || !prev.tracks) return prev;
 const updatedTracks = [...prev.tracks];
 updatedTracks[idx] = { ...updatedTracks[idx], duration: res.data.duration };
 return { ...prev, tracks: updatedTracks };
 });
 }
 if (!quiet) showAlert('success', 'Sync Successful', `Audio for "${track.title}" is ready.`);
 } else {
 const errMsg = res.data?.audioError || "No matching audio found in hub.";
 setTrackField(idx, 'audioError', errMsg);
 if (!quiet) showAlert('error', 'Fetch Failed', `${errMsg} Try pasting a YouTube link override.`);
 }
 } catch (err: any) {
 const errMsg = err?.message || "Could not fetch preview.";
 setTrackField(idx, 'audioError', errMsg);
 if (!quiet) showAlert('error', 'Fetch failed', 'Could not fetch preview.');
 }
 finally { setTrackField(idx, 'isFetching', false); }
 };

 // NOTE: Audio is NOT auto-fetched. The backend handles all audio fetching
 // in the background when the user clicks "Initiate sync". Users can still
 // manually preview individual tracks if they want.

 // Alert State
 const [alert, setAlert] = useState<{ show: boolean, type: 'success' | 'error' | 'warning', title: string, message: string, persistent?: boolean }>({ show: false, type: 'success', title: '', message: '', persistent: false });
 const alertTimeoutRef = useRef<any>(null);

 useEffect(() => {
 return () => {
 if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
 };
 }, []);

 const showAlert = (type: 'success' | 'error' | 'warning', title: string, message: string, persistent = false) => {
 if (alertTimeoutRef.current) {
 clearTimeout(alertTimeoutRef.current);
 }
 setAlert({ show: true, type, title, message, persistent });
 if (!persistent) {
 alertTimeoutRef.current = setTimeout(() => {
 setAlert(p => ({ ...p, show: false }));
 alertTimeoutRef.current = null;
 }, 5000); // Closable after 5 seconds
 }
 };

 const handleFetch = async () => {
 if (!url) return;
 setIsFetching(true);
 showAlert('warning', 'Retrieving Manifest', 'Connecting to source terminal and extracting metadata...');

 // Stop all audio immediately
 pauseAllExcept(-1);

 setCollection(null);
 setTrackOverrides({});
 try {
 const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(url)}&fetchAudio=false`);
 const data = res.data;
 if (data.error) { showAlert('error', 'Inquiry Rejected', data.error); return; }

 let collectionData = data;
 if (!data.isCollection) {
 collectionData = { ...data, isCollection: true, tracks: [{ title: data.title, artist: data.artist, duration: data.duration, trackNumber: 1 }] };
 }
 setCollection(collectionData);
 setAlbumName(collectionData.title || "");
 setArtistName(collectionData.artist || "");
 setLabelName("Zenify");
 setGenre("Cinema");
 // Init overrides
 const init: Record<number, TrackOverride> = {};
 (collectionData.tracks || []).forEach((track: any, i: number) => { init[i] = { customUrl: '', previewUrl: null, isPlaying: false, isFetching: false, audioError: track.audioError || null, customImage: '' }; });
 setTrackOverrides(init);
 setSelectedTracks(new Set((collectionData.tracks || []).map((_: any, i: number) => i)));
 showAlert('success', 'Manifest retrieved', `Identified ${collectionData.tracks?.length || 0} track(s). Auto-fetching audio previews concurrently...`);
 } catch { showAlert('error', 'Network failure', 'Unable to connect to the source terminal.'); }
 finally { setIsFetching(false); }
 };

 const handleBatchImport = async () => {
 if (!collection?.tracks || isBatchImporting) return;
 const tracksToImport = collection.tracks.filter((_: any, i: number) => selectedTracks.has(i));
 if (tracksToImport.length === 0) { showAlert('warning', 'Selection empty', 'Select at least one track.'); return; }

 try {
 await startBatchImport(
 collection,
 tracksToImport,
 trackOverrides,
 { albumTitle: albumName, artistName, genre, copyrightLabel: labelName }
 );

 showAlert('success', 'Background Import Started', `${tracksToImport.length} track(s) are being imported in the background. You can close this page — the server will keep processing.`, true);
 // Clear the form so user knows it's done
 setTimeout(() => {
 setCollection(null);
 setSelectedTracks(new Set());
 setUrl('');
 setTrackOverrides({});
 }, 2000);
 } catch (e) {
 showAlert('error', 'Intake Failed', 'Could not start the background import. Check your connection and try again.', true);
 }
 };

 const toggleTrack = (i: number) => {
 const s = new Set(selectedTracks);
 s.has(i) ? s.delete(i) : s.add(i);
 setSelectedTracks(s);
 };
 const toggleAll = () => {
 setSelectedTracks(selectedTracks.size === collection?.tracks?.length ? new Set() : new Set(collection?.tracks?.map((_: any, i: number) => i)));
 };

 return (
 <div className="min-h-screen bg-background text-white">
 <div className="fixed inset-0 pointer-events-none opacity-40">
 <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/4" />
 <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 blur-[100px] rounded-full translate-y-1/4 -translate-x-1/4" />
 </div>

 <div className="relative z-10 max-w-6xl mx-auto px-6 pt-6 pb-32">
 {/* Header */}
 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
 <div className="space-y-4">
 <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-white/20 hover:text-white transition-colors text-[10px] tracking-[0.2em] font-black">
 <ChevronLeft size={12} /> Back to terminal
 </button>
 <div className="space-y-1">
 <h1 className="text-3xl md:text-5xl md:font-brand text-brand leading-none tracking-tighter">Intake master</h1>
 <p className="text-white/30 text-[10px] tracking-[0.2em] font-medium">Batch asset acquisition — YouTube, Spotify, Apple Music</p>
 </div>
 </div>
 </div>

 <div className="premium-card p-5 md:p-10 lg:p-14 min-h-[500px] md:min-h-[600px]">
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
 {/* ── Left Column ── */}
 <div className="lg:col-span-5 space-y-8">
 {/* URL Input */}
 <div className="space-y-3">
 <h3 className="text-[10px] font-bold text-white/40 tracking-[0.2em] flex items-center gap-2">
 <LinkIcon size={12} className="text-brand" /> Collection manifest
 </h3>
 <input
 value={url}
 onChange={e => setUrl(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && handleFetch()}
 placeholder="Paste YouTube, Spotify or Apple Music link..."
 className="w-full h-12 bg-black/40 border border-zinc-800 rounded-xl px-5 text-sm font-medium focus:outline-none focus:border-brand/50 transition-all placeholder:text-zinc-600 text-zinc-300"
 />
 <p className="text-[9px] text-white/20 font-medium leading-relaxed">Supports YouTube video/playlist, Spotify track/album/playlist, Apple Music track/album</p>
 <button
 onClick={handleFetch}
 disabled={!url || isFetching}
 className="w-full h-12 rounded-xl bg-black hover:bg-brand/10 disabled:opacity-50 text-brand border border-brand/50 text-[11px] font-black tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3"
 >
 {isFetching ? <ZenLoading size="xs" className="text-brand" /> : <Search size={16} />}
 {isFetching ? "Syncing..." : "Retrieve source"}
 </button>
 </div>

 {/* Collection Meta + editable fields */}
 {collection && (
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 pt-5 border-t border-white/5">
 {/* Cover + editable album name */}
 <div className="flex gap-4 items-start">
 <div className="shrink-0 flex flex-col gap-2 w-24">
 <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group bg-white/5">
 <img src={collection.cover || "/placeholder.jpg"} onError={(e) => { e.currentTarget.src = "/placeholder.jpg"; }} className="w-full h-full object-cover" alt="cover" />
 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
 <span className="text-[9px] font-bold tracking-widest text-white">COVER</span>
 </div>
 </div>
 <div className="flex w-full gap-1">
 <input 
 type="text" 
 placeholder="Override URL" 
 value={collection.cover || ''}
 onChange={e => setCollection({...collection, cover: e.target.value})}
 className="flex-1 min-w-0 h-7 bg-white/5 border border-white/10 rounded px-1.5 text-[9px] text-white/50 focus:outline-none focus:border-brand/40"
 />
 <button 
 title="Fetch Image from URL"
 onClick={async () => {
 if (!collection.cover || !collection.cover.startsWith('http')) return;
 try {
 showAlert('warning', 'Fetching Image', 'Extracting image from link...');
 const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(collection.cover)}&fetchAudio=false`);
 if (res.data?.cover) {
 setCollection({...collection, cover: res.data.cover});
 showAlert('success', 'Image Extracted', 'Successfully fetched image from link.');
 } else {
 showAlert('error', 'Fetch Failed', 'No image found at that link.');
 }
 } catch (e) {
 showAlert('error', 'Fetch Failed', 'Could not extract image from the provided link.');
 }
 }}
 className="w-7 h-7 bg-white/10 hover:bg-zinc-900/20 border border-white/10 hover:border-brand/40 rounded flex items-center justify-center text-brand/70 hover:text-brand transition-colors"
 >
 <Search size={10} />
 </button>
 </div>
</div>
 <div className="flex-1 min-w-0 space-y-2 pt-1">
 <span className="px-2 py-0.5 rounded bg-brand/10 text-brand text-[8px] font-black tracking-widest border border-brand/20">
 {collection.type || 'Collection'}
 </span>
 {/* Editable album title */}
 <div className="flex items-center gap-2">
 {isEditingAlbum ? (
 <input
 autoFocus
 value={albumName}
 onChange={e => setAlbumName(e.target.value)}
 onBlur={() => setIsEditingAlbum(false)}
 onKeyDown={e => e.key === 'Enter' && setIsEditingAlbum(false)}
 className="flex-1 bg-white/5 border border-brand/40 rounded-lg px-2 py-1 text-sm font-bold text-white focus:outline-none"
 />
 ) : (
 <h2 className="text-sm font-bold text-zinc-200 tracking-tight truncate">{albumName}</h2>
 )}
 <button onClick={() => setIsEditingAlbum(v => !v)} className="shrink-0 text-white/20 hover:text-brand transition-colors">
 {isEditingAlbum ? <Check size={13} /> : <Pencil size={11} />}
 </button>
 </div>
 </div>
 </div>

 {/* Editable fields */}
 <div className="space-y-3">
 <div>
 <label className="text-[9px] font-bold text-white/30 tracking-widest uppercase block mb-1">Artist Name</label>
 <input value={artistName} onChange={e => setArtistName(e.target.value)} placeholder="Artist name..." className="w-full h-9 bg-black/40 border border-zinc-800 rounded-lg px-3 text-xs font-medium focus:outline-none focus:border-brand/50 transition-all placeholder:text-zinc-700 text-zinc-300" />
 </div>
 <div>
 <label className="text-[9px] font-bold text-white/30 tracking-widest uppercase block mb-1">Label / Copyright</label>
 <input value={labelName} onChange={e => setLabelName(e.target.value)} placeholder="Label name..." className="w-full h-9 bg-black/40 border border-zinc-800 rounded-lg px-3 text-xs font-medium focus:outline-none focus:border-brand/50 transition-all placeholder:text-zinc-700 text-zinc-300" />
 </div>
 <div>
 <label className="text-[9px] font-bold text-white/30 tracking-widest uppercase block mb-1">Genre</label>
 <input value={genre} onChange={e => setGenre(e.target.value)} placeholder="Genre..." className="w-full h-9 bg-black/40 border border-zinc-800 rounded-lg px-3 text-xs font-medium focus:outline-none focus:border-brand/50 transition-all placeholder:text-zinc-700 text-zinc-300" />
 </div>
 </div>

 {/* Stats */}
 <div className="grid grid-cols-2 gap-3">
 <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
 <p className="text-[9px] font-bold text-white/20 tracking-widest">selected</p>
 <p className="text-lg font-black text-zinc-300">{selectedTracks.size} tracks</p>
 </div>
 <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
 <p className="text-[9px] font-bold text-white/20 tracking-widest">protocol</p>
 <p className="text-[10px] font-bold text-brand">Background import</p>
 </div>
 </div>

 {/* Sending to server indicator */}
 {isBatchImporting && (
 <div className="space-y-2 p-3 rounded-xl bg-brand/5 border border-brand/10">
 <div className="flex items-center gap-3">
 <ZenLoading size="xs" className="text-brand" />
 <p className="text-[10px] font-bold text-brand">Sending to server...</p>
 </div>
 </div>
 )}


 </motion.div>
 )}
 </div>

 {/* ── Right Column: Track List ── */}
 <div className="lg:col-span-7">
 {!collection?.tracks ? (
 <div className="h-full min-h-[400px] border border-white/5 rounded-[2rem] flex flex-col items-center justify-center p-12 text-center bg-white/[0.02]">
 <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-6 border border-white/5">
 <Music className="w-6 h-6 text-white/10" />
 </div>
 <h3 className="text-sm font-bold text-white/40 tracking-widest">No manifest loaded</h3>
 <p className="text-[10px] text-white/20 tracking-widest font-bold mt-2">Enter a URL to initialize intake protocol.</p>
 </div>
 ) : (
 <div className="space-y-4">
 {/* Select all header */}
 <div className="flex items-center justify-between px-2">
 <button onClick={toggleAll} className="flex items-center gap-3 group">
 <div className={cn("w-4 h-4 rounded border flex items-center justify-center transition-all", selectedTracks.size === collection.tracks.length ? "bg-brand border-brand" : "border-white/20 bg-black/40")}>
 {selectedTracks.size === collection.tracks.length && <Check size={10} className="text-white" />}
 {selectedTracks.size > 0 && selectedTracks.size < collection.tracks.length && <div className="w-2 h-0.5 bg-white/50" />}
 </div>
 <span className="text-[10px] font-bold tracking-[0.2em] text-white/40 group-hover:text-white transition-colors">Select all</span>
 </button>
 <p className="text-[10px] font-bold text-zinc-600 tracking-widest">{selectedTracks.size} / {collection.tracks.length}</p>
 </div>

 {/* Track rows */}
 <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
 {collection.tracks.map((track: any, i: number) => {
 const isSelected = selectedTracks.has(i);
 const over = trackOverrides[i] || { customUrl: '', previewUrl: null, isPlaying: false, isFetching: false, customImage: '' };
 return (
 <motion.div
 key={i}
 initial={{ opacity: 0, x: 10 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: i * 0.02 }}
 className={cn(
 "rounded-2xl border transition-all overflow-hidden",
 isSelected ? "bg-white/[0.03] border-white/10" : "bg-transparent border-transparent opacity-50"
 )}
 >
 {/* Main track row */}
 <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 cursor-pointer" onClick={() => toggleTrack(i)}>
 {/* Checkbox */}
 <div className={cn("w-4 h-4 md:w-5 md:h-5 rounded-md border flex items-center justify-center shrink-0 transition-all", isSelected ? "bg-brand border-brand" : "border-white/20 bg-black/40")}>
 {isSelected && <Check size={10} className="text-white md:w-[11px] md:h-[11px]" />}
 </div>

 {/* Track number */}
 <span className="text-[9px] md:text-[10px] font-mono text-white/20 w-4 md:w-5 text-center shrink-0">{(i + 1).toString().padStart(2, '0')}</span>
 <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg shrink-0 overflow-hidden bg-white/10 border border-white/10">
 <img src={over.customImage || track.cover || collection.cover || "/placeholder.jpg"} className="w-full h-full object-cover" alt="" />
 </div>

 {/* Title + artist */}
 <div className="flex-1 min-w-0">
 <h4 className={cn("font-bold text-[12px] md:text-[13px] truncate", track.isPlaceholder ? "text-zinc-700 italic" : "text-zinc-300")}>
 {track.isPlaceholder ? `Track ${i + 1}` : track.title}
 </h4>
 <p className="text-[9px] md:text-[10px] font-bold text-zinc-600 tracking-widest truncate">{artistName || track.artist || collection.artist}</p>
 {over.audioError && (
 <p className="text-[9px] text-red-400/85 font-semibold mt-0.5 leading-tight select-text">⚠️ Error: {over.audioError}</p>
 )}
 </div>

 {/* Preview play/fetch button */}
 <div className="shrink-0" onClick={e => e.stopPropagation()}>
 {over.previewUrl ? (
 <button
 onClick={() => handleTogglePlay(i)}
 className={cn("w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all", over.isPlaying ? "bg-zinc-900 text-brand" : "bg-white/10 text-brand/50 hover:bg-zinc-900/30")}
 >
 {over.isPlaying
 ? <Pause size={10} className="md:w-3 md:h-3" fill="currentColor" />
 : <Play size={10} className="ml-0.5 md:w-3 md:h-3" fill="currentColor" />}
 </button>
 ) : (
 <button
 onClick={() => handleFetchPreview(i, track)}
 disabled={over.isFetching}
 title="Fetch & preview audio"
 className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-brand hover:border-brand/40 transition-all"
 >
 {over.isFetching ? <ZenLoading size="xs" /> : <Music size={10} className="md:w-3 md:h-3" />}
 </button>
 )}
 </div>
 </div>

 {over.previewUrl && (
 <div className="px-3 md:px-4 pb-2" onClick={e => e.stopPropagation()}>
 <audio
 ref={el => { audioRefs.current[i] = el; }}
 src={getMediaUrl(over.previewUrl)}
 crossOrigin="anonymous"
 onEnded={() => setTrackField(i, 'isPlaying', false)}
 />
 <MiniSlider getAudioEl={() => audioRefs.current[i]} isPlaying={over.isPlaying} />
 </div>
 )}

 {/* Custom YouTube link override */}
 <div className="px-3 md:px-4 pb-3 flex flex-col md:flex-row gap-2" onClick={e => e.stopPropagation()}>
 <input
 type="text"
 placeholder="Override: paste YouTube link..."
 value={over.customUrl}
 onChange={e => setTrackField(i, 'customUrl', e.target.value)}
 className="w-full md:flex-1 h-8 bg-black/40 border border-white/[0.07] rounded-lg px-3 text-[10px] md:text-[11px] text-white/60 placeholder:text-white/15 focus:outline-none focus:border-brand/40 transition-all"
 />
 {over.customUrl.trim() && (
 <div className="flex gap-2 justify-end shrink-0">
 <button
 onClick={() => handleFetchPreview(i, track)}
 disabled={over.isFetching}
 className="h-8 px-4 md:px-3 rounded-lg bg-zinc-900/10 border border-brand/20 text-brand text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-900 hover:text-brand transition-all disabled:opacity-50"
 >
 {over.isFetching ? '...' : 'Use'}
 </button>
 <button onClick={() => setTrackField(i, 'customUrl', '')} className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/5 text-white/30 hover:text-white transition-all">
 <RotateCcw size={11} />
 </button>
 </div>
 )}
 </div>
 </motion.div>
 );
 })}
 </div>

 {/* Bulk Image Assignment */}
 <div className="mt-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
 <h4 className="text-[10px] font-bold text-white/40 tracking-widest uppercase">Bulk Image Assignment</h4>
 <div className="flex gap-2">
 <input 
 type="text"
 placeholder="Paste image link here to apply to selected tracks..."
 value={bulkImage}
 onChange={e => setBulkImage(e.target.value)}
 className="flex-1 h-10 bg-black/40 border border-white/[0.07] rounded-xl px-3 text-xs text-white/60 focus:outline-none focus:border-brand/40"
 />
 </div>
 
 {/* Track Selection Dropdown */}
 <div className="relative">
 <button 
 onClick={() => setIsBulkDropdownOpen(!isBulkDropdownOpen)}
 className="w-full h-10 bg-black/40 border border-white/[0.07] rounded-xl px-3 text-xs text-white/60 flex items-center justify-between hover:border-white/20 transition-colors"
 >
 <span>Select Tracks to Apply Image ({selectedTracks.size} selected)</span>
 <span className="text-[10px]">▼</span>
 </button>
 
 {isBulkDropdownOpen && (
 <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 p-2 custom-scrollbar">
 <div className="flex items-center justify-between px-2 pb-2 mb-2 border-b border-white/10">
 <button onClick={toggleAll} className="text-[10px] font-bold tracking-widest text-brand hover:text-white transition-colors uppercase">
 {selectedTracks.size === collection?.tracks?.length ? 'Deselect All' : 'Select All'}
 </button>
 <button onClick={() => setIsBulkDropdownOpen(false)} className="text-white/40 hover:text-white transition-colors">
 <Check size={14} />
 </button>
 </div>
 {collection?.tracks?.map((t: any, i: number) => (
 <label key={i} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
 <input 
 type="checkbox" 
 checked={selectedTracks.has(i)}
 onChange={() => toggleTrack(i)}
 className="w-4 h-4 rounded bg-black/50 border border-white/20 checked:bg-brand checked:border-brand cursor-pointer"
 />
 <div className="flex-1 min-w-0 flex items-center gap-2">
 <span className="text-[10px] text-white/30 font-mono w-4">{(i + 1).toString().padStart(2, '0')}</span>
 <span className="text-xs text-white/80 truncate">{t.title}</span>
 </div>
 </label>
 ))}
 </div>
 )}
 </div>

 <div className="flex gap-2 pt-2">
 <button 
 disabled={!bulkImage || selectedTracks.size === 0}
 onClick={async () => {
 showAlert('warning', 'Processing...', 'Resolving image URL...');
 let finalUrl = bulkImage;
 
 // If it's a website link, extract the image first
 if (bulkImage.includes('spotify.com') || bulkImage.includes('apple.com')) {
 try {
 const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(bulkImage)}&fetchAudio=false`);
 if (res.data?.cover) finalUrl = res.data.cover;
 } catch (e) {
 showAlert('error', 'Resolution Failed', 'Could not extract image from the provided link. Applying raw link instead.');
 }
 }

 const newOverrides = { ...trackOverrides };
 selectedTracks.forEach(idx => {
 newOverrides[idx] = { ...newOverrides[idx], customImage: finalUrl };
 });
 setTrackOverrides(newOverrides);
 setBulkImage("");
 setIsBulkDropdownOpen(false);
 showAlert('success', 'Images Applied', `Applied custom image to ${selectedTracks.size} tracks.`);
 }}
 className="flex-1 h-10 px-4 rounded-xl bg-zinc-900 border border-brand text-brand text-xs font-bold tracking-widest hover:bg-zinc-900/80 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.3)]"
 >
 Apply Image to Selected Tracks
 </button>
 <button 
 disabled={selectedTracks.size === 0}
 onClick={() => {
 const newOverrides = { ...trackOverrides };
 selectedTracks.forEach(idx => {
 newOverrides[idx] = { ...newOverrides[idx], customImage: '' };
 });
 setTrackOverrides(newOverrides);
 setIsBulkDropdownOpen(false);
 showAlert('success', 'Images Reset', `Reset custom image for ${selectedTracks.size} tracks.`);
 }}
 className="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-bold tracking-widest hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
 >
 Reset
 </button>
 </div>
 </div>

 {/* Initiate Sync — placed AFTER all tracks */}
 <button
 onClick={handleBatchImport}
 disabled={isBatchImporting || selectedTracks.size === 0}
 className="w-full h-14 mt-2 rounded-2xl bg-black text-brand border border-brand/50 hover:bg-brand/10 font-black tracking-[0.2em] text-[12px] transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.1)] active:scale-95 disabled:opacity-50"
 >
 {isBatchImporting ? <ZenLoading size="sm" /> : <Download size={18} />}
 {isBatchImporting ? "Sending..." : "Initiate Now"}
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Alert */}
 <AnimatePresence>
 {alert.show && (
 <motion.div
 initial={{ opacity: 0, y: -20, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, scale: 0.95, y: -20 }}
 className="fixed top-24 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 z-[150] w-[calc(100%-2rem)] md:w-[320px] bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden text-left"
 >
 <div className="p-4 flex items-start gap-4">
 <div className={cn("w-10 h-10 rounded-xl shrink-0 flex items-center justify-center", alert.type === 'success' ? "bg-emerald-500/10 text-emerald-500" : alert.type === 'error' ? "bg-brand/10 text-brand" : "bg-amber-500/10 text-amber-500")}>
 {alert.type === 'success' ? <CheckCircle2 size={18} /> : alert.type === 'error' ? <AlertCircle size={18} /> : <Sparkles size={18} />}
 </div>
 <div className="flex-1 space-y-1 py-1">
 <h3 className="text-white font-bold text-xs tracking-wide">{alert.title}</h3>
 <p className="text-white/40 text-[10px] font-medium leading-relaxed whitespace-pre-wrap">{alert.message}</p>
 </div>
 <button onClick={() => setAlert(p => ({ ...p, show: false }))} className="p-2 text-white/40 hover:text-white transition-colors absolute top-2 right-2">
 <X size={14} />
 </button>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}
