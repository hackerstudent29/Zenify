import { useState, useEffect } from 'react';
import { getMediaUrl } from '@/lib/utils';

export function useAlbumColor(coverUrl: string | undefined) {
    const [colors, setColors] = useState<string[]>(['rgba(220,60,80,0.55)', 'rgba(140,40,60,0.45)', 'rgba(60,10,30,0.6)']);

    useEffect(() => {
        if (!coverUrl || typeof window === 'undefined') return;

        const extractColors = async () => {
            try {
                const ColorThiefModule = await import('colorthief').then((m: any) => m.default || m);
                let colorThief;
                
                try {
                    colorThief = new ColorThiefModule();
                } catch (e) {
                    colorThief = ColorThiefModule;
                }

                if (!colorThief || !colorThief.getPalette) return;

                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.src = getMediaUrl(coverUrl) || '';

                img.onload = () => {
                    try {
                        const palette = colorThief.getPalette(img, 3);
                        if (palette && palette.length >= 3) {
                            const rgbColors = palette.map((color: number[]) => `rgb(${color.join(',')})`);
                            setColors(rgbColors);
                        }
                    } catch (e) {
                        // Ignore
                    }
                };
            } catch (err) {
                // Ignore
            }
        };

        extractColors();
    }, [coverUrl]);

    return colors;
}
