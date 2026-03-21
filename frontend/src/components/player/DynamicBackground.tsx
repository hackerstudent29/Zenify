import React, { useEffect, useRef } from 'react';
import { useAlbumColor } from '@/hooks/useAlbumColor';
import { cn } from '@/lib/utils';

interface DynamicBackgroundProps {
    coverUrl?: string;
    className?: string;
    showDepthLayer?: boolean;
}

export function DynamicBackground({ coverUrl, className, showDepthLayer = true }: DynamicBackgroundProps) {
    const colors = useAlbumColor(coverUrl);
    
    const blob1Ref = useRef<HTMLDivElement>(null);
    const blob2Ref = useRef<HTMLDivElement>(null);
    const blob3Ref = useRef<HTMLDivElement>(null);

    // Inject CSS keyframes dynamically once
    useEffect(() => {
        if (document.getElementById('dyn-bg-keyframes')) return;
        const style = document.createElement('style');
        style.id = 'dyn-bg-keyframes';
        style.textContent = `
            @keyframes dynBlob1 {
                0%   { transform: translate(-20%, -20%) scale(1); }
                33%  { transform: translate(40%, 30%) scale(1.5); }
                66%  { transform: translate(10%, -30%) scale(0.9); }
                100% { transform: translate(-20%, -20%) scale(1); }
            }
            @keyframes dynBlob2 {
                0%   { transform: translate(30%, 30%) scale(1.2); }
                33%  { transform: translate(-30%, -10%) scale(1); }
                66%  { transform: translate(40%, -20%) scale(1.4); }
                100% { transform: translate(30%, 30%) scale(1.2); }
            }
            @keyframes dynBlob3 {
                0%   { transform: translate(10%, -30%) scale(1); }
                33%  { transform: translate(-35%, 20%) scale(1.8); }
                66%  { transform: translate(25%, 30%) scale(1.1); }
                100% { transform: translate(10%, -30%) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }, []);

    return (
        <div className={cn("absolute inset-0 z-0 overflow-hidden bg-[#050505]", className)}>
            {/* Animated gradient blobs using CSS animations for smooth mobile perf */}
            <div
                className="absolute inset-0 overflow-hidden"
                style={{ filter: 'blur(70px)', opacity: 0.6, transition: 'opacity 1.5s ease' }}
            >
                {/* Blob 1 */}
                <div
                    ref={blob1Ref}
                    className="absolute w-[80%] h-[80%] rounded-full"
                    style={{
                        background: `radial-gradient(circle, ${colors[0]} 0%, transparent 65%)`,
                        animation: 'dynBlob1 18s ease-in-out infinite',
                        top: 0,
                        left: 0,
                        mixBlendMode: 'screen',
                        willChange: 'transform',
                    }}
                />
                {/* Blob 2 */}
                <div
                    ref={blob2Ref}
                    className="absolute w-[90%] h-[90%] rounded-full"
                    style={{
                        background: `radial-gradient(circle, ${colors[1]} 0%, transparent 65%)`,
                        animation: 'dynBlob2 22s ease-in-out infinite',
                        top: '-10%',
                        right: '-10%',
                        mixBlendMode: 'screen',
                        willChange: 'transform',
                    }}
                />
                {/* Blob 3 */}
                <div
                    ref={blob3Ref}
                    className="absolute w-[100%] h-[100%] rounded-full"
                    style={{
                        background: `radial-gradient(circle, ${colors[2]} 0%, transparent 65%)`,
                        animation: 'dynBlob3 28s ease-in-out infinite',
                        bottom: '-20%',
                        right: '-20%',
                        mixBlendMode: 'screen',
                        willChange: 'transform',
                    }}
                />
            </div>

            {/* Dark overlay so content is readable */}
            {showDepthLayer && (
                <div
                    className="absolute inset-0 z-10"
                    style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.92) 100%)',
                    }}
                />
            )}
        </div>
    );
}
