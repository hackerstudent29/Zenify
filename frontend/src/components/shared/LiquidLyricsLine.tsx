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

    const clipPathValue = useMotionTemplate`polygon(0 0, ${lineFill}% 0, ${lineFill}% 100%, 0 100%)`;

    // ── Visual state ─────────────────────────────────────────────────────
    let opacity: number;
    if (isCurrent)                opacity = 1;
    else if (distFromActive === 1)  opacity = 0.50;
    else if (distFromActive === 2)  opacity = 0.28;
    else if (distFromActive === 3)  opacity = 0.14;
    else if (distFromActive === -1) opacity = 0.30;
    else if (distFromActive === -2) opacity = 0.15;
    else                            opacity = 0.05;

    // NO scale change — all lines are the same size
    const fontSize = isFullscreen ? "32px" : isMobile ? "20px" : "30px";
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

    // ── Lyric line — Apple Music style with glow ──────────────────────────
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
            <span className="relative inline-block">
                {/* Base Layer (Unfilled / dim) */}
                <span className="text-white/[0.22] transition-colors duration-300">
                    {text}
                </span>

                {/* Animated rose fill — ONLY on the current active line, never on past lines */}
                {isCurrent && (
                    <motion.span
                        className="absolute inset-0 pointer-events-none select-none text-inherit font-inherit"
                        style={{
                            clipPath: clipPathValue,
                            color: "#ff3b7f",
                            textShadow: "0 0 12px rgba(255,30,90,0.95), 0 0 28px rgba(255,30,90,0.55), 0 0 48px rgba(255,30,90,0.3)",
                            willChange: "clip-path",
                        }}
                    >
                        {text}
                    </motion.span>
                )}
            </span>

            {/* Screen reader accessible text */}
            <span className="sr-only">{text}</span>
        </div>
    );
});
