import React from 'react';
import { cn } from "@/lib/utils";

interface StaticGlassBackgroundProps {
  coverUrl: string;
  className?: string;
}

export function StaticGlassBackground({ coverUrl, className }: StaticGlassBackgroundProps) {
  if (!coverUrl) return null;
  
  return (
    <div className={cn("fixed inset-0 z-0 overflow-hidden bg-black pointer-events-none", className)}>
      {/* Intensely blurred, scaled, and saturated cover image acts as a static color gradient */}
      <img 
        src={coverUrl} 
        className="absolute inset-0 w-full h-full object-cover blur-[140px] opacity-60 saturate-[1.5] scale-125"
        alt=""
      />
      {/* Soft overlay so text remains readable everywhere but colors pop vibrantly */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/80 to-[#000000]" />
    </div>
  );
}
