"use client";

import React from "react";
import { Music } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ZenLoadingProps {
    className?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    showText?: boolean;
    text?: string;
}

const sizes = {
    xs: "w-6 h-6",
    sm: "w-10 h-10",
    md: "w-20 h-20",
    lg: "w-32 h-32",
    xl: "w-48 h-48"
};

const iconSizes = {
    xs: 10,
    sm: 14,
    md: 28,
    lg: 40,
    xl: 56
};

const borderThickness = {
    xs: "border",
    sm: "border-2",
    md: "border-2",
    lg: "border-[3px]",
    xl: "border-[4px]"
};

export function ZenLoading({ className, size = "md", showText = false, text = "Synchronizing..." }: ZenLoadingProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center gap-8", className)}>
            <div className={cn("relative flex items-center justify-center", sizes[size])}>
                {/* Background Circle / Orb */}
                <div className="absolute inset-0 rounded-full bg-zinc-950 border border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.8)]" />

                {/* Rotating Perimeter Arc */}
                <motion.div
                    className={cn(
                        "absolute inset-0 rounded-full border-brand",
                        borderThickness[size],
                        "border-b-transparent border-l-transparent border-r-transparent"
                    )}
                    style={{
                        boxShadow: "0 0 20px rgba(var(--accent-brand-rgb), 0.4)",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                />

                {/* Center Music Icon */}
                <motion.div
                    animate={{
                        scale: [1, 1.1, 1],
                        filter: [
                            "drop-shadow(0 0 5px rgba(var(--accent-brand-rgb), 0.3))",
                            "drop-shadow(0 0 15px rgba(var(--accent-brand-rgb), 0.6))",
                            "drop-shadow(0 0 5px rgba(var(--accent-brand-rgb), 0.3))"
                        ]
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="relative z-10"
                >
                    <Music size={iconSizes[size]} className="text-brand" strokeWidth={2.5} />
                </motion.div>
            </div>

            {showText && (
                <div className="space-y-2 text-center">
                    <h3 className="text-xl font-black tracking-tight text-white italic uppercase">
                        {text}
                    </h3>
                    <div className="flex justify-center gap-1.5">
                        {[0, 1, 2].map((i) => (
                            <motion.div
                                key={i}
                                className="w-1 h-1 rounded-full bg-brand"
                                animate={{
                                    opacity: [0.2, 1, 0.2],
                                }}
                                transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    delay: i * 0.2
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Full page loader utility
export function ZenPageLoader() {
    return (
        <div className="fixed inset-0 z-[999] bg-[#050505] flex items-center justify-center">
            <ZenLoading size="lg" showText />
        </div>
    );
}
