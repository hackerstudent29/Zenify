"use client";

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, useTransform, useMotionValue, useAnimationFrame, useSpring } from 'framer-motion';
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn, getMediaUrl } from '@/lib/utils';
import { extractPaletteFromImage } from '@/lib/extract-palette';

interface ReactiveAudioBackgroundProps {
    coverUrl?: string;
    className?: string;
}

/**
 * AudioFluidBackground (Zenify Edition)
 * Optimized for buttery-smooth fluid blur and physical beat reaction.
 */
export function ReactiveAudioBackground({ coverUrl, className }: ReactiveAudioBackgroundProps) {
    const { lowEnd, midRange, highEnd } = useAudioAnalyzer();

    // 1. Color Palette Extraction Logic (HSL Variety Engine)
    const [palette, setPalette] = useState<string[]>(['#1a1a1a', '#2d3436', '#000000', '#444444']);
    const targetUrl = useMemo(() => {
        if (!coverUrl) return '';
        let url = coverUrl;
        if (!url.startsWith('http') && !url.startsWith('blob') && !url.startsWith('data')) {
            url = getMediaUrl(url) || '';
        }
        return url;
    }, [coverUrl]);

    useEffect(() => {
        if (targetUrl) {
            extractPaletteFromImage(targetUrl).then(setPalette);
        }
    }, [targetUrl]);

    // 2. Fluid Velocity Logic (Mids -> Movement Speed)
    const driftX = useMotionValue(0);
    const driftY = useMotionValue(0);
    const rotation = useMotionValue(0);
    const lastTimeRef = useRef(0);
    const isMobile = useIsMobile();

    useAnimationFrame((time) => {
        if (lastTimeRef.current === 0) {
            lastTimeRef.current = time;
            return;
        }
        const delta = time - lastTimeRef.current;
        lastTimeRef.current = time;

        const energy = midRange.get();
        // 🟢 Gentle, consistent drift logic (No Snapping)
        const baseSpeed = isMobile ? 0.001 : 0.0006;
        const reactiveIntensity = isMobile ? 0.005 : 0.003;
        
        const speed = (baseSpeed + (energy * reactiveIntensity)) * time;

        // Smooth Sinusoidal movement to cover all corners gracefully
        driftX.set(Math.sin(speed * 0.45) * 55); 
        driftY.set(Math.cos(speed * 0.35) * 45);
        rotation.set(speed * 15); // Slow, constant rotation
    });

    // 3. Physical "Bass Bump" Spring (Bass -> Scaling)
    // Snappier spring (stiffness 950) for that punchy feel.
    const bassSpring = useSpring(lowEnd, { stiffness: 950, damping: 18, mass: 0.4 });
    const bassScale = useTransform(bassSpring, [0, 1], [1, 1.55]); // Aggressive scaling

    // 4. Combined Filter Mapping (MotionValues)
    // IMPORTANT: Include blur directly in the manual filter string.
    const fBrightness = useTransform(highEnd, [0, 1], [0.8, 1.4]);
    const fContrast = useTransform(highEnd, [0, 1], [1, 1.3]);
    const fSaturate = useTransform(midRange, [0, 1], [1.4, 2.8]);

    // Blob Orbitals (Parallax mesh)
    // Smooth Transparents to cover all corners
    const b1x = useTransform(driftX, (v) => `${v}%`);
    const b1y = useTransform(driftY, (v) => `${v}%`);
    
    const b2x = useTransform(driftX, (v) => `${-v * 0.8}%`);
    const b2y = useTransform(driftY, (v) => `${-v * 1.2}%`);
    
    const b3x = useTransform(driftX, (v) => `${v * 0.5}%`);
    const b3y = useTransform(driftY, (v) => `${-v * 0.5}%`);
    
    const b4x = useTransform(driftX, (v) => `${-v * 0.4}%`);
    const b4y = useTransform(driftY, (v) => `${v * 0.4}%`);

    const driftRotate = useTransform(rotation, (v) => `${v}deg`);
    const [isReady, setIsReady] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 120);
        return () => clearTimeout(timer);
    }, []);

    // 🟢 TOP-LEVEL HOOK CONSOLIDATION (Fixes React Error #310)
    const animatedFilter = useTransform(
        [fBrightness, fContrast, fSaturate], 
        ([b, c, s]) => `blur(120px) brightness(${b}) contrast(${c}) saturate(${s})`
    );
    const midScale = useTransform(midRange, [0, 1], [0.8, 1.4]);
    const highScale = useTransform(highEnd, [0, 1], [0.8, 1.5]);

    return (
        <div className={cn("absolute inset-0 z-0 overflow-hidden bg-neutral-950 select-none pointer-events-none", className)}>
            {/* UNDERLYING AMBIENT FIELD */}
            <motion.div 
                className="absolute inset-0 opacity-[0.4] blur-[150px] scale-150 transition-all duration-3000"
                style={{
                    backgroundImage: `url(${targetUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            />

            {/* MAIN VISUAL MESH ENGINE */}
            <motion.div 
                className="absolute inset-0"
                style={{
                    scale: 1.15,
                    filter: isReady ? animatedFilter : "blur(120px) brightness(1) contrast(1) saturate(1.5)",
                    rotate: driftRotate
                }}
            >
                {/* BLOB 1: Bass Hit (Dominant) */}
                <motion.div
                    animate={{ backgroundColor: palette[0] }}
                    transition={{ duration: 3.0 }}
                    style={{
                        x: b1x,
                        y: b1y,
                        scale: bassScale,
                        opacity: 0.9,
                        width: '110%',
                        height: '110%',
                    }}
                    className="absolute top-[-15%] left-[-15%] rounded-full origin-center"
                />

                {/* BLOB 2: Vibrant Mid Pulse */}
                <motion.div
                    animate={{ backgroundColor: palette[1] }}
                    transition={{ duration: 3.0 }}
                    style={{
                        x: b2x,
                        y: b2y,
                        scale: midScale,
                        opacity: 0.75,
                        width: '110%',
                        height: '110%',
                    }}
                    className="absolute top-[-15%] right-[-15%] rounded-full origin-center mix-blend-color-dodge"
                />

                {/* BLOB 3: Deep Environment Atmosphere */}
                <motion.div
                    animate={{ backgroundColor: palette[2] }}
                    transition={{ duration: 3.0 }}
                    style={{
                        x: b3x,
                        y: b3y,
                        rotate: driftRotate,
                        opacity: 0.7,
                        width: '110%',
                        height: '110%',
                    }}
                    className="absolute bottom-[-15%] left-[-15%] rounded-full origin-center"
                />

                {/* BLOB 4: Accent High-Pass Highlight */}
                <motion.div
                    animate={{ backgroundColor: palette[3] }}
                    transition={{ duration: 3.0 }}
                    style={{
                        x: b4x,
                        y: b4y,
                        scale: highScale,
                        opacity: 0.5,
                        width: '110%',
                        height: '110%',
                    }}
                    className="absolute bottom-[-15%] right-[-15%] rounded-full origin-center mix-blend-plus-lighter"
                />
            </motion.div>

            {/* PREMIUM OVERLAYS */}
            <div className="absolute inset-0 z-10 opacity-[0.06] pointer-events-none"
                 style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
            />

            {/* CINEMATIC FOCUS VIGNETTE */}
            <div
                className="absolute inset-0 z-20 pointer-events-none"
                style={{
                    background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.95) 150%)`,
                }}
            />
        </div>
    );
}
