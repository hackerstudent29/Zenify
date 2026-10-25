"use client";

import React from "react";
import { motion, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";
import { springCurve } from "@/components/player/PlayerKit";

/* ------------------------------------------------------------------ */
/*  CSS: soft-edge karaoke fill + compositor spring for depth states   */
/* ------------------------------------------------------------------ */
const LY_CSS = `
.ly-in{transition-property:transform,opacity,filter;transition-duration:560ms,420ms,520ms;transition-timing-function:cubic-bezier(.32,.72,0,1)}
@supports (transition-timing-function: linear(0, 1)){.ly-in{transition-duration:760ms,420ms,520ms;transition-timing-function:${springCurve(0.82, 760)},ease,ease}}
.ly-word{--p:0;--l:0;position:relative;display:inline-block;white-space:nowrap;transform:translate3d(0,calc(var(--l) * -0.075em),0)}
.ly-base{color:rgba(255,255,255,.58)}
.ly-fill{position:absolute;inset:0;color:#fff;
  -webkit-mask-image:linear-gradient(90deg,#000 calc(var(--p) * (100% + .7em) - .7em),transparent calc(var(--p) * (100% + .7em)));
  mask-image:linear-gradient(90deg,#000 calc(var(--p) * (100% + .7em) - .7em),transparent calc(var(--p) * (100% + .7em)));
  text-shadow:0 0 calc(var(--l) * .6em) rgba(255,255,255,calc(var(--l) * .55))}
.ly-dot{background:#fff;opacity:.28;will-change:opacity}
@media (hover:hover){.ly-row:not(.ly-nohover):hover{background:rgba(255,255,255,.07)}}
@media (prefers-reduced-motion: reduce){.ly-in{transition-duration:1ms!important}.ly-word{transform:none}}
`;
export function LyricsStyles() {
  return <style>{LY_CSS}</style>;
}

/* ------------------------------------------------------------------ */
/*  Depth curve (Apple: active = full size/white, others recede)       */
/* ------------------------------------------------------------------ */
type Depth = { o: number; b: number; s: number };
const AFTER: Depth[] = [
  { o: 0.6, b: 0, s: 0.965 },
  { o: 0.38, b: 1.4, s: 0.94 },
  { o: 0.24, b: 2.8, s: 0.915 },
  { o: 0.14, b: 4.2, s: 0.9 },
];
const BEFORE: Depth[] = [
  { o: 0.32, b: 0.8, s: 0.95 },
  { o: 0.2, b: 2.4, s: 0.925 },
  { o: 0.1, b: 4, s: 0.9 },
];

function depthFor(dist: number, current: boolean, manual: boolean, unsynced: boolean, reduce: boolean, mobile: boolean): Depth {
  if (current || unsynced) return { o: 1, b: 0, s: 1 };
  if (manual) return { o: 0.86, b: 0, s: 0.97 };
  const d = dist > 0 ? AFTER[Math.min(dist, AFTER.length) - 1] : BEFORE[Math.min(-dist, BEFORE.length) - 1];
  return { o: d.o, b: reduce ? 0 : d.b * (mobile ? 0.8 : 1), s: reduce ? 1 : d.s };
}

/* ------------------------------------------------------------------ */
/*  Line                                                               */
/* ------------------------------------------------------------------ */
export interface LiquidLyricsLineProps {
  text: string;
  isCurrent: boolean;
  isPast: boolean;
  /** distance from active line, already clamped by the parent so far-away lines stay memoised */
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
    text, isCurrent, isPast, dist, y, smoothTimeValue, lineStartTime, lineEndTime, words,
    isFullscreen, isMobile, isInterlude, isUnsynced, isUserScrolling, inWindow, rowRef, onClick,
  } = props;

  const left = !!isFullscreen && !isInterlude;
  const reduce = prefersReduce();
  const dp = depthFor(dist, isCurrent, !!isUserScrolling, !!isUnsynced, reduce, !!isMobile);
  // lines below the active one trail slightly (matches the staggered spring scroll)
  const delay = !isCurrent && dist > 0 && !isUserScrolling ? Math.min(dist, 5) * 38 : 0;

  // phones get a much bigger face (Apple Music lyrics are ~30px bold on iPhone)
  const fontSize = isFullscreen
    ? isMobile ? "clamp(27px, 7.6vw, 35px)" : "clamp(28px, 3.3vw, 44px)"
    : isMobile ? "clamp(22px, 5.8vw, 28px)" : "clamp(21px, 2vw, 25px)";

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

  /* per-word timing windows (explicit when provided, else proportional by characters) */
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
      if (ex && Number.isFinite(ex.time) && ex.time > 0 && ex.endTime !== undefined && Number.isFinite(ex.endTime) && ex.endTime > ex.time) {
        return { s: ex.time, e: ex.endTime };
      }
      return { s: start + cs * dur, e: start + ce * dur };
    });
  }, [tokens, words, lineStartTime, lineEndTime]);

  const wordEls = React.useRef<(HTMLSpanElement | null)[]>([]);
  const dotsWrap = React.useRef<HTMLDivElement>(null);
  const dotEls = React.useRef<(HTMLSpanElement | null)[]>([]);
  const last = React.useRef<{ p: number; l: number }[]>([]);

  const setWord = (i: number, p: number, l: number) => {
    const el = wordEls.current[i];
    if (!el) return;
    const prev = last.current[i];
    if (prev && Math.abs(prev.p - p) < 0.002 && Math.abs(prev.l - l) < 0.01) return;
    last.current[i] = { p, l };
    el.style.setProperty("--p", p.toFixed(3));
    el.style.setProperty("--l", l.toFixed(3));
  };

  const interlude = !!isInterlude || cleaned === "• • •";

  /* Only the CURRENT line listens to the clock. Everything else is a static state. */
  React.useLayoutEffect(() => {
    if (interlude) {
      const draw = (t: number) => {
        const s = lineStartTime, e = lineEndTime > s ? lineEndTime : s + 4;
        const p = Math.max(0, Math.min(1, (t - s) / (e - s)));
        dotEls.current.forEach((d, i) => {
          if (d) d.style.opacity = String(0.28 + 0.72 * Math.max(0, Math.min(1, p * 3 - i)));
        });
        const w = dotsWrap.current;
        if (w) {
          const breathe = 1 + 0.09 * Math.sin(t * 2.4);
          const out = p > 0.9 ? 1 - ((p - 0.9) / 0.1) * 0.45 : 1;
          w.style.transform = `scale(${(reduce ? 1 : breathe * out).toFixed(3)})`;
        }
      };
      if (isCurrent) {
        draw(smoothTimeValue.get());
        return smoothTimeValue.on("change", draw);
      }
      dotEls.current.forEach((d) => d && (d.style.opacity = isPast ? "0.28" : "0.28"));
      if (dotsWrap.current) dotsWrap.current.style.transform = "scale(1)";
      return;
    }

    const draw = (t: number) => {
      for (let i = 0; i < timing.length; i++) {
        const { s, e } = timing[i];
        const p = t <= s ? 0 : t >= e ? 1 : (t - s) / Math.max(0.001, e - s);
        setWord(i, p, p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0);
      }
    };
    if (isCurrent) {
      draw(smoothTimeValue.get());
      return smoothTimeValue.on("change", draw);
    }
    const v = isPast || isUnsynced ? 1 : 0;
    last.current = [];
    for (let i = 0; i < timing.length; i++) setWord(i, v, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrent, isPast, interlude, timing, smoothTimeValue, isUnsynced]);

  return (
    <motion.div
      ref={rowRef as any}
      data-lyrics-line="true"
      style={{
        y,
        fontSize,
        // padding in em → the gap between sentences scales with the type size (clearly visible on phone + PC)
        padding: isMobile ? "0.3em 0.34em" : "0.34em 0.5em",
        willChange: inWindow ? "transform" : undefined,
      }}
      onClick={onClick}
      className={cn(
        "ly-row relative w-full rounded-2xl",
        interlude || isUnsynced ? "ly-nohover cursor-default" : "cursor-pointer"
      )}
    >
      <div
        className={cn("ly-in flex min-w-0 max-w-full", left ? "justify-start text-left" : "justify-center text-center")}
        style={{
          fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
          lineHeight: 1.27, // Tamil / Devanagari glyphs are tall — 1.18 made lines collide
          fontWeight: 700,
          letterSpacing: "-0.005em",
          opacity: dp.o,
          filter: dp.b > 0 ? `blur(${dp.b}px)` : "none",
          transform: `scale(${dp.s}) translateZ(0)`,
          transformOrigin: left ? "left center" : "center center",
          transitionDelay: `${delay}ms`,
        }}
      >
        {interlude ? (
          <div ref={dotsWrap} className="flex items-center gap-[0.55em] py-[0.3em] pl-[0.2em]" style={{ transformOrigin: left ? "left center" : "center" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} ref={(el) => { dotEls.current[i] = el; }} className="ly-dot block h-[0.42em] w-[0.42em] rounded-full" />
            ))}
          </div>
        ) : (
          <div
            className="flex min-w-0 max-w-full flex-wrap items-baseline"
            style={{ columnGap: "0.3em", rowGap: "0.06em", overflowWrap: "anywhere", wordSpacing: "0.04em", textWrap: "pretty" as any }}
          >
            {tokens.map((w, i) => (
              <span key={i} ref={(el) => { wordEls.current[i] = el; }} className="ly-word">
                <span className="ly-base">{w}</span>
                <span className="ly-fill" aria-hidden="true">{w}</span>
              </span>
            ))}
            <span className="sr-only">{cleaned}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
});
