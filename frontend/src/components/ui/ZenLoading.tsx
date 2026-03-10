"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ZenLoadingProps {
    className?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    showText?: boolean;
    text?: string;
}

const containerSizes = {
    xs: "h-4",
    sm: "h-6",
    md: "h-10",
    lg: "h-16",
    xl: "h-24"
};

const barWidths = {
    xs: "w-0.5",
    sm: "w-1",
    md: "w-1.5",
    lg: "w-2",
    xl: "w-3"
};

const gapSizes = {
    xs: "gap-0.5",
    sm: "gap-1",
    md: "gap-1.5",
    lg: "gap-2",
    xl: "gap-3"
};

export function ZenLoading({ className, size = "md", showText = false, text = "Loading..." }: ZenLoadingProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
            <div className={cn("flex items-center justify-center", containerSizes[size])}>
                <div className={cn("flex items-center justify-center h-full", gapSizes[size])}>
                    {[0, 1, 2, 3].map((i) => (
                        <motion.div
                            key={i}
                            className={cn("bg-brand rounded-full", barWidths[size])}
                            animate={{
                                height: ["20%", "100%", "20%"]
                            }}
                            transition={{
                                duration: 0.8,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: i * 0.15
                            }}
                        />
                    ))}
                </div>
            </div>

            {showText && (
                <motion.div
                    initial={{ opacity: 0.5 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                    className="text-xs font-semibold tracking-widest text-white/50 uppercase"
                >
                    {text}
                </motion.div>
            )}
        </div>
    );
}

// Full page loader utility
export function ZenPageLoader() {
    return (
        <div className="fixed inset-0 z-[999] bg-[#09090b]/95 backdrop-blur-md flex items-center justify-center">
            <ZenLoading size="lg" showText />
        </div>
    );
}
