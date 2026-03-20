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
                    animate={{ opacity: 0.6 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.5 }}
                    className="absolute inset-[-10%]"
                    style={{
                        background: `
                            radial-gradient(circle at 20% 30%, ${colors[0]}, transparent 60%),
                            radial-gradient(circle at 80% 20%, ${colors[1]}, transparent 60%),
                            radial-gradient(circle at 50% 80%, ${colors[2]}, transparent 60%)
                        `,
                        filter: 'blur(40px)',
                        willChange: 'opacity'
                    }}
                />
            </AnimatePresence>
            
            {showDepthLayer && (
                <div 
                    className="absolute inset-0 z-10"
                    style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.9))',
                    }}
                />
            )}
        </div>
    );
}
