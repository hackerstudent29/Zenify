"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface LiquidLyricsLineProps {
  text: string;
  isCurrent: boolean;
  isPast: boolean;
  isUpcoming: boolean;
  distFromActive: number;
  lineStartTime?: number;
  lineEndTime?: number;
  smoothTimeValue?: any;
  isFullscreen?: boolean;
  isMobile?: boolean;
  isIdle?: boolean;
  isInterlude?: boolean;
  isUnsynced?: boolean;
  isRightAligned?: boolean;
  words?: Array<{ word: string, time: number, endTime?: number }>;
  isUserScrolling?: boolean;
}

export const LiquidLyricsLine = React.memo(function LiquidLyricsLine(props: LiquidLyricsLineProps) {
  const { 
    isCurrent, distFromActive, isFullscreen, isMobile, 
    isInterlude, isRightAligned, text, isUserScrolling, isUnsynced
  } = props;

  let targetOpacity = 0.12;
  let targetScale = 0.94;
  let targetTranslateY = 0;
  let targetColor = "rgba(255, 255, 255, 0.35)";

  if (isUnsynced) {
    targetOpacity = 0.88;
    targetScale = 1;
    targetTranslateY = 0;
    targetColor = "#FFFFFF";
  } else if (isCurrent) {
    targetOpacity = 1;
    targetScale = isFullscreen ? (isMobile ? 1.04 : 1.055) : 1.035;
    targetTranslateY = isFullscreen ? -2 : 0;
    targetColor = "#FFFFFF";
  } else if (isUserScrolling) {
    targetOpacity = 0.85;
    targetScale = 1;
    targetTranslateY = 0;
    targetColor = "rgba(255, 255, 255, 0.85)";
  } else {
    // Apple Music optical depth curve for line transitions
    if (distFromActive === 1) {
      // Immediate next line (upcoming preview)
      targetOpacity = 0.60;
      targetScale = 0.98;
      targetTranslateY = 0;
      targetColor = "rgba(255, 255, 255, 0.75)";
    } else if (distFromActive === 2) {
      targetOpacity = 0.35;
      targetScale = 0.95;
      targetTranslateY = 1;
      targetColor = "rgba(255, 255, 255, 0.55)";
    } else if (distFromActive === 3) {
      targetOpacity = 0.18;
      targetScale = 0.92;
      targetTranslateY = 2;
      targetColor = "rgba(255, 255, 255, 0.35)";
    } else if (distFromActive > 3) {
      targetOpacity = 0.08;
      targetScale = 0.88;
      targetTranslateY = 3;
      targetColor = "rgba(255, 255, 255, 0.20)";
    } else if (distFromActive === -1) {
      // Immediate past line
      targetOpacity = 0.38;
      targetScale = 0.98;
      targetTranslateY = -1;
      targetColor = "rgba(255, 255, 255, 0.55)";
    } else if (distFromActive === -2) {
      targetOpacity = 0.20;
      targetScale = 0.95;
      targetTranslateY = -2;
      targetColor = "rgba(255, 255, 255, 0.35)";
    } else {
      // Distant past lines
      targetOpacity = 0.08;
      targetScale = 0.90;
      targetTranslateY = -3;
      targetColor = "rgba(255, 255, 255, 0.20)";
    }
  }

  // Large, punchy Apple Music typography
  const fontSize = isFullscreen 
    ? (isMobile ? "clamp(26px, 6.5vw, 40px)" : "clamp(32px, 3.8vw, 50px)") 
    : (isMobile ? "clamp(22px, 5.5vw, 28px)" : "23px");
  const origin = isFullscreen ? (isRightAligned ? "right center" : "left center") : "center center";

  if (isInterlude) {
    return (
      <div
        className="flex gap-3 items-center w-full justify-center py-4 transition-opacity duration-500 ease-out"
        style={{ opacity: isCurrent ? 1 : 0.25 }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className={cn(
              "rounded-full transition-all duration-500",
              isCurrent 
                ? "w-3 h-3 bg-white shadow-[0_0_12px_rgba(255,255,255,0.95)] animate-pulse" 
                : "w-2 h-2 bg-white/40"
            )}
            style={isCurrent ? { animationDelay: `${i * 0.22}s` } : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      data-lyrics-line="true"
      className={cn(
        "w-full px-4 flex transform-gpu select-none cursor-pointer transition-[transform,opacity,color,text-shadow] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        isFullscreen 
          ? (isRightAligned ? "justify-end text-right" : "justify-start text-left") 
          : "justify-center text-center"
      )}
      style={{
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
        fontSize,
        fontWeight: isCurrent ? (isFullscreen ? 800 : 700) : (isFullscreen ? 650 : 600),
        letterSpacing: isFullscreen ? "-0.022em" : "-0.012em",
        lineHeight: 1.34,
        opacity: targetOpacity,
        color: targetColor,
        transform: `scale(${targetScale}) translateY(${targetTranslateY}px) translateZ(0)`,
        transformOrigin: origin,
        willChange: "transform, opacity",
        textShadow: isCurrent ? "0 0 24px rgba(255, 255, 255, 0.42), 0 0 55px rgba(255, 255, 255, 0.15)" : "none"
      }}
    >
      <span className="relative inline-block max-w-full">
        {text}
      </span>
    </div>
  );
});
