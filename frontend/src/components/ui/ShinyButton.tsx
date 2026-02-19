"use client";
import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface ShinyButtonProps extends HTMLMotionProps<"button"> {
    children: React.ReactNode;
    className?: string;
}

export const ShinyButton = ({ children, className, ...props }: ShinyButtonProps) => {
    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "relative flex items-center justify-center gap-2 px-8 py-3 rounded-2xl overflow-hidden group transition-all duration-300",
                "bg-white text-black font-bold text-sm tracking-tight",
                "hover:bg-purple-400 hover:text-white",
                "shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] cursor-pointer",
                className
            )}
            {...props}
        >
            {/* Gloss Effect */}
            <div className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                    background: 'linear-gradient(45deg, transparent 25%, rgba(255,255,255,0.3) 50%, transparent 75%)',
                    backgroundSize: '200% 200%',
                    animation: 'shiny 2s infinite linear'
                }}
            />

            <span className="relative z-10">{children}</span>
        </motion.button>
    );
};
