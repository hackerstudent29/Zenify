"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Image as ImageIcon, Music, Type, Check, Search, X, Loader2 } from "lucide-react";
import { cn, getMediaUrl } from "@/lib/utils";
import { useDebounce } from "use-debounce";

interface CreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePlaylistModal({ isOpen, onClose }: CreatePlaylistModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "image" | "tracks">("details");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebounce(searchQuery, 400);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }
    const searchTracks = async () => {
      setIsSearching(true);
      try {
        const res = await api.get('/search', { params: { q: debouncedQuery, limit: 10 } });
        setSearchResults(res.data?.tracks || []);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setIsSearching(false);
      }
    };
    searchTracks();
  }, [debouncedQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      const res = await api.post("/playlists", { 
        name, 
        description: description || undefined,
        coverUrl: coverUrl || undefined,
        isPublic: true 
      });
      
      const newPlaylistId = res.data.id;

      // Add selected tracks sequentially
      for (const track of selectedTracks) {
        await api.post(`/playlists/${newPlaylistId}/tracks`, { trackId: track.id });
      }

      queryClient.invalidateQueries({ queryKey: ['my-playlists'] });
      router.push(`/playlist/${newPlaylistId}`);
      onClose();
      
      // Reset
      setName("");
      setDescription("");
      setCoverUrl("");
      setSelectedTracks([]);
      setActiveTab("details");
      setSearchQuery("");
    } catch (error) {
      console.error("Failed to create playlist", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTrack = (track: any) => {
    if (selectedTracks.some(t => t.id === track.id)) {
      setSelectedTracks(selectedTracks.filter(t => t.id !== track.id));
    } else {
      setSelectedTracks([...selectedTracks, track]);
    }
  };

  const tabs = [
    { id: "details", icon: Type, label: "Details" },
    { id: "image", icon: ImageIcon, label: "Cover Art" },
    { id: "tracks", icon: Music, label: "Add Tracks" },
  ] as const;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] bg-[#111113] border border-white/10 text-foreground shadow-2xl rounded-3xl p-0 overflow-hidden">
        <div className="p-8 pb-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-bold tracking-tight text-white">New Playlist</DialogTitle>
          </DialogHeader>

          {/* Cute Tabs */}
          <div className="flex items-center gap-2 mb-8 bg-black/40 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all relative z-10",
                    isActive ? "text-white shadow-lg" : "text-white/40 hover:text-white/80 hover:bg-white/5"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="create-playlist-tab"
                      className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl -z-10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <Icon size={14} className={isActive ? "text-brand" : ""} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <form id="create-playlist-form" onSubmit={handleSubmit} className="relative min-h-[220px]">
            <AnimatePresence mode="wait">
              {activeTab === "details" && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Playlist Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-black/50 border border-white/10 text-white h-12 px-4 rounded-xl focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand transition-all text-lg font-medium"
                      placeholder="My Awesome Mix"
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc" className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Description <span className="text-zinc-700">(Optional)</span></Label>
                    <Input
                      id="desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="bg-black/50 border border-white/10 text-white h-12 px-4 rounded-xl focus-visible:border-brand transition-all"
                      placeholder="A collection of my favorite vibes..."
                      autoComplete="off"
                    />
                  </div>
                </motion.div>
              )}

              {activeTab === "image" && (
                <motion.div
                  key="image"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div className="flex gap-6 items-center">
                    <div className="w-32 h-32 shrink-0 rounded-2xl bg-black/80 border-2 border-dashed border-white/20 flex flex-col items-center justify-center overflow-hidden relative shadow-inner">
                      {coverUrl ? (
                        <img src={coverUrl} alt="Cover Preview" className="w-full h-full object-cover absolute inset-0" onError={(e) => (e.currentTarget.src = "")} />
                      ) : (
                        <>
                          <ImageIcon className="w-8 h-8 text-zinc-600 mb-2" />
                          <span className="text-[10px] text-zinc-500 font-bold tracking-wider uppercase">Preview</span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="coverUrl" className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Image URL</Label>
                      <Input
                        id="coverUrl"
                        value={coverUrl}
                        onChange={(e) => setCoverUrl(e.target.value)}
                        className="bg-black/50 border border-white/10 text-white h-12 px-4 rounded-xl focus-visible:border-brand transition-all"
                        placeholder="https://example.com/image.jpg"
                        autoComplete="off"
                      />
                      <p className="text-[10px] text-zinc-500 font-medium px-1 leading-relaxed">
                        Paste a direct image link (e.g. from Unsplash or Spotify). The image will be dynamically fetched and applied.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "tracks" && (
                <motion.div
                  key="tracks"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-black/50 border border-white/10 text-white h-12 pl-11 pr-4 rounded-xl focus-visible:border-brand transition-all"
                      placeholder="Search songs to add..."
                      autoComplete="off"
                    />
                  </div>

                  <div className="h-[200px] overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                    {isSearching ? (
                      <div className="flex items-center justify-center h-full text-brand">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((track) => {
                        const isSelected = selectedTracks.some(t => t.id === track.id);
                        return (
                          <div
                            key={track.id}
                            onClick={() => toggleTrack(track)}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border border-transparent",
                              isSelected ? "bg-brand/10 border-brand/30" : "hover:bg-white/5"
                            )}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <img src={getMediaUrl(track.coverUrl)} className="w-10 h-10 rounded-lg object-cover bg-zinc-900" alt="" />
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white truncate">{track.title}</p>
                                <p className="text-xs text-zinc-500 truncate">{track.artist?.name || 'Unknown'}</p>
                              </div>
                            </div>
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all",
                              isSelected ? "bg-brand border-brand text-black" : "bg-black/50 border-white/20 text-transparent"
                            )}>
                              <Check size={12} strokeWidth={3} />
                            </div>
                          </div>
                        );
                      })
                    ) : searchQuery ? (
                      <div className="flex items-center justify-center h-full text-zinc-600 text-sm font-medium">
                        No tracks found
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-zinc-600 text-sm font-medium flex-col gap-2">
                        <Music className="w-8 h-8 opacity-50" />
                        Search to seed your playlist
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>

        <div className="p-6 bg-black/40 border-t border-white/5 flex items-center justify-between">
          <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
            {selectedTracks.length} Track{selectedTracks.length !== 1 && 's'} Selected
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading} className="text-zinc-400 hover:text-white hover:bg-white/5 font-bold text-xs uppercase tracking-widest rounded-xl">
              Cancel
            </Button>
            <Button 
              type="submit" 
              form="create-playlist-form"
              disabled={isLoading || !name.trim()} 
              className="bg-brand text-black font-black px-6 h-10 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.3)]"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Playlist'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
