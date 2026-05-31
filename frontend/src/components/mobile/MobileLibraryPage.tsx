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
    <div className="min-h-screen bg-black pb-[180px]">
      {/* Mobile Library Header */}
      <div className="sticky top-0 z-40 bg-black/95 backdrop-blur-2xl border-b border-white/5 pt-5 pb-3 px-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Your Library</h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/search')}
              className="text-white/70 hover:text-white transition-colors"
            >
              <Search size={22} strokeWidth={2.5} />
            </button>
            <button 
              onClick={onOpenCreatePlaylist}
              className="text-white/70 hover:text-white transition-colors"
            >
              <Plus size={26} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Custom Mobile Tabs */}
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1 snap-x snap-mandatory hide-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`snap-start px-5 py-2 rounded-full text-sm font-bold tracking-wide whitespace-nowrap transition-all border ${
                activeTab === tab.id
                  ? "bg-brand text-white border-brand shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.3)]"
                  : "bg-white/5 text-white/70 border-transparent hover:bg-white/10"
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
                    <p className="text-xs text-white/50 mt-1">Curate your own collection</p>
                  </div>
                </div>

                {isLoadingPlaylists ? (
                  <div className="py-20 flex justify-center"><ZenLoading size="sm" /></div>
                ) : playlists?.map((playlist: any) => (
                  <Link 
                    href={`/playlist/${playlist.id}`} 
                    key={playlist.id}
                    className="flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors group"
                  >
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-900 shrink-0 shadow-lg group-active:scale-95 transition-transform">
                      {playlist.coverUrl ? (
                        <img src={getMediaUrl(playlist.coverUrl)} className="w-full h-full object-cover" />
                      ) : (
                        <UniversalMediaCover track={playlist} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base text-white truncate">{formatDisplayTitle(playlist.name)}</h3>
                      <p className="text-xs text-white/50 truncate mt-1">Playlist • {playlist._count?.tracks || 0} tracks</p>
                    </div>
                    <ChevronRight size={18} className="text-white/20" />
                  </Link>
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
                        <p className="text-xs text-white/70 truncate mt-1">{likedTracks.length} tracks saved</p>
                      </div>
                      <Play size={20} className="text-white/40 fill-white/40" />
                    </Link>
                    
                    <h2 className="text-xs font-bold text-white/40 uppercase tracking-widest px-2 mb-3 mt-2">
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
                        <img src={getMediaUrl(album.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400"} className="w-full h-full object-cover" />
                      </div>
                      <div className="px-1">
                        <h3 className="font-bold text-sm text-white truncate">{formatDisplayTitle(album.title)}</h3>
                        <p className="text-xs text-white/50 truncate mt-1">{formatDisplayTitle(album.artist?.name) || "Unknown Artist"}</p>
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
                        <img src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${artist.name}`} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base text-white truncate">{formatDisplayTitle(artist.name)}</h3>
                        <p className="text-xs text-white/50 uppercase tracking-widest mt-1">Artist</p>
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
    </div>
  );
}
