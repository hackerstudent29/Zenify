"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

interface SoftPageBackgroundProps {
 colors?: string[];
 className?: string;
}

export function SoftPageBackground({ colors = [], className }: SoftPageBackgroundProps) {
 const c1 = colors[0] || "rgba(120, 50, 180, 0.4)";
 const c2 = colors[1] || "rgba(40, 130, 220, 0.4)";
 const c3 = colors[2] || "rgba(200, 80, 120, 0.4)";

 const colorKey = useMemo(() => colors.join(","), [colors]);

 return (
 <div
 key={colorKey}
 className={cn(
 "absolute top-0 left-0 right-0 overflow-hidden pointer-events-none z-0",
 "h-[40vh] md:h-[50vh]", // Shorter height so it doesn't reach track names
 className
 )}
 style={{
 // Smooth blend into the black background at the bottom
 maskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
 WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 50%, transparent 100%)",
 }}
 >
 {/* Simple slow moving gradient blobs that are easy on the GPU */}
 <div 
 className="absolute inset-0 opacity-80 mix-blend-screen"
 style={{ filter: "blur(90px)" }}
 >
 <div 
 className="absolute -top-[10%] left-[-10%] w-[100%] h-[120%] rounded-full"
 style={{
 background: `radial-gradient(circle at center, ${c1} 0%, transparent 80%)`,
 animation: "ambientDrift 20s ease-in-out infinite",
 }}
 />
 <div 
 className="absolute -top-[5%] -right-[15%] w-[110%] h-[130%] rounded-full"
 style={{
 background: `radial-gradient(circle at center, ${c2} 0%, transparent 80%)`,
 animation: "ambientDrift2 25s ease-in-out infinite",
 }}
 />
 <div 
 className="absolute top-[5%] left-[10%] w-[90%] h-[110%] rounded-full"
 style={{
 background: `radial-gradient(circle at center, ${c3} 0%, transparent 80%)`,
 animation: "ambientDrift 30s ease-in-out infinite reverse",
 }}
 />
 </div>
 
 <style dangerouslySetInnerHTML={{ __html: `
 @keyframes ambientDrift {
 0% { transform: translate(0, 0) scale(1); }
 33% { transform: translate(5%, 8%) scale(1.05); }
 66% { transform: translate(-3%, 4%) scale(0.95); }
 100% { transform: translate(0, 0) scale(1); }
 }
 @keyframes ambientDrift2 {
 0% { transform: translate(0, 0) scale(1); }
 33% { transform: translate(-6%, -4%) scale(0.95); }
 66% { transform: translate(4%, -5%) scale(1.05); }
 100% { transform: translate(0, 0) scale(1); }
 }
 `}} />
 </div>
 );
}
