"use client";

import { Construction, ArrowLeft, Library, Search, Plus, Filter, Heart, Clock, User, Disc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useState } from "react";

const categories = [
    { id: 'playlists', label: 'Playlists', icon: Library },
    { id: 'artists', label: 'Artists', icon: User },
    { id: 'albums', label: 'Albums', icon: Disc },
];

export default function LibraryPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('playlists');

    return (
        <div className="min-h-screen bg-background pb-32">
            {/* Header Area */}
            <div className="sticky top-0 z-50 glass border-b border-white/5 px-4 py-4 md:px-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
                            <Library size={20} className="text-black" />
                        </div>
                        <h1 className="text-2xl font-black text-white tracking-tight">Library</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="btn-icon bg-white/5 text-white/60 hover:text-white">
                            <Search size={18} />
                        </button>
                        <button className="btn-icon bg-white/5 text-white/60 hover:text-white">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveTab(cat.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all",
                                activeTab === cat.id
                                    ? "bg-foreground text-background"
                                    : "bg-white/5 text-muted hover:text-white"
                            )}
                        >
                            <cat.icon size={14} />
                            {cat.label}
                        </button>
                    ))}
                    <div className="w-px h-6 bg-white/10 mx-1" />
                    <button className="btn-icon h-8 w-8 bg-white/5 text-muted">
                        <Filter size={14} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="px-4 py-8 md:px-8">
                <div className="flex flex-col items-center justify-center py-20 gap-8 text-center border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
                        className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center"
                    >
                        <Construction className="text-violet-500 w-10 h-10" />
                    </motion.div>

                    <div className="space-y-3">
                        <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Expanding Archive</h2>
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-[11px] text-white/40 max-w-xs leading-relaxed uppercase tracking-[0.2em] font-bold">
                                Your personal collection is being synchronized with the central core.
                            </p>
                            <div className="h-1 w-24 bg-zinc-800 rounded-full overflow-hidden mt-4">
                                <motion.div
                                    animate={{ x: [-100, 100] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                    className="h-full w-full bg-accent"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center gap-3 opacity-40">
                            <Heart size={20} className="text-muted" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Loved</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center gap-3 opacity-40">
                            <Clock size={20} className="text-muted" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">History</span>
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        onClick={() => router.push('/')}
                        className="text-xs font-black uppercase tracking-[0.2em] text-accent hover:text-white"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Abort Synchronization
                    </Button>
                </div>
            </div>
        </div>
    );
}
