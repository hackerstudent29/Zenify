"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Plus, Search, Heart, Disc, User, ChevronRight, Play, Filter, MoreHorizontal, Trash2, Share2, ListPlus } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { AddSongsToPlaylistModal } from "@/components/shared/AddSongsToPlaylistModal";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Button } from "@/components/ui/button";
import { getMediaUrl, formatDisplayTitle, cn } from "@/lib/utils";
import { TrackItem } from "@/components/track-item";
import Link from "next/link";
import { UniversalMediaCover } from "@/components/shared/UniversalMediaCover";

export function MobileLibraryPage({ 
 onOpenCreatePlaylist 
}: { 
 onOpenCreatePlaylist: () => void 
}) {
 const router = useRouter();
 const { isAuthenticated } = useAuthStore();
 const [activeTab, setActiveTab] = useState("playlists");
  const { showToast, openConfirmModal } = useUIStore();
  const queryClient = useQueryClient();
  const [selectedPlaylistForAdd, setSelectedPlaylistForAdd] = useState<{ id: string; name: string } | null>(null);

  const handlePlayPlaylist = async (id: string) => {
    try {
      const res = await api.get(`/playlists/${id}`);
      const tracks = res.data?.tracks?.map((t: any) => t.track || t) || [];
      if (tracks.length > 0) {
        usePlayerStore.getState().setQueue(tracks);
        usePlayerStore.getState().setTrack(tracks[0]);
        useUIStore.getState().setPlayerMinimized(false);
      } else {
        showToast("Playlist is empty", "error");
      }
    } catch {
      showToast("Failed to play playlist", "error");
    }
  };

  const handleDeletePlaylist = (id: string, name: string) => {
    openConfirmModal({
      title: "Delete Playlist?",
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: "Delete",
      type: "danger",
      onConfirm: async () => {
        try {
          await api.delete(`/playlists/${id}`);
          queryClient.invalidateQueries({ queryKey: ["my-playlists"] });
          showToast("Playlist deleted", "success");
        } catch {
          showToast("Failed to delete playlist", "error");
        }
      }
    });
  };

 const tabs = [
 { id: "playlists", label: "Playlists", icon: Library },
 { id: "liked", label: "Liked Songs", icon: Heart },
 { id: "albums", label: "Albums", icon: Disc },
 { id: "artists", label: "Artists", icon: User }
 ];

 const { data: playlists, isLoading: isLoadingPlaylists } = useQuery({
 queryKey: ["my-playlists"],
 queryFn: async () => {
 const res = await api.get("playlists/my");
 const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
 return arr;
 },
 enabled: isAuthenticated && activeTab === "playlists",
 });

 const { data: likedTracks, isLoading: isLoadingTracks } = useQuery({
 queryKey: ["liked-tracks"],
 queryFn: async () => {
  const res = await api.get("tracks/liked");
  const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
  return arr;
 },
 enabled: isAuthenticated && activeTab === "liked",
 });

 const { data: albums, isLoading: isLoadingAlbums } = useQuery({
 queryKey: ["my-albums"],
 queryFn: async () => {
 const res = await api.get("albums");
 return res.data;
 },
 enabled: isAuthenticated && activeTab === "albums",
 });

 const { data: allArtists, isLoading: isLoadingAllArtists } = useQuery({
 queryKey: ["all-artists"],
 queryFn: async () => {
 const res = await api.get("artists");
 return res.data;
 },
 enabled: isAuthenticated && activeTab === "artists",
 });

  return (
 <div className="min-h-screen bg-background pb-[180px] pt-4">
 {/* Mobile Library Header */}
 <div className="relative z-10 bg-background/95 border-b border-white/5 pt-3 pb-3 px-4">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-end gap-2.5 h-10 pb-1">
 <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center shadow-lg border border-white/5 shrink-0">
 <Library size={16} className="text-brand" />
 </div>
 <h1 className="text-xl font-bold text-white tracking-tight leading-none mb-0.5 font-brand">
 Your library
 </h1>
 </div>
 <div className="flex items-center gap-2">
 <button 
 onClick={() => router.push('/search')}
 className="btn-icon bg-white/5 h-9 w-9 flex items-center justify-center rounded-full text-white transition-colors"
 >
 <Search size={16} className="text-brand" />
 </button>
 <button 
 onClick={onOpenCreatePlaylist}
 className="btn-icon bg-white/5 h-9 w-9 flex items-center justify-center rounded-full text-white transition-colors"
 >
 <Plus size={18} className="text-brand" />
 </button>
 </div>
 </div>

 {/* Custom Mobile Tabs */}
 <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
 {tabs.map((tab) => (
 <button
 key={tab.id}
 onClick={() => setActiveTab(tab.id)}
 className={cn(
 "flex items-center gap-2 px-4 h-8 rounded-full text-xs font-bold whitespace-nowrap transition-all border snap-start",
 activeTab === tab.id
 ? "bg-transparent text-zinc-500 border-red-500"
 : "bg-surface-hover text-zinc-500 border-transparent hover:text-zinc-400"
 )}
 >
 <tab.icon
 size={13}
 className={cn("shrink-0", activeTab === tab.id ? "text-red-500" : "text-rose-500")}
 />
 <span className="leading-none">{tab.label}</span>
 </button>
 ))}
 <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />
 <button className="btn-icon h-8 w-8 bg-surface-hover flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
 <Filter size={14} className="text-rose-500" />
 </button>
 </div>
 </div>

 {/* Content Area */}
 <div className="px-4 py-6">
 <AnimatePresence mode="wait">
 <motion.div
 key={activeTab}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 transition={{ duration: 0.2 }}
 >
 {/* Playlists */}
 {activeTab === "playlists" && (
 <div className="flex flex-col gap-4">
 <div 
 onClick={onOpenCreatePlaylist}
 className="flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer group"
 >
 <div className="w-16 h-16 rounded-xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center shrink-0 group-active:scale-95 transition-transform">
 <Plus size={28} className="text-white/50" />
 </div>
 <div className="flex-1">
 <h3 className="font-bold text-base text-white">Create playlist</h3>
 <p className="text-xs text-zinc-500 mt-1">Curate your own collection</p>
 </div>
 </div>

 {isLoadingPlaylists ? (
 <div className="py-20 flex justify-center"><ZenLoading size="sm" /></div>
              ) : (Array.isArray(playlists) ? playlists : []).map((playlist: any) => (
                <div 
                  key={playlist.id}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors group"
                >
                  <Link 
                    href={`/playlist/${playlist.id}`} 
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-900 shrink-0 shadow-lg group-active:scale-95 transition-transform">
                      {playlist.coverUrl ? (
                        <img src={getMediaUrl(playlist.coverUrl)} alt={playlist.name || "Playlist cover"} width={64} height={64} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <UniversalMediaCover track={playlist} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base text-white truncate">{formatDisplayTitle(playlist.name)}</h3>
                      <p className="text-xs text-zinc-500 truncate mt-1">Playlist • {playlist._count?.tracks || 0} tracks</p>
                    </div>
                  </Link>
                  <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <AnimatedDropdown
                      align="end"
                      trigger={
                        <button 
                          type="button"
                          className="w-9 h-9 rounded-full text-white/50 hover:text-white bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                          title="Playlist options"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      }
                      items={[
                        {
                          id: "play",
                          icon: <Play size={14} className="text-brand fill-current" />,
                          label: "Play",
                          onClick: () => handlePlayPlaylist(playlist.id)
                        },
                        {
                          id: "add-songs",
                          icon: <Plus size={14} className="text-brand" />,
                          label: "Add Songs",
                          onClick: () => setSelectedPlaylistForAdd({ id: playlist.id, name: playlist.name })
                        },
                        {
                          id: "share",
                          icon: <Share2 size={14} className="opacity-70" />,
                          label: "Share Link",
                          onClick: () => {
                            if (typeof window !== "undefined") {
                              navigator.clipboard.writeText(`${window.location.origin}/playlist/${playlist.id}`);
                              showToast("Playlist link copied!", "success");
                            }
                          }
                        },
                        { id: "sep", isSeparator: true },
                        {
                          id: "delete",
                          icon: <Trash2 size={14} className="text-red-400" />,
                          label: "Delete Playlist",
                          className: "text-red-400 focus:text-red-400",
                          onClick: () => handleDeletePlaylist(playlist.id, playlist.name)
                        }
                      ]}
                    />
                  </div>
                </div>
              ))}
 </div>
 )}

 {/* Liked Songs */}
 {activeTab === "liked" && (
 <div className="flex flex-col gap-1">
 {isLoadingTracks ? (
 <div className="py-20 flex justify-center"><ZenLoading size="sm" /></div>
 ) : likedTracks?.length > 0 ? (
 <>
 <Link href="/liked" className="flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors mb-4 group cursor-pointer">
 <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-800 shrink-0 shadow-lg flex items-center justify-center group-active:scale-95 transition-transform">
 <Heart size={28} className="text-white fill-white" />
 </div>
 <div className="flex-1 min-w-0">
 <h3 className="font-bold text-base text-white truncate">Liked Songs</h3>
 <p className="text-xs text-zinc-500 truncate mt-1">{likedTracks.length} tracks saved</p>
 </div>
 <Play size={20} className="text-white/40 fill-white/40" />
 </Link>
 
 <h2 className="text-xs font-bold text-zinc-500/50 uppercase tracking-widest px-2 mb-3 mt-2">
 Recent Liked Songs
 </h2>
 
 {likedTracks.map((track: any, i: number) => (
 <TrackItem
 key={track.id}
 track={track}
 index={i}
 contextTracks={likedTracks}
 hideThumbOnMobile={false}
 />
 ))}
 </>
 ) : (
 <div className="text-center py-24 px-4">
 <div className="w-20 h-20 rounded-full bg-white/5 mx-auto flex items-center justify-center mb-6">
 <Heart size={32} className="text-white/30" />
 </div>
 <h3 className="text-xl font-bold text-white mb-3">No liked songs yet</h3>
 <p className="text-sm text-white/50 mb-8 max-w-[220px] mx-auto">Tap the heart on any track to add it to your Liked Songs.</p>
 <Button onClick={() => router.push('/search')} className="bg-white text-black hover:bg-white/90 text-sm font-bold px-10 rounded-full h-12 shadow-xl">
 Find Music
 </Button>
 </div>
 )}
 </div>
 )}

 {/* Albums Grid */}
 {activeTab === "albums" && (
 <div className="grid grid-cols-2 gap-4">
 {isLoadingAlbums ? (
 <div className="col-span-2 py-20 flex justify-center"><ZenLoading size="sm" /></div>
 ) : albums?.length > 0 ? (
 albums.map((album: any) => (
 <Link 
 href={`/album/${album.id}`} 
 key={album.id}
 className="flex flex-col gap-3 group active:scale-95 transition-transform cursor-pointer"
 >
 <div className="w-full aspect-square rounded-2xl overflow-hidden bg-zinc-900 shadow-xl border border-white/5">
 <UniversalMediaCover track={{ ...album, coverUrl: album.coverUrl } as any} className="w-full h-full object-cover" />
 </div>
 <div className="px-1">
 <h3 className="font-bold text-sm text-white truncate">{formatDisplayTitle(album.title)}</h3>
 <p className="text-xs text-zinc-500 truncate mt-1">{formatDisplayTitle(album.artist?.name) || "Unknown Artist"}</p>
 </div>
 </Link>
 ))
 ) : (
 <div className="col-span-2 text-center py-20 text-white/50 text-sm">No albums saved yet.</div>
 )}
 </div>
 )}

 {/* Artists List/Grid */}
 {activeTab === "artists" && (
 <div className="flex flex-col gap-4">
 {isLoadingAllArtists ? (
 <div className="py-20 flex justify-center"><ZenLoading size="sm" /></div>
 ) : allArtists?.length > 0 ? (
 allArtists.map((artist: any) => (
 <Link 
 href={`/artist/${artist.id}`} 
 key={artist.id}
 className="flex items-center gap-5 p-2 rounded-2xl hover:bg-white/5 active:bg-white/10 transition-colors group cursor-pointer"
 >
 <div className="w-16 h-16 rounded-full overflow-hidden bg-zinc-900 shrink-0 shadow-lg border-2 border-white/5 group-active:scale-95 transition-transform">
 <img src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${artist.name}`} alt={artist.name || "Artist profile"} width={64} height={64} loading="lazy" decoding="async" className="w-full h-full object-cover" />
 </div>
 <div className="flex-1 min-w-0">
 <h3 className="font-bold text-base text-white truncate">{formatDisplayTitle(artist.name)}</h3>
 <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">Artist</p>
 </div>
 <ChevronRight size={18} className="text-white/20" />
 </Link>
 ))
 ) : (
 <div className="text-center py-20 text-white/50 text-sm">No artists followed yet.</div>
 )}
 </div>
 )}
 </motion.div>
 </AnimatePresence>
      </div>

      {selectedPlaylistForAdd && (
        <AddSongsToPlaylistModal
          playlistId={selectedPlaylistForAdd.id}
          playlistName={selectedPlaylistForAdd.name}
          open={!!selectedPlaylistForAdd}
          onClose={() => setSelectedPlaylistForAdd(null)}
        />
      )}
    </div>
  );
}
