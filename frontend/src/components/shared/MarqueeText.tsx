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

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const scrollWidth = textRef.current.scrollWidth;
                setTextWidth(scrollWidth);
                setIsOverflowing(scrollWidth > containerWidth);
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

    const duration = Math.max((textWidth + 32) / 30, 8); // Same speed calculation

    return (
        <div ref={containerRef} className={cn("max-w-full overflow-hidden whitespace-nowrap relative flex", className)} onClick={(e) => e.stopPropagation()}>
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes smooth-marquee {
                    0% { transform: translate3d(0, 0, 0); }
                    100% { transform: translate3d(calc(-50% - 16px), 0, 0); }
                }
                .marquee-gpu {
                    animation: smooth-marquee ${duration}s linear infinite;
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
