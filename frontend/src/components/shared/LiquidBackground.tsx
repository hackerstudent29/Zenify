"use client";

import React from "react";
import { AppleFluidArtworkBackground } from "./AppleFluidArtworkBackground";

export interface LiquidBackgroundProps {
  coverUrl?: string;
  covers?: string[];
  className?: string;
  cssScale?: number;
  shaderZoom?: number;
  speedMultiplier?: number;
  blurAmount?: number;
}

/**
 * LiquidBackground - Authentic Apple Music Fluid Artwork Background.
 * Renders multiple flowing, counter-rotating, blurred layers of the actual song artwork.
 */
export const LiquidBackground = React.memo(function LiquidBackground({ 
  coverUrl, 
  covers,
  className,
  speedMultiplier = 1.0,
  blurAmount = 75,
}: LiquidBackgroundProps) {
  return (
    <AppleFluidArtworkBackground
      coverUrl={coverUrl}
      covers={covers}
      className={className}
      speedMultiplier={speedMultiplier}
      blurAmount={blurAmount}
    />
  );
});

export default LiquidBackground;
