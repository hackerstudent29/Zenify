"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface ZenifyLogoProps {
 className?: string;
 size?: number;
}

export const ZenifyLogo = ({ className, size = 32 }: ZenifyLogoProps) => {
    return (
        <div className={cn("flex items-center justify-center pointer-events-none select-none", className)}>
            <img 
                src="/logo.png" 
                alt="Zenify" 
                height={size}
                style={{ height: `${size}px`, objectFit: 'contain' }}
                className="drop-shadow-[0_0_15px_rgba(var(--accent-brand-rgb),0.5)] transition-all duration-1000"
            />
        </div>
    );
};
