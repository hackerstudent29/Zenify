"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAlbumColor } from "@/hooks/useAlbumColor";

export interface StaticAlbumBackgroundProps {
  coverUrl?: string | null;
  covers?: string[];
  className?: string;
}

function parseRgb(rgbStr: string): [number, number, number] {
  const match = rgbStr.match(/\d+/g);
  if (match && match.length >= 3) {
    return [parseInt(match[0], 10), parseInt(match[1], 10), parseInt(match[2], 10)];
  }
  return [20, 31, 45];
}

/**
 * Apple Music Static High-Quality Ambient Album Background.
 * Applies the single extracted dominant color across the entire page canvas with smooth depth.
 */
export const StaticAlbumBackground = React.memo(function StaticAlbumBackground({
  coverUrl,
  covers,
  className,
}: StaticAlbumBackgroundProps) {
  const activeCover = coverUrl || covers?.[0] || undefined;
  const colors = useAlbumColor(activeCover);

  const primary = useMemo(() => {
    const c1 = colors[0] || "rgb(20, 31, 45)";
    const [r1, g1, b1] = parseRgb(c1);
    return { r: r1, g: g1, b: b1 };
  }, [colors]);

  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[var(--page,#141f2d)] transition-colors duration-700 ease-out h-full w-full min-h-[100dvh]",
        className
      )}
      style={{ contain: "layout paint style" }}
    >
      {/* High-definition subtle Apple Music ambient lighting wash */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700 ease-out"
        style={{
          background: `
            linear-gradient(180deg, rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.28) 0%, rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.08) 450px, transparent 800px),
            linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.10) 40%, rgba(0, 0, 0, 0.28) 100%)
          `,
        }}
      />
    </div>
  );
});

export default StaticAlbumBackground;
