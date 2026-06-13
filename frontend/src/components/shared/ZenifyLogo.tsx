"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface ZenifyLogoProps {
 className?: string;
 size?: number;
}

export const ZenifyLogo = ({ className, size = 32 }: ZenifyLogoProps) => {
    // If it's collapsed or tiny, render a stylized "Z"
    if (size < 30) {
        return (
            <span className={cn("font-zenify select-none font-bold text-xl leading-none text-brand drop-shadow-[0_0_12px_rgba(var(--accent-brand-rgb),0.6)] transition-colors duration-1000", className)}>
                Z
            </span>
        );
    }

    // Dynamic font-size scaling based on size prop
    let textClass = "text-2xl";
    if (size === 36) textClass = "text-3xl";
    if (size >= 48) textClass = "text-4xl";

    return (
        <span className={cn("font-zenify select-none font-bold tracking-wide leading-none text-brand drop-shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.5)] transition-colors duration-1000", textClass, className)}>
            zenify
        </span>
    );
};
