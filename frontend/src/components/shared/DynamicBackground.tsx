"use client";

import React from "react";
import { useReactiveBgStore, ReactiveBgSettings } from "@/store/reactiveBgStore";
import { ArtworkMeshBackground, ArtworkMeshBackgroundProps } from "./ArtworkMeshBackground";

export type DynamicBackgroundProps = ArtworkMeshBackgroundProps & {
  surface: keyof ReactiveBgSettings;
};

export const DynamicBackground = React.memo(function DynamicBackground({
  surface,
  ...props
}: DynamicBackgroundProps) {
  const isEnabled = useReactiveBgStore((state) => state.reactiveBg[surface]);
  if (!isEnabled) {
    return (
      <div 
        aria-hidden 
        className="absolute inset-0 z-0 bg-[#121214] pointer-events-none select-none w-full h-full min-h-[100dvh]" 
      />
    );
  }
  return <ArtworkMeshBackground {...props} />;
});

export default DynamicBackground;
