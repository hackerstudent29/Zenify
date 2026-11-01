"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EqualizerProps {
  playing?: boolean;
  className?: string;
  barClassName?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

/**
 * Universal Apple Music Animated Playing Equalizer.
 * Reusable across MediaCards, song lists, queue panels, sidebars, and player rows.
 */
export function Equalizer({
  playing = true,
  className = "",
  barClassName = "",
  size = "sm",
}: EqualizerProps) {
  const reduce = useReducedMotion();
  const frames = [
    [0.35, 1, 0.45, 0.85, 0.35],
    [0.9, 0.4, 1, 0.5, 0.9],
    [0.5, 0.85, 0.35, 1, 0.5],
  ];

  const heights = {
    xs: "h-3",
    sm: "h-3.5",
    md: "h-4",
    lg: "h-5",
  };

  const widths = {
    xs: "w-[2px]",
    sm: "w-[2.5px]",
    md: "w-[3px]",
    lg: "w-[3.5px]",
  };

  return (
    <span
      className={cn("inline-flex items-end gap-[2px]", heights[size], className)}
      aria-hidden="true"
    >
      {frames.map((f, i) => (
        <motion.span
          key={i}
          className={cn(
            "origin-bottom rounded-full bg-brand",
            widths[size],
            barClassName
          )}
          style={{ height: "100%" }}
          animate={playing && !reduce ? { scaleY: f } : { scaleY: 0.3 }}
          transition={
            playing && !reduce
              ? { duration: 0.8 + i * 0.12, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />
      ))}
    </span>
  );
}

export default Equalizer;
