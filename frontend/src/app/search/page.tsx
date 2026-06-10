"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Search as SearchIcon,
  Music,
  ChevronRight,
  Sparkles,
  Play,
  Pause,
  Clock,
  Heart,
  MoreHorizontal,
  Download,
  Flame,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { useDebounce } from "use-debounce";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { MediaCard } from "@/components/shared/MediaCard";
import Link from "next/link";
import { cn, getMediaUrl, getTrackCover } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const GENRES = [
  { name: "Tamil Popular", color: "bg-brand", image: "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?q=80&w=200" },
  { name: "Kollywood", color: "bg-blue-600", image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=200" },
  { name: "Devotional", color: "bg-orange-500", image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=200" },
  { name: "Folk & Tribal", color: "bg-emerald-600", image: "https://images.unsplash.com/photo-1459749411177-04218006d396?q=80&w=200" },
  { name: "Hip-Hop", color: "bg-purple-600", image: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=200" },
  { name: "Acoustic", color: "bg-zinc-600", image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=200" },
];

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [debouncedQuery] = useDebounce(query, 400);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { isAuthenticated } = useAuthStore();
  const { setTrack, setQueue } = usePlayerStore();
  const { setPlayerMinimized, openDownloadModal } = useUIStore();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isSmartSearching, setIsSmartSearching] = useState(false);

  // Liked track IDs for heart UI
  const { data: likedTrackIds } = useQuery({
    queryKey: ['liked-track-ids'],
    queryFn: async () => {
      const res = await api.get('tracks/liked');
      return (res.data as Track[]).map((tr) => tr.id);
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated,
  });

  const toggleLike = (trackId: string) => {
    api.post(`tracks/${trackId}/like`).then(() => {
      queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
      queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
    });
  };

  // Sync state with URL params
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
    }
  }, [searchParams]);

  // Live Suggestions Query
  const { data: results, isLoading } = useQuery({
    queryKey: ["search-live", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return null;
      const res = await api.get("search", {
        params: { q: debouncedQuery, limit: 12 },
      });
      return res.data;
    },
    enabled: !!debouncedQuery,
    staleTime: 1000 * 30,
  });

  // Smart Search (AI) Query
  const { data: smartResults, isLoading: isSmartLoading } = useQuery({
    queryKey: ["search-smart", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || !isSmartSearching) return null;
      const res = await api.get("search/smart", {
        params: { q: debouncedQuery },
      });
      return res.data;
    },
    enabled: !!debouncedQuery && isSmartSearching,
  });

  // Discovery Home Data (Categorized & Ranked)
  const { data: homeData, isLoading: isHomeLoading } = useQuery({
    queryKey: ["search-home"],
    queryFn: async () => {
      const res = await api.get("search/home");
      return res.data;
    },
    enabled: !debouncedQuery && isAuthenticated,
  });

  // Normalize tracks from raw SQL results (artist comes as a JSON object, not nested)
  const normalizeTrack = (t: any) => {
    if (!t) return t;
    return {
      ...t,
      artist: t.artist && typeof t.artist === 'object'
        ? t.artist
        : { name: t.artist || "Unknown Artist", imageUrl: null },
    };
  };

  // Only show a section if the track has a real title AND a real artist name
  const isValidTrack = (t: any) => {
    if (!t || !t.id || !t.title) return false;
    const artist = t.artist;
    const name = artist?.name;
    return !!name && name !== "Unknown Artist";
  };


  const flatResults = React.useMemo(() => {
    if (!results) return [];
    const items = [];
    if (results.tracks?.length)
      items.push(
        ...results.tracks
          .slice(0, 5)
          .map((t: any) => ({ ...t, type: "track" })),
      );
    if (results.artists?.length)
      items.push(
        ...results.artists
          .slice(0, 5)
          .map((a: any) => ({ ...a, type: "artist" })),
      );
    if (results.albums?.length)
      items.push(
        ...results.albums
          .slice(0, 5)
          .map((al: any) => ({ ...al, type: "album" })),
      );
    return items;
  }, [results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      const item = flatResults[activeIndex];
      if (item.type === "track") {
        setTrack(item);
        setPlayerMinimized(false);
      } else {
        router.push(
          `/${item.type === "artist" ? "artist" : "album"}/${item.id}`,
        );
      }
    } else if (e.key === "Escape") {
      setQuery("");
      setActiveIndex(-1);
    }
  };

  const TopRankCard = ({
    track,
    stats,
  }: any) => {
    const { currentTrack, setTrack, isPlaying } = usePlayerStore();

    if (!track) return null;

    const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
    const mins = Math.floor((track.duration || 0) / 60);
    const secs = (track.duration || 0) % 60;
    const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    return (
        <div
          onClick={() => setTrack(track)}
          className="group flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer overflow-hidden h-14"
        >
          <div className="shrink-0 w-10 h-10 rounded shadow bg-zinc-800 overflow-hidden relative">
            <img
              src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100"}
              className="w-full h-full object-cover"
              alt={track.title}
            />
            {isTrackPlaying && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="flex items-end gap-[1.5px] h-3">
                        {[0.1, 0.4, 0.2, 0.5].map((d, i) => (
                            <motion.div
                                key={i}
                                animate={{ height: ["30%", "100%", "30%"] }}
                                transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
                                className="w-[2px] bg-red-500 rounded-full"
                            />
                        ))}
                    </div>
                </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p 
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/track/${track.id}`);
              }}
              className={cn("text-xs font-bold truncate leading-tight cursor-pointer hover:underline hover:text-brand transition-colors", isTrackPlaying ? "text-brand" : "text-white/90")}
            >
              {track.title}
            </p>
            <p className="text-[10px] text-muted font-medium truncate mt-0.5">
              {track.artist?.name || "Unknown Artist"}
            </p>
          </div>

          <div className="text-right shrink-0">
            {stats && (
              <p className="text-[9px] font-bold text-emerald-400 mb-0.5 opacity-80">
                {stats}
              </p>
            )}
            <p className="text-[10px] text-white/40 font-bold tabular-nums">
              {durationStr}
            </p>
          </div>
        </div>
    );
  };

  const topResult = React.useMemo(() => {
    if (!results) return null;

    // Fulfill user request: Prioritize artist profile if search query matches an artist
    if (results.artists?.[0]) {
      const q = debouncedQuery.toLowerCase().trim();
      const aName = results.artists[0].name.toLowerCase();
      // If the artist name starts with the query, or is a very strong match
      if (aName.includes(q) || q.includes(aName)) {
        return { item: results.artists[0], type: 'artist' };
      }
    }

    if (results.tracks?.[0]) {
      return { item: results.tracks[0], type: 'track' };
    }

    // Fallback if neither track nor perfect artist match, but artist exists
    if (results.artists?.[0]) {
      return { item: results.artists[0], type: 'artist' };
    }

    return null;
  }, [results, debouncedQuery]);

  return (
    <div className="min-h-screen bg-[#09090b] pb-40">
      <div className="px-6 md:px-12 py-10 md:py-12 max-w-[1400px] mx-auto">
        {!isMobile && (
          <div className="mb-14 relative group/search">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-muted group-focus-within/search:text-brand transition-colors">
              <SearchIcon size={20} />
            </div>
            <input
              type="text"
              placeholder="Search for songs, artists, moods..."
              value={query}
              onChange={(e) => {
                  setQuery(e.target.value);
                  setIsSmartSearching(false); // Reset smart mode on new typing
              }}
              onKeyDown={handleKeyDown}
              className="w-full bg-[#121214] border border-white/5 rounded-[2rem] py-5 pl-16 pr-24 text-base text-foreground placeholder:text-muted/60 outline-none focus:border-brand/30 focus:bg-white/[0.01] shadow-2xl transition-all font-medium"
            />
            <div className="absolute inset-y-0 right-4 flex items-center gap-2">
                {query && (
                  <button
                    onClick={() => { setQuery(""); setIsSmartSearching(false); }}
                    className="p-2 text-muted hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                )}
                <button
                    onClick={() => setIsSmartSearching(!isSmartSearching)}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full border transition-all",
                        isSmartSearching 
                            ? "bg-brand/20 border-brand/40 text-brand shadow-[0_0_20px_rgba(var(--accent-brand-rgb),0.2)]" 
                            : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                    )}
                >
                    <Sparkles size={14} className={cn(isSmartSearching && "animate-pulse")} />
                    <span className="text-[10px] font-black uppercase tracking-widest">AI Search</span>
                </button>
            </div>
          </div>
        )}

        {isMobile && (
          <div className="mb-10 relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-muted">
              <SearchIcon size={18} />
            </div>
            <input
              type="text"
              placeholder="Search for anything..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsSmartSearching(false);
              }}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand/50 focus:bg-brand/[0.02] shadow-xl transition-all"
            />
            <div className="absolute inset-y-0 right-4 flex items-center gap-2">
                <button
                    onClick={() => setIsSmartSearching(!isSmartSearching)}
                    className={cn(
                        "p-2 rounded-lg transition-all",
                        isSmartSearching ? "bg-brand/20 text-brand" : "text-white/20"
                    )}
                >
                    <Sparkles size={16} />
                </button>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!debouncedQuery && isHomeLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-16 animate-pulse"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-28 rounded-2xl bg-white/[0.03] border border-white/5" />
                ))}
              </div>
              <div className="space-y-8">
                <div className="h-6 w-40 bg-white/[0.03] rounded" />
                <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="aspect-square rounded-2xl bg-white/[0.03]" />
                  ))}
                </div>
              </div>
              <div className="space-y-8">
                <div className="h-6 w-48 bg-white/[0.03] rounded" />
                <div className="grid grid-cols-4 md:grid-cols-7 gap-8">
                  {[1, 2, 3, 4, 5, 6, 7].map(i => (
                    <div key={i} className="flex flex-col items-center gap-4">
                      <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-white/[0.03]" />
                      <div className="h-4 w-20 bg-white/[0.03] rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {!debouncedQuery && homeData && !isHomeLoading && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-24"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Top Day Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
                      <Sparkles size={14} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-[11px] font-bold text-muted uppercase tracking-[0.15em]">Top of the Day</h2>
                  </div>
                  <div className="space-y-2">
                    {Array.isArray(homeData.topDay) ? homeData.topDay.map((t: any, idx: number) => (
                      <TopRankCard
                        key={t.id}
                        track={normalizeTrack(t)}
                        stats={t.daily_listen_minutes && t.daily_listen_minutes > 0 ? `${Math.floor(t.daily_listen_minutes)}m streamed` : (t.streams ? `${Number(t.streams).toLocaleString()} plays` : undefined)}
                      />
                    )) : homeData.topDay && (
                      <TopRankCard
                        track={normalizeTrack(homeData.topDay)}
                        stats={homeData.topDay.daily_listen_minutes && homeData.topDay.daily_listen_minutes > 0 ? `${Math.floor(homeData.topDay.daily_listen_minutes)}m streamed` : (homeData.topDay.streams ? `${Number(homeData.topDay.streams).toLocaleString()} plays` : undefined)}
                      />
                    )}
                  </div>
                </section>

                {/* Top Week Section */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                            <Flame size={14} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-[11px] font-bold text-muted uppercase tracking-[0.15em]">Top of the Week</h2>
                    </div>
                    <div className="space-y-2">
                        {Array.isArray(homeData.topWeek) ? homeData.topWeek.map((t: any, idx: number) => (
                            <TopRankCard
                                key={t.id}
                                track={normalizeTrack(t)}
                                stats={t.weekly_listen_minutes ? `${Math.floor(t.weekly_listen_minutes)}m` : undefined}
                            />
                        )) : homeData.topWeek && (
                            <TopRankCard
                                track={normalizeTrack(homeData.topWeek)}
                                stats={homeData.topWeek.weekly_listen_minutes ? `${Math.floor(homeData.topWeek.weekly_listen_minutes)}m` : undefined}
                            />
                        )}
                    </div>
                </section>

                {/* Top Month Section */}
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                            <ChevronRight size={14} />
                        </div>
                        <h2 className="text-[11px] font-bold text-muted uppercase tracking-[0.15em]">Top of the Month</h2>
                    </div>
                    <div className="space-y-2">
                        {Array.isArray(homeData.topMonth) ? homeData.topMonth.map((t: any, idx: number) => (
                            <TopRankCard
                                key={t.id}
                                track={normalizeTrack(t)}
                                stats={t.monthly_listen_minutes ? `${Math.floor(t.monthly_listen_minutes)}m` : undefined}
                            />
                        )) : homeData.topMonth && (
                            <TopRankCard
                                track={normalizeTrack(homeData.topMonth)}
                                stats={homeData.topMonth.monthly_listen_minutes ? `${Math.floor(homeData.topMonth.monthly_listen_minutes)}m` : undefined}
                            />
                        )}
                    </div>
                </section>
              </div>

              {/* 🎵 3. New Releases */}
              {
                isValidTrack(normalizeTrack(homeData.newRelease)) && (
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-accent/10 text-accent"><Music size={18} strokeWidth={2.5} /></div>
                      <h2 className="text-sm font-semibold text-muted">New Releases</h2>
                      <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent ml-auto md:ml-0">Hot New</div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      <MediaCard track={normalizeTrack(homeData.newRelease)} />
                    </div>
                  </section>
                )
              }

              {/* 🎛 4. Remixes */}
              {
                isValidTrack(normalizeTrack(homeData.remix)) && (
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-accent/10 text-accent"><Sparkles size={18} strokeWidth={2.5} /></div>
                      <h2 className="text-sm font-semibold text-muted">Remixes</h2>
                      <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent ml-auto md:ml-0">Fresh Remix</div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      <MediaCard track={normalizeTrack(homeData.remix)} />
                    </div>
                  </section>
                )
              }

              {/* 🔥 Trending Artists */}
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
                    <Flame size={16} />
                  </div>
                  <h2 className="text-sm font-black text-white uppercase tracking-[0.1em]">Top Global Artists</h2>
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1">Top 4</span>
                </div>
                {homeData.artists?.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {homeData.artists?.slice(0, 4).map((artist: any) => (
                      <Link
                        key={artist.id}
                        href={`/artist/${artist.id}`}
                        className="group flex flex-col items-center text-center space-y-3"
                      >
                        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-2 border-white/5 group-hover:border-brand/40 shadow-2xl transition-all duration-500 relative bg-zinc-900">
                          <img
                            src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${artist.name}&background=random&color=fff&size=256`}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            alt={artist.name}
                          />
                          <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors" />
                        </div>
                        <div className="space-y-0.5 w-full">
                          <h4 className="font-bold text-sm text-white truncate group-hover:text-brand transition-colors">
                            {artist.name}
                          </h4>
                          <p className="text-[10px] text-white/30 font-bold uppercase tracking-wider">
                            {(artist._count?.tracks ?? artist.track_count ?? 0)} Tracks
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 rounded-3xl bg-white/[0.02] border border-dashed border-white/5 text-center">
                    <p className="text-xs text-muted font-medium leading-relaxed">
                      No musicians listed yet.
                    </p>
                  </div>
                )}
              </section>

              {/* 🌎 6. Hollywood */}
              {
                isValidTrack(normalizeTrack(homeData.hollywood)) && (
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-accent/10 text-accent"><Music size={18} strokeWidth={2.5} /></div>
                      <h2 className="text-sm font-semibold text-muted">Hollywood</h2>
                      <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent ml-auto md:ml-0">Global Chart</div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      <MediaCard track={normalizeTrack(homeData.hollywood)} />
                    </div>
                  </section>
                )
              }

              {/* 🇮🇳 7. India (Non-Tamil) */}
              {
                isValidTrack(normalizeTrack(homeData.india)) && (
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-accent/10 text-accent"><Music size={18} strokeWidth={2.5} /></div>
                      <h2 className="text-sm font-semibold text-muted">India Non-Tamil</h2>
                      <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent ml-auto md:ml-0">Trending India</div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      <MediaCard track={normalizeTrack(homeData.india)} />
                    </div>
                  </section>
                )
              }

              {/* 🌍 8. Global */}
              {
                isValidTrack(normalizeTrack(homeData.global)) && (
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-accent/10 text-accent"><Music size={18} strokeWidth={2.5} /></div>
                      <h2 className="text-sm font-semibold text-muted">Global Hits</h2>
                      <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent ml-auto md:ml-0">Worldwide</div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      <MediaCard track={normalizeTrack(homeData.global)} />
                    </div>
                  </section>
                )
              }

              {/* 💿 9. Top Album */}
              {
                homeData.album && Object.keys(homeData.album).length > 0 && (
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-accent/10 text-accent"><Music size={18} strokeWidth={2.5} /></div>
                      <h2 className="text-sm font-semibold text-muted">Top Album</h2>
                      <span className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1">Most Streamed</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      <Link href={`/album/${homeData.album.id}`} className="group relative flex flex-col gap-3 p-2 rounded-lg transition-all duration-300 hover:bg-white/5 cursor-pointer">
                        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-hover shadow-xl">
                          <img src={getMediaUrl(homeData.album.coverUrl) || "/logo.png"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={homeData.album.title} />
                        </div>
                        <div className="flex flex-col min-w-0 px-1">
                          <h3 className="text-[13px] font-bold truncate leading-snug text-foreground">{homeData.album.title}</h3>
                          <p className="text-[11px] text-muted font-medium truncate mt-0.5">{homeData.album.artist?.name}</p>
                          {(homeData.album.track_count || homeData.album.total_streams) && (
                            <div className="flex items-center gap-2 mt-1">
                              {homeData.album.track_count && (
                                <span className="text-[9px] text-white/30 font-bold">{String(homeData.album.track_count)} tracks</span>
                              )}
                              {homeData.album.total_streams && Number(homeData.album.total_streams) > 0 && (
                                <span className="text-[9px] text-emerald-400 font-bold">{Number(homeData.album.total_streams).toLocaleString()} plays</span>
                              )}
                            </div>
                          )}
                          {homeData.album.total_duration && Number(homeData.album.total_duration) > 0 && (
                            <span className="text-[9px] text-white/20 font-medium mt-0.5">
                              {Math.floor(Number(homeData.album.total_duration) / 60)} min total
                            </span>
                          )}
                        </div>
                      </Link>
                    </div>
                  </section>
                )
              }


            </motion.div >
          )
          }

          {/* STATE 2 & 3: TYPING / RESULTS */}
          {
            debouncedQuery && (results || smartResults || isSmartLoading) && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-12"
              >
                {/* 🤖 Smart Results Section */}
                {isSmartSearching && (
                    <section className="bg-brand/5 border border-brand/10 rounded-xl p-8 md:p-12 mb-16 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                            <Sparkles size={120} className="text-brand" />
                        </div>
                        
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-10 h-10 rounded-2xl bg-brand/20 flex items-center justify-center text-brand">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white tracking-tight">AI Best Matches</h2>
                                <p className="text-xs text-brand/60 font-medium">Interpreting: "{smartResults?.interpretedQuery?.genre || ''} {smartResults?.interpretedQuery?.tags?.join(' ') || ''}"</p>
                            </div>
                        </div>

                        {isSmartLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <motion.div 
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="p-3 rounded-full border-2 border-dashed border-brand/40"
                                >
                                    <Sparkles size={24} className="text-brand" />
                                </motion.div>
                                <p className="text-xs font-bold text-white/40 uppercase tracking-widest animate-pulse"><span className="font-zenify">zenify</span> AI is thinking...</p>
                            </div>
                        ) : smartResults?.results?.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 relative z-10">
                                {smartResults.results.map((track: any) => (
                                    <MediaCard key={track.id} track={track} />
                                ))}
                            </div>
                        ) : (
                            <div className="py-20 text-center">
                                <p className="text-sm text-white/30 font-medium italic">"No exact AI matches found. Try searching for genres or moods!"</p>
                            </div>
                        )}
                    </section>
                )}

                {/* Structured Content Grid */}
                {topResult && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12">
                    {/* Left Column: Top Result */}
                    <section>
                      <h3 className="text-[11px] font-semibold text-muted mb-6">
                        Top result
                      </h3>
                      {topResult.type === 'track' && (
                        <div
                          onClick={() => {
                            if (topResult.item.id === usePlayerStore.getState().currentTrack?.id) {
                              usePlayerStore.getState().togglePlay();
                            } else {
                              usePlayerStore.getState().setTrack(topResult.item, results.tracks);
                              useUIStore.getState().setPlayerMinimized(false);
                            }
                          }}
                          className="relative h-[380px] md:h-[460px] rounded-xl p-6 md:p-10 group cursor-pointer overflow-hidden flex flex-col justify-end shadow-2xl transition-all hover:scale-[1.01]"
                        >
                          {/* Background Effect */}
                          <div className="absolute inset-0 z-0 overflow-hidden rounded-xl bg-zinc-900 pointer-events-none">
                            <img
                              src={getTrackCover(topResult.item)}
                              alt=""
                              onError={(e: any) => {
                                const fallback = topResult.item.artist?.imageUrl || `https://ui-avatars.com/api/?name=${topResult.item.artist?.name || 'Z'}&background=random&color=fff&size=200`;
                                e.target.src = getMediaUrl(fallback) || "/logo.png";
                              }}
                              className="w-full h-full object-cover blur-[60px] scale-150 group-hover:scale-[1.6] transition-transform duration-[3s] opacity-70"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10 mix-blend-multiply" />
                            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent mix-blend-overlay" />
                          </div>

                          {/* Content Section */}
                          <div className="relative z-10 flex flex-col md:flex-row md:items-end gap-6 w-full">
                            <div className="relative w-32 h-32 md:w-56 md:h-56 rounded-lg overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.6)] border border-white/10 shrink-0">
                              <img
                                src={getTrackCover(topResult.item)}
                                alt={topResult.item.title}
                                onError={(e: any) => {
                                  const fallback = topResult.item.artist?.imageUrl || `https://ui-avatars.com/api/?name=${topResult.item.artist?.name || 'Z'}&background=random&color=fff&size=200`;
                                  e.target.src = getMediaUrl(fallback) || "/logo.png";
                                }}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[1s] ease-out bg-zinc-900"
                              />
                              <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-lg pointer-events-none" />
                            </div>

                            <div className="flex-1 pb-1 md:pb-3 w-full min-w-0">
                               <span className="inline-block px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-bold text-white uppercase tracking-[0.15em] mb-3 border border-white/5 shadow-sm">
                                 Top Result
                               </span>
                               <h2 className="text-4xl md:text-5xl lg:text-7xl font-black text-white tracking-tighter mb-2 group-hover:text-brand transition-colors drop-shadow-lg truncate pb-1">
                                 {topResult.item.title}
                               </h2>
                               <div className="flex flex-wrap items-center gap-3 w-full">
                                 {topResult.item.artist?.id ? (
                                   <Link
                                     href={`/artist/${topResult.item.artist.id}`}
                                     className="text-lg md:text-2xl font-bold text-white/80 hover:text-white transition-colors drop-shadow-md truncate max-w-full block"
                                     onClick={(e) => e.stopPropagation()}
                                   >
                                     {topResult.item.artist?.name}
                                   </Link>
                                 ) : (
                                   <p className="text-lg md:text-2xl font-bold text-white/80 drop-shadow-md truncate max-w-full">
                                     {topResult.item.artist?.name}
                                   </p>
                                 )}
                                 <span className="text-[10px] uppercase font-black tracking-widest px-2.5 py-1 rounded bg-black/40 border border-white/5 text-white/90 leading-none shadow-sm whitespace-nowrap">
                                   Song
                                 </span>
                               </div>
                            </div>
                          </div>

                          {/* Play Button */}
                          <div className="absolute bottom-6 right-6 md:top-8 md:bottom-auto md:right-10 z-20">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (topResult.item.id === usePlayerStore.getState().currentTrack?.id) {
                                  usePlayerStore.getState().togglePlay();
                                } else {
                                  usePlayerStore.getState().setTrack(topResult.item, results.tracks);
                                  useUIStore.getState().setPlayerMinimized(false);
                                }
                              }}
                              className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-[#1c1c1e] text-red-500 flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all group-hover:shadow-[0_12px_60px_rgba(0,0,0,0.6)] border border-white/10"
                            >
                              {usePlayerStore.getState().currentTrack?.id === topResult.item.id && usePlayerStore.getState().isPlaying ? (
                                <Pause size={isMobile ? 24 : 36} fill="currentColor" />
                              ) : (
                                <Play size={isMobile ? 24 : 36} fill="currentColor" className="ml-1 md:ml-2" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {topResult.type === 'artist' && (
                        <Link
                          href={`/artist/${topResult.item.id}`}
                          className="bg-[#121214]/60 backdrop-blur-xl border border-white/5 rounded-xl p-8 group cursor-pointer hover:bg-white/[0.04] transition-all relative overflow-hidden flex flex-col items-center text-center h-full min-h-[380px] md:min-h-[460px] justify-center"
                        >
                          <div className="absolute top-0 left-0 w-1 h-full bg-brand opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="w-40 h-40 md:w-52 md:h-52 rounded-full overflow-hidden shadow-2xl mb-8 border border-white/5 bg-zinc-900">
                            <img
                              src={getMediaUrl(topResult.item.imageUrl) || `https://ui-avatars.com/api/?name=${topResult.item.name}&background=random&color=fff&size=256`}
                              alt={topResult.item.name}
                              onError={(e: any) => {
                                e.target.src = `https://ui-avatars.com/api/?name=${topResult.item.name}&background=random&color=fff&size=256`;
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            />
                          </div>
                          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tighter mb-2 group-hover:text-brand transition-colors">
                            {topResult.item.name}
                          </h2>
                          <span className="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded bg-white/10 text-white/40 leading-none">
                            Artist
                          </span>
                        </Link>
                      )}
                    </section>

                    {/* Right Column: Live Songs List */}
                    <section>
                      <div className="flex items-center justify-between mb-4 px-2">
                        <h3 className="text-[11px] font-semibold text-muted">
                          Songs
                        </h3>
                        <button className="text-[10px] font-semibold text-brand hover:underline">
                          See All
                        </button>
                      </div>
                      <div className="max-h-[600px] overflow-y-auto custom-scrollbar space-y-0.5 pr-2">
                        {/* List Header */}
                        <div className={cn(
                          "sticky top-0 z-10 bg-background grid gap-4 px-4 py-2 border-b border-white/5 text-[11px] font-semibold text-muted/80",
                          isMobile ? "grid-cols-[1fr_auto]" : "grid-cols-[1fr_1fr_auto]"
                        )}>
                          <div>Title</div>
                          {!isMobile && <div>Album</div>}
                          <div className="text-right">Duration</div>
                        </div>
                        {results.tracks?.map((t: any, idx: number) => {
                          const dur = Number(t.duration) || 0;
                          const dStr = `${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, '0')}`;
                          const isLiked = likedTrackIds?.includes(t.id);
                          return (
                            <div
                              key={t.id}
                              onClick={() => { setTrack(t, results.tracks); setPlayerMinimized(false); }}
                              className={cn(
                                "grid gap-4 px-4 py-3 items-center rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group/tr",
                                isMobile ? "grid-cols-[1fr_auto]" : "grid-cols-[1fr_1fr_auto]",
                                idx === activeIndex && t.type === "track" ? "bg-white/5 ring-1 ring-brand/20" : "",
                              )}
                            >
                              {/* Title + Cover */}
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 shadow-lg border border-white/5 bg-zinc-900">
                                  <img 
                                    src={getTrackCover(t)} 
                                    onError={(e: any) => {
                                      const fb = t.artist?.imageUrl || `https://ui-avatars.com/api/?name=${t.artist?.name || 'Z'}&background=random&color=fff&size=200`;
                                      e.target.src = getMediaUrl(fb) || "/logo.png";
                                    }}
                                    className="w-full h-full object-cover" 
                                    alt="" 
                                  />
                                </div>
                                <div className="min-w-0">
                                   <div 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       router.push(`/track/${t.id}`);
                                     }}
                                     className="text-[14px] font-semibold text-white truncate group-hover/tr:text-brand transition-colors cursor-pointer hover:underline"
                                   >
                                     {t.title}
                                   </div>
                                  {t.artist?.id ? (
                                    <Link
                                      href={`/artist/${t.artist.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[11px] text-muted truncate font-medium hover:text-white/60 transition-colors w-fit block"
                                    >
                                      {t.artist?.name}
                                    </Link>
                                  ) : (
                                    <div className="text-[11px] text-muted truncate font-medium">{t.artist?.name}</div>
                                  )}
                                </div>
                              </div>

                              {/* Album (Hidden on mobile) */}
                              {!isMobile && (
                                <div className="text-[13px] text-muted truncate font-medium">{t.album?.title || "Single"}</div>
                              )}

                            {/* Duration + Actions */}
                            <div className="flex items-center gap-2 justify-end">
                              {/* Heart */}
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }}
                                className={cn(
                                  "opacity-0 group-hover/tr:opacity-100 transition-all p-1.5 rounded-full hover:bg-white/10",
                                  isLiked ? "!opacity-100 text-brand" : "text-white/40 hover:text-brand"
                                )}
                              >
                                <Heart size={14} className={cn(isLiked && "fill-current")} />
                              </button>

                              {/* Duration */}
                              <span className="text-[11px] font-bold text-muted tabular-nums group-hover/tr:text-white transition-colors min-w-[34px] text-right">
                                {dStr}
                              </span>

                              {/* Three dots */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="opacity-0 group-hover/tr:opacity-100 transition-all p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white"
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-44" align="end">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }}>
                                    <Heart size={13} className={isLiked ? "fill-current text-brand" : "opacity-70"} />
                                    <span>{isLiked ? "Liked" : "Add to Favourites"}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-white/10" />
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDownloadModal(t); }}>
                                    <Download size={13} className="opacity-70" />
                                    <span>Download Track</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
                )}

                {/* Artists Grid */}
                {results.artists && results.artists.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-semibold text-muted mb-8">
                      Artists
                    </h3>
                    <div className="flex overflow-x-auto custom-scrollbar gap-6 pb-4 pr-4">
                      {results.artists.map((artist: any) => (
                        <Link
                          key={artist.id}
                          href={`/artist/${artist.id}`}
                          className="group flex flex-col items-center text-center space-y-4"
                        >
                          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border border-white/5 shadow-xl group-hover:scale-105 transition-transform duration-500 ring-brand/20 group-hover:ring-4 bg-zinc-900">
                            <img
                              src={getMediaUrl(artist.imageUrl) || `https://ui-avatars.com/api/?name=${artist.name}&background=random&color=fff&size=200`}
                              onError={(e: any) => {
                                e.target.src = `https://ui-avatars.com/api/?name=${artist.name}&background=random&color=fff&size=200`;
                              }}
                              className="w-full h-full object-cover"
                              alt={artist.name}
                            />
                          </div>
                          <h4 className="font-semibold text-[13px] truncate w-full group-hover:text-brand transition-colors tracking-tight">
                            {artist.name}
                          </h4>
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.15em]">
                            {(artist.trackCount ?? artist.track_count ?? 0)} Tracks
                          </p>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {/* Albums Grid */}
                {results.albums && results.albums.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-[11px] font-semibold text-muted">
                        Albums
                      </h3>
                      <button className="text-[10px] font-semibold text-brand">
                        See All
                      </button>
                    </div>
                    <div className="flex overflow-x-auto custom-scrollbar gap-6 pb-4 pr-4">
                      {results.albums.map((album: any) => (
                        <Link
                          key={album.id}
                          href={`/album/${album.id}`}
                          className="group space-y-3"
                        >
                          <div className="aspect-square rounded-lg overflow-hidden border border-white/10 shadow-2xl group-hover:scale-[1.02] transition-all">
                            <img
                              src={getMediaUrl(album.coverUrl)}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          </div>
                          <div className="px-1">
                            <h4 className="font-bold text-sm truncate tracking-tight">
                              {album.title}
                            </h4>
                            <p className="text-[10px] text-muted font-medium truncate">
                              {album.artist?.name}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </motion.div>
            )
          }

          {/* EMPTY STATE */}
          {
            debouncedQuery &&
            results &&
            !results.tracks?.length &&
            !results.artists?.length &&
            !results.albums?.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-40 text-center"
              >
                <div className="w-24 h-24 rounded-full bg-white/5 border border-white/5 flex items-center justify-center mb-8 shadow-inner">
                  <SearchIcon size={32} className="text-zinc-700" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                  Sonic silence
                </h2>
                <p className="text-zinc-500 text-sm max-w-xs font-medium">
                  We couldn't decode any results for "{debouncedQuery}" in our
                  archives.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setQuery("")}
                  className="mt-8 rounded-full px-8 border-white/10 hover:bg-white/5 font-semibold text-[10px]"
                >
                  Clear Search
                </Button>
              </motion.div>
            )
          }
        </AnimatePresence >
      </div >
    </div >
  );
}
