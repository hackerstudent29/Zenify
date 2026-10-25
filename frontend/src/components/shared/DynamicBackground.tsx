"use client";

import React from "react";
import { useReactiveBgStore, ReactiveBgSettings } from "@/store/reactiveBgStore";
import { ArtworkMeshBackground, ArtworkMeshBackgroundProps } from "./ArtworkMeshBackground";
import { StaticAlbumBackground } from "./StaticAlbumBackground";

export type DynamicBackgroundProps = ArtworkMeshBackgroundProps & {
  surface: keyof ReactiveBgSettings;
  mode?: "static" | "flow";
  palette?: any;
};

export const DynamicBackground = React.memo(function DynamicBackground({
  surface,
  mode,
  palette,
  ...props
}: DynamicBackgroundProps) {
  const isEnabled = useReactiveBgStore((state) => state.reactiveBg[surface]);
  if (!isEnabled) {
    return null;
  }

  // Track, album, and playlist surfaces use static album color without animation.
  // Fullview player uses fast multi-directional flowing reactive mesh with spring physics.
  const isStatic = mode === "static" || (!mode && (surface === "albumPage" || surface === "trackPage" || surface === "other"));

  if (isStatic) {
    return <StaticAlbumBackground coverUrl={props.coverUrl} covers={props.covers} palette={palette} className={props.className} />;
  }

  return <ArtworkMeshBackground speed={props.speed ?? 1.6} {...props} />;
});

export default DynamicBackground;
