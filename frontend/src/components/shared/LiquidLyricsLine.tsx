"use client";

import React from "react";
import { motion, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";
import { springCurve } from "@/components/player/PlayerKit";

/* ------------------------------------------------------------------ */
/*  CSS: Direct Hardware-Accelerated Clip Fill + No Jumping Animation  */
/* ------------------------------------------------------------------ */
const LY_CSS = `
.ly-in {
  transition-property: transform, opacity, filter;
  transition-duration: 560ms, 420ms, 520ms;
  transition-timing-function: cubic-bezier(.32,.72,0,1);
}
@supports (transition-timing-function: linear(0, 1)) {
  .ly-in {
    transition-duration: 760ms, 420ms, 520ms;
    transition-timing-function: ${springCurve(0.82, 760)}, ease, ease;
  }
}
.ly-word {
  position: relative;
  display: inline-block;
  white-space: nowrap;
}
.ly-base {
  color: rgba(255, 255, 255, 0.42);
  transition: color 200ms ease;
}
.ly-fill {
  position: absolute;
  inset: 0;
  color: #ffffff;
  font-weight: 700;
  pointer-events: none;
  user-select: none;
  will-change: clip-path, opacity;
}
.ly-glow {
  position: absolute;
  inset: 0;
  color: #ffffff;
  font-weight: 700;
  filter: blur(4px);
  pointer-events: none;
  user-select: none;
  transition: opacity 150ms ease;
}
.ly-dot {
  background: #ffffff;
  will-change: opacity;
}
@media (hover: hover) {
  .ly-row:not(.ly-nohover):hover {
    background: rgba(255, 255, 255, 0.07);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ly-in {
    transition-duration: 1ms !important;
  }
}
`;

export function LyricsStyles() {
  return <style>{LY_CSS}</style>;
}

/* ------------------------------------------------------------------ */
/*  Depth curve (Apple Music styling)                                  */
/* ------------------------------------------------------------------ */
type Depth = { o: number; b: number; s: number };
const AFTER: Depth[] = [
  { o: 0.62, b: 0, s: 0.97 },
  { o: 0.40, b: 1.2, s: 0.94 },
  { o: 0.24, b: 2.6, s: 0.92 },
  { o: 0.14, b: 4.0, s: 0.90 },
];
const BEFORE: Depth[] = [
  { o: 0.35, b: 0.8, s: 0.96 },
  { o: 0.22, b: 2.2, s: 0.93 },
  { o: 0.12, b: 3.8, s: 0.90 },
];

function depthFor(
  dist: number,
  current: boolean,
  manual: boolean,
  unsynced: boolean,
  reduce: boolean,
  mobile: boolean
): Depth {
  if (current || unsynced) return { o: 1, b: 0, s: 1 };
  if (manual) return { o: 0.86, b: 0, s: 0.97 };
  const d = dist > 0 ? AFTER[Math.min(dist, AFTER.length) - 1] : BEFORE[Math.min(-dist, BEFORE.length) - 1];
  return { o: d.o, b: reduce ? 0 : d.b * (mobile ? 0.75 : 1), s: reduce ? 1 : d.s };
}

/* ------------------------------------------------------------------ */
/*  Line Props & Component                                             */
/* ------------------------------------------------------------------ */
export interface LiquidLyricsLineProps {
  text: string;
  isCurrent: boolean;
  isPast: boolean;
  dist: number;
  y: MotionValue<number>;
  smoothTimeValue: MotionValue<number>;
  lineStartTime: number;
  lineEndTime: number;
  words?: Array<{ word: string; time: number; endTime?: number }>;
  isFullscreen?: boolean;
  isMobile?: boolean;
  isInterlude?: boolean;
  isUnsynced?: boolean;
  isUserScrolling?: boolean;
  inWindow?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  onClick?: (e: React.MouseEvent) => void;
}

const prefersReduce = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const LiquidLyricsLine = React.memo(function LiquidLyricsLine(props: LiquidLyricsLineProps) {
  const {
    text,
    isCurrent,
    isPast,
    dist,
    y,
    smoothTimeValue,
    lineStartTime,
    lineEndTime,
    words,
    isFullscreen,
    isMobile,
    isInterlude,
    isUnsynced,
    isUserScrolling,
    inWindow,
    rowRef,
    onClick,
  } = props;

  // Lyrics are always left aligned on the left side
  const left = !isInterlude;
  const reduce = prefersReduce();
  const dp = depthFor(dist, isCurrent, !!isUserScrolling, !!isUnsynced, reduce, !!isMobile);
  const delay = !isCurrent && dist > 0 && !isUserScrolling ? Math.min(dist, 5) * 36 : 0;

  const fontSize = isFullscreen
    ? isMobile
      ? "clamp(25px, 7vw, 32px)"
      : "clamp(28px, 3.3vw, 44px)"
    : isMobile
    ? "clamp(21px, 5.5vw, 26px)"
    : "clamp(20px, 2vw, 24px)";

  const cleaned = React.useMemo(
    () =>
      (text || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\[\d{1,2}:\d{2}[^\]]*\]/g, " ")
        .replace(/([,;:!?])([A-Za-z0-9\u0B80-\u0D7F])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim(),
    [text]
  );
  const tokens = React.useMemo(() => cleaned.split(" ").filter(Boolean), [cleaned]);

  /* Timing per word */
  const timing = React.useMemo(() => {
    const start = Number.isFinite(lineStartTime) ? lineStartTime : 0;
    const end = Number.isFinite(lineEndTime) && lineEndTime > start ? lineEndTime : start + 3.5;
    const dur = end - start;
    const total = tokens.reduce((a, w) => a + w.length, 0) || 1;
    let acc = 0;
    return tokens.map((w, i) => {
      const ex = words?.[i];
      const cs = acc / total;
      acc += w.length;
      const ce = acc / total;
      if (
        ex &&
        Number.isFinite(ex.time) &&
        ex.time > 0 &&
        ex.endTime !== undefined &&
        Number.isFinite(ex.endTime) &&
        ex.endTime > ex.time
      ) {
        return { s: ex.time, e: ex.endTime };
      }
      return { s: start + cs * dur, e: start + ce * dur };
    });
  }, [tokens, words, lineStartTime, lineEndTime]);

  const fillEls = React.useRef<(HTMLSpanElement | null)[]>([]);
  const glowEls = React.useRef<(HTMLSpanElement | null)[]>([]);
  const dotEls = React.useRef<(HTMLSpanElement | null)[]>([]);

  const setWordFill = (i: number, p: number) => {
    const fill = fillEls.current[i];
    const glow = glowEls.current[i];
    if (!fill) return;

    const clipPct = Math.max(0, Math.min(100, p * 100));
    const insetVal = `inset(0 ${100 - clipPct}% 0 0)`;
    fill.style.clipPath = insetVal;
    (fill.style as any).webkitClipPath = insetVal;
    fill.style.opacity = clipPct > 0 ? "1" : "0";

    if (glow) {
      glow.style.opacity = clipPct > 0 && clipPct < 100 ? "0.65" : clipPct >= 100 ? "0.2" : "0";
    }
  };

  const interlude = !!isInterlude || cleaned === "• • •";

  /* Animation loop: only active line binds to time value */
  React.useLayoutEffect(() => {
    if (interlude) {
      const drawDots = (t: number) => {
        const s = lineStartTime,
          e = lineEndTime > s ? lineEndTime : s + 3.5;
        const p = Math.max(0, Math.min(1, (t - s) / Math.max(0.1, e - s)));
        dotEls.current.forEach((d, i) => {
          if (!d) return;
          // Clean pulse without physical bounce or jumping
          const phase = Math.sin((p * Math.PI * 2) - i * 0.8);
          const opacity = isCurrent ? 0.35 + 0.65 * Math.max(0, phase) : isPast ? 0.3 : 0.2;
          d.style.opacity = String(opacity);
        });
      };

      if (isCurrent && smoothTimeValue?.on) {
        drawDots(smoothTimeValue.get());
        return smoothTimeValue.on("change", drawDots);
      }
      dotEls.current.forEach((d) => {
        if (d) d.style.opacity = isPast ? "0.35" : "0.2";
      });
      return;
    }

    const drawWords = (t: number) => {
      for (let i = 0; i < timing.length; i++) {
        const { s, e } = timing[i];
        const p = t <= s ? 0 : t >= e ? 1 : (t - s) / Math.max(0.001, e - s);
        setWordFill(i, p);
      }
    };

    if (isCurrent && smoothTimeValue?.on) {
      drawWords(smoothTimeValue.get());
      return smoothTimeValue.on("change", drawWords);
    }

    const staticP = isPast || isUnsynced ? 1 : 0;
    for (let i = 0; i < timing.length; i++) {
      setWordFill(i, staticP);
    }
  }, [isCurrent, isPast, interlude, timing, smoothTimeValue, isUnsynced, lineStartTime, lineEndTime]);

  return (
    <motion.div
      ref={rowRef as any}
      data-lyrics-line="true"
      style={{
        y,
        fontSize,
        padding: isMobile ? "0.32em 0.25em" : "0.35em 0.5em",
        willChange: inWindow ? "transform" : undefined,
      }}
      onClick={onClick}
      className={cn(
        "ly-row relative w-full rounded-2xl",
        interlude || isUnsynced ? "ly-nohover cursor-default" : "cursor-pointer"
      )}
    >
      <div
        className={cn(
          "ly-in flex min-w-0 max-w-full",
          left ? "justify-start text-left" : "justify-center text-center"
        )}
        style={{
          fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
          lineHeight: 1.25,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          opacity: dp.o,
          filter: dp.b > 0 ? `blur(${dp.b}px)` : "none",
          transform: `scale(${dp.s}) translateZ(0)`,
          transformOrigin: left ? "left center" : "center center",
          transitionDelay: `${delay}ms`,
        }}
      >
        {interlude ? (
          <div className="flex items-center justify-start gap-[0.65em] py-[0.35em] pl-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                ref={(el) => {
                  dotEls.current[i] = el;
                }}
                className={cn(
                  "ly-dot block h-[0.45em] w-[0.45em] rounded-full transition-shadow duration-300",
                  isCurrent && "shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                )}
              />
            ))}
          </div>
        ) : (
          <div
            className={cn(
              "flex min-w-0 max-w-full flex-wrap items-baseline",
              left ? "justify-start text-left" : "justify-center text-center"
            )}
            style={{
              columnGap: "0.28em",
              rowGap: "0.06em",
              overflowWrap: "anywhere",
              wordSpacing: "0.02em",
              textWrap: "balance" as any,
            }}
          >
            {tokens.map((w, i) => (
              <span key={i} className="ly-word">
                {/* Base dim text */}
                <span className="ly-base">{w}</span>

                {/* Left-to-right filling text */}
                <span
                  ref={(el) => {
                    fillEls.current[i] = el;
                  }}
                  className="ly-fill"
                  aria-hidden="true"
                >
                  {w}
                </span>

                {/* Soft glow highlight during active fill */}
                <span
                  ref={(el) => {
                    glowEls.current[i] = el;
                  }}
                  className="ly-glow"
                  aria-hidden="true"
                >
                  {w}
                </span>
              </span>
            ))}
            <span className="sr-only">{cleaned}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
});
