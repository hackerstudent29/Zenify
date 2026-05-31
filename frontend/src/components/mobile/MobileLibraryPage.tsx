"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Plus, Search, Heart, Disc, User, ChevronRight, Play } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Button } from "@/components/ui/button";
import { getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { TrackItem } from "@/components/track-item";
import Link from "next/link";
import { UniversalMediaCover } from "@/components/shared/MediaCard";

export function MobileLibraryPage({ 
  onOpenCreatePlaylist 
}: { 
  onOpenCreatePlaylist: () => void 
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState("playlists");

  const tabs = [
    { id: "playlists", label: "Playlists" },
    { id: "liked", label: "Liked" },
    { id: "albums", label: "Albums" },
    { id: "artists", label: "Artists" }
  ];

  const { data: playlists, isLoading: isLoadingPlaylists } = useQuery({
    queryKey: ["my-playlists"],
    queryFn: async () => {
      const res = await api.get("playlists/my");
      return res.data;
    },
    enabled: isAuthenticated && activeTab === "playlists",
  });

  const { data: likedTracks, isLoading: isLoadingTracks } = useQuery({
    queryKey: ["liked-tracks"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      return res.data;
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
    <div className="min-h-screen bg-[#0a0a0b] pb-[180px]">
      {/* Mobile Library Header */}
      <div className="sticky top-[3.5rem] z-40 bg-[#0a0a0b]/90 backdrop-blur-xl border-b border-white/5 pt-4 pb-2 px-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.3)]">
              <Library size={16} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-brand">Your Library</h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push('/search')}
              className="text-white/60 hover:text-white transition-colors"
            >
              <Search size={20} />
            </button>
            <button 
              onClick={onOpenCreatePlaylist}
              className="text-white/60 hover:text-white transition-colors"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>

        {/* Custom Mobile Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 snap-x snap-mandatory hide-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`snap-start px-5 py-2 rounded-full text-[12px] font-bold tracking-wide whitespace-nowrap transition-all border ${
                activeTab === tab.id
                  ? "bg-brand text-white border-brand shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.2)]"
                  : "bg-white/5 text-white/60 border-transparent hover:bg-white/10"
              }`}
            >
              {tab.label}
            </button>
          ))}
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
              <div className="flex flex-col gap-3">
                <div 
                  onClick={onOpenCreatePlaylist}
                  className="flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-lg bg-white/5 border border-dashed border-white/20 flex items-center justify-center shrink-0">
                    <Plus size={24} className="text-white/50" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-[14px] text-white">Create playlist</h3>
                    <p className="text-[11px] text-white/50">Curate your own collection</p>
                  </div>
                </div>

                {isLoadingPlaylists ? (
                  <div className="py-10 flex justify-center"><ZenLoading size="sm" /></div>
                ) : playlists?.map((playlist: any) => (
                  <Link 
                    href={`/playlist/${playlist.id}`} 
                    key={playlist.id}
                    className="flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-900 shrink-0 shadow-md">
                      {playlist.coverUrl ? (
                        <img src={getMediaUrl(playlist.coverUrl)} className="w-full h-full object-cover" />
                      ) : (
                        <UniversalMediaCover track={playlist} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-[14px] text-white truncate">{formatDisplayTitle(playlist.name)}</h3>
                      <p className="text-[11px] text-white/50 truncate">Playlist • {playlist._count?.tracks || 0} tracks</p>
                    </div>
                    <ChevronRight size={16} className="text-white/20" />
                  </Link>
                ))}
              </div>
            )}

            {/* Liked Songs */}
            {activeTab === "liked" && (
              <div className="flex flex-col gap-1">
                {isLoadingTracks ? (
                  <div className="py-10 flex justify-center"><ZenLoading size="sm" /></div>
                ) : likedTracks?.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-4 px-2">
                      <h2 className="text-sm font-bold text-brand tracking-wide">
                        {likedTracks.length} saved songs
                      </h2>
                    </div>
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
                  <div className="text-center py-20 px-4">
                    <div className="w-16 h-16 rounded-full bg-white/5 mx-auto flex items-center justify-center mb-4">
                      <Heart size={24} className="text-white/30" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">No liked songs yet</h3>
                    <p className="text-[11px] text-white/50 mb-6 max-w-[200px] mx-auto">Tap the heart on any track to add it to your Liked Songs.</p>
                    <Button onClick={() => router.push('/search')} className="bg-brand text-white text-xs font-bold px-8 rounded-full h-10">
                      Find Music
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Albums */}
            {activeTab === "albums" && (
              <div className="flex flex-col gap-3">
                {isLoadingAlbums ? (
                  <div className="py-10 flex justify-center"><ZenLoading size="sm" /></div>
                ) : albums?.map((album: any) => (
                  <Link 
                    href={`/album/${album.id}`} 
                    key={album.id}
                    className="flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-900 shrink-0 shadow-md">
                      <img src={getMediaUrl(album.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200"} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-[14px] text-white truncate">{formatDisplayTitle(album.title)}</h3>
                      <p className="text-[11px] text-white/50 truncate">Album • {formatDisplayTitle(album.artist?.name) || "Unknown Artist"}</p>
                    </div>
                    <ChevronRight size={16} className="text-white/20" />
                  </Link>
                ))}
              </div>
            )}

            {/* Artists */}
            {activeTab === "artists" && (
              <div className="flex flex-col gap-3">
                {isLoadingAllArtists ? (
                  <div className="py-10 flex justify-center"><ZenLoading size="sm" /></div>
                ) : allArtists?.map((artist: any) => (
                  <Link 
                    href={`/artist/${artist.id}`} 
                    key={artist.id}
                    className="flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-zinc-900 shrink-0 shadow-md border border-white/5">
                      <img src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${artist.name}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-[14px] text-white truncate">{formatDisplayTitle(artist.name)}</h3>
                      <p className="text-[11px] text-white/50 tracking-widest uppercase mt-0.5">Artist</p>
                    </div>
                    <ChevronRight size={16} className="text-white/20" />
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
