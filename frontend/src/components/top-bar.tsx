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
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import AnimatedList from "@/components/shared/AnimatedList";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const [debouncedQuery] = useDebounce(query, 300);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Favorites state (React Query for instant optimistic updates)
  const queryClient = useQueryClient();
  const { data: likedTrackIds = [] } = useQuery({
    queryKey: ['liked-track-ids'],
    queryFn: async () => {
      const res = await api.get('tracks/liked');
      return (res.data as any[]).map((t: any) => t.id);
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
        .then((res) => setPlaylists(res.data))
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
              <ZenifyLogo size={32} />
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

        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="btn-icon text-muted hover:text-foreground"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => router.forward()}
            className="btn-icon text-muted hover:text-foreground"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Mini Player Controls - Hidden on mobile as there's MobilePlayerBar */}
        {!isMobile && currentTrack && (
          <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-900/60 rounded-full border border-white/10 shadow-2xl transition-all duration-300 select-none">
            <div
              onClick={() => useUIStore.getState().setFullScreenPlayerOpen(true)}
              className="w-7 h-7 rounded-md bg-zinc-800 overflow-hidden shrink-0 border border-white/10 shadow-lg cursor-pointer hover:scale-105 transition-transform"
            >
              <motion.img
                layoutId={`artwork-${currentTrack.id}`}
                src={getTrackCover(currentTrack)}
                className="w-full h-full object-cover"
                alt={currentTrack.title}
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); playPrev(); }}
                className="text-brand hover:scale-110 transition-all p-0.5 shrink-0"
              >
                <SkipBack size={13} fill="currentColor" strokeWidth={0} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="w-7 h-7 shrink-0 flex items-center justify-center transition-all text-brand hover:scale-110 active:scale-95"
              >
                {isPlaying ? (
                  <Pause size={14} fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play size={14} fill="currentColor" strokeWidth={0} />
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); playNext(); }}
                className="text-brand hover:scale-110 transition-all p-0.5 shrink-0"
              >
                <SkipForward size={13} fill="currentColor" strokeWidth={0} />
              </button>
            </div>
            <div className="h-4 w-px bg-white/10 mx-0.5" />
            <div className="flex flex-col max-w-[140px] pr-1 text-left select-none overflow-visible">
              <span 
                onClick={(e) => { e.stopPropagation(); router.push(`/track/${currentTrack.id}`); }}
                className="text-[11px] font-bold truncate text-foreground hover:text-brand cursor-pointer transition-colors block leading-tight"
              >
                {currentTrack.title}
              </span>
              {currentTrack.artist?.id ? (
                <span 
                  onClick={(e) => { e.stopPropagation(); router.push(`/artist/${currentTrack.artist.id}`); }}
                  className="text-[9px] text-zinc-500 truncate font-medium hover:text-brand cursor-pointer transition-colors block leading-tight"
                >
                  {currentTrack.artist?.name || 'Unknown Artist'}
                </span>
              ) : (
                <span className="text-[9px] text-zinc-500 truncate font-medium block leading-tight">
                  {currentTrack.artist?.name || 'Unknown Artist'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search Section - Only on Desktop, Mobile has its own tab */}
      {/* Search Section - Hidden on mobile screen widths, visible sm+ */}
      <div
        className={cn(
          "relative group w-full max-w-[480px] mx-auto hidden sm:block",
          searchFocused && "z-50",
        )}
      >
          <div
            className={cn(
              "absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors",
              searchFocused ? "text-brand" : "text-muted",
            )}
          >
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={query}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              setTimeout(() => {
                if (!isMenuOpen) setSearchFocused(false);
              }, 200);
            }}
            className="w-full bg-zinc-900/60 hover:bg-zinc-800/80 transition-all focus:bg-zinc-800 focus:shadow-glow rounded-full py-2 pl-12 pr-4 text-[13px] outline-none border border-white/5 focus:border-white/10"
            onChange={(e) => setQuery(e.target.value)}
          />

          {/* Instant Search Results Dropdown */}
          <AnimatePresence>
            {searchFocused && query && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute top-[calc(100%+8px)] left-0 w-full border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh] backdrop-blur-3xl"
                style={{
                  background: "rgba(10, 10, 10, 0.45)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                }}
                onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking inside
              >
                {/* Filter Bar */}
                <div className="flex gap-2 p-4 pt-2 border-b border-white/5 no-scrollbar overflow-x-auto overflow-y-hidden whitespace-nowrap scroll-smooth flex-shrink-0">
                  {["all", "songs", "artists", "albums", "playlists"].map((f) => (
                    <button
                      key={f}
                      onClick={(e) => { e.stopPropagation(); setActiveFilter(f); }}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all",
                        activeFilter === f
                          ? "bg-brand text-black"
                          : "bg-white/5 text-muted hover:bg-white/10 hover:text-white",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-hidden overflow-y-auto custom-scrollbar">
                  {isSearching ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                      <div className="w-10 h-10 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
                      <p className="text-xs text-muted font-bold tracking-widest uppercase animate-pulse">Searching...</p>
                    </div>
                  ) : searchResults ? (
                    <>
                      <AnimatedList
                        key={`${debouncedQuery}-${activeFilter}`}
                        items={[
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
                        ]}
                        animationVariant="fade"
                        triggerOnce={true}
                        displayScrollbar={true}
                        showGradients={true}
                        renderItem={(
                          item: any,
                          index: number,
                          isSelected: boolean,
                        ) => {
                          if (item.isArtist) {
                            return (
                              <div
                                key={item.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/artist/${item.id}`);
                                  setSearchFocused(false);
                                  setQuery("");
                                }}
                                className={cn(
                                  "group/artist flex items-center gap-2 p-1.5 px-2 rounded-lg transition-all cursor-pointer",
                                  isSelected ? "bg-white/10" : "hover:bg-white/5",
                                )}
                              >
                                <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-white/5 shadow-sm">
                                  <ArtistPortrait 
                                    imageUrl={item.imageUrl}
                                    name={item.name}
                                    className="w-full h-full"
                                    size={100}
                                  />
                                </div>
                                <div className="flex-1 font-bold text-[12px] text-white/90 group-hover/artist:text-white">
                                  {item.name}
                                </div>
                                <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest mr-2 opacity-60">
                                  Artist
                                </div>
                              </div>
                            );
                          }

                          if (item.isAlbum || item.isPlaylist) {
                            return (
                              <div
                                key={item.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(
                                    `/${item.isAlbum ? "album" : "playlist"}/${item.id}`,
                                  );
                                  setSearchFocused(false);
                                  setQuery("");
                                }}
                                className={cn(
                                  "group/meta flex items-center gap-2 p-1.5 px-2 rounded-lg transition-all cursor-pointer",
                                  isSelected ? "bg-white/10" : "hover:bg-white/5",
                                )}
                              >
                                <div className="w-8 h-8 rounded-md bg-zinc-800 overflow-hidden shrink-0 border border-white/5 shadow-sm">
                                  <img
                                    src={getMediaUrl(item.coverUrl) || `/logo.png`}
                                    className="w-full h-full object-cover"
                                    alt={item.title || item.name}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[12px] font-bold truncate text-white/90 group-hover/meta:text-white">
                                    {item.title || item.name}
                                  </div>
                                  <div className="text-[9px] text-white/50 truncate lowercase tracking-tight">
                                    {item.isAlbum ? "Album" : "Playlist"} •{" "}
                                    {item.artist?.name ||
                                      `${item.follower_count || 0} followers`}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={item.id}
                              className={cn(
                                "group/item flex items-center gap-2 p-1.5 px-2 rounded-lg cursor-pointer hover:bg-white/5 active:bg-white/10",
                                isSelected ? "bg-white/10" : "",
                              )}
                              onClick={() => {
                                const { setTrack } = usePlayerStore.getState();
                                setTrack(item);
                                useUIStore.getState().setPlayerMinimized(false);
                              }}
                            >
                              <div className="w-8 h-8 rounded-md bg-zinc-800 overflow-hidden shrink-0 shadow-sm border border-white/5">
                                <img
                                  src={getTrackCover(item)}
                                  className="w-full h-full object-cover"
                                  alt={item.title}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-bold truncate text-white/90 group-hover/item:text-white">
                                  {item.title}
                                </div>
                                <div className="text-[9px] text-white/50 truncate leading-relaxed">
                                  {item.artist?.name || 'Unknown Artist'} • {item.genre || 'Song'}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <button
                                  className="p-2 outline-none bg-transparent"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => toggleFavorite(e, item.id)}
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

                                <DropdownMenu onOpenChange={setIsMenuOpen}>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="p-2 text-muted hover:text-foreground transition-colors"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                    >
                                      <MoreHorizontal size={14} />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    className="w-52"
                                    align="end"
                                    onCloseAutoFocus={(e) => e.preventDefault()}
                                    onInteractOutside={(e) => {
                                      const isSearchContainer = (
                                        e.target as Element
                                      ).closest(".search-container");
                                      if (isSearchContainer) {
                                        e.preventDefault();
                                      }
                                    }}
                                  >
                                    <DropdownMenuItem
                                      onClick={(e) =>
                                        toggleFavorite(e as any, item.id)
                                      }
                                      className="gap-3 cursor-pointer"
                                    >
                                      <motion.div
                                        animate={{ scale: likedTrackIds.includes(item.id) ? [1, 1.3, 1] : 1 }}
                                        transition={{ duration: 0.3 }}
                                      >
                                        <Heart
                                          size={14}
                                          className={
                                            likedTrackIds.includes(item.id)
                                              ? "fill-current text-brand"
                                              : "opacity-70"
                                          }
                                        />
                                      </motion.div>
                                      <span>
                                        {likedTrackIds.includes(item.id)
                                          ? "Liked"
                                          : "Add to Favorites"}
                                      </span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>
                                        <Plus size={14} className="opacity-70" />{" "}
                                        <span>Add to Playlist</span>
                                      </DropdownMenuSubTrigger>
                                      <DropdownMenuPortal>
                                        <DropdownMenuSubContent className="w-48 ml-1">
                                          {playlists.map((p: any) => (
                                            <DropdownMenuItem
                                              key={p.id}
                                              onClick={() =>
                                                addToPlaylist(p.id, item.id)
                                              }
                                            >
                                              {p.name}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuPortal>
                                    </DropdownMenuSub>
                                    <DropdownMenuSeparator className="bg-white/10" />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        window.open(item.audioUrl, "_blank")
                                      }
                                    >
                                      <Download size={14} className="opacity-70" />{" "}
                                      <span>Download Track</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          );
                        }}
                      />

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
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push("/about")}
            className="px-2 md:px-3 py-2 text-muted hover:text-brand text-[10px] font-black tracking-[0.1em] transition-all uppercase"
          >
            ABOUT
          </button>

          {!isMobile && (
            <button
              onClick={() => router.push("/pricing")}
              className="flex items-center gap-2 px-3 py-2 text-muted hover:text-brand text-[10px] font-bold tracking-[0.1em] transition-all uppercase group"
            >
              <Sparkles size={10} className="group-hover:text-brand transition-colors" />
              UPGRADE
            </button>
          )}
        </div>

        {!isMobile && <div className="hidden md:block h-4 w-px bg-white/10 mx-1" />}

        <button className="btn-icon text-muted hover:text-foreground relative">
          <Bell size={18} />
        </button>

        <button
          onClick={() => router.push("/settings")}
          className="btn-icon text-muted hover:text-foreground"
        >
          <Settings size={18} />
        </button>

        <button
          onClick={() => router.push("/profile")}
          className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden"
        >
          {user?.avatarUrl ? (
            <img src={getMediaUrl(user.avatarUrl)} className="w-full h-full object-cover" alt="" />
          ) : (
            <UserIcon size={16} className="text-zinc-400" />
          )}
        </button>
      </div>

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
