"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Play, Music, Command } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounce(query, 500);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const setTrack = usePlayerStore(state => state.setTrack);
  const queue = usePlayerStore(state => state.queue);
  const setQueue = usePlayerStore(state => state.setQueue);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
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
        
        // Map Spotify track items to the iTunes format that the UI currently expects
        return (res.data || []).map((item: any) => {
          const track = item.data || item;
          const coverArts = track.albumOfTrack?.coverArt?.sources || [];
          const bestCover = coverArts.length > 0 ? coverArts[0].url : "https://via.placeholder.com/150";
          
          return {
            trackId: track.id,
            trackName: track.name,
            artistName: track.artists?.items?.[0]?.profile?.name || "Unknown Artist",
            collectionName: track.albumOfTrack?.name || "Unknown Album",
            artworkUrl100: bestCover,
            trackTimeMillis: track.duration?.totalMilliseconds || 180000,
            primaryGenreName: "Spotify",
            releaseDate: new Date().toISOString(),
            audioUrl: `spotify:${track.id}` // Placeholder to indicate this is a Spotify track
          };
        });
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
      
      // If it's a Spotify track, fetch the direct S3 download link first!
      if (finalAudioUrl?.startsWith('spotify:')) {
        const spotifyId = finalAudioUrl.split(':')[1];
        const dlRes = await api.get(`/utils/download-spotify?id=${spotifyId}`);
        if (dlRes.data?.downloadLink) {
          finalAudioUrl = dlRes.data.downloadLink;
        } else {
          throw new Error("Failed to get download link from Spotify");
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Modal */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-2xl bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col mx-4 max-h-[70vh]"
          >
            {/* Search Input Area */}
            <div className="flex items-center px-4 py-4 border-b border-white/10 bg-[#1c1c1e]">
              <Search className="w-5 h-5 text-zinc-400 mr-3" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any song to play instantly..."
                className="flex-1 bg-transparent border-none outline-none text-lg text-white placeholder-zinc-500 font-medium"
              />
              <div className="hidden md:flex items-center gap-1 bg-white/5 px-2 py-1 rounded-md border border-white/5 text-zinc-500 text-[10px] font-bold tracking-widest uppercase">
                <Command className="w-3 h-3" /> K
              </div>
            </div>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
              {!query && (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-500">
                  <Music className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm">Search the global Apple Music database.</p>
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
                        className={`flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group ${isImporting ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/5">
                          <img src={item.artworkUrl100} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            {isImporting ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Play className="w-5 h-5 text-white fill-white ml-0.5" />}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-bold text-white truncate group-hover:text-brand transition-colors">
                            {item.trackName}
                          </div>
                          <div className="text-[12px] text-zinc-400 truncate mt-0.5">
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
    </AnimatePresence>
  );
}
