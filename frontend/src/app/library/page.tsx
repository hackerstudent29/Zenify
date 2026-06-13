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
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track } from "@/store/player";
import { TrackItem } from "@/components/track-item";
import { ArtistPortrait } from "@/components/shared/ArtistPortrait";
import Link from "next/link";
import { UniversalMediaCover } from "@/components/shared/UniversalMediaCover";
import { CreatePlaylistModal } from "@/components/create-playlist-modal";

import { useIsMobile } from "@/hooks/useIsMobile";
import { MobileLibraryPage } from "@/components/mobile/MobileLibraryPage";

const categories = [
 { id: "overview", label: "Overview", icon: LayoutDashboard },
 { id: "playlists", label: "Playlists", icon: Library },
 { id: "albums", label: "Albums", icon: Disc },
 { id: "liked", label: "Liked Songs", icon: Heart },
 { id: "artists", label: "Artists", icon: User },
];

export default function LibraryPage() {
 const isMobile = useIsMobile();
 const router = useRouter();
 const pathname = usePathname();
 const searchParams = useSearchParams();
 const tabParam = searchParams.get("tab");

 const [activeTab, setActiveTab] = useState(tabParam || "overview");
 const [hydrated, setHydrated] = useState(false);
 const { isAuthenticated } = useAuthStore();
 const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

 useEffect(() => {
 if (useAuthStore.persist.hasHydrated()) {
 setHydrated(true);
 } else {
 const unsub = useAuthStore.persist.onFinishHydration(() => {
 setHydrated(true);
 });
 return unsub;
 }
 }, []);

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
 const res = await api.get("analytics/library-overview");
 return res.data;
 },
 enabled: hydrated && isAuthenticated,
 });

 const { data: likedTracks, isLoading: isLoadingTracks } = useQuery({
 queryKey: ["liked-tracks"],
 queryFn: async () => {
 const res = await api.get("tracks/liked");
 return res.data as Track[];
 },
 enabled: hydrated && isAuthenticated,
 });

 const { data: playlists, isLoading: isLoadingPlaylists } = useQuery({
 queryKey: ["my-playlists"],
 queryFn: async () => {
 const res = await api.get("playlists/my");
 return res.data;
 },
 enabled: hydrated && isAuthenticated,
 });

 const { data: albums, isLoading: isLoadingAlbums } = useQuery({
 queryKey: ["my-albums"],
 queryFn: async () => {
 const res = await api.get("albums");
 return res.data;
 },
 enabled: hydrated && isAuthenticated,
 });

 const { data: allArtists, isLoading: isLoadingAllArtists } = useQuery({
 queryKey: ["all-artists"],
 queryFn: async () => {
 const res = await api.get("artists");
 return res.data as any[];
 },
 enabled: hydrated && isAuthenticated && activeTab === "artists",
 });

 if (isMobile) {
 return (
 <>
 <MobileLibraryPage onOpenCreatePlaylist={() => setIsCreateModalOpen(true)} />
 <CreatePlaylistModal
 isOpen={isCreateModalOpen}
 onClose={() => setIsCreateModalOpen(false)}
 />
 </>
 );
 }

 return (
 <div className="min-h-screen bg-background pb-32">
 {/* Header Area */}
 <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-white/5 px-4 py-4 md:px-8">
 <div className="flex items-center justify-between mb-6">
 <div className="flex items-end gap-3 h-10 pb-1">
 <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center shadow-lg shadow-black/20 border border-white/5 shrink-0">
 <Library size={20} className="text-red-500" />
 </div>
 <h1 className="text-2xl font-bold text-zinc-500 tracking-tight leading-none mb-0.5 font-brand" style={{ fontFamily: "'Orange Avenue', serif" }}>
 Your library
 </h1>
 </div>
 <div className="flex items-center gap-2 h-10">
 <button 
 onClick={() => router.push('/search')}
 className="btn-icon bg-white/5 h-10 w-10 flex items-center justify-center rounded-full text-zinc-500 transition-colors"
 >
 <Search size={18} className="text-red-500" />
 </button>
 <button 
 onClick={() => router.push('/admin/playlist-import')}
 className="btn-icon bg-white/5 h-10 w-10 flex items-center justify-center rounded-full text-zinc-500 transition-colors"
 >
 <Plus size={18} className="text-red-500" />
 </button>
 </div>
 </div>

 {/* Filter Tabs */}
 <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
 {categories.map((cat) => (
 <button
 key={cat.id}
 onClick={() => handleTabChange(cat.id)}
 className={cn(
 "flex items-center gap-2 px-4 h-8 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
 activeTab === cat.id
 ? "bg-transparent text-zinc-500 border-red-500"
 : "bg-surface-hover text-zinc-500 border-transparent hover:text-zinc-400"
 )}
 >
 <cat.icon
 size={14}
 className={cn("shrink-0", activeTab === cat.id ? "text-red-500" : "text-rose-500")}
 />
 <span className="leading-none">{cat.label}</span>
 </button>
 ))}
 <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />
 <button className="btn-icon h-8 w-8 bg-surface-hover flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
 <Filter size={14} className="text-rose-500" />
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
 <h2 className="text-xl font-sans font-bold text-zinc-500 tracking-tight mb-4">
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
 <h2 className="text-xl font-sans font-bold text-zinc-500 tracking-tight mb-4">
 Your Top Artists
 </h2>
 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
 {overview.topArtists.map((artist: any) => (
 <Link
 key={artist.id}
 href={`/search?q=${artist.name}`}
 className="group flex flex-col items-center text-center space-y-3"
 >
 <div className="w-full aspect-square rounded-full overflow-hidden bg-white/5 border border-white/10 group- transition-transform shadow-lg shadow-black/50">
 <img
 src={
 getMediaUrl(artist.imageUrl) ||
 `https://ui-avatars.com/api/?name=${artist.name}`
 }
 alt={artist.name}
 className="w-full h-full object-cover"
 />
 </div>
 <div>
 <h3 className="font-bold text-sm text-foreground group-hover:text-accent transition-colors line-clamp-1">
 {formatDisplayTitle(artist.name)}
 </h3>
 <p className="text-[10px] text-zinc-500 font-medium">
 {artist.totalPlays} streams
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
 <h2 className="text-xl font-sans font-bold text-zinc-500 tracking-tight mb-4">
 Albums
 </h2>
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
 {overview.recentAlbums.map((album: any) => (
 <Link
 key={album.id}
 href={`/album/${album.id}`}
 className="group block rounded-xl transition-all hover:bg-white/10 cursor-pointer space-y-2 pb-2"
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
 "text-[] font-sans font-bold truncate leading-snug transition-colors text-white"
 )}> {formatDisplayTitle(album.title)} </h3>
 <p className="text-[12px] text-zinc-500 font-medium truncate mt-0.5">
 {formatDisplayTitle(album.artist?.name)}
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
 <h2 className="text-xl font-sans font-bold text-zinc-500 tracking-tight mb-4">
 Your Playlists
 </h2>
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
 {overview.playlists.map((playlist: any) => (
 <Link
 key={playlist.id}
 href={`/playlist/${playlist.id}`}
 className="group block rounded-xl transition-all hover:bg-white/10 cursor-pointer space-y-2 pb-2"
 >
 <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all">
 {playlist.coverUrl ? (
 <img
 src={getMediaUrl(playlist.coverUrl)}
 alt={playlist.name}
 className="w-full h-full object-cover"
 />
 ) : (
 <UniversalMediaCover track={playlist} />
 )}
 </div>
 <div className="px-1">
 <h3 className="font-sans font-bold text-[] truncate group-hover:text-white transition-colors text-white">
 {formatDisplayTitle(playlist.name)}
 </h3>
 <p className="text-[12px] text-zinc-500 font-medium truncate mt-0.5">
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
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
 {/* Create New Playlist Card */}
 <div 
 onClick={() => setIsCreateModalOpen(true)}
 className="group block space-y-3 cursor-pointer"
 >
 <div className="aspect-square bg-white/[0.02] border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 group-hover:bg-white/[0.05] transition-colors">
 <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group- transition-transform">
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
 className="group block rounded-xl transition-all hover:bg-white/10 cursor-pointer space-y-2 pb-2"
 >
 <div className="aspect-square bg-zinc-900 rounded-lg overflow-hidden shadow-xl ring-1 ring-white/5 group-hover:ring-accent/50 group-hover:scale-[1.02] transition-all flex items-center justify-center">
 {playlist.coverUrl ? (
 <img
 src={getMediaUrl(playlist.coverUrl, 'image')}
 className="w-full h-full object-cover transition-all duration-700"
 onError={(e) => {
 (e.target as HTMLImageElement).src =
 "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80&fit=crop";
 }}
 />
 ) : (
 <UniversalMediaCover track={playlist} />
 )}
 </div>
 <div className="px-1">
 <h3 className="font-sans font-bold text-[] truncate group-hover:text-white transition-colors text-white">
 {formatDisplayTitle(playlist.name)}
 </h3>
 <p className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">
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
 <Button 
 onClick={() => setIsCreateModalOpen(true)}
 className="font-bold tracking-wide text-xs bg-white/10 text-brand border border-white/5 hover:bg-white/20 shadow-lg"
 >
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
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
 {albums.map((album: any) => (
 <Link
 key={album.id}
 href={`/album/${album.id}`}
 className="group block rounded-xl transition-all hover:bg-white/10 cursor-pointer space-y-2 pb-2"
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
 <h3 className="font-sans font-bold text-[] truncate group-hover:text-white transition-colors text-white">
 {formatDisplayTitle(album.title)}
 </h3>
 <p className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">
 {formatDisplayTitle(album.artist?.name) || "Unknown Artist"}
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
 className="font-bold uppercase tracking-wider text-xs bg-white/10 text-brand border border-white/5 hover:bg-white/20"
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
 className="h-8 text-[11px] font-bold uppercase tracking-widest bg-white/10 text-brand border border-white/5 hover:bg-white/20 rounded-full shadow-lg"
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
 {isLoadingOverview || isLoadingAllArtists ? (
 <div className="flex items-center justify-center py-20">
 <ZenLoading size="md" />
 </div>
 ) : (overview?.topArtists?.length > 0 || (allArtists && allArtists.length > 0)) ? (
 <div className="space-y-12">
 {/* User's Listened Artists */}
 {overview?.topArtists?.length > 0 && (
 <section>
 <h2 className="text-xl font-sans font-bold text-white tracking-tight mb-6 flex items-center gap-2">
 Your Top Artists
 </h2>
 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
 {overview.topArtists.map((artist: any) => (
 <ArtistCard key={artist.id} artist={artist} label="Top Artist" />
 ))}
 </div>
 </section>
 )}

 {/* Recommended Artists (Canonical) */}
 {allArtists && allArtists.length > 0 && (
 <section>
 <h2 className="text-xl font-sans font-bold mb-6 tracking-tight text-white/90">Recommended for you</h2>
 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
 {allArtists.map((artist: any) => (
 <ArtistCard key={artist.id} artist={artist} label="Verified" />
 ))}
 </div>
 </section>
 )}
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center py-32 text-center">
 <div className="w-20 h-20 rounded-full border border-white/5 bg-white/5 mb-6 flex items-center justify-center">
 <User size={28} className="text-zinc-600" strokeWidth={1.5} />
 </div>
 <h3 className="text-lg font-bold text-white mb-2 tracking-tight">No artists found</h3>
 <p className="text-xs text-muted max-w-xs mb-8">Start listening to your favorite artists to see them here.</p>
 <Button onClick={() => router.push('/search')} className="font-bold uppercase tracking-wider text-xs bg-white/10 text-brand border border-white/5 hover:bg-white/20">Find Artists</Button>
 </div>
 )}
 </div>
 )}
 </motion.div>
 </AnimatePresence>
 </div>
 <CreatePlaylistModal
 isOpen={isCreateModalOpen}
 onClose={() => setIsCreateModalOpen(false)}
 />
 </div>
 );
}

// Artist Card Component for cleaner reuse
function ArtistCard({ artist, label }: { artist: any; label: string }) {
 return (
 <Link
 href={`/artist/${artist.id}`}
 className="group flex flex-col items-center text-center space-y-4"
 >
 <div className="w-full aspect-square rounded-full overflow-hidden bg-white/5 border border-white/10 group- transition-all shadow-xl shadow-black/40 group-hover:ring-2 ring-brand/50">
 <ArtistPortrait 
 imageUrl={artist.imageUrl}
 name={artist.name}
 className="w-full h-full"
 size={512}
 />
 </div>
 <div>
 <h3 className="font-bold text-sm text-foreground group-hover:text-brand transition-colors line-clamp-1">
 {artist.name}
 </h3>
 <p className="text-[10px] text-zinc-500 font-bold tracking-widest mt-1 uppercase">
 {label}
 </p>
 </div>
 </Link>
 );
}
