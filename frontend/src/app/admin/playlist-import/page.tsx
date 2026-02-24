"use client";

import React, { useState, useEffect } from "react";
import {
    Music,
    Link as LinkIcon,
    Search,
    ChevronLeft,
    Play,
    Clock,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Sparkles,
    Info,
    Check,
    Download,
    Shield
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { ZenLoading } from "@/components/ui/ZenLoading";

export default function PlaylistImportPage() {
    const router = useRouter();
    const [url, setUrl] = useState("");
    const [isFetching, setIsFetching] = useState(false);
    const [collection, setCollection] = useState<any>(null);
    const [isBatchImporting, setIsBatchImporting] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, activeTrack: "" });
    const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());

    // Alert State
    const [alert, setAlert] = useState<{ show: boolean, type: 'success' | 'error' | 'warning', title: string, message: string }>({
        show: false,
        type: 'success',
        title: '',
        message: ''
    });

    const showAlert = (type: 'success' | 'error' | 'warning', title: string, message: string) => {
        setAlert({ show: true, type, title, message });
        if (type === 'success') {
            setTimeout(() => setAlert(prev => ({ ...prev, show: false })), 4000);
        }
    };

    const handleFetch = async () => {
        if (!url) return;
        setIsFetching(true);
        setCollection(null);
        try {
            const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(url)}&fetchAudio=false`);
            const data = res.data;
            if (data.error) {
                showAlert('error', 'Inquiry Rejected', data.error);
            } else if (data.isCollection) {
                setCollection(data);
                setSelectedTracks(new Set(data.tracks.map((_: any, i: number) => i)));
                showAlert('success', 'Manifest retrieved', `Successfully identified ${data.tracks?.length || 0} tracks.`);
            } else {
                showAlert('warning', 'Type mismatch', "Please use a collection link (Artist, Album, or Playlist).");
            }
        } catch (e) {
            showAlert('error', 'Network failure', "Unable to connect to the source terminal.");
        } finally {
            setIsFetching(false);
        }
    };

    const handleBatchImport = async () => {
        if (!collection?.tracks || isBatchImporting) return;

        const tracksToImport = collection.tracks.filter((_: any, i: number) => selectedTracks.has(i));
        if (tracksToImport.length === 0) {
            showAlert('warning', 'Selection empty', "Please select at least one track to import.");
            return;
        }

        setIsBatchImporting(true);
        setBatchProgress({ current: 0, total: tracksToImport.length, activeTrack: "" });

        try {
            for (let i = 0; i < tracksToImport.length; i++) {
                const track = tracksToImport[i];
                const realIndex = collection.tracks.indexOf(track);
                setBatchProgress(prev => ({ ...prev, current: i + 1, activeTrack: track.title }));

                try {
                    const query = track.isPlaceholder ? `${collection.artist} ${collection.title} track ${realIndex + 1}` : `${track.artist || collection.artist} - ${track.title}`;
                    const res = await api.get(`/metadata/fetch?url=${encodeURIComponent(query)}&fetchAudio=true&mode=search`);
                    const data = res.data;

                    if (data.audioUrl) {
                        await api.post('/tracks/import-external', {
                            title: track.isPlaceholder ? `Track ${realIndex + 1}` : track.title,
                            artistName: track.artist || collection.artist,
                            genre: collection.genre || "Electronic",
                            coverUrl: collection.cover,
                            audioUrl: data.audioUrl,
                            albumTitle: collection.title,
                            duration: track.duration || data.duration || undefined,
                        });
                    }
                } catch (err) {
                    console.error(`Failed to import ${track.title}:`, err);
                }
            }
            showAlert('success', 'Intake complete', "All selected tracks have been successfully synchronized.");
        } catch (e) {
            showAlert('error', 'Process failed', "An unexpected system exception occurred.");
        } finally {
            setIsBatchImporting(false);
        }
    };

    const toggleTrack = (index: number) => {
        const newSet = new Set(selectedTracks);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelectedTracks(newSet);
    };

    const toggleAll = () => {
        if (selectedTracks.size === collection?.tracks?.length) {
            setSelectedTracks(new Set());
        } else {
            setSelectedTracks(new Set(collection?.tracks?.map((_: any, i: number) => i)));
        }
    };

    return (
        <div className="min-h-screen bg-background text-white">
            {/* Atmosphere matching Admin Page */}
            <div className="fixed inset-0 pointer-events-none opacity-40">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-rose-500/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 blur-[100px] rounded-full translate-y-1/4 -translate-x-1/4" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto px-6 pt-6 pb-32">
                {/* Header Section matching Admin Reference */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                    <div className="space-y-4">
                        <button
                            onClick={() => router.push('/admin')}
                            className="flex items-center gap-2 text-white/20 hover:text-white transition-colors text-[10px] tracking-[0.2em] font-black"
                        >
                            <ChevronLeft size={12} /> Back to terminal
                        </button>
                        <div className="space-y-1">
                            <h1 className="text-5xl font-brand text-rose-500 leading-none">
                                Intake master
                            </h1>
                            <p className="text-white/30 text-[10px] tracking-[0.3em] font-medium">Batch asset acquisition protocol</p>
                        </div>
                    </div>
                </div>

                {/* Main Content Card mimicking the Distribution Terminal layout */}
                <div className="premium-card p-10 md:p-14 min-h-[600px]">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                        {/* Left Control Column */}
                        <div className="lg:col-span-5 space-y-10">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <h3 className="text-[10px] font-bold text-white/40 tracking-[0.2em] flex items-center gap-2 mb-4">
                                        <LinkIcon size={12} className="text-rose-500" />
                                        Collection manifest
                                    </h3>
                                    <div className="relative">
                                        <input
                                            value={url}
                                            onChange={(e) => setUrl(e.target.value)}
                                            placeholder="Paste Spotify or Apple Music Link..."
                                            className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-5 text-sm font-medium focus:outline-none focus:border-rose-500/50 transition-all placeholder:text-white/10"
                                        />
                                    </div>
                                    <button
                                        onClick={handleFetch}
                                        disabled={!url || isFetching}
                                        className="w-full h-12 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-[11px] font-black tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3 mt-4"
                                    >
                                        {isFetching ? <ZenLoading size="xs" className="brightness-200" /> : <Search size={16} />}
                                        {isFetching ? "Syncing..." : "Retrieve source"}
                                    </button>
                                </div>
                            </div>

                            {collection && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-8 pt-6 border-t border-white/5"
                                >
                                    <div className="flex gap-6 items-start">
                                        <div className="w-32 h-32 rounded-2xl overflow-hidden shadow-2xl border border-white/10 shrink-0">
                                            <img
                                                src={collection.cover || "/placeholder.jpg"}
                                                className="w-full h-full object-cover"
                                                alt="cover"
                                            />
                                        </div>
                                        <div className="space-y-2 pt-2">
                                            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 text-[8px] font-black tracking-widest border border-rose-500/20">
                                                {collection.type || 'Collection'}
                                            </span>
                                            <h2 className="text-xl font-bold text-white tracking-tight leading-tight">{collection.title}</h2>
                                            <p className="text-white/40 text-[11px] font-bold tracking-widest">{collection.artist}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                                            <p className="text-[9px] font-bold text-white/20 tracking-widest">selected</p>
                                            <p className="text-xl font-black text-white">{selectedTracks.size} tracks</p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                                            <p className="text-[9px] font-bold text-white/20 tracking-widest">protocol</p>
                                            <p className="text-[10px] font-bold text-rose-500">Ready to sync</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleBatchImport}
                                        disabled={isBatchImporting || selectedTracks.size === 0}
                                        className="w-full h-14 rounded-2xl bg-white text-black hover:bg-zinc-200 font-black tracking-[0.2em] text-[12px] transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95"
                                    >
                                        {isBatchImporting ? <ZenLoading size="sm" /> : <Download size={18} />}
                                        {isBatchImporting ? "Processing..." : "Initiate sync"}
                                    </button>
                                </motion.div>
                            )}
                        </div>

                        {/* Right Content Column */}
                        <div className="lg:col-span-7">
                            {!collection ? (
                                <div className="h-full min-h-[400px] border border-white/5 rounded-[2rem] flex flex-col items-center justify-center p-12 text-center bg-white/[0.02]">
                                    <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-6 border border-white/5">
                                        <Music className="w-6 h-6 text-white/10" />
                                    </div>
                                    <h3 className="text-sm font-bold text-white/40 tracking-widest">No manifest loaded</h3>
                                    <p className="text-[10px] text-white/20 tracking-widest font-bold mt-2">Enter a URL to initialize intake protocol.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between px-2">
                                        <button
                                            onClick={toggleAll}
                                            className="flex items-center gap-3 group"
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                                selectedTracks.size === collection.tracks.length ? "bg-rose-500 border-rose-500" : "border-white/20 bg-black/40"
                                            )}>
                                                {selectedTracks.size === collection.tracks.length && <Check size={10} className="text-white" />}
                                                {selectedTracks.size > 0 && selectedTracks.size < collection.tracks.length && <div className="w-2 h-0.5 bg-white/50" />}
                                            </div>
                                            <span className="text-[10px] font-bold tracking-[0.2em] text-white/40 group-hover:text-white transition-colors">Select all</span>
                                        </button>
                                        <p className="text-[10px] font-bold text-white/20 tracking-widest">{selectedTracks.size} / {collection.tracks.length}</p>
                                    </div>

                                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                        {collection.tracks.map((track: any, i: number) => {
                                            const isSelected = selectedTracks.has(i);
                                            return (
                                                <motion.div
                                                    initial={{ opacity: 0, x: 10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.02 }}
                                                    key={i}
                                                    onClick={() => toggleTrack(i)}
                                                    className={cn(
                                                        "group px-5 py-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4",
                                                        isSelected ? "bg-white/5 border-white/10" : "bg-transparent border-transparent hover:bg-white/[0.03]"
                                                    )}
                                                >
                                                    <div className="text-[10px] font-mono text-white/10 w-4 font-bold">{(i + 1).toString().padStart(2, '0')}</div>

                                                    <div className="flex-1 min-w-0">
                                                        <h4 className={cn(
                                                            "font-bold text-[13px] truncate",
                                                            track.isPlaceholder ? "text-white/20 italic" : "text-white/80 group-hover:text-white transition-colors"
                                                        )}>
                                                            {track.isPlaceholder ? `Track ${i + 1}` : track.title}
                                                        </h4>
                                                        <p className="text-[10px] font-bold text-white/20 tracking-widest mt-0.5 truncate">{track.artist || collection.artist}</p>
                                                    </div>

                                                    <div className={cn(
                                                        "w-8 h-8 rounded-lg border flex items-center justify-center transition-all",
                                                        isSelected ? "bg-rose-500 border-rose-500 text-white" : "border-white/10 bg-black/40 text-white/10"
                                                    )}>
                                                        {isSelected ? <Check size={16} /> : <div className="w-1 h-1 rounded-full bg-current" />}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Overlay */}
            <AnimatePresence>
                {isBatchImporting && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-6"
                    >
                        <div className="w-full max-w-md space-y-16 text-center">
                            {/* Central Musical Hub */}
                            <ZenLoading size="xl" />

                            <div className="space-y-10">
                                {/* Textual Indicators */}
                                <div className="space-y-2">
                                    <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic">Syncing collection</h2>
                                    <p className="text-white/40 text-xs font-bold tracking-[0.1em] h-4">
                                        {batchProgress.activeTrack}
                                    </p>
                                </div>

                                {/* Progress Metrics */}
                                <div className="space-y-6">
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                        <motion.div
                                            className="h-full bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.6)]"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                            transition={{ duration: 0.8, ease: "easeOut" }}
                                        />
                                    </div>
                                    <div className="flex justify-center">
                                        <span className="text-xs font-black text-white/20 tracking-[0.3em]">
                                            {batchProgress.current} / {batchProgress.total}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Custom Alert */}
            <AnimatePresence>
                {alert.show && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-[280px] bg-[#1c1c1e] border border-white/10 rounded-[28px] shadow-2xl pointer-events-auto overflow-hidden"
                        >
                            <div className="p-6 text-center space-y-4">
                                <div className={cn(
                                    "w-12 h-12 rounded-2xl mx-auto flex items-center justify-center",
                                    alert.type === 'success' ? "bg-rose-500/10 text-rose-500" :
                                        alert.type === 'error' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"
                                )}>
                                    {alert.type === 'success' ? <CheckCircle2 size={20} /> :
                                        alert.type === 'error' ? <AlertCircle size={20} /> : <Sparkles size={20} />}
                                </div>

                                <div className="space-y-1">
                                    <h3 className="text-white font-bold text-sm leading-tight">{alert.title}</h3>
                                    <p className="text-white/40 text-[10px] font-medium leading-relaxed px-2">
                                        {alert.message}
                                    </p>
                                </div>

                                <button
                                    onClick={() => setAlert(prev => ({ ...prev, show: false }))}
                                    className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white text-[10px] font-bold transition-all"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.05);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(244, 63, 94, 0.1);
                }
            `}</style>
        </div>
    );
}
