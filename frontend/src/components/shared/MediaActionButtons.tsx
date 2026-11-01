"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  SwiftUIPlay,
  SwiftUIPause,
  SwiftUIShuffle,
  SwiftUIHeart,
  SwiftUIInfo,
  SwiftUIEllipsis,
} from "@/components/ui/SwiftUIIcons";
import { TrackActionsDropdown, TrackActionsContext, MenuItem } from "@/components/shared/TrackActionsDropdown";

export interface MediaActionButtonsProps {
  isPlaying: boolean;
  onPlay: () => void;
  isShuffled?: boolean;
  onShuffle?: () => void;
  isLiked?: boolean;
  onToggleLike?: () => void;
  onInfo?: () => void;
  track?: any;
  context?: TrackActionsContext;
  moreItems?: MenuItem[] | { id: string; label: string; icon?: React.ReactNode; onClick?: () => void; isSeparator?: boolean }[];
  className?: string;
  playTitle?: string;
  extraAction?: React.ReactNode;
}

/**
 * Universal Apple Music Hero Action Buttons.
 * Unified across Artist, Album, Playlist, and Track pages.
 * Includes [ ▶ Play ] pill + [ 🔀 Shuffle ] pill + (ℹ) Info + (♡) Heart + [Extra] + (⋯) More.
 */
export function MediaActionButtons({
  isPlaying,
  onPlay,
  isShuffled = false,
  onShuffle,
  isLiked = false,
  onToggleLike,
  onInfo,
  track,
  context,
  moreItems,
  className = "",
  playTitle = "Play",
  extraAction,
}: MediaActionButtonsProps) {
  const pillBtn =
    "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold tracking-[-0.01em] outline-none transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.96]";
  const iconBtn =
    "flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/85 outline-none transition-[background-color,color,transform] duration-200 ease-out hover:bg-white/[0.18] hover:text-white active:scale-90";

  return (
    <div className={cn("mt-4 flex flex-wrap items-center justify-center gap-2 md:justify-start", className)}>
      {/* 1. Primary White Play Pill */}
      <button
        type="button"
        onClick={onPlay}
        className={cn(pillBtn, "min-w-[96px] bg-white text-black hover:bg-white/90")}
        title={isPlaying ? "Pause" : playTitle}
        aria-label={isPlaying ? "Pause" : playTitle}
      >
        {isPlaying ? (
          <SwiftUIPause size={14} fill="black" />
        ) : (
          <SwiftUIPlay size={14} fill="black" />
        )}
        {isPlaying ? "Pause" : playTitle}
      </button>

      {/* 2. Glass Shuffle Pill */}
      {onShuffle && (
        <button
          type="button"
          onClick={onShuffle}
          aria-pressed={isShuffled}
          className={cn(
            pillBtn,
            "bg-white/10 hover:bg-white/[0.18]",
            isShuffled ? "text-brand" : "text-white"
          )}
          title={isShuffled ? "Shuffle: On" : "Shuffle"}
          aria-label="Toggle shuffle"
        >
          <SwiftUIShuffle size={14} stroke="currentColor" />
          Shuffle
        </button>
      )}

      {/* 3. Info / About / Details Circle */}
      {onInfo && (
        <button
          type="button"
          onClick={onInfo}
          className={iconBtn}
          title="Details"
          aria-label="View details"
        >
          <SwiftUIInfo size={16} strokeWidth={2} />
        </button>
      )}

      {/* 4. Heart / Favorite Circle */}
      {onToggleLike && (
        <button
          type="button"
          onClick={onToggleLike}
          className={cn(iconBtn, isLiked && "!text-brand")}
          title={isLiked ? "Favorited" : "Favorite"}
          aria-label="Toggle favorite"
          aria-pressed={isLiked}
        >
          <SwiftUIHeart
            size={17}
            filled={isLiked}
            className={cn(isLiked ? "text-brand" : "text-white/85")}
          />
        </button>
      )}

      {/* 5. Extra Action Slot (e.g. Lyrics button on Track page) */}
      {extraAction}

      {/* 6. Three-Dot More Options Dropdown */}
      {(track || (moreItems && moreItems.length > 0)) && (
        <TrackActionsDropdown
          track={track}
          context={context}
          align="end"
          items={moreItems as any}
          trigger={
            <button
              type="button"
              className={iconBtn}
              title="More"
              aria-label="More options"
            >
              <SwiftUIEllipsis size={16} fill="currentColor" />
            </button>
          }
        />
      )}
    </div>
  );
}

export default MediaActionButtons;
