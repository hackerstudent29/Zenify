"use client";

import { usePlayerStore, Track } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    GripVertical,
    Trash2,
    ListMusic,
    Play,
    MoreVertical,
    ArrowUpToLine,
    Trash
} from "lucide-react";
import { getMediaUrl, cn } from "@/lib/utils";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useEffect, useState } from "react";

export function QueuePanel() {
    const { isQueueOpen, setIsQueueOpen } = useUIStore();
    const {
        queue,
        currentTrack,
        setTrack,
        removeFromQueue,
        reorderQueue,
        clearQueue
    } = usePlayerStore();

    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        reorderQueue(result.source.index, result.destination.index);
    };

    const currentIndex = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1;
    const nowPlaying = currentTrack;
    const nextUp = queue.slice(currentIndex + 1);

    if (!isQueueOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[1000] pointer-events-none">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsQueueOpen(false)}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
                />

                {/* Panel */}
                <motion.div
                    initial={isMobile ? { y: "100%" } : { x: "100%" }}
                    animate={isMobile ? { y: 0 } : { x: 0 }}
                    exit={isMobile ? { y: "100%" } : { x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className={cn(
                        "absolute bg-[#0a0a0c] border-white/5 pointer-events-auto flex flex-col shadow-2xl",
                        isMobile
                            ? "bottom-0 left-0 right-0 h-[80vh] rounded-t-[40px] border-t"
                            : "top-0 right-0 bottom-0 w-[400px] border-l"
                    )}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-8 pt-8 pb-4">
                        <div className="flex items-center gap-3">
                            <ListMusic className="text-brand" size={20} />
                            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Queue</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => clearQueue()}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                            >
                                <Trash size={12} />
                                Clear
                            </button>
                            <button
                                onClick={() => setIsQueueOpen(false)}
                                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto px-4 pb-12 scrollbar-hide">
                        {/* Now Playing Section */}
                        {nowPlaying && (
                            <div className="mb-10 px-4">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-brand mb-4 flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                                    Now Playing
                                </h3>
                                <div className="flex items-center gap-4 p-4 rounded-3xl bg-white/[0.03] border border-white/5 group relative overflow-hidden">
                                    {/* Background Glow */}
                                    <div className="absolute inset-0 bg-brand/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                                    <div className="relative w-14 h-14 rounded-2xl overflow-hidden shadow-2xl">
                                        <img
                                            src={getMediaUrl(nowPlaying.coverUrl) || "/logo.png"}
                                            className="w-full h-full object-cover"
                                            alt=""
                                        />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <div className="flex gap-0.5 items-end h-3">
                                                <motion.div animate={{ height: [4, 12, 6, 10, 4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-0.5 bg-brand" />
                                                <motion.div animate={{ height: [10, 4, 12, 6, 10] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-0.5 bg-brand" />
                                                <motion.div animate={{ height: [6, 10, 4, 12, 6] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-0.5 bg-brand" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0 pr-4">
                                        <h4 className="text-sm font-bold text-white truncate">{nowPlaying.title}</h4>
                                        <p className="text-xs text-white/40 font-medium truncate mt-0.5">{nowPlaying.artist.name}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Next Up Section with DND */}
                        <div className="px-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-4 px-2">Next Up</h3>

                            <DragDropContext onDragEnd={onDragEnd}>
                                <Droppable droppableId="queue">
                                    {(provided) => (
                                        <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1">
                                            {queue.map((track, index) => {
                                                if (index === currentIndex) return null;

                                                return (
                                                    <Draggable key={track.id + "-" + index} draggableId={track.id + "-" + index} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                className={cn(
                                                                    "group flex items-center gap-3 p-3 rounded-2xl transition-all duration-300 border border-transparent",
                                                                    snapshot.isDragging
                                                                        ? "bg-zinc-900 border-white/10 shadow-2xl scale-[1.02] z-50"
                                                                        : "hover:bg-white/[0.03] hover:border-white/5"
                                                                )}
                                                            >
                                                                {/* Drag Handle */}
                                                                <div {...provided.dragHandleProps} className="text-white/10 group-hover:text-white/30 transition-colors">
                                                                    <GripVertical size={18} />
                                                                </div>

                                                                <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0">
                                                                    <img
                                                                        src={getMediaUrl(track.coverUrl) || "/logo.png"}
                                                                        className="w-full h-full object-cover"
                                                                        alt=""
                                                                    />
                                                                    <button
                                                                        onClick={() => setTrack(track, queue)}
                                                                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                                                    >
                                                                        <Play size={16} fill="white" className="text-white ml-0.5" />
                                                                    </button>
                                                                </div>

                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="text-[13px] font-bold text-white/90 truncate group-hover:text-white">{track.title}</h4>
                                                                    <p className="text-[11px] text-white/30 font-medium truncate mt-0.5">{track.artist.name}</p>
                                                                </div>

                                                                {/* Simple Controls */}
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                                    <button
                                                                        onClick={() => removeFromQueue(track.id)}
                                                                        className="p-2 rounded-xl text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                    <button className="p-2 rounded-xl text-white/20 hover:text-white hover:bg-white/10 transition-all">
                                                                        <MoreVertical size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                );
                                            })}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>

                            {queue.length <= 1 && (
                                <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                                    <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-6">
                                        <ListMusic size={32} className="text-white/10" />
                                    </div>
                                    <h4 className="text-sm font-black uppercase tracking-widest text-white/20">Empty Queue</h4>
                                    <p className="text-[11px] font-medium text-white/10 mt-2 max-w-[200px]">Your queue is as quiet as a library. Add some fusion!</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Status */}
                    {!isMobile && (
                        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/20">
                                {queue.length} Tracks In Fusion
                            </span>
                            <span className="text-[9px] font-bold text-white/10">32-BIT FLOW QUEUE</span>
                        </div>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
