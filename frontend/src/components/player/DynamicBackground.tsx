import React, { useMemo } from 'react';
import { cn, getMediaUrl } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface DynamicBackgroundProps {
    coverUrl?: string;
    className?: string;
    showDepthLayer?: boolean;
}

export function DynamicBackground({ coverUrl, className, showDepthLayer = true }: DynamicBackgroundProps) {
    const API_URL = (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL) || 'https://zenify-production-08b4.up.railway.app/api';
    const proxy = (url: string) => `${API_URL}/utils/proxy-image?url=${encodeURIComponent(url)}`;

    // Standardized target URL for the subtle background image
    const targetUrl = useMemo(() => {
        if (!coverUrl) return '';
        let url = coverUrl;
        if (!url.startsWith('http') && !url.startsWith('blob') && !url.startsWith('data')) {
            url = getMediaUrl(url) || '';
        }
        if (url && !url.includes('proxy-image') && url !== '/logo.png') {
            return proxy(url);
        }
        return url;
    }, [coverUrl, API_URL]);

    if (!targetUrl) return <div className="absolute inset-0 bg-neutral-950 z-0" />;

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className={cn("absolute inset-0 z-0 overflow-hidden bg-neutral-950", className)}
        >
            <AnimatePresence mode="popLayout">
                <motion.div
                    key={targetUrl}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2, ease: "easeOut" }}
                    className="absolute inset-x-0 inset-y-0 pointer-events-none"
                >
                    {/* A static, premium, very subtle blurred background instead of the crazy fluid engine */}
                    <div 
                        className="absolute inset-0 opacity-[0.15] blur-[100px] saturate-150 scale-110"
                        style={{
                            backgroundImage: `url(${targetUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}
                    />
                </motion.div>
            </AnimatePresence>

            {/* Grain texture for premium feel */}
            <div 
                className="absolute inset-0 z-10 opacity-[0.04] pointer-events-none" 
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
            />
            
            {showDepthLayer && (
                <div
                    className="absolute inset-0 z-11 opacity-[0.95]"
                    style={{
                        background: `radial-gradient(circle at 50% 50%, transparent 5%, rgba(10,10,10,1) 120%)`,
                    }}
                />
            )}
        </motion.div>
    );
}
