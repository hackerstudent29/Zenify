"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useImportStore } from '@/store/importStore';
import { ZenLoading } from '@/components/ui/ZenLoading';

export function BatchImportToast() {
    const { isBatchImporting, batchProgress } = useImportStore();

    return (
        <AnimatePresence>
            {isBatchImporting && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="fixed bottom-6 right-6 z-[120] w-[320px] bg-[#1c1c1e] border border-white/10 shadow-2xl rounded-2xl p-5"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <ZenLoading size="xs" className="text-brand shrink-0" />
                        <div className="flex-1 min-w-0">
                            <h2 className="text-[12px] font-black tracking-tighter text-brand uppercase italic truncate">Syncing collection</h2>
                            <p className="text-white/40 text-[9px] font-bold tracking-widest truncate">
                                {batchProgress.activeTrack || "Initializing..."}
                            </p>
                        </div>
                        <span className="text-[10px] font-black text-brand/60 tracking-[0.2em] shrink-0">
                            {batchProgress.current}/{batchProgress.total}
                        </span>
                    </div>

                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-brand shadow-[0_0_10px_rgba(var(--accent-brand-rgb),0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${(batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0)}%` }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
