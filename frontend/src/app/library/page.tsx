"use client";

import {
  Library,
  Search,
  Plus,
  Filter,
  Heart,
  Clock,
  User,
  Disc,
  Music,
  Play,
  LayoutDashboard,
} from "lucide-react";
import { ZenLoading } from "@/components/ui/ZenLoading";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn, getMediaUrl } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { TrackItem } from "@/components/track-item";
import Link from "next/link";

const categories = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "playlists", label: "Playlists", icon: Library },
  { id: "albums", label: "Albums", icon: Disc },
  { id: "liked", label: "Liked Songs", icon: Heart },
  { id: "artists", label: "Artists", icon: User },
];

export default function LibraryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState(tabParam || "overview");

  // Sync tab with URL
  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    } else if (!tabParam && activeTab !== "overview") {
      setActiveTab("overview");
    }
  }, [tabParam]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    const params = new URLSearchParams(searchParams.toString());
    if (tabId === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tabId);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  const { data: overview, isLoading: isLoadingOverview } = useQuery({
    queryKey: ["library-overview"],
    queryFn: async () => {
      const res = await api.get("/analytics/library-overview");
      return res.data;
    },
  });

  const { data: likedTracks, isLoading: isLoadingTracks } = useQuery({
    queryKey: ["liked-tracks"],
    queryFn: async () => {
      const res = await api.get("/tracks/liked");
      return res.data as Track[];
    },
  });

  const { data: playlists, isLoading: isLoadingPlaylists } = useQuery({
    queryKey: ["my-playlists"],
    queryFn: async () => {
      const res = await api.get("/playlists/my");
      return res.data;
    },
  });

  const { data: albums, isLoading: isLoadingAlbums } = useQuery({
    queryKey: ["my-albums"],
    queryFn: async () => {
      const res = await api.get("/albums");
      return res.data as {
        id: string;
        title: string;
        coverUrl: string;
        artist: { name: string };
      }[];
    },
  });

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header Area */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-white/5 px-4 py-4 md:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg shadow-white/10 border border-white/10">
              <Library size={20} className="text-black" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Your library
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-icon bg-white/5 text-muted hover:text-foreground">
              <Search size={18} />
            </button>
            <button className="btn-icon bg-white/5 text-muted hover:text-foreground">
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all",
                activeTab === cat.id
                  ? "bg-zinc-800 text-white shadow-lg border border-white/10"
                  : "bg-surface-hover text-muted hover:text-foreground hover:bg-white/10 border border-transparent"
              )}
            >
              <cat.icon
                size={14}
                className={
                  activeTab === cat.id ? "text-white" : "text-muted"
                }
              />
              {cat.label}
            </button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button className="btn-icon h-8 w-8 bg-surface-hover text-muted hover:text-foreground">
            <Filter size={14} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="px-4 py-6 md:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-12 pb-10">
                {isLoadingOverview ? (
                  <div className="flex items-center justify-center py-20">
                    <ZenLoading size="md" />
                  </div>
                ) : overview ? (
                  <>
                    {/* Most Played Songs */}
                    {overview.topTracks?.length > 0 && (
                      <section>
                        <h2 className="text-xl font-black mb-4 tracking-tight">
                          Your Top Songs
                        </h2>
                        <div className="flex flex-col gap-1 w-full">
                          {overview.topTracks
                            .slice(0, 5)
                            .map((track: any, i: number) => (
                              <TrackItem
                                key={track.id}
                                track={track}
                                index={i}
                                contextTracks={overview.topTracks}
                              />
                            ))}
                        </div>
                      </section>
                    )}

                    {/* Most Listened Artists */}
                    {overview.topArtists?.length > 0 && (
                      <section>
                        <h2 className="text-xl font-black mb-4 tracking-tight">
                          Your Top Artists
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                          {overview.topArtists.map((artist: any) => (
                            <Link
                              key={artist.id}
                              href={`/search?q=${artist.name}`}
                              className="group flex flex-col items-center text-center space-y-3"
                            >
                              <div className="w-full aspect-square rounded-full overflow-hidden bg-white/5 border border-white/10 group-hover:scale-105 transition-transform shadow-lg shadow-black/50">
                                <img
                                  src={
                                    artist.imageUrl ||
                                    `https://ui-avatars.com/api/?name=${artist.name}`
                                  }
                                  alt={artist.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div>
                                <h3 className="font-bold text-sm text-foreground group-hover:text-accent transition-colors line-clamp-1">
                                  {artist.name}
                                </h3>
                                <p className="text-[10px] text-zinc-500 font-medium">
                                  {artist.totalPlays} plays
                                </p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Recent / Top Albums */}
                    {overview.recentAlbums?.length > 0 && (
                      <section>
                        <h2 className="text-xl font-black mb-4 tracking-tight">
                          Albums
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                          {overview.recentAlbums.map((album: any) => (
                            <Link
                              key={album.id}
                              href={`/album/${album.id}`}
                              className="group block p-2 rounded-xl transition-all hover:bg-white/5 cursor-pointer space-y-3"
                            >
                              <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all">
                                <img
                                  src={
                                    getMediaUrl(album.coverUrl) ||
                                    "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400"
                                  }
                                  alt={album.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="px-1">
                                <h3 className={cn(
                                  "text-[13px] font-bold truncate leading-snug transition-colors text-brand"
                                )}> {album.title} </h3>
                                <p className="text-[11px] text-muted font-medium truncate mt-0.5">
                                  {album.artist?.name}
                                </p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Playlists */}
                    {overview.playlists?.length > 0 && (
                      <section>
                        <h2 className="text-xl font-black mb-4 tracking-tight">
                          Your Playlists
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                          {overview.playlists.map((playlist: any) => (
                            <Link
                              key={playlist.id}
                              href={`/playlist/${playlist.id}`}
                              className="group block p-2 rounded-xl transition-all hover:bg-white/5 cursor-pointer space-y-3"
                            >
                              <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all">
                                <img
                                  src={
                                    getMediaUrl(playlist.coverUrl) ||
                                    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400"
                                  }
                                  alt={playlist.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="px-1">
                                <h3 className="font-bold text-[13px] truncate group-hover:text-accent transition-colors">
                                  {playlist.name}
                                </h3>
                                <p className="text-[11px] text-muted font-medium truncate mt-0.5">
                                  {playlist._count?.tracks || 0} tracks
                                </p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                ) : (
                  <div className="text-center py-20 text-muted">
                    No library data available yet. start listening to see
                    insights!
                  </div>
                )}
              </div>
            )}

            {/* Playlists Tab */}
            {activeTab === "playlists" && (
              <div>
                {isLoadingPlaylists ? (
                  <div className="flex items-center justify-center py-20">
                    <ZenLoading size="md" />
                  </div>
                ) : playlists && playlists.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                    {/* Create New Playlist Card */}
                    <div className="group block space-y-3 cursor-pointer">
                      <div className="aspect-square bg-white/[0.02] border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 group-hover:bg-white/[0.05] transition-colors">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Plus
                            size={20}
                            className="text-muted group-hover:text-foreground"
                          />
                        </div>
                      </div>
                      <div className="px-1 text-center">
                        <h3 className="font-bold text-[12px] truncate group-hover:text-foreground text-muted transition-colors">
                          Create Playlist
                        </h3>
                      </div>
                    </div>

                    {playlists.map((playlist: any) => (
                      <Link
                        key={playlist.id}
                        href={`/playlist/${playlist.id}`}
                        className="group block p-2 rounded-xl transition-all hover:bg-white/5 cursor-pointer space-y-3"
                      >
                        <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all flex items-center justify-center">
                          {playlist.coverUrl ? (
                            <img
                              src={getMediaUrl(playlist.coverUrl)}
                              className="w-full h-full object-cover transition-all duration-700"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80&fit=crop";
                              }}
                            />
                          ) : (
                            <img
                              src={`https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80`}
                              className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "https://images.unsplash.com/photo-1470225620353-fb4b183b523e?w=400&q=80&fit=crop";
                              }}
                            />
                          )}
                        </div>
                        <div className="px-1">
                          <h3 className="font-bold text-[13px] truncate group-hover:text-accent transition-colors text-foreground">
                            {playlist.name}
                          </h3>
                          <p className="text-[11px] text-muted font-medium truncate mt-0.5">
                            {playlist._count?.tracks || 0} tracks
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-center">
                    <div className="w-20 h-20 rounded-full border border-white/5 bg-white/5 mb-6 flex items-center justify-center">
                      <Library
                        size={28}
                        className="text-zinc-600"
                        strokeWidth={1.5}
                      />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">
                      Your library is empty
                    </h3>
                    <p className="text-xs text-muted max-w-xs mb-8">
                      Start creating playlists or saving songs to build your
                      personal collection.
                    </p>
                    <Button className="font-bold tracking-wide text-xs bg-brand text-white hover:bg-brand/90 border-none shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.3)]">
                      Create playlist
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Albums Tab */}
            {activeTab === "albums" && (
              <div>
                {isLoadingAlbums ? (
                  <div className="flex items-center justify-center py-20">
                    <ZenLoading size="md" />
                  </div>
                ) : albums && albums.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                    {albums.map((album: any) => (
                      <Link
                        key={album.id}
                        href={`/album/${album.id}`}
                        className="group block p-2 rounded-xl transition-all hover:bg-white/5 cursor-pointer space-y-3"
                      >
                        <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all flex items-center justify-center">
                          {album.coverUrl ? (
                            <img
                              src={getMediaUrl(album.coverUrl)}
                              className="w-full h-full object-cover transition-all duration-700"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&q=80&fit=crop";
                              }}
                            />
                          ) : (
                            <img
                              src={`https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&q=80`}
                              className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
                            />
                          )}
                        </div>
                        <div className="px-1">
                          <h3 className="font-bold text-[13px] truncate group-hover:text-accent transition-colors text-foreground">
                            {album.title}
                          </h3>
                          <p className="text-[11px] text-muted font-medium truncate mt-0.5">
                            {album.artist?.name || "Unknown Artist"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-center">
                    <div className="w-20 h-20 rounded-full border border-white/5 bg-white/5 mb-6 flex items-center justify-center">
                      <Disc
                        size={28}
                        className="text-zinc-600"
                        strokeWidth={1.5}
                      />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">
                      No albums yet
                    </h3>
                    <p className="text-xs text-muted max-w-xs mb-8">
                      Import entire albums from external sources to see them
                      collection here.
                    </p>
                    <Button
                      onClick={() => router.push("/admin/playlist-import")}
                      className="font-bold uppercase tracking-wider text-xs bg-brand text-white hover:bg-brand"
                    >
                      Import Music
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Liked Songs Tab */}
            {activeTab === "liked" && (
              <div>
                {isLoadingTracks ? (
                  <div className="flex items-center justify-center py-20">
                    <ZenLoading size="md" />
                  </div>
                ) : likedTracks && likedTracks.length > 0 ? (
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-bold text-brand tracking-wide">
                        {likedTracks.length} saved songs
                      </h2>
                      <Button
                        size="sm"
                        className="h-8 text-[11px] font-bold uppercase tracking-widest bg-brand text-white hover:bg-brand/90 rounded-full shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.3)]"
                      >
                        <Play size={12} className="mr-1.5 fill-white" /> Play
                        all
                      </Button>
                    </div>
                    {likedTracks.map((track, i) => (
                      <TrackItem
                        key={track.id}
                        track={track}
                        index={i}
                        contextTracks={likedTracks}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-center">
                    <div className="w-20 h-20 rounded-full border border-white/10 bg-white/5 mb-6 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                      <Heart
                        size={28}
                        className="text-white/40"
                        strokeWidth={1.5}
                      />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">
                      No liked songs yet
                    </h3>
                    <p className="text-xs text-muted max-w-xs mb-8">
                      Tap the heart on any track to add it to your Liked Songs.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => router.push("/search")}
                      className="font-bold uppercase tracking-wider text-xs border-white/10 hover:bg-white/5 text-foreground"
                    >
                      Discover Music
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Artists Tab */}
            {activeTab === "artists" && (
              <div className="space-y-8">
                {isLoadingOverview ? (
                  <div className="flex items-center justify-center py-20">
                    <ZenLoading size="md" />
                  </div>
                ) : overview?.topArtists?.length > 0 ? (
                  <div>
                    <h2 className="text-xl font-black mb-6 tracking-tight">Your Artists</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-8 px-4">
                      {overview.topArtists.map((artist: any) => (
                        <Link
                          key={artist.id}
                          href={`/search?q=${artist.name}`}
                          className="group flex flex-col items-center text-center space-y-4"
                        >
                          <div className="w-full aspect-square rounded-full overflow-hidden bg-white/5 border border-white/10 group-hover:scale-105 transition-all shadow-xl shadow-black/40 group-hover:ring-2 ring-brand/50">
                            <img
                              src={artist.imageUrl || `https://ui-avatars.com/api/?name=${artist.name}&background=random`}
                              alt={artist.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-foreground group-hover:text-accent transition-colors line-clamp-1">{artist.name}</h3>
                            <p className="text-[10px] text-zinc-500 font-bold tracking-widest mt-1">Artist</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-center">
                    <div className="w-20 h-20 rounded-full border border-white/5 bg-white/5 mb-6 flex items-center justify-center">
                      <User size={28} className="text-zinc-600" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">No artists followed yet</h3>
                    <p className="text-xs text-muted max-w-xs mb-8">Start listening to your favorite artists to see them here.</p>
                    <Button onClick={() => router.push('/search')} className="font-bold uppercase tracking-wider text-xs bg-brand text-white">Find Artists</Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
