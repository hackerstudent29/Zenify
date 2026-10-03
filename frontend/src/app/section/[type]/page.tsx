"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Play, Pause, Shuffle, ArrowLeft, Search, Music, Sparkles, 
  TrendingUp, Clock, User, Disc, Heart, Layers, Grid, List, Plus
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayerStore, Track } from "@/store/player";
import { MediaCard } from "@/components/shared/MediaCard";
import { UniversalMediaCover } from "@/components/shared/UniversalMediaCover";
import { formatDuration, cn, formatDisplayTitle, formatArtists } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function SectionPage() {
  const params = useParams() as Record<string, string | string[]> | null;
  const router = useRouter();
  const rawType = Array.isArray(params?.type) ? params.type[0] : params?.type || "new";

  // Normalize section type slug
  const sectionType = useMemo(() => {
    const slug = String(rawType).toLowerCase().replace(/_/g, "-");
    if (slug === "new" || slug === "new-arrivals" || slug === "newarrivals") return "new-arrivals";
    if (slug === "trending" || slug === "trending-charts" || slug === "charts") return "trending";
    if (slug === "featured" || slug === "featured-now") return "featured";
    if (slug === "recently-played" || slug === "history") return "recently-played";
    if (slug === "continue-listening" || slug === "continue") return "continue-listening";
    if (slug === "personalized" || slug === "recommendations" || slug === "made-for-you") return "recommendations";
    if (slug === "top-artists" || slug === "artists") return "top-artists";
    if (slug === "top-albums" || slug === "albums") return "top-albums";
    if (slug === "moods" || slug === "genres") return "moods";
    return slug;
  }, [rawType]);

  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { currentTrack, isPlaying, setTrack, togglePlay, setQueue } = usePlayerStore();

  // Section Metadata Mapping
  const sectionInfo = useMemo(() => {
    switch (sectionType) {
      case "new-arrivals":
        return {
          title: "New Arrivals",
          subtitle: "FRESHLY PRESSED FROM THE STUDIO (NEWEST TO OLDEST)",
          icon: Music,
          badge: "Latest Releases",
          endpoint: "/homepage/new-arrivals",
          fallbackEndpoint: "/tracks?limit=100&sort=newest"
        };
      case "trending":
        return {
          title: "Trending & Charts",
          subtitle: "THE PULSE OF THE COMMUNITY",
          icon: TrendingUp,
          badge: "Hot Right Now",
          endpoint: "/homepage/trending",
          fallbackEndpoint: "/tracks/trending"
        };
      case "featured":
        return {
          title: "Featured Now",
          subtitle: "TOP PICKS FROM THE EDITORIAL TEAM",
          icon: Sparkles,
          badge: "Editorial Selection",
          endpoint: "/homepage/featured",
          fallbackEndpoint: "/tracks/featured"
        };
      case "recently-played":
        return {
          title: "Recently Played",
          subtitle: "PICK UP WHERE YOU LEFT OFF",
          icon: Clock,
          badge: "History",
          endpoint: "/homepage/recently-played",
          fallbackEndpoint: "/history"
        };
      case "continue-listening":
        return {
          title: "Continue Listening",
          subtitle: "JUMP BACK IN",
          icon: Play,
          badge: "In Progress",
          endpoint: "/homepage/continue-listening",
          fallbackEndpoint: "/homepage/recently-played"
        };
      case "recommendations":
        return {
          title: "Made For You",
          subtitle: "BASED ON YOUR SONIC PREFERENCES",
          icon: Heart,
          badge: "Personalized",
          endpoint: "/homepage/recommendations",
          fallbackEndpoint: "/homepage/featured"
        };
      case "top-artists":
        return {
          title: "Top Artists",
          subtitle: "THE MOST STREAMED VOICES",
          icon: User,
          badge: "Artists",
          endpoint: "/homepage/top-artists",
          fallbackEndpoint: "/artists"
        };
      case "top-albums":
        return {
          title: "Top Albums",
          subtitle: "MASTERPIECES FROM THE ARCHIVE",
          icon: Disc,
          badge: "Albums",
          endpoint: "/homepage/top-albums",
          fallbackEndpoint: "/albums"
        };
      case "moods":
        return {
          title: "Browse By Mood",
          subtitle: "EXPLORE DIFFERENT FREQUENCIES",
          icon: Layers,
          badge: "Moods & Genres",
          endpoint: "/homepage/moods",
          fallbackEndpoint: "/genres"
        };
      default:
        return {
          title: "Section Overview",
          subtitle: "CURATED COLLECTION",
          icon: Music,
          badge: "Collection",
          endpoint: `/homepage/${sectionType}`,
          fallbackEndpoint: "/tracks"
        };
    }
  }, [sectionType]);

  // Fetch Section Items
  useEffect(() => {
    let isMounted = true;
    async function loadSectionData() {
      setIsLoading(true);
      try {
        let resData: any = null;

        // Try primary endpoint first
        try {
          const res = await api.get(sectionInfo.endpoint);
          resData = res.data?.items || res.data;
        } catch (err) {
          // Try fallback endpoint
          const resFallback = await api.get(sectionInfo.fallbackEndpoint);
          resData = resFallback.data?.items || resFallback.data?.tracks || resFallback.data;
        }

        if (!isMounted) return;

        let parsedItems: any[] = Array.isArray(resData) ? resData : [];

        // For New Arrivals: Ensure strict latest to oldest ordering by createdAt
        if (sectionType === "new-arrivals") {
          // If we got items from homepage API, also attempt fetching full /tracks list sorted by newest
          try {
            const fullRes = await api.get("/tracks?limit=100");
            const fullTracks = fullRes.data?.tracks || fullRes.data;
            if (Array.isArray(fullTracks) && fullTracks.length > 0) {
              parsedItems = fullTracks;
            }
          } catch (e) {
            // Keep original parsedItems
          }

          // Sort latest to oldest
          parsedItems = [...parsedItems].sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          });
        }

        setItems(parsedItems);
      } catch (error) {
        console.error(`Failed to load section ${sectionType}:`, error);
        toast.error(`Unable to load ${sectionInfo.title}`);
        setItems([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadSectionData();
    return () => { isMounted = false; };
  }, [sectionType, sectionInfo]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const titleMatch = item.title?.toLowerCase().includes(q);
      const artistMatch = (item.artistName || item.artist?.name || "")?.toLowerCase().includes(q);
      const albumMatch = (item.album?.title || item.albumTitle || "")?.toLowerCase().includes(q);
      const genreMatch = item.genre?.toLowerCase().includes(q);
      return titleMatch || artistMatch || albumMatch || genreMatch;
    });
  }, [items, searchQuery]);

  // Play All Handler
  const handlePlayAll = () => {
    const playableTracks = filteredItems.filter(t => !t.isArtist && !t.isAlbum && !t.isMood && !t.isPlaylist);
    if (playableTracks.length === 0) return;
    setTrack(playableTracks[0], playableTracks);
    toast.success(`Playing ${playableTracks.length} songs from ${sectionInfo.title}`);
  };

  // Shuffle Play Handler
  const handleShufflePlay = () => {
    const playableTracks = [...filteredItems.filter(t => !t.isArtist && !t.isAlbum && !t.isMood && !t.isPlaylist)];
    if (playableTracks.length === 0) return;
    const shuffled = playableTracks.sort(() => Math.random() - 0.5);
    setTrack(shuffled[0], shuffled);
    toast.success(`Shuffled ${shuffled.length} songs from ${sectionInfo.title}`);
  };

  const IconComponent = sectionInfo.icon;
  const isPlayableCategory = !["top-artists", "top-albums", "moods"].includes(sectionType);

  return (
    <div className="min-h-screen bg-background pb-36 text-foreground font-sans select-none relative overflow-hidden">
      {/* Dynamic Header Banner */}
      <div className="pt-24 sm:pt-28 md:pt-32 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-[11px] font-bold tracking-widest uppercase bg-brand/10 text-brand border border-brand/20 px-3 py-1 rounded-full flex items-center gap-1.5">
            <IconComponent size={12} /> {sectionInfo.badge}
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/5">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-none font-brand" style={{ fontFamily: "'Orange Avenue', serif" }}>
              {sectionInfo.title}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 font-medium tracking-wider uppercase mt-2">
              {sectionInfo.subtitle} • <span className="text-brand font-bold">{filteredItems.length} items</span>
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3">
            {isPlayableCategory && filteredItems.length > 0 && (
              <>
                <button
                  onClick={handlePlayAll}
                  className="h-10 px-6 rounded-full bg-brand hover:bg-brand/90 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-brand/20 transition-all active:scale-95 cursor-pointer"
                >
                  <Play size={14} fill="currentColor" />
                  <span>Play All</span>
                </button>
                <button
                  onClick={handleShufflePlay}
                  className="h-10 px-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold text-xs flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                  title="Shuffle Section"
                >
                  <Shuffle size={14} />
                  <span className="hidden sm:inline">Shuffle</span>
                </button>
              </>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center p-1 rounded-full bg-white/5 border border-white/10">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer",
                  viewMode === "grid" ? "bg-brand text-white shadow" : "text-zinc-400 hover:text-white"
                )}
                title="Grid View"
              >
                <Grid size={14} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer",
                  viewMode === "list" ? "bg-brand text-white shadow" : "text-zinc-400 hover:text-white"
                )}
                title="List View"
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Search Field */}
        <div className="mt-6 mb-8 relative max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Filter ${sectionInfo.title.toLowerCase()}...`}
            className="w-full h-10 pl-10 pr-4 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-brand/40 transition-all"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 md:px-8 max-w-7xl mx-auto">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-3">
                <div className="aspect-square w-full rounded-2xl bg-white/5 border border-white/10" />
                <div className="h-4 bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-white/5 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
            <Music size={40} className="mx-auto text-zinc-600 mb-3" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">No Items Found</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
              {searchQuery ? `No results matching "${searchQuery}"` : `No content currently available for ${sectionInfo.title}`}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View Layout */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredItems.map((item, index) => {
              if (sectionType === "top-artists" || item.isArtist) {
                return (
                  <div
                    key={item.id || index}
                    onClick={() => router.push(`/artist/${item.id}`)}
                    className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-brand/30 transition-all group cursor-pointer text-center"
                  >
                    <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-full overflow-hidden mb-3 border border-white/10 shadow-xl relative bg-zinc-900">
                      <UniversalMediaCover track={item} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-brand transition-colors">
                      {item.name || item.title}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">Artist</p>
                  </div>
                );
              }

              if (sectionType === "top-albums" || item.isAlbum) {
                return (
                  <div
                    key={item.id || index}
                    onClick={() => router.push(`/album/${item.id}`)}
                    className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-brand/30 transition-all group cursor-pointer"
                  >
                    <div className="aspect-square w-full rounded-xl overflow-hidden mb-3 border border-white/10 shadow-xl relative bg-zinc-900">
                      <UniversalMediaCover track={item} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-brand transition-colors">
                      {formatDisplayTitle(item.title)}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                      {formatArtists(item) || "Album"}
                    </p>
                  </div>
                );
              }

              return (
                <MediaCard
                  key={item.id || index}
                  track={item}
                  index={index}
                  contextTracks={filteredItems}
                  className="w-full"
                />
              );
            })}
          </div>
        ) : (
          /* List View Layout */
          <div className="space-y-1">
            {filteredItems.map((item, index) => {
              const isCurrent = currentTrack?.id === item.id;
              const displayTitle = formatDisplayTitle(item.title || item.name);
              const displayArtist = formatArtists(item) || "Unknown Artist";

              return (
                <div
                  key={item.id || index}
                  onClick={() => {
                    if (item.isArtist) router.push(`/artist/${item.id}`);
                    else if (item.isAlbum) router.push(`/album/${item.id}`);
                    else setTrack(item, filteredItems);
                  }}
                  className={cn(
                    "h-14 flex items-center justify-between px-3 rounded-xl transition-all group cursor-pointer border border-transparent",
                    isCurrent ? "bg-brand/15 border-brand/30 text-white" : "hover:bg-white/5 text-zinc-300"
                  )}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="w-6 text-center text-xs font-mono font-bold text-zinc-500 group-hover:text-white shrink-0">
                      {index + 1}
                    </span>
                    <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center text-zinc-500 relative">
                      <UniversalMediaCover track={item} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs sm:text-sm font-bold truncate", isCurrent ? "text-brand" : "text-white")}>
                        {displayTitle}
                      </p>
                      <p className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">
                        {displayArtist}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pl-2">
                    {item.duration && (
                      <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
                        {formatDuration(item.duration)}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTrack(item, filteredItems);
                      }}
                      className="w-8 h-8 rounded-full bg-white/5 group-hover:bg-brand group-hover:text-white flex items-center justify-center text-zinc-400 transition-all cursor-pointer"
                    >
                      {isCurrent && isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
