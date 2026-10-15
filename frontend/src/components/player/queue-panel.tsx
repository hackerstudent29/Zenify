"use client";

import { usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  GripVertical,
  Trash2,
  ListMusic,
  Play,
  Trash,
  Search,
  Plus,
  Disc3
} from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle, formatArtists } from "@/lib/utils";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "use-debounce";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useIsMobile } from "@/hooks/useIsMobile";
import { UniversalMediaCover } from "@/components/shared/UniversalMediaCover";

export function QueuePanel() {
  const router = useRouter();
  const isGlassmorphism = true;
  const { isQueueOpen, setIsQueueOpen } = useUIStore();
  const {
    currentTrack,
    userQueue,
    contextQueue,
    contextName,
    addToUserQueue,
    removeFromUserQueue,
    reorderUserQueue,
    clearUserQueue,
    removeFromContextQueue,
    setTrack
  } = usePlayerStore();

  const isMobile = useIsMobile();
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

  const onUserQueueDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderUserQueue(result.source.index, result.destination.index);
  };

  if (!isQueueOpen) return null;

  const totalTracksCount = (currentTrack ? 1 : 0) + (userQueue?.length || 0) + (contextQueue?.length || 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1200] pointer-events-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsQueueOpen(false)}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
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
              ? "bg-[#121214]/95 backdrop-blur-2xl border border-white/10 ring-1 ring-white/5"
              : "bg-[#121214] border-white/5",
            isMobile
              ? "bottom-0 left-0 right-0 h-[82vh] rounded-t-[36px] border-t"
              : "top-0 right-0 bottom-0 w-[420px] border-l"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-8 pt-6 pb-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <ListMusic className="text-brand" size={20} />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Queue</h2>
            </div>
            <div className="flex items-center gap-2">
              {(userQueue && userQueue.length > 0) && (
                <button
                  onClick={() => clearUserQueue()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-red-400 transition-all cursor-pointer active:scale-95"
                >
                  <Trash size={12} />
                  Clear Queue
                </button>
              )}
              <button
                onClick={() => setIsQueueOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer active:scale-95"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="px-4 sm:px-8 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
              <input
                type="text"
                placeholder="Search to add songs to queue..."
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
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-12 scrollbar-hide space-y-6">
            {searchQuery ? (
              <div className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3 px-1">
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
                      addToUserQueue(track);
                      setSearchQuery("");
                    }}
                    className="group flex items-center gap-3 p-2 rounded-xl transition-all border border-transparent hover:bg-white/[0.04] hover:border-white/5 cursor-pointer"
                  >
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/5 shadow-md">
                      <img
                        src={getMediaUrl(track.coverUrl) || "/logo.png"}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-sans text-[12.5px] font-semibold text-white/90 truncate group-hover:text-white transition-colors leading-snug">
                        {formatDisplayTitle(track.title)}
                      </h4>
                      <p className="text-[10.5px] text-white/40 font-medium truncate mt-0.5">{formatArtists(track)}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToUserQueue(track);
                        setSearchQuery("");
                      }}
                      className="p-2 rounded-lg bg-white/5 text-brand hover:bg-brand/20 transition-all flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
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
                {/* 1. NOW PLAYING */}
                {currentTrack && (
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand mb-2 flex items-center gap-2 px-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                      Now Playing
                    </h3>
                    <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/[0.04] border border-white/10 shadow-lg group relative overflow-hidden transition-all duration-300 hover:border-brand/30 hover:bg-white/[0.06]">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-2xl border border-white/5 shrink-0">
                        <UniversalMediaCover track={currentTrack} className="w-full h-full object-cover" />
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
                            router.push(`/track/${currentTrack.id}`);
                            setIsQueueOpen(false);
                          }}
                          className="font-sans text-sm font-bold text-white truncate hover:text-brand hover:underline cursor-pointer transition-colors leading-snug tracking-tight"
                        >
                          {formatDisplayTitle(currentTrack.title)}
                        </h4>
                        <p className="text-[11px] text-white/45 font-medium truncate mt-0.5">{formatArtists(currentTrack)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. USER QUEUE (Items added manually by user) */}
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 flex items-center gap-2">
                      User Queue
                      {userQueue && userQueue.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-brand/20 text-brand text-[9px] font-bold">
                          {userQueue.length}
                        </span>
                      )}
                    </h3>
                    {userQueue && userQueue.length > 0 && (
                      <button
                        onClick={() => clearUserQueue()}
                        className="text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash size={11} /> Clear
                      </button>
                    )}
                  </div>

                  {(!userQueue || userQueue.length === 0) ? (
                    <div className="px-3 py-3 rounded-xl bg-white/[0.02] border border-white/5 text-white/30 text-[11px] font-medium text-center">
                      No songs in your queue. Add songs from any three-dot menu!
                    </div>
                  ) : (
                    <DragDropContext onDragEnd={onUserQueueDragEnd}>
                      <Droppable droppableId="user-queue">
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1">
                            {userQueue.map((item, index) => (
                              <Draggable key={item.queueId} draggableId={item.queueId} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    onClick={() => {
                                      // Start playing from this user queue item
                                      usePlayerStore.getState().playNext(true);
                                    }}
                                    className={cn(
                                      "group flex items-center gap-3 p-2 rounded-xl transition-all border border-transparent select-none cursor-pointer",
                                      snapshot.isDragging
                                        ? "bg-zinc-900 border-brand/50 shadow-2xl scale-[1.02] z-50"
                                        : "hover:bg-white/[0.04] hover:border-white/5 bg-white/[0.02]"
                                    )}
                                  >
                                    {/* Drag Handle */}
                                    <div
                                      {...provided.dragHandleProps}
                                      onClick={(e) => e.stopPropagation()}
                                      className="p-1 text-white/20 group-hover:text-brand cursor-grab active:cursor-grabbing rounded hover:bg-white/5"
                                      title="Drag to reorder"
                                    >
                                      <GripVertical size={16} />
                                    </div>

                                    <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/5 shadow-md">
                                      <UniversalMediaCover track={item.track} className="w-full h-full object-cover" />
                                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Play size={14} fill="white" className="text-white ml-0.5" />
                                      </div>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-sans text-[12.5px] font-semibold text-white/90 truncate group-hover:text-white transition-colors leading-snug">
                                        {formatDisplayTitle(item.track.title)}
                                      </h4>
                                      <p className="text-[10.5px] text-white/40 font-medium truncate mt-0.5">{formatArtists(item.track)}</p>
                                    </div>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeFromUserQueue(item.queueId);
                                      }}
                                      className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all cursor-pointer active:scale-95 shrink-0"
                                      title="Remove from queue"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  )}
                </div>

                {/* 3. NEXT FROM [ALBUM / PLAYLIST] */}
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-2 px-1 flex items-center gap-1.5 truncate">
                    <Disc3 size={13} className="text-brand shrink-0" />
                    <span className="truncate">Next from {contextName || "Playing Context"}</span>
                  </h3>

                  {(!contextQueue || contextQueue.length === 0) ? (
                    <div className="px-3 py-3 rounded-xl bg-white/[0.02] border border-white/5 text-white/30 text-[11px] font-medium text-center">
                      End of context tracks.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {contextQueue.slice(0, 30).map((track, idx) => (
                        <div
                          key={`${track.id}-${idx}`}
                          onClick={() => setTrack(track, [track, ...contextQueue.slice(idx + 1)], contextName)}
                          className="group flex items-center gap-3 p-2 rounded-xl transition-all border border-transparent hover:bg-white/[0.04] hover:border-white/5 cursor-pointer"
                        >
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/5 shadow-md">
                            <UniversalMediaCover track={track} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Play size={14} fill="white" className="text-white ml-0.5" />
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-sans text-[12.5px] font-semibold text-white/90 truncate group-hover:text-white transition-colors leading-snug">
                              {formatDisplayTitle(track.title)}
                            </h4>
                            <p className="text-[10.5px] text-white/40 font-medium truncate mt-0.5">{formatArtists(track)}</p>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromContextQueue(track.id);
                            }}
                            className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer active:scale-95 shrink-0"
                            title="Remove from context"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {contextQueue.length > 30 && (
                        <p className="text-[10px] text-white/30 text-center py-2">
                          + {contextQueue.length - 30} more tracks in context
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer Status */}
          {!isMobile && (
            <div className="p-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                {totalTracksCount} {totalTracksCount === 1 ? "Track" : "Tracks"} queued
              </span>
              <span className="text-[10px] font-bold text-brand uppercase tracking-wider">ZENIFY FLOW</span>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
