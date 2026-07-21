"use client";

import { useEffect } from "react";
import { usePlayerStore } from "@/store/player";

const APP_NAME = "Zenify";

export function DynamicTitle() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    if (!currentTrack) {
      document.title = APP_NAME;
      return;
    }

    const trackTitle = currentTrack.title || "Unknown Track";
    const artistName =
      currentTrack.artist?.name ||
      currentTrack.artistName ||
      "Unknown Artist";

    document.title = `${trackTitle} • ${artistName} — ${APP_NAME}`;
  }, [currentTrack, isPlaying]);

  // Reset to default on unmount
  useEffect(() => {
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  return null;
}
