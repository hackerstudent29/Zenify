"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAlbumColor } from "@/hooks/useAlbumColor";

export interface StaticAlbumBackgroundProps {
  coverUrl?: string | null;
  covers?: string[];
  palette?: any;
  className?: string;
}

function parseRgb(rgbStr: string): [number, number, number] {
  const match = rgbStr.match(/\d+/g);
  if (match && match.length >= 3) {
    return [parseInt(match[0], 10), parseInt(match[1], 10), parseInt(match[2], 10)];
  }
  return [20, 31, 45];
}

function isNeutralOrDark(r: number, g: number, b: number): boolean {
  if (r <= 32 && g <= 32 && b <= 35) return true;
  if (r === 20 && g === 31 && b === 45) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return sat < 0.12;
}

/**
 * Apple Music Static High-Quality Ambient Album Background.
 * Applies vibrant ambient radial lighting wash centered behind the album artwork and title.
 */
export const StaticAlbumBackground = React.memo(function StaticAlbumBackground({
  coverUrl,
  covers,
  palette,
  className,
}: StaticAlbumBackgroundProps) {
  const activeCover = coverUrl || covers?.[0] || undefined;
  const colors = useAlbumColor(activeCover, palette);

  const primary = useMemo(() => {
    const c1 = colors[0] || "rgb(20, 31, 45)";
    const [r1, g1, b1] = parseRgb(c1);
    return { r: r1, g: g1, b: b1 };
  }, [colors]);

  // NOTE: applyArtworkTheme is intentionally NOT called here.
  // Each page (TrackPage, AlbumPage, ArtistPage, etc.) calls it directly
  // from its own useEffect using extractArtworkAverageColor. Calling it in
  // two places caused a race condition that made the color flicker/reset.

  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[var(--page,#121214)] h-full w-full",
        className
      )}
      style={{
        // Transition matches the CSS --page variable transition (700ms)
        transition: "background-color 700ms ease-out",
      }}
    />
  );
});

export default StaticAlbumBackground;
