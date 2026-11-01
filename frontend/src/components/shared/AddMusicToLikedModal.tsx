"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Music2, Loader2, X } from "lucide-react";
import { SwiftUIHeart } from "@/components/ui/SwiftUIIcons";
import { useDebounce } from "use-debounce";
import api from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/store/ui";
import { cn, getMediaUrl, formatDisplayTitle, formatArtists } from "@/lib/utils";

interface AddMusicToLikedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AddMusicToLikedModal({ open, onOpenChange }: AddMusicToLikedModalProps) {
  const queryClient = useQueryClient();
  const showToast = useUIStore((s) => s.showToast);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [tracks, setTracks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [togglingTrackId, setTogglingTrackId] = useState<string | null>(null);

  // Get currently liked track IDs
  const { data: likedTrackIds = [] } = useQuery<string[]>({
    queryKey: ["liked-track-ids"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr.map((t: any) => t.id);
    },
    enabled: open,
  });

  // Fetch songs based on debounced search query
  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    const fetchTracks = async () => {
      setIsLoading(true);
      try {
        const q = debouncedQuery.trim();
        const params: any = { limit: 40 };
        if (q) params.search = q;
        const res = await api.get("/tracks", { params });
        const items = res.data?.items || res.data || [];
        if (isMounted) {
          setTracks(Array.isArray(items) ? items : []);
        }
      } catch (err) {
        console.error("Failed to fetch tracks", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchTracks();
    return () => {
      isMounted = false;
    };
  }, [open, debouncedQuery]);

  const toggleLikeMutation = useMutation({
    mutationFn: async (trackId: string) => {
      setTogglingTrackId(trackId);
      const res = await api.post(`/tracks/${trackId}/like`);
      return res.data;
    },
    onMutate: async (trackId: string) => {
      await queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });
      const prev = queryClient.getQueryData<string[]>(["liked-track-ids"]) || [];
      const isAlreadyLiked = prev.includes(trackId);
      const next = isAlreadyLiked ? prev.filter((id) => id !== trackId) : [...prev, trackId];
      queryClient.setQueryData(["liked-track-ids"], next);
      return { prev, isAlreadyLiked };
    },
    onError: (err, trackId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["liked-track-ids"], ctx.prev);
      showToast("Failed to update liked state", "error");
    },
    onSuccess: (data, trackId, ctx) => {
      showToast(ctx?.isAlreadyLiked ? "Removed from Liked Songs" : "Added to Liked Songs", "success");
    },
    onSettled: () => {
      setTogglingTrackId(null);
      queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });
      queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
      queryClient.invalidateQueries({ queryKey: ["my-albums"] });
      queryClient.invalidateQueries({ queryKey: ["library-overview"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,560px)] max-h-[85vh] bg-[#121214] border border-white/10 text-white rounded-3xl p-0 overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-white/5">
          <DialogHeader className="mb-4 text-left">
            <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Music2 className="w-5 h-5 text-brand shrink-0" />
              <span>Add Music to Liked Collection</span>
            </DialogTitle>
            <p className="text-xs text-white/50">
              Search any track from the library to save into your favorites.
            </p>
          </DialogHeader>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by song title, artist, or album..."
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-1.5 custom-scrollbar min-h-[260px] max-h-[400px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs font-bold uppercase tracking-wider">Searching library...</span>
            </div>
          ) : tracks.length > 0 ? (
            tracks.map((track) => {
              const isLiked = likedTrackIds.includes(track.id);
              const isToggling = togglingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-white/[0.04] transition-all group border border-transparent hover:border-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={getMediaUrl(track.coverUrl || track.album?.coverUrl) || "/logo.png"}
                      alt=""
                      className="w-11 h-11 rounded-xl object-cover bg-zinc-900 border border-white/5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold truncate leading-tight", isLiked ? "text-brand" : "text-white")}>
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

                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => toggleLikeMutation.mutate(track.id)}
                      className={cn(
                        "flex items-center justify-center size-8 rounded-full border transition-all cursor-pointer",
                        isLiked
                          ? "bg-brand/20 border-brand/40 text-brand hover:bg-brand/30"
                          : "bg-white/[0.08] border-white/10 text-white/60 hover:bg-white/[0.15] hover:text-white"
                      )}
                      title={isLiked ? "Remove from Liked" : "Add to Liked"}
                    >
                      <SwiftUIHeart size={15} filled={isLiked} className={isLiked ? "text-brand" : "text-white/60"} />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-zinc-500">
              <Music2 className="w-8 h-8 opacity-40" />
              <p className="text-sm">No songs found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

