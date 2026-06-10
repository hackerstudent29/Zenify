"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MarqueeTextProps {
    children: React.ReactNode;
    className?: string;
}

export function MarqueeText({ children, className }: MarqueeTextProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);

    const [textWidth, setTextWidth] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const cWidth = containerRef.current.offsetWidth;
                const scrollWidth = textRef.current.scrollWidth;
                setTextWidth(scrollWidth);
                setContainerWidth(cWidth);
                setIsOverflowing(scrollWidth > cWidth);
            }
        };

        checkOverflow();
        window.addEventListener("resize", checkOverflow);
        return () => window.removeEventListener("resize", checkOverflow);
    }, [children]);

    if (!isOverflowing) {
        return (
            <div ref={containerRef} className={cn("max-w-full overflow-hidden whitespace-nowrap flex-shrink", className)} onClick={(e) => e.stopPropagation()}>
                <div ref={textRef} className="inline-block truncate max-w-full">
                    {children}
                </div>
            </div>
        );
    }

    // Real app marquee logic: Wait 3s, scroll to the end, then snap back seamlessly
    const scrollTime = Math.max((textWidth + 32) / 30, 4); // 30px per second, min 4s
    const pauseTime = 3; // 3 seconds pause at the start
    const totalTime = scrollTime + pauseTime;
    const pausePercent = (pauseTime / totalTime) * 100;

    return (
        <div ref={containerRef} className={cn("max-w-full overflow-hidden whitespace-nowrap relative flex", className)} onClick={(e) => e.stopPropagation()}>
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes real-app-marquee {
                    0%, ${pausePercent.toFixed(2)}% { transform: translate3d(0, 0, 0); }
                    100% { transform: translate3d(calc(-50% - 16px), 0, 0); }
                }
                .marquee-gpu {
                    animation: real-app-marquee ${totalTime}s linear infinite;
                    will-change: transform;
                }
            `}} />
            <div className="flex whitespace-nowrap shrink-0 marquee-gpu">
                <div className="inline-block pr-8 shrink-0">{children}</div>
                <div className="inline-block pr-8 shrink-0">{children}</div>
            </div>
        </div>
    );
}
