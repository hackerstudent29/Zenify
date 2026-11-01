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
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";

export interface MediaActionButtonsProps {
  isPlaying: boolean;
  onPlay: () => void;
  isShuffled?: boolean;
  onShuffle?: () => void;
  isLiked?: boolean;
  onToggleLike?: () => void;
  onInfo?: () => void;
  moreItems?: { id: string; label: string; onClick: () => void }[];
  className?: string;
  playTitle?: string;
}

/**
 * Universal Apple Music Hero Action Buttons.
 * Unified across Artist, Album, Playlist, and Track pages.
 * Includes Large White Play Circle + Frosted Glass Info, Heart, Shuffle, and More controls.
 */
export function MediaActionButtons({
  isPlaying,
  onPlay,
  isShuffled = false,
  onShuffle,
  isLiked = false,
  onToggleLike,
  onInfo,
  moreItems,
  className = "",
  playTitle = "Play",
}: MediaActionButtonsProps) {
  const iconBtn =
    "flex h-10 w-10 sm:h-11 sm:w-11 cursor-pointer items-center justify-center rounded-full border shadow-xl backdrop-blur-xl transition-all active:scale-95";

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5", className)}>
      {/* 1. Info / Bio / Details Button */}
      {onInfo && (
        <button
          type="button"
          onClick={onInfo}
          className={cn(
            iconBtn,
            "border-white/15 bg-white/10 text-white/90 hover:bg-white/20 hover:text-white"
          )}
          title="Details"
          aria-label="View details"
        >
          <SwiftUIInfo size={18} strokeWidth={2.2} />
        </button>
      )}

      {/* 2. Primary White Play Circle */}
      <button
        type="button"
        onClick={onPlay}
        className="flex h-12 w-12 sm:h-14 sm:w-14 cursor-pointer items-center justify-center rounded-full bg-white text-black shadow-[0_6px_24px_rgba(255,255,255,0.25)] transition-all hover:scale-105 active:scale-95"
        title={isPlaying ? "Pause" : playTitle}
        aria-label={isPlaying ? "Pause" : playTitle}
      >
        {isPlaying ? (
          <SwiftUIPause size={22} fill="black" />
        ) : (
          <SwiftUIPlay size={22} fill="black" className="ml-0.5" />
        )}
      </button>

      {/* 3. Heart / Favorite Button */}
      {onToggleLike && (
        <button
          type="button"
          onClick={onToggleLike}
          className={cn(
            iconBtn,
            isLiked
              ? "border-brand bg-brand/20 text-brand"
              : "border-white/15 bg-white/10 text-white/90 hover:bg-white/20 hover:text-white"
          )}
          title={isLiked ? "Favorited" : "Favorite"}
          aria-label="Toggle favorite"
          aria-pressed={isLiked}
        >
          <SwiftUIHeart
            size={18}
            filled={isLiked}
            className={cn(isLiked ? "text-brand fill-brand" : "text-white")}
          />
        </button>
      )}

      {/* 4. Glass Shuffle Circle */}
      {onShuffle && (
        <button
          type="button"
          onClick={onShuffle}
          className={cn(
            iconBtn,
            isShuffled
              ? "border-brand bg-brand/20 text-brand"
              : "border-white/15 bg-white/10 text-white/90 hover:bg-white/20 hover:text-white"
          )}
          title={isShuffled ? "Shuffle: On" : "Shuffle"}
          aria-label="Toggle shuffle"
          aria-pressed={isShuffled}
        >
          <SwiftUIShuffle size={18} stroke="currentColor" />
        </button>
      )}

      {/* 5. Glass Ellipsis Menu */}
      {moreItems && moreItems.length > 0 && (
        <AnimatedDropdown
          align="center"
          trigger={
            <button
              type="button"
              className={cn(
                iconBtn,
                "border-white/15 bg-white/10 text-white hover:bg-white/20"
              )}
              title="More Options"
              aria-label="More options"
            >
              <SwiftUIEllipsis size={18} fill="currentColor" />
            </button>
          }
          items={moreItems}
        />
      )}
    </div>
  );
}

export default MediaActionButtons;
