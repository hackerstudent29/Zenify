"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Music, Check, ListMusic, Loader2 } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn, getMediaUrl, formatDisplayTitle, formatArtists, getTrackCover } from "@/lib/utils";

export function AddTrackToPlaylistModal() {
  const { addToPlaylistTrack, closeAddToPlaylistModal, showToast } = useUIStore();
  const queryClient = useQueryClient();
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [addingToId, setAddingToId] = useState<string | null>(null);

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ["playlists"],
    queryFn: async () => {
      const res = await api.get("playlists");
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!addToPlaylistTrack,
  });

  if (!addToPlaylistTrack) return null;

  const handleAddTrack = async (playlistId: string, playlistName: string) => {
    if (addingToId) return;
    setAddingToId(playlistId);

    try {
      let trackId = addToPlaylistTrack.id;
      // If virtual external track, import instant first so foreign key holds
      if (
        addToPlaylistTrack.isVirtual ||
        trackId.startsWith("itunes-") ||
        trackId.startsWith("saavn-") ||
        trackId.startsWith("sp-") ||
        trackId.startsWith("yt-")
      ) {
        const importRes = await api.post("/tracks/import-instant", {
          id: addToPlaylistTrack.id,
          title: addToPlaylistTrack.title,
          artistName: addToPlaylistTrack.artist?.name || addToPlaylistTrack.artistName || "",
          albumTitle: addToPlaylistTrack.album?.title || "",
          duration: addToPlaylistTrack.duration,
          coverUrl: addToPlaylistTrack.coverUrl,
        });
        if (importRes.data?.id) {
          trackId = importRes.data.id;
        }
      }

      await api.post(`playlists/${playlistId}/tracks`, { trackId });

      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      showToast(`Added to "${playlistName}"!`, "success");
      closeAddToPlaylistModal();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      if (err.response?.status === 409 || msg?.includes("already in")) {
        showToast(`Already in "${playlistName}"`, "info");
      } else {
        showToast(msg || "Failed to add to playlist", "error");
      }
    } finally {
      setAddingToId(null);
    }
  };

  const handleCreateAndAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    try {
      const createRes = await api.post("playlists", { name: trimmed });
      const newPlaylist = createRes.data;

      if (newPlaylist?.id) {
        await handleAddTrack(newPlaylist.id, newPlaylist.name || trimmed);
      }
      setNewPlaylistName("");
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to create playlist", "error");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeAddToPlaylistModal}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="relative w-full max-w-md bg-[#121214] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col font-martian"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-2 text-white">
              <ListMusic size={18} className="text-brand" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Add to Playlist</h2>
            </div>
            <button
              onClick={closeAddToPlaylistModal}
              className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Target Track Preview */}
          <div className="flex items-center gap-3 px-6 py-3 bg-white/[0.02] border-b border-white/5">
            <img
              src={getTrackCover(addToPlaylistTrack)}
              alt="Cover"
              className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">
                {formatDisplayTitle(addToPlaylistTrack.title)}
              </p>
              <p className="text-[11px] text-white/50 truncate mt-0.5">
                {formatArtists(addToPlaylistTrack)}
              </p>
            </div>
          </div>

          {/* Create New Playlist Form */}
          <form onSubmit={handleCreateAndAdd} className="px-6 py-4 border-b border-white/5 flex gap-2">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Create new playlist..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-brand/60 transition-colors"
            />
            <button
              type="submit"
              disabled={!newPlaylistName.trim() || isCreating}
              className="h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-brand text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              <span>Create</span>
            </button>
          </form>

          {/* Playlist List */}
          <div className="max-h-[280px] overflow-y-auto p-3 space-y-1">
            {isLoading ? (
              <div className="py-8 flex items-center justify-center text-white/40 gap-2 text-xs">
                <Loader2 size={16} className="animate-spin text-brand" />
                <span>Loading playlists...</span>
              </div>
            ) : playlists.length === 0 ? (
              <div className="py-8 text-center px-4">
                <p className="text-xs text-white/50 mb-1">No playlists yet</p>
                <p className="text-[10px] text-white/30">Type a name above to create your first playlist!</p>
              </div>
            ) : (
              playlists.map((pl: any) => {
                const isAdding = addingToId === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleAddTrack(pl.id, pl.name)}
                    disabled={isAdding}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {pl.coverUrl ? (
                        <img
                          src={getMediaUrl(pl.coverUrl)}
                          alt={pl.name}
                          className="w-9 h-9 rounded-lg object-cover shrink-0 border border-white/10"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white/40 group-hover:text-brand transition-colors">
                          <Music size={14} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white group-hover:text-brand transition-colors truncate">
                          {pl.name}
                        </p>
                        <p className="text-[10px] text-white/40 mt-0.5">
                          {pl._count?.tracks ?? pl.tracks?.length ?? 0} tracks
                        </p>
                      </div>
                    </div>

                    <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:bg-brand/20 group-hover:text-brand transition-colors">
                      {isAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={14} />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
