"use client";

import React from "react";
import { motion, useMotionValueEvent, useSpring } from "framer-motion";
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
  const { isCurrent, isPast, distFromActive, isFullscreen, isMobile, isIdle, isInterlude, isRightAligned, text, words, isUserScrolling, isUnsynced } = props;

  let targetOpacity: number;
  const isHiddenMobile = isMobile && !isUserScrolling && (
    isIdle 
      ? (distFromActive < -2 || distFromActive > 2)
      : (distFromActive < -1 || distFromActive > 1)
  );

  if (isUnsynced) {
    targetOpacity = 0.9;
  } else if (isCurrent) {
    targetOpacity = 1;
  } else if (isUserScrolling) {
    targetOpacity = 0.9; 
  } else {
    if (isHiddenMobile) { 
      targetOpacity = 0; 
    } else {
      const absDist = Math.abs(distFromActive);
      if (absDist === 1) { 
        targetOpacity = 0.50; 
      } else if (absDist === 2) { 
        targetOpacity = 0.30; 
      } else { 
        targetOpacity = 0.15; 
      }
    }
  }

  const fontSize = isFullscreen ? "28px" : isMobile ? "28px" : "24px";
  const origin = isFullscreen ? (isRightAligned ? "right center" : "left center") : "center center";

  // Depth blur removed due to massive performance cost on 100+ concurrent DOM elements
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
        "w-full leading-[1.4] px-4 flex transition-opacity duration-[600ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
        isFullscreen ? (isRightAligned ? "justify-end text-right" : "justify-start text-left") : "justify-center text-center"
      )}
      style={{
        fontSize,
        fontWeight: 800,
        transformOrigin: origin,
        opacity: targetOpacity,
        transform: "scale(1)"
      }}
    >
      {isCurrent ? (
        <ActiveInner {...props} origin={origin as string} />
      ) : (
        <div 
          className={cn(
            "relative inline cursor-pointer select-none flex-wrap",
            isFullscreen ? (isRightAligned ? "justify-end" : "justify-start") : "justify-center"
          )} 
          style={{ transformOrigin: origin }}
        >
          {text.split(" ").map((word, i, arr) => (
            <React.Fragment key={i}>
              <StaticWordFill word={word} isPast={isPast} isUserScrolling={isUserScrolling} />
              {i < arr.length - 1 && " "}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
});

function ActiveInner(props: LiquidLyricsLineProps & { origin: string }) {
  const { text, lineStartTime, lineEndTime, smoothTimeValue, words, origin } = props;

  // Line-level fill — used when no per-word timestamps exist (LRC format)
  const lineFill = React.useMemo(() => {
    // We expose this as a motion value via a stable object — computed inside RAF
    // The actual motion value driving this is smoothTimeValue; lineFill is derived below
    return smoothTimeValue;
  }, [smoothTimeValue]);

  const wordTokens = text.split(" ");
  const totalWords = wordTokens.length;
  const totalChars = wordTokens.reduce((acc, w) => acc + w.length, 0);
  let charAccumulator = 0;
  
  return (
    <div className="relative inline cursor-pointer select-none flex-wrap justify-center" style={{ transformOrigin: origin }}>
      {wordTokens.map((word, i, arr) => {
        const explicitWord = words?.[i];
        const startPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 0;
        charAccumulator += word.length;
        const endPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 100;

        return (
          <React.Fragment key={i}>
            <ActiveWordFill
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
            {i < arr.length - 1 && " "}
          </React.Fragment>
        );
      })}
      <span className="sr-only">{text}</span>
    </div>
  );
}

function StaticWordFill({ word, isPast, isUserScrolling }: { word: string; isPast: boolean; isUserScrolling?: boolean; }) {
  const clipPathStyle = isPast ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)";
  const baseColor = isUserScrolling ? "text-white/60" : (isPast ? "text-rose-500/35" : "text-white/[0.22]");

  return (
    <span className="relative inline-block transition-colors duration-300">
      <span className={cn(baseColor, "transition-colors duration-300")}>{word}</span>
      <span
        className="absolute inset-0 text-transparent"
        style={{
          clipPath: clipPathStyle,
          WebkitClipPath: clipPathStyle,
          backgroundImage: "linear-gradient(to bottom right, #F43F5E, #fb7185)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
        } as any}
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
  // Ref for direct DOM mutation — bypasses Framer Motion subscriber pipeline entirely
  const fillRef = React.useRef<HTMLSpanElement>(null);

  // Subscribe to the motion value and write clipPath directly to the DOM element.
  // This is the performance-critical hot path: runs every RAF frame (60fps).
  // No React state, no reconciliation, no Framer Motion transform chain.
  useMotionValueEvent(smoothTimeValue, "change", (val: number) => {
    const el = fillRef.current;
    if (!el) return;

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

    const clipVal = `inset(0 ${100 - pct}% 0 0)`;
    el.style.clipPath = clipVal;
    (el.style as any).WebkitClipPath = clipVal;
  });

  // Ocean wave removed — words stay still, the rose fill sweep is the animation
  return (
    <span className="relative inline-block">
      <span className="text-white/[0.18]">{word}</span>
      <span
        ref={fillRef}
        className="absolute inset-0 text-transparent"
        style={{
          clipPath: 'inset(0 100% 0 0)',
          WebkitClipPath: 'inset(0 100% 0 0)',
          backgroundImage: "linear-gradient(to bottom right, #F43F5E, #fb7185)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          willChange: "clip-path",
        } as any}
        aria-hidden="true"
      >
        {word}
      </span>
    </span>
  );
}
