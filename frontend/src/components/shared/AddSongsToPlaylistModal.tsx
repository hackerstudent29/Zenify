"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Check, Music2, Loader2, X } from "lucide-react";
import { useDebounce } from "use-debounce";
import api from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/ui";
import { cn, getMediaUrl, formatDisplayTitle, formatArtists } from "@/lib/utils";

interface AddSongsToPlaylistModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  playlistId: string;
  playlistName: string;
  existingTrackIds?: string[];
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AddSongsToPlaylistModal({
  isOpen,
  open,
  onClose,
  onOpenChange,
  playlistId,
  playlistName,
  existingTrackIds = [],
}: AddSongsToPlaylistModalProps) {
  const isModalOpen = Boolean(open ?? isOpen);
  const handleClose = () => {
    if (onClose) onClose();
    if (onOpenChange) onOpenChange(false);
  };

  const queryClient = useQueryClient();
  const showToast = useUIStore((s) => s.showToast);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 350);
  const [tracks, setTracks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set(existingTrackIds));
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);

  // Sync existing track IDs and fetch if not provided
  useEffect(() => {
    if (existingTrackIds && existingTrackIds.length > 0) {
      setAddedIds(new Set(existingTrackIds));
    } else if (isModalOpen && playlistId) {
      api.get(`/playlists/${playlistId}`)
        .then((res) => {
          const pTracks = res.data?.tracks?.map((t: any) => t.trackId || t.track?.id || t.id) || [];
          setAddedIds(new Set(pTracks.filter(Boolean)));
        })
        .catch(() => {});
    }
  }, [existingTrackIds, isModalOpen, playlistId]);

  // Load / Search tracks from the database
  useEffect(() => {
    if (!isModalOpen) return;

    let isMounted = true;
    const fetchTracks = async () => {
      setIsLoading(true);
      try {
        const params: any = { limit: 50 };
        if (debouncedQuery?.trim()) {
          params.search = debouncedQuery.trim();
        }
        const res = await api.get("/tracks", { params });
        const items = res.data?.items || res.data || [];
        if (isMounted) {
          setTracks(Array.isArray(items) ? items : []);
        }
      } catch (err) {
        console.error("Failed to fetch database tracks", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchTracks();
    return () => {
      isMounted = false;
    };
  }, [isModalOpen, debouncedQuery]);

  const handleAddTrack = async (track: any) => {
    if (addedIds.has(track.id) || addingTrackId === track.id) return;

    setAddingTrackId(track.id);
    try {
      await api.post(`/playlists/${playlistId}/tracks`, { trackId: track.id });
      setAddedIds((prev) => new Set([...prev, track.id]));
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      queryClient.invalidateQueries({ queryKey: ["my-playlists"] });
      showToast(`Added "${track.title}" to playlist`, "success");
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Failed to add song", "error");
    } finally {
      setAddingTrackId(null);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="w-[min(94vw,560px)] max-h-[85vh] bg-[#121214] border border-white/10 text-white rounded-3xl p-0 overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-white/5">
          <DialogHeader className="mb-4 text-left">
            <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Music2 className="w-5 h-5 text-brand shrink-0" />
              <span>Add Songs to Playlist</span>
            </DialogTitle>
            <p className="text-xs text-white/50 truncate">
              {formatDisplayTitle(playlistName)}
            </p>
          </DialogHeader>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library songs by title or artist..."
              className="w-full h-11 bg-black/40 border border-white/10 rounded-2xl pl-10 pr-10 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40 transition-all font-sans"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Track List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-1.5 custom-scrollbar min-h-[260px] max-h-[380px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs font-bold uppercase tracking-wider">Searching library...</span>
            </div>
          ) : tracks.length > 0 ? (
            tracks.map((track) => {
              const isAdded = addedIds.has(track.id);
              const isAdding = addingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-white/[0.04] transition-all group border border-transparent hover:border-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={getMediaUrl(track.coverUrl || track.album?.coverUrl)}
                      alt=""
                      className="w-11 h-11 rounded-xl object-cover bg-zinc-900 border border-white/5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate leading-tight">
                        {formatDisplayTitle(track.title)}
                      </p>
                      <p className="text-xs text-white/50 truncate mt-0.5">
                        {formatArtists(track)}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Duration */}
                  <div className="flex items-center gap-3 shrink-0">
                    {track.duration && (
                      <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
                        {formatDuration(track.duration)}
                      </span>
                    )}

                    {isAdded ? (
                      <span className="h-9 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                        <Check size={12} strokeWidth={2.5} />
                        <span>Added</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddTrack(track)}
                        disabled={isAdding}
                        className="h-9 px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md"
                      >
                        {isAdding ? (
                          <Loader2 size={12} className="animate-spin text-brand" />
                        ) : (
                          <Plus size={12} strokeWidth={2.5} />
                        )}
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-500 gap-2">
              <Music2 className="w-10 h-10 opacity-30 text-zinc-600" />
              <p className="text-xs font-semibold">No library tracks found matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-500 gap-2">
              <Music2 className="w-10 h-10 opacity-30 text-brand" />
              <p className="text-xs font-semibold">No tracks available in database</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 bg-black/40 border-t border-white/5 flex items-center justify-between">
          <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">
            {addedIds.size} song{addedIds.size !== 1 ? "s" : ""} in playlist
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="h-9 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
