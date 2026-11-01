"use client";

/**
 * LikedSongsPage — Apple Music playlist layout
 *
 * Structure (one continuous page, no tabs):
 *   1. Hero            artwork · title · owner · meta · Play / Shuffle
 *   2. Compact bar     slides in under the top edge once the hero scrolls away
 *   3. Songs           Filter field + table (thumb · song · artist · album · time · ⋯)
 *                      zebra rows on tablet/desktop, iOS-style list on phones
 *   4. Footer          "128 songs, 8 hours, 12 minutes"
 *   5. Shelves         Albums and Artists as horizontal snap carousels
 *
 * Responsive columns:  phone  → song · ⋯
 *                      tablet → song · time · ⋯
 *                      lg     → song · artist · time · ⋯
 *                      xl     → song · artist · album · time · ⋯
 *
 * Deep links keep working: /liked?section=albums|artists|songs scrolls to that block.
 * Long libraries render progressively (60 rows, then more as you scroll).
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion, type Transition } from "framer-motion";
import { Search, X, Play, Pause, Shuffle, ArrowUpDown, Check, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { SwiftUIHeart } from "@/components/ui/SwiftUIIcons";
import { ArtistLinks } from "@/components/shared/ArtistLinks";
import { ArtistPortrait } from "@/components/shared/ArtistPortrait";
import { DynamicBackground } from "@/components/shared/DynamicBackground";
import { SEO } from "@/components/shared/SEO";
import { TrackActionsDropdown } from "@/components/shared/TrackActionsDropdown";
import api from "@/lib/api";
import { Track, usePlayerStore } from "@/store/player";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/authStore";
import { cn, getMediaUrl, formatDisplayTitle } from "@/lib/utils";
import { applyArtworkTheme, resetArtworkTheme, extractArtworkAverageColor } from "@/lib/theme";

type SortKey = "recent" | "title" | "artist";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently Added" },
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
];

const PAGE_SIZE = 60;

const SPRING: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 };
const SPRING_SOFT: Transition = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 };
const SPRING_POP: Transition = { type: "spring", stiffness: 520, damping: 26, mass: 0.6 };

/* One grid template shared by the header row and every song row */
const ROW_GRID =
  "grid items-center gap-x-3 md:gap-x-4 " +
  "grid-cols-[minmax(0,1fr)_40px] " +
  "sm:grid-cols-[minmax(0,1fr)_48px_40px] " +
  "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_56px_40px] " +
  "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_56px_40px]";

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* ─────────────────────────────────── Page ─────────────────────────────────── */

export default function LikedSongsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduce = useReducedMotion();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showCompactBar, setShowCompactBar] = useState(false);

  const { user, isAuthenticated } = useAuthStore();
  const { showToast, setPlayerMinimized, isLyricsOpen, setIsLyricsOpen } = useUIStore();
  const { currentTrack, isPlaying, togglePlay, setTrack, setQueue, isShuffled, toggleShuffle } = usePlayerStore();

  /* ─── Data ─── */
  const { data: likedTracks = [], isLoading: isLoadingTracks } = useQuery<Track[]>({
    queryKey: ["liked-tracks"],
    queryFn: async () => {
      const res = await api.get("tracks/liked");
      const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];
      return arr as Track[];
    },
    enabled: isAuthenticated,
  });

  const { data: userAlbums = [] } = useQuery({
    queryKey: ["my-albums"],
    queryFn: async () => {
      const res = await api.get("albums");
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isAuthenticated,
  });

  const { data: overview } = useQuery({
    queryKey: ["library-overview"],
    queryFn: async () => {
      const res = await api.get("analytics/library-overview");
      return res.data;
    },
    enabled: isAuthenticated,
  });

  const likedAlbums = useMemo(() => {
    const map = new Map<string, any>();

    for (const alb of userAlbums || []) {
      if (alb?.id && !map.has(alb.id)) {
        map.set(alb.id, {
          id: alb.id,
          title: alb.title || "Unknown Album",
          coverUrl: alb.coverUrl,
          artist: alb.artist || { name: alb.artistName || "Unknown Artist" },
          trackCount: alb._count?.tracks || alb.tracks?.length || 0,
        });
      }
    }

    for (const t of likedTracks || []) {
      const alb = t.album;
      const albId = alb?.id || t.albumId;
      if (albId) {
        if (!map.has(albId)) {
          map.set(albId, {
            id: albId,
            title: alb?.title || (t as any).albumTitle || "Unknown Album",
            coverUrl: alb?.coverUrl || t.coverUrl,
            artist: alb?.artist || t.artist || { name: (t as any).artistName || "Unknown Artist" },
            trackCount: 1,
          });
        } else {
          const existing = map.get(albId);
          if (!existing.coverUrl && t.coverUrl) existing.coverUrl = t.coverUrl;
          existing.trackCount += 1;
        }
      }
    }

    return Array.from(map.values());
  }, [likedTracks, userAlbums]);

  const likedArtists = useMemo(() => {
    const map = new Map<string, any>();

    for (const art of overview?.topArtists || []) {
      if (art?.id && !map.has(art.id)) {
        map.set(art.id, {
          id: art.id,
          name: art.name,
          imageUrl: art.imageUrl || art.avatarUrl,
          songCount: art.count || 0,
        });
      }
    }

    for (const t of likedTracks || []) {
      const art = t.artist;
      const artId = art?.id || t.artistId;
      const artName = art?.name || (t as any).artistName;
      if (artName) {
        const key = artId || artName.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            id: artId || key,
            name: artName,
            imageUrl: art?.imageUrl || art?.image || (t as any).artistImageUrl || t.coverUrl,
            songCount: 1,
          });
        } else {
          const existing = map.get(key);
          if (!existing.imageUrl && t.coverUrl) existing.imageUrl = t.coverUrl;
          existing.songCount += 1;
        }
      }
    }

    return Array.from(map.values());
  }, [likedTracks, overview?.topArtists]);

  /* ─── Filter + sort ─── */
  const filteredTracks = useMemo(() => {
    let list = [...likedTracks];
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter((t) => {
        const titleMatch = (t.title || "").toLowerCase().includes(q);
        const artistMatch = (t.artist?.name || (t as any).artistName || "").toLowerCase().includes(q);
        const albumMatch = (t.album?.title || (t as any).albumTitle || "").toLowerCase().includes(q);
        return titleMatch || artistMatch || albumMatch;
      });
    }
    if (sortBy === "title") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "artist") {
      list.sort((a, b) =>
        (a.artist?.name || (a as any).artistName || "").localeCompare(b.artist?.name || (b as any).artistName || "")
      );
    }
    return list; // "recent" keeps backend order
  }, [likedTracks, searchQuery, sortBy]);

  const filteredAlbums = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return likedAlbums;
    return likedAlbums.filter(
      (a) => (a.title || "").toLowerCase().includes(q) || (a.artist?.name || "").toLowerCase().includes(q)
    );
  }, [likedAlbums, searchQuery]);

  const filteredArtists = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return likedArtists;
    return likedArtists.filter((a) => (a.name || "").toLowerCase().includes(q));
  }, [likedArtists, searchQuery]);

  /* Reset progressive rendering when the list changes shape */
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, sortBy]);

  const visibleTracks = useMemo(() => filteredTracks.slice(0, visibleCount), [filteredTracks, visibleCount]);

  /* Load more as the sentinel approaches the viewport */
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = visibleCount < filteredTracks.length;
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, visibleCount]);

  /* ─── Playback state ─── */
  const isLikedActive = useMemo(() => {
    if (!currentTrack || !likedTracks.length) return false;
    return likedTracks.some((t) => t.id === currentTrack.id);
  }, [currentTrack, likedTracks]);
  const isLikedCurrentlyPlaying = isLikedActive && isPlaying;

  const handlePlayAll = () => {
    if (!likedTracks.length) {
      showToast("No liked songs to play", "error");
      return;
    }
    if (isLikedActive) {
      togglePlay();
    } else {
      setQueue(likedTracks);
      setTrack(likedTracks[0], likedTracks);
      setPlayerMinimized(false);
    }
  };

  const handleShufflePlay = () => {
    if (!likedTracks.length) {
      showToast("No liked songs to shuffle", "error");
      return;
    }
    if (isLikedActive) {
      toggleShuffle();
    } else {
      const shuffled = shuffleArray(likedTracks);
      setQueue(shuffled);
      setTrack(shuffled[0], shuffled);
      setPlayerMinimized(false);
      if (!isShuffled) toggleShuffle();
    }
  };

  /* Stable row-play handler (latest values live in a ref so memoised rows don't all re-render) */
  const playCtx = useRef({ currentId: currentTrack?.id, list: filteredTracks });
  playCtx.current = { currentId: currentTrack?.id, list: filteredTracks };
  const handlePlayRow = useCallback(
    (t: Track) => {
      const { currentId, list } = playCtx.current;
      if (currentId === t.id) {
        togglePlay();
      } else {
        setQueue(list);
        setTrack(t, list);
        setPlayerMinimized(false);
      }
    },
    [togglePlay, setQueue, setTrack, setPlayerMinimized]
  );

  /* ─── Ambient colour ─── */
  const heroCover = likedTracks[0]?.coverUrl || null;
  useEffect(() => {
    if (!heroCover) return;
    let cancelled = false;
    extractArtworkAverageColor(heroCover).then((rgb) => {
      if (!cancelled && rgb) applyArtworkTheme(rgb[0], rgb[1], rgb[2]);
    });
    return () => {
      cancelled = true;
    };
  }, [heroCover]);
  useEffect(() => {
    return () => resetArtworkTheme();
  }, []);

  /* ─── Totals ─── */
  const totalSec = useMemo(() => likedTracks.reduce((sum, t) => sum + (t.duration || 0), 0), [likedTracks]);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const minsShown = hrs === 0 ? Math.max(mins, likedTracks.length ? 1 : 0) : mins;
  const durationShort = hrs > 0 ? `${hrs} hr ${mins} min` : `${minsShown} min`;
  const durationLong = [
    hrs > 0 ? `${hrs} hour${hrs !== 1 ? "s" : ""}` : "",
    hrs === 0 || mins > 0 ? `${minsShown} minute${minsShown !== 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  /* ─── Compact bar: appears when the hero buttons scroll out of view ─── */
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = actionsRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => setShowCompactBar(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: "-56px 0px 0px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [isLoadingTracks, likedTracks.length]);

  /* ─── Deep links: ?section=songs|albums|artists scrolls to that block once ─── */
  const songsRef = useRef<HTMLElement>(null);
  const albumsRef = useRef<HTMLElement>(null);
  const artistsRef = useRef<HTMLElement>(null);
  const didDeepLink = useRef(false);
  const sectionParam = searchParams.get("section") || searchParams.get("tab");
  useEffect(() => {
    if (didDeepLink.current || isLoadingTracks || !likedTracks.length || !sectionParam) return;
    const target =
      sectionParam === "albums" ? albumsRef : sectionParam === "artists" ? artistsRef : sectionParam === "songs" ? songsRef : null;
    if (!target) return;
    didDeepLink.current = true;
    requestAnimationFrame(() =>
      target.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
    );
  }, [sectionParam, isLoadingTracks, likedTracks.length, reduce]);

  /* ─── Header sort (desktop): click a column to sort, click again to reset ─── */
  const toggleColumnSort = (key: Exclude<SortKey, "recent">) => setSortBy((prev) => (prev === key ? "recent" : key));

  const ownerName = user?.name || user?.username || "Your Library";
  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="relative min-h-screen w-full bg-transparent text-white">
      <SEO
        title="Liked Songs – Zenify"
        description="Listen to your favorite liked songs, saved albums, and followed artists on Zenify."
        path="/liked"
        noindex={true}
      />

      {/* Ambient artwork glow */}
      <div
        className="am-layout-transition pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
        style={{
          marginLeft: "calc(var(--sb-w) * -1)",
          marginRight: "calc(var(--rp-w) * -1)",
          width: "calc(100% + var(--sb-w) + var(--rp-w))",
        }}
      >
        <DynamicBackground surface="albumPage" coverUrl={heroCover} />
      </div>

      <div className="relative z-10 mx-auto w-full min-w-0 max-w-7xl px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 md:px-10 md:pt-10">
        {/* ── Compact bar (zero-height sticky anchor, bar overlays content) ── */}
        <div className="sticky top-[var(--topbar-h,0px)] z-30 -mx-4 h-0 sm:-mx-6 md:-mx-10">
          <AnimatePresence>
            {showCompactBar && likedTracks.length > 0 && (
              <motion.div
                initial={reduce ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
                transition={SPRING}
                className="absolute inset-x-0 top-0 flex h-14 items-center gap-3 border-b border-white/[0.08] bg-[#161618]/70 px-4 backdrop-blur-2xl sm:px-6 md:px-10"
              >
                <img
                  src={getMediaUrl(likedTracks[0]?.coverUrl) || "/logo.png"}
                  alt=""
                  className="size-8 shrink-0 rounded-[6px] object-cover ring-1 ring-white/10"
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">Liked Songs</span>
                <motion.button
                  type="button"
                  onClick={handlePlayAll}
                  whileTap={{ scale: 0.88 }}
                  transition={SPRING_POP}
                  aria-label={isLikedCurrentlyPlaying ? "Pause" : "Play"}
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {isLikedCurrentlyPlaying ? (
                    <Pause size={16} className="fill-current" />
                  ) : (
                    <Play size={16} className="ml-0.5 fill-current" />
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── 1. HERO ── */}
        <header className="flex w-full min-w-0 flex-col items-center gap-5 text-center sm:gap-6 md:flex-row md:items-end md:gap-8 md:text-left">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.9, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={SPRING_SOFT}
            className="relative flex aspect-square w-[min(232px,62vw)] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-gradient-to-br from-[#9E2339] via-[#861E30] to-[#18181B] shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10 sm:w-[260px] md:w-[232px] lg:w-[272px] xl:w-[296px]"
          >
            {likedTracks.length >= 4 ? (
              <div className="relative grid h-full w-full grid-cols-2 grid-rows-2">
                {likedTracks.slice(0, 4).map((t, idx) => (
                  <img
                    key={t.id || idx}
                    src={getMediaUrl(t.coverUrl) || "/logo.png"}
                    alt=""
                    className="h-full w-full select-none object-cover"
                    loading={idx === 0 ? "eager" : "lazy"}
                    decoding="async"
                  />
                ))}
                <div className="absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full border border-white/20 bg-black/55 shadow-2xl backdrop-blur-xl sm:size-16">
                  <SwiftUIHeart size={24} filled={true} className="text-white drop-shadow-md" />
                </div>
              </div>
            ) : likedTracks.length > 0 ? (
              <>
                <img
                  src={getMediaUrl(likedTracks[0].coverUrl) || "/logo.png"}
                  alt=""
                  className="h-full w-full select-none object-cover"
                  decoding="async"
                />
                <div className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/55 backdrop-blur-xl">
                  <SwiftUIHeart size={16} filled={true} className="text-white" />
                </div>
              </>
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md">
                <SwiftUIHeart size={38} filled={true} className="text-white drop-shadow-md" />
              </div>
            )}
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_SOFT, delay: 0.05 }}
            className="flex w-full min-w-0 flex-1 flex-col items-center md:items-start"
          >
            <h1 className="w-full break-words text-[26px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[32px] md:text-[40px] lg:text-[44px]">
              Liked Songs
            </h1>
            <p className="mt-1 text-[17px] font-medium text-brand sm:text-[19px]">{ownerName}</p>
            <p className="mt-1 text-[13px] font-medium text-white/50">
              {likedTracks.length} {likedTracks.length === 1 ? "song" : "songs"}
              {likedTracks.length > 0 && ` · ${durationShort}`}
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="font-semibold text-white/75">Lossless</span>
            </p>
            <p className="mt-2 hidden max-w-xl text-[14px] leading-snug text-white/55 md:block">
              Every song you’ve hearted, with the albums and artists behind them.
            </p>

            {/* Play / Shuffle */}
            <div ref={actionsRef} className="mt-5 flex w-full max-w-[400px] gap-3 md:w-auto md:max-w-none">
              <motion.button
                type="button"
                onClick={handlePlayAll}
                disabled={!likedTracks.length}
                whileTap={reduce ? undefined : { scale: 0.96 }}
                transition={SPRING_POP}
                className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand text-[16px] font-semibold text-white outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 md:h-10 md:min-w-[128px] md:flex-none md:rounded-full md:px-6 md:text-[15px]"
              >
                {isLikedCurrentlyPlaying ? (
                  <Pause size={18} className="fill-current" />
                ) : (
                  <Play size={18} className="fill-current" />
                )}
                {isLikedCurrentlyPlaying ? "Pause" : "Play"}
              </motion.button>

              <motion.button
                type="button"
                onClick={handleShufflePlay}
                disabled={!likedTracks.length}
                aria-pressed={isLikedActive && isShuffled}
                whileTap={reduce ? undefined : { scale: 0.96 }}
                transition={SPRING_POP}
                className={cn(
                  "flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl text-[16px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 md:h-10 md:min-w-[128px] md:flex-none md:rounded-full md:px-6 md:text-[15px]",
                  isLikedActive && isShuffled
                    ? "bg-white/25 text-white"
                    : "bg-white/[0.12] text-white hover:bg-white/[0.18]"
                )}
              >
                <Shuffle size={18} strokeWidth={2.4} />
                Shuffle
              </motion.button>
            </div>
          </motion.div>
        </header>

        {/* ── Body states ── */}
        {isLoadingTracks ? (
          <ListSkeleton />
        ) : likedTracks.length === 0 ? (
          <EmptyState onDiscover={() => router.push("/discover")} reduce={!!reduce} />
        ) : (
          <>
            {/* ── 2. SONGS ── */}
            <section ref={songsRef} aria-label="Songs" className="mt-8 scroll-mt-20 md:mt-10">
              {/* Filter + sort (sort menu on phones/tablets; columns sort on desktop) */}
              <div className="mb-3 flex items-center gap-2">
                <label className="group relative flex-1 md:max-w-xs md:flex-none">
                  <span className="sr-only">Filter liked songs</span>
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45 transition-colors group-focus-within:text-white/80"
                  />
                  <input
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
                    placeholder="Filter"
                    autoComplete="off"
                    className="h-10 w-full rounded-[10px] bg-white/10 pl-9 pr-9 text-[16px] text-white outline-none transition-[background-color,box-shadow] placeholder:text-white/40 focus:bg-white/[0.16] focus:ring-2 focus:ring-white/20 md:h-9 md:text-[14px]"
                  />
                  <AnimatePresence>
                    {searchQuery && (
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={SPRING_POP}
                        onClick={() => setSearchQuery("")}
                        aria-label="Clear filter"
                        className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/30 text-black hover:bg-white/45"
                      >
                        <X size={11} strokeWidth={3} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </label>

                <div className="md:hidden">
                  <SortMenu value={sortBy} onChange={setSortBy} reduce={!!reduce} />
                </div>
              </div>

              {/* Column header — tablet and up */}
              <div className={cn(ROW_GRID, "hidden border-b border-white/[0.08] px-3 pb-2 text-[12px] font-medium text-white/40 md:grid")}>
                <button
                  type="button"
                  onClick={() => toggleColumnSort("title")}
                  className="flex w-fit cursor-pointer items-center gap-1 outline-none transition-colors hover:text-white/80 focus-visible:text-white"
                >
                  Song
                  {sortBy === "title" && <ChevronUp size={13} className="text-brand" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleColumnSort("artist")}
                  className="hidden w-fit cursor-pointer items-center gap-1 outline-none transition-colors hover:text-white/80 focus-visible:text-white lg:flex"
                >
                  Artist
                  {sortBy === "artist" && <ChevronUp size={13} className="text-brand" />}
                </button>
                <span className="hidden xl:block">Album</span>
                <span className="hidden text-right sm:block">Time</span>
                <span aria-hidden="true" />
              </div>

              {/* Rows */}
              {filteredTracks.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-[17px] font-semibold">No Results</p>
                  {hasQuery && <p className="mt-1 text-[14px] text-white/50">No songs match “{searchQuery.trim()}”.</p>}
                </div>
              ) : (
                <div role="list" className="pt-1 md:pt-2">
                  {visibleTracks.map((track, i) => (
                    <SongRow
                      key={track.id}
                      track={track}
                      zebra={i % 2 === 0}
                      isCurrent={currentTrack?.id === track.id}
                      isPlayingNow={currentTrack?.id === track.id && isPlaying}
                      onPlay={handlePlayRow}
                      isLyricsOpen={isLyricsOpen}
                      onLyricsToggle={() => setIsLyricsOpen(!isLyricsOpen)}
                      showToast={showToast}
                    />
                  ))}
                  {hasMore && <div ref={sentinelRef} className="h-10" aria-hidden="true" />}
                </div>
              )}

              {/* Footer summary */}
              {!hasQuery && (
                <p className="mt-5 px-3 text-[13px] text-white/45">
                  {likedTracks.length} {likedTracks.length === 1 ? "song" : "songs"}
                  {durationLong && `, ${durationLong}`}
                </p>
              )}
            </section>

            {/* ── 3. ALBUMS SHELF ── */}
            {filteredAlbums.length > 0 && (
              <section ref={albumsRef} aria-label="Albums" className="mt-12 scroll-mt-20 md:mt-16">
                <Shelf title="Albums" subtitle="From your liked songs and saved albums">
                  {filteredAlbums.map((album) => (
                    <div key={album.id} className="w-[148px] shrink-0 snap-start sm:w-[168px] lg:w-[184px]">
                      <AlbumCard album={album} />
                    </div>
                  ))}
                </Shelf>
              </section>
            )}

            {/* ── 4. ARTISTS SHELF ── */}
            {filteredArtists.length > 0 && (
              <section ref={artistsRef} aria-label="Artists" className="mt-10 scroll-mt-20 md:mt-14">
                <Shelf title="Artists" subtitle="People behind the songs you love">
                  {filteredArtists.map((artist) => (
                    <div key={artist.id} className="w-[120px] shrink-0 snap-start sm:w-[136px] lg:w-[152px]">
                      <ArtistCard artist={artist} />
                    </div>
                  ))}
                </Shelf>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────── Song row ─────────────────────────────────── */

function Equalizer({ playing }: { playing: boolean }) {
  const reduce = useReducedMotion();
  const frames = [
    [0.35, 1, 0.45, 0.85, 0.35],
    [0.9, 0.4, 1, 0.5, 0.9],
    [0.5, 0.85, 0.35, 1, 0.5],
  ];
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {frames.map((f, i) => (
        <motion.span
          key={i}
          className="w-[2.5px] origin-bottom rounded-full bg-white"
          style={{ height: "100%" }}
          animate={playing && !reduce ? { scaleY: f } : { scaleY: 0.3 }}
          transition={
            playing && !reduce
              ? { duration: 0.8 + i * 0.12, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />
      ))}
    </span>
  );
}

const SongRow = React.memo(function SongRow({
  track,
  zebra,
  isCurrent,
  isPlayingNow,
  onPlay,
  isLyricsOpen,
  onLyricsToggle,
  showToast,
}: {
  track: Track;
  zebra: boolean;
  isCurrent: boolean;
  isPlayingNow: boolean;
  onPlay: (t: Track) => void;
  isLyricsOpen: boolean;
  onLyricsToggle: () => void;
  showToast: (msg: string, type?: any) => void;
}) {
  const cover = getMediaUrl(track.coverUrl) || "/logo.png";
  const title = formatDisplayTitle(track.title) || "Untitled";
  const albumTitle = ((track.album?.title || (track as any).albumTitle || "") as string).trim();
  const albumId = track.album?.id || track.albumId;

  return (
    <div role="listitem">
      <div
        role="button"
        tabIndex={0}
        aria-label={`${isPlayingNow ? "Pause" : "Play"} ${title}`}
        onClick={() => onPlay(track)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPlay(track);
          }
        }}
        className={cn(
          ROW_GRID,
          "group relative min-h-[60px] cursor-pointer rounded-lg px-2 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand md:min-h-[56px] md:px-3",
          isCurrent
            ? "bg-white/[0.12]"
            : cn(
                "active:bg-white/10 [@media(hover:hover)]:hover:bg-white/[0.09]",
                zebra && "md:bg-white/[0.045]"
              )
        )}
      >
        {/* Song: thumbnail + title + artist */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative size-11 shrink-0 overflow-hidden rounded-[6px] bg-zinc-900 ring-1 ring-white/10 md:size-10">
            <img src={cover} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity duration-150",
                isCurrent ? "opacity-100" : "opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              )}
              aria-hidden="true"
            >
              {isPlayingNow ? (
                <>
                  <span className="[@media(hover:hover)]:group-hover:hidden">
                    <Equalizer playing />
                  </span>
                  <Pause size={16} className="hidden fill-white text-white [@media(hover:hover)]:group-hover:block" />
                </>
              ) : (
                <Play size={16} className="ml-0.5 fill-white text-white" />
              )}
            </span>
          </div>

          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-[16px] font-medium leading-tight tracking-[-0.01em] md:text-[15px]",
                isCurrent ? "text-brand" : "text-white"
              )}
            >
              {title}
            </p>
            <div className="mt-0.5 truncate text-[14px] text-white/50 md:text-[13px] lg:hidden" onClick={(e) => e.stopPropagation()}>
              <ArtistLinks track={track} maxArtists={3} linkClassName="text-white/50 hover:text-white hover:underline" />
            </div>
          </div>
        </div>

        {/* Artist (lg+) */}
        <div className="hidden min-w-0 truncate text-[14px] text-white/55 lg:block" onClick={(e) => e.stopPropagation()}>
          <ArtistLinks track={track} maxArtists={3} linkClassName="text-white/55 hover:text-white hover:underline" />
        </div>

        {/* Album (xl+) */}
        <div className="hidden min-w-0 truncate text-[14px] text-white/55 xl:block" onClick={(e) => e.stopPropagation()}>
          {albumTitle ? (
            albumId ? (
              <Link href={`/album/${albumId}`} className="hover:text-white hover:underline">
                {albumTitle}
              </Link>
            ) : (
              albumTitle
            )
          ) : (
            <span className="text-white/25">—</span>
          )}
        </div>

        {/* Time */}
        <span className="hidden text-right text-[13px] tabular-nums text-white/45 sm:block">{fmtClock(track.duration)}</span>

        {/* Row menu */}
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <TrackActionsDropdown
            track={track}
            context="playlist"
            align="end"
            glass
            isLyricsOpen={isLyricsOpen}
            onLyricsToggle={onLyricsToggle}
            showToast={showToast}
            triggerClassName="size-9 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-white/10"
          />
        </div>
      </div>
    </div>
  );
});

/* ─────────────────────────────────── Shelf / cards ─────────────────────────────────── */

function Shelf({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);

  const check = useCallback(() => {
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, [el]);

  useEffect(() => {
    check();
    if (!el) return;
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [el, check, children]);

  const scroll = (dir: -1 | 1) => {
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 240), behavior: "smooth" });
  };

  const arrow = (side: "left" | "right") =>
    cn(
      "absolute top-[calc(50%-24px)] z-10 hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-[#242426]/80 text-white shadow-xl backdrop-blur-xl outline-none transition-all hover:scale-105 hover:bg-[#2c2c2e] active:scale-95 focus-visible:ring-2 focus-visible:ring-brand md:flex",
      side === "left" ? "left-1" : "right-1"
    );

  return (
    <div>
      <div className="mb-3 px-1">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] sm:text-[22px]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-white/45">{subtitle}</p>}
      </div>
      <div className="relative -mx-4 sm:-mx-6 md:-mx-10">
        {canL && (
          <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`} className={arrow("left")}>
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>
        )}
        {canR && (
          <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`} className={arrow("right")}>
            <ChevronRight size={20} strokeWidth={2.4} />
          </button>
        )}
        <div
          ref={setEl}
          className="no-scrollbar flex snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:gap-4 sm:px-6 md:px-10"
          style={{ scrollPaddingLeft: "1rem", WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function AlbumCard({ album }: { album: any }) {
  const coverUrl = getMediaUrl(album.coverUrl) || "/logo.png";
  const artistName = formatDisplayTitle(album.artist?.name || "Unknown Artist");
  const albumTitle = formatDisplayTitle(album.title || "Untitled Album");

  return (
    <Link href={`/album/${album.id}`} className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <motion.div
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.96 }}
        transition={SPRING}
        className="mb-2 aspect-square overflow-hidden rounded-[10px] bg-zinc-900 shadow-[0_6px_20px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/10"
      >
        <img
          src={coverUrl}
          alt=""
          width={184}
          height={184}
          loading="lazy"
          decoding="async"
          className="h-full w-full select-none object-cover"
        />
      </motion.div>
      <h3 className="truncate text-[14px] font-medium leading-snug">{albumTitle}</h3>
      <p className="mt-0.5 truncate text-[13px] text-white/50">{artistName}</p>
    </Link>
  );
}

function ArtistCard({ artist }: { artist: any }) {
  const displayName = formatDisplayTitle(artist.name || "Artist");
  return (
    <Link
      href={`/artist/${artist.id}`}
      className="group flex flex-col items-center rounded-xl text-center outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        transition={SPRING}
        className="mb-2 aspect-square w-full overflow-hidden rounded-full bg-zinc-800 shadow-[0_6px_20px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/10"
      >
        <ArtistPortrait name={artist.name} imageUrl={artist.imageUrl} size={152} className="h-full w-full object-cover" />
      </motion.div>
      <h3 className="w-full truncate text-[14px] font-medium leading-snug">{displayName}</h3>
      <p className="mt-0.5 w-full truncate text-[12px] text-white/50">
        {artist.songCount ? `${artist.songCount} ${artist.songCount === 1 ? "song" : "songs"}` : "Artist"}
      </p>
    </Link>
  );
}

/* ─────────────────────────────────── States & menus ─────────────────────────────────── */

function ListSkeleton() {
  return (
    <div className="mt-10 space-y-1" aria-busy="true" aria-label="Loading liked songs">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg px-2 py-2">
          <div className="size-11 shrink-0 rounded-[6px] bg-white/[0.08] md:size-10" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/2 rounded bg-white/[0.08]" />
            <div className="h-3 w-1/3 rounded bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onDiscover, reduce }: { onDiscover: () => void; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className="flex flex-col items-center justify-center px-6 py-20 text-center"
    >
      <motion.div
        animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="mb-6 flex size-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]"
      >
        <SwiftUIHeart size={32} className="text-white/45" strokeWidth={1.5} />
      </motion.div>
      <h3 className="mb-2 text-[22px] font-bold tracking-tight">No Liked Songs Yet</h3>
      <p className="mb-8 max-w-sm text-[15px] leading-relaxed text-white/55">
        Tap the heart on any song to save it here with its album and artist.
      </p>
      <motion.button
        type="button"
        onClick={onDiscover}
        whileTap={reduce ? undefined : { scale: 0.95 }}
        transition={SPRING_POP}
        className="h-11 cursor-pointer rounded-full bg-white px-8 text-[15px] font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Discover Music
      </motion.button>
    </motion.div>
  );
}

function SortMenu({ value, onChange, reduce }: { value: SortKey; onChange: (k: SortKey) => void; reduce: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = SORT_OPTIONS.find((o) => o.key === value)?.label ?? "Sort";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort: ${label}`}
        className={cn(
          "flex size-10 cursor-pointer items-center justify-center rounded-[10px] bg-white/10 text-white/80 outline-none transition-colors hover:bg-white/[0.16] hover:text-white focus-visible:ring-2 focus-visible:ring-brand",
          open && "bg-white/[0.16] text-white"
        )}
      >
        <ArrowUpDown size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={reduce ? false : { opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -4, transition: { duration: 0.1 } }}
            transition={SPRING}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#242426]/90 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="menuitemradio"
                aria-checked={value === opt.key}
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
                className="flex h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-[15px] font-medium text-white outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10"
              >
                {opt.label}
                {value === opt.key && <Check size={16} strokeWidth={3} className="text-brand" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}