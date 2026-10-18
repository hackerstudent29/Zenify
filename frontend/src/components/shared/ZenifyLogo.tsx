"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface ZenifyLogoProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export const ZenifyLogo = ({ className, size = 32, animated = false }: ZenifyLogoProps) => {
  // Natural dimensions of public/logo.png are 844 x 256 (~3.296875 aspect ratio)
  const proportionalWidth = Math.round(size * (844 / 256));

  return (
    <div className={cn("flex items-center justify-center pointer-events-none select-none relative", className)}>
      <img 
        src="/logo.png" 
        alt="Zenify Music Player Logo" 
        width={proportionalWidth}
        height={size}
        decoding="async"
        fetchPriority="high"
        style={{ height: `${size}px`, width: `${proportionalWidth}px`, aspectRatio: '844 / 256', objectFit: 'contain' }}
        className={cn(
          "transition-all duration-700 pointer-events-none object-contain",
          "drop-shadow-[0_0_24px_rgba(225,29,72,0.7)]",
          animated && "animate-pulse"
        )}
      />
    </div>
  );
};
