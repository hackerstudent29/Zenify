"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAlbumColor } from "@/hooks/useAlbumColor";

interface AuroraBackgroundProps {
    colors?: string[];
    className?: string;
    speed?: "fast" | "slow";
}

export function AuroraBackground({ colors = [], className, speed = "slow" }: AuroraBackgroundProps) {
    // Force extremely vibrant fallbacks if nothing is passed
    const c1 = colors[0] || "rgba(255, 50, 100, 0.8)";
    const c2 = colors[1] || "rgba(50, 200, 255, 0.8)";
    const c3 = colors[2] || "rgba(150, 50, 255, 0.8)";
    const c4 = colors[3] || c1;

    // Apple style is extremely blurry and blends together. 
    // Fast for heroes/track pages, slow for full-screen players to not be distracting.
    const durationMultiplier = speed === "fast" ? 0.35 : 1.2;

    return (
        <div className={cn("absolute top-0 left-0 right-0 overflow-hidden pointer-events-none z-0 bg-black", className || "bottom-0")}>
            {/* The base layer container which we blur */}
            <div className="absolute inset-0 opacity-100" style={{ filter: "blur(80px) saturate(200%)" }}>
                {/* Blob 1: Top Left swoosh */}
                <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 25 * durationMultiplier, repeat: Infinity, ease: "linear" }}
                    className="absolute rounded-[100%] opacity-100 mix-blend-screen"
                    style={{ 
                        top: "-30%", left: "-20%", width: "110%", height: "110%",
                        background: `radial-gradient(ellipse at center, ${c1} 0%, transparent 60%)`,
                        transformOrigin: "60% 40%"
                    }}
                />
                {/* Blob 2: Top Right swoosh */}
                <motion.div
                    animate={{ rotate: [360, 0] }}
                    transition={{ duration: 28 * durationMultiplier, repeat: Infinity, ease: "linear" }}
                    className="absolute rounded-[100%] opacity-100 mix-blend-screen"
                    style={{ 
                        top: "-20%", right: "-30%", width: "120%", height: "100%",
                        background: `radial-gradient(ellipse at center, ${c2} 0%, transparent 60%)`,
                        transformOrigin: "40% 60%"
                    }}
                />
                {/* Blob 3: Bottom Left swoosh */}
                <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 32 * durationMultiplier, repeat: Infinity, ease: "linear" }}
                    className="absolute rounded-[100%] opacity-100 mix-blend-screen"
                    style={{ 
                        bottom: "-40%", left: "-20%", width: "115%", height: "120%",
                        background: `radial-gradient(ellipse at center, ${c3} 0%, transparent 60%)`,
                        transformOrigin: "70% 30%"
                    }}
                />
                {/* Blob 4: Bottom Right swoosh */}
                <motion.div
                    animate={{ rotate: [360, 0] }}
                    transition={{ duration: 22 * durationMultiplier, repeat: Infinity, ease: "linear" }}
                    className="absolute rounded-[100%] opacity-100 mix-blend-screen"
                    style={{ 
                        bottom: "-20%", right: "-20%", width: "110%", height: "130%",
                        background: `radial-gradient(ellipse at center, ${c4} 0%, transparent 60%)`,
                        transformOrigin: "30% 70%"
                    }}
                />
            </div>
            
            {/* Fade to bottom — subtle so colors remain vivid */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black z-10" />
            
            {/* Noise overlay to prevent color banding */}
            <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay z-20"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />
        </div>
    );
}
