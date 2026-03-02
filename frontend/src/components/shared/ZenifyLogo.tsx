"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ZenifyLogoProps {
    className?: string;
    size?: number;
    loading?: boolean;
}

export const ZenifyLogo = ({ className, size = 32, loading = false }: ZenifyLogoProps) => {
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
                        <stop offset="0%" stopColor="#ef4444" /> {/* Red 500 */}
                        <stop offset="50%" stopColor="#e11d48" /> {/* Rose 600 */}
                        <stop offset="100%" stopColor="#fb7185" /> {/* Rose 400 */}
                    </linearGradient>
                </defs>

                <motion.g
                    animate={{ rotate: 360 }}
                    transition={{ duration: loading ? 2 : 20, repeat: Infinity, ease: "linear" }}
                    style={{ originX: "50px", originY: "50px" }}
                >
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
                </motion.g>

                <motion.circle
                    cx="50" cy="50" r="15"
                    stroke="url(#vortex-gradient)"
                    strokeWidth="2"
                    opacity="0.5"
                    strokeDasharray="5 5"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    style={{ originX: "50px", originY: "50px" }}
                />
            </svg>

            {/* Subtle backlight glow */}
            <div className="absolute inset-0 bg-brand/10 blur-md pointer-events-none" />
        </div>
    );
};
