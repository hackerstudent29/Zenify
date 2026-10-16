"use client";

import React, { useState } from "react";
import { Play, Pause, MoreHorizontal, ChevronRight, Plus, Download, Share2, Disc, RefreshCw, ListPlus } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle, getTrackCover } from "@/lib/utils";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/store/ui";
import { usePlayerStore } from "@/store/player";
import api from "@/lib/api";
import { useRefetchAudio } from "@/hooks/useRefetchAudio";
import { useRefetchLyrics } from "@/hooks/useRefetchLyrics";
import { RefetchLyricsSubMenu } from "@/components/shared/RefetchLyricsSubMenu";

interface ArtistLatestAndTopSongsProps {
  artist: any;
  currentTrackId?: string;
  isPlaying?: boolean;
  likedTrackIds?: string[];
  playlists?: any[];
  onPlayTrack: (track: any) => void;
  onToggleLike?: (trackId: string, e: React.MouseEvent) => void;
}

export function ArtistLatestAndTopSongs({
  artist,
  currentTrackId,
  isPlaying,
  likedTrackIds = [],
  playlists = [],
  onPlayTrack,
}: ArtistLatestAndTopSongsProps) {
  const router = useRouter();
  const { openDownloadModal } = useUIStore();
  const [showAllTop, setShowAllTop] = useState(false);
  const openAddToPlaylistModal = useUIStore(s => s.openAddToPlaylistModal);
  const { refetchTrackAudio, isRefetching } = useRefetchAudio();
  const { refetchTrackLyrics } = useRefetchLyrics();

  const topTracks: any[] = artist?.topTracks || [];
  if (topTracks.length === 0 && (!artist?.albums || artist.albums.length === 0)) {
    return null;
  }

  // Determine latest release: newest album or newest track
  const latestAlbum = artist?.albums?.[0];
  const latestTrack = topTracks[0];
  const latestRelease = latestAlbum || latestTrack;

  const latestReleaseTitle = latestRelease ? formatDisplayTitle(latestRelease.title) : "";
  const latestReleaseCover = latestRelease ? (getMediaUrl(latestRelease.coverUrl || latestRelease.artwork || artist.imageUrl) || "/logo.png") : "/logo.png";
  const rawDate = latestRelease?.releaseDate || latestRelease?.createdAt;
  const latestReleaseDate = rawDate
    ? new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  const isAlbumRelease = !!latestRelease?.isAlbum || (latestRelease?.trackCount && latestRelease.trackCount > 1);
  const latestReleaseSubtitle = isAlbumRelease
    ? `Album · ${new Date(rawDate || Date.now()).getFullYear()}`
    : "1 song · Single";
  const latestReleaseHref = isAlbumRelease && latestRelease?.id
    ? `/album/${latestRelease.id}`
    : latestRelease?.id
      ? `/track/${latestRelease.id}`
      : `/artist/${artist.id}`;

  // 6 tracks for 2 columns (3 each) as in Apple Music screenshot 3
  const displayTracks = showAllTop ? topTracks : topTracks.slice(0, 6);
  const col1Tracks = displayTracks.slice(0, Math.ceil(displayTracks.length / 2));
  const col2Tracks = displayTracks.slice(Math.ceil(displayTracks.length / 2));

  const renderTrackRow = (track: any, index: number) => {
    const isCurrent = currentTrackId === track.id;
    const isThisPlaying = isCurrent && isPlaying;
    const trackCover = getTrackCover(track);
    const releaseYear = track.releaseDate || track.createdAt
      ? new Date(track.releaseDate || track.createdAt).getFullYear()
      : undefined;
    const albumName = track.album?.title || track.albumTitle;
    const subtitle = [albumName, releaseYear].filter(Boolean).join(" · ") || artist.name;

    return (
      <div
        key={`${track.id || "t"}-${index}`}
        onClick={() => onPlayTrack(track)}
        className={cn(
          "group flex items-center justify-between gap-3 px-2 py-1.5 rounded-xl transition-all duration-150 cursor-pointer select-none",
          isCurrent ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
        )}
      >
        {/* Left Thumbnail & Titles */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 shadow-sm">
            <img src={trackCover} alt={track.title} className="w-full h-full object-cover" />
            <div className={cn(
              "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
              isThisPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}>
              {isThisPlaying ? (
                <div className="flex items-end gap-[2px] h-3">
                  {[0.3, 0.7, 0.4].map((d, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: ["30%", "100%", "30%"] }}
                      transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut", delay: d }}
                      className="w-[2px] bg-brand rounded-full"
                    />
                  ))}
                </div>
              ) : (
                <Play size={16} className="text-white fill-white ml-0.5" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-[13px] font-normal leading-tight truncate transition-colors",
              isCurrent ? "text-brand" : "text-white group-hover:text-white"
            )}>
              {formatDisplayTitle(track.title)}
            </p>
            <p className="text-[11px] text-white/50 truncate font-normal mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right Menu Trigger */}
        <div className="shrink-0 flex items-center opacity-70 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent align="end" className="w-52 bg-zinc-900/95 border-white/10 backdrop-blur-2xl rounded-2xl p-1.5 z-[1200]">
 <DropdownMenuItem onClick={() => usePlayerStore.getState().addToUserQueue(track)}>
 <ListPlus size={14} className="mr-2 text-brand" /> Add to Queue
 </DropdownMenuItem>
                {track.album?.id && (
                  <DropdownMenuItem onClick={() => router.push(`/album/${track.album.id}`)}>
                    <Disc size={14} className="mr-2 opacity-60" /> Go to Album
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => openAddToPlaylistModal(track)}>
                    <Plus size={14} className="mr-2 opacity-60" /> Add to Playlist
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => refetchTrackAudio(track, (msg, type) => useUIStore.getState().showToast(msg, type))}>
                    <RefreshCw size={14} className={cn("mr-2 opacity-60", isRefetching === track.id && "animate-spin text-brand")} />
                    <span>{isRefetching === track.id ? "Refetching Audio..." : "Refetch Audio"}</span>
                  </DropdownMenuItem>
<RefetchLyricsSubMenu track={track} refetchTrackLyrics={refetchTrackLyrics} showToast={(msg, type) => useUIStore.getState().showToast(msg, type)} />
                <DropdownMenuItem onClick={() => openDownloadModal(track)}>
                  <Download size={14} className="mr-2 opacity-60" /> Download
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuItem onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(`${window.location.origin}/track/${track.id}`);
                  }
                }}>
                  <Share2 size={14} className="mr-2 opacity-60" /> Copy Link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <section className="mb-14">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] xl:grid-cols-[400px_1fr] gap-8 items-start">
        {/* ── Left Column: Latest Release (Desktop Only, hidden on mobile) ── */}
        {latestRelease && (
          <div className="hidden lg:flex flex-col gap-3 shrink-0">
            <h2 className="text-xl font-bold text-white tracking-tight px-1 font-sans">
              Latest Release
            </h2>
            <div
              onClick={() => router.push(latestReleaseHref)}
              className="group flex items-center gap-4 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-all duration-200 cursor-pointer shadow-md"
            >
              <div className="relative shrink-0 w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 shadow-lg">
                <img
                  src={latestReleaseCover}
                  alt={latestReleaseTitle}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </div>
              <div className="flex-1 min-w-0 pr-1">
                {latestReleaseDate && (
                  <p className="text-[11px] text-white/50 font-medium mb-1">
                    {latestReleaseDate}
                  </p>
                )}
                <h3 className="text-sm sm:text-base font-bold text-white truncate group-hover:text-white transition-colors mb-1 leading-snug">
                  {latestReleaseTitle}
                </h3>
                <p className="text-xs text-white/40 font-normal">
                  {latestReleaseSubtitle}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Right Column (or Full Width on Mobile): Top Songs > ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <button
              onClick={() => setShowAllTop(!showAllTop)}
              className="flex items-center gap-1.5 group cursor-pointer text-left outline-none"
            >
              <h2 className="text-xl font-bold text-white tracking-tight font-sans group-hover:text-white/80 transition-colors">
                Top Songs
              </h2>
              <ChevronRight
                size={18}
                className={cn(
                  "text-white/40 group-hover:text-white transition-transform duration-200",
                  showAllTop ? "rotate-90" : "rotate-0"
                )}
              />
            </button>
            {topTracks.length > 6 && (
              <button
                onClick={() => setShowAllTop(!showAllTop)}
                className="text-[11px] font-bold text-white/50 hover:text-white transition-colors"
              >
                {showAllTop ? "Show Less" : "See All"}
              </button>
            )}
          </div>

          {/* Two Sub-columns (3 songs each) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex flex-col gap-0.5">
              {col1Tracks.map((track, i) => renderTrackRow(track, i))}
            </div>
            <div className="flex flex-col gap-0.5">
              {col2Tracks.map((track, i) => renderTrackRow(track, i + col1Tracks.length))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
