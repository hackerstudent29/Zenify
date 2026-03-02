import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X, Search, RotateCcw, Command } from "lucide-react";
import { useShortcutStore, DEFAULT_SHORTCUTS } from "@/store/shortcuts";
import { cn } from "@/lib/utils";

export function ShortcutHelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { shortcuts, resetAll } = useShortcutStore();
    const [search, setSearch] = useState("");

    const filtered = shortcuts.filter(s =>
        s.label.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase())
    );

    const categories = ['Playback', 'Seeking', 'Volume', 'Interface'] as const;
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('shortcut-search')?.focus();
            }
        };
        if (isOpen && !isMobile) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, isMobile]);

    if (!isOpen || isMobile) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-md"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]"
                >
                    {/* Header */}
                    <div className="px-8 pt-8 pb-4 flex items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                                <Keyboard size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white font-[family-name:var(--font-plus-jakarta)]">Keyboard Shortcuts</h2>
                                <p className="text-sm text-white/40 font-medium">Master the Zenify flow</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-white/20 hover:text-white transition-all">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Search & Actions */}
                    <div className="px-8 py-4 flex items-center gap-4 bg-white/[0.02]">
                        <div className="relative flex-1 group">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors" />
                            <input
                                id="shortcut-search"
                                type="text"
                                placeholder="Search actions or categories..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white/[0.04] border border-white/5 rounded-2xl py-2.5 pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-white/20 focus:bg-white/[0.08] text-white transition-all placeholder:text-white/10"
                            />
                        </div>
                        <button
                            onClick={() => resetAll()}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 text-xs font-bold text-white/40 hover:text-white transition-all"
                        >
                            <RotateCcw size={14} />
                            Reset Defaults
                        </button>
                    </div>

                    {/* Shortcut List */}
                    <div className="px-8 pb-8 pt-4 max-h-[50vh] overflow-y-auto scrollbar-hide space-y-8">
                        {categories.map(cat => {
                            const catShortcuts = filtered.filter(s => s.category === cat);
                            if (catShortcuts.length === 0) return null;

                            return (
                                <div key={cat} className="space-y-4">
                                    <h3 className="text-[10px] uppercase tracking-[0.2em] font-black text-brand/80 px-1">{cat}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {catShortcuts.map(s => (
                                            <div key={s.action} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-transparent hover:border-white/10 hover:bg-white/10 transition-all group cursor-default">
                                                <span className="text-sm font-semibold text-white/60 group-hover:text-white transition-colors">{s.label}</span>
                                                <div className="flex gap-1">
                                                    {s.key.split('+').map(k => {
                                                        const cleanKey = k
                                                            .replace('Key', '')
                                                            .replace('Digit', '')
                                                            .replace('Arrow', '');
                                                        return (
                                                            <kbd key={k} className="px-2 py-1 rounded-lg bg-zinc-800 border-b-2 border-zinc-950 text-[10px] font-black text-white min-w-[24px] text-center shadow-lg uppercase">
                                                                {s.action === 'show_help' ? '?' : cleanKey}
                                                            </kbd>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer Tips */}
                    <div className="px-8 py-4 bg-white/5 border-t border-white/10 flex items-center justify-center gap-6">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            <Command size={12} />
                            <span>Remappable in Settings</span>
                        </div>
                        <div className="w-1 h-1 rounded-full bg-white/10" />
                        <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                            Press / to search music
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
