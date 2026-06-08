"use client";

import React from "react";
import { motion, useTransform, useMotionTemplate } from "framer-motion";
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

    // The progress logic calculates how much of the line should be colored.
    // Instead of computing the clip-path for the entire block (which causes multi-line text to fill both lines at once),
    // we now pass this `lineFill` value to individual words so they fill sequentially.

    // ── Visual state ─────────────────────────────────────────────────────
    let opacity: number;
    if (isCurrent)                  opacity = 1;
    else if (distFromActive === 1)  opacity = 0.70;
    else if (distFromActive === 2)  opacity = 0.50;
    else if (distFromActive === 3)  opacity = 0.35;
    else if (distFromActive === -1) opacity = 0.50;
    else if (distFromActive === -2) opacity = 0.30;
    else                            opacity = 0.25;

    const fontSize = isFullscreen ? "32px" : isMobile ? "26px" : "30px";
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



    // ── Past lines: solid rose text (already sung) ───────────────────────
    if (isPast) {
        return (
            <div
                className={cn(
                    "relative select-none cursor-pointer w-full leading-[1.4] transition-opacity duration-300 ease-out py-1 px-4",
                    isFullscreen ? (isRightAligned ? "text-right" : "text-left") : "text-center"
                )}
                style={{
                    fontSize,
                    fontWeight: 800,
                    transformOrigin: origin,
                    opacity,
                }}
            >
                <span
                    style={{
                        color: "rgba(244, 63, 94, 0.5)",
                    }}
                >
                    {text}
                </span>
                <span className="sr-only">{text}</span>
            </div>
        );
    }

    // ── Current line: animated rose fill INSIDE text only ─────────────────
    if (isCurrent) {
        return (
            <motion.div
                className={cn(
                    "w-full leading-[1.4] py-1 px-4 flex",
                    isFullscreen ? (isRightAligned ? "justify-end text-right" : "justify-start text-left") : "justify-center text-center"
                )}
                style={{
                    fontSize,
                    fontWeight: 800,
                    opacity,
                    "--fill-pct": lineFill,
                } as any}
            >
                <div className="relative inline cursor-pointer select-none flex-wrap justify-center" style={{ transformOrigin: origin }}>
                    {(() => {
                        const words = text.split(" ");
                        const totalChars = words.reduce((acc, w) => acc + w.length, 0);
                        let charAccumulator = 0;

                        return words.map((word, i, arr) => {
                            const startPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 0;
                            charAccumulator += word.length;
                            const endPct = totalChars > 0 ? (charAccumulator / totalChars) * 100 : 100;

                            return (
                                <React.Fragment key={i}>
                                    <WordFill word={word} start={startPct} end={endPct} />
                                    {i < arr.length - 1 && " "}
                                </React.Fragment>
                            );
                        });
                    })()}
                </div>
                <span className="sr-only">{text}</span>
            </motion.div>
        );
    }

    // ── Upcoming lines: dim white text ────────────────────────────────────
    return (
        <div
            className={cn(
                "relative select-none cursor-pointer w-full leading-[1.4] transition-opacity duration-300 ease-out py-1 px-4",
                isFullscreen ? (isRightAligned ? "text-right" : "text-left") : "text-center"
            )}
            style={{
                fontSize,
                fontWeight: 800,
                transformOrigin: origin,
                opacity,
            }}
        >
            <span className="text-white/[0.22]">
                {text}
            </span>
            <span className="sr-only">{text}</span>
        </div>
    );
});

// ── Helper Component for Word-by-Word Sequential Filling ────────────────
// Optimized with CSS variables to run natively on GPU and avoid JS layout thrashing
export function WordFill({ word, start, end }: { word: string, start: number, end: number }) {
    const range = end - start;
    const multiplier = range > 0 ? 100 / range : 0;

    return (
        <span 
            className="relative inline-block"
            style={{
                "--start": start,
                "--multiplier": multiplier
            } as any}
        >
            <span className="text-white/[0.18]">{word}</span>
            <span
                className="absolute inset-0 text-transparent"
                style={{
                    clipPath: "inset(0 calc(100% - clamp(0, (var(--fill-pct) - var(--start)) * var(--multiplier), 100) * 1%) 0 0)",
                    WebkitClipPath: "inset(0 calc(100% - clamp(0, (var(--fill-pct) - var(--start)) * var(--multiplier), 100) * 1%) 0 0)",
                    backgroundImage: "linear-gradient(to bottom right, #F43F5E, #fb7185)",
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
