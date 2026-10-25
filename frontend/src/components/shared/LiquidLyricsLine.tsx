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
  let targetScale = "scale(1)";
  let targetTranslate = "translateY(0)";

  if (isUnsynced) {
    targetOpacity = 0.92;
    targetBlur = "blur(0px)";
    targetScale = "scale(1)";
    targetTranslate = "translateY(0)";
  } else if (isCurrent) {
    targetOpacity = 1;
    targetBlur = "blur(0px)";
    targetScale = isFullscreen ? "scale(1.055)" : "scale(1.035)";
    targetTranslate = isFullscreen ? "translateY(-2px)" : "translateY(0)";
  } else if (isUserScrolling) {
    targetOpacity = 0.88; 
    targetBlur = "blur(0px)";
    targetScale = "scale(1)";
    targetTranslate = "translateY(0)";
  } else if (isMobile) {
    // Clean, structured mobile depth curve — prevents lines from overlapping on 2-line wraps
    if (distFromActive === 1) {
      targetOpacity = 0.62;
      targetBlur = "blur(0px)";
      targetScale = "scale(0.98)";
      targetTranslate = "translateY(0)";
    } else if (distFromActive === 2) {
      targetOpacity = 0.36;
      targetBlur = "blur(2px)";
      targetScale = "scale(0.94)";
      targetTranslate = "translateY(1px)";
    } else if (distFromActive === 3) {
      targetOpacity = 0.18;
      targetBlur = "blur(4px)";
      targetScale = "scale(0.90)";
      targetTranslate = "translateY(2px)";
    } else if (distFromActive > 3) {
      targetOpacity = 0.08;
      targetBlur = "blur(6px)";
      targetScale = "scale(0.86)";
      targetTranslate = "translateY(3px)";
    } else if (distFromActive === -1) {
      targetOpacity = 0.32;
      targetBlur = "blur(1.5px)";
      targetScale = "scale(0.97)";
      targetTranslate = "translateY(0)";
    } else if (distFromActive === -2) {
      targetOpacity = 0.16;
      targetBlur = "blur(3px)";
      targetScale = "scale(0.92)";
      targetTranslate = "translateY(-1px)";
    } else {
      targetOpacity = 0.06;
      targetBlur = "blur(6px)";
      targetScale = "scale(0.87)";
      targetTranslate = "translateY(-2px)";
    }
  } else {
    // PC / Desktop: Exact Apple Music Depth Curve restored from commit 6d6e745
    if (!isFullscreen) {
      if (distFromActive === 1) {
        targetOpacity = 0.72;
        targetBlur = "blur(0px)";
        targetScale = "scale(0.98)";
        targetTranslate = "translateY(0)";
      } else if (distFromActive === 2) {
        targetOpacity = 0.45;
        targetBlur = "blur(2.5px)";
        targetScale = "scale(0.95)";
        targetTranslate = "translateY(0)";
      } else if (distFromActive === -1) {
        targetOpacity = 0.35;
        targetBlur = "blur(3.5px)";
        targetScale = "scale(0.96)";
        targetTranslate = "translateY(0)";
      } else if (distFromActive >= 3) {
        targetOpacity = 0.18;
        targetBlur = "blur(6px)";
        targetScale = "scale(0.92)";
        targetTranslate = "translateY(0)";
      } else {
        targetOpacity = 0.10;
        targetBlur = "blur(8px)";
        targetScale = "scale(0.90)";
        targetTranslate = "translateY(0)";
      }
    } else {
      // Apple Music Fullview Depth Curve (PC)
      if (distFromActive === 1) {
        targetOpacity = 0.58;
        targetBlur = "blur(0px)";
        targetScale = "scale(0.97)";
        targetTranslate = "translateY(0)";
      } else if (distFromActive === 2) {
        targetOpacity = 0.34;
        targetBlur = "blur(2.5px)";
        targetScale = "scale(0.93)";
        targetTranslate = "translateY(1px)";
      } else if (distFromActive === 3) {
        targetOpacity = 0.18;
        targetBlur = "blur(5px)";
        targetScale = "scale(0.89)";
        targetTranslate = "translateY(2px)";
      } else if (distFromActive > 3) {
        targetOpacity = 0.08;
        targetBlur = "blur(8px)";
        targetScale = "scale(0.86)";
        targetTranslate = "translateY(3px)";
      } else if (distFromActive === -1) {
        targetOpacity = 0.32;
        targetBlur = "blur(2px)";
        targetScale = "scale(0.96)";
        targetTranslate = "translateY(-1px)";
      } else if (distFromActive === -2) {
        targetOpacity = 0.16;
        targetBlur = "blur(5px)";
        targetScale = "scale(0.91)";
        targetTranslate = "translateY(-2px)";
      } else {
        targetOpacity = 0.06;
        targetBlur = "blur(8px)";
        targetScale = "scale(0.86)";
        targetTranslate = "translateY(-3px)";
      }
    }
  }

  // Respect user accessibility preferences for reduced motion
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    targetBlur = "blur(0px)";
    targetScale = "scale(1)";
    targetTranslate = "translateY(0)";
  }

  // Typography:
  // PC: Classic Apple Music restored from yesterday's commit (clamp(34px, 4vw, 52px) on fullscreen, 24px on sidebar)
  // Mobile: Increased font size per user request (clamp(26px, 6.5vw, 36px) on fullscreen, clamp(22px, 5.5vw, 28px) on mobile view)
  const fontSize = isFullscreen 
    ? (isMobile ? "clamp(23px, 5.8vw, 27px)" : "clamp(34px, 4vw, 52px)") 
    : (isMobile ? "clamp(20px, 5vw, 24px)" : "24px");
  const origin = isFullscreen ? "left center" : "center center";

  if (isInterlude) {
    return (
      <GapDots
        isCurrent={isCurrent}
        isPast={isPast}
        lineStartTime={lineStartTime}
        lineEndTime={lineEndTime}
        smoothTimeValue={smoothTimeValue}
        targetOpacity={targetOpacity}
      />
    );
  }

  // Scrub punctuation without spaces to prevent words from being glued together
  const cleanedText = (text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\d{1,2}:\d{2}[^\]]*\]/g, " ")
    .replace(/([,;:!?])([A-Za-z0-9\u0B80-\u0D7F])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  const wordTokens = cleanedText.split(" ");
  const totalWords = wordTokens.length;
  const totalChars = wordTokens.reduce((acc, w) => acc + w.length, 0);
  let charAccumulator = 0;

  return (
    <div
      data-lyrics-line="true"
      className={cn(
        "w-full px-4 flex transition-[transform,opacity,filter] duration-[600ms] ease-[cubic-bezier(0.25,1,0.5,1)] transform-gpu group cursor-pointer lyric-line",
        isFullscreen ? "justify-start text-left" : "justify-center text-center"
      )}
      style={{
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
        fontSize,
        lineHeight: 1.15,
        fontWeight: isFullscreen ? 800 : 700,
        letterSpacing: "normal",
        opacity: targetOpacity,
        filter: targetBlur,
        transform: `${targetScale} ${targetTranslate} translateZ(0)`,
        transformOrigin: origin,
        willChange: "transform, opacity, filter",
        display: "flex",
        alignItems: "center"
      }}
    >
      <div 
        className={cn(
          "relative flex flex-wrap items-baseline cursor-pointer select-none min-w-0 max-w-full",
          origin.includes("left") ? "justify-start text-left" : "justify-center text-center"
        )} 
        style={{ 
          transformOrigin: origin, 
          rowGap: "0.04em",
          columnGap: "0.24em",
          wordBreak: "break-word", 
          overflowWrap: "anywhere",
          textWrap: "balance" as any,
          display: "flex",
          flexWrap: "wrap",
          overflow: "visible"
        }}
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
        <span className="sr-only">{cleanedText}</span>
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
      className="relative inline-block origin-center overflow-visible select-none"
      style={{
        whiteSpace: "nowrap"
      }}
    >
      {/* Base Dim Text — Apple style translucent white */}
      <span className={cn("font-bold transition-colors duration-300", isUserScrolling ? "text-white/80" : "text-white/50")}>{word}</span>

      {/* Glow Layer */}
      <span
        ref={glowRef}
        className="absolute inset-0 font-bold pointer-events-none text-transparent"
        style={{
          opacity: 0,
          textShadow: "0 0 12px rgba(255,255,255,0.7), 0 0 2px rgba(255,255,255,0.9)",
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
        className="absolute inset-0 font-bold text-white"
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

function GapDots({
  isCurrent,
  isPast,
  lineStartTime,
  lineEndTime,
  smoothTimeValue,
  targetOpacity
}: {
  isCurrent: boolean;
  isPast: boolean;
  lineStartTime: number;
  lineEndTime: number;
  smoothTimeValue: any;
  targetOpacity: number;
}) {
  const [progress, setProgress] = React.useState(isPast ? 1 : 0);

  useMotionValueEvent(smoothTimeValue, "change", (t: number) => {
    if (!isCurrent) {
      setProgress(isPast ? 1 : 0);
      return;
    }
    const dur = Math.max(0.5, lineEndTime - lineStartTime);
    const p = Math.max(0, Math.min(1, (t - lineStartTime) / dur));
    setProgress(p);
  });

  // 3-dot Apple-style progressive fill: dot 1 (0-33%), dot 2 (33-66%), dot 3 (66-100%)
  const getDotStyles = (i: number) => {
    const minP = i * 0.33;
    const maxP = (i + 1) * 0.33;
    let localP = 0;
    if (progress >= maxP) localP = 1;
    else if (progress <= minP) localP = 0;
    else localP = (progress - minP) / 0.33;

    const s = 0.75 + localP * 0.55;
    const o = 0.35 + localP * 0.65;
    return {
      "--s": String(s),
      "--o": String(o),
    } as React.CSSProperties;
  };

  return (
    <div
      className="gap-dots flex gap-2.5 items-center w-full justify-center py-3 select-none"
      style={{ opacity: targetOpacity }}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} style={getDotStyles(i)} />
      ))}
    </div>
  );
}

