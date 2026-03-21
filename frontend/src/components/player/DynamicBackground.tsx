import React, { useEffect } from 'react';
import { useAlbumColor } from '@/hooks/useAlbumColor';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface DynamicBackgroundProps {
    coverUrl?: string;
    className?: string;
    showDepthLayer?: boolean;
}

export function DynamicBackground({ coverUrl, className, showDepthLayer = true }: DynamicBackgroundProps) {
    const colors = useAlbumColor(coverUrl);
    
    // Inject enhanced CSS keyframes
    useEffect(() => {
        if (document.getElementById('dyn-bg-keyframes-ext')) return;
        const style = document.createElement('style');
        style.id = 'dyn-bg-keyframes-ext';
        style.textContent = `
            @keyframes shift1 {
                0% { transform: translate(-25%, -25%) rotate(0deg) scale(1.2); }
                33% { transform: translate(30%, 20%) rotate(90deg) scale(1.5); }
                66% { transform: translate(-10%, 40%) rotate(180deg) scale(0.9); }
                100% { transform: translate(-25%, -25%) rotate(360deg) scale(1.2); }
            }
            @keyframes shift2 {
                0% { transform: translate(25%, 25%) rotate(0deg) scale(1); }
                33% { transform: translate(-40%, -15%) rotate(-120deg) scale(1.6); }
                66% { transform: translate(20%, -35%) rotate(-240deg) scale(1.1); }
                100% { transform: translate(25%, 25%) rotate(-360deg) scale(1); }
            }
            @keyframes shift3 {
                0% { transform: translate(-15%, 35%) scale(1.4); }
                50% { transform: translate(35%, -25%) scale(0.8); }
                100% { transform: translate(-15%, 35%) scale(1.4); }
            }
            @keyframes shift4 {
                0% { transform: translate(40%, -40%) scale(1); }
                50% { transform: translate(-30%, 30%) scale(1.5); }
                100% { transform: translate(40%, -40%) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }, []);

    // Ensure we have at least 4 colors or fallback
    const c1 = colors[0] || 'rgba(25,25,25,0.8)';
    const c2 = colors[1] || 'rgba(40,40,40,0.7)';
    const c3 = colors[2] || 'rgba(15,15,15,0.9)';
    const c4 = colors[Math.min(colors.length - 1, 3)] || c1;

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className={cn("absolute inset-0 z-0 overflow-hidden bg-[#0a0a0c]", className)}
        >
            <div
                className="absolute inset-0 overflow-hidden scale-110"
                style={{ filter: 'blur(90px) saturate(1.8)', opacity: 0.7, transition: 'all 2.5s cubic-bezier(0.22, 1, 0.36, 1)' }}
            >
                {/* Mesh Blobs */}
                <div
                    className="absolute w-[100%] h-[100%] rounded-full opacity-70"
                    style={{
                        background: `radial-gradient(circle at center, ${c1} 0%, transparent 70%)`,
                        animation: 'shift1 24s linear infinite',
                        top: '-20%', left: '-20%',
                        mixBlendMode: 'color-dodge',
                        willChange: 'transform',
                    }}
                />
                <div
                    className="absolute w-[110%] h-[110%] rounded-full opacity-60"
                    style={{
                        background: `radial-gradient(circle at center, ${c2} 0%, transparent 70%)`,
                        animation: 'shift2 32s linear infinite',
                        top: '-15%', right: '-15%',
                        mixBlendMode: 'plus-lighter',
                        willChange: 'transform',
                    }}
                />
                <div
                    className="absolute w-[120%] h-[120%] rounded-full opacity-80"
                    style={{
                        background: `radial-gradient(circle at center, ${c3} 0%, transparent 70%)`,
                        animation: 'shift3 20s ease-in-out infinite',
                        bottom: '-25%', left: '-10%',
                        mixBlendMode: 'screen',
                        willChange: 'transform',
                    }}
                />
                <div
                    className="absolute w-[100%] h-[100%] rounded-full opacity-50"
                    style={{
                        background: `radial-gradient(circle at center, ${c4} 0%, transparent 70%)`,
                        animation: 'shift4 28s ease-in-out infinite alternate',
                        bottom: '-10%', right: '-20%',
                        mixBlendMode: 'soft-light',
                        willChange: 'transform',
                    }}
                />
            </div>

            {/* Premium Glass Overlays */}
            {showDepthLayer && (
                <>
                    <div
                        className="absolute inset-0 z-10 opacity-60"
                        style={{
                            background: `radial-gradient(circle at 50% 50%, transparent 0%, rgba(0,0,0,0.4) 100%)`,
                        }}
                    />
                    <div
                        className="absolute inset-0 z-20"
                        style={{
                            background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.9) 100%)',
                        }}
                    />
                </>
            )}
        </motion.div>
    );
}
