"use client";

import React, { useState, useEffect, useRef } from "react";
import { cn, getMediaUrl } from "@/lib/utils";

interface AppleFluidArtworkBackgroundProps {
  coverUrl?: string;
  covers?: string[];
  className?: string;
  blurAmount?: number;
  speedMultiplier?: number;
}

export const AppleFluidArtworkBackground = React.memo(function AppleFluidArtworkBackground({
  coverUrl,
  covers,
  className,
  blurAmount = 75,
}: AppleFluidArtworkBackgroundProps) {
  // Normalize cover source
  const primaryCover = coverUrl || (covers && covers.length > 0 ? covers[0] : null) || "/logo.png";
  const resolvedCover = getMediaUrl(primaryCover) || "/logo.png";

  // Crossfade state between previous and current cover artwork
  const [currentCover, setCurrentCover] = useState<string>(resolvedCover);
  const [prevCover, setPrevCover] = useState<string | null>(null);
  const [isCrossfading, setIsCrossfading] = useState<boolean>(false);
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (resolvedCover && resolvedCover !== currentCover) {
      setPrevCover(currentCover);
      setCurrentCover(resolvedCover);
      setIsCrossfading(true);

      if (crossfadeTimerRef.current) clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = setTimeout(() => {
        setIsCrossfading(false);
        setPrevCover(null);
      }, 1200);
    }
    return () => {
      if (crossfadeTimerRef.current) clearTimeout(crossfadeTimerRef.current);
    };
  }, [resolvedCover, currentCover]);

  return (
    <div
      className={cn(
        "absolute inset-0 z-0 overflow-hidden pointer-events-none isolate select-none bg-[#121214]",
        className
      )}
      style={{
        transform: "translate3d(0, 0, 0)",
        backfaceVisibility: "hidden",
      }}
    >
      <style>{`
        @keyframes apple-fluid-drift-1 {
          0% {
            transform: translate3d(-6%, -6%, 0) rotate(0deg) scale(1.9);
          }
          33% {
            transform: translate3d(8%, 4%, 0) rotate(120deg) scale(2.3);
          }
          66% {
            transform: translate3d(-3%, 9%, 0) rotate(240deg) scale(2.0);
          }
          100% {
            transform: translate3d(-6%, -6%, 0) rotate(360deg) scale(1.9);
          }
        }

        @keyframes apple-fluid-drift-2 {
          0% {
            transform: translate3d(7%, 5%, 0) rotate(0deg) scale(2.2);
          }
          33% {
            transform: translate3d(-6%, -5%, 0) rotate(-120deg) scale(1.85);
          }
          66% {
            transform: translate3d(4%, -8%, 0) rotate(-240deg) scale(2.4);
          }
          100% {
            transform: translate3d(7%, 5%, 0) rotate(-360deg) scale(2.2);
          }
        }

        @keyframes apple-fluid-drift-3 {
          0% {
            transform: translate3d(0%, -4%, 0) rotate(0deg) scale(2.05);
          }
          50% {
            transform: translate3d(-5%, 6%, 0) rotate(180deg) scale(2.45);
          }
          100% {
            transform: translate3d(0%, -4%, 0) rotate(360deg) scale(2.05);
          }
        }

        @keyframes apple-fluid-accent {
          0% {
            transform: translate3d(-8%, 5%, 0) scale(1.7) rotate(0deg);
            opacity: 0.55;
          }
          50% {
            transform: translate3d(7%, -6%, 0) scale(2.1) rotate(180deg);
            opacity: 0.85;
          }
          100% {
            transform: translate3d(-8%, 5%, 0) scale(1.7) rotate(360deg);
            opacity: 0.55;
          }
        }
      `}</style>

      {/* Outgoing previous track artwork layer during crossfade */}
      {prevCover && isCrossfading && (
        <ArtworkFluidStage
          src={prevCover}
          blurAmount={blurAmount}
          className="opacity-0 transition-opacity duration-1000 ease-in-out"
        />
      )}

      {/* Active incoming track artwork layer */}
      <ArtworkFluidStage
        src={currentCover}
        blurAmount={blurAmount}
        className={cn(
          "transition-opacity duration-1000 ease-in-out",
          isCrossfading ? "opacity-100" : "opacity-100"
        )}
      />

      {/* Apple Music Signature Atmospheric Dark Scrim & Radial Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background:
            "radial-gradient(circle at 50% 35%, rgba(18, 18, 20, 0.35) 0%, rgba(18, 18, 20, 0.72) 75%, rgba(18, 18, 20, 0.95) 100%), linear-gradient(to bottom, rgba(18, 18, 20, 0.3) 0%, rgba(18, 18, 20, 0.6) 50%, #121214 100%)",
        }}
      />
    </div>
  );
});

/**
 * Individual multi-layer blurred organic drifting stage for a single artwork image
 */
function ArtworkFluidStage({
  src,
  blurAmount,
  className,
}: {
  src: string;
  blurAmount: number;
  className?: string;
}) {
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{
        filter: `blur(${blurAmount}px) saturate(185%) brightness(0.85) contrast(1.12)`,
        transform: "translate3d(0, 0, 0)",
        willChange: "transform",
      }}
    >
      {/* Layer 1: Primary Counter-Clockwise Floating Drift (Anchor Top-Left) */}
      <div
        className="absolute inset-[-40%]"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundSize: "cover",
          backgroundPosition: "30% 30%",
          animation: "apple-fluid-drift-1 38s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          willChange: "transform",
          transformOrigin: "35% 35%",
          opacity: 0.88,
        }}
      />

      {/* Layer 2: Clockwise Floating Drift (Anchor Bottom-Right) */}
      <div
        className="absolute inset-[-40%]"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundSize: "cover",
          backgroundPosition: "70% 70%",
          animation: "apple-fluid-drift-2 48s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          willChange: "transform",
          transformOrigin: "65% 65%",
          opacity: 0.82,
        }}
      />

      {/* Layer 3: Central Ambient Swell & Rotation */}
      <div
        className="absolute inset-[-40%]"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          animation: "apple-fluid-drift-3 32s cubic-bezier(0.4, 0, 0.2, 1) infinite",
          willChange: "transform",
          transformOrigin: "center center",
          opacity: 0.75,
        }}
      />

      {/* Layer 4: Accent Color Flow (Overlay Blend for vibrant liquid highlights) */}
      <div
        className="absolute inset-[-40%] mix-blend-overlay"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          animation: "apple-fluid-accent 24s ease-in-out infinite",
          willChange: "transform",
          transformOrigin: "50% 50%",
        }}
      />
    </div>
  );
}

export default AppleFluidArtworkBackground;
