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
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowUpToLine,
  ArrowDownToLine,
  Disc3,
  Shuffle,
  Repeat
} from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle, formatArtists, formatDuration } from "@/lib/utils";
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
    isShuffled,
    repeatMode,
    toggleShuffle,
    toggleRepeat,
    addToUserQueue,
    removeFromUserQueue,
    playUserQueueItem,
    reorderUserQueue,
    reorderContextQueue,
    moveUserQueueItem,
    moveContextQueueItem,
    moveUserQueueToTop,
    moveUserQueueToBottom,
    moveContextQueueToTop,
    moveContextQueueToBottom,
    promoteContextTrackToNext,
    clearUserQueue,
    removeFromContextQueue,
    setTrack
  } = usePlayerStore();

  const isMobile = useIsMobile();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 400);

  // Drag and drop state
  const [draggedUserQueueIdx, setDraggedUserQueueIdx] = useState<number | null>(null);
  const [dragOverUserQueueIdx, setDragOverUserQueueIdx] = useState<number | null>(null);
  const [draggedContextQueueIdx, setDraggedContextQueueIdx] = useState<number | null>(null);
  const [dragOverContextQueueIdx, setDragOverContextQueueIdx] = useState<number | null>(null);

  const { data: searchResults, isLoading: isSearchLoading } = useQuery({
    queryKey: ["queue-search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return null;
      const res = await api.get("search", { params: { q: debouncedQuery, limit: 50 } });
      return res.data;
    },
    enabled: !!debouncedQuery,
  });

  const searchTracks = (() => {
    if (!debouncedQuery) return [];
    const list: any[] = [];
    if (searchResults?.topResult?.type === 'track' && searchResults.topResult.item) {
      list.push(searchResults.topResult.item);
    }
    if (Array.isArray(searchResults?.tracks)) {
      list.push(...searchResults.tracks);
    }
    if (Array.isArray(searchResults?.otherVersions)) {
      list.push(...searchResults.otherVersions);
    }
    const seen = new Set<string>();
    const unique: any[] = [];
    for (const t of list) {
      if (t && t.id && !seen.has(t.id)) {
        seen.add(t.id);
        unique.push(t);
      }
    }
    return unique;
  })();


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
            {/* Header (Apple Music 'Up next' style with essential minimal controls) */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.08] shrink-0">
              <div className="flex items-baseline gap-2 min-w-0">
                <h2 className="text-[19px] font-bold text-white tracking-tight">Up next</h2>
                {totalTracksCount > 0 && (
                  <span className="text-[11px] font-medium text-white/40 tabular-nums">
                    {totalTracksCount} {totalTracksCount === 1 ? 'song' : 'songs'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Minimal Shuffle Toggle */}
                <button
                  onClick={toggleShuffle}
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95",
                    isShuffled
                      ? "bg-brand/20 text-brand border border-brand/40 shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  title={isShuffled ? "Shuffle is ON" : "Shuffle is OFF"}
                  aria-label="Toggle Shuffle"
                >
                  <Shuffle size={13} />
                </button>

                {/* Minimal Repeat Toggle */}
                <button
                  onClick={toggleRepeat}
                  className={cn(
                    "relative w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95",
                    repeatMode !== "off"
                      ? "bg-brand/20 text-brand border border-brand/40 shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  title={`Repeat: ${repeatMode.toUpperCase()}`}
                  aria-label="Toggle Repeat"
                >
                  <Repeat size={13} />
                  {repeatMode === "one" && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-brand text-white text-[8px] font-black rounded-full flex items-center justify-center shadow-xs">
                      1
                    </span>
                  )}
                </button>

                {/* Search Toggle Button */}
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95",
                    showSearch ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                  title="Search & add songs"
                  aria-label="Search"
                >
                  <Search size={13} />
                </button>

                {/* Red 'Clear' action */}
                {userQueue && userQueue.length > 0 && (
                  <button
                    onClick={() => clearUserQueue()}
                    className="text-[#ff3b30] hover:text-[#ff453a] text-[13px] font-semibold transition-colors cursor-pointer active:scale-95 px-1 py-0.5 rounded hover:bg-white/5"
                    title="Clear queue"
                  >
                    Clear
                  </button>
                )}

                {/* Minimal Close Button */}
                <button
                  onClick={() => setIsQueueOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer active:scale-95 ml-0.5"
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
                <div className="flex items-center justify-between mb-2 px-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Search Results
                  </h3>
                  {!isSearchLoading && searchTracks.length > 0 && (
                    <span className="text-[11px] font-medium text-white/40 tabular-nums">
                      {searchTracks.length} {searchTracks.length === 1 ? 'track' : 'tracks'}
                    </span>
                  )}
                </div>
                {isSearchLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!isSearchLoading && searchTracks.length === 0 && (
                  <div className="text-center py-8 text-white/40 text-xs">
                    No tracks found for "{searchQuery}"
                  </div>
                )}
                {!isSearchLoading &&
                  searchTracks.map((track: any) => (
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

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTrack(track);
                            setSearchQuery("");
                            setShowSearch(false);
                          }}
                          className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                          title="Play now"
                        >
                          <Play size={13} fill="currentColor" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToUserQueue(track);
                            setSearchQuery("");
                            setShowSearch(false);
                          }}
                          className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                          title="Add to queue"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
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

                {/* 2. USER QUEUE (Items added by user) */}
                {userQueue && userQueue.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 pt-1 pb-1 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                        Playing Next ({userQueue.length})
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      {userQueue.map((item, index) => {
                        const isDragging = draggedUserQueueIdx === index;
                        const isOver = dragOverUserQueueIdx === index && draggedUserQueueIdx !== index;

                        return (
                          <div
                            key={item.queueId}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", index.toString());
                              e.dataTransfer.effectAllowed = "move";
                              setDraggedUserQueueIdx(index);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverUserQueueIdx !== index) {
                                setDragOverUserQueueIdx(index);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverUserQueueIdx === index) {
                                setDragOverUserQueueIdx(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const src = draggedUserQueueIdx !== null ? draggedUserQueueIdx : parseInt(e.dataTransfer.getData("text/plain"), 10);
                              if (!isNaN(src) && src !== index) {
                                reorderUserQueue(src, index);
                              }
                              setDraggedUserQueueIdx(null);
                              setDragOverUserQueueIdx(null);
                            }}
                            onDragEnd={() => {
                              setDraggedUserQueueIdx(null);
                              setDragOverUserQueueIdx(null);
                            }}
                            onClick={() => playUserQueueItem(item.queueId)}
                            className={cn(
                              "group relative flex items-center justify-between px-2.5 py-2 rounded-xl transition-all select-none cursor-pointer border border-transparent",
                              isDragging && "opacity-30 scale-[0.98] bg-white/[0.02] border-brand/40",
                              isOver && "border-t-2 !border-t-brand bg-brand/10 shadow-lg",
                              !isDragging && !isOver && "hover:bg-white/[0.06] border-b-white/[0.02]"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-1 flex-1">
                              {/* Apple Music Style: Red circular minus button to remove */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFromUserQueue(item.queueId);
                                }}
                                className="w-5 h-5 rounded-full bg-[#ff3b30] hover:bg-[#ff453a] flex items-center justify-center text-white shrink-0 shadow-sm transition-transform active:scale-90 cursor-pointer"
                                title="Delete from queue"
                                aria-label="Delete from queue"
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

                            {/* Right Side: Duration & Fast Move Controls & Delete & Drag Handle */}
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={cn(
                                "text-[12px] text-white/45 tabular-nums font-medium",
                                isMobile ? "hidden" : "group-hover:hidden"
                              )}>
                                {formatTime(item.track.duration)}
                              </span>

                              {/* Action controls toolbar */}
                              <div className={cn(
                                "items-center gap-0.5",
                                isMobile ? "flex" : "hidden group-hover:flex"
                              )}>
                                {/* Move to first / Play next */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveUserQueueToTop(index);
                                  }}
                                  disabled={index === 0}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-brand rounded hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Move to first / Play next"
                                  aria-label="Move to top"
                                >
                                  <ArrowUpToLine size={13} />
                                </button>

                                {/* Move Up 1 */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveUserQueueItem(index, 'up');
                                  }}
                                  disabled={index === 0}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Move up one position"
                                  aria-label="Move up"
                                >
                                  <ChevronUp size={14} />
                                </button>

                                {/* Move Down 1 */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveUserQueueItem(index, 'down');
                                  }}
                                  disabled={index === userQueue.length - 1}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Move down one position"
                                  aria-label="Move down"
                                >
                                  <ChevronDown size={14} />
                                </button>

                                {/* Move to last / Play at end */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveUserQueueToBottom(index);
                                  }}
                                  disabled={index === userQueue.length - 1}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-brand rounded hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Move to last"
                                  aria-label="Move to bottom"
                                >
                                  <ArrowDownToLine size={13} />
                                </button>

                                {/* Delete button: clear trash icon */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromUserQueue(item.queueId);
                                  }}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
                                  title="Delete from queue"
                                  aria-label="Delete from queue"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              {/* Drag Handle */}
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 text-white/30 group-hover:text-white/70 cursor-grab active:cursor-grabbing rounded hover:bg-white/10 transition-colors"
                                title="Drag to move anywhere"
                              >
                                <GripVertical size={14} />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Drop zone to move to last position */}
                      {draggedUserQueueIdx !== null && (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDragOverUserQueueIdx(userQueue.length);
                          }}
                          onDragLeave={() => {
                            if (dragOverUserQueueIdx === userQueue.length) {
                              setDragOverUserQueueIdx(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const src = draggedUserQueueIdx !== null ? draggedUserQueueIdx : parseInt(e.dataTransfer.getData("text/plain"), 10);
                            if (!isNaN(src) && src !== userQueue.length - 1) {
                              reorderUserQueue(src, userQueue.length - 1);
                            }
                            setDraggedUserQueueIdx(null);
                            setDragOverUserQueueIdx(null);
                          }}
                          className={cn(
                            "h-7 border border-dashed rounded-lg flex items-center justify-center text-[11px] font-medium transition-all my-1 select-none",
                            dragOverUserQueueIdx === userQueue.length
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-white/10 text-white/30"
                          )}
                        >
                          Drop here to move to last position
                        </div>
                      )}
                    </div>
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
                      {contextQueue.slice(0, 40).map((track, idx) => {
                        const isDragging = draggedContextQueueIdx === idx;
                        const isOver = dragOverContextQueueIdx === idx && draggedContextQueueIdx !== idx;

                        return (
                          <div
                            key={`${track.id}-${idx}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", idx.toString());
                              e.dataTransfer.effectAllowed = "move";
                              setDraggedContextQueueIdx(idx);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverContextQueueIdx !== idx) {
                                setDragOverContextQueueIdx(idx);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverContextQueueIdx === idx) {
                                setDragOverContextQueueIdx(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const src = draggedContextQueueIdx !== null ? draggedContextQueueIdx : parseInt(e.dataTransfer.getData("text/plain"), 10);
                              if (!isNaN(src) && src !== idx) {
                                reorderContextQueue(src, idx);
                              }
                              setDraggedContextQueueIdx(null);
                              setDragOverContextQueueIdx(null);
                            }}
                            onDragEnd={() => {
                              setDraggedContextQueueIdx(null);
                              setDragOverContextQueueIdx(null);
                            }}
                            onClick={() => setTrack(track, [track, ...contextQueue.slice(idx + 1)], contextName)}
                            className={cn(
                              "group relative flex items-center justify-between px-2.5 py-2 rounded-xl transition-all cursor-pointer select-none border border-transparent",
                              isDragging && "opacity-30 scale-[0.98] bg-white/[0.02] border-brand/40",
                              isOver && "border-t-2 !border-t-brand bg-brand/10 shadow-lg",
                              !isDragging && !isOver && "hover:bg-white/[0.06] border-b-white/[0.02]"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-1 flex-1">
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

                            {/* Right Side: Duration & Fast Move & Delete Actions & Drag Handle */}
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={cn(
                                "text-[12px] text-white/45 tabular-nums font-medium",
                                isMobile ? "hidden" : "group-hover:hidden"
                              )}>
                                {formatTime(track.duration)}
                              </span>

                              {/* Fast Movement Toolbar */}
                              <div className={cn(
                                "items-center gap-0.5",
                                isMobile ? "flex" : "hidden group-hover:flex"
                              )}>
                                {/* Move to first / Play next */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveContextQueueToTop(idx);
                                  }}
                                  disabled={idx === 0}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-brand rounded hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Move to first / Play next"
                                  aria-label="Move to top"
                                >
                                  <ArrowUpToLine size={13} />
                                </button>

                                {/* Move Up 1 */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveContextQueueItem(idx, 'up');
                                  }}
                                  disabled={idx === 0}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Move up one position"
                                  aria-label="Move up"
                                >
                                  <ChevronUp size={14} />
                                </button>

                                {/* Move Down 1 */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveContextQueueItem(idx, 'down');
                                  }}
                                  disabled={idx === contextQueue.length - 1}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Move down one position"
                                  aria-label="Move down"
                                >
                                  <ChevronDown size={14} />
                                </button>

                                {/* Move to last */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveContextQueueToBottom(idx);
                                  }}
                                  disabled={idx === contextQueue.length - 1}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-brand rounded hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Move to last"
                                  aria-label="Move to bottom"
                                >
                                  <ArrowDownToLine size={13} />
                                </button>

                                {/* Delete button: Trash icon (replaces confusing three-dot button) */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromContextQueue(track.id);
                                  }}
                                  className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors cursor-pointer"
                                  title="Delete from queue"
                                  aria-label="Delete from queue"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              {/* Drag Handle */}
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 text-white/30 group-hover:text-white/70 cursor-grab active:cursor-grabbing rounded hover:bg-white/10 transition-colors"
                                title="Drag to move anywhere"
                              >
                                <GripVertical size={14} />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Drop zone to move context track to end */}
                      {draggedContextQueueIdx !== null && (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDragOverContextQueueIdx(contextQueue.length);
                          }}
                          onDragLeave={() => {
                            if (dragOverContextQueueIdx === contextQueue.length) {
                              setDragOverContextQueueIdx(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const src = draggedContextQueueIdx !== null ? draggedContextQueueIdx : parseInt(e.dataTransfer.getData("text/plain"), 10);
                            if (!isNaN(src) && src !== contextQueue.length - 1) {
                              reorderContextQueue(src, contextQueue.length - 1);
                            }
                            setDraggedContextQueueIdx(null);
                            setDragOverContextQueueIdx(null);
                          }}
                          className={cn(
                            "h-7 border border-dashed rounded-lg flex items-center justify-center text-[11px] font-medium transition-all my-1 select-none",
                            dragOverContextQueueIdx === contextQueue.length
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-white/10 text-white/30"
                          )}
                        >
                          Drop here to move to last position
                        </div>
                      )}

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
