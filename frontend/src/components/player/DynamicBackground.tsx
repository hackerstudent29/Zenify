import React, { useEffect, useMemo } from 'react';
import { cn, getMediaUrl } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface DynamicBackgroundProps {
    coverUrl?: string;
    className?: string;
    showDepthLayer?: boolean;
}

export function DynamicBackground({ coverUrl, className, showDepthLayer = true }: DynamicBackgroundProps) {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://listenzenifybackend.up.railway.app/api';
    const proxy = (url: string) => `${API_URL}/utils/proxy-image?url=${encodeURIComponent(url)}`;

    // Standardized target URL
    const targetUrl = useMemo(() => {
        if (!coverUrl) return '';
        let url = coverUrl;
        if (!url.startsWith('http') && !url.startsWith('blob') && !url.startsWith('data')) {
            url = getMediaUrl(url) || '';
        }
        // Force proxy to handle CORS for background-image
        if (url && !url.includes('proxy-image') && url !== '/logo.png') {
            return proxy(url);
        }
        return url;
    }, [coverUrl, API_URL]);

    // Inject organic fluid CSS keyframes
    useEffect(() => {
        let style = document.getElementById('fluid-bg-keyframes') as HTMLStyleElement;
        if (!style) {
            style = document.createElement('style');
            style.id = 'fluid-bg-keyframes';
            document.head.appendChild(style);
        }
        
        style.textContent = `
            @keyframes fluid-blob-1 {
                0%, 100% { transform: translate(-3%, -3%) rotate(0deg) scale(1.3); }
                35% { transform: translate(5%, 4%) rotate(120deg) scale(1.1); }
                70% { transform: translate(-4%, 6%) rotate(240deg) scale(1.4); }
                75% { transform: translate(-38%, -38%) rotate(280deg) scale(1.8); } /* Rare Corner Shift (TL) */
                85% { transform: translate(-2%, -2%) rotate(320deg) scale(1.3); }
            }
            @keyframes fluid-blob-2 {
                0%, 100% { transform: translate(4%, 4%) rotate(0deg) scale(1.4); }
                35% { transform: translate(-6%, -5%) rotate(-120deg) scale(1.2); }
                70% { transform: translate(5%, -4%) rotate(-240deg) scale(1.5); }
                75% { transform: translate(38%, 38%) rotate(-280deg) scale(1.9); } /* Rare Corner Shift (BR) */
                85% { transform: translate(3%, 3%) rotate(-320deg) scale(1.4); }
            }
            @keyframes fluid-blob-3 {
                0%, 100% { transform: translate(-5%, 6%) rotate(90deg) scale(1.2); }
                35% { transform: translate(7%, -8%) rotate(210deg) scale(1.4); }
                70% { transform: translate(-6%, -5%) rotate(320deg) scale(1.3); }
                75% { transform: translate(38%, -38%) rotate(350deg) scale(1.8); } /* Rare Corner Shift (TR) */
                85% { transform: translate(-3%, 4%) rotate(410deg) scale(1.2); }
            }
            @keyframes fluid-blob-4 {
                0%, 100% { transform: translate(6%, -5%) rotate(180deg) scale(1.5); }
                35% { transform: translate(-8%, 7%) rotate(60deg) scale(1.3); }
                70% { transform: translate(7%, 4%) rotate(-60deg) scale(1.6); }
                75% { transform: translate(-38%, 38%) rotate(-100deg) scale(2.0); } /* Rare Corner Shift (BL) */
                85% { transform: translate(4%, -3%) rotate(-140deg) scale(1.5); }
            }
            .glass-noise {
                background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
                opacity: 0.05;
                pointer-events: none;
            }
        `;
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
                        className="absolute inset-x-0 inset-y-0 pointer-events-none"
                    >
                        {/* Atmospheric Layer 1: Top Left colors */}
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] opacity-[0.9] blur-[110px] origin-center saturate-[2.2] contrast-[1.1]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: '250%',
                                backgroundPosition: '0% 0%',
                                animation: 'fluid-blob-1 18s ease-in-out infinite alternate',
                                mixBlendMode: 'normal',
                            }}
                        />
                        {/* Atmospheric Layer 2: Top Right colors */}
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] opacity-[0.8] blur-[130px] origin-center saturate-[2.5] contrast-[1.2]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: '250%',
                                backgroundPosition: '100% 0%',
                                animation: 'fluid-blob-2 22s ease-in-out infinite alternate',
                                mixBlendMode: 'soft-light',
                            }}
                        />
                        {/* Atmospheric Layer 3: Bottom Left colors */}
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[130%] h-[130%] opacity-[0.7] blur-[120px] origin-center saturate-[2.5] contrast-[1.2]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: '250%',
                                backgroundPosition: '0% 100%',
                                animation: 'fluid-blob-3 26s ease-in-out infinite alternate',
                                mixBlendMode: 'color-dodge',
                            }}
                        />
                        {/* Atmospheric Layer 4: Bottom Right colors */}
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[160%] h-[160%] opacity-[0.6] blur-[100px] origin-center saturate-[2] contrast-[1.1]"
                            style={{
                                backgroundImage: `url(${targetUrl})`,
                                backgroundSize: '250%',
                                backgroundPosition: '100% 100%',
                                animation: 'fluid-blob-4 20s ease-in-out infinite alternate',
                                mixBlendMode: 'hard-light',
                            }}
                        />
                        
                        {/* Base Enrichment (Center zoom) */}
                        <motion.div 
                            animate={{ scale: [1, 1.15, 1], rotate: [0, 5, 0] }}
                            transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 opacity-[0.2] blur-[150px] saturate-200"
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
                <div
                    className="absolute inset-0 z-11 opacity-[0.85]"
                    style={{
                        background: `radial-gradient(circle at 50% 50%, transparent 15%, rgba(0,0,0,0.95) 120%)`,
                    }}
                />
            )}
        </motion.div>
    );
}
