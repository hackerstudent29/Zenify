"use client";

import React from "react";
import { motion, useTransform } from "framer-motion";
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

export const LiquidLyricsLine = React.memo(function LiquidLyricsLine({
    text,
    isCurrent,
    isPast,
    isUpcoming,
    distFromActive,
    lineStartTime,
    lineEndTime,
    isFullscreen,
    isMobile,
    isInterlude,
    isRightAligned,
    smoothTimeValue,
    words,
}: LiquidLyricsLineProps) {
    // ── Fill percentage for the whole line (0–100) ────────────────────────
    const lineFill = useTransform(smoothTimeValue, (time: number) => {
        if (isPast) return 100;
        if (!isCurrent) return 0;
        const start = Number.isFinite(lineStartTime) ? lineStartTime : 0;
        const end = Number.isFinite(lineEndTime) ? lineEndTime : (start + 4);
        const dur = end - start;
        if (dur <= 0 || !Number.isFinite(dur)) return 0;
        const t = Number.isFinite(time) ? time : 0;
        const val = Math.max(0, Math.min(100, ((t - start) / dur) * 100));
        return Number.isFinite(val) ? val : 0;
    });

    // ── Visual state ─────────────────────────────────────────────────────
    let opacity: number;
    if (isCurrent)                  opacity = 1;
    else if (distFromActive === 1)  opacity = 0.70;
    else if (distFromActive === 2)  opacity = 0.50;
    else if (distFromActive === 3)  opacity = 0.35;
    else if (distFromActive === -1) opacity = 0.50;
    else if (distFromActive === -2) opacity = 0.30;
    else                            opacity = 0.25;

    // Adjusted sizes so they only take up 1 or 2 lines
    const fontSize = isFullscreen 
        ? "24px" 
        : isMobile 
            ? "16px" 
            : "15px"; // Sidebar view
    const origin = isFullscreen ? (isRightAligned ? "right center" : "left center") : "center center";

    // ── Interlude dots ────────────────────────────────────────────────────
    if (isInterlude) {
        return (
            <div className="flex gap-3 items-center w-full justify-center opacity-25 py-2">
                {[0, 1, 2].map(i => (
                    <span key={i} className="w-2 h-2 rounded-full bg-white/60" />
                ))}
            </div>
        );
    }

    const wordTokens = text.split(" ");
    const totalChars = wordTokens.reduce((acc, w) => acc + w.length, 0);
    let charAccumulator = 0;

    return (
        <motion.div
            className={cn(
                "w-full leading-[1.4] py-1 px-4 flex transition-opacity duration-300 ease-out",
                isFullscreen ? (isRightAligned ? "justify-end text-right" : "justify-start text-left") : "justify-center text-center"
            )}
            style={{
                fontSize,
                fontWeight: 800,
                opacity,
                transformOrigin: origin,
                "--fill-pct": isCurrent ? lineFill : (isPast ? 100 : 0),
            } as any}
        >
            <div className="relative inline cursor-pointer select-none flex-wrap justify-center" style={{ transformOrigin: origin }}>
                {wordTokens.map((word, i, arr) => {
                    const startPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 0;
                    charAccumulator += word.length;
                    const endPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 100;

                    const explicitWord = words?.[i];

                    return (
                        <React.Fragment key={i}>
                            <WordFill 
                                word={word} 
                                start={startPct} 
                                end={endPct} 
                                explicitTime={explicitWord?.time}
                                explicitEndTime={explicitWord?.endTime}
                                smoothTimeValue={smoothTimeValue}
                                isCurrent={isCurrent}
                                isPast={isPast}
                                isUpcoming={isUpcoming}
                            />
                            {i < arr.length - 1 && " "}
                        </React.Fragment>
                    );
                })}
            </div>
            <span className="sr-only">{text}</span>
        </motion.div>
    );
});

// Helper component with a unified rendering tree to prevent GPU / DOM thrashing on transitions
export function WordFill({ 
    word, 
    start, 
    end, 
    explicitTime, 
    explicitEndTime, 
    smoothTimeValue,
    isCurrent,
    isPast,
    isUpcoming 
}: { 
    word: string;
    start: number;
    end: number;
    explicitTime?: number;
    explicitEndTime?: number;
    smoothTimeValue?: any;
    isCurrent: boolean;
    isPast: boolean;
    isUpcoming: boolean;
}) {
    const range = end - start;
    const multiplier = range > 0 ? 100 / range : 0;

    // Call hook unconditionally at the top level!
    const explicitPct = useTransform(smoothTimeValue, (time: number) => {
        if (explicitTime === undefined) return 0;
        if (time >= explicitTime) {
            if (explicitEndTime && time >= explicitEndTime) return 100;
            const dur = (explicitEndTime || explicitTime + 0.5) - explicitTime;
            return Math.min(100, Math.max(0, ((time - explicitTime) / dur) * 100));
        }
        return 0;
    });

    const explicitClipPath = useTransform(explicitPct, (pct) => `inset(0 ${100 - pct}% 0 0)`);

    let clipPathStyle: any;
    if (isPast) {
        clipPathStyle = "inset(0 0% 0 0)";
    } else if (isUpcoming) {
        clipPathStyle = "inset(0 100% 0 0)";
    } else if (explicitTime !== undefined) {
        clipPathStyle = explicitClipPath;
    } else {
        clipPathStyle = "inset(0 calc(100% - clamp(0, (var(--fill-pct) - var(--start)) * var(--multiplier), 100) * 1%) 0 0)";
    }

    // Smooth color change on the background word representation
    const baseColor = isPast ? "text-rose-500/35" : isCurrent ? "text-white/[0.18]" : "text-white/[0.22]";

    return (
        <span 
            className="relative inline-block transition-colors duration-300"
            style={{
                "--start": start,
                "--multiplier": multiplier
            } as any}
        >
            <span className={cn(baseColor, "transition-colors duration-300")}>{word}</span>
            <motion.span
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
            </motion.span>
        </span>
    );
}
