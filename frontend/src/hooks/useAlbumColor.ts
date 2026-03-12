import { useState, useEffect } from 'react';
import { getMediaUrl } from '@/lib/utils';

export function useAlbumColor(coverUrl: string | undefined) {
    const [colors, setColors] = useState<string[]>(['rgba(220,60,80,0.55)', 'rgba(140,40,60,0.45)', 'rgba(60,10,30,0.6)']);

    useEffect(() => {
        if (!coverUrl || typeof window === 'undefined') return;

        // Using require inside useEffect to avoid build-time export issues with Turbopack/Next.js
        const CT = require('colorthief');
        const ColorThiefConstructor = CT.default || CT;
        const colorThief = new ColorThiefConstructor();

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = getMediaUrl(coverUrl) || '';

        img.onload = () => {
            try {
                const palette = colorThief.getPalette(img, 3);
                const rgbColors = palette.map((color: number[]) => `rgb(${color.join(',')})`);
                setColors(rgbColors);
            } catch (e) {
                console.error('Error extracting palette', e);
            }
        };
    }, [coverUrl]);

    return colors;
}
