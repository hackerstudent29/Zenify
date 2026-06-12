"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui";

interface AuroraBackgroundProps {
 colors?: string[];
 className?: string;
 speed?: "ultra-fast" | "fast" | "slow";
 dim?: boolean;
}

/**
 * Authentic Apple Music / Aceternity Mesh Gradient Fluid Background.
 * Uses hard-light blending, extreme blurs, and transform-origin rotation 
 * to create a true WebGL-like fluid liquid simulation purely in CSS.
 */
export function AuroraBackground({ colors = [], className, speed = "slow", dim = true }: AuroraBackgroundProps) {
 const isLyricsOpen = useUIStore(state => state.isLyricsOpen);
 const c1 = colors[0] || "rgba(120, 50, 180, 0.85)";
 const c2 = colors[1] || "rgba(40, 130, 220, 0.85)";
 const c3 = colors[2] || "rgba(200, 80, 120, 0.85)";
 const c4 = colors[3] || c1;
 const c5 = colors[4] || c2;

 const t = speed === "slow" ? 1 : speed === "fast" ? 0.6 : 0.3;

 const colorKey = useMemo(() => colors.join(","), [colors]);

 return (
 <div
 key={colorKey}
 className={cn(
 "absolute inset-0 overflow-hidden pointer-events-none z-0 bg-black flex place-content-center transition-opacity duration-1000",
 className
 )}
 >
 <style dangerouslySetInnerHTML={{ __html: `
 @keyframes meshMoveInCircle {
 0% { transform: rotate(0deg); }
 50% { transform: rotate(180deg); }
 100% { transform: rotate(360deg); }
 }
 @keyframes meshMoveVertical {
 0% { transform: translateY(-50%); }
 50% { transform: translateY(50%); }
 100% { transform: translateY(-50%); }
 }
 @keyframes meshMoveHorizontal {
 0% { transform: translateX(-50%) translateY(-10%); }
 50% { transform: translateX(50%) translateY(10%); }
 100% { transform: translateX(-50%) translateY(-10%); }
 }
 .mesh-gradient-container {
 --size: 150%;
 --blending-value: hard-light;
 }
 .mesh-blob {
 position: absolute;
 width: var(--size);
 height: var(--size);
 mix-blend-mode: var(--blending-value);
 opacity: ${dim ? "0.8" : "1"};
 ${isLyricsOpen ? 'animation-play-state: paused !important;' : ''}
 }
 `}} />

 {/* SVG Noise Filter for Texture */}
 <svg className="hidden">
 <defs>
 <filter id="mesh-noise">
 <feTurbulence
 type="fractalNoise"
 baseFrequency="0.6"
 numOctaves="3"
 stitchTiles="stitch"
 />
 <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.1 0" />
 </filter>
 </defs>
 </svg>

 <div
 className="mesh-gradient-container absolute inset-0 w-full h-full"
 style={{ filter: "blur(90px) saturate(150%)" }}
 >
 {/* Blob 1 */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c1} 0%, transparent 50%)`,
 top: "calc(50% - var(--size) / 2)",
 left: "calc(50% - var(--size) / 2)",
 transformOrigin: "center center",
 animation: `meshMoveVertical ${30 * t}s ease infinite`,
 }}
 />
 
 {/* Blob 2 */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c2} 0%, transparent 50%)`,
 top: "calc(50% - var(--size) / 2)",
 left: "calc(50% - var(--size) / 2)",
 transformOrigin: "calc(50% - 400px)",
 animation: `meshMoveInCircle ${20 * t}s reverse infinite`,
 }}
 />

 {/* Blob 3 */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c3} 0%, transparent 50%)`,
 top: "calc(50% - var(--size) / 2 + 200px)",
 left: "calc(50% - var(--size) / 2 - 500px)",
 transformOrigin: "calc(50% + 400px)",
 animation: `meshMoveInCircle ${40 * t}s linear infinite`,
 }}
 />

 {/* Blob 4 */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c4} 0%, transparent 50%)`,
 top: "calc(50% - var(--size) / 2)",
 left: "calc(50% - var(--size) / 2)",
 transformOrigin: "calc(50% - 200px)",
 animation: `meshMoveHorizontal ${40 * t}s ease infinite`,
 opacity: dim ? "0.6" : "0.8",
 }}
 />

 {/* Blob 5 */}
 <div
 className="mesh-blob"
 style={{
 background: `radial-gradient(circle at center, ${c5} 0%, transparent 50%)`,
 top: "calc(50% - var(--size) / 2 - 200px)",
 left: "calc(50% - var(--size) / 2 + 200px)",
 transformOrigin: "calc(50% - 800px) calc(50% + 200px)",
 animation: `meshMoveInCircle ${20 * t}s ease infinite`,
 opacity: dim ? "0.7" : "0.9",
 }}
 />
 </div>
 </div>
 );
}
