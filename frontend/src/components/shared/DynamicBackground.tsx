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

  // Wait for zustand persist rehydration before deciding to render or not.
  // Without this, there's a one-frame flash where isEnabled is the default
  // value (often `true`) but the persisted preference hasn't loaded yet,
  // causing the background to momentarily appear then disappear (or vice-versa).
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    // useReactiveBgStore.persist.hasHydrated() is available after the first
    // persist flush. We use onFinishHydration to set a flag.
    if ((useReactiveBgStore.persist as any)?.hasHydrated?.()) {
      setHydrated(true);
    } else {
      const unsub = (useReactiveBgStore.persist as any)?.onFinishHydration?.(() => setHydrated(true));
      return unsub;
    }
  }, []);

  if (!hydrated || !isEnabled) {
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
