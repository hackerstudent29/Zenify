"use client";

import React, { useState, useEffect, useRef } from "react";
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
    Shield,
    X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { useImportStore } from "@/store/importStore";

export default function PlaylistImportPage() {
    const router = useRouter();
    const [url, setUrl] = useState("");
    const [isFetching, setIsFetching] = useState(false);
    const [collection, setCollection] = useState<any>(null);
    const { isBatchImporting, startBatchImport, batchProgress } = useImportStore();
    const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
    const prevIsImporting = useRef(isBatchImporting);

    // Track import completion for notification
    useEffect(() => {
        if (prevIsImporting.current && !isBatchImporting && batchProgress.total > 0) {
            const { successCount, failCount, total } = batchProgress;

            if (successCount === 0) {
                showAlert('error', 'Intake Failed', `None of the ${total} selected tracks could be processed. Please check your terminal permissions.`, true);
            } else if (failCount > 0) {
                showAlert('warning', 'Partial Sync', `Sync completed with warnings. ${successCount} tracks archived, ${failCount} failed.`, true);
            } else {
                showAlert('success', 'Terminal Sync Complete', `All ${total} tracks successfully retrieved and processed.`, true);
            }
        }
        prevIsImporting.current = isBatchImporting;
    }, [isBatchImporting, batchProgress]);

    // Alert State
    const [alert, setAlert] = useState<{ show: boolean, type: 'success' | 'error' | 'warning', title: string, message: string, persistent?: boolean }>({
        show: false,
        type: 'success',
        title: '',
        message: '',
        persistent: false
    });

    const showAlert = (type: 'success' | 'error' | 'warning', title: string, message: string, persistent: boolean = false) => {
        setAlert({ show: true, type, title, message, persistent });
        if (type === 'success' && !persistent) {
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
            } else if (data.isCollection || data.title) {
                let collectionData = data;

                // If it's a single track, wrap it into a collection format automatically
                if (!data.isCollection) {
                    collectionData = {
                        ...data,
                        isCollection: true,
                        tracks: [{
                            title: data.title,
                            artist: data.artist,
                            duration: data.duration,
                            trackNumber: 1
                        }]
                    };
                }

                setCollection(collectionData);
                setSelectedTracks(new Set((collectionData.tracks || []).map((_: any, i: number) => i)));
                showAlert('success', 'Manifest retrieved', `Successfully identified ${collectionData.tracks?.length || 0} track(s).`);
            } else {
                showAlert('warning', 'Type mismatch', "Could not parse music data from this link.");
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

        showAlert('success', 'Intake initiated', "Syncing selected tracks in the background.");

        // Await the completion of the batch import
        const results = await startBatchImport(collection, tracksToImport);

        // Build detailed clear message
        let detailedMessage = "";

        if (results.successTitles.length > 0) {
            detailedMessage += `Archived: ${results.successTitles.join(", ")}\n\n`;
        }

        if (results.failTitles.length > 0) {
            detailedMessage += `Failed to find audio for: ${results.failTitles.join(", ")}\n\n`;
            detailedMessage += "Try checking YouTube manually for these tracks.";
        } else if (results.successTitles.length === results.total) {
            detailedMessage = `Perfect sync! all ${results.total} assets secured.`;
        }

        // Show the final result notification
        if (results.success === 0) {
            showAlert('error', 'Intake Failed', detailedMessage || "No selected tracks could be processed.", true);
        } else if (results.fail > 0) {
            showAlert('warning', 'Partial Sync', detailedMessage, true);
        } else {
            showAlert('success', 'Terminal Sync Complete', detailedMessage, true);
        }

        // Reset the section back to default state
        setCollection(null);
        setSelectedTracks(new Set());
        setUrl("");
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
                            <h1 className="text-3xl md:text-5xl font-bold text-rose-500 leading-none tracking-tighter italic">
                                Intake master
                            </h1>
                            <p className="text-white/30 text-[10px] tracking-[0.2em] font-medium">Batch asset acquisition — YouTube, Spotify, Apple Music</p>
                        </div>
                    </div>
                </div>

                {/* Main Content Card mimicking the Distribution Terminal layout */}
                <div className="premium-card p-5 md:p-10 lg:p-14 min-h-[500px] md:min-h-[600px]">
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
                                            placeholder="Paste YouTube, Spotify or Apple Music link..."
                                            className="w-full h-12 bg-black/40 border border-zinc-800 rounded-xl px-4 md:px-5 text-sm font-medium focus:outline-none focus:border-rose-500/50 transition-all placeholder:text-zinc-600 text-zinc-300"
                                        />
                                    </div>
                                    <p className="text-[9px] text-white/20 font-medium leading-relaxed pt-1">
                                        Supports YouTube video/playlist, Spotify track/album/playlist, Apple Music track/album
                                    </p>
                                    <button
                                        onClick={handleFetch}
                                        disabled={!url || isFetching}
                                        className="w-full h-12 rounded-xl bg-black hover:bg-rose-500/10 disabled:opacity-50 text-rose-500 border border-rose-500/50 text-[11px] font-black tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3 mt-4"
                                    >
                                        {isFetching ? <ZenLoading size="xs" className="text-rose-500" /> : <Search size={16} />}
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
                                            <h2 className="text-xl font-bold text-zinc-200 tracking-tight leading-tight">{collection.title}</h2>
                                            <p className="text-zinc-500 text-[11px] font-bold tracking-widest">{collection.artist}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                                            <p className="text-[9px] font-bold text-white/20 tracking-widest">selected</p>
                                            <p className="text-xl font-black text-zinc-300">{selectedTracks.size} tracks</p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                                            <p className="text-[9px] font-bold text-white/20 tracking-widest">protocol</p>
                                            <p className="text-[10px] font-bold text-rose-500">Ready to sync</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleBatchImport}
                                        disabled={isBatchImporting || selectedTracks.size === 0}
                                        className="w-full h-14 rounded-2xl bg-black text-rose-500 border border-rose-500/50 hover:bg-rose-500/10 font-black tracking-[0.2em] text-[12px] transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(244,63,94,0.1)] active:scale-95"
                                    >
                                        {isBatchImporting ? <ZenLoading size="sm" /> : <Download size={18} />}
                                        {isBatchImporting ? "Processing..." : "Initiate sync"}
                                    </button>
                                </motion.div>
                            )}
                        </div>

                        {/* Right Content Column */}
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
                                        <p className="text-[10px] font-bold text-zinc-600 tracking-widest">{selectedTracks.size} / {collection.tracks.length}</p>
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
                                                            track.isPlaceholder ? "text-zinc-700 italic" : "text-zinc-400 group-hover:text-zinc-200 transition-colors"
                                                        )}>
                                                            {track.isPlaceholder ? `Track ${i + 1}` : track.title}
                                                        </h4>
                                                        <p className="text-[10px] font-bold text-zinc-600 tracking-widest mt-0.5 truncate">{track.artist || collection.artist}</p>
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



            {/* Custom Alert */}
            <AnimatePresence>
                {alert.show && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95, x: 20 }}
                        className="fixed top-24 right-6 z-[150] w-[320px] bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden text-left"
                    >
                        <div className="p-4 flex items-start gap-4">
                            <div className={cn(
                                "w-10 h-10 rounded-xl shrink-0 flex items-center justify-center",
                                alert.type === 'success' ? "bg-emerald-500/10 text-emerald-500" :
                                    alert.type === 'error' ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"
                            )}>
                                {alert.type === 'success' ? <CheckCircle2 size={18} /> :
                                    alert.type === 'error' ? <AlertCircle size={18} /> : <Sparkles size={18} />}
                            </div>

                            <div className="flex-1 space-y-1 py-1">
                                <h3 className="text-white font-bold text-xs tracking-wide">{alert.title}</h3>
                                <p className="text-white/40 text-[10px] font-medium leading-relaxed whitespace-pre-wrap">
                                    {alert.message}
                                </p>
                            </div>

                            <button
                                onClick={() => setAlert(prev => ({ ...prev, show: false }))}
                                className="p-2 text-white/40 hover:text-white transition-colors absolute top-2 right-2"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </motion.div>
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
