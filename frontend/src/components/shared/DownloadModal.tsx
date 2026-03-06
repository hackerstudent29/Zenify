"use client";

import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import { Download } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";
import { useEffect } from "react";

export function DownloadModal() {
    const { isDownloadModalOpen, downloadTrack, closeDownloadModal } = useUIStore();

    // Prevent body scroll when open
    useEffect(() => {
        if (isDownloadModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isDownloadModalOpen]);

    if (!downloadTrack) return null;

    const handleActualDownload = async () => {
        if (!downloadTrack) return;

        try {
            const url = getMediaUrl(downloadTrack.audioUrl) || "";
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${downloadTrack.title} - ${downloadTrack.artist?.name || 'Unknown'}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);

            closeDownloadModal();
        } catch (error) {
            console.error("Download failed:", error);
            // Fallback to simple window.open if fetch fails (e.g. CORS)
            window.open(getMediaUrl(downloadTrack.audioUrl) || "", '_blank');
            closeDownloadModal();
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <AnimatePresence>
            {isDownloadModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeDownloadModal}
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
                            {/* Minimal Horizontal Header */}
                            <div className="flex items-center gap-3">
                                <div className="w-14 h-14 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0">
                                    <img
                                        src={getMediaUrl(downloadTrack.coverUrl) || `https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=400&q=80`}
                                        className="w-full h-full object-cover"
                                        alt={downloadTrack.title}
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-sm font-bold text-white tracking-tight truncate leading-tight">
                                        {downloadTrack.title}
                                    </h2>
                                    <div className="flex flex-col gap-0.5">
                                        <p className="text-[12px] font-semibold text-white/70 truncate">
                                            {downloadTrack.artist?.name || 'Unknown Artist'}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[10px] font-black text-brand/40 uppercase tracking-tighter">
                                                {formatTime(downloadTrack.duration)}
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-white/10" />
                                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-tight truncate">
                                                {downloadTrack.genre || 'Master'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Minimalist Side-by-Side Action Area */}
                            <div className="grid grid-cols-2 gap-2 pb-1">
                                <button
                                    onClick={closeDownloadModal}
                                    className="py-2.5 text-[10px] font-bold text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors bg-white/5 rounded-lg border border-white/5"
                                >
                                    Cancel
                                </button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleActualDownload}
                                    className="py-2.5 bg-brand hover:bg-brand text-white rounded-lg flex items-center justify-center gap-2 font-bold text-[10px] tracking-widest uppercase transition-colors"
                                >
                                    <Download size={12} />
                                    Get Song
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
