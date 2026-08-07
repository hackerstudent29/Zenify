"use client";

import React from "react";
import { motion, useMotionValueEvent } from "framer-motion";
import { cn } from "@/lib/utils";

interface LiquidLyricsLineProps {
  text: string;
  isCurrent: boolean;
  isPast: boolean;
  isUpcoming: boolean;
  distFromActive: number;
  lineStartTime: number;
  lineEndTime: number;
  smoothTimeValue: any;
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
    isCurrent, isPast, distFromActive, isFullscreen, isMobile, 
    isInterlude, isRightAligned, text, isUserScrolling, isUnsynced,
    words, lineStartTime, lineEndTime, smoothTimeValue
  } = props;

  let targetOpacity: number;
  let targetBlur = "blur(0px)";

  if (isUnsynced) {
    targetOpacity = 0.9;
    targetBlur = "blur(0px)";
  } else if (isCurrent) {
    targetOpacity = 1;
    targetBlur = "blur(0px)";
  } else if (isUserScrolling) {
    targetOpacity = 0.88; 
    targetBlur = "blur(0px)";
  } else {
    const absDist = Math.abs(distFromActive);
    
    // Sidebar mode (!isFullscreen): Upcoming line crisp (0px blur), 2nd upcoming line blurred with visibility (3px blur)
    if (!isFullscreen) {
      if (distFromActive === 1) {
        // Immediate upcoming line: crisp and fully visible
        targetOpacity = 0.75;
        targetBlur = "blur(0px)";
      } else if (distFromActive === 2) {
        // Next line of upcoming line: blurred with visibility
        targetOpacity = 0.45;
        targetBlur = "blur(3px)";
      } else if (distFromActive === -1) {
        // Immediate past line
        targetOpacity = 0.35;
        targetBlur = "blur(4.5px)";
      } else if (distFromActive >= 3) {
        // Further upcoming lines
        targetOpacity = 0.20;
        targetBlur = "blur(7px)";
      } else {
        // Further past lines
        targetOpacity = 0.12;
        targetBlur = "blur(9px)";
      }
    } else {
      // Fullscreen mode
      if (absDist === 1) { 
        targetOpacity = 0.60; 
        targetBlur = "blur(0px)";
      } else if (absDist === 2) { 
        targetOpacity = 0.35; 
        targetBlur = "blur(4px)";
      } else { 
        targetOpacity = 0.18; 
        targetBlur = "blur(8px)";
      }
    }
  }

  const fontSize = isFullscreen 
    ? (isMobile ? "clamp(28px, 7vw, 36px)" : "clamp(32px, 3.5vw, 46px)") 
    : (isMobile ? "24px" : "22px");
  const origin = isFullscreen ? "left center" : "center center";

  if (isInterlude) {
    return (
      <div
        className="flex gap-3 items-center w-full justify-center py-2 transition-opacity duration-[600ms] ease-out"
        style={{ opacity: targetOpacity }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className={cn(
              "rounded-full transition-all duration-500",
              isCurrent 
                ? "w-3.5 h-3.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] animate-pulse" 
                : "w-2 h-2 bg-white/40"
            )}
            style={isCurrent ? { animationDelay: `${i * 0.2}s` } : undefined}
          />
        ))}
      </div>
    );
  }

  const wordTokens = text.split(" ");
  const totalWords = wordTokens.length;
  const totalChars = wordTokens.reduce((acc, w) => acc + w.length, 0);
  let charAccumulator = 0;

  return (
    <div
      className={cn(
        "w-full leading-[1.35] px-4 flex transition-[transform,opacity] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] transform-gpu",
        isFullscreen ? "justify-start text-left" : "justify-center text-center"
      )}
      style={{
        fontFamily: 'ui-rounded, "SF Pro Rounded", "Nunito", "Quicksand", "Arial Rounded MT Bold", sans-serif',
        fontSize,
        fontWeight: 800,
        opacity: targetOpacity,
        filter: targetBlur,
        transform: isCurrent ? "scale(1.03) translateZ(0)" : "scale(1) translateZ(0)",
        transformOrigin: origin,
        willChange: "transform, opacity"
      }}
    >
      <div 
        className={cn(
          "relative flex flex-wrap cursor-pointer select-none",
          origin.includes("left") ? "justify-start" : "justify-center"
        )} 
        style={{ transformOrigin: origin, gap: "0.25em" }}
      >
        {wordTokens.map((word, i) => {
          const explicitWord = words?.[i];
          const prevExplicitWord = i > 0 ? words?.[i - 1] : undefined;
          
          const prevStartPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 0;
          const startPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 0;
          charAccumulator += word.length;
          const endPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 100;

          return (
            <UnifiedWordFill
              key={i}
              word={word}
              wordIndex={i}
              totalWords={totalWords}
              lineStartTime={lineStartTime}
              lineEndTime={lineEndTime}
              charStart={startPct}
              charEnd={endPct}
              prevCharStart={i > 0 ? prevStartPct : undefined}
              explicitTime={explicitWord?.time}
              explicitEndTime={explicitWord?.endTime}
              prevExplicitTime={prevExplicitWord?.time}
              smoothTimeValue={smoothTimeValue}
              isCurrent={isCurrent}
              isPast={isPast}
              isUserScrolling={isUserScrolling}
            />
          );
        })}
        <span className="sr-only">{text}</span>
      </div>
    </div>
  );
});

interface UnifiedWordFillProps {
  word: string;
  wordIndex: number;
  totalWords: number;
  lineStartTime: number;
  lineEndTime: number;
  charStart: number;
  charEnd: number;
  prevCharStart?: number;
  explicitTime?: number;
  explicitEndTime?: number;
  prevExplicitTime?: number;
  smoothTimeValue: any;
  isCurrent: boolean;
  isPast: boolean;
  isUserScrolling?: boolean;
}

function UnifiedWordFill({
  word, wordIndex, totalWords,
  lineStartTime, lineEndTime,
  charStart, charEnd, prevCharStart,
  explicitTime, explicitEndTime, prevExplicitTime,
  smoothTimeValue,
  isCurrent, isPast, isUserScrolling
}: UnifiedWordFillProps) {
  const fillRef = React.useRef<HTMLSpanElement>(null);
  const glowRef = React.useRef<HTMLSpanElement>(null);
  const containerRef = React.useRef<HTMLSpanElement>(null);

  const updateFill = React.useCallback((val: number) => {
    const fillEl = fillRef.current;
    const glowEl = glowRef.current;
    const containerEl = containerRef.current;
    if (!fillEl) return;

    if (!isCurrent) {
      if (isPast) {
        fillEl.style.clipPath = "inset(-100% 0% -100% -100%)";
        (fillEl.style as any).WebkitClipPath = "inset(-100% 0% -100% -100%)";
        fillEl.style.opacity = "0.82";
      } else {
        fillEl.style.clipPath = "inset(-100% 100% -100% -100%)";
        (fillEl.style as any).WebkitClipPath = "inset(-100% 100% -100% -100%)";
        fillEl.style.opacity = "0";
      }
      if (glowEl) {
        glowEl.style.opacity = "0";
      }
      return;
    }

    let pct: number;

    const hasValidExplicitTime = 
      explicitTime !== undefined && 
      Number.isFinite(explicitTime) && 
      explicitTime > 0 &&
      explicitEndTime !== undefined &&
      Number.isFinite(explicitEndTime) &&
      explicitEndTime > explicitTime;

    if (hasValidExplicitTime) {
      if (val >= explicitTime) {
        if (val >= explicitEndTime) {
          pct = 100;
        } else {
          const dur = explicitEndTime - explicitTime;
          pct = dur > 0 ? Math.min(100, Math.max(0, ((val - explicitTime) / dur) * 100)) : 100;
        }
      } else {
        pct = 0;
      }
    } else {
      const lineStart = Number.isFinite(lineStartTime) ? lineStartTime : 0;
      const lineEnd = Number.isFinite(lineEndTime) && lineEndTime > lineStart ? lineEndTime : lineStart + 3.5;
      const lineDur = lineEnd - lineStart;
      if (lineDur <= 0) { pct = 0; }
      else {
        const linePct = Math.max(0, Math.min(100, ((val - lineStart) / lineDur) * 100));
        if (linePct <= charStart) pct = 0;
        else if (linePct >= charEnd) pct = 100;
        else {
          const range = charEnd - charStart;
          pct = range > 0 ? ((linePct - charStart) / range) * 100 : 100;
        }
      }
    }

    const clipPct = Math.max(0, Math.min(100, pct));

    const clipVal = `inset(-100% ${100 - clipPct}% -100% -100%)`;
    fillEl.style.clipPath = clipVal;
    (fillEl.style as any).WebkitClipPath = clipVal;
    fillEl.style.opacity = clipPct > 0 ? "1.0" : "0";

    // Check if the preceding word has started filling
    let isPrevFilling = false;
    if (wordIndex > 0) {
      if (prevExplicitTime !== undefined) {
        isPrevFilling = val >= prevExplicitTime;
      } else {
        const lineStart = Number.isFinite(lineStartTime) ? lineStartTime : 0;
        const lineEnd = Number.isFinite(lineEndTime) ? lineEndTime : lineStart + 4;
        const lineDur = lineEnd - lineStart;
        if (lineDur > 0 && prevCharStart !== undefined) {
          const linePct = Math.max(0, Math.min(100, ((val - lineStart) / lineDur) * 100));
          isPrevFilling = linePct >= prevCharStart;
        }
      }
    }



    if (glowEl) {
      if (clipPct <= 0) {
        glowEl.style.opacity = "0";
      } else if (clipPct >= 100) {
        glowEl.style.opacity = "0.35";
        glowEl.style.clipPath = "inset(-100% 0% -100% -100%)";
        (glowEl.style as any).WebkitClipPath = "inset(-100% 0% -100% -100%)";
      } else {
        glowEl.style.opacity = "0.85";
        glowEl.style.clipPath = clipVal; // Hardware-accelerated clip instead of CPU-bound mask-image!
        (glowEl.style as any).WebkitClipPath = clipVal;
      }
    }
  }, [isCurrent, isPast, explicitTime, explicitEndTime, lineStartTime, lineEndTime, charStart, charEnd]);

  useMotionValueEvent(smoothTimeValue, "change", updateFill);

  React.useEffect(() => {
    updateFill(smoothTimeValue.get());
  }, [updateFill, smoothTimeValue]);

  return (
    <span 
      ref={containerRef}
      className="relative inline-block origin-center overflow-visible"
    >
      {/* Base Dim Text — Apple style translucent white */}
      <span className={cn("font-black transition-colors duration-300", isUserScrolling ? "text-white/80" : "text-white/50")}>{word}</span>

      {/* Glow Layer */}
      <span
        ref={glowRef}
        className="absolute inset-0 font-black pointer-events-none text-transparent"
        style={{
          opacity: 0,
          textShadow: "0 0 3px rgba(255,255,255,0.8)",
          transition: "opacity 150ms ease",
          willChange: "opacity, clip-path",
        }}
        aria-hidden="true"
      >
        {word}
      </span>

      {/* Fill Layer */}
      <span
        ref={fillRef}
        className="absolute inset-0 font-black text-white"
        style={{
          clipPath: 'inset(-100% 100% -100% -100%)',
          WebkitClipPath: 'inset(-100% 100% -100% -100%)',
          transition: "opacity 150ms ease",
          willChange: "clip-path",
        }}
        aria-hidden="true"
      >
        {word}
      </span>
    </span>
  );
}
