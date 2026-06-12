"use client";

import React from "react";
import { motion, useTransform, useSpring } from "framer-motion";
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
  isInterlude?: boolean;
  isRightAligned?: boolean;
  words?: Array<{ word: string, time: number, endTime?: number }>;
}

export const LiquidLyricsLine = React.memo(function LiquidLyricsLine(props: LiquidLyricsLineProps) {
  const { isCurrent, isPast, distFromActive, isFullscreen, isMobile, isInterlude, isRightAligned, text, words } = props;

  let targetOpacity: number;
  const isHiddenMobile = isMobile && (distFromActive < -1 || distFromActive > 2);

  if (isCurrent) {
    targetOpacity = 1;
  } else {
    if (isHiddenMobile) { targetOpacity = 0; }
    else if (distFromActive === 1) { targetOpacity = 0.50; }
    else if (distFromActive === 2) { targetOpacity = 0.30; }
    else if (distFromActive === 3) { targetOpacity = 0.15; }
    else if (distFromActive === -1) { targetOpacity = 0.50; }
    else if (distFromActive === -2) { targetOpacity = 0.30; }
    else { targetOpacity = 0.15; }
  }

  const fontSize = isFullscreen ? "28px" : isMobile ? "24px" : "24px";
  const origin = isFullscreen ? (isRightAligned ? "right center" : "left center") : "center center";

  // Gentle blur — max 3px so nearby lines always stay readable on song change
  const blurPx = isCurrent ? 0 : (isHiddenMobile ? 6 : Math.min(Math.abs(distFromActive) * 0.8, 3));

  if (isInterlude) {
    return (
      <motion.div
        initial={false}
        animate={{ opacity: targetOpacity }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex gap-3 items-center w-full justify-center py-2"
      >
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            animate={isCurrent ? { scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] } : { scale: 1, opacity: 0.5 }}
            transition={{ duration: 1, repeat: isCurrent ? Infinity : 0, delay: i * 0.2 }}
            className={cn("w-2 h-2 rounded-full", isCurrent ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]" : "bg-white/40")}
          />
        ))}
      </motion.div>
    );
  }

  return (
    <motion.div
      // Use explicit initial so a song-change never starts from a blurry/scaled-down state
      initial={{ opacity: targetOpacity, scale: 1, filter: 'blur(0px)' }}
      animate={{
        opacity: targetOpacity,
        scale: isCurrent ? 1.05 : (isPast ? 0.97 : 0.95),
        filter: `blur(${blurPx}px)`
      }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "w-full leading-[1.4] py-1 px-4 flex",
        isFullscreen ? (isRightAligned ? "justify-end text-right" : "justify-start text-left") : "justify-center text-center"
      )}
      style={{ fontSize, fontWeight: 800, transformOrigin: origin }}
    >
      {isCurrent ? <ActiveInner {...props} origin={origin as string} /> : (isHiddenMobile ? text : <StaticInner {...props} origin={origin as string} />)}
    </motion.div>
  );
});

function StaticInner(props: LiquidLyricsLineProps & { origin: string }) {
  const { text, isPast, origin } = props;
  const wordTokens = text.split(" ");
  
  return (
    <div className="relative inline cursor-pointer select-none flex-wrap justify-center" style={{ transformOrigin: origin }}>
      {wordTokens.map((word, i, arr) => (
        <React.Fragment key={i}>
          <StaticWordFill word={word} isPast={isPast} />
          {i < arr.length - 1 && " "}
        </React.Fragment>
      ))}
      <span className="sr-only">{text}</span>
    </div>
  );
}

function ActiveInner(props: LiquidLyricsLineProps & { origin: string }) {
  const { text, lineStartTime, lineEndTime, smoothTimeValue, words, origin } = props;
  
  const lineFill = useTransform(smoothTimeValue, (time: number) => {
    const start = Number.isFinite(lineStartTime) ? lineStartTime : 0;
    const end = Number.isFinite(lineEndTime) ? lineEndTime : (start + 4);
    const dur = end - start;
    if (dur <= 0 || !Number.isFinite(dur)) return 0;
    const t = Number.isFinite(time) ? time : 0;
    const val = Math.max(0, Math.min(100, ((t - start) / dur) * 100));
    return Number.isFinite(val) ? val : 0;
  });

  const wordTokens = text.split(" ");
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
              start={startPct}
              end={endPct}
              lineFill={lineFill}
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

function StaticWordFill({ word, isPast }: { word: string; isPast: boolean; }) {
  const clipPathStyle = isPast ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)";
  const baseColor = isPast ? "text-rose-500/35" : "text-white/[0.22]";

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

function ActiveWordFill({ word, start, end, lineFill, explicitTime, explicitEndTime, smoothTimeValue }: { word: string; start: number; end: number; lineFill: any; explicitTime?: number; explicitEndTime?: number; smoothTimeValue: any; }) {
  const sourceValue = explicitTime !== undefined ? smoothTimeValue : lineFill;

  const explicitPct = useTransform(sourceValue, (val: number) => {
    if (explicitTime !== undefined) {
      if (val >= explicitTime) {
        if (explicitEndTime && val >= explicitEndTime) return 100;
        const dur = (explicitEndTime || explicitTime + 0.5) - explicitTime;
        return Math.min(100, Math.max(0, ((val - explicitTime) / dur) * 100));
      }
      return 0;
    } else {
      if (val <= start) return 0;
      if (val >= end) return 100;
      const range = end - start;
      return range > 0 ? ((val - start) / range) * 100 : 100;
    }
  });

  const explicitClipPath = useTransform(explicitPct, (pct) => `inset(0 ${100 - pct}% 0 0)`);
  // Spring-smooth the pct for an organic wave bounce as each word is sung
  const smoothedPct = useSpring(explicitPct, { stiffness: 260, damping: 22, mass: 0.6 });
  const waveY = useTransform(smoothedPct, [0, 40, 100], [0, -7, 0]);
  
  return (
    <motion.span className="relative inline-block" style={{ y: waveY }}>
      <span className="text-white/[0.18] transition-colors duration-300">{word}</span>
      <motion.span
        className="absolute inset-0 text-transparent"
        style={{
          clipPath: explicitClipPath,
          WebkitClipPath: explicitClipPath,
          backgroundImage: "linear-gradient(to bottom right, #F43F5E, #fb7185)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          transform: "translateZ(0)",
          willChange: "clip-path, transform",
          filter: "drop-shadow(0 0 10px rgba(244,63,94,0.75))"
        } as any}
        aria-hidden="true"
      >
        {word}
      </motion.span>
    </motion.span>
  );
}
