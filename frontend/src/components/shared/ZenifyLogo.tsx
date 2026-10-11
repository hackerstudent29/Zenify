"use client";
import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ZenifyLogoProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export const ZenifyLogo = ({ className, size = 32, animated = false }: ZenifyLogoProps) => {
  const [src, setSrc] = useState(animated ? "/assets/zenify_logo_animation.gif" : "/logo.png");

  useEffect(() => {
    setSrc(animated ? "/assets/zenify_logo_animation.gif" : "/logo.png");
  }, [animated]);

  const handleImageError = () => {
    if (animated && src === "/assets/zenify_logo_animation.gif") {
      setSrc("/zenify_logo_animation.gif");
    } else {
      setSrc("/logo.png");
    }
  };

  return (
    <div className={cn("flex items-center justify-center pointer-events-none select-none relative", className)}>
      <img 
        src={src} 
        alt="Zenify" 
        height={size}
        onError={handleImageError}
        style={{ height: `${size}px`, width: 'auto', objectFit: 'contain' }}
        className={cn(
          "transition-all duration-700 pointer-events-none",
          animated
            ? "drop-shadow-[0_0_24px_rgba(225,29,72,0.7)] mix-blend-screen"
            : "drop-shadow-[0_0_20px_rgba(225,29,72,0.6)]"
        )}
      />
    </div>
  );
};
