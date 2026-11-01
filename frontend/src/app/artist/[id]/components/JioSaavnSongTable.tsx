"use client";

/**
 * JioSaavnSongTable — Apple Music / YT Music style song list.
 *
 *   #  | [art] Song name           | Album (link)            | ⋯  3:42
 *
 *  • only: order number, album art, song name, album name, time
 *  • the ⋯ menu appears next to the time when the row is hovered
 *  • album name links to the album page
 *  • tabs: Popular / Newest / A–Z, and "Show more"
 *
 * Props are unchanged, so ArtistPage keeps working.
 * (likedTrackIds / onToggleLike are still accepted; liking now lives in the ⋯ menu.)
 */

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { TrackActionsDropdown } from "@/components/shared/TrackActionsDropdown";
import { cn, getMediaUrl, formatDisplayTitle, decodeHtmlEntities } from "@/lib/utils";
import { Equalizer } from "@/components/ui/Equalizer";
import { SwiftUIPlay, SwiftUIPause, SwiftUIEllipsis } from "@/components/ui/SwiftUIIcons";

interface JioSaavnSongTableProps {
  tracks: any[];
  currentTrackId?: string;
  isPlaying?: boolean;
  likedTrackIds?: string[];
  onPlayTrack: (track: any) => void;
  onToggleLike?: (trackId: string, e?: React.MouseEvent) => void;
}

type SortKey = "popular" | "newest" | "az";
const TABS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "newest", label: "Newest" },
  { key: "az", label: "A–Z" },
];
const PAGE = 10;

const GRID =
  "grid grid-cols-[28px_minmax(0,1fr)_92px] items-center gap-x-3 sm:grid-cols-[40px_minmax(0,1.5fr)_92px] md:grid-cols-[40px_minmax(0,1.6fr)_minmax(0,1fr)_92px] md:gap-x-4";

const fmt = (secs?: number) => {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Album name + link target (same rules as the track page) */
function albumInfo(track: any) {
  const title: string = decodeHtmlEntities(String(track?.title || ""));
  const movie = title.match(/[\(\[]\s*From\s+["'“]?([^"'”\)\]]+)["'”]?\s*[\)\]]/i)?.[1]?.trim() || null;

  const name = decodeHtmlEntities(
    String(track?.album?.title || track?.albumTitle || track?.collectionName || "").trim()
  );
  const id = track?.album?.id || track?.albumId || track?.collectionId;
  const external =
    id && ["saavn-album-", "itunes-album-", "yt-album-"].some((p) => String(id).startsWith(p));

  const sameAsSong = name.toLowerCase() === title.trim().toLowerCase();
  const valid = name && name.toLowerCase() !== "unknown" && !sameAsSong;

  const target = movie || (external ? id : valid ? name : id);
  return {
    name: valid ? name : movie || "Single",
    href: target ? `/album/${encodeURIComponent(String(target))}` : undefined,
  };
}

export function JioSaavnSongTable({
  tracks,
  currentTrackId,
  isPlaying,
  onPlayTrack,
}: JioSaavnSongTableProps) {
  const [sort, setSort] = useState<SortKey>("popular");
  const [visible, setVisible] = useState(PAGE);

  const sorted = useMemo(() => {
    const list = [...(tracks || [])];
    if (sort === "az") {
      list.sort((a, b) =>
        String(formatDisplayTitle(a?.title) || "").localeCompare(String(formatDisplayTitle(b?.title) || ""), undefined, {
          sensitivity: "base",
        })
      );
    } else if (sort === "newest") {
      const t = (x: any) => new Date(x?.releaseDate || x?.createdAt || 0).getTime() || 0;
      list.sort((a, b) => t(b) - t(a));
    }
    return list;
  }, [tracks, sort]);

  if (!sorted.length) return null;

  const shown = sorted.slice(0, visible);

  return (
    <section aria-label="Top songs" className="w-full">
      {/* Tabs */}
      <div className="mb-3 inline-flex rounded-lg bg-white/[0.06] p-[3px]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setSort(t.key);
              setVisible(PAGE);
            }}
            className={cn(
              "cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-semibold outline-none transition-colors duration-200",
              sort === t.key ? "bg-white/[0.16] text-white" : "text-white/55 hover:text-white"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Column header */}
      <div className={cn(GRID, "border-b border-white/[0.08] px-2 pb-2 text-[12px] font-medium text-white/45")}>
        <span className="text-center">#</span>
        <span>Song</span>
        <span className="hidden md:block">Album</span>
        <span className="pr-1 text-right">Time</span>
      </div>

      {/* Rows */}
      <div role="list">
        {shown.map((track, i) => {
          const active = currentTrackId === track.id;
          const playingNow = active && !!isPlaying;
          const album = albumInfo(track);
          const cover =
            getMediaUrl(track?.coverUrl || track?.artwork || track?.image || track?.album?.coverUrl) ||
            "/logo.png";

          return (
            <div
              key={track.id ?? i}
              role="listitem"
              onClick={() => onPlayTrack(track)}
              className={cn(
                GRID,
                "group relative cursor-pointer select-none rounded-lg border-b border-white/[0.06] px-2 py-2 transition-colors duration-150",
                active ? "bg-white/[0.08]" : "hover:bg-white/[0.06]"
              )}
            >
              {/* # (becomes play/pause on hover, equalizer while playing) */}
              <div className="flex items-center justify-center text-[14px] tabular-nums text-white/45">
                {playingNow ? (
                  <span className="group-hover:hidden">
                    <Equalizer playing size="sm" />
                  </span>
                ) : (
                  <span className={cn("group-hover:hidden", active && "text-brand")}>{i + 1}</span>
                )}
                <span className="hidden text-white group-hover:block">
                  {playingNow ? (
                    <SwiftUIPause size={16} fill="currentColor" />
                  ) : (
                    <SwiftUIPlay size={16} fill="currentColor" className="ml-0.5" />
                  )}
                </span>
              </div>

              {/* Art + song name */}
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="size-11 shrink-0 rounded-md bg-zinc-800 object-cover ring-1 ring-white/10"
                />
                <span
                  className={cn(
                    "truncate text-[15px] font-medium tracking-[-0.01em]",
                    active ? "text-brand" : "text-white"
                  )}
                >
                  {formatDisplayTitle(track.title)}
                </span>
              </div>

              {/* Album (link) */}
              <div className="hidden min-w-0 md:block">
                {album.href ? (
                  <Link
                    href={album.href}
                    onClick={(e) => e.stopPropagation()}
                    className="block w-fit max-w-full truncate text-[14px] text-white/55 transition-colors hover:text-white hover:underline"
                  >
                    {album.name}
                  </Link>
                ) : (
                  <span className="block truncate text-[14px] text-white/55">{album.name}</span>
                )}
              </div>

              {/* ⋯ (on hover) + time */}
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <TrackActionsDropdown
                  track={track}
                  context="row"
                  align="end"
                  glass
                  trigger={
                    <button
                      type="button"
                      title="More options"
                      aria-label="More options"
                      className={cn(
                        "flex size-7 cursor-pointer items-center justify-center rounded-full text-white/70 outline-none transition-[opacity,background-color,color] duration-150",
                        "opacity-0 hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100",
                        "[@media(hover:none)]:opacity-100"
                      )}
                    >
                      <SwiftUIEllipsis size={17} fill="currentColor" />
                    </button>
                  }
                />
                <span className="w-10 text-right text-[13px] tabular-nums text-white/55">
                  {fmt(track.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more */}
      {visible < sorted.length && (
        <button
          onClick={() => setVisible((v) => v + PAGE)}
          className="mt-3 cursor-pointer rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-semibold text-white/85 outline-none transition-colors hover:bg-white/[0.18] hover:text-white"
        >
          Show more
        </button>
      )}
    </section>
  );
}
