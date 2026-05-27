"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion } from "framer-motion";
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
    onClick: () => void;
    isFullscreen?: boolean;
    isMobile?: boolean;
    isInterlude?: boolean;
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
}: LiquidLyricsLineProps) {
    // ── Fill percentage (0–100) ──────────────────────────────────────────────
    const targetFill = useMemo(() => {
        if (isPast) return 100;
        if (!isCurrent) return 0;
        const dur = lineEndTime - lineStartTime;
        if (dur <= 0) return 0;
        return Math.max(0, Math.min(100, ((currentTime - lineStartTime) / dur) * 100));
    }, [isCurrent, isPast, currentTime, lineStartTime, lineEndTime]);

    // Smooth fill with RAF
    const [fill, setFill] = useState(targetFill);
    const fillRef = useRef(targetFill);
    const rafRef  = useRef<number>(0);

    useEffect(() => {
        fillRef.current = targetFill;
    }, [targetFill]);

    useEffect(() => {
        const loop = () => {
            setFill(prev => {
                const diff = fillRef.current - prev;
                if (Math.abs(diff) < 0.08) return fillRef.current;
                return prev + diff * 0.14;
            });
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

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
    const blur   = isCurrent ? 0   : (abs === 1 ? 0.4  : abs === 2 ? 1.0 : 1.8);

    const fontSize = isFullscreen ? "28px" : isMobile ? "20px" : "24px";
    const fontWeight = isCurrent ? 900 : 700;
    const origin = isFullscreen ? "left center" : "center center";

    // ── Interlude dots ────────────────────────────────────────────────────────
    if (isInterlude) {
        return (
            <motion.div
                animate={isCurrent
                    ? { opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }
                    : { opacity, scale }}
                transition={isCurrent
                    ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                className="flex gap-2 items-center w-full"
                style={{
                    justifyContent: isFullscreen ? "flex-start" : "center",
                    paddingLeft: isFullscreen ? "4px" : "0",
                    filter: `blur(${blur}px)`,
                    willChange: "transform, opacity, filter",
                }}
            >
                {[0, 1, 2].map(i => (
                    <motion.span
                        key={i}
                        animate={isCurrent ? { scale: [1, 1.4, 1] } : {}}
                        transition={isCurrent ? { duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" } : {}}
                        className="text-brand font-black text-2xl leading-none"
                    >
                        •
                    </motion.span>
                ))}
            </motion.div>
        );
    }

    // ── Lyric line ────────────────────────────────────────────────────────────
    return (
        <motion.div
            onClick={onClick}
            animate={{ scale, opacity, filter: `blur(${blur}px)` }}
            transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
                "relative select-none cursor-pointer w-full leading-[1.35] break-words",
                isFullscreen ? "text-left" : "text-center px-2"
            )}
            style={{
                fontSize,
                fontWeight,
                transformOrigin: origin,
                willChange: "transform, opacity, filter",
            }}
        >
            {/* ── Layer 1: dim base text (always visible) ── */}
            <span
                aria-hidden
                className="block"
                style={{ color: "rgba(255,255,255,0.22)" }}
            >
                {text}
            </span>

            {/* ── Layer 2: white fill that sweeps left→right ── */}
            {(isCurrent || isPast) && (
                <span
                    aria-hidden
                    className="absolute inset-0 block overflow-hidden"
                    style={{
                        // clip the fill to only the filled portion
                        clipPath: `inset(0 ${100 - fill}% 0 0)`,
                        transition: "clip-path 0.04s linear",
                        willChange: "clip-path",
                    }}
                >
                    <span
                        className="block"
                        style={{
                            color: isCurrent ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.55)",
                            fontWeight,
                            fontSize,
                            lineHeight: "1.35",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                        }}
                    >
                        {text}
                    </span>
                </span>
            )}

            {/* ── Accessible text (screen readers) ── */}
            <span className="sr-only">{text}</span>
        </motion.div>
    );
}
