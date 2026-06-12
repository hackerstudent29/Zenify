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
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useDebounce } from "use-debounce";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Search, Plus } from "lucide-react";

export function QueuePanel() {
 const router = useRouter();
 const { user } = useAuthStore();
 const isGlassmorphism = user?.preferences?.globalPlayerStyle === "glassmorphism";
 const { isQueueOpen, setIsQueueOpen } = useUIStore();
 const {
 queue,
 currentTrack,
 setTrack,
 removeFromQueue,
 reorderQueue,
 clearQueue,
 addToQueue
 } = usePlayerStore();

 const [isMobile, setIsMobile] = useState(false);
 const [searchQuery, setSearchQuery] = useState("");
 const [debouncedQuery] = useDebounce(searchQuery, 400);

 const { data: searchResults, isLoading: isSearchLoading } = useQuery({
 queryKey: ["queue-search", debouncedQuery],
 queryFn: async () => {
 if (!debouncedQuery) return null;
 const res = await api.get("search", { params: { q: debouncedQuery, limit: 15 } });
 return res.data;
 },
 enabled: !!debouncedQuery,
 });

 useEffect(() => {
 const checkMobile = () => setIsMobile(window.innerWidth < 768);
 checkMobile();
 window.addEventListener('resize', checkMobile);
 return () => window.removeEventListener('resize', checkMobile);
 }, []);

 const onDragEnd = (result: DropResult) => {
 if (!result.destination) return;
 const actualSource = result.source.index + currentIndex + 1;
 const actualDestination = result.destination.index + currentIndex + 1;
 reorderQueue(actualSource, actualDestination);
 };

 const currentIndex = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1;
 const nowPlaying = currentTrack;
 const nextUp = currentIndex !== -1 ? queue.slice(currentIndex + 1) : queue;

 if (!isQueueOpen) return null;

 return (
 <AnimatePresence>
 <div className="fixed inset-0 z-[1200] pointer-events-none">
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
 "absolute pointer-events-auto flex flex-col shadow-2xl",
 isGlassmorphism
 ? "bg-white/5 backdrop-blur-xl border border-white/10 ring-1 ring-white/5"
 : "bg-[#0a0a0c] border-white/5",
 isMobile
 ? "bottom-0 left-0 right-0 h-[80vh] rounded-t-[40px] border-t"
 : "top-0 right-0 bottom-0 w-[400px] border-l"
 )}
 >
 {/* Header */}
 <div className="flex items-center justify-between px-4 sm:px-8 pt-6 sm:pt-8 pb-4">
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

 {/* Search Input */}
 <div className="px-4 sm:px-8 pb-4">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
 <input
 type="text"
 placeholder="Search to add songs..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-10 text-sm text-white placeholder:text-white/40 focus:border-brand/50 focus:bg-white/10 outline-none transition-all"
 />
 {searchQuery && (
 <button
 onClick={() => setSearchQuery("")}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
 >
 <X size={14} />
 </button>
 )}
 </div>
 </div>

 {/* Scrollable Content */}
 <div className="flex-1 overflow-y-auto px-4 pb-12 scrollbar-hide">
 {searchQuery ? (
 <div className="px-2 space-y-2">
 <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-3 px-1">
 Search Results
 </h3>
 {isSearchLoading && (
 <div className="flex items-center justify-center py-10">
 <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
 </div>
 )}
 {!isSearchLoading && searchResults?.tracks?.length === 0 && (
 <div className="text-center py-10 text-white/30 text-xs font-medium">
 No tracks found for "{searchQuery}"
 </div>
 )}
 {!isSearchLoading && searchResults?.tracks?.map((track: any) => (
 <div
 key={track.id}
 onClick={() => {
 addToQueue(track);
 setSearchQuery("");
 }}
 className="group flex items-center gap-3 p-2 rounded-xl transition-all duration-300 border border-transparent hover:bg-white/[0.03] hover:border-white/5 cursor-pointer"
 >
 <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/5 shadow-md">
 <img
 src={getMediaUrl(track.coverUrl) || "/logo.png"}
 className="w-full h-full object-cover"
 alt=""
 />
 </div>
 <div className="flex-1 min-w-0">
 <h4 className="font-sans text-[12.5px] font-semibold text-white/90 truncate group-hover:text-white transition-colors leading-snug tracking-tight">
 {track.title}
 </h4>
 <p className="text-[10.5px] text-white/30 font-medium truncate mt-0.5">{track.artist?.name || 'Unknown Artist'}</p>
 </div>
 <button
 onClick={(e) => {
 e.stopPropagation();
 addToQueue(track);
 setSearchQuery("");
 }}
 className={cn(
 "rounded-lg bg-white/5 text-brand/60 hover:text-brand hover:bg-zinc-900 hover:shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.5)] transition-all flex items-center gap-1 shrink-0",
 isMobile ? "p-3" : "p-2"
 )}
 title="Add to queue"
 >
 <Plus size={14} />
 <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:block">Add</span>
 </button>
 </div>
 ))}
 </div>
 ) : (
 <>
 {/* Now Playing Section */}
 {nowPlaying && (
 <div className="mb-8 px-2">
 <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-brand/80 mb-3 flex items-center gap-2">
 <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
 Now Playing
 </h3>
 <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/[0.04] border border-white/10 shadow-[0_12px_24px_rgba(0,0,0,0.5)] group relative overflow-hidden transition-all duration-300 hover:border-brand/30 hover:bg-white/[0.06]">
 {/* Background Glow */}
 <div className="absolute inset-0 bg-brand/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

 <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-2xl border border-white/5 shrink-0">
 <img
 src={getMediaUrl(nowPlaying.coverUrl) || "/logo.png"}
 className="w-full h-full object-cover"
 alt=""
 />
 <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
 <div className="flex gap-0.5 items-end h-3">
 <motion.div animate={{ height: [4, 12, 6, 10, 4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-0.5 bg-brand" />
 <motion.div animate={{ height: [10, 4, 12, 6, 10] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-0.5 bg-brand" />
 <motion.div animate={{ height: [6, 10, 4, 12, 6] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-0.5 bg-brand" />
 </div>
 </div>
 </div>
 <div className="flex-1 min-w-0 pr-2">
 <h4 
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/track/${nowPlaying.id}`);
 setIsQueueOpen(false);
 }}
 className="font-sans text-sm font-bold text-white truncate hover:text-brand hover:underline cursor-pointer transition-colors leading-snug tracking-tight"
 >
 {nowPlaying.title}
 </h4>
 <p className="text-[11px] text-white/45 font-medium truncate mt-0.5">{nowPlaying.artist?.name || 'Unknown Artist'}</p>
 </div>
 </div>
 </div>
 )}

 {/* Next Up Section with DND */}
 <div className="px-2">
 <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-3 px-1">Next Up</h3>

 <DragDropContext onDragEnd={onDragEnd}>
 <Droppable droppableId="queue">
 {(provided) => (
 <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1">
 {nextUp.map((track, index) => {
 return (
 <Draggable key={track.id + "-" + index} draggableId={track.id + "-" + index} index={index}>
 {(provided, snapshot) => (
 <div
 ref={provided.innerRef}
 {...provided.draggableProps}
 onClick={() => setTrack(track, queue)}
 className={cn(
 "group flex items-center gap-3 p-2 rounded-xl transition-all duration-300 border border-transparent select-none cursor-pointer",
 snapshot.isDragging
 ? "bg-zinc-900 border-white/10 shadow-2xl scale-[1.02] z-50"
 : "hover:bg-white/[0.03] hover:border-white/5"
 )}
 >
 {/* Drag Handle */}
 <div 
 {...provided.dragHandleProps} 
 onClick={(e) => e.stopPropagation()}
 className={cn(
 "transition-colors cursor-grab active:cursor-grabbing rounded hover:bg-white/5 flex items-center justify-center",
 isMobile 
 ? "p-2.5 text-white/40 active:text-brand" 
 : "p-1 text-white/10 group-hover:text-brand/40 hover:text-brand"
 )}
 title="Drag to reorder"
 >
 <GripVertical size={16} />
 </div>

 <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/5 shadow-md">
 <img
 src={getMediaUrl(track.coverUrl) || "/logo.png"}
 className="w-full h-full object-cover"
 alt=""
 />
 {!isMobile && (
 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
 <Play size={14} fill="white" className="text-white ml-0.5" />
 </div>
 )}
 </div>

 <div className="flex-1 min-w-0">
 <h4 
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/track/${track.id}`);
 setIsQueueOpen(false);
 }}
 className="font-sans text-[12.5px] font-semibold text-white/90 truncate hover:text-brand cursor-pointer transition-colors leading-snug tracking-tight"
 >
 {track.title}
 </h4>
 <p className="text-[10.5px] text-white/30 font-medium truncate mt-0.5">{track.artist?.name || 'Unknown Artist'}</p>
 </div>

 {/* Simple Controls */}
 <div 
 onClick={(e) => e.stopPropagation()}
 className={cn(
 "flex items-center gap-1 transition-all duration-200",
 isMobile 
 ? "opacity-100" 
 : "opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0"
 )}
 >
 <button
 onClick={() => removeFromQueue(track.id)}
 className={cn(
 "rounded-lg transition-all",
 isMobile 
 ? "p-2.5 text-white/40 active:text-red-500" 
 : "p-1.5 text-white/20 hover:text-red-500 hover:bg-red-500/10"
 )}
 title="Remove from queue"
 >
 <Trash2 size={14} />
 </button>
 <button 
 className={cn(
 "rounded-lg transition-all",
 isMobile ? "p-2.5 text-white/40" : "p-1.5 text-white/20 hover:text-white hover:bg-white/10"
 )}
 >
 <MoreVertical size={14} />
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
 <div className="flex flex-col items-center justify-center py-20 text-center px-4 sm:px-8">
 <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-6">
 <ListMusic size={32} className="text-white/10" />
 </div>
 <h4 className="text-sm font-black uppercase tracking-widest text-white/20">Empty Queue</h4>
 <p className="text-[11px] font-medium text-white/10 mt-2 max-w-[200px]">Your queue is as quiet as a library. Use the search bar above to add some fusion!</p>
 </div>
 )}
 </div>
 </>
 )}
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
