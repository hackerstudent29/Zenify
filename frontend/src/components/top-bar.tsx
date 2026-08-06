"use client";

import {
 Search,
 Bell,
 User as UserIcon,
 ChevronLeft,
 ChevronRight,
 Play,
 Pause,
 SkipBack,
 SkipForward,
 Sparkles,
 MoreHorizontal,
 Heart,
 Plus,
 Download,
 Settings,
 Info,
 Disc,
 ListMusic,
 Share2,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import { useNotificationStore } from "@/store/notificationStore";
import AnimatedList from "@/components/shared/AnimatedList";
import { GlobalSearchModal } from "@/components/shared/GlobalSearchModal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { InlinePlaylistCreator } from "@/components/pc/PCMediaCard";
import { ProfileCircleMenu } from "@/components/ui/profile-circle-menu";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn, getMediaUrl, getTrackCover } from "@/lib/utils";
import { useDebounce } from "use-debounce";
import api from "@/lib/api";
import { ArtistPortrait } from "./shared/ArtistPortrait";
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
 DropdownMenuPortal,
 DropdownMenuSub,
 DropdownMenuSubTrigger,
 DropdownMenuSubContent,
 DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ZenifyLogo } from "./shared/ZenifyLogo";

export function TopBar() {
 const isMobile = useIsMobile();
 const isLyricsOpen = useUIStore(state => state.isLyricsOpen);
 const stickyPageTitle = useUIStore(state => state.stickyPageTitle);
 const { user } = useAuthStore();
 const currentTrack = usePlayerStore(state => state.currentTrack);
 const isPlaying = usePlayerStore(state => state.isPlaying);
 const togglePlay = usePlayerStore(state => state.togglePlay);
 const playNext = usePlayerStore(state => state.playNext);
 const playPrev = usePlayerStore(state => state.playPrev);
 const router = useRouter();
 const pathname = usePathname();
 const [searchFocused, setSearchFocused] = useState(false);
 const [query, setQuery] = useState("");
 const [debouncedQuery] = useDebounce(query, 150);
 const [searchResults, setSearchResults] = useState<any>(null);
 const [activeFilter, setActiveFilter] = useState("all");
 const [isMenuOpen, setIsMenuOpen] = useState(false);
 const [isSearching, setIsSearching] = useState(false);
 const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

 // Favorites state (React Query for instant optimistic updates)
 const queryClient = useQueryClient();
 const { data: likedTrackIds = [] } = useQuery({
 queryKey: ['liked-track-ids'],
 queryFn: async () => {
  const res = await api.get('tracks/liked');
  const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
  return arr.map((t: any) => t.id);
 },
 staleTime: 1000 * 60 * 5,
 enabled: !!user,
 });

 const toggleLikeMutation = useMutation({
 mutationFn: async (trackId: string) => {
 await api.post(`/tracks/${trackId}/like`);
 },
 onMutate: async (trackId: string) => {
 await queryClient.cancelQueries({ queryKey: ['liked-track-ids'] });
 const previousLikedIds = queryClient.getQueryData<string[]>(['liked-track-ids']);
 const newLikedIds = previousLikedIds ? (
 previousLikedIds.includes(trackId)
 ? previousLikedIds.filter(id => id !== trackId)
 : [...previousLikedIds, trackId]
 ) : [trackId];
 queryClient.setQueryData(['liked-track-ids'], newLikedIds);
 return { previousLikedIds };
 },
 onError: (err, trackId, context) => {
 if (context?.previousLikedIds) {
 queryClient.setQueryData(['liked-track-ids'], context.previousLikedIds);
 }
 },
 onSettled: () => {
 queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
 queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
 }
 });

 const [playlists, setPlaylists] = useState<any[]>([]);
 const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

 const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
 setToast({ msg, type });
 setTimeout(() => setToast(null), 2500);
 };

 useEffect(() => {
 if (user) {
 api.get("playlists/my")
 .then((res) => {
   const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
   setPlaylists(arr);
 })
 .catch(() => { });
 }
 }, [user]);

 const toggleFavorite = (e: React.MouseEvent, trackId: string) => {
 e.preventDefault();
 e.stopPropagation();
 toggleLikeMutation.mutate(trackId);
 };

 const addToPlaylist = async (playlistId: string, trackId: string) => {
 try {
 await api.post(`/playlists/${playlistId}/tracks`, { trackId });
 showToast("Added to playlist!", "success");
 } catch (err: any) {
 showToast(err.response?.data?.message || "Failed to add to playlist", "error");
 }
 };

 useEffect(() => {
 const fetchResults = async () => {
 if (!debouncedQuery) {
 setSearchResults(null);
 setIsSearching(false);
 return;
 }
 setIsSearching(true);
 try {
 const res = await api.get("search", {
 params: { q: debouncedQuery, limit: 15 },
 });
 const data = res.data;
 setSearchResults(data);
 } catch (e) {
 setSearchResults({
 tracks: [],
 artists: [],
 albums: [],
 playlists: [],
 });
 console.error(e);
 } finally {
 setIsSearching(false);
 }
 };
 fetchResults();
 }, [debouncedQuery]);

 return (
 <div className="h-full px-4 md:px-6 flex items-center justify-between gap-6 relative">
 {/* Invisible backdrop for easy dismissal */}
 <AnimatePresence>
 {searchFocused && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => setSearchFocused(false)}
 className="fixed inset-0 z-40"
 />
 )}
 </AnimatePresence>

  <div className="flex items-center gap-4 shrink-0">
 {/* Mobile Left Section */}
 {isMobile && (
 pathname === "/" ? (
 <div className="flex items-center gap-2 group cursor-pointer shrink-0" onClick={() => router.push('/')}>
 <ZenifyLogo size={48} />
 </div>
 ) : (
 <button
 onClick={() => router.back()}
 className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-white/5 text-muted hover:text-foreground active:scale-95 transition-all"
 >
 <ChevronLeft size={20} />
 </button>
 )
 )}



 {/* Sticky Artist Title OR Mini Player - animated swap on scroll */}
 <AnimatePresence mode="wait">
 {stickyPageTitle ? (
 <motion.div
 key="sticky-title"
 initial={{ opacity: 0, y: 24 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 24 }}
 transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
 className="flex items-center shrink-0"
 >
 <span className="text-[14px] md:text-base font-bold font-sans text-white tracking-tight truncate max-w-[240px] drop-shadow-md glass-panel px-4 py-1.5 rounded-full">
 {stickyPageTitle}
 </span>
 </motion.div>
 ) : null}
 </AnimatePresence>
 </div>

 {/* Search Section - Only on Desktop, Mobile has its own tab */}
 {/* Search Section - Hidden on mobile screen widths, visible sm+ */}
 <div
 className={cn(
 "relative group flex-1 max-w-[480px] mx-auto hidden sm:block",
 searchFocused && "z-[9998]",
 )}
 >
 <div
 className="absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors z-10 text-brand"
 >
 <motion.div
 animate={{ 
   rotate: searchFocused ? [0, -10, 10, -5, 5, 0] : 0,
   scale: searchFocused ? [1, 1.2, 1] : 1
 }}
 transition={{ duration: 0.5, ease: "easeInOut" }}
 >
  <Search 
    size={16} 
    className="drop-shadow-sm" 
    style={{
      strokeDasharray: searchFocused ? 100 : 'none',
      strokeDashoffset: searchFocused ? 0 : 100,
      transition: searchFocused ? 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
    }}
  />
 </motion.div>
 </div>
 <input
 type="text"
 placeholder="Search..."
 value={query}
 onFocus={() => setSearchFocused(true)}
 className="w-full glass-panel transition-all border border-white/20 hover:border-white/30 focus:border-white/50 focus:shadow-[0_0_15px_rgba(255,255,255,0.15)] focus:bg-white/10 rounded-full py-2 pl-12 pr-4 text-[13px] outline-none text-white placeholder:text-white/60"
 onChange={(e) => setQuery(e.target.value)}
 />

 {/* Instant Search Results Dropdown */}
 <AnimatePresence>
 {searchFocused && query && (
 <motion.div
 initial={{ opacity: 0, scale: 0.98, y: -10 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.98, y: -10 }}
 transition={{ duration: 0.1, ease: "easeOut" }}
 className="absolute top-[calc(100%+12px)] left-0 w-full rounded-2xl z-[9998] overflow-visible flex flex-col max-h-[80vh] glass-panel search-container"
 onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking inside
 >
 {/* Filter Bar */}
 <div className="flex gap-2 p-4 pt-3 border-b border-white/5 no-scrollbar overflow-x-auto overflow-y-hidden whitespace-nowrap scroll-smooth flex-shrink-0">
 {["all", "songs", "artists", "albums", "playlists"].map((f) => (
 <button
 key={f}
 onClick={(e) => { e.stopPropagation(); setActiveFilter(f); }}
 className={cn(
 "px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all",
 activeFilter === f
 ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.4)]"
 : "bg-white/5 text-muted hover:bg-white/10 hover:text-white",
 )}
 >
 {f}
 </button>
 ))}
 </div>

 <div className="flex-1 overflow-y-auto overflow-x-visible max-h-[60vh] custom-scrollbar">
 {isSearching ? (
 <div className="flex flex-col items-center justify-center py-20 gap-4">
 <div className="w-10 h-10 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
 <p className="text-xs text-muted font-bold tracking-widest uppercase animate-pulse">Searching...</p>
 </div>
 ) : searchResults ? (
 <>
  {(() => {
  const itemsToRender = [
  ...(activeFilter === "all" || activeFilter === "songs"
  ? searchResults.tracks || []
  : []),
  ...(activeFilter === "all" || activeFilter === "artists"
  ? (searchResults.artists || []).map((a: any) => ({
  ...a,
  isArtist: true,
  }))
  : []),
  ...(activeFilter === "all" || activeFilter === "albums"
  ? (searchResults.albums || []).map((ab: any) => ({
  ...ab,
  isAlbum: true,
  }))
  : []),
  ...(activeFilter === "all" || activeFilter === "playlists"
  ? (searchResults.playlists || []).map((p: any) => ({
  ...p,
  isPlaylist: true,
  }))
  : []),
  ];

  return (
  <div className="flex flex-col gap-1 p-2 pb-4">
  {itemsToRender.map((item: any, index: number) => {
  const isSelected = false;
  if (item.isArtist) {
  return (
  <div
 key={item.id}
 className="group/artist flex items-center gap-3 p-2 px-3 transition-colors border-b border-white/5 last:border-0"
 >
 <div 
 onMouseDown={(e) => {
 e.preventDefault();
 router.push(`/artist/${item.id}`);
 setSearchFocused(false);
 setQuery("");
 }}
 className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-white/5 shadow-sm cursor-pointer hover:shadow-md transition-all hover:scale-105"
 >
 <ArtistPortrait 
 imageUrl={item.imageUrl}
 name={item.name}
 className="w-full h-full"
 size={100}
 />
 </div>
 <div className="flex-1 flex flex-col min-w-0 justify-center">
 <div 
 onMouseDown={(e) => {
 e.preventDefault();
 router.push(`/artist/${item.id}`);
 setSearchFocused(false);
 setQuery("");
 }}
 className="font-bold text-[13px] text-white/90 hover:text-white hover:underline cursor-pointer transition-colors w-fit truncate"
 >
 {item.name}
 </div>
 <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest opacity-60">
 Artist
 </div>
 </div>
  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover/artist:opacity-100 transition-opacity ml-2">
  <AnimatedDropdown
  onOpenChange={setIsMenuOpen}
  align="end"
  contentClassName="z-[9999]"
  onCloseAutoFocus={(e) => e.preventDefault()}
  onInteractOutside={(e) => {
  const isSearchContainer = (e.target as Element).closest(".search-container");
  if (isSearchContainer) { e.preventDefault(); }
  }}
  trigger={
  <button className="p-2 text-muted hover:text-foreground transition-colors outline-none bg-transparent">
  <MoreHorizontal size={14} />
  </button>
  }
  items={[
  {
  id: 'go-artist',
  icon: <UserIcon size={14} className="opacity-70" />,
  label: "Go to Artist",
  onClick: () => { router.push(`/artist/${item.id}`); setSearchFocused(false); setQuery(""); }
  },
  {
  id: 'share',
  icon: <Share2 size={14} className="opacity-70" />,
  label: "Copy Link",
  onClick: () => { navigator.clipboard.writeText(`${window.location.origin}/#/artist/${item.id}`); }
  }
  ]}
  />
  </div>
 </div>
  );
  }

  if (item.isAlbum || item.isPlaylist) {
  return (
  <div
 key={item.id}
 className="group/meta flex items-center gap-3 p-2 px-3 transition-colors border-b border-white/5 last:border-0"
 >
 <div 
 onMouseDown={(e) => {
 e.preventDefault();
 router.push(`/${item.isAlbum ? "album" : "playlist"}/${item.id}`);
 setSearchFocused(false);
 setQuery("");
 }}
 className="w-10 h-10 rounded-md bg-zinc-800 overflow-hidden shrink-0 border border-white/5 shadow-sm cursor-pointer hover:shadow-md transition-all hover:scale-105 relative"
 >
 <img
 src={getMediaUrl(item.coverUrl) || `/logo.png`}
 className="w-full h-full object-cover"
 alt={item.title || item.name}
 />
 </div>
 <div className="flex-1 min-w-0 flex flex-col justify-center">
 <div 
 onMouseDown={(e) => {
 e.preventDefault();
 router.push(`/${item.isAlbum ? "album" : "playlist"}/${item.id}`);
 setSearchFocused(false);
 setQuery("");
 }}
 className="text-[14px] font-sans font-bold truncate text-white/90 hover:text-white hover:underline cursor-pointer transition-colors w-fit"
 >
 {item.title || item.name}
 </div>
 <div className="text-[10px] text-white/50 truncate lowercase tracking-tight">
 {item.isAlbum ? "Album" : "Playlist"} •{" "}
 {item.artist?.id ? (
 <span 
 onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/artist/${item.artist.id}`); setSearchFocused(false); }}
 className="hover:text-brand hover:underline cursor-pointer transition-colors"
 >
 {item.artist.name}
 </span>
 ) : (
 <span>{item.artist?.name || `${item.follower_count || 0} followers`}</span>
 )}
 </div>
 </div>
  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover/meta:opacity-100 transition-opacity ml-2">
  <AnimatedDropdown
  onOpenChange={setIsMenuOpen}
  align="end"
  contentClassName="z-[9999]"
  onCloseAutoFocus={(e) => e.preventDefault()}
  onInteractOutside={(e) => {
  const isSearchContainer = (e.target as Element).closest(".search-container");
  if (isSearchContainer) { e.preventDefault(); }
  }}
  trigger={
  <button className="p-2 text-muted hover:text-foreground transition-colors outline-none bg-transparent">
  <MoreHorizontal size={14} />
  </button>
  }
  items={[
  {
  id: 'go-page',
  icon: item.isAlbum ? <Disc size={14} className="opacity-70" /> : <ListMusic size={14} className="opacity-70" />,
  label: `Go to ${item.isAlbum ? "Album" : "Playlist"}`,
  onClick: () => { router.push(`/${item.isAlbum ? "album" : "playlist"}/${item.id}`); setSearchFocused(false); setQuery(""); }
  },
  {
  id: 'share',
  icon: <Share2 size={14} className="opacity-70" />,
  label: "Copy Link",
  onClick: () => { navigator.clipboard.writeText(`${window.location.origin}/#/${item.isAlbum ? "album" : "playlist"}/${item.id}`); }
  }
  ]}
  />
  </div>
 </div>
  );
  }

  return (
  <div
 key={item.id}
 className="group/item flex items-center gap-3 p-2 px-3 transition-colors border-b border-white/5 last:border-0"
 >
 <div 
 onMouseDown={(e) => {
 e.preventDefault();
 const { setTrack } = usePlayerStore.getState();
 setTrack(item);
 useUIStore.getState().setPlayerMinimized(false);
 useUIStore.getState().setFullScreenPlayerOpen(true);
 setSearchFocused(false);
 }}
 className="w-10 h-10 rounded-md bg-zinc-800 overflow-hidden shrink-0 shadow-sm border border-white/5 cursor-pointer relative hover:scale-105 transition-all group/cover"
 >
 <img
 src={getTrackCover(item)}
 className="w-full h-full object-cover"
 alt={item.title}
 />
 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
 <Play size={16} className="text-white fill-current ml-0.5" />
 </div>
 </div>
 <div className="flex-1 min-w-0 flex flex-col justify-center">
 <div 
 onMouseDown={(e) => {
 e.preventDefault();
 router.push(`/track/${item.id}`);
 setSearchFocused(false);
 }}
 className="text-[14px] font-sans font-bold truncate text-white/90 hover:text-white hover:underline cursor-pointer transition-colors w-fit"
 >
 {item.title}
 </div>
 <div className="text-[10px] text-white/50 truncate leading-relaxed">
 {item.artist?.id ? (
 <span 
 onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/artist/${item.artist.id}`); setSearchFocused(false); }}
 className="hover:text-brand hover:underline cursor-pointer transition-colors"
 >
 {item.artist.name}
 </span>
 ) : (
 <span>{item.artist?.name || 'Unknown Artist'}</span>
 )}
  • {item.genre || 'Song'}
 </div>
 </div>

 <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover/item:opacity-100 transition-opacity">
 <button
 className="p-2 outline-none bg-transparent"
 onMouseDown={(e) => {
 e.preventDefault();
 e.stopPropagation();
 toggleFavorite(e as any, item.id);
 }}
 >
 <motion.div
 whileTap={{ scale: 0.7 }}
 animate={{ scale: likedTrackIds.includes(item.id) ? [1, 1.4, 1] : 1 }}
 transition={{ duration: 0.35, ease: "easeOut" }}
 className={cn(
 likedTrackIds.includes(item.id)
 ? "text-brand"
 : "text-muted hover:text-brand"
 )}
 >
 <Heart
 size={14}
 className={cn(likedTrackIds.includes(item.id) && "fill-current")}
 />
 </motion.div>
 </button>

 <AnimatedDropdown
 onOpenChange={setIsMenuOpen}
 align="end"
 contentClassName="z-[9999]"
 onCloseAutoFocus={(e) => e.preventDefault()}
 onInteractOutside={(e) => {
 const isSearchContainer = (
 e.target as Element
 ).closest(".search-container");
 if (isSearchContainer) {
 e.preventDefault();
 }
 }}
 trigger={
 <button className="p-2 text-muted hover:text-foreground transition-colors outline-none bg-transparent">
 <MoreHorizontal size={14} />
 </button>
 }
 items={[
 {
 id: 'favorite',
 icon: <Heart size={14} className={likedTrackIds.includes(item.id) ? "fill-current text-[#EF4444]" : "opacity-70"} />,
 label: likedTrackIds.includes(item.id) ? "Liked" : "Add to Favorites",
 onClick: (e) => toggleFavorite(e as any, item.id)
 },
 {
 id: 'playlist',
 icon: <Plus size={14} className="opacity-70" />,
 label: "Add to Playlist",
 subMenu: [
  ...(Array.isArray(playlists) ? playlists : []).map((p: any) => ({
  id: `playlist-${p.id}`,
  label: p.name,
  onClick: () => addToPlaylist(p.id, item.id)
  })),
  {
  id: 'create-inline',
  isSeparator: (playlists?.length || 0) > 0
  },
  {
  id: 'create-inline-content',
  content: <InlinePlaylistCreator trackId={item.id} onSuccess={() => showToast("Created & Added!", "success")} />
  }
  ].filter(item => !(item as any).isSeparator || ((item as any).isSeparator && (playlists?.length || 0) > 0))
 },
 { id: 'sep1', isSeparator: true },
 {
 id: 'download',
 icon: <Download size={14} className="opacity-70" />,
 label: "Download Track",
 onClick: () => window.open(item.audioUrl, "_blank")
 }
 ]}
 />
 </div>
 </div>
  );
  })}
  </div>
  );
  })()}

 {((activeFilter === "all" &&
 !searchResults.tracks?.length &&
 !searchResults.artists?.length &&
 !searchResults.albums?.length &&
 !searchResults.playlists?.length) ||
 (activeFilter === "songs" && !searchResults.tracks?.length) ||
 (activeFilter === "artists" && !searchResults.artists?.length) ||
 (activeFilter === "albums" && !searchResults.albums?.length) ||
 (activeFilter === "playlists" && !searchResults.playlists?.length)) && (
 <div className="p-6 text-center bg-white/[0.02] m-3 rounded-2xl border border-white/5">
 <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
 <Search size={20} className="text-white/20" />
 </div>
 <h3 className="text-[13px] font-bold text-white mb-1">
 No results found
 </h3>
 <p className="text-[11px] text-muted max-w-[180px] mx-auto">
 We couldn't find any results for "{query}"
 </p>
 </div>
 )}
 </>
 ) : query ? (
 <div className="flex flex-col items-center justify-center py-8 gap-3 grayscale opacity-30 text-center px-8">
 <Search size={24} className="text-muted" strokeWidth={1.5} />
 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Thinking...</p>
 <p className="text-[11px] text-muted/50 mt-1 font-medium">Querying the <span className="font-zenify">zenify</span> neural archives for "{query}"</p>
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center py-8 gap-3 grayscale opacity-40">
 <Search size={32} className="text-muted" />
 <p className="text-[11px] font-black uppercase tracking-widest text-muted">Type to search</p>
 </div>
 )}
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>

 {/* User Controls with About & Pricing integrated */}
 <div className="flex flex-1 justify-end items-center gap-2 md:gap-4 shrink-0">
  {isMobile ? (
    <AnimatedDropdown
      align="end"
      contentClassName="w-56 mt-2 z-[9999] bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl"
      trigger={
        <button className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden hover:bg-white/10 active:scale-95 transition-all shadow-xl backdrop-blur-md relative outline-none">
          {user?.avatarUrl ? (
            <img src={getMediaUrl(user.avatarUrl)} className="w-full h-full object-cover" alt="Profile" />
          ) : (
            <UserIcon size={16} className="text-zinc-400" />
          )}
          {useNotificationStore.getState().unreadCount > 0 && (
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-brand rounded-full border border-black" />
          )}
        </button>
      }
      items={[
        { id: 'profile', label: 'Profile', icon: <UserIcon size={16} />, onClick: () => router.push('/profile') },
        { id: 'notifications', label: 'Notifications', icon: (
          <div className="relative">
            <Bell size={16} />
            {useNotificationStore.getState().unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-brand rounded-full border border-black" />
            )}
          </div>
        ), onClick: () => router.push('/notifications') },
        { id: 'settings', label: 'Settings', icon: <Settings size={16} />, onClick: () => router.push('/settings') },
        { id: 'about-creator', label: 'About Creator', icon: <Info size={16} />, onClick: () => router.push('/about') },
        { id: 'about-zenify', label: 'About Zenify', icon: <Sparkles size={16} className="text-white" />, onClick: () => router.push('/about-zenify') },
        { id: 'upgrade-pro', label: 'Upgrade Pro', icon: <Sparkles size={16} className="text-brand" />, onClick: () => router.push('/pricing') }
      ]}
    />
  ) : (
    <>
      {/* Global Apple Music Search Trigger */}
      <button 
        onClick={() => setIsGlobalSearchOpen(true)}
        className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-brand active:scale-95 transition-all shadow-sm"
        title="Global Search (Cmd+K)"
      >
        <Sparkles size={16} />
      </button>

      <ProfileCircleMenu
    triggerContent={
    <>
    {user?.avatarUrl ? (
    <img src={getMediaUrl(user.avatarUrl)} className="w-full h-full object-cover" alt="Profile" />
    ) : (
    <UserIcon size={16} className="text-zinc-400" />
    )}
    {useNotificationStore.getState().unreadCount > 0 && (
    <span className="absolute top-0 right-0 w-2 h-2 bg-brand rounded-full border border-zinc-950" />
    )}
    </>
    }
    items={[
    {
    label: 'Profile',
    icon: <UserIcon size={18} />,
    onClick: () => router.push('/profile')
    },
    {
    label: 'Notifications',
    icon: (
    <div className="relative">
    <Bell size={18} />
    {useNotificationStore.getState().unreadCount > 0 && (
    <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand rounded-full border border-black" />
    )}
    </div>
    ),
    onClick: () => router.push('/notifications')
    },
    {
    label: 'Settings',
    icon: <Settings size={18} />,
    onClick: () => router.push('/settings')
    },
    {
    label: 'About Creator',
    icon: <Info size={18} />,
    onClick: () => router.push('/about')
    },
    {
    label: 'About Zenify',
    icon: <Sparkles size={18} className="text-white" />,
    onClick: () => router.push('/about-zenify')
    },
    {
    label: 'Upgrade Pro',
    icon: <Sparkles size={18} className="text-brand" />,
    onClick: () => router.push('/pricing')
    }
    ]}
   />
  )}
 </div>

 <GlobalSearchModal isOpen={isGlobalSearchOpen} onClose={() => setIsGlobalSearchOpen(false)} />

 {/* Toast System */}
 <AnimatePresence>
 {toast && (
 <motion.div
 initial={{ opacity: 0, x: 50, scale: 0.95 }}
 animate={{ opacity: 1, x: 0, scale: 1 }}
 exit={{ opacity: 0, x: 20, scale: 0.95 }}
 className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl border backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[9999] min-w-[280px] ${toast.type === 'error'
 ? 'bg-red-500/10 border-red-500/20 text-red-400'
 : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
 }`}
 >
 <div className={`p-2 rounded-full ${toast.type === 'error' ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
 {toast.type === 'success' ? (
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
 ) : (
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
 )}
 </div>
 <div className="flex flex-col">
 <span className="text-[14px] font-bold tracking-tight text-white">{toast.type === 'success' ? 'Success' : 'Error'}</span>
 <span className="text-[12px] opacity-80 font-medium">{toast.msg}</span>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
}
