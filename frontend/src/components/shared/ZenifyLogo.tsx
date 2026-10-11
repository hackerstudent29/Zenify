"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface ZenifyLogoProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export const ZenifyLogo = ({ className, size = 32, animated = false }: ZenifyLogoProps) => {
  return (
    <div className={cn("flex items-center justify-center pointer-events-none select-none relative", className)}>
      <img 
        src="/logo.png" 
        alt="Zenify" 
        height={size}
        style={{ height: `${size}px`, width: 'auto', objectFit: 'contain' }}
        className={cn(
          "transition-all duration-700 pointer-events-none object-contain",
          "drop-shadow-[0_0_24px_rgba(225,29,72,0.7)]",
          animated && "animate-pulse"
        )}
      />
    </div>
  );
};
