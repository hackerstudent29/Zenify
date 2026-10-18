"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Play, Music, Command, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePlayerStore } from "@/store/player";
import { toast } from "sonner";
import api from "@/lib/api";
import { useDebounce } from "use-debounce";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '3:00';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounce(query, 220);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const setTrack = usePlayerStore(state => state.setTrack);
  const queue = usePlayerStore(state => state.queue);
  const setQueue = usePlayerStore(state => state.setQueue);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      const timer = requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(timer);
    } else {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Global Keyboard Shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['global-universal-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      try {
        const res = await api.get(`/utils/search-spotify?q=${encodeURIComponent(debouncedQuery)}&limit=30`);
        
        const rawData = res.data;
        let items: any[] = [];
        if (Array.isArray(rawData)) {
          items = rawData;
        } else if (Array.isArray(rawData?.tracks)) {
          items = rawData.tracks;
        } else if (Array.isArray(rawData?.tracks?.items)) {
          items = rawData.tracks.items;
        } else if (Array.isArray(rawData?.results)) {
          items = rawData.results;
        }

        // Map universal track items
        return items.map((item: any) => {
          const track = item.data || item;
          const coverArts = track.albumOfTrack?.coverArt?.sources || track.album?.coverArt?.sources || [];
          const bestCover = coverArts.length > 0 ? (coverArts.find((s: any) => s.width === 640)?.url || coverArts[coverArts.length - 1]?.url || coverArts[0]?.url) : (track.coverUrl || track.artworkUrl100 || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300");
          const artistName = track.artists?.items?.[0]?.profile?.name || track.artists?.[0]?.name || track.artistName || "Unknown Artist";
          const durMs = track.duration?.totalMilliseconds || track.duration_ms || track.trackTimeMillis || (track.duration ? track.duration * 1000 : 180000);
          
          return {
            trackId: (track.id || track.spotifyId || track.trackId || `${track.name}-${artistName}`).toString(),
            trackName: track.name || track.title || track.trackName,
            artistName,
            collectionName: track.albumOfTrack?.name || track.album?.name || track.collectionName || "Single",
            artworkUrl100: bestCover,
            trackTimeMillis: durMs,
            primaryGenreName: track.genre || "Universal",
            releaseDate: track.releaseDate || new Date().toISOString(),
            audioUrl: track.audioUrl || track.preview_url || track.previewUrl,
            previewUrl: track.preview_url || track.previewUrl,
            isZenify: !!(track.isZenify || track.isImported),
            source: track.source || 'universal'
          };
        }).filter(t => t.trackName && t.trackId);
      } catch (err) {
        console.error("Failed to search universal catalog:", err);
        return [];
      }
    },
    enabled: !!debouncedQuery && isOpen,
    staleTime: 1000 * 60 * 5
  });

  const handlePlayInstant = async (item: any) => {
    const trackKey = (item.trackId || item.id || item.trackName || "").toString();
    setImportingId(trackKey);
    const loadingToast = toast.loading(`Preparing "${item.trackName || item.title}"...`);
    
    try {
      const coverUrl = (item.artworkUrl100 || "").replace("100x100bb", "1000x1000bb");
      
      const payload = {
        title: item.trackName || item.title,
        artistName: item.artistName || item.artist?.name || 'Unknown Artist',
        albumTitle: item.collectionName || item.album?.title || item.album,
        coverUrl,
        duration: Math.floor(((item.trackTimeMillis || item.duration || 180000)) / 1000),
        genre: item.primaryGenreName || item.genre || "Zenify",
        releaseDate: item.releaseDate,
        audioUrl: (item.audioUrl && !item.audioUrl.includes('audio-ssl') && !item.audioUrl.includes('mzstatic') && !item.audioUrl.includes('apple.com')) ? item.audioUrl : undefined
      };
      
      const res = await api.post('/tracks/import-instant', payload);
      const newTrack = res.data;
      
      // Add to queue immediately & start playing instantly
      setQueue([newTrack, ...queue]);
      setTrack(newTrack, [newTrack, ...queue]);
      
      toast.success("Playing now!", { id: loadingToast });
      onClose();
    } catch (err) {
      console.error("[GlobalSearchModal] Failed to play track:", err);
      toast.error("Failed to play track.", { id: loadingToast });
    } finally {
      setImportingId(null);
    }
  };

  // Keyboard navigation within results
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchResults || searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = searchResults[selectedIndex] || searchResults[0];
      if (selected && !importingId) {
        handlePlayInstant(selected);
      }
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-3 sm:pt-[10vh] px-3 sm:px-4">
          {/* Backdrop with true full-screen backdrop blur */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-2xl"
            style={{ WebkitBackdropFilter: "blur(20px)" }}
          />
          
          {/* Modal Container with GPU Compositing */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }}
            style={{ transform: "translateZ(0)", backfaceVisibility: "hidden", willChange: "transform, opacity" }}
            className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85dvh] sm:max-h-[75vh] z-10"
          >
            {/* Search Input Area */}
            <div className="flex items-center px-4 py-3.5 sm:py-4 border-b border-white/10 bg-zinc-900/90 gap-3 shrink-0">
              <Search className="w-5 h-5 text-brand shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search any song, artist, movie or album..."
                className="flex-1 bg-transparent border-none outline-none text-base sm:text-lg text-white placeholder-zinc-500 font-medium"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-zinc-500 hover:text-zinc-300 text-xs font-semibold px-2 py-1 rounded bg-white/5 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all outline-none shrink-0 cursor-pointer"
                title="Close Search (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
              {!query && (
                <div className="py-14 flex flex-col items-center justify-center text-zinc-500 text-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-brand">
                    <Music className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">Universal Music Catalog</h3>
                  <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                    Search millions of songs, artists, and sound recordings across all languages, regions, and genres.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                    {["Peaches", "Katchi Sera", "Starboy", "Tauba Tauba", "Arijit Singh", "Anirudh"].map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setQuery(tag)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white transition-all cursor-pointer"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {isLoading && query && (
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-brand animate-spin" />
                  <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">Searching Universal Music Archives...</p>
                </div>
              )}

              {!isLoading && query && searchResults && searchResults.length === 0 && (
                <div className="py-14 flex flex-col items-center justify-center text-zinc-500 text-center px-6">
                  <Search className="w-8 h-8 text-zinc-600 mb-3" />
                  <p className="text-sm font-bold text-white mb-1">No songs found matching "{query}"</p>
                  <p className="text-xs text-zinc-500">Try searching with artist name or movie title for better matches.</p>
                </div>
              )}

              {searchResults && searchResults.length > 0 && (
                <div className="flex flex-col gap-1">
                  {searchResults.map((item: any, idx: number) => {
                    const isImporting = importingId === item.trackId.toString();
                    const isSelected = selectedIndex === idx;

                    return (
                      <div 
                        key={item.trackId || idx}
                        onClick={() => !isImporting && handlePlayInstant(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center gap-3.5 p-2.5 rounded-xl cursor-pointer transition-all group ${
                          isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                        } ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/5 border border-white/5 shadow-md">
                          <img 
                            src={item.artworkUrl100} alt={item.trackName || "Track artwork"} width={48} height={48} loading="lazy" decoding="async" 
                            className="w-full h-full object-cover" 
                            onError={(e: any) => { e.currentTarget.src = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300"; }}
                          />
                          <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}>
                            {isImporting ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Play className="w-5 h-5 text-white fill-white ml-0.5" />}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[14px] font-sans font-bold text-white truncate group-hover:text-brand transition-colors">
                              {item.trackName}
                            </span>
                            {item.isZenify ? (
                              <span 
                                title="Zenify Verified Master"
                                className="inline-flex items-center justify-center px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider rounded bg-brand/20 text-brand border border-brand/30 shrink-0"
                              >
                                Zenify
                              </span>
                            ) : item.source === 'jiosaavn' ? (
                              <span 
                                title="320kbps High Definition Audio"
                                className="inline-flex items-center justify-center px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0"
                              >
                                320k
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[12px] text-zinc-400 truncate mt-0.5 font-medium flex items-center gap-1.5">
                            <span className="truncate">{item.artistName}</span>
                            {item.collectionName && item.collectionName !== 'Single' && (
                              <>
                                <span className="opacity-40">•</span>
                                <span className="text-zinc-500 truncate">{item.collectionName}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-[11px] font-mono text-zinc-500 shrink-0 pr-2">
                          {formatDuration(item.trackTimeMillis)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
