"use client";

import { usePlayerStore } from "@/store/player";
import { SEO } from "./SEO";

export function DynamicTitle() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying); // triggers re-render if we want to add play state indicator later

  if (!currentTrack) {
    return <SEO />;
  }

  const trackTitle = currentTrack.title || "Unknown Track";
  const artistName =
    currentTrack.artist?.name ||
    currentTrack.artistName ||
    "Unknown Artist";

  const title = `${trackTitle} • ${artistName}`;

  return <SEO title={title} />;
}
