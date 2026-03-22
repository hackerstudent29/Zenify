import React, { useEffect, useMemo } from 'react';
import { cn, getMediaUrl } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface DynamicBackgroundProps {
    coverUrl?: string;
    className?: string;
    showDepthLayer?: boolean;
}

export function DynamicBackground({ coverUrl, className, showDepthLayer = true }: DynamicBackgroundProps) {
    // Standardized target URL
    const targetUrl = useMemo(() => {
        if (!coverUrl) return '';
        if (coverUrl.startsWith('http') || coverUrl.startsWith('blob') || coverUrl.startsWith('data')) return coverUrl;
        return getMediaUrl(coverUrl) || '';
    }, [coverUrl]);

    // Inject organic fluid CSS keyframes
    useEffect(() => {
        if (document.getElementById('fluid-bg-keyframes')) return;
        const style = document.createElement('style');
        style.id = 'fluid-bg-keyframes';
        style.textContent = `
            @keyframes fluid-blob-1 {
                0% { transform: translate(-20%, -20%) rotate(0deg) scale(1.4); }
                33% { transform: translate(30%, 15%) rotate(140deg) scale(1.1); }
                66% { transform: translate(-15%, 45%) rotate(260deg) scale(1.7); }
                100% { transform: translate(-20%, -20%) rotate(360deg) scale(1.4); }
            }
            @keyframes fluid-blob-2 {
                0% { transform: translate(25%, 35%) rotate(0deg) scale(1.2); }
                33% { transform: translate(-45%, -25%) rotate(-160deg) scale(1.8); }
                66% { transform: translate(40%, -10%) rotate(-310deg) scale(0.9); }
                100% { transform: translate(25%, 35%) rotate(-360deg) scale(1.2); }
            }
            @keyframes fluid-blob-3 {
                0% { transform: translate(-40%, 20%) rotate(45deg) scale(1); }
                40% { transform: translate(20%, -40%) rotate(180deg) scale(1.6); }
                80% { transform: translate(40%, 30%) rotate(300deg) scale(1.2); }
                100% { transform: translate(-40%, 20%) rotate(405deg) scale(1); }
            }
            @keyframes fluid-blob-4 {
                0% { transform: translate(30%, -30%) rotate(-90deg) scale(1.5); }
                50% { transform: translate(-30%, 40%) rotate(90deg) scale(1); }
                100% { transform: translate(30%, -30%) rotate(270deg) scale(1.5); }
            }
            .glass-noise {
                background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
                opacity: 0.04;
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }, []);

    if (!targetUrl) return <div className="absolute inset-0 bg-neutral-900 z-0" />;

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeInOut" }}
            className={cn("absolute inset-0 z-0 overflow-hidden bg-black", className)}
        >
            {/* The Fluid Engine: Multiple blurred layers of the actual art */}
            <div className="absolute inset-0 overflow-hidden scale-110">
                <AnimatePresence mode="popLayout">
                    <motion.div
                        key={targetUrl}
                        initial={{ opacity: 0, scale: 1.1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 3, ease: "easeInOut" }}
                        className="absolute inset-0 pointer-events-none"
                    >
                        {/* Blob 1 (Top Left) */}
                        <div
                            className="absolute -top-[30%] -left-[30%] w-full h-full opacity-60 blur-[130px]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: 'cover',
                                animation: 'fluid-blob-1 14s linear infinite',
                                mixBlendMode: 'screen',
                            }}
                        />
                        {/* Blob 2 (Bottom Right) */}
                        <div
                            className="absolute -bottom-[20%] -right-[30%] w-full h-full opacity-50 blur-[150px]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: 'cover',
                                animation: 'fluid-blob-2 18s linear infinite',
                                mixBlendMode: 'screen',
                            }}
                        />
                        {/* Blob 3 (Top Right) */}
                        <div
                            className="absolute -top-[20%] -right-[40%] w-full h-full opacity-40 blur-[140px]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: 'cover',
                                animation: 'fluid-blob-3 22s linear infinite',
                                mixBlendMode: 'plus-lighter',
                            }}
                        />
                        {/* Blob 4 (Bottom Left) */}
                        <div
                            className="absolute -bottom-[30%] -left-[20%] w-full h-full opacity-40 blur-[120px]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: 'cover',
                                animation: 'fluid-blob-4 16s linear infinite',
                                mixBlendMode: 'overlay',
                            }}
                        />
                        
                        {/* Central Base Layer (Slow Zoom) */}
                        <motion.div 
                            animate={{ scale: [1, 1.1, 1], rotate: [0, 3, 0] }}
                            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 opacity-20 blur-[100px]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                            }}
                        />
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Grain & Depth Effects */}
            <div className="absolute inset-0 z-10 glass-noise" />
            
            {showDepthLayer && (
                <>
                    <div
                        className="absolute inset-0 z-11 opacity-70"
                        style={{
                            background: `radial-gradient(circle at 50% 50%, transparent 20%, rgba(0,0,0,0.8) 120%)`,
                        }}
                    />
                    <div
                        className="absolute inset-0 z-12"
                        style={{
                            background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.95) 100%)',
                        }}
                    />
                </>
            )}
        </motion.div>
    );
}
