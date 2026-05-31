"use client";

import React, { useEffect, useMemo } from "react";
import { motion, useMotionValue, useSpring, useMotionTemplate, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface LiquidLyricsLineProps {
    text: string;
    isCurrent: boolean;
    isPast: boolean;
    isUpcoming: boolean;
    distFromActive: number;
    currentTime: number;
    lineStartTime: number;
    lineEndTime: number;
    smoothTimeValue?: any;
    onClick: () => void;
    isFullscreen?: boolean;
    isMobile?: boolean;
    isInterlude?: boolean;
    isRightAligned?: boolean;
}

export function LiquidLyricsLine({
    text,
    isCurrent,
    isPast,
    isUpcoming,
    distFromActive,
    currentTime,
    lineStartTime,
    lineEndTime,
    onClick,
    isFullscreen,
    isMobile,
    isInterlude,
    isRightAligned,
    smoothTimeValue,
}: LiquidLyricsLineProps) {
    // ── Fill percentage (0–100) ──────────────────────────────────────────────
    const fill = useTransform(smoothTimeValue || useMotionValue(currentTime), (time: number) => {
        if (isPast) return 100;
        if (!isCurrent) return 0;
        const dur = lineEndTime - lineStartTime;
        if (dur <= 0) return 0;
        return Math.max(0, Math.min(100, ((time - lineStartTime) / dur) * 100));
    });

    // Use raw fill directly to avoid spring lag, since requestAnimationFrame already provides 60fps smoothness
    const smoothFill = fill;
    
    // Invert the fill value for clipPath (inset from the right)
    const invertedFill = useTransform(smoothFill, (v) => 100 - v);
    const clipPath = useMotionTemplate`inset(0 ${invertedFill}% 0 0)`;

    // ── Visual state ─────────────────────────────────────────────────────────
    const abs = Math.abs(distFromActive);

    let opacity: number;
    if (isCurrent)       opacity = 1;
    else if (distFromActive === 1)  opacity = 0.50;
    else if (distFromActive === 2)  opacity = 0.28;
    else if (distFromActive === 3)  opacity = 0.13;
    else if (distFromActive === -1) opacity = 0.32;
    else if (distFromActive === -2) opacity = 0.14;
    else                            opacity = 0;

    const scale  = isCurrent ? 1.0 : (abs === 1 ? 0.91 : 0.84);

    const fontSize = isFullscreen ? "26px" : isMobile ? "20px" : "24px";
    const fontWeight = 800; // Keep static! Changing font weights dynamically causes massive layout reflows (lag)
    const origin = isFullscreen ? (isRightAligned ? "right center" : "left center") : "center center";

    // ── Interlude dots ────────────────────────────────────────────────────────
    if (isInterlude) {
        return (
            <div
                className="flex gap-2 items-center w-full opacity-30"
                style={{
                    justifyContent: "center",
                    paddingLeft: "0",
                    paddingRight: "0",
                }}
            >
                {[0, 1, 2].map(i => (
                    <span key={i} className="text-white font-black text-2xl leading-none">
                        •
                    </span>
                ))}
            </div>
        );
    }

    const words = text.split(/\s+/);

    // ── Lyric line ────────────────────────────────────────────────────────────
    return (
        <motion.div
            onClick={onClick}
            animate={{ scale, opacity }}
            transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
                "relative select-none cursor-pointer w-full leading-[1.35]",
                isFullscreen ? (isRightAligned ? "text-right" : "text-left") : "text-center px-2"
            )}
            style={{
                fontSize,
                fontWeight,
                transformOrigin: origin,
                willChange: "transform, opacity",
            }}
        >
            {words.map((word, i) => (
                <LiquidWord
                    key={i}
                    word={word}
                    index={i}
                    total={words.length}
                    smoothFill={smoothFill}
                    isCurrent={isCurrent}
                    isPast={isPast}
                />
            ))}
            
            {/* ── Accessible text (screen readers) ── */}
            <span className="sr-only">{text}</span>
        </motion.div>
    );
}

function LiquidWord({ word, index, total, smoothFill, isCurrent, isPast }: { word: string, index: number, total: number, smoothFill: any, isCurrent: boolean, isPast: boolean }) {
    const startPct = (index / total) * 100;
    const endPct = ((index + 1) / total) * 100;

    const wordFill = useTransform(smoothFill, (v: number) => {
        if (isPast) return 100;
        if (v <= startPct) return 0;
        if (v >= endPct) return 100;
        return ((v - startPct) / (endPct - startPct)) * 100;
    });

    const invertedFill = useTransform(wordFill, (f) => 100 - f);
    const clipPath = useMotionTemplate`inset(0 ${invertedFill}% 0 0)`;

    return (
        <span className="relative inline-block mr-[0.28em]">
            <span style={{ color: "rgba(255,255,255,0.22)" }}>{word}</span>
            <motion.span
                className={cn(
                    "absolute left-0 top-0 overflow-hidden",
                    isCurrent ? "text-brand drop-shadow-[0_0_12px_rgba(var(--accent-brand-rgb),0.6)]" : "text-brand/60"
                )}
                style={{ clipPath, willChange: "clip-path" }}
            >
                {word}
            </motion.span>
        </span>
    );
}
