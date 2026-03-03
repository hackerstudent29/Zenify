"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { X } from "lucide-react";
import { AudioFxMenu } from "./audio-fx-menu";
import { useEffect } from "react";

export function AudioFxModal() {
    const { isAudioFxOpen, setAudioFxOpen } = useUIStore();

    useEffect(() => {
        if (isAudioFxOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isAudioFxOpen]);

    return (
        <AnimatePresence>
            {isAudioFxOpen && (
                <div className="fixed bottom-[100px] right-8 z-[700] w-full max-w-[340px]">
                    {/* Modal Content - Now a small popover */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30, x: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20, x: 10 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative bg-[#111112] border border-white/10 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-2">
                            <div>
                                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-brand">Studio FX</h2>
                                <p className="text-[9px] font-bold text-white/30 tracking-tight">Audio Suite</p>
                            </div>
                            <button
                                onClick={() => setAudioFxOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* FX Menu - More compact padding */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto scrollbar-hide">
                            <AudioFxMenu className="space-y-8" />
                        </div>

                        {/* Status Bar */}
                        <div className="px-6 py-3 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-brand" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-white/20">V4.0 Engine</span>
                            </div>
                            <span className="text-[8px] font-bold text-white/10">32-BIT FLOAT</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
