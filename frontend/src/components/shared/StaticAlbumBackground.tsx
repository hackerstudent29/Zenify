"use client";

import React, { useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAlbumColor } from "@/hooks/useAlbumColor";
import { applyArtworkTheme } from "@/lib/theme";

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

  // Synchronize extracted color directly to CSS variables (--page, --side, --album-rgb)
  // Only apply when primary is an authentic, non-neutral color to prevent wiping theme tokens
  useEffect(() => {
    if (primary && !isNeutralOrDark(primary.r, primary.g, primary.b)) {
      applyArtworkTheme(primary.r, primary.g, primary.b);
    }
  }, [primary.r, primary.g, primary.b]);

  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[var(--page,#121214)] transition-colors duration-700 ease-out h-full w-full min-h-[100dvh]",
        className
      )}
      style={{ contain: "layout paint style" }}
    >
      {/* High-definition subtle Apple Music ambient lighting wash */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700 ease-out"
        style={{
          background: `
            radial-gradient(ellipse 1100px 750px at 22% 160px, rgba(var(--album-rgb, ${primary.r}, ${primary.g}, ${primary.b}), 0.45) 0%, rgba(var(--album-rgb, ${primary.r}, ${primary.g}, ${primary.b}), 0.16) 55%, transparent 85%),
            linear-gradient(180deg, rgba(var(--album-rgb, ${primary.r}, ${primary.g}, ${primary.b}), 0.35) 0%, rgba(var(--album-rgb, ${primary.r}, ${primary.g}, ${primary.b}), 0.08) 500px, transparent 950px),
            linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.10) 40%, rgba(0, 0, 0, 0.35) 100%)
          `,
        }}
      />
    </div>
  );
});

export default StaticAlbumBackground;
