"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ZenifyLogoProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export const ZenifyLogo = ({ className, size = 32, animated = false }: ZenifyLogoProps) => {
  const imageElement = (
    <img 
      src="/logo.png" 
      alt="Zenify" 
      height={size}
      style={{ height: `${size}px`, objectFit: 'contain' }}
      className="drop-shadow-[0_0_20px_rgba(225,29,72,0.6)] transition-all duration-1000"
    />
  );

  if (animated) {
    return (
      <motion.div
        animate={{
          scale: [1, 1.06, 1],
          y: [0, -3, 0],
          filter: [
            'drop-shadow(0 0 16px rgba(225, 29, 72, 0.45))',
            'drop-shadow(0 0 34px rgba(225, 29, 72, 0.85))',
            'drop-shadow(0 0 16px rgba(225, 29, 72, 0.45))'
          ]
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className={cn("flex items-center justify-center pointer-events-none select-none relative", className)}
      >
        {imageElement}
      </motion.div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center pointer-events-none select-none", className)}>
      {imageElement}
    </div>
  );
};
