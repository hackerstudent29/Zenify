"use client";

import React, { useState } from "react";
import { ChevronRight, Play, Pause, MoreHorizontal } from "lucide-react";
import { cn, getMediaUrl, formatDisplayTitle, getTrackCover } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/store/ui";
import { SwiftUIPlay, SwiftUIPause, SwiftUIEllipsis } from "@/components/ui/SwiftUIIcons";

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
  onPlayTrack,
}: ArtistLatestAndTopSongsProps) {
  const [showAll, setShowAll] = useState(false);
  const topTracks: any[] = artist?.topTracks || [];

  // Latest release resolution
  const latestRelease = artist?.latestRelease || artist?.albums?.[0] || topTracks[0];

  const latestTitle = latestRelease ? formatDisplayTitle(latestRelease.title) : "";
  const latestCover = latestRelease ? (getMediaUrl(latestRelease.coverUrl || latestRelease.artwork || artist.imageUrl) || "/logo.png") : "/logo.png";
  const rawDate = latestRelease?.releaseDate || latestRelease?.createdAt;
  const formattedDate = rawDate
    ? new Date(rawDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const songCount = latestRelease?.trackCount || (latestRelease?.isSingle ? 1 : 1);
  const trackCountText = songCount > 1 ? `${songCount} songs` : "1 song · Single";

  // Top songs: 6 tracks arranged in 2 columns (3 tracks per column)
  const displayTracks = showAll ? topTracks : topTracks.slice(0, 6);
  const col1 = displayTracks.slice(0, 3);
  const col2 = displayTracks.slice(3, 6);

  const renderTrackItem = (track: any, idx: number) => {
    const isCurrent = currentTrackId === track.id;
    const isThisPlaying = isCurrent && isPlaying;
    const trackCover = getTrackCover(track);
    const rawYear = track.releaseDate || track.createdAt;
    const year = rawYear ? new Date(rawYear).getFullYear() : "";
    const albumName = track.album?.title || track.albumTitle || "";
    const subtitle = [albumName, year].filter(Boolean).join(" · ") || artist.name;

    return (
      <div
        key={track.id || `track-${idx}`}
        onClick={() => onPlayTrack(track)}
        className={cn(
          "group flex items-center justify-between gap-3 p-2 rounded-xl transition-all duration-150 cursor-pointer select-none",
          isCurrent ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Thumbnail with hover play overlay */}
          <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-zinc-900 border border-white/5 shadow-md">
            <img
              src={trackCover}
              alt={track.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div
              className={cn(
                "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
            >
              {isThisPlaying ? (
                <SwiftUIPause size={16} fill="white" />
              ) : (
                <SwiftUIPlay size={16} fill="white" className="ml-0.5" />
              )}
            </div>
          </div>

          {/* Title and Subtitle */}
          <div className="flex flex-col min-w-0 flex-1">
            <p
              className={cn(
                "text-[13px] md:text-[14px] font-semibold truncate leading-tight transition-colors",
                isCurrent ? "text-brand" : "text-white group-hover:text-white"
              )}
            >
              {formatDisplayTitle(track.title)}
            </p>
            <p className="text-[12px] text-white/50 truncate font-normal mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Swift UI Ellipsis Action */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              title="More"
            >
              <SwiftUIEllipsis size={16} fill="currentColor" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border border-white/10 text-white rounded-xl shadow-2xl p-1">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onPlayTrack(track);
              }}
              className="cursor-pointer text-xs font-semibold py-2"
            >
              Play Next
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(`${window.location.origin}/track/${track.id}`);
              }}
              className="cursor-pointer text-xs font-semibold py-2"
            >
              Copy Link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <section className="mb-14">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Latest Release (Screenshot 3) */}
        {latestRelease && (
          <div className="lg:col-span-4 flex flex-col">
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight mb-4">
              Latest Release
            </h2>
            <Link
              href={latestRelease.id ? `/album/${latestRelease.id}` : "#"}
              className="group flex flex-col sm:flex-row lg:flex-col gap-4 items-start"
            >
              <div className="relative aspect-square w-44 sm:w-48 md:w-52 lg:w-56 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shadow-2xl transition-transform duration-300 group-hover:scale-[1.02] shrink-0">
                <img
                  src={latestCover}
                  alt={latestTitle}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="flex flex-col justify-center min-w-0 pt-1">
                {formattedDate && (
                  <span className="text-[12px] font-medium text-white/50 mb-1">
                    {formattedDate}
                  </span>
                )}
                <span className="text-[15px] md:text-[16px] font-bold text-white truncate leading-snug group-hover:text-brand transition-colors">
                  {latestTitle}
                </span>
                <span className="text-[13px] text-white/50 font-normal mt-0.5">
                  {trackCountText}
                </span>
              </div>
            </Link>
          </div>
        )}

        {/* Right Column: Top Songs > (Screenshot 3) */}
        <div className={cn(latestRelease ? "lg:col-span-8" : "lg:col-span-12", "flex flex-col")}>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowAll(!showAll)}
              className="group flex items-center gap-1.5 text-xl md:text-2xl font-bold text-white tracking-tight hover:text-white/80 transition-colors"
            >
              <span>Top Songs</span>
              <ChevronRight size={22} className="text-white/40 group-hover:text-white transition-colors group-hover:translate-x-0.5 duration-200" />
            </button>
          </div>

          {topTracks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              <div className="flex flex-col gap-1">
                {col1.map((track, idx) => renderTrackItem(track, idx))}
              </div>
              <div className="flex flex-col gap-1">
                {col2.map((track, idx) => renderTrackItem(track, idx + 3))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/40">No songs available for this artist yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
