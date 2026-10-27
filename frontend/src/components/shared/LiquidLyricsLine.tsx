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
/* Sidebar: slightly livelier spring (a little overshoot), softer opacity/blur fades */
@supports (transition-timing-function: linear(0, 1)) {
  .ly-in.ly-in-sb {
    transition-duration: 820ms, 480ms, 560ms;
    transition-timing-function: ${springCurve(0.72, 820)}, cubic-bezier(.3,.6,.2,1), cubic-bezier(.3,.6,.2,1);
  }
}
.ly-word {
  position: relative;
  display: inline-block;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.ly-word-hyphen {
  margin-right: -0.24em;
}
.ly-base {
  color: rgba(255, 255, 255, 0.42);
  transition: color 200ms ease;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.ly-fill {
  position: absolute;
  inset: 0;
  color: #ffffff;
  font-weight: 700;
  pointer-events: none;
  user-select: none;
  will-change: clip-path, opacity;
  word-break: break-word;
  overflow-wrap: anywhere;
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
  word-break: break-word;
  overflow-wrap: anywhere;
}
.ly-dot {
  background: #ffffff;
  border-radius: 999px;
  will-change: transform, opacity, box-shadow;
  transition: transform 120ms cubic-bezier(.2,.8,.3,1), opacity 150ms ease, box-shadow 180ms ease;
}
.ly-sb .ly-dot {
  transition: transform 120ms cubic-bezier(.2,.8,.3,1), opacity 150ms ease, box-shadow 180ms ease;
}
@media (hover: hover) {
  .ly-row:not(.ly-nohover):hover {
    background: rgba(255, 255, 255, 0.07);
  }
  .ly-row.ly-sb:not(.ly-nohover):hover {
    background: rgba(255, 255, 255, 0.06);
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

/* Sidebar curve: compact column → stronger scale-down + earlier blur, so the active line pops */
const AFTER_SB: Depth[] = [
  { o: 0.55, b: 0.4, s: 0.95 },
  { o: 0.34, b: 1.5, s: 0.92 },
  { o: 0.20, b: 2.8, s: 0.90 },
  { o: 0.11, b: 4.2, s: 0.88 },
];
const BEFORE_SB: Depth[] = [
  { o: 0.30, b: 1.0, s: 0.93 },
  { o: 0.17, b: 2.5, s: 0.90 },
  { o: 0.09, b: 4.0, s: 0.88 },
];

function depthFor(
  dist: number,
  current: boolean,
  manual: boolean,
  unsynced: boolean,
  reduce: boolean,
  mobile: boolean,
  sidebar: boolean
): Depth {
  if (current || unsynced) return { o: 1, b: 0, s: 1 };
  if (manual) return sidebar ? { o: 0.82, b: 0, s: 0.96 } : { o: 0.86, b: 0, s: 0.97 };
  const after = sidebar ? AFTER_SB : AFTER;
  const before = sidebar ? BEFORE_SB : BEFORE;
  const d = dist > 0 ? after[Math.min(dist, after.length) - 1] : before[Math.min(-dist, before.length) - 1];
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
  isSidebar?: boolean;
  lineIndex?: number;
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
    isSidebar,
    isInterlude,
    isUnsynced,
    isUserScrolling,
    inWindow,
    rowRef,
    onClick,
  } = props;

  const sb = !!isSidebar;

  // Lyrics are always left aligned on the left side
  const left = !isInterlude;
  const reduce = prefersReduce();
  const dp = depthFor(dist, isCurrent, !!isUserScrolling, !!isUnsynced, reduce, !!isMobile, sb);
  // waterfall: lines below the active one trail slightly behind (sidebar uses a tighter, longer cascade)
  const delay = !isCurrent && dist > 0 && !isUserScrolling
    ? sb
      ? Math.min(dist, 6) * 32
      : Math.min(dist, 5) * 36
    : 0;

  const fontSize = isFullscreen
    ? isMobile
      ? "clamp(22px, 5.5vw, 28px)"
      : "clamp(28px, 2.8vw, 42px)"
    : isMobile
    ? "clamp(18px, 5vw, 22px)"
    : isSidebar
    ? "clamp(19px, 1.6vw, 23px)"
    : "clamp(19px, 1.8vw, 23px)";

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

  // Tokenize words, breaking hyphenated syllables while preserving hyphens so long lyrics wrap naturally
  const tokens = React.useMemo(() => {
    const rawTokens = cleaned.split(" ").filter(Boolean);
    const result: { text: string; endsWithHyphen: boolean }[] = [];
    for (const tok of rawTokens) {
      if (tok.includes("-") && tok.length > 5) {
        const parts = tok.split(/(?<=-)/);
        parts.forEach((p, idx) => {
          if (p) {
            result.push({
              text: p,
              endsWithHyphen: p.endsWith("-") && idx < parts.length - 1
            });
          }
        });
      } else {
        result.push({ text: tok, endsWithHyphen: false });
      }
    }
    return result;
  }, [cleaned]);

  /* Timing per word */
  const timing = React.useMemo(() => {
    const start = Number.isFinite(lineStartTime) ? lineStartTime : 0;
    const end = Number.isFinite(lineEndTime) && lineEndTime > start ? lineEndTime : start + 3.5;
    const dur = end - start;
    const total = tokens.reduce((a, w) => a + w.text.length, 0) || 1;
    let acc = 0;
    return tokens.map((w, i) => {
      const ex = words?.[i];
      const cs = acc / total;
      acc += w.text.length;
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
      glow.style.opacity = clipPct > 0 && clipPct < 100 ? (sb ? "0.55" : "0.65") : clipPct >= 100 ? "0.2" : "0";
    }
  };

  const interlude = !!isInterlude || cleaned === "• • •";

  /* Animation loop: only active line binds to time value */
  React.useLayoutEffect(() => {
    if (interlude) {
      const drawDots = (t: number) => {
        const s = lineStartTime;
        const e = lineEndTime > s ? lineEndTime : s + 3.5;
        const elapsed = t - s;
        // Tempo-synced wave frequency (~120bpm)
        const freq = 4.0;
        const baseT = elapsed * freq;

        dotEls.current.forEach((d, i) => {
          if (!d) return;
          if (isCurrent) {
            // Fluid undulating harmonic wave with acoustic pill morphing
            const phase = baseT - i * 0.95;
            const wave = Math.sin(phase);
            const intensity = Math.max(0, wave); // 0 to 1
            const yShift = -wave * (sb ? 3.5 : 5.0); // Smooth floating wave
            const scaleY = 1.0 + intensity * (sb ? 0.45 : 0.6); // Liquid pill elongation
            const scaleX = 1.0 - intensity * 0.15; // Elastic volume conservation
            const glow = (8 + intensity * 18).toFixed(1);
            const glowAlpha = (0.55 + intensity * 0.45).toFixed(2);

            d.style.transform = `translate3d(0, ${yShift.toFixed(2)}px, 0) scale(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})`;
            d.style.opacity = String(Math.max(0.45, 0.5 + 0.5 * intensity));
            d.style.boxShadow = `0 0 ${glow}px rgba(255, 255, 255, ${glowAlpha})`;
          } else if (isPast) {
            d.style.transform = "scale(0.82)";
            d.style.opacity = "0.28";
            d.style.boxShadow = "none";
          } else {
            // Upcoming interlude: calm ambient breathing
            const idleWave = Math.sin(t * 1.6 - i * 0.7);
            d.style.transform = `scale(${(0.82 + 0.12 * Math.max(0, idleWave)).toFixed(2)})`;
            d.style.opacity = String((0.2 + 0.15 * Math.max(0, idleWave)).toFixed(2));
            d.style.boxShadow = "none";
          }
        });
      };

      if (isCurrent && smoothTimeValue?.on) {
        drawDots(smoothTimeValue.get());
        return smoothTimeValue.on("change", drawDots);
      }
      dotEls.current.forEach((d, i) => {
        if (!d) return;
        if (isCurrent) {
          d.style.transform = "translate3d(0, -2px, 0) scale(1.15, 1.25)";
          d.style.opacity = "0.9";
          d.style.boxShadow = "0 0 14px rgba(255, 255, 255, 0.75)";
        } else if (isPast) {
          d.style.transform = "scale(0.82)";
          d.style.opacity = "0.28";
          d.style.boxShadow = "none";
        } else {
          d.style.transform = "scale(0.82)";
          d.style.opacity = "0.22";
          d.style.boxShadow = "none";
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrent, isPast, interlude, timing, smoothTimeValue, isUnsynced, lineStartTime, lineEndTime, sb]);

  // Clean Apple Music alignment: left-aligned across full width, backing vocals right-aligned
  let alignClass = "justify-start text-left";
  const dynamicStyleIndent: React.CSSProperties = {};

  if (sb && !interlude) {
    const isBackingVocal = cleaned.startsWith("(") && cleaned.endsWith(")");
    if (isBackingVocal) {
      alignClass = "justify-end text-right italic";
    }
  }

  return (
    <motion.div
      ref={rowRef as any}
      data-lyrics-line="true"
      style={{
        y,
        fontSize,
        padding: isFullscreen ? "0.44em 0.5em" : sb ? "0.26em 0.35em" : isMobile ? "0.32em 0.25em" : "0.35em 0.5em",
        willChange: inWindow ? "transform" : undefined,
      }}
      onClick={onClick}
      className={cn(
        "ly-row relative w-full",
        sb ? "ly-sb rounded-xl" : "rounded-2xl",
        interlude || isUnsynced ? "ly-nohover cursor-default" : "cursor-pointer"
      )}
    >
      <div
        className={cn(
          "ly-in flex min-w-0 max-w-full",
          sb && "ly-in-sb",
          alignClass
        )}
        style={{
          fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
          lineHeight: isFullscreen ? 1.24 : sb ? 1.28 : 1.26,
          fontWeight: 800,
          letterSpacing: isFullscreen ? "-0.02em" : sb ? "-0.015em" : "-0.01em",
          opacity: dp.o,
          filter: dp.b > 0 ? `blur(${dp.b}px)` : "none",
          transform: `scale(${dp.s}) translateZ(0)`,
          transformOrigin: alignClass.includes("justify-center") ? "center center" : alignClass.includes("justify-end") ? "right center" : "left center",
          transitionDelay: `${delay}ms`,
          ...dynamicStyleIndent,
        }}
      >
        {interlude ? (
          <div className={cn("flex items-center justify-start py-[0.42em] pl-1", sb ? "gap-[0.65em]" : "gap-[0.75em]")}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                ref={(el) => {
                  dotEls.current[i] = el;
                }}
                className={cn(
                  "ly-dot block rounded-full",
                  sb ? "h-[0.48em] w-[0.48em]" : "h-[0.52em] w-[0.52em]"
                )}
              />
            ))}
          </div>
        ) : (
          <div
            className={cn(
              "flex min-w-0 max-w-full flex-wrap items-baseline",
              alignClass
            )}
            style={{
              columnGap: sb ? "0.26em" : "0.28em",
              rowGap: sb ? "0.08em" : "0.08em",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              wordSpacing: "0.02em",
              maxWidth: "100%",
              textWrap: sb ? ("balance" as any) : undefined,
            }}
          >
            {tokens.map((tokObj, i) => (
              <span
                key={i}
                className={cn("ly-word", tokObj.endsWithHyphen && "ly-word-hyphen")}
              >
                {/* Base dim text */}
                <span className="ly-base">{tokObj.text}</span>

                {/* Left-to-right filling text */}
                <span
                  ref={(el) => {
                    fillEls.current[i] = el;
                  }}
                  className="ly-fill"
                  aria-hidden="true"
                >
                  {tokObj.text}
                </span>

                {/* Soft glow highlight during active fill */}
                <span
                  ref={(el) => {
                    glowEls.current[i] = el;
                  }}
                  className="ly-glow"
                  aria-hidden="true"
                >
                  {tokObj.text}
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