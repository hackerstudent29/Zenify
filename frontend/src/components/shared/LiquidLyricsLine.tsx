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
  const { isCurrent, isPast, distFromActive, isFullscreen, isMobile, isInterlude, isRightAligned, text, isUserScrolling, isUnsynced } = props;

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
    
    // Sidebar mode (!isFullscreen): Current line crisp (blur(0px)), immediate upcoming line gets light visible blur (blur(2.5px))
    if (!isFullscreen) {
      if (distFromActive === 1) {
        // Immediate upcoming line: light visible blur
        targetOpacity = 0.65;
        targetBlur = "blur(2.5px)";
      } else if (distFromActive === -1) {
        // Immediate past line
        targetOpacity = 0.40;
        targetBlur = "blur(5px)";
      } else if (distFromActive >= 2) {
        // Further upcoming lines
        targetOpacity = 0.25;
        targetBlur = "blur(7px)";
      } else {
        // Further past lines
        targetOpacity = 0.15;
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

  const fontSize = isFullscreen ? "28px" : isMobile ? "28px" : "24px";
  const origin = isFullscreen ? (isRightAligned ? "right center" : "left center") : "center center";

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
              "w-2 h-2 rounded-full transition-all duration-500",
              isCurrent 
                ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)] animate-pulse" 
                : "bg-white/40"
            )}
            style={isCurrent ? { animationDelay: `${i * 0.2}s` } : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full leading-[1.4] px-4 flex transition-all duration-300 ease-out",
        isFullscreen ? (isRightAligned ? "justify-end text-right" : "justify-start text-left") : "justify-center text-center"
      )}
      style={{
        fontSize,
        fontWeight: 800,
        opacity: targetOpacity,
        filter: targetBlur,
        transform: isCurrent ? "scale(1.05) translateZ(0)" : "scale(1) translateZ(0)",
        transformOrigin: origin,
        willChange: "transform, opacity, filter"
      }}
    >
      {isCurrent ? (
        <ActiveInner {...props} origin={origin as string} />
      ) : (
        <div 
          className={cn(
            "relative flex flex-wrap cursor-pointer select-none",
            isFullscreen ? (isRightAligned ? "justify-end" : "justify-start") : "justify-center"
          )} 
          style={{ transformOrigin: origin, gap: "0.25em" }}
        >
          {text.split(" ").map((word, i) => (
            <StaticWordFill key={i} word={word} isPast={isPast} isUserScrolling={isUserScrolling} />
          ))}
        </div>
      )}
    </div>
  );
});

function ActiveInner(props: LiquidLyricsLineProps & { origin: string }) {
  const { text, lineStartTime, lineEndTime, smoothTimeValue, words, origin } = props;

  const wordTokens = text.split(" ");
  const totalWords = wordTokens.length;
  const totalChars = wordTokens.reduce((acc, w) => acc + w.length, 0);
  let charAccumulator = 0;
  
  return (
    <div 
      className={cn(
        "relative flex flex-wrap cursor-pointer select-none",
        origin.includes("right") ? "justify-end" : origin.includes("left") ? "justify-start" : "justify-center"
      )} 
      style={{ transformOrigin: origin, gap: "0.25em" }}
    >
      {wordTokens.map((word, i) => {
        const explicitWord = words?.[i];
        const startPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 0;
        charAccumulator += word.length;
        const endPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 100;

        return (
          <ActiveWordFill
            key={i}
            word={word}
            wordIndex={i}
            totalWords={totalWords}
            lineStartTime={lineStartTime}
            lineEndTime={lineEndTime}
            charStart={startPct}
            charEnd={endPct}
            explicitTime={explicitWord?.time}
            explicitEndTime={explicitWord?.endTime}
            smoothTimeValue={smoothTimeValue}
          />
        );
      })}
      <span className="sr-only">{text}</span>
    </div>
  );
}

function StaticWordFill({ word, isPast, isUserScrolling }: { word: string; isPast: boolean; isUserScrolling?: boolean; }) {
  const clipPathStyle = isPast ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)";
  const baseColor = isUserScrolling ? "text-white/60" : (isPast ? "opacity-75" : "text-white/[0.22]");

  return (
    <span className="relative inline-block">
      <span className={cn(baseColor, "transition-colors duration-300 font-black")}>
        {word}
      </span>
      <span
        className="absolute inset-0 font-black text-transparent"
        style={{
          clipPath: clipPathStyle,
          WebkitClipPath: clipPathStyle,
          background: "var(--accent-gradient)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
        }}
        aria-hidden="true"
      >
        {word}
      </span>
    </span>
  );
}

interface ActiveWordFillProps {
  word: string;
  wordIndex: number;
  totalWords: number;
  lineStartTime: number;
  lineEndTime: number;
  charStart: number;
  charEnd: number;
  explicitTime?: number;
  explicitEndTime?: number;
  smoothTimeValue: any;
}

function ActiveWordFill({
  word, wordIndex, totalWords,
  lineStartTime, lineEndTime,
  charStart, charEnd,
  explicitTime, explicitEndTime,
  smoothTimeValue
}: ActiveWordFillProps) {
  const fillRef = React.useRef<HTMLSpanElement>(null);
  const glowRef = React.useRef<HTMLSpanElement>(null);

  const updateFill = React.useCallback((val: number) => {
    const fillEl = fillRef.current;
    const glowEl = glowRef.current;
    if (!fillEl) return;

    let pct: number;

    if (explicitTime !== undefined) {
      // Word-level timestamps (TTML/karaoke mode)
      if (val >= explicitTime) {
        if (explicitEndTime && val >= explicitEndTime) {
          pct = 100;
        } else {
          const dur = (explicitEndTime || explicitTime + 0.5) - explicitTime;
          pct = Math.min(100, Math.max(0, ((val - explicitTime) / dur) * 100));
        }
      } else {
        pct = 0;
      }
    } else {
      // Line-level fallback: distribute fill across words by character count
      const lineStart = Number.isFinite(lineStartTime) ? lineStartTime : 0;
      const lineEnd = Number.isFinite(lineEndTime) ? lineEndTime : lineStart + 4;
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

    // Smooth letter-by-letter gradient clip for text fill
    const clipVal = `inset(0 ${100 - clipPct}% 0 0)`;
    fillEl.style.clipPath = clipVal;
    (fillEl.style as any).WebkitClipPath = clipVal;
    fillEl.style.opacity = clipPct > 0 ? "1.0" : "0";

    // Smooth letter-by-letter soft mask for radiant glow (zero rectangle box!)
    if (glowEl) {
      if (clipPct <= 0) {
        glowEl.style.opacity = "0";
      } else if (clipPct >= 100) {
        glowEl.style.opacity = "0.35";
        glowEl.style.maskImage = "none";
        (glowEl.style as any).WebkitMaskImage = "none";
      } else {
        glowEl.style.opacity = "0.85";
        const maskVal = `linear-gradient(to right, black 0%, black ${clipPct}%, transparent ${Math.min(100, clipPct + 8)}%)`;
        glowEl.style.maskImage = maskVal;
        (glowEl.style as any).WebkitMaskImage = maskVal;
      }
    }
  }, [explicitTime, explicitEndTime, lineStartTime, lineEndTime, charStart, charEnd]);

  useMotionValueEvent(smoothTimeValue, "change", updateFill);

  React.useEffect(() => {
    updateFill(smoothTimeValue.get());
  }, [updateFill, smoothTimeValue]);

  return (
    <span className="relative inline-block">
      {/* Dim Base Text */}
      <span className="text-white/[0.22] font-black">{word}</span>

      {/* Subtle Sleek Font-Glyph Glow */}
      <span
        ref={glowRef}
        className="absolute inset-0 font-black pointer-events-none transition-opacity duration-150"
        style={{
          opacity: 0,
          color: "var(--accent-brand)",
          filter: "drop-shadow(0 0 5px rgba(var(--accent-brand-rgb), 0.55))",
          willChange: "mask-image, opacity",
        }}
        aria-hidden="true"
      >
        {word}
      </span>

      {/* Active Multi-Color Gradient Fill */}
      <span
        ref={fillRef}
        className="absolute inset-0 font-black text-transparent transition-opacity duration-150"
        style={{
          clipPath: 'inset(0 100% 0 0)',
          WebkitClipPath: 'inset(0 100% 0 0)',
          background: "var(--accent-gradient)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          willChange: "clip-path",
        }}
        aria-hidden="true"
      >
        {word}
      </span>
    </span>
  );
}

