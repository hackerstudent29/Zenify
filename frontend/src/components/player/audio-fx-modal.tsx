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
                <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setAudioFxOpen(false)}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-[400px] bg-[#1c1c1e] border border-white/5 rounded-[32px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-8 pt-8 pb-2">
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-brand">Studio FX</h2>
                                <p className="text-[10px] font-bold text-white/40 tracking-tight">Professional Audio Engine</p>
                            </div>
                            <button
                                onClick={() => setAudioFxOpen(false)}
                                className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* FX Menu */}
                        <div className="p-8 max-h-[80vh] overflow-y-auto scrollbar-hide">
                            <AudioFxMenu className="space-y-10" />
                        </div>

                        {/* Status Bar */}
                        <div className="px-8 py-4 bg-white/5 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Active Engine v4.0</span>
                            </div>
                            <span className="text-[9px] font-bold text-white/20">32-BIT FLOAT PROCESSING</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
