"use client";

import React, { useState, useMemo, useId } from "react";
import { Heart, Play, Pause } from "lucide-react";
import { cn, formatDisplayTitle, getTrackCover } from "@/lib/utils";
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from "framer-motion";
import { TrackActionsDropdown } from "@/components/shared/TrackActionsDropdown";

/* ── Springs (iOS-like) ── */
const SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.8 };
const SPRING_SOFT = { type: "spring" as const, stiffness: 300, damping: 32, mass: 0.9 };
const SPRING_SNAPPY = { type: "spring" as const, stiffness: 620, damping: 32, mass: 0.6 };

interface JioSaavnSongTableProps {
  tracks: any[];
  currentTrackId?: string;
  isPlaying?: boolean;
  likedTrackIds?: string[];
  onPlayTrack: (track: any) => void;
  onToggleLike?: (trackId: string, e: React.MouseEvent) => void;
}

const SORTS: { key: "popular" | "date" | "name"; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "date", label: "Newest" },
  { key: "name", label: "A–Z" },
];

/*
 * ONE grid template shared by the header and every row, so the columns can never drift apart.
 * Cells, in order:  #  |  artwork  |  song  |  artist (md+)  |  album (md+)  |  like  |  time  |  more
 */
const GRID =
  "grid items-center gap-3 grid-cols-[24px_40px_minmax(0,1fr)_32px_40px_28px] md:grid-cols-[32px_40px_minmax(0,2.4fr)_minmax(0,1.6fr)_minmax(0,1.6fr)_32px_44px_32px]";

/** Animated equalizer for the playing track (Apple Music red bars) */
function Equalizer({ playing }: { playing: boolean }) {
  const reduce = useReducedMotion();
  const bars = [
    [0.35, 1, 0.5, 0.85, 0.35],
    [0.9, 0.4, 1, 0.5, 0.9],
    [0.5, 0.85, 0.35, 1, 0.5],
  ];
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {bars.map((frames, i) => (
        <motion.span
          key={i}
          className="w-[3px] origin-bottom rounded-[1px] bg-brand"
          style={{ height: "100%" }}
          animate={playing && !reduce ? { scaleY: frames } : { scaleY: 0.35 }}
          transition={
            playing && !reduce
              ? { duration: 0.9 + i * 0.12, repeat: Infinity, ease: "easeInOut" }
              : SPRING_SOFT
          }
        />
      ))}
    </span>
  );
}

export function JioSaavnSongTable({
  tracks,
  currentTrackId,
  isPlaying,
  likedTrackIds = [],
  onPlayTrack,
  onToggleLike,
}: JioSaavnSongTableProps) {
  const uid = useId();
  const [activeSort, setActiveSort] = useState<"popular" | "date" | "name">("popular");
  const [visibleCount, setVisibleCount] = useState<number>(10);

  const sortedTracks = useMemo(() => {
    if (!tracks || tracks.length === 0) return [];
    const list = [...tracks];

    if (activeSort === "popular") {
      return list.sort((a, b) => {
        const aStreams = a.streams || parseInt(a.play_count || "0", 10) || 0;
        const bStreams = b.streams || parseInt(b.play_count || "0", 10) || 0;
        return bStreams - aStreams;
      });
    }

    if (activeSort === "date") {
      return list.sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : (a.year ? new Date(`${a.year}-01-01`).getTime() : 0);
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : (b.year ? new Date(`${b.year}-01-01`).getTime() : 0);
        return dateB - dateA;
      });
    }

    if (activeSort === "name") {
      return list.sort((a, b) => {
        const titleA = (a.title || a.name || "").toLowerCase();
        const titleB = (b.title || b.name || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
    }

    return list;
  }, [tracks, activeSort]);

  const displayedTracks = sortedTracks.slice(0, visibleCount);
  const hasMore = visibleCount < sortedTracks.length;

  const formatDuration = (seconds?: number) => {
    if (!seconds || isNaN(seconds)) return "3:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!tracks || tracks.length === 0) return null;

  return (
    <section className="mb-9 select-none">
      <LayoutGroup id={uid}>
        {/* ── Sort: flat segmented control ── */}
        <div className="mb-3 flex items-center">
          <div
            role="tablist"
            aria-label="Sort songs"
            className="relative flex items-center rounded-[8px] bg-white/[0.08] p-[2px]"
          >
            {SORTS.map((s) => {
              const active = activeSort === s.key;
              return (
                <motion.button
                  key={s.key}
                  role="tab"
                  aria-selected={active}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_SNAPPY}
                  onClick={() => {
                    setActiveSort(s.key);
                    setVisibleCount(10);
                  }}
                  className="relative cursor-pointer rounded-[6px] px-3.5 py-1 text-[12px] font-medium tracking-[-0.005em] outline-none"
                >
                  {active && (
                    <motion.span
                      layoutId="saavn-sort-pill"
                      transition={SPRING}
                      className="absolute inset-0 rounded-[6px] bg-white/[0.16]"
                    />
                  )}
                  <span className={cn("relative transition-colors duration-200", active ? "text-white" : "text-white/55 hover:text-white/85")}>
                    {s.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ── Column header (same grid as the rows) ── */}
        <div className={cn(GRID, "border-b border-white/[0.08] px-2 pb-2 text-[12px] font-medium text-white/45")}>
          <span className="text-center">#</span>
          <span aria-hidden="true" />
          <span>Song</span>
          <span className="hidden md:block">Artist</span>
          <span className="hidden md:block">Album</span>
          <span aria-hidden="true" />
          <span className="text-right">Time</span>
          <span aria-hidden="true" />
        </div>

        {/* ── Rows ── */}
        <div className="flex flex-col pt-1">
          {displayedTracks.map((track, idx) => {
            const isCurrent = currentTrackId === track.id;
            const isThisPlaying = isCurrent && !!isPlaying;
            const cover = getTrackCover(track);
            const title = formatDisplayTitle(track.title || track.name) || track.title || `Track ${idx + 1}`;
            const artistName = track.artist?.name || (Array.isArray(track.artists) ? track.artists.map((a: any) => a.name).join(", ") : track.artist) || "";
            const albumName = track.album?.title || track.albumTitle || track.album || "";
            const isLiked = likedTrackIds.includes(track.id);
            const isLast = idx === displayedTracks.length - 1;
            const rowKey = track.id || `track-${idx}`;

            // Heart and three dots: hidden until the row is hovered (always visible on touch)
            const revealOnHover =
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

            return (
              <motion.div
                key={rowKey}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  opacity: { duration: 0.2, delay: Math.min(idx * 0.02, 0.2) },
                  y: { ...SPRING_SOFT, delay: Math.min(idx * 0.02, 0.2) },
                }}
                onClick={() => onPlayTrack(track)}
                style={{ zIndex: undefined }}
                className={cn(
                  GRID,
                  "group relative h-[56px] cursor-pointer rounded-[6px] px-2 transition-colors duration-150",
                  isCurrent ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"
                )}
              >
                {/* Hairline separator */}
                {!isLast && (
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-0 left-[60px] right-2 h-px bg-white/[0.07] transition-opacity duration-150",
                      "group-hover:opacity-0",
                      isCurrent && "opacity-0"
                    )}
                  />
                )}

                {/* # : number / equalizer, becomes play-pause on hover (Apple Music) */}
                <div className="relative flex h-full items-center justify-center text-[14px] tabular-nums text-white/50">
                  <span className="transition-opacity duration-150 group-hover:opacity-0">
                    {isCurrent ? <Equalizer playing={isThisPlaying} /> : idx + 1}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    {isThisPlaying ? (
                      <Pause size={15} className="fill-white" />
                    ) : (
                      <Play size={15} className="fill-white" />
                    )}
                  </span>
                </div>

                {/* Artwork */}
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[4px] bg-zinc-900 ring-1 ring-inset ring-white/[0.08]">
                  <img
                    src={cover}
                    alt={title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=160";
                    }}
                  />
                </div>

                {/* Song (artist underneath on small screens) */}
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-[14px] leading-[18px] tracking-[-0.01em]",
                      isCurrent ? "font-medium text-brand" : "font-normal text-white"
                    )}
                  >
                    {title}
                  </p>
                  <p className="truncate text-[13px] leading-[17px] text-white/55 md:hidden">{artistName}</p>
                </div>

                {/* Artist */}
                <div className="hidden min-w-0 md:block">
                  <p className="truncate text-[14px] text-white/60 transition-colors duration-150 group-hover:text-white/85">{artistName}</p>
                </div>

                {/* Album */}
                <div className="hidden min-w-0 md:block">
                  <p className="truncate text-[14px] text-white/60 transition-colors duration-150 group-hover:text-white/85">{albumName}</p>
                </div>

                {/* Like */}
                <div className="flex items-center justify-center">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.82 }}
                    transition={SPRING_SNAPPY}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onToggleLike) onToggleLike(track.id, e);
                    }}
                    className={cn(
                      "cursor-pointer rounded-full p-1.5 outline-none transition-[opacity,color] duration-150",
                      isLiked ? "text-brand opacity-100" : cn("text-white/65 hover:text-white", revealOnHover)
                    )}
                    title={isLiked ? "Remove from Favorites" : "Add to Favorites"}
                    aria-pressed={isLiked}
                  >
                    <motion.span
                      className="flex"
                      initial={false}
                      animate={{ scale: isLiked ? [1, 1.3, 1] : 1 }}
                      transition={isLiked ? { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] } : SPRING}
                    >
                      <Heart size={16} className={cn(isLiked && "fill-brand text-brand")} />
                    </motion.span>
                  </motion.button>
                </div>

                {/* Time */}
                <div className="text-right text-[13px] tabular-nums text-white/55">{formatDuration(track.duration)}</div>

                {/* Three dots */}
                <div className="relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                  <TrackActionsDropdown
                    track={track}
                    align="end"
                    context="artist"
                    hideItems={["view-details"]}
                    triggerClassName={cn(
                      "cursor-pointer rounded-full p-1.5 text-white/70 outline-none transition-[opacity,color] duration-150 hover:text-white",
                      "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    )}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── Show More ── */}
        <AnimatePresence>
          {hasMore && (
            <motion.div
              key="load-more"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 flex justify-center"
            >
              <motion.button
                onClick={() => setVisibleCount((prev) => prev + 15)}
                whileTap={{ scale: 0.95 }}
                transition={SPRING_SNAPPY}
                className="cursor-pointer rounded-[8px] px-4 py-1.5 text-[13px] font-semibold tracking-[-0.01em] text-brand outline-none transition-colors hover:bg-white/[0.06]"
              >
                Show More
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </section>
  );
}