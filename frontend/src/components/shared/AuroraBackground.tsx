"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui";

export interface AuroraBackgroundProps {
 colors?: string[];
 className?: string;
 speed?: "ultra-fast" | "fast" | "slow";
 dim?: boolean;
 paused?: boolean;
 variant?: "full" | "edges";
}

export function AuroraBackground({ colors = [], className, speed = "slow", dim = true, paused = false, variant = "full" }: AuroraBackgroundProps) {
 const isLyricsOpen = useUIStore(state => state.isLyricsOpen);
 const c1 = colors[0] || "rgba(120, 50, 180, 0.85)";
 const c2 = colors[1] || "rgba(40, 130, 220, 0.85)";
 const c3 = colors[2] || "rgba(200, 80, 120, 0.85)";
 const c4 = colors[3] || c1;
 const c5 = colors[4] || c2;

 const t = speed === "slow" ? 1 : speed === "fast" ? 0.6 : 0.3;
 const colorKey = useMemo(() => colors.join(",") + variant, [colors, variant]);

 const isEdges = variant === "edges";

 return (
 <div
 key={colorKey}
 className={cn(
 "absolute inset-0 overflow-hidden pointer-events-none z-0 bg-black flex place-content-center transition-opacity duration-1000",
 className
 )}
 >
 <style dangerouslySetInnerHTML={{ __html: `
 @keyframes liquidFlow1 {
 0% { transform: translate(0, 0) rotate(0deg) scale(1); }
 33% { transform: translate(15%, -15%) rotate(120deg) scale(1.1); }
 66% { transform: translate(-10%, 10%) rotate(240deg) scale(0.9); }
 100% { transform: translate(0, 0) rotate(360deg) scale(1); }
 }
 @keyframes liquidFlow2 {
 0% { transform: translate(0, 0) rotate(0deg) scale(1.1); }
 33% { transform: translate(-20%, -10%) rotate(-120deg) scale(0.9); }
 66% { transform: translate(15%, 20%) rotate(-240deg) scale(1.05); }
 100% { transform: translate(0, 0) rotate(-360deg) scale(1.1); }
 }
 @keyframes liquidFlow3 {
 0% { transform: translate(0, 0) rotate(0deg); }
 50% { transform: translate(25%, 25%) rotate(180deg); }
 100% { transform: translate(0, 0) rotate(360deg); }
 }
 @keyframes liquidFlow4 {
 0% { transform: translate(0, 0) rotate(0deg); }
 50% { transform: translate(-25%, -25%) rotate(-180deg); }
 100% { transform: translate(0, 0) rotate(-360deg); }
 }
 @keyframes liquidFlow5 {
 0% { transform: translate(0, 0) rotate(0deg) scale(1); }
 33% { transform: translate(10%, -25%) rotate(120deg) scale(1.2); }
 66% { transform: translate(-20%, 15%) rotate(240deg) scale(0.8); }
 100% { transform: translate(0, 0) rotate(360deg) scale(1); }
 }
 .mesh-gradient-container {
 --size: ${isEdges ? '80%' : '150%'};
 --blending-value: hard-light;
 }
 .mesh-blob {
 position: absolute;
 width: var(--size);
 height: var(--size);
 mix-blend-mode: var(--blending-value);
 opacity: ${dim ? "0.8" : "1"};
 ${(isLyricsOpen || paused) ? 'animation-play-state: paused !important;' : ''}
 }
 `}} />

 {/* SVG Noise Filter for Texture */}
 <svg className="hidden">
 <defs>
 <filter id="mesh-noise">
 <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
 <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.1 0" />
 </filter>
 </defs>
 </svg>

 <div
 className="mesh-gradient-container absolute inset-0 w-full h-full"
 style={{ filter: isEdges ? "blur(70px) saturate(120%)" : "blur(90px) saturate(150%)" }}
 >
 {/* Blob 1: Top Left / Center */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c1} 0%, transparent 50%)`,
 top: isEdges ? "-20%" : "calc(50% - var(--size) / 2)",
 left: isEdges ? "-20%" : "calc(50% - var(--size) / 2)",
 transformOrigin: isEdges ? "center" : "calc(50% + 200px) calc(50% - 200px)",
 animation: `liquidFlow1 ${25 * t}s ease-in-out infinite`,
 }}
 />
 
 {/* Blob 2: Top Right / Offset */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c2} 0%, transparent 50%)`,
 top: isEdges ? "-20%" : "calc(50% - var(--size) / 2)",
 right: isEdges ? "-20%" : "auto",
 left: isEdges ? "auto" : "calc(50% - var(--size) / 2)",
 transformOrigin: isEdges ? "center" : "calc(50% - 300px) calc(50% + 100px)",
 animation: `liquidFlow2 ${28 * t}s ease-in-out infinite`,
 }}
 />

 {/* Blob 3: Bottom Right / Extreme */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c3} 0%, transparent 50%)`,
 bottom: isEdges ? "-20%" : "auto",
 top: isEdges ? "auto" : "calc(50% - var(--size) / 2 + 100px)",
 right: isEdges ? "-20%" : "auto",
 left: isEdges ? "auto" : "calc(50% - var(--size) / 2 - 300px)",
 transformOrigin: isEdges ? "center" : "calc(50% + 400px)",
 animation: `liquidFlow3 ${32 * t}s linear infinite`,
 }}
 />

 {/* Blob 4: Bottom Left / Drifting */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c4} 0%, transparent 50%)`,
 bottom: isEdges ? "-20%" : "auto",
 top: isEdges ? "auto" : "calc(50% - var(--size) / 2)",
 left: isEdges ? "-20%" : "calc(50% - var(--size) / 2)",
 transformOrigin: isEdges ? "center" : "calc(50% - 200px)",
 animation: `liquidFlow4 ${35 * t}s ease-in-out infinite`,
 opacity: dim ? "0.6" : "0.8",
 }}
 />

 {/* Blob 5: Center Roaming / Edges Edge */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c5} 0%, transparent 50%)`,
 top: isEdges ? "40%" : "calc(50% - var(--size) / 2 - 100px)",
 left: isEdges ? "-10%" : "calc(50% - var(--size) / 2 + 100px)",
 transformOrigin: isEdges ? "center" : "calc(50% - 500px) calc(50% + 300px)",
 animation: `liquidFlow5 ${22 * t}s ease-in-out infinite`,
 opacity: dim ? "0.7" : "0.9",
 }}
 />
 </div>
 </div>
 );
}
