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
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { useDebounce } from "use-debounce";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import { MediaCard } from "@/components/shared/MediaCard";
import Link from "next/link";
import { cn, getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const GENRES = [
  { name: "Tamil Popular", color: "bg-rose-500", image: "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?q=80&w=200" },
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

  // Liked track IDs for heart UI
  const { data: likedTrackIds } = useQuery({
    queryKey: ['liked-track-ids'],
    queryFn: async () => {
      const res = await api.get('/tracks/liked');
      return (res.data as Track[]).map((tr) => tr.id);
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated,
  });

  const toggleLike = (trackId: string) => {
    api.post(`/tracks/${trackId}/like`).then(() => {
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
      const res = await api.get("/search", {
        params: { q: debouncedQuery, limit: 12 },
      });
      return res.data;
    },
    enabled: !!debouncedQuery && isAuthenticated,
    staleTime: 1000 * 30,
  });

  // Discovery Home Data (Categorized & Ranked)
  const { data: homeData, isLoading: isHomeLoading } = useQuery({
    queryKey: ["search-home"],
    queryFn: async () => {
      const res = await api.get("/search/home");
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
    title,
    track,
    subtitle,
    label,
    icon: Icon,
    stats,
  }: any) => {
    const { currentTrack, setTrack, isPlaying } = usePlayerStore();
    const [isHovered, setIsHovered] = useState(false);

    if (!track) return null;

    const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
    const mins = Math.floor((track.duration || 0) / 60);
    const secs = (track.duration || 0) % 60;
    const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    return (
      <section className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-accent/10 text-accent">
            <Icon size={18} strokeWidth={2.5} />
          </div>
          <h2 className="text-sm font-semibold text-muted">
            {title}
          </h2>
          {label && (
            <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent ml-auto md:ml-0">
              {label}
            </div>
          )}
        </div>

        {/* List Header */}
        <div className="hidden md:grid grid-cols-[2.5rem_1fr_12rem] gap-4 px-4 pb-1.5 items-end border-b border-rose-500/10 text-[10px] font-semibold text-rose-500/70">
          <div className="flex justify-center">#</div>
          <div className="font-brand pl-[3.25rem]">Title</div>
          <div className="text-right pr-4 tracking-normal opacity-70"><Clock size={11} className="inline-block" /></div>
        </div>

        {/* Track Item */}
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setTrack(track)}
          className="group grid grid-cols-[2.5rem_1fr_12rem] gap-4 px-4 py-2.5 items-center rounded-lg hover:bg-white/5 focus-visible:bg-white/10 focus:outline-none transition-colors cursor-pointer border-b border-white/5"
        >
          {/* Number / Play Icon */}
          <div className="flex items-center justify-center w-full min-h-[1.5rem]">
            {(isHovered || isTrackPlaying) ? (
              <button
                onClick={(e) => { e.stopPropagation(); setTrack(track); }}
                className="text-white hover:text-rose-500 focus:outline-none flex items-center justify-center"
              >
                {isTrackPlaying && !isHovered ? (
                  <div className="flex items-end gap-[1.5px] h-[14px]">
                    {[...Array(4)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: [`${30 + (i % 3) * 20}%`, `${90 - (i % 2) * 30}%`, `${30 + (i % 3) * 20}%`] }}
                        transition={{ duration: 0.6 + (i % 3) * 0.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.05 }}
                        className="w-[2.5px] bg-rose-500 rounded-full shadow-[0_0_6px_rgba(244,63,94,0.5)]"
                      />
                    ))}
                  </div>
                ) : isTrackPlaying && isHovered ? (
                  <Pause size={14} className="fill-current text-white" />
                ) : (
                  <Play size={14} className="fill-current text-white" />
                )}
              </button>
            ) : (
              <span className="text-[13px] font-medium text-muted">1</span>
            )}
          </div>

          {/* Track Info & Thumbnail */}
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="shrink-0 w-10 h-10 rounded border border-white/10 overflow-hidden bg-zinc-800">
              <img
                src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100"}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                alt={track.title}
              />
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <p className={cn("text-[15px] font-bold leading-tight truncate transition-colors", isTrackPlaying ? "text-rose-500" : "text-white group-hover:text-rose-400")}>
                {track.title}
              </p>
              <Link href={`/search?type=artist&q=${encodeURIComponent(track.artist?.name || '')}`} onClick={(e) => e.stopPropagation()} className="text-[13px] font-medium text-white/50 hover:text-white transition-colors truncate mt-0.5">
                {track.artist?.name || "Unknown Artist"}
              </Link>
            </div>
          </div>

          {/* Actions & Duration */}
          <div className="flex items-center justify-end gap-6 pr-2">
            {stats ? (
              <span className="text-[10px] font-semibold text-emerald-400 hidden xl:inline-block bg-white/5 py-1 px-3 rounded-full text-center min-w-[100px]">{stats}</span>
            ) : (
              <button className="text-white/30 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 hidden md:block">
                <Heart size={16} />
              </button>
            )}
            <span className="text-[13px] font-medium text-white/40 tabular-nums">
              {durationStr}
            </span>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-40">
      {/* 1. SEARCH BAR AREA */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-white/5 px-6 py-6 md:px-12">
        <div className="max-w-3xl mx-auto relative group">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-rose-500 transition-colors">
            <SearchIcon size={20} strokeWidth={2.5} />
          </div>
          <input
            type="text"
            placeholder="Search for something specific..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            className="w-full h-14 pl-14 pr-6 bg-white/5 hover:bg-white/[0.08] focus:bg-white/[0.1] border border-white/10 focus:border-rose-500/50 rounded-2xl text-lg font-medium outline-none transition-all placeholder:text-zinc-600 shadow-2xl"
          />
          {isLoading && (
            <div className="absolute right-5 top-1/2 -translate-y-1/2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Sparkles size={16} className="text-rose-500" />
              </motion.div>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 md:px-12 py-12 max-w-[1400px] mx-auto">
        <AnimatePresence mode="wait">
          {/* STATE 1: DEFAULT (Advance Home) */}
          {!debouncedQuery && homeData && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-24"
            >
              <TopRankCard
                title="Top Song of the Day"
                track={normalizeTrack(homeData.topDay)}
                label="Daily Leader"
                icon={Sparkles}
                stats={homeData.topDay?.daily_listen_minutes ? `${(homeData.topDay.daily_listen_minutes >= 1000 ? (homeData.topDay.daily_listen_minutes / 1000).toFixed(1) + 'k' : Math.floor(homeData.topDay.daily_listen_minutes))} minutes` : undefined}
              />

              {/* 📈 2. Top Song of the Month */}
              <TopRankCard
                title="Top Song of the Month"
                track={normalizeTrack(homeData.topMonth)}
                label="Monthly Chart"
                icon={ChevronRight}
                stats={homeData.topMonth?.monthly_listen_minutes ? `${(homeData.topMonth.monthly_listen_minutes >= 1000 ? (homeData.topMonth.monthly_listen_minutes / 1000).toFixed(1) + 'k' : Math.floor(homeData.topMonth.monthly_listen_minutes))} minutes` : undefined}
              />

              {/* 🎵 3. New Releases */}
              {isValidTrack(normalizeTrack(homeData.newRelease)) && (
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
              )}

              {/* 🎛 4. Remixes */}
              {isValidTrack(normalizeTrack(homeData.remix)) && (
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
              )}

              {/* 🇮🇳 5. Tamil Musicians */}
              <section>
                <div className="flex items-center gap-3 mb-10">
                  <div className="p-2 rounded-xl bg-accent/10 text-accent">
                    <ChevronRight size={18} />
                  </div>
                  <h2 className="text-sm font-semibold text-muted">
                    Tamil Musicians
                  </h2>
                </div>
                {homeData.tamilArtists?.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-8">
                    {homeData.tamilArtists?.map((artist: any) => (
                      <Link
                        key={artist.id}
                        href={`/artist/${artist.id}`}
                        className="group flex flex-col items-center text-center space-y-4"
                      >
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-2 border-white/5 group-hover:border-accent/50 shadow-2xl transition-all duration-500 relative bg-zinc-900">
                          <img
                            src={getMediaUrl(artist.imageUrl)}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            alt={artist.name}
                          />
                          <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors" />
                        </div>
                        <div className="space-y-1 w-full">
                          <h4 className="font-semibold text-xs truncate group-hover:text-accent transition-colors">
                            {artist.name}
                          </h4>
                          <p className="text-[10px] text-muted font-medium">
                            {artist.follower_count?.toLocaleString() || 0} Followers
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 rounded-3xl bg-white/[0.02] border border-dashed border-white/5 text-center">
                    <p className="text-xs text-muted font-medium leading-relaxed">
                      No musicians listed yet.<br />
                      <span className="text-accent underline cursor-pointer">Start uploading frequencies</span>
                    </p>
                  </div>
                )}
              </section>

              {/* 🌎 6. Hollywood */}
              {isValidTrack(normalizeTrack(homeData.hollywood)) && (
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
              )}

              {/* 🇮🇳 7. India (Non-Tamil) */}
              {isValidTrack(normalizeTrack(homeData.india)) && (
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
              )}

              {/* 🌍 8. Global */}
              {isValidTrack(normalizeTrack(homeData.global)) && (
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
              )}

              {/* 💿 9. Albums */}
              {homeData.album && Object.keys(homeData.album).length > 0 && (
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent/10 text-accent"><Music size={18} strokeWidth={2.5} /></div>
                    <h2 className="text-sm font-semibold text-muted">Top Album</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    <Link href={`/album/${homeData.album.id}`} className="group relative flex flex-col gap-3 p-2 rounded-xl transition-all duration-300 hover:bg-white/5 cursor-pointer">
                      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-hover shadow-xl">
                        <img src={getMediaUrl(homeData.album.coverUrl) || "/logo.png"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={homeData.album.title} />
                      </div>
                      <div className="flex flex-col min-w-0 px-1">
                        <h3 className="text-[13px] font-bold truncate leading-snug text-foreground">{homeData.album.title}</h3>
                        <p className="text-[11px] text-muted font-medium truncate mt-0.5">{homeData.album.artist?.name}</p>
                      </div>
                    </Link>
                  </div>
                </section>
              )}

              {/* 📂 10. Playlists */}
              {homeData.playlist && Object.keys(homeData.playlist).length > 0 && (
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent/10 text-accent"><Music size={18} strokeWidth={2.5} /></div>
                    <h2 className="text-sm font-semibold text-muted">Top Playlist</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    <Link href={`/playlist/${homeData.playlist.id}`} className="group relative flex flex-col gap-3 p-2 rounded-xl transition-all duration-300 hover:bg-white/5 cursor-pointer">
                      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-hover shadow-xl">
                        <img src={getMediaUrl(homeData.playlist.coverUrl) || "/logo.png"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={homeData.playlist.name} />
                      </div>
                      <div className="flex flex-col min-w-0 px-1">
                        <h3 className="text-[13px] font-bold truncate leading-snug text-foreground">{homeData.playlist.name}</h3>
                        <p className="text-[11px] text-muted font-medium truncate mt-0.5">by {homeData.playlist.user?.name}</p>
                      </div>
                    </Link>
                  </div>
                </section>
              )}

              {/* 🌐 11. Browse All Genres */}
              <section className="pt-12">
                <div className="flex items-center gap-3 mb-10">
                  <div className="p-2 rounded-xl bg-accent/10 text-accent">
                    <Sparkles size={18} />
                  </div>
                  <h2 className="text-sm font-semibold text-muted">
                    Browse All Genres
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {GENRES.map((genre) => (
                    <div
                      key={genre.name}
                      className={cn(
                        "relative flex-shrink-0 aspect-square rounded-2xl overflow-hidden cursor-pointer group shadow-2xl transition-all active:scale-95",
                        genre.color
                      )}
                    >
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                      <img
                        src={genre.image}
                        className="absolute right-[-20px] bottom-[-20px] w-28 h-28 object-cover rotate-[25deg] group-hover:rotate-[15deg] group-hover:scale-110 transition-all duration-500 opacity-60"
                        alt=""
                      />
                      <div className="absolute top-4 left-4">
                        <h3 className="text-lg font-bold text-white leading-tight truncate w-24">
                          {genre.name}
                        </h3>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {/* STATE 2 & 3: TYPING / RESULTS */}
          {debouncedQuery && results && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12"
            >
              {/* Structured Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12">
                {/* Left Column: Top Result */}
                {results.tracks?.[0] && (
                  <section>
                    <h3 className="text-[11px] font-semibold text-muted mb-6">
                      Top Result
                    </h3>
                    <div
                      onClick={() => setTrack(results.tracks[0])}
                      className="premium-card p-8 group cursor-pointer hover:bg-white/[0.04] transition-all relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-40 h-40 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-2xl mb-8 border border-white/5">
                        <img
                          src={getMediaUrl(results.tracks[0].coverUrl)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          alt=""
                        />
                      </div>
                      <h2 className="text-3xl font-black text-white tracking-tighter mb-2 group-hover:text-rose-500 transition-colors">
                        {results.tracks[0].title}
                      </h2>
                      <p className="text-lg font-bold text-muted">
                        {results.tracks[0].artist?.name}{" "}
                        <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-white/10 leading-none">
                          Song
                        </span>
                      </p>

                      <div className="mt-8 flex items-center gap-4">
                        <button className="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20 hover:scale-110 active:scale-95 transition-all">
                          <Play
                            size={20}
                            fill="currentColor"
                            className="ml-1"
                          />
                        </button>
                        <div className="flex -space-x-2">
                          <div className="w-8 h-8 rounded-full border-2 border-background bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                            +12
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Right Column: Live Songs List */}
                <section>
                  <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="text-[11px] font-semibold text-muted">
                      Songs
                    </h3>
                    <button className="text-[10px] font-semibold text-rose-500 hover:underline">
                      See All
                    </button>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar space-y-0.5 pr-2">
                    {/* List Header */}
                    <div className="sticky top-0 z-10 bg-background grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2 border-b border-white/5 text-[11px] font-semibold text-muted/80">
                      <div>Title</div>
                      <div>Album</div>
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
                            "grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-3 items-center rounded-xl hover:bg-white/5 transition-all cursor-pointer group/tr",
                            idx === activeIndex && t.type === "track" ? "bg-white/5 ring-1 ring-rose-500/20" : "",
                          )}
                        >
                          {/* Title + Cover */}
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 shadow-lg border border-white/5">
                              <img src={getMediaUrl(t.coverUrl) || "/logo.png"} className="w-full h-full object-cover" alt="" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold text-white truncate group-hover/tr:text-rose-500 transition-colors">{t.title}</div>
                              <div className="text-[11px] text-muted truncate font-medium">{t.artist?.name}</div>
                            </div>
                          </div>

                          {/* Album */}
                          <div className="text-[13px] text-muted truncate font-medium">{t.album?.title || "Single"}</div>

                          {/* Duration + Actions */}
                          <div className="flex items-center gap-2 justify-end">
                            {/* Heart */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }}
                              className={cn(
                                "opacity-0 group-hover/tr:opacity-100 transition-all p-1.5 rounded-full hover:bg-white/10",
                                isLiked ? "!opacity-100 text-rose-500" : "text-white/40 hover:text-rose-500"
                              )}
                            >
                              <Heart size={14} className={cn(isLiked && "fill-current")} />
                            </button>

                            {/* Duration */}
                            <span className="text-[12px] text-muted font-medium tabular-nums group-hover/tr:text-white transition-colors w-10 text-right">{dStr}</span>

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
                                  <Heart size={13} className={isLiked ? "fill-current text-rose-500" : "opacity-70"} />
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
                        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border border-white/5 shadow-xl group-hover:scale-105 transition-transform duration-500 ring-rose-500/20 group-hover:ring-4">
                          <img
                            src={
                              getMediaUrl(artist.imageUrl) ||
                              `https://ui-avatars.com/api/?name=${artist.name}`
                            }
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        </div>
                        <h4 className="font-semibold text-xs truncate w-full group-hover:text-rose-500 transition-colors">
                          {artist.name}
                        </h4>
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
                    <button className="text-[10px] font-semibold text-rose-500">
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
                        <div className="aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-2xl group-hover:scale-[1.02] transition-all">
                          <img
                            src={getMediaUrl(album.coverUrl)}
                            className="w-full h-full object-cover"
                            alt=""
                          />
                        </div>
                        <div className="px-1">
                          <h4 className="font-bold text-sm truncate uppercase tracking-tight">
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
          )}

          {/* EMPTY STATE */}
          {debouncedQuery &&
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
                <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
                  Sonic Silence
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
            )}
        </AnimatePresence>
      </div>
    </div>
  );
}
