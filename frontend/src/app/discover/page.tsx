"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search as SearchIcon,
  Music,
  Sparkles,
  Play,
  Pause,
  Clock,
  Heart,
  MoreHorizontal,
  Flame,
  User,
  Disc,
  ListMusic,
  X,
  History,
  TrendingUp,
  Compass
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { useDebounce } from "use-debounce";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/ui";
import Link from "next/link";
import { cn, getMediaUrl } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/useIsMobile";

// Spotify & Apple Music Curated Browse Categories
const DISCOVER_GENRES = [
  {
    name: "Tamil Hits",
    query: "Tamil",
    gradient: "from-[#9E2339] to-[#E11D48]",
    image: "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?q=80&w=300",
  },
  {
    name: "Kollywood",
    query: "Kollywood",
    gradient: "from-[#1E3A8A] to-[#3B82F6]",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300",
  },
  {
    name: "Top India",
    query: "India",
    gradient: "from-[#065F46] to-[#10B981]",
    image: "https://images.unsplash.com/photo-1459749411177-04218006d396?q=80&w=300",
  },
  {
    name: "Melody & Love",
    query: "Melody",
    gradient: "from-[#581C87] to-[#A855F7]",
    image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300",
  },
  {
    name: "Hip-Hop",
    query: "Hip-Hop",
    gradient: "from-[#9A3412] to-[#F97316]",
    image: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=300",
  },
  {
    name: "Devotional",
    query: "Devotional",
    gradient: "from-[#854D0E] to-[#F59E0B]",
    image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=300",
  },
  {
    name: "Acoustic & Chill",
    query: "Acoustic",
    gradient: "from-[#0F766E] to-[#14B8A6]",
    image: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?q=80&w=300",
  },
  {
    name: "Party & EDM",
    query: "Party",
    gradient: "from-[#831843] to-[#EC4899]",
    image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=300",
  },
  {
    name: "Workout Pulse",
    query: "Workout",
    gradient: "from-[#7F1D1D] to-[#EF4444]",
    image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=300",
  },
  {
    name: "Night Drive",
    query: "Drive",
    gradient: "from-[#312E81] to-[#6366F1]",
    image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=300",
  },
  {
    name: "Rock & Metal",
    query: "Rock",
    gradient: "from-[#1E293B] to-[#475569]",
    image: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=300",
  },
  {
    name: "Lo-Fi & Study",
    query: "Lo-Fi",
    gradient: "from-[#701A75] to-[#D946EF]",
    image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?q=80&w=300",
  },
];

type FilterTab = "all" | "tracks" | "artists" | "albums" | "playlists";

export default function DiscoverPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [query, setQuery] = useState(searchParams.get("q") || searchParams.get("query") || "");
  const [debouncedQuery] = useDebounce(query, 300);
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>("all");
  const [isSmartSearching, setIsSmartSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const { isAuthenticated } = useAuthStore();
  const { currentTrack, setTrack, isPlaying } = usePlayerStore();
  const { setPlayerMinimized } = useUIStore();

  // Dynamic typing animation placeholder
  const [placeholderText, setPlaceholderText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cursorBlink, setCursorBlink] = useState(true);

  const placeholders = [
    "What do you want to listen to?",
    "Search songs, artists, or albums",
    "Search 'Anirudh' or 'A.R. Rahman'",
    "Search 'The Weeknd' or 'Starboy'",
    "Type a mood, vibe, or genre",
    "Explore the zenify sound waves",
  ];

  useEffect(() => {
    try {
      const stored = localStorage.getItem("zenify_recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  const saveRecentSearch = (term: string) => {
    if (!term || term.trim().length < 2) return;
    const clean = term.trim();
    const updated = [clean, ...recentSearches.filter(s => s.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    setRecentSearches(updated);
    try {
      localStorage.setItem("zenify_recent_searches", JSON.stringify(updated));
    } catch {}
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem("zenify_recent_searches");
    } catch {}
  };

  useEffect(() => {
    const interval = setInterval(() => setCursorBlink((b) => !b), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const currentWord = placeholders[placeholderIndex];
    let timer: NodeJS.Timeout;

    if (isDeleting) {
      if (charIndex > 0) {
        timer = setTimeout(() => {
          setPlaceholderText(currentWord.substring(0, charIndex - 1));
          setCharIndex((prev) => prev - 1);
        }, 20);
      } else {
        setIsDeleting(false);
        setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
      }
    } else {
      if (charIndex < currentWord.length) {
        timer = setTimeout(() => {
          setPlaceholderText(currentWord.substring(0, charIndex + 1));
          setCharIndex((prev) => prev + 1);
        }, 30);
      } else {
        timer = setTimeout(() => setIsDeleting(true), 3200);
      }
    }

    return () => clearTimeout(timer);
  }, [charIndex, isDeleting, placeholderIndex]);

  // Sync state with URL search params
  useEffect(() => {
    const q = searchParams.get("q") || searchParams.get("query");
    if (q && q !== query) {
      setQuery(q);
    }
  }, [searchParams]);

  // Liked tracks
  const { data: likedTrackIds } = useQuery({
    queryKey: ['liked-track-ids'],
    queryFn: async () => {
      const res = await api.get('tracks/liked');
      const arr = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      return arr.map((tr: any) => tr.id);
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated,
  });

  const toggleLike = (trackId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    queryClient.cancelQueries({ queryKey: ['liked-track-ids'] });
    const prev = queryClient.getQueryData<string[]>(['liked-track-ids']);
    const updated = prev ? (prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]) : [trackId];
    queryClient.setQueryData(['liked-track-ids'], updated);
    api.post(`tracks/${trackId}/like`).then(() => {
      queryClient.invalidateQueries({ queryKey: ['liked-track-ids'] });
      queryClient.invalidateQueries({ queryKey: ['liked-tracks'] });
    }).catch(() => {
      if (prev !== undefined) queryClient.setQueryData(['liked-track-ids'], prev);
    });
  };

  // Live query results
  const { data: results, isLoading: isSearchLoading } = useQuery({
    queryKey: ["discover-search", debouncedQuery],
    queryFn: async ({ signal }) => {
      if (!debouncedQuery) return null;
      saveRecentSearch(debouncedQuery);
      const res = await api.get("search", { params: { q: debouncedQuery, limit: 16 }, signal });
      return res.data;
    },
    enabled: !!debouncedQuery,
    staleTime: 1000 * 60 * 10, // 10 minutes cache
  });

  // Discovery Home data (genres, top charts, trending)
  const { data: homeData, isLoading: isHomeLoading } = useQuery({
    queryKey: ["discover-home"],
    queryFn: async () => {
      const res = await api.get("search/home");
      return res.data;
    },
    enabled: !debouncedQuery,
    staleTime: 1000 * 60 * 3,
  });

  // Spotify-style Top Result calculation
  const topResult = useMemo(() => {
    if (!results) return null;
    const q = debouncedQuery.toLowerCase().trim();

    // Prioritize direct artist match if query is artist name
    if (results.artists?.[0]) {
      const aName = results.artists[0].name.toLowerCase();
      if (aName.includes(q) || q.includes(aName)) {
        return { item: results.artists[0], type: "artist" };
      }
    }

    if (results.tracks?.[0]) {
      return { item: results.tracks[0], type: "track" };
    }

    if (results.artists?.[0]) {
      return { item: results.artists[0], type: "artist" };
    }

    if (results.albums?.[0]) {
      return { item: results.albums[0], type: "album" };
    }

    return null;
  }, [results, debouncedQuery]);

  const handleSelectGenre = (genreQuery: string) => {
    setQuery(genreQuery);
  };

  return (
    <div className="min-h-screen bg-[#070709] pb-36 sm:pb-40 text-foreground relative selection:bg-brand selection:text-white pt-[76px] sm:pt-[88px] md:pt-[104px]">
      {/* Subtle Apple Music Ambient Glow */}
      <div className="absolute top-0 inset-x-0 h-96 bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,rgba(225,29,72,0.12),transparent)] pointer-events-none" />

      <div className="max-w-[1340px] mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-4 relative z-10 space-y-8">
        
        {/* ========================================================= */}
        {/* HEADER & SEARCH BAR (Apple Music + Spotify Fusion)         */}
        {/* ========================================================= */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                <Compass className="text-brand w-8 h-8 sm:w-10 sm:h-10 shrink-0" />
                <span>Discover</span>
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                Explore genres, chart toppers, verified artists, and millions of tracks.
              </p>
            </div>
          </div>

          {/* Search Input Container */}
          <div className="relative group focus-within:ring-2 focus-within:ring-brand/30 rounded-2xl transition-all">
            <div className="absolute inset-y-0 left-4 sm:left-5 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-brand transition-colors">
              <SearchIcon size={20} />
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholderText + (cursorBlink ? "|" : "")}
              className="w-full bg-zinc-900/90 hover:bg-zinc-900 border border-white/10 group-focus-within:border-brand/40 rounded-2xl py-4 sm:py-5 pl-12 sm:pl-14 pr-24 text-base sm:text-lg text-white placeholder:text-zinc-500 outline-none backdrop-blur-xl shadow-xl transition-all"
            />

            <div className="absolute inset-y-0 right-3 flex items-center gap-2">
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X size={18} />
                </button>
              )}

              <button
                onClick={() => setIsSmartSearching(!isSmartSearching)}
                className={cn(
                  "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                  isSmartSearching
                    ? "bg-brand/20 border-brand/40 text-brand shadow-[0_0_15px_rgba(225,29,72,0.3)]"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
                )}
                title="Toggle AI Semantic Search"
              >
                <Sparkles size={12} className={cn(isSmartSearching && "text-brand animate-pulse")} />
                <span>{isSmartSearching ? "AI Active" : "AI Search"}</span>
              </button>
            </div>
          </div>

          {/* Category Filter Pills (When query is active) */}
          {debouncedQuery && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {(["all", "tracks", "artists", "albums", "playlists"] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedFilter(tab)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-semibold capitalize tracking-wide transition-all shrink-0 cursor-pointer",
                    selectedFilter === tab
                      ? "bg-brand text-white shadow-md shadow-brand/20 font-bold"
                      : "bg-zinc-900/90 text-zinc-400 hover:text-white border border-white/5 hover:border-white/15"
                  )}
                >
                  {tab === "all" ? "Top Results" : tab}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* DISCOVER MODE (When Query is Empty)                       */}
        {/* ========================================================= */}
        {!debouncedQuery ? (
          <div className="space-y-12">
            
            {/* Recent Searches (if available) */}
            {recentSearches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                    <History size={14} className="text-brand" />
                    <span>Recent Searches</span>
                  </div>
                  <button
                    onClick={clearRecentSearches}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-brand transition-colors cursor-pointer"
                  >
                    Clear history
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/5 hover:border-brand/30 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer"
                    >
                      <SearchIcon size={12} className="text-zinc-500" />
                      <span>{term}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* BROWSE ALL: Spotify & Apple Music 3D Cards */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                    Explore Genres & Moods
                  </h2>
                  <p className="text-xs text-zinc-400">Browse curated sonic categories and trending sounds</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {DISCOVER_GENRES.map((genre) => (
                  <div
                    key={genre.name}
                    onClick={() => handleSelectGenre(genre.query)}
                    className={cn(
                      "relative h-32 sm:h-36 rounded-2xl overflow-hidden p-3.5 cursor-pointer select-none transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-95 group",
                      `bg-gradient-to-br ${genre.gradient}`
                    )}
                  >
                    {/* Category Label */}
                    <span className="relative z-10 text-base sm:text-lg font-black text-white leading-tight uppercase tracking-tight drop-shadow-md">
                      {genre.name}
                    </span>

                    {/* Spotify Signature 3D Angled Artwork in Bottom-Right */}
                    <div className="absolute -right-3 -bottom-3 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shadow-2xl transform rotate-[22deg] group-hover:rotate-[15deg] group-hover:scale-105 transition-transform duration-300 border border-white/20">
                      <img
                        src={genre.image}
                        alt={genre.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* QUICK PICKS / TRENDING (Apple Music Inspired Layout) */}
            {homeData?.trendingTracks && homeData.trendingTracks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                      <TrendingUp size={20} className="text-brand" />
                      <span>Trending Right Now</span>
                    </h2>
                    <p className="text-xs text-zinc-400">The most popular tracks played across the platform</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {homeData.trendingTracks.slice(0, 9).map((track: any, idx: number) => {
                    const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                    const mins = Math.floor((track.duration || 0) / 60);
                    const secs = (track.duration || 0) % 60;
                    const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;
                    const isLiked = likedTrackIds?.includes(track.id);

                    return (
                      <div
                        key={track.id}
                        onClick={() => {
                          setTrack(track);
                          setPlayerMinimized(false);
                        }}
                        className="group flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-white/10 transition-all cursor-pointer"
                      >
                        {/* Cover + Play Overlay */}
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 shadow-md">
                          <img
                            src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=120"}
                            alt={track.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className={cn(
                            "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                            isTrackPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}>
                            {isTrackPlaying ? (
                              <Pause size={18} className="text-brand fill-current" />
                            ) : (
                              <Play size={18} className="text-white fill-current ml-0.5" />
                            )}
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            "text-sm font-bold truncate leading-tight",
                            isTrackPlaying ? "text-brand" : "text-white group-hover:text-white"
                          )}>
                            {track.title}
                          </p>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">
                            {track.artist?.name || "Unknown Artist"}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => toggleLike(track.id, e)}
                            className={cn(
                              "p-1.5 rounded-full transition-colors cursor-pointer",
                              isLiked ? "text-brand" : "text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100"
                            )}
                          >
                            <Heart size={14} className={cn(isLiked && "fill-current")} />
                          </button>
                          <span className="text-[11px] text-zinc-500 font-medium tabular-nums mr-1">
                            {durationStr}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* FEATURED ARTISTS SPOTLIGHT */}
            {homeData?.artists && homeData.artists.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <User size={20} className="text-brand" />
                    <span>Popular Artists</span>
                  </h2>
                  <p className="text-xs text-zinc-400">Discover top performing voices and creators</p>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                  {homeData.artists.slice(0, 6).map((artist: any) => (
                    <Link
                      key={artist.id}
                      href={`/artist/${artist.id}`}
                      className="group flex flex-col items-center text-center p-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-800/60 border border-white/5 hover:border-white/10 transition-all"
                    >
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border-2 border-white/10 group-hover:border-brand/40">
                        <img
                          src={getMediaUrl(artist.imageUrl) || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                          alt={artist.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-white group-hover:text-brand transition-colors truncate w-full">
                        {artist.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-0.5">
                        Artist
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* LIVE SEARCH RESULTS MODE (When Query is Typed)            */
          /* ========================================================= */
          <div className="space-y-10">
            {isSearchLoading ? (
              <div className="py-24 text-center space-y-3">
                <div className="w-8 h-8 mx-auto border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                  Searching catalog...
                </p>
              </div>
            ) : (
              <>
                {/* 1. TOP RESULT & TOP TRACKS (Spotify Split-Hero Standard) */}
                {(selectedFilter === "all" || selectedFilter === "tracks") && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Spotify Iconic "Top Result" Hero Showcase */}
                    {topResult && (
                      <div className="lg:col-span-5 space-y-3">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                          Top Result
                        </h3>
                        <div
                          onClick={() => {
                            if (topResult.type === "track") {
                              setTrack(topResult.item);
                              setPlayerMinimized(false);
                            } else {
                              router.push(`/${topResult.type}/${topResult.item.id}`);
                            }
                          }}
                          className="group relative p-6 rounded-3xl bg-zinc-900/90 hover:bg-zinc-800/90 border border-white/10 hover:border-brand/40 transition-all duration-300 cursor-pointer shadow-2xl"
                        >
                          {/* Artwork / Avatar */}
                          <div className={cn(
                            "overflow-hidden shadow-2xl mb-5 border border-white/10",
                            topResult.type === "artist" ? "w-24 h-24 rounded-full" : "w-24 h-24 rounded-2xl"
                          )}>
                            <img
                              src={getMediaUrl(topResult.item.coverUrl || topResult.item.imageUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200"}
                              alt={topResult.item.title || topResult.item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>

                          {/* Title & Artist */}
                          <h4 className="text-2xl sm:text-3xl font-black text-white group-hover:text-brand transition-colors truncate">
                            {topResult.item.title || topResult.item.name}
                          </h4>

                          <div className="flex items-center gap-2 mt-2">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/10 text-zinc-300 border border-white/10">
                              {topResult.type}
                            </span>
                            {topResult.item.artist?.name && (
                              <span className="text-xs text-zinc-400 truncate">
                                by {topResult.item.artist.name}
                              </span>
                            )}
                          </div>

                          {/* Floating Play Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (topResult.type === "track") {
                                setTrack(topResult.item);
                                setPlayerMinimized(false);
                              } else {
                                router.push(`/${topResult.type}/${topResult.item.id}`);
                              }
                            }}
                            className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-brand hover:bg-brand/90 text-white flex items-center justify-center shadow-xl shadow-brand/30 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                          >
                            <Play size={20} className="fill-current ml-0.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Top Matching Songs List */}
                    {results?.tracks && results.tracks.length > 0 && (
                      <div className={cn("space-y-3", topResult ? "lg:col-span-7" : "lg:col-span-12")}>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                          Songs
                        </h3>
                        <div className="space-y-1">
                          {results.tracks.slice(0, 5).map((track: any, i: number) => {
                            const isTrackPlaying = currentTrack?.id === track.id && isPlaying;
                            const mins = Math.floor((track.duration || 0) / 60);
                            const secs = (track.duration || 0) % 60;
                            const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;
                            const isLiked = likedTrackIds?.includes(track.id);

                            return (
                              <div
                                key={track.id}
                                onClick={() => {
                                  setTrack(track);
                                  setPlayerMinimized(false);
                                }}
                                className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900/80 border border-transparent hover:border-white/5 transition-all cursor-pointer"
                              >
                                <span className="w-5 text-center text-xs font-bold text-zinc-500 tabular-nums">
                                  {i + 1}
                                </span>

                                <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                  <img
                                    src={getMediaUrl(track.coverUrl) || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100"}
                                    alt={track.title}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className={cn(
                                    "absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity",
                                    isTrackPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                  )}>
                                    {isTrackPlaying ? (
                                      <Pause size={14} className="text-brand fill-current" />
                                    ) : (
                                      <Play size={14} className="text-white fill-current ml-0.5" />
                                    )}
                                  </div>
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className={cn(
                                    "text-sm font-bold truncate leading-tight",
                                    isTrackPlaying ? "text-brand" : "text-white group-hover:text-white"
                                  )}>
                                    {track.title}
                                  </p>
                                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                                    {track.artist?.name || "Unknown Artist"}
                                  </p>
                                </div>

                                <button
                                  onClick={(e) => toggleLike(track.id, e)}
                                  className={cn(
                                    "p-1.5 rounded-full transition-colors cursor-pointer",
                                    isLiked ? "text-brand" : "text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100"
                                  )}
                                >
                                  <Heart size={14} className={cn(isLiked && "fill-current")} />
                                </button>

                                <span className="text-xs text-zinc-500 font-medium tabular-nums w-10 text-right">
                                  {durationStr}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. ARTISTS SECTION */}
                {(selectedFilter === "all" || selectedFilter === "artists") && results?.artists && results.artists.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                      Artists
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {results.artists.slice(0, 6).map((artist: any) => (
                        <Link
                          key={artist.id}
                          href={`/artist/${artist.id}`}
                          className="group flex flex-col items-center text-center p-4 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-brand/30 transition-all"
                        >
                          <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border border-white/10 group-hover:border-brand/40">
                            <img
                              src={getMediaUrl(artist.imageUrl) || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200"}
                              alt={artist.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-sm font-bold text-white group-hover:text-brand transition-colors truncate w-full">
                            {artist.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-0.5">
                            Artist
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. ALBUMS SECTION */}
                {(selectedFilter === "all" || selectedFilter === "albums") && results?.albums && results.albums.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                      Albums
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {results.albums.slice(0, 6).map((album: any) => (
                        <Link
                          key={album.id}
                          href={`/album/${album.id}`}
                          className="group p-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-brand/30 transition-all flex flex-col"
                        >
                          <div className="w-full aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border border-white/10">
                            <img
                              src={getMediaUrl(album.coverUrl) || "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=300"}
                              alt={album.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-sm font-bold text-white group-hover:text-brand transition-colors truncate">
                            {album.title}
                          </span>
                          <span className="text-xs text-zinc-500 truncate mt-0.5">
                            {album.artist?.name || "Album"}{album.year ? ` • ${album.year}` : ''}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. PLAYLISTS SECTION */}
                {(selectedFilter === "all" || selectedFilter === "playlists") && results?.playlists && results.playlists.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                      Playlists
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {results.playlists.slice(0, 6).map((playlist: any) => (
                        <Link
                          key={playlist.id}
                          href={`/playlist/${playlist.id}`}
                          className="group p-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-brand/30 transition-all flex flex-col"
                        >
                          <div className="w-full aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow-xl mb-3 group-hover:scale-105 transition-transform border border-white/10 flex items-center justify-center">
                            {playlist.coverUrl ? (
                              <img
                                src={getMediaUrl(playlist.coverUrl)}
                                alt={playlist.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ListMusic size={32} className="text-zinc-600" />
                            )}
                          </div>
                          <span className="text-sm font-bold text-white group-hover:text-brand transition-colors truncate">
                            {playlist.name}
                          </span>
                          <span className="text-xs text-zinc-500 truncate mt-0.5">
                            Playlist
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Results Fallback */}
                {(!results?.tracks?.length && !results?.artists?.length && !results?.albums?.length && !results?.playlists?.length) && (
                  <div className="py-20 text-center space-y-2">
                    <Music size={36} className="mx-auto text-zinc-600" />
                    <h4 className="text-lg font-bold text-white">No results found for &ldquo;{debouncedQuery}&rdquo;</h4>
                    <p className="text-xs text-zinc-500">
                      Please check the spelling or try searching for another artist, track, or album.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
