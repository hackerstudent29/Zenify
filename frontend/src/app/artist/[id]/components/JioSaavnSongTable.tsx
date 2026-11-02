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

import { ArtistLinks } from "@/components/shared/ArtistLinks";

import { cn, getMediaUrl, formatDisplayTitle, decodeHtmlEntities } from "@/lib/utils";

import { Equalizer } from "@/components/ui/Equalizer";

import { SwiftUIPlay, SwiftUIPause, SwiftUIEllipsis, SwiftUIHeart } from "@/components/ui/SwiftUIIcons";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";



export type SortKey = "popular" | "recent" | "newest" | "az";



export interface JioSaavnSongTableProps {

  tracks: any[];

  currentTrackId?: string;

  isPlaying?: boolean;

  likedTrackIds?: string[];

  onPlayTrack: (track: any) => void;

  onToggleLike?: (trackId: string, e?: React.MouseEvent) => void;

  showArtist?: boolean;

  defaultSort?: SortKey;

  tabs?: { key: SortKey; label: string }[];

  pageSize?: number;

  emptyMessage?: React.ReactNode;

}



const DEFAULT_TABS: { key: SortKey; label: string }[] = [

  { key: "popular", label: "Popular" },

  { key: "newest", label: "Newest" },

  { key: "az", label: "A–Z" },

];

const PAGE = 10;



const GRID =

  "grid grid-cols-[28px_minmax(0,1fr)_120px] items-center gap-x-2 sm:grid-cols-[40px_minmax(0,1.5fr)_124px] md:grid-cols-[40px_minmax(0,1.6fr)_minmax(0,1fr)_130px] md:gap-x-4";



const fmt = (secs?: number) => {

  const s = Math.max(0, Math.round(Number(secs) || 0));

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

};



function isVirtualOrSingleAlbum(name: string, songTitle: string, id?: any): boolean {
  if (!name) return true;
  const nLow = name.toLowerCase().trim();
  const sLow = songTitle.toLowerCase().trim();
  if (
    !nLow ||
    nLow === "single" ||
    nLow === "unknown" ||
    nLow === "undefined" ||
    nLow.includes("youtube releases") ||
    nLow.includes("youtube release")
  ) {
    return true;
  }
  if (id && (String(id).startsWith("yt-album-") || String(id) === "yt-undefined")) {
    return true;
  }
  if (nLow === sLow) return true;

  const cleanSong = sLow.replace(/[^a-z0-9]/gi, "");
  const cleanAlbum = nLow
    .replace(/\s*-\s*single$/i, "")
    .replace(/\s*\(single\)$/i, "")
    .replace(/\s*\[single\]$/i, "")
    .replace(/\s*\(from\s+[^)]+\)/gi, "")
    .replace(/\s*-\s*ep$/i, "")
    .replace(/[^a-z0-9]/gi, "");

  if (cleanAlbum === cleanSong || nLow.startsWith(sLow)) {
    if (nLow.includes("single") || nLow.includes("ep")) return true;
  }
  return false;
}

/** Album name + link target (strictly genuine albums with valid albumId) */
function albumInfo(track: any) {
  const songTitle = decodeHtmlEntities(String(track?.title || "")).trim().toLowerCase();
  const name = decodeHtmlEntities(
    String(track?.album?.title || track?.albumTitle || track?.collectionName || "").trim()
  );
  const id = track?.album?.id || track?.albumId || track?.collectionId;

  // If there's no genuine album or ID, do not display album name or broken link
  if (track?.isSingle || !id || isVirtualOrSingleAlbum(name, songTitle, id)) {
    return {
      name: null,
      href: undefined,
    };
  }

  return {
    name,
    href: `/album/${encodeURIComponent(String(id))}`,
  };
}



export function JioSaavnSongTable({

  tracks,

  currentTrackId,

  isPlaying,

  likedTrackIds,

  onPlayTrack,

  onToggleLike,

  showArtist = false,

  defaultSort = "popular",

  tabs = DEFAULT_TABS,

  pageSize = PAGE,

  emptyMessage,

}: JioSaavnSongTableProps) {

  const [sort, setSort] = useState<SortKey>(defaultSort);

  const [visible, setVisible] = useState(pageSize);

  const queryClient = useQueryClient();



  const { data: fetchedLikedIds = [] } = useQuery<string[]>({

    queryKey: ["liked-track-ids"],

    queryFn: async () => {

      try {

        const res = await api.get("tracks/liked");

        const arr = Array.isArray(res.data) ? res.data : res.data?.items || [];

        return arr.map((t: any) => t.id) as string[];

      } catch {

        return [];

      }

    },

    staleTime: 1000 * 60 * 5,

  });



  const activeLikedIds = useMemo(() => {

    return Array.from(new Set([...(likedTrackIds || []), ...(fetchedLikedIds || [])]));

  }, [likedTrackIds, fetchedLikedIds]);



  const handleToggleLike = async (track: any, e?: React.MouseEvent) => {

    e?.stopPropagation();

    if (onToggleLike) {

      onToggleLike(track.id, e);

      return;

    }

    const trackId = track?.id;

    if (!trackId) return;



    await queryClient.cancelQueries({ queryKey: ["liked-track-ids"] });

    const prev = queryClient.getQueryData<string[]>(["liked-track-ids"]) || [];

    const isCurrentlyLiked = prev.includes(trackId);

    const updated = isCurrentlyLiked ? prev.filter((id) => id !== trackId) : [...prev, trackId];

    queryClient.setQueryData(["liked-track-ids"], updated);



    try {

      await api.post(`tracks/${trackId}/like`, track);

      queryClient.invalidateQueries({ queryKey: ["liked-track-ids"] });

      queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });

      queryClient.invalidateQueries({ queryKey: ["library-overview"] });

    } catch {

      queryClient.setQueryData(["liked-track-ids"], prev);

    }

  };



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

    // "popular" or "recent" keeps default list order (or caller's pre-sorted order)

    return list;

  }, [tracks, sort]);



  if (!sorted.length) {

    if (emptyMessage) {

      return (

        <section aria-label="Songs" className="w-full py-8 text-center text-white/50">

          {emptyMessage}

        </section>

      );

    }

    return null;

  }



  const shown = sorted.slice(0, visible);



  return (

    <section aria-label="Top songs" className="w-full">

      {/* Tabs */}

      <div className="mb-3 inline-flex rounded-lg bg-white/[0.06] p-[3px]">

        {tabs.map((t) => (

          <button

            key={t.key}

            onClick={() => {

              setSort(t.key);

              setVisible(pageSize);

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

              key={track.id && track.id !== "yt-undefined" ? track.id : `track-${track.title || "song"}-${i}`}

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

                <div className="flex flex-col min-w-0">

                  <span

                    className={cn(

                      "truncate text-[15px] font-medium tracking-[-0.01em]",

                      active ? "text-brand" : "text-white"

                    )}

                  >

                    {formatDisplayTitle(track.title)}

                  </span>

                  {showArtist && (

                    <span

                      className="truncate text-[12px] text-white/50"

                      onClick={(e) => e.stopPropagation()}

                    >

                      <ArtistLinks

                        track={track}

                        maxArtists={2}

                        linkClassName="text-white/50 hover:text-white hover:underline transition-colors"

                      />

                    </span>

                  )}

                </div>

              </div>



              {/* Album (link) */}

              <div className="hidden min-w-0 md:block">

                {album.name && album.href ? (

                  <Link

                    href={album.href}

                    onClick={(e) => e.stopPropagation()}

                    className="block w-fit max-w-full truncate text-[14px] text-white/55 transition-colors hover:text-white hover:underline"

                  >

                    {album.name}

                  </Link>

                ) : album.name ? (

                  <span className="block truncate text-[14px] text-white/55">{album.name}</span>

                ) : (

                  <span className="block truncate text-[14px] text-white/20">—</span>

                )}

              </div>



              {/* Heart (on hover/touch) + ⋯ (on hover/touch) + time */}

              <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>

                {(() => {

                  const isLiked = !!(track?.id && activeLikedIds.includes(track.id));

                  return (

                    <button

                      type="button"

                      onClick={(e) => handleToggleLike(track, e)}

                      aria-label={isLiked ? "Unlike song" : "Like song"}

                      title={isLiked ? "Unlike" : "Like"}

                      className={cn(

                        "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 outline-none transition-all duration-150 active:scale-90 hover:bg-white/10 hover:text-white",

                        isLiked

                          ? "text-brand opacity-100"

                          : "opacity-0 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-75"

                      )}

                    >

                      <SwiftUIHeart

                        size={15}

                        filled={isLiked}

                        className={cn(isLiked ? "text-brand" : "text-white/60 hover:text-white")}

                      />

                    </button>

                  );

                })()}

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

                        "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 outline-none transition-[opacity,background-color,color] duration-150",

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

