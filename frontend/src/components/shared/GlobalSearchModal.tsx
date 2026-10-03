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

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounce(query, 400);
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
      const timer = requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(timer);
    } else {
      setQuery("");
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
    queryKey: ['spotify-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      try {
        const res = await api.get(`/utils/search-spotify?q=${encodeURIComponent(debouncedQuery)}`);
        
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

        // Map Spotify track items to the format the UI expects
        return items.map((item: any) => {
          const track = item.data || item;
          const coverArts = track.albumOfTrack?.coverArt?.sources || track.album?.coverArt?.sources || [];
          const bestCover = coverArts.length > 0 ? (coverArts.find((s: any) => s.width === 640)?.url || coverArts[coverArts.length - 1]?.url || coverArts[0]?.url) : (track.coverUrl || track.artworkUrl100 || "https://via.placeholder.com/150");
          const artistName = track.artists?.items?.[0]?.profile?.name || track.artists?.[0]?.name || track.artistName || "Unknown Artist";
          
          return {
            trackId: track.id || track.spotifyId || track.trackId,
            trackName: track.name || track.title || track.trackName,
            artistName,
            collectionName: track.albumOfTrack?.name || track.album?.name || track.collectionName || "Single",
            artworkUrl100: bestCover,
            trackTimeMillis: track.duration?.totalMilliseconds || track.duration_ms || (track.duration ? track.duration * 1000 : 180000),
            primaryGenreName: "Zenify",
            releaseDate: new Date().toISOString(),
            audioUrl: track.audioUrl || `spotify:${track.id}`
          };
        }).filter(t => t.trackName && t.trackId);
      } catch (err) {
        console.error("Failed to search Spotify:", err);
        return [];
      }
    },
    enabled: !!debouncedQuery && isOpen
  });

  const handlePlayInstant = async (item: any) => {
    setImportingId(item.trackId.toString());
    const loadingToast = toast.loading(`Resolving audio for ${item.trackName}...`);
    
    try {
      // Clean up high quality cover
      const coverUrl = (item.artworkUrl100 || "").replace("100x100bb", "1000x1000bb");
      
      let finalAudioUrl = item.audioUrl;
      
      // If it's a Spotify track, try fetching the direct S3 download link first
      if (finalAudioUrl?.startsWith('spotify:')) {
        const spotifyId = finalAudioUrl.split(':')[1];
        try {
          const dlRes = await api.get(`/utils/download-spotify?id=${spotifyId}`);
          if (dlRes.data?.downloadLink) {
            finalAudioUrl = dlRes.data.downloadLink;
          }
        } catch (e: any) {
          console.warn("[GlobalSearchModal] Pre-fetch download link failed, relying on backend fallback:", e?.message);
        }
      }

      const payload = {
        title: item.trackName,
        artistName: item.artistName,
        albumTitle: item.collectionName,
        coverUrl,
        duration: Math.floor(item.trackTimeMillis / 1000),
        genre: item.primaryGenreName,
        releaseDate: item.releaseDate,
        audioUrl: finalAudioUrl // This is now a direct high-speed S3 MP3 link!
      };
      
      const res = await api.post('/tracks/import-instant', payload);
      const newTrack = res.data;
      
      // Add to queue immediately
      setQueue([newTrack, ...queue]);
      setTrack(newTrack, [newTrack, ...queue]);
      
      toast.success("Playing now!", { id: loadingToast });
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to play track.", { id: loadingToast });
    } finally {
      setImportingId(null);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-3 sm:pt-[12vh] px-3 sm:px-4">
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
            className="relative w-full max-w-2xl bg-zinc-900/95 border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85dvh] sm:max-h-[70vh] z-10 backdrop-blur-2xl"
          >
            {/* Search Input Area */}
            <div className="flex items-center px-4 py-3.5 sm:py-4 border-b border-white/10 bg-zinc-900/90 gap-3 shrink-0">
              <Search className="w-5 h-5 text-brand shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any song to play instantly..."
                className="flex-1 bg-transparent border-none outline-none text-base sm:text-lg text-white placeholder-zinc-500 font-medium"
              />
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all outline-none shrink-0 cursor-pointer"
                title="Close Search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
              {!query && (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-500">
                  <Music className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm font-sans font-medium">Search the global Apple Music database.</p>
                </div>
              )}
              
              {isLoading && query && (
                <div className="py-12 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-brand animate-spin" />
                </div>
              )}

              {searchResults && searchResults.length > 0 && (
                <div className="flex flex-col gap-1">
                  {searchResults.map((item: any) => {
                    const isImporting = importingId === item.trackId.toString();
                    return (
                      <div 
                        key={item.trackId}
                        onClick={() => !isImporting && handlePlayInstant(item)}
                        className={`flex items-center gap-4 p-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/5 border border-white/5 shadow-md">
                          <img src={item.artworkUrl100} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            {isImporting ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Play className="w-5 h-5 text-white fill-white ml-0.5" />}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-sans font-bold text-white truncate group-hover:text-brand transition-colors">
                            {item.trackName}
                          </div>
                          <div className="text-[12px] text-zinc-400 truncate mt-0.5 font-medium">
                            {item.artistName} {item.collectionName ? `• ${item.collectionName}` : ''}
                          </div>
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
