"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface LiquidLyricsLineProps {
  text: string;
  isCurrent: boolean;
  isPast: boolean;
  isUpcoming: boolean;
  distFromActive: number;
  lineStartTime: number;
  lineEndTime: number;
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
    isCurrent, isPast, distFromActive, isFullscreen, isMobile, 
    isInterlude, isRightAligned, text, isUserScrolling, isUnsynced,
    words, lineStartTime, lineEndTime, smoothTimeValue
  } = props;

  let targetOpacity = 0.12;
  let targetScale = 0.92;
  let targetTranslateY = 0;

  if (isUnsynced) {
    targetOpacity = 0.85;
    targetScale = 1;
    targetTranslateY = 0;
  } else if (isCurrent) {
    targetOpacity = 1;
    targetScale = isFullscreen ? (isMobile ? 1.03 : 1.045) : 1.03;
    targetTranslateY = isFullscreen ? -2 : 0;
  } else if (isUserScrolling) {
    targetOpacity = 0.75;
    targetScale = 1;
    targetTranslateY = 0;
  } else {
    // Apple Music optical depth curve
    if (distFromActive === 1) {
      targetOpacity = 0.55;
      targetScale = 0.98;
      targetTranslateY = 0;
    } else if (distFromActive === 2) {
      targetOpacity = 0.32;
      targetScale = 0.95;
      targetTranslateY = 1;
    } else if (distFromActive === 3) {
      targetOpacity = 0.18;
      targetScale = 0.92;
      targetTranslateY = 2;
    } else if (distFromActive > 3) {
      targetOpacity = 0.08;
      targetScale = 0.88;
      targetTranslateY = 3;
    } else if (distFromActive === -1) {
      targetOpacity = 0.32;
      targetScale = 0.98;
      targetTranslateY = -1;
    } else if (distFromActive === -2) {
      targetOpacity = 0.16;
      targetScale = 0.94;
      targetTranslateY = -2;
    } else {
      targetOpacity = 0.06;
      targetScale = 0.88;
      targetTranslateY = -3;
    }
  }

  // Large, punchy Apple Music typography
  const fontSize = isFullscreen 
    ? (isMobile ? "clamp(28px, 7.5vw, 42px)" : "clamp(34px, 4.2vw, 54px)") 
    : (isMobile ? "clamp(24px, 6vw, 32px)" : "25px");
  const origin = isFullscreen ? "left center" : "center center";

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
                ? "w-3.5 h-3.5 bg-white shadow-[0_0_14px_rgba(255,255,255,0.95)] animate-pulse" 
                : "w-2 h-2 bg-white/40"
            )}
            style={isCurrent ? { animationDelay: `${i * 0.22}s` } : undefined}
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
      data-lyrics-line="true"
      className={cn(
        "w-full leading-[1.28] px-4 flex transform-gpu group cursor-pointer select-none",
        isFullscreen ? "justify-start text-left" : "justify-center text-center"
      )}
      style={{
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
        fontSize,
        fontWeight: isFullscreen ? 700 : 600,
        letterSpacing: isFullscreen ? "-0.022em" : "-0.012em",
        opacity: targetOpacity,
        transform: `scale(${targetScale}) translateY(${targetTranslateY}px) translateZ(0)`,
        transformOrigin: origin,
        transition: "transform 550ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 450ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        willChange: "transform, opacity",
        textShadow: isCurrent ? "0 0 24px rgba(255, 255, 255, 0.35)" : "none"
      }}
    >
      <div 
        className={cn(
          "relative flex flex-wrap cursor-pointer select-none",
          origin.includes("left") ? "justify-start" : "justify-center"
        )} 
        style={{ transformOrigin: origin, gap: "0.24em" }}
      >
        {wordTokens.map((word, i) => {
          if (!isCurrent) {
            return (
              <StaticWord
                key={i}
                word={word}
                isPast={isPast}
                isUserScrolling={isUserScrolling}
              />
            );
          }

          const explicitWord = words?.[i];
          const startPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 0;
          charAccumulator += word.length;
          const endPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 100;

          return (
            <ActiveAppleWordFill
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
    </div>
  );
});

interface ActiveAppleWordFillProps {
  word: string;
  wordIndex: number;
  totalWords: number;
  lineStartTime: number;
  lineEndTime: number;
  charStart: number;
  charEnd: number;
  explicitTime?: number;
  explicitEndTime?: number;
  smoothTimeValue?: any;
}

const ActiveAppleWordFill = React.memo(function ActiveAppleWordFill({
  word, wordIndex, totalWords,
  lineStartTime, lineEndTime,
  charStart, charEnd,
  explicitTime, explicitEndTime,
  smoothTimeValue
}: ActiveAppleWordFillProps) {
  const fillRef = React.useRef<HTMLSpanElement>(null);
  const glowRef = React.useRef<HTMLSpanElement>(null);

  const updateFill = React.useCallback((val: number) => {
    const fillEl = fillRef.current;
    const glowEl = glowRef.current;
    if (!fillEl) return;

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
      // Smooth continuous interpolation across line duration
      const lineStart = Number.isFinite(lineStartTime) ? lineStartTime : 0;
      const lineEnd = Number.isFinite(lineEndTime) && lineEndTime > lineStart ? lineEndTime : lineStart + 3.5;
      const lineDur = lineEnd - lineStart;
      if (lineDur <= 0) {
        pct = 0;
      } else {
        const linePct = Math.max(0, Math.min(100, ((val - lineStart) / lineDur) * 100));
        if (linePct <= charStart) {
          pct = 0;
        } else if (linePct >= charEnd) {
          pct = 100;
        } else {
          const range = charEnd - charStart;
          pct = range > 0 ? ((linePct - charStart) / range) * 100 : 100;
        }
      }
    }

    const clipPct = Math.max(0, Math.min(100, pct));
    const rightInset = (100 - clipPct).toFixed(1);
    const clipStyle = `inset(0% ${rightInset}% 0% 0%)`;

    fillEl.style.clipPath = clipStyle;
    (fillEl.style as any).WebkitClipPath = clipStyle;

    if (glowEl) {
      if (clipPct > 0 && clipPct < 100) {
        glowEl.style.opacity = "1";
        glowEl.style.clipPath = clipStyle;
        (glowEl.style as any).WebkitClipPath = clipStyle;
      } else {
        glowEl.style.opacity = "0";
      }
    }
  }, [explicitTime, explicitEndTime, lineStartTime, lineEndTime, charStart, charEnd]);

  React.useEffect(() => {
    if (!smoothTimeValue || typeof smoothTimeValue.on !== "function") return;
    
    // Initial evaluation
    if (typeof smoothTimeValue.get === "function") {
      updateFill(smoothTimeValue.get());
    }

    const unsubscribe = smoothTimeValue.on("change", (latest: number) => {
      updateFill(latest);
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [smoothTimeValue, updateFill]);

  return (
    <span className="relative inline-block origin-center overflow-visible">
      {/* Base Translucent Layer (Unvocalized) */}
      <span className="text-white/45 font-bold transition-colors duration-300">{word}</span>

      {/* Radiant Glow Sweep Layer (Leading Edge) */}
      <span
        ref={glowRef}
        className="absolute inset-0 font-bold text-white pointer-events-none select-none transition-opacity duration-150"
        style={{
          opacity: 0,
          clipPath: "inset(0% 100% 0% 0%)",
          WebkitClipPath: "inset(0% 100% 0% 0%)",
          textShadow: "0 0 12px rgba(255, 255, 255, 0.9), 0 0 24px rgba(255, 255, 255, 0.6)",
          willChange: "clip-path, opacity",
        }}
        aria-hidden="true"
      >
        {word}
      </span>

      {/* Pure White Filled Layer (Vocalized) */}
      <span
        ref={fillRef}
        className="absolute inset-0 font-bold text-white pointer-events-none select-none drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
        style={{
          clipPath: "inset(0% 100% 0% 0%)",
          WebkitClipPath: "inset(0% 100% 0% 0%)",
          willChange: "clip-path",
        }}
        aria-hidden="true"
      >
        {word}
      </span>
    </span>
  );
});

function StaticWord({
  word,
  isPast,
  isUserScrolling,
}: {
  word: string;
  isPast: boolean;
  isUserScrolling?: boolean;
}) {
  if (isPast) {
    return (
      <span className="relative inline-block origin-center overflow-visible">
        <span className="text-white/80 font-bold transition-colors duration-300">{word}</span>
      </span>
    );
  }
  return (
    <span className="relative inline-block origin-center overflow-visible">
      <span className={cn("font-bold transition-colors duration-300", isUserScrolling ? "text-white/70" : "text-white/45")}>
        {word}
      </span>
    </span>
  );
}
