"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useMarquee } from "@/hooks/useMarquee";

interface MarqueeTextProps {
    text?: string;
    children?: React.ReactNode;
    speed?: number;
    pauseDuration?: number;
    className?: string;
}

export function MarqueeText({ text, children, speed = 45, pauseDuration = 5000, className }: MarqueeTextProps) {
    const textContent = text || (typeof children === "string" ? children : "");
    const { containerRef, textRef, isOverflowing, animationStyle, animationClass } = useMarquee({
        text: textContent,
        speed,
        pauseDuration,
    });

    return (
        <div
            ref={containerRef}
            className={cn("max-w-full overflow-hidden whitespace-nowrap block relative", className)}
            style={{
                maskImage: isOverflowing ? "linear-gradient(to right, black 85%, transparent 100%)" : "none",
                WebkitMaskImage: isOverflowing ? "linear-gradient(to right, black 85%, transparent 100%)" : "none",
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {animationStyle && <style dangerouslySetInnerHTML={{ __html: animationStyle }} />}
            <div
                ref={textRef}
                className={cn("inline-block whitespace-nowrap", animationClass)}
                style={{
                    display: "inline-block",
                    willChange: "transform",
                }}
            >
                {children || text}
            </div>
        </div>
    );
}
