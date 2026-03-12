import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlbumColor } from '@/hooks/useAlbumColor';
import { cn } from '@/lib/utils';

interface DynamicBackgroundProps {
    coverUrl?: string;
    className?: string;
    showDepthLayer?: boolean;
}

export function DynamicBackground({ coverUrl, className, showDepthLayer = true }: DynamicBackgroundProps) {
    const colors = useAlbumColor(coverUrl);

    return (
        <div className={cn("absolute inset-0 z-0 overflow-hidden bg-[#050505]", className)}>
            <AnimatePresence mode="popLayout">
                <motion.div
                    key={colors.join(',')}
                    initial={{ opacity: 0 }}
                    animate={{ 
                        opacity: 1,
                        scale: [1, 1.1, 1],
                        x: [0, -30, 0],
                        y: [0, -20, 0],
                    }}
                    exit={{ opacity: 0 }}
                    transition={{
                        opacity: { duration: 2 },
                        scale: { duration: 20, repeat: Infinity, ease: "easeInOut" },
                        x: { duration: 22, repeat: Infinity, ease: "easeInOut" },
                        y: { duration: 18, repeat: Infinity, ease: "easeInOut" },
                    }}
                    className="absolute inset-[-20%]"
                    style={{
                        background: `
                            radial-gradient(circle at 20% 30%, ${colors[0]}, transparent 50%),
                            radial-gradient(circle at 80% 20%, ${colors[1]}, transparent 50%),
                            radial-gradient(circle at 50% 80%, ${colors[2]}, transparent 50%),
                            linear-gradient(120deg, #0b0b0d, #1a0b12, #090909)
                        `,
                        filter: 'blur(100px)',
                    }}
                />
            </AnimatePresence>
            
            {showDepthLayer && (
                <div 
                    className="absolute inset-0 z-10"
                    style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7))',
                        backdropFilter: 'blur(40px)',
                        WebkitBackdropFilter: 'blur(40px)',
                    }}
                />
            )}
        </div>
    );
}
