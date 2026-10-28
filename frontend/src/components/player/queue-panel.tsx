"use client";

import { usePlayerStore, Track } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  GripVertical,
  Minus,
  Play,
  Search,
  Plus,
  MoreHorizontal,
  Disc3
} from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle, formatArtists, formatDuration } from "@/lib/utils";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "use-debounce";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useIsMobile } from "@/hooks/useIsMobile";
import { UniversalMediaCover } from "@/components/shared/UniversalMediaCover";
import { ArtistLinks } from "@/components/shared/ArtistLinks";

const formatTime = (duration?: number | null) => {
  if (!duration || isNaN(duration) || duration <= 0) return "--:--";
  const seconds = duration > 10000 ? Math.round(duration / 1000) : Math.round(duration);
  return formatDuration(seconds);
};

export function QueuePanel() {
  const router = useRouter();
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
  const [showSearch, setShowSearch] = useState(false);
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

  const totalTracksCount = (currentTrack ? 1 : 0) + (userQueue?.length || 0) + (contextQueue?.length || 0);

  return (
    <AnimatePresence>
      {isQueueOpen && (
        <div key="queue" className="fixed inset-0 z-[1200] pointer-events-none">
          {/* Backdrop: mobile only */}
          {isMobile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsQueueOpen(false)}
              className="absolute inset-0 pointer-events-auto bg-black/50 backdrop-blur-sm"
            />
          )}

          {/* Panel (Apple Music Frosted Glass Drawer - 320px) */}
          <motion.div
            initial={isMobile ? { y: "100%" } : { x: 320 }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: "100%" } : { x: 320 }}
            transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.85 }}
            style={{ width: isMobile ? undefined : 320, backgroundColor: "var(--side)" }}
            className={cn(
              "absolute pointer-events-auto flex flex-col overflow-hidden z-[140] am-glass will-change-transform",
              isMobile
                ? "bottom-0 left-0 right-0 h-[84vh] rounded-t-[28px] shadow-[0_-20px_60px_rgba(0,0,0,0.4)]"
                : "top-0 right-0 bottom-0 am-glass-right shadow-[-20px_0_60px_rgba(0,0,0,0.35)]"
            )}
          >
            {/* Header (Apple Music 'Up next' style with Red 'Clear' button) */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.08] shrink-0">
              <h2 className="text-[20px] font-bold text-white tracking-tight">Up next</h2>

              <div className="flex items-center gap-3">
                {/* Optional Search Toggle Button */}
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className={cn(
                    "am-glass-chip w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95",
                    showSearch ? "bg-white/20 text-white" : "text-white/70 hover:text-white"
                  )}
                  title="Search and add songs"
                  aria-label="Search"
                >
                  <Search size={13} />
                </button>

                {/* Red 'Clear' action as seen in Apple Music screenshot */}
                {userQueue && userQueue.length > 0 && (
                  <button
                    onClick={() => clearUserQueue()}
                    className="text-[#ff3b30] hover:text-[#ff453a] text-[15px] font-semibold transition-colors cursor-pointer active:scale-95 px-1"
                  >
                    Clear
                  </button>
                )}

                {/* Apple-style floating minimal close button */}
                <button
                  onClick={() => setIsQueueOpen(false)}
                  className="am-glass-chip w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer active:scale-95"
                  title="Close Queue"
                  aria-label="Close Queue"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

          {/* Collapsible Search Input */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-white/[0.08] px-4 py-2.5 bg-black/20 shrink-0"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={14} />
                  <input
                    type="text"
                    placeholder="Search songs to add..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 pl-9 pr-8 text-xs text-white placeholder:text-white/40 focus:border-brand/50 focus:bg-white/10 outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scrollable Content (Apple Music List UI) */}
          <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-hide space-y-4 pb-[var(--player-height,80px)]">
            {/* Search Results Mode */}
            {searchQuery ? (
              <div className="space-y-1 px-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2 px-2">
                  Search Results
                </h3>
                {isSearchLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!isSearchLoading && searchResults?.tracks?.length === 0 && (
                  <div className="text-center py-8 text-white/40 text-xs">
                    No tracks found for "{searchQuery}"
                  </div>
                )}
                {!isSearchLoading &&
                  searchResults?.tracks?.map((track: any) => (
                    <div
                      key={track.id}
                      onClick={() => {
                        addToUserQueue(track);
                        setSearchQuery("");
                        setShowSearch(false);
                      }}
                      className="group flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 shadow-md border border-white/5">
                          <img
                            src={getMediaUrl(track.coverUrl) || "/logo.png"}
                            className="w-full h-full object-cover"
                            alt={track.title || "Track artwork"}
                            width={44}
                            height={44}
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-[13.5px] font-semibold text-white truncate leading-snug">
                            {formatDisplayTitle(track.title)}
                          </h4>
                          <div className="mt-0.5 truncate">
                            <ArtistLinks
                              track={track}
                              maxArtists={2}
                              className="text-[12px] text-white/50 truncate font-normal"
                              onClick={() => setIsQueueOpen(false)}
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToUserQueue(track);
                          setSearchQuery("");
                          setShowSearch(false);
                        }}
                        className="p-2 text-white/40 group-hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Add to queue"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <>
                {/* 1. NOW PLAYING (Apple Music clean banner style) */}
                {currentTrack && (
                  <div className="mb-3 px-1">
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 shadow-sm relative overflow-hidden group">
                      <div className="relative w-11 h-11 rounded-lg overflow-hidden shadow-md shrink-0 border border-white/5">
                        <UniversalMediaCover track={currentTrack} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="flex gap-0.5 items-end h-3">
                            <motion.div
                              animate={{ height: [4, 12, 6, 10, 4] }}
                              transition={{ repeat: Infinity, duration: 1 }}
                              className="w-0.5 bg-brand"
                            />
                            <motion.div
                              animate={{ height: [10, 4, 12, 6, 10] }}
                              transition={{ repeat: Infinity, duration: 1.2 }}
                              className="w-0.5 bg-brand"
                            />
                            <motion.div
                              animate={{ height: [6, 10, 4, 12, 6] }}
                              transition={{ repeat: Infinity, duration: 0.8 }}
                              className="w-0.5 bg-brand"
                            />
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
                          className="text-[13.5px] font-semibold text-white truncate hover:underline cursor-pointer leading-snug"
                        >
                          {formatDisplayTitle(currentTrack.title)}
                        </h4>
                        <div className="mt-0.5 truncate">
                          <ArtistLinks
                            track={currentTrack}
                            maxArtists={2}
                            className="text-[12px] text-white/50 truncate font-normal"
                            onClick={() => setIsQueueOpen(false)}
                          />
                        </div>
                      </div>

                      <span className="text-[12px] text-white/45 tabular-nums font-medium shrink-0">
                        {formatTime(currentTrack.duration)}
                      </span>
                    </div>
                  </div>
                )}

                {/* 2. USER QUEUE (Items added by user, with Apple-style red minus delete button) */}
                {userQueue && userQueue.length > 0 && (
                  <div>
                    <DragDropContext onDragEnd={onUserQueueDragEnd}>
                      <Droppable droppableId="user-queue">
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-0.5">
                            {userQueue.map((item, index) => (
                              <Draggable key={item.queueId} draggableId={item.queueId} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    onClick={() => usePlayerStore.getState().playNext(true)}
                                    className={cn(
                                      "group relative flex items-center justify-between px-2.5 py-2 rounded-xl transition-all select-none cursor-pointer border-b border-white/[0.02]",
                                      snapshot.isDragging
                                        ? "bg-zinc-900 border-white/20 shadow-2xl scale-[1.02] z-50"
                                        : "hover:bg-white/[0.06]"
                                    )}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 pr-2 flex-1">
                                      {/* Apple Music Style: Red circular minus button to remove */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeFromUserQueue(item.queueId);
                                        }}
                                        className="w-5 h-5 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] flex items-center justify-center text-white shrink-0 shadow-sm transition-transform active:scale-90 cursor-pointer"
                                        title="Remove from queue"
                                        aria-label="Remove"
                                      >
                                        <Minus size={11} strokeWidth={3} />
                                      </button>

                                      {/* Artwork */}
                                      <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 shadow-md border border-white/5">
                                        <UniversalMediaCover track={item.track} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <Play size={13} fill="white" className="text-white ml-0.5" />
                                        </div>
                                      </div>

                                      {/* Track details */}
                                      <div className="min-w-0 flex-1">
                                        <h4 className="text-[13.5px] font-semibold text-white truncate leading-snug">
                                          {formatDisplayTitle(item.track.title)}
                                        </h4>
                                        <div className="mt-0.5 truncate">
                                          <ArtistLinks
                                            track={item.track}
                                            maxArtists={2}
                                            className="text-[12px] text-white/50 truncate font-normal"
                                            onClick={() => setIsQueueOpen(false)}
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Right Side: Duration & Drag Handle */}
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-[12px] text-white/45 tabular-nums font-medium">
                                        {formatTime(item.track.duration)}
                                      </span>

                                      {/* Drag Handle */}
                                      <div
                                        {...provided.dragHandleProps}
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 text-white/20 group-hover:text-white/60 cursor-grab active:cursor-grabbing rounded hover:bg-white/5"
                                        title="Reorder"
                                      >
                                        <GripVertical size={14} />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  </div>
                )}

                {/* 3. CONTEXT QUEUE (Upcoming songs from album/playlist - Apple Music clean list style) */}
                <div>
                  <div className="px-2 pt-2 pb-1">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1.5 truncate">
                      <Disc3 size={12} className="text-white/40 shrink-0" />
                      <span className="truncate">Next from {contextName || "Playing Context"}</span>
                    </h3>
                  </div>

                  {(!contextQueue || contextQueue.length === 0) ? (
                    (!userQueue || userQueue.length === 0) && (
                      <div className="py-12 px-4 text-center">
                        <p className="text-[13px] font-medium text-white/40">No upcoming songs</p>
                      </div>
                    )
                  ) : (
                    <div className="space-y-0.5">
                      {contextQueue.slice(0, 40).map((track, idx) => (
                        <div
                          key={`${track.id}-${idx}`}
                          onClick={() => setTrack(track, [track, ...contextQueue.slice(idx + 1)], contextName)}
                          className="group relative flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer select-none border-b border-white/[0.02]"
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2 flex-1">
                            {/* Artwork */}
                            <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 shadow-md border border-white/5">
                              <UniversalMediaCover track={track} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Play size={13} fill="white" className="text-white ml-0.5" />
                              </div>
                            </div>

                            {/* Track details */}
                            <div className="min-w-0 flex-1">
                              <h4 className="text-[13.5px] font-semibold text-white truncate leading-snug">
                                {formatDisplayTitle(track.title)}
                              </h4>
                              <div className="mt-0.5 truncate">
                                <ArtistLinks
                                  track={track}
                                  maxArtists={2}
                                  className="text-[12px] text-white/50 truncate font-normal"
                                  onClick={() => setIsQueueOpen(false)}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Right Side: Duration & Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[12px] text-white/45 tabular-nums font-medium group-hover:hidden">
                              {formatTime(track.duration)}
                            </span>

                            {/* More Options / Delete on hover */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromContextQueue(track.id);
                              }}
                              className="hidden group-hover:flex w-6 h-6 items-center justify-center text-white/40 hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                              title="Remove"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {contextQueue.length > 40 && (
                        <p className="text-[11px] text-white/30 text-center py-3">
                          + {contextQueue.length - 40} more tracks
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
}
