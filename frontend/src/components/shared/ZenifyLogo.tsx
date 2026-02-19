"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ZenifyLogoProps {
    className?: string;
    size?: number;
}

export const ZenifyLogo = ({ className, size = 32 }: ZenifyLogoProps) => {
    return (
        <div
            className={cn("relative flex items-center justify-center overflow-hidden rounded-xl bg-zinc-950", className)}
            style={{ width: size, height: size }}
        >
            <svg
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full p-1.5"
            >
                <defs>
                    <linearGradient id="vortex-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#34d399" /> {/* Emerald 400 */}
                        <stop offset="50%" stopColor="#3b82f6" /> {/* Blue 500 */}
                        <stop offset="100%" stopColor="#8b5cf6" /> {/* Violet 500 */}
                    </linearGradient>
                </defs>

                {/* Spiral Layers */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((rotation) => (
                    <g key={rotation} transform={`rotate(${rotation} 50 50)`}>
                        <path
                            d="M50 20C65 20 80 35 80 50C80 55 75 60 70 60"
                            stroke="url(#vortex-gradient)"
                            strokeWidth="4"
                            strokeLinecap="round"
                            className="opacity-80"
                        />
                    </g>
                ))}

                <circle cx="50" cy="50" r="15" stroke="url(#vortex-gradient)" strokeWidth="2" opacity="0.3" />
            </svg>

            {/* Subtle backlight glow */}
            <div className="absolute inset-0 bg-blue-500/10 blur-md pointer-events-none" />
        </div>
    );
};
